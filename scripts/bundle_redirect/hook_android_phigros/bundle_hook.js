/**
 * Unity Addressables Bundle Redirector — Frida Hook Script
 * ========================================================
 * 通用 IL2CPP (Unity) 游戏 AssetBundle 重定向框架。
 *
 * 功能：
 *   - 自动检测本地 *.bundle 文件大小，大于 200 KB 的重定向为远程 URL。
 *   - 本地路径仍走 AssetBundle.LoadFromFileAsync，远程走 UnityWebRequest。
 *   - 仅对本地路径进行自动重定向，已含 "://" 的路径保持原样。
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

    // 远程 bundle 前缀
    remoteBase: "https://phi-asset.cn-nb1.rains3.com/bundle/",

    // 调试：记录前 N 个本地 bundle 路径与大小
    debugLogLocalBundles: true,
    debugLogLimit: 20,
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
// FILE HELPERS
// ============================================================================

let redirectedPaths = new Set();
let JavaFile = null;
let debugLoggedPaths = new Set();
let debugTransformCalls = 0; // 调试：记录 TransformInternalId 调用次数

/**
 * 初始化 Java 辅助类。
 * 注意：Java API 必须在 Java.perform 回调中使用，不能直接在 native 线程里调用。
 */
function initJavaHelpers() {
    if (JavaFile) return;
    Java.perform(() => {
        try {
            JavaFile = Java.use("java.io.File");
            console.log("[BundleRedirector] Java helpers initialized");
        } catch (e) {
            console.log("[BundleRedirector] 初始化 Java helpers 失败: " + e);
        }
    });
}

/**
 * 获取文件大小（字节）。
 *
 * 支持两种情况：
 *   1) 普通文件路径: /data/.../xxx.bundle
 *   2) JAR/ZIP 内的路径: jar:file:///data/app/xxx/base.apk!/assets/aa/Android/xxx.bundle
 *
 * 所有 Java 调用都通过 Java.perform 在 Java 线程中执行，避免 “access to Java API from non-Java thread” 错误。
 */
function getFileSizeBytes(path) {
    if (!Java.available) return -1;

    let result = -1;

    Java.perform(() => {
        try {
            // 确保 JavaFile 已初始化
            if (!JavaFile) {
                JavaFile = Java.use("java.io.File");
            }

            // 处理 jar:file:///.../base.apk!/assets/... 这种路径
            if (path.startsWith("jar:file://")) {
                // 提取 APK 真实路径和 Zip 内部条目路径
                // 例如: jar:file:///data/app/.../base.apk!/assets/aa/Android/xxx.bundle
                const match = path.match(/^jar:(file:\/\/[^!]+)!\/(.+)$/);
                if (!match) {
                    result = -1;
                    return;
                }

                let apkUri = match[1];      // file:///data/app/.../base.apk
                const entryName = match[2]; // assets/aa/Android/xxx.bundle

                // 去掉 file:// 前缀，得到实际文件系统路径
                let apkPath = apkUri;
                if (apkPath.startsWith("file://")) {
                    apkPath = apkPath.substring("file://".length);
                }

                const ZipFile = Java.use("java.util.zip.ZipFile");
                const File = JavaFile; // java.io.File

                const apkFile = File.$new(apkPath);
                if (!apkFile.exists()) {
                    result = -1;
                    return;
                }

                const zip = ZipFile.$new(apkPath);
                const entry = zip.getEntry(entryName);
                if (entry === null) {
                    zip.close();
                    result = -1;
                    return;
                }

                const size = entry.getSize(); // long
                zip.close();

                if (size === -1) {
                    // ZipEntry.getSize() 可能返回 -1 表示未知
                    result = -1;
                } else if (typeof size === "number") {
                    result = size;
                } else if (size && size.toNumber) {
                    result = size.toNumber();
                } else {
                    result = -1;
                }
            } else {
                // 普通文件路径，直接用 java.io.File.length()
                const f = JavaFile.$new(path);
                if (!f.exists()) {
                    result = -1;
                    return;
                }

                const size2 = f.length();
                // 某些 ROM 上 length() 返回的是 long 对象，这里统一转成 number
                if (typeof size2 === "number") {
                    result = size2;
                } else if (size2 && size2.toNumber) {
                    result = size2.toNumber();
                } else {
                    result = -1;
                }
            }
        } catch (e) {
            // 出错时不打断流程，只返回 -1 表示未知大小
            console.log("[BundleRedirector][WARN] getFileSizeBytes failed for path: " + path + " , error: " + e);
            result = -1;
        }
    });

    return result;
}

function extractBundleName(path) {
    const m = path.match(/([^\/\\]+\.bundle)(?:\?.*)?$/i);
    return m ? m[1] : null;
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
//   onLeave 中读取返回路径，若为本地 *.bundle 且文件大小 > 200 KB，
//   自动改写为远程 URL（remoteBase + bundleName）。
//   引擎会根据路径是否包含 "://" 自动选择本地或 WebRequest 加载。

function hookTransformInternalId(mod) {
    const addr = mod.base.add(CONFIG.RVA_TransformInternalId);
    console.log(`[BundleRedirector] Hooking TransformInternalId @ ${addr}`);

    Interceptor.attach(addr, {
        onLeave(retval) {
            // 调试：无论是否成功解析字符串，都先统计调用次数
            debugTransformCalls++;

            const original = readIl2CppString(retval);

            // 前几次强制打印，确认函数是否被频繁调用 & 返回值是否为有效字符串
            if (debugTransformCalls <= 20) {
                console.log(`[BundleRedirector][TRACE] TransformInternalId call #${debugTransformCalls}`);
                console.log(`  retval ptr = ${retval}`);
                console.log(`  internalId = ${original === null ? "<null or invalid Il2CppString>" : original}`);
            }

            if (!original) return;

            // 忽略 http/https 等远程 URL，但允许 jar:file:// 这类本地 APK 内部路径
            if (original.startsWith("http://") || original.startsWith("https://")) {
                return;
            }

            const bundleName = extractBundleName(original);
            if (!bundleName) return;

            const size = getFileSizeBytes(original);
            if (CONFIG.debugLogLocalBundles && debugLoggedPaths.size < CONFIG.debugLogLimit && !debugLoggedPaths.has(original)) {
                debugLoggedPaths.add(original);
                console.log(`[BundleRedirector][DEBUG] Local bundle path: ${original}`);
                console.log(`[BundleRedirector][DEBUG] Size: ${size} bytes`);
            }

            if (size < 0) return;
            if (size <= 200 * 1024) return;

            const newPath = CONFIG.remoteBase + bundleName;

            console.log("[BundleRedirector] 自动重定向大文件 bundle:");
            console.log(`  原始: ${original}`);
            console.log(`  大小: ${(size / 1024).toFixed(1)} KB`);
            console.log(`  目标: ${newPath}`);

            const newStr = createIl2CppString(newPath);
            retval.replace(newStr);
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

function installHooks(mod) {
    console.log(`[BundleRedirector] ${CONFIG.moduleName} base: ${mod.base}`);
    initStringApi(mod);
    initJavaHelpers();
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
