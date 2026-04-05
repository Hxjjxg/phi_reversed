/**
 * Phigros Note Texture Replacer 
 * ==============================================================
 * 通过底层 Unity ImageConversion API，直接将本地 PNG 注入原版 Texture2D 内存中。
 * 从而实现不新建对象修改 Note 样式的功能（静默替换游戏使用的贴图材质）。
 *
 * 【用法注意】
 * 请在设备上准备如下文件：
 * /data/local/tmp/click.png
 * /data/local/tmp/drag.png
 * /data/local/tmp/hold.png
 * /data/local/tmp/flick.png
 * ==============================================================
 */

"use strict";

const moduleName = "libil2cpp.so";

// ==========================================
// RVA 配置表 (基于 dump_android.cs)
// ==========================================
const RVA = {
    LevelControl_Awake: 0x239a63c,
    Sprite_get_texture: 0x1a50a8c,                                // UnityEngine.Sprite.get_texture()
    ImageConversion_LoadImage: 0x1c1c420,                         // UnityEngine.ImageConversion.LoadImage(Texture2D, Byte[])
    File_ReadAllBytes: 0x1af2ba0,                                 // System.IO.File.ReadAllBytes(String)
};

// 各种类型 Note 的引用内存偏移 (在 LevelControl 实例中)
const OFFSET = {
    ClickHL: 0x58,
    HoldHL0: 0x60,
    DragHL: 0x70,
    FlickHL: 0x78
};

// ==========================================
// 辅助与本地函数初始化
// ==========================================
let il2cpp_string_new = null;
let access = null;

function initHooks() {
    console.log("[*] 等待 libil2cpp.so 加载...");
    const il2cppModule = Process.getModuleByName(moduleName);
    const il2cpp = il2cppModule.base;

    // 导出的 IL2CPP 函数
    const export_string_new = il2cppModule.findExportByName("il2cpp_string_new");
    if (export_string_new) {
        il2cpp_string_new = new NativeFunction(export_string_new, 'pointer', ['pointer']);
    } else {
        console.error("[-] 无法找到 il2cpp_string_new");
        return;
    }

    // libc access 用于测试文件是否存在以防止闪退
    const export_access = Module.findGlobalExportByName("access");
    access = new NativeFunction(export_access, 'int', ['pointer', 'int']);

    // 原生函数封装
    const Sprite_get_texture = new NativeFunction(il2cpp.add(RVA.Sprite_get_texture), 'pointer', ['pointer']);
    const ImageConversion_LoadImage = new NativeFunction(il2cpp.add(RVA.ImageConversion_LoadImage), 'bool', ['pointer', 'pointer']);
    const File_ReadAllBytes = new NativeFunction(il2cpp.add(RVA.File_ReadAllBytes), 'pointer', ['pointer']);

    /**
     * 替换给定 Sprite 的贴图为本地 PNG 文件
     * @param {NativePointer} spritePtr 
     * @param {string} rawFilePath 
     */
    function replaceSpriteTexture(spritePtr, rawFilePath) {
        if (spritePtr.isNull()) {
            console.log(`[-] [${rawFilePath}] 提供 Sprite 引用的指针为 NULL！`);
            return false;
        }

        // 1. 获取对应的 Texture2D
        const texture2d = Sprite_get_texture(spritePtr);
        if (texture2d.isNull()) {
            console.log(`[-] [${rawFilePath}] 无法从 Sprite 获取 Texture2D (可能是此时还未加载)`);
            return false;
        }

        // 2. 检查本地文件是否存在
        if (access(Memory.allocUtf8String(rawFilePath), 0) !== 0) {
            console.log(`[-] [${rawFilePath}] 未在本地找到该自定义贴图！跳过修改。`);
            return false;
        }

        // 3. 将路径转为 Il2Cpp String，并调用从 C# 原生读文件拿到 byte[]
        const sysPath = il2cpp_string_new(Memory.allocUtf8String(rawFilePath));
        const bytesArray = File_ReadAllBytes(sysPath);

        if (bytesArray.isNull()) {
            console.log(`[-] [${rawFilePath}] File.ReadAllBytes 读取失败！`);
            return false;
        }

        // 4. 调用 Unity 方法直接覆盖该底层材质贴图的缓冲
        const success = ImageConversion_LoadImage(texture2d, bytesArray);
        console.log(`[+] 成功将贴图挂载到内存原 Texture2D 中 => ${rawFilePath} : 返回 ${success ? "True" : "False"}`);
        return success;
    }

    // ==========================================
    // 拦截关卡初始化，实行偷天换日
    // ==========================================
    Interceptor.attach(il2cpp.add(RVA.LevelControl_Awake), {
        onEnter: function (args) {
            // LevelControl 的实例指针 (this)
            this.levelControl = args[0];
            console.log("[*] LevelControl.Awake() OnEnter. Instance: " + this.levelControl);
        },
        onLeave: function (retval) {
            if (!this.levelControl || this.levelControl.isNull()) return;
            console.log("[*] 关卡加载完毕！(LevelControl.Awake OnLeave) 正在尝试注入您的打歌按键外观...");

            try {
                const ptrClick = this.levelControl.add(OFFSET.ClickHL).readPointer();
                const ptrHold  = this.levelControl.add(OFFSET.HoldHL0).readPointer();
                const ptrDrag  = this.levelControl.add(OFFSET.DragHL).readPointer();
                const ptrFlick = this.levelControl.add(OFFSET.FlickHL).readPointer();

                replaceSpriteTexture(ptrClick, "/data/local/tmp/click.png");
                replaceSpriteTexture(ptrHold,  "/data/local/tmp/hold.png");
                replaceSpriteTexture(ptrDrag,  "/data/local/tmp/drag.png");
                replaceSpriteTexture(ptrFlick, "/data/local/tmp/flick.png");

                console.log("[*] 操作执行完毕！准备开始打歌。");
            } catch (e) {
                console.error("[-] 出现异常: " + e);
            }
        }
    });
}

/** 
 * 因为是依赖 il2cpp，如果在游戏启动时注入，请等待初始化完成。
 * 如果是附加 (-p) 到活进程中，可直接执行。
 */
setTimeout(() => {
    initHooks();
}, 1000);
