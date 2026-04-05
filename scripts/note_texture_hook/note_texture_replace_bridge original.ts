import "frida-il2cpp-bridge";

declare const Il2Cpp: any;
const NOTE_TEXTURES: Record<string, string> = {
    ClickHL: "/data/local/tmp/click.png",
    HoldHL0: "/data/local/tmp/hold.png",
    DragHL: "/data/local/tmp/drag.png",
    FlickHL: "/data/local/tmp/flick.png"
};

const FridaFile = (globalThis as any).File;

function resolveClass(fullName: string, preferredAssemblies: string[] = []): any {
    for (const asmName of preferredAssemblies) {
        const asm = Il2Cpp.domain.tryAssembly(asmName);
        const klass = asm?.image.tryClass(fullName);
        if (klass) {
            return klass;
        }
    }

    for (const asm of Il2Cpp.domain.assemblies) {
        const klass = asm.image.tryClass(fullName);
        if (klass) {
            return klass;
        }
    }

    throw new Error(`Class not found: ${fullName}`);
}

function readLocalBytes(path: string): number[] {
    const file = new FridaFile(path, "rb");
    try {
        const raw = file.readBytes();
        return Array.from(new Uint8Array(raw));
    } finally {
        file.close();
    }
}

function createCustomSprite(imagePath: string, pixelsPerUnit: number = 100): any {
    const Texture2D = resolveClass("UnityEngine.Texture2D", ["UnityEngine.CoreModule"]);
    const Sprite = resolveClass("UnityEngine.Sprite", ["UnityEngine.CoreModule"]);
    const Rect = resolveClass("UnityEngine.Rect", ["UnityEngine.CoreModule"]);
    const Vector2 = resolveClass("UnityEngine.Vector2", ["UnityEngine.CoreModule"]);
    const ImageConversion = resolveClass("UnityEngine.ImageConversion", ["UnityEngine.ImageConversionModule", "UnityEngine.CoreModule"]);

    const systemByte = Il2Cpp.corlib.class("System.Byte");
    const byteArray = Il2Cpp.array(systemByte, readLocalBytes(imagePath));

    const texture = Texture2D.alloc();
    texture.method(".ctor").overload("System.Int32", "System.Int32").invoke(2, 2);

    const loaded = ImageConversion.method("LoadImage")
        .overload("UnityEngine.Texture2D", "System.Byte[]")
        .invoke(texture, byteArray);

    if (!loaded) {
        throw new Error(`LoadImage failed: ${imagePath}`);
    }

    const width = texture.method("get_width").invoke();
    const height = texture.method("get_height").invoke();

    const rect = Rect.alloc();
    rect.method(".ctor").overload("System.Single", "System.Single", "System.Single", "System.Single").invoke(0, 0, width, height);

    const pivot = Vector2.alloc();
    pivot.method(".ctor").overload("System.Single", "System.Single").invoke(0.5, 0.5);

    return Sprite.method("Create")
        .overload("UnityEngine.Texture2D", "UnityEngine.Rect", "UnityEngine.Vector2", "System.Single")
        .invoke(texture, rect.unbox(), pivot.unbox(), pixelsPerUnit);
}

Il2Cpp.perform(() => {
    const AssemblyCSharp = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const LevelControl = AssemblyCSharp.class("LevelControl");

    let replacedOnce = false;
    LevelControl.method("Awake", 0).implementation = function (this: any): void {
        this.method("Awake").invoke();

        if (replacedOnce) {
            return;
        }
        replacedOnce = true;

        for (const fieldName of Object.keys(NOTE_TEXTURES)) {
            const path = NOTE_TEXTURES[fieldName];
            if (!path) {
                continue;
            }

            try {
                const sprite = createCustomSprite(path);
                this.field(fieldName).value = sprite;
                console.log(`[note-texture] ${fieldName} <= ${path}`);
            } catch (e) {
                console.log(`[note-texture] failed ${fieldName} <= ${path}: ${e}`);
            }
        }
    };

    console.log("[note-texture] hook installed at LevelControl.Awake");
});
