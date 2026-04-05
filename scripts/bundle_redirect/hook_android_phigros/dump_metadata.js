/**
 * dump_metadata.js — 从 Android IL2CPP 游戏中 dump 解密后的 global-metadata
 * ============================================================================
 * 
 * 背景：
 *   游戏将 global-metadata.dat 加密为 game.dat 打包在 APK 中。
 *   运行时由 libUnityPlugin.so 提供的解密回调 (query_call_back(107)) 解密。
 *   字符串表中的标识符字符串由另一个回调 (query_call_back(108)) 逐条解密。
 *
 * 调用链：
 *   MetadataCache::Initialize (0x1177B28)
 *     → sub_1177A8C()            // dlopen("libUnityPlugin.so"), 获取解密回调
 *     → LoadMetadataFile (0x11782BC)
 *         → off_448DF28(path)    // 解密 game.dat, 返回解密后的 metadata buffer
 *     → off_448DF30(strPtr)      // 逐条解密 string 表中的标识符字符串 (in-place)
 *     → ... (填充各种表)
 *
 * 策略：
 *   1. Hook LoadMetadataFile，在其返回时拿到解密后的 metadata buffer
 *   2. 复制一份到新内存，对副本中的所有标识符字符串调用 off_448DF30 解密
 *   3. 通过 send(msg, data) 将二进制数据分块发送回 PC 端
 *
 * 兼容：Frida 17+ (不使用 Module 静态方法)
 *
 * 使用方法：
 *   配合 dump_metadata_recv.py 使用:
 *     python dump_metadata_recv.py --attach Gadget
 *   或单独使用 frida CLI (只能看到日志，文件需用 recv.py 接收):
 *     frida -U Gadget -l dump_metadata.js
 */

"use strict";

// ═══════════════════════════════════════════════════════════════
// 配置区 — 来自 IDA 分析的偏移量
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
    moduleName: "libil2cpp.so",

    // LoadMetadataFile (sub_11782BC)
    // 参数: X0 = filename 字符串指针
    // 返回: X0 = 解密后的 metadata buffer 指针 (或 NULL)
    RVA_LoadMetadataFile: 0x11782BC,

    // MetadataCache::Initialize (sub_1177B28) — 备用 hook 点
    RVA_MetadataCacheInit: 0x1177B28,

    // 全局变量: s_GlobalMetadata 指针
    RVA_s_GlobalMetadata: 0x448DF38,

    // 全局变量: 字符串解密回调函数指针 (off_448DF30)
    // 由 libUnityPlugin.so 的 query_call_back(108) 返回
    // 签名: void decrypt_string(char* str)
    RVA_DecryptStringCb: 0x448DF30,

    // 输出文件名
    outputFilename: "global-metadata.dat",
};

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 从 metadata header 计算总大小
 * Il2CppGlobalMetadataHeader v24: 
 *   0x00: sanity (0xFAB11BAF)
 *   0x04: version (24 or 29)
 *   0x08 ~ 0x107: 32 组 (offset, byteSize) 对, 每组 8 字节
 * 总大小 = max(offset_i + size_i)
 */
function computeMetadataSize(ptr) {
    const magic = ptr.readU32();
    const version = ptr.add(4).readS32();

    if (magic !== 0xFAB11BAF) {
        console.log("[-] magic 校验失败: 0x" + magic.toString(16) + " (期望 0xFAB11BAF)");
        return 0;
    }
    console.log("[+] Header 有效: magic=0xFAB11BAF, version=" + version);

    let maxEnd = 0;
    const NUM_SECTION_PAIRS = 32;
    for (let i = 0; i < NUM_SECTION_PAIRS; i++) {
        const sectionOffset = ptr.add(0x08 + i * 8).readS32();
        const sectionSize = ptr.add(0x0C + i * 8).readS32();
        const end = sectionOffset + sectionSize;
        if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
}

/**
 * 通过 send(msg, data) 将二进制数据分块发送到 PC
 * 每块最大 CHUNK_SIZE 字节, Python 端接收后拼接
 */
function sendBinaryViaSend(ptr, size) {
    const CHUNK_SIZE = 512 * 1024; // 512 KB per chunk
    const totalChunks = Math.ceil(size / CHUNK_SIZE);

    // 先发送元信息
    send({ event: "metadata_info", totalSize: size, totalChunks: totalChunks });

    for (let i = 0; i < totalChunks; i++) {
        const offset = i * CHUNK_SIZE;
        const n = Math.min(CHUNK_SIZE, size - offset);
        const chunk = ptr.add(offset).readByteArray(n);
        send({ event: "metadata_chunk", index: i }, chunk);
    }

    send({ event: "metadata_done" });
    console.log("[+] 已通过 send() 发送 " + totalChunks + " 块 (" + (size / 1048576).toFixed(2) + " MB)");
}

/**
 * 遍历 null-terminated 字符串表, 对每个字符串调用解密函数
 * 返回解密的字符串数量
 */
function decryptStringSection(bufferBase, sectionOffset, sectionSize, decryptFn) {
    let p = bufferBase.add(sectionOffset);
    const end = bufferBase.add(sectionOffset + sectionSize);
    let count = 0;

    while (p.compare(end) < 0) {
        // 对当前字符串调用解密 (in-place)
        decryptFn(p);
        count++;

        // 跳过当前字符串 (找 null terminator)
        while (p.compare(end) < 0 && p.readU8() !== 0) {
            p = p.add(1);
        }
        p = p.add(1); // 跳过 \0
    }
    return count;
}

// ═══════════════════════════════════════════════════════════════
// 主逻辑
// ═══════════════════════════════════════════════════════════════

function installHooks(il2cpp) {
    const base = il2cpp.base;
    console.log("[*] " + CONFIG.moduleName + " 基址: " + base);

    // -------------------------------------------------------
    // Hook LoadMetadataFile (sub_11782BC)
    // 在函数返回时拦截: 此时 X0 = 解密后的 metadata buffer
    // -------------------------------------------------------
    const loadMetaAddr = base.add(CONFIG.RVA_LoadMetadataFile);
    console.log("[*] Hook: LoadMetadataFile @ " + loadMetaAddr);

    let alreadyDumped = false;

    Interceptor.attach(loadMetaAddr, {
        onEnter: function (args) {
            // X0 = filename 指针
            try {
                this.filename = args[0].readUtf8String();
            } catch (e) {
                this.filename = "(无法读取)";
            }
            console.log('[*] LoadMetadataFile("' + this.filename + '")');
        },

        onLeave: function (retval) {
            if (retval.isNull()) {
                console.log("[-] LoadMetadataFile 返回 NULL (文件: " + this.filename + ")");
                return;
            }

            if (alreadyDumped) {
                console.log("[*] 已经 dump 过, 跳过");
                return;
            }

            console.log("[+] LoadMetadataFile 返回: " + retval);

            // --- 1. 验证 header 并计算大小 ---
            const metaPtr = retval;
            const totalSize = computeMetadataSize(metaPtr);
            if (totalSize <= 0) {
                console.log("[-] 无法计算 metadata 大小, 中止");
                return;
            }
            console.log("[+] metadata 大小: " + totalSize + " bytes (" + (totalSize / 1048576).toFixed(2) + " MB)");

            // --- 2. 读取字符串解密回调 ---
            const decryptCbAddr = base.add(CONFIG.RVA_DecryptStringCb);
            const decryptCbPtr = decryptCbAddr.readPointer();

            if (decryptCbPtr.isNull()) {
                // 没有字符串加密 (标准路径, 非 game.dat)
                console.log("[*] 无字符串加密, 直接发送");
                sendBinaryViaSend(metaPtr, totalSize);
                alreadyDumped = true;
                console.log("\n[+] ===== 完成 =====");
                return;
            }

            console.log("[*] 字符串解密回调 @ " + decryptCbPtr);

            // --- 3. 复制 metadata 到新内存 (避免影响原始数据) ---
            console.log("[*] 正在复制 metadata buffer (" + (totalSize / 1048576).toFixed(2) + " MB) ...");
            const copy = Memory.alloc(totalSize);
            Memory.copy(copy, metaPtr, totalSize);
            console.log("[+] 复制完成 @ " + copy);

            // --- 4. 解密副本中的标识符字符串 ---
            // stringOffset @ header+0x18, stringSize @ header+0x1C
            const stringOffset = copy.add(0x18).readS32();
            const stringSize   = copy.add(0x1C).readS32();
            console.log("[*] 标识符字符串区: offset=0x" + stringOffset.toString(16) + 
                        ", size=" + stringSize + " bytes");

            const decrypt = new NativeFunction(decryptCbPtr, "void", ["pointer"]);

            console.log("[*] 正在解密标识符字符串 ...");
            const strCount = decryptStringSection(copy, stringOffset, stringSize, decrypt);
            console.log("[+] 已解密 " + strCount + " 个标识符字符串");

            // --- 5. 验证解密结果: 打印前几个字符串 ---
            console.log("[*] 解密后的前 10 个字符串:");
            let checkPtr = copy.add(stringOffset);
            const checkEnd = copy.add(stringOffset + stringSize);
            for (let i = 0; i < 10 && checkPtr.compare(checkEnd) < 0; i++) {
                try {
                    const s = checkPtr.readUtf8String();
                    console.log("    [" + i + "] " + (s.length > 80 ? s.substring(0, 80) + "..." : s));
                    checkPtr = checkPtr.add(s.length + 1);
                } catch (e) {
                    console.log("    [" + i + "] (读取失败)");
                    break;
                }
            }

            // --- 6. 通过 send() 发送到 PC ---
            sendBinaryViaSend(copy, totalSize);
            alreadyDumped = true;
            console.log("\n[+] ===== 完成 =====");
            console.log("[+] 大小: " + totalSize + " bytes");
            console.log("[+] 数据已通过 Frida 通道发送到 PC");
        },
    });

    console.log("[*] Hooks 已安装, 等待 metadata 加载 ...");
}

// ═══════════════════════════════════════════════════════════════
// 模块加载等待
// ═══════════════════════════════════════════════════════════════

function main() {
    console.log("====================================");
    console.log("  global-metadata.dat Dumper");
    console.log("  Frida 17+ | Android IL2CPP");
    console.log("====================================\n");

    // 尝试直接获取模块
    const il2cpp = Process.findModuleByName(CONFIG.moduleName);
    if (il2cpp) {
        console.log("[*] " + CONFIG.moduleName + " 已加载");
        installHooks(il2cpp);
        return;
    }

    // 模块尚未加载 — 等待
    console.log("[*] " + CONFIG.moduleName + " 尚未加载, 等待中 ...");

    // 方法1: 轮询 (最可靠)
    const timer = setInterval(function () {
        const m = Process.findModuleByName(CONFIG.moduleName);
        if (m) {
            clearInterval(timer);
            console.log("[*] " + CONFIG.moduleName + " 已加载!");
            installHooks(m);
        }
    }, 50);
}

// 启动
main();
