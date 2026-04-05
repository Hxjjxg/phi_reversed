/**
 * Unity Addressables Bundle Redirector — Frida Hook Script
 * ========================================================
 * 通用 IL2CPP (Unity) 游戏 AssetBundle 重定向框架。
 *
 * 功能：
 *   - 根据 bundle_redirects.json 配置，将特定 bundle 的加载路径
 *     重定向到本地文件或远程 URL。
 *   - 仅替换配置中明确指定且 enabled=true 的 bundle，其余保持原样。
 *   - 本地替换走 AssetBundle.LoadFromFileAsync (loadType=1)
 *   - 远程替换走 UnityWebRequest (loadType=2)，引擎自动识别 URL 中的 "://"
 *
 * 使用方法：
 *   frida -p <PID> -l bundle_hook.js
 *   frida -f 4k.exe -l bundle_hook.js --no-pause
 *
 * 适配新游戏时只需修改下方 CONFIG 区域的 RVA 偏移量。
 */

"use strict";

// ============================================================================
// CONFIG — 适配不同游戏时修改这里的 RVA
// ============================================================================
const CONFIG = {
    // 目标模块名
    moduleName: "libil2cpp.so",

    // --- Hook 点 RVA（相对于 libil2cpp.so 基址）---

    // ResourceManager.TransformInternalId(ResourceManager*, IResourceLocation*)
    // 所有资源（bundle / asset）加载路径的统一转换入口
    // 返回值: Il2Cpp String_t*
    RVA_TransformInternalId: 0x24EF718,

    // AssetBundle.LoadFromFileAsync(String_t* path, uint crc)
    // 本地 bundle 加载最终入口，用于强制 CRC=0
    RVA_LoadFromFileAsync: 0x8705114,

    // AssetBundleResource.CreateWebRequest(this, String_t* internalId)
    // 远程 bundle 下载请求创建，用于拦截 / 日志
    RVA_CreateWebRequest: 0x24F4268,

    // 重定向规则配置文件路径（JSON）
    redirectsJsonPath: "/data/local/tmp/bundle_redirects.json",
};

// ============================================================================
// IL2CPP STRING HELPERS
// ============================================================================

/**
 * 读取 Il2Cpp String_t* 的内容。
 * String_t 内存布局: [Il2CppObject 16B][int length @ +0x10][wchar_t[] chars @ +0x14]
 */
function readIl2CppString(ptr) {
    if (ptr.isNull()) return null;
    try {
        const len = ptr.add(0x10).readS32();
        if (len <= 0 || len > 4096) return null;
        return ptr.add(0x14).readUtf16String(len);
    } catch (e) {
        return null;
    }
}

/**
 * 创建一个新的 Il2Cpp String_t*。
 * 使用 il2cpp_string_new_utf16 API。
 */
let _il2cpp_string_new_utf16 = null;

/** 延迟初始化，需在 libil2cpp.so 加载后调用 */
function initStringApi(mod) {
    if (_il2cpp_string_new_utf16) return;
    const addr = mod.findExportByName("il2cpp_string_new_utf16");
    if (!addr) throw new Error("il2cpp_string_new_utf16 not found in " + mod.name);
    _il2cpp_string_new_utf16 = new NativeFunction(addr, "pointer", ["pointer", "int"]);
}

function createIl2CppString(str) {
    const buf = Memory.allocUtf16String(str);
    return _il2cpp_string_new_utf16(buf, str.length);
}

// ============================================================================
// REDIRECT CONFIG LOADER
// ============================================================================

/**
 * @typedef {Object} RedirectEntry
 * @property {"local"|"remote"} type
 * @property {string} target
 * @property {boolean} enabled
 */

/** @type {Map<string, RedirectEntry>} keyword → redirect info */
let redirectMap = new Map();

/** 已被重定向的路径集合（用于 CRC bypass 判断） */
let redirectedPaths = new Set();

function loadConfig() {
    redirectMap.clear();

    const jsonPath = CONFIG.redirectsJsonPath;
    let raw;
    try {
        raw = File.readAllText(jsonPath);
    } catch (e) {
        console.log(`[BundleRedirector] ⚠ 无法读取配置文件 ${jsonPath}: ${e.message}`);
        console.log(`[BundleRedirector] 请确保文件存在且格式正确，示例:`);
        console.log(`  {"xxx.bundle":{"type":"local","target":"/data/local/tmp/xxx.bundle","enabled":true}}`);
        return;
    }

    let config;
    try {
        config = JSON.parse(raw);
    } catch (e) {
        console.log(`[BundleRedirector] ⚠ JSON 解析失败: ${e.message}`);
        return;
    }

    // 支持两种格式：
    //   { "redirects": { "xxx.bundle": {...}, ... } }
    //   { "xxx.bundle": {...}, ... }
    const entries = config.redirects || config;

    for (const [keyword, entry] of Object.entries(entries)) {
        if (entry.enabled !== false) {
            redirectMap.set(keyword, {
                target: entry.target,
                enabled: true,
            });
        }
    }
    console.log(`[BundleRedirector] 已从 ${jsonPath} 加载 ${redirectMap.size} 条重定向规则:`);
    for (const [k, v] of redirectMap) {
        console.log(`  ${k} → ${v.target}`);
    }
}

/**
 * 检查路径是否匹配任意重定向规则。
 * 返回匹配的 RedirectEntry 或 null。
 */
function findRedirect(originalPath) {
    if (!originalPath) return null;
    for (const [keyword, entry] of redirectMap) {
        if (originalPath.indexOf(keyword) !== -1) {
            return entry;
        }
    }
    return null;
}

// ============================================================================
// HOOK 1: TransformInternalId — 路径重定向（核心）
// ============================================================================
//
// 调用链: Addressables.LoadAssetAsync → ... → ResourceManager.TransformInternalId
// 此函数为所有资源路径的统一出口。
//
// 原型:
//   String_t* TransformInternalId(ResourceManager* this, IResourceLocation* loc)
//
// 策略:
//   onLeave 中检查返回的路径字符串，如果匹配配置中的 keyword，
//   则替换为配置中的 target 路径（本地路径或远程 URL）。
//   引擎会根据路径是否包含 "://" 自动选择本地加载或 WebRequest 加载。

function hookTransformInternalId(mod) {
    const addr = mod.base.add(CONFIG.RVA_TransformInternalId);
    console.log(`[BundleRedirector] Hooking TransformInternalId @ ${addr}`);

    Interceptor.attach(addr, {
        onLeave(retval) {
            const original = readIl2CppString(retval);
            if (!original) return;

            const redirect = findRedirect(original);
            if (!redirect) return;

            const newPath = redirect.target;

            console.log(`[BundleRedirector] 重定向 [${redirect.type}]:`);
            console.log(`  原始: ${original}`);
            console.log(`  目标: ${newPath}`);

            const newStr = createIl2CppString(newPath);
            retval.replace(newStr);

            // 记录已重定向的 target 路径，供后续 CRC bypass 使用
            redirectedPaths.add(newPath);
        },
    });
}

// ============================================================================
// HOOK 2: LoadFromFileAsync — CRC 强制置零（本地加载安全网）
// ============================================================================
//
// 原型:
//   AssetBundleCreateRequest* LoadFromFileAsync(String_t* path, uint crc)
//
// 当 TransformInternalId 返回本地路径后，引擎走 LoadLocalBundle →
// LoadFromFileAsync。此处对已重定向的路径强制 crc=0。

function hookLoadFromFileAsync(mod) {
    const addr = mod.base.add(CONFIG.RVA_LoadFromFileAsync);
    console.log(`[BundleRedirector] Hooking LoadFromFileAsync @ ${addr}`);

    Interceptor.attach(addr, {
        onEnter(args) {
            const path = readIl2CppString(args[0]);
            if (!path) return;

            // 仅对已重定向的路径强制 CRC=0
            if (redirectedPaths.has(path)) {
                const oldCrc = args[1].toInt32();
                if (oldCrc !== 0) {
                    console.log(`[BundleRedirector] CRC bypass: ${oldCrc} → 0 for ${path}`);
                    args[1] = ptr(0);
                }
            }
        },
    });
}

// ============================================================================
// HOOK 3 (可选): CreateWebRequest — 远程加载日志 / 拦截
// ============================================================================
//
// 当 TransformInternalId 返回 http(s) URL 后，引擎走 WebRequest 路径。
// 此 hook 仅用于日志确认，可按需扩展（如添加自定义 header 等）。

function hookCreateWebRequest(mod) {
    const addr = mod.base.add(CONFIG.RVA_CreateWebRequest);
    console.log(`[BundleRedirector] Hooking CreateWebRequest @ ${addr}`);

    Interceptor.attach(addr, {
        onEnter(args) {
            const internalId = readIl2CppString(args[1]);
            if (internalId && redirectedPaths.has(internalId)) {
                console.log(`[BundleRedirector] WebRequest 加载重定向 bundle: ${internalId}`);
            }
        },
    });
}

// ============================================================================
// ENTRY POINT
// ============================================================================

console.log("==============================================");
console.log("  Unity Addressables Bundle Redirector v1.0");
console.log("==============================================");

loadConfig();

function installHooks(mod) {
    console.log(`[BundleRedirector] ${CONFIG.moduleName} base: ${mod.base}`);
    initStringApi(mod);
    hookTransformInternalId(mod);
    hookLoadFromFileAsync(mod);
    hookCreateWebRequest(mod);
    console.log("[BundleRedirector] 所有 Hook 已安装，等待 bundle 加载...\n");
}

const mod = Process.findModuleByName(CONFIG.moduleName);
if (mod) {
    installHooks(mod);
} else {
    console.log(`[BundleRedirector] 等待 ${CONFIG.moduleName} 加载...`);
    const observer = Process.attachModuleObserver({
        onAdded(module) {
            if (module.name === CONFIG.moduleName) {
                observer.detach();
                installHooks(module);
            }
        },
    });
}
