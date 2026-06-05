import "frida-il2cpp-bridge";

/**
 * Hold note 6-slot material replacement — runnable on frida-il2cpp-bridge 0.13.0.
 *
 * Loads 6 PNGs from /data/local/tmp, builds Sprites once at startup, installs
 * them via HoldControl.Start (native once-per-note creation callback; see DEBUG.md).
 * HL (multi-press) detected by noteImages[1] == judgeLine.HoldHL1.
 *   noteImages[0]=body, [1]=head, [2]=end(tail)
 *
 * PNGs (adb push <file> /data/local/tmp/):
 *   hold_body.png / hold_body_multi.png
 *   hold_head.png / hold_head_multi.png
 *   hold_end.png  / hold_end_multi.png  (independent tail-HL)
 */

const PNG_DIR = "/data/local/tmp";
const FILES = {
    bodyNormal: "hold_body.png",
    bodyHL: "hold_body_multi.png",
    headNormal: "hold_head.png",
    headHL: "hold_head_multi.png",
    tailNormal: "hold_end.png",
    tailHL: "hold_end_multi.png",
} as const;

Il2Cpp.perform(() => {
    const core = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
    const imgConvAsm = Il2Cpp.domain.assembly("UnityEngine.TextRenderingModule").image;

    const Texture2D = core.class("UnityEngine.Texture2D");
    const Sprite = core.class("UnityEngine.Sprite");
    const Rect = core.class("UnityEngine.Rect");
    const Vector2 = core.class("UnityEngine.Vector2");
    const ImageConversion = imgConvAsm.class("UnityEngine.ImageConversion");
    const Byte = Il2Cpp.corlib.class("System.Byte");

    const spriteCreate = Sprite.method<Il2Cpp.Object>("Create", 3); // static (Texture2D, Rect, Vector2)
    const loadImage = ImageConversion.method<boolean>("LoadImage", 2); // static (Texture2D, Byte[])

    function readBytes(path: string): Il2Cpp.Array<number> | null {
        try {
            const f = new File(path, "rb");
            const buf = f.readBytes() as ArrayBuffer;
            f.close();
            const u8 = new Uint8Array(buf);
            const arr = Il2Cpp.array<number>(Byte, u8.length);
            for (let i = 0; i < u8.length; i++) arr.set(i, u8[i]);
            return arr;
        } catch (e) {
            console.log(`[!] read failed ${path}: ${e}`);
            return null;
        }
    }

    function makeValueType(klass: Il2Cpp.Class): Il2Cpp.ValueType {
        return new Il2Cpp.ValueType(Memory.alloc(klass.valueTypeSize), klass.type);
    }

    function buildSprite(file: string): Il2Cpp.Object | null {
        const bytes = readBytes(`${PNG_DIR}/${file}`);
        if (bytes == null) return null;

        // placeholder texture; LoadImage auto-resizes to the PNG's real size
        const tex = Texture2D.alloc();
        tex.method(".ctor", 2).invoke(2, 2);

        if (!loadImage.invoke(tex, bytes)) {
            console.log(`[!] LoadImage failed: ${file}`);
            return null;
        }

        const w = tex.method<number>("get_width").invoke();
        const h = tex.method<number>("get_height").invoke();

        const rect = makeValueType(Rect);
        rect.method(".ctor", 4).invoke(0, 0, w, h);

        const pivot = makeValueType(Vector2);
        pivot.method(".ctor", 2).invoke(0.5, 0.5);

        const sprite = spriteCreate.invoke(tex, rect, pivot);
        if (sprite.isNull()) {
            console.log(`[!] Sprite.Create null: ${file}`);
            return null;
        }
        console.log(`[+] ${file}: ${w}x${h} sprite=${sprite.handle}`);
        return sprite;
    }

    const sprites: Record<string, Il2Cpp.Object | null> = {};
    for (const [slot, file] of Object.entries(FILES)) sprites[slot] = buildSprite(file);

    // Pin sprites for the whole session so Unity GC never frees them.
    (globalThis as Record<string, unknown>).__holdSprites = sprites;

    const HoldControl = Il2Cpp.domain.assembly("Assembly-CSharp").image.class("HoldControl");
    const start = HoldControl.method("Start");

    Interceptor.attach(start.virtualAddress, {
        onEnter(args) {
            const self = new Il2Cpp.Object(args[0] as NativePointer);
            const arr = self.field<Il2Cpp.Array<Il2Cpp.Object>>("noteImages").value;
            if (arr.isNull() || arr.length < 3) return;

            const judgeLine = self.field<Il2Cpp.Object>("judgeLine").value;
            let isHL = false;
            if (!judgeLine.isNull()) {
                const hl1 = judgeLine.field<Il2Cpp.Object>("HoldHL1").value;
                const head = arr.get(1);
                isHL = !head.isNull() && !hl1.isNull() && head.handle.equals(hl1.handle);
            }

            const body = isHL ? sprites.bodyHL : sprites.bodyNormal;
            const head = isHL ? sprites.headHL : sprites.headNormal;
            const tail = isHL ? sprites.tailHL : sprites.tailNormal;

            if (body != null && !body.isNull()) arr.set(0, body);
            if (head != null && !head.isNull()) arr.set(1, head);
            if (tail != null && !tail.isNull()) arr.set(2, tail);
        },
    });

    console.log(`[+] HoldControl.Start hooked @ ${start.virtualAddress} — 6-slot PNG replacement active.`);
});
