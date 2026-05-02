import "frida-il2cpp-bridge";

declare const Il2Cpp: any;

type NoteSpriteSet = {
    click: string;
    drag: string;
    flick: string;
    holdHead: string;
    holdBody: string;
    holdEnd: string;
};

const NOTE_TEXTURES: { normal: NoteSpriteSet; multi: NoteSpriteSet } = {
    normal: {
        click: "/data/local/tmp/click.png",
        drag: "/data/local/tmp/drag.png",
        flick: "/data/local/tmp/flick.png",
        holdHead: "/data/local/tmp/hold_head.png",
        holdBody: "/data/local/tmp/hold_body.png",
        holdEnd: "/data/local/tmp/hold_end.png"
    },
    multi: {
        click: "/data/local/tmp/click_multi.png",
        drag: "/data/local/tmp/drag_multi.png",
        flick: "/data/local/tmp/flick_multi.png",
        holdHead: "/data/local/tmp/hold_head_multi.png",
        holdBody: "/data/local/tmp/hold_body_multi.png",
        holdEnd: "/data/local/tmp/hold_end_multi.png"
    }
};

const FridaFile = (globalThis as any).File;
const spriteCache = new Map<string, any>();
const processedHolds = new Set<string>();

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

function getOrCreateSprite(imagePath: string): any {
    let sprite = spriteCache.get(imagePath);
    if (!sprite) {
        sprite = createCustomSprite(imagePath);
        spriteCache.set(imagePath, sprite);
    }
    return sprite;
}

function loadSpriteSet(paths: NoteSpriteSet): NoteSpriteSet {
    return {
        click: getOrCreateSprite(paths.click),
        drag: getOrCreateSprite(paths.drag),
        flick: getOrCreateSprite(paths.flick),
        holdHead: getOrCreateSprite(paths.holdHead),
        holdBody: getOrCreateSprite(paths.holdBody),
        holdEnd: getOrCreateSprite(paths.holdEnd)
    } as unknown as NoteSpriteSet;
}

function getComponent(gameObject: any, componentClass: any): any {
    const component = gameObject.method("GetComponent")
        .overload("System.Type")
        .invoke(componentClass.type.object);

    if (!component || component.isNull?.()) {
        throw new Error(`GetComponent failed: ${componentClass.type.name}`);
    }

    return component;
}

function sameObject(a: any, b: any): boolean {
    if (!a || !b) {
        return false;
    }

    const aHandle = a.handle ?? a;
    const bHandle = b.handle ?? b;

    if (!aHandle || !bHandle) {
        return false;
    }

    if (typeof aHandle.equals === "function") {
        return aHandle.equals(bHandle);
    }

    return aHandle.toString() === bHandle.toString();
}

function replacePrefabNoteImage(gameObject: any, componentClass: any, sprite: any): void {
    const component = getComponent(gameObject, componentClass);
    component.field("noteImage").value = sprite;
}

function applyHoldNoteImages(noteImages: any, sprites: any): void {
    if (!noteImages || noteImages.isNull?.()) {
        throw new Error("HoldControl.noteImages is null");
    }

    if (noteImages.length > 0) {
        noteImages.set(0, sprites.holdHead);
    }

    if (noteImages.length > 1) {
        noteImages.set(1, sprites.holdBody);
    }

    if (noteImages.length > 2) {
        noteImages.set(2, sprites.holdEnd);
    }
}

function replaceHoldPrefabNoteImages(gameObject: any, holdControlClass: any, sprites: any): void {
    const component = getComponent(gameObject, holdControlClass);
    applyHoldNoteImages(component.field("noteImages").value, sprites);
}

function syncHoldRenderer(instance: any, fieldName: string, sprite: any): void {
    if (!sprite) {
        return;
    }

    const renderer = instance.field(fieldName).value;
    if (!renderer || renderer.isNull?.()) {
        return;
    }

    renderer.method("set_sprite").overload("UnityEngine.Sprite").invoke(sprite);
}

function isMultiHold(noteImages: any, multiSprites: any): boolean {
    const headMatches = noteImages.length > 0 && sameObject(noteImages.get(0), multiSprites.holdHead);
    const bodyMatches = noteImages.length > 1 && sameObject(noteImages.get(1), multiSprites.holdBody);
    return headMatches || bodyMatches;
}

Il2Cpp.perform(() => {
    const AssemblyCSharp = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const LevelControl = AssemblyCSharp.class("LevelControl");
    const ClickControl = AssemblyCSharp.class("ClickControl");
    const DragControl = AssemblyCSharp.class("DragControl");
    const FlickControl = AssemblyCSharp.class("FlickControl");
    const HoldControl = AssemblyCSharp.class("HoldControl");

    let loadedSprites: { normal: any; multi: any } | null = null;
    let replacedOnce = false;

    HoldControl.method("NoteMove", 0).implementation = function (this: any): void {
        this.method("NoteMove").invoke();

        if (!loadedSprites) {
            return;
        }

        const key = this.handle.toString();
        if (processedHolds.has(key)) {
            return;
        }
        processedHolds.add(key);

        try {
            const noteImages = this.field("noteImages").value;
            const spriteSet = isMultiHold(noteImages, loadedSprites.multi) ? loadedSprites.multi : loadedSprites.normal;

            applyHoldNoteImages(noteImages, spriteSet);
            syncHoldRenderer(this, "_holdHeadSpriteRenderer", spriteSet.holdHead);
            syncHoldRenderer(this, "_holdSpriteRenderer", spriteSet.holdBody);
            syncHoldRenderer(this, "_holdEndSpriteRenderer1", spriteSet.holdEnd);

            console.log(`[note-texture] Hold instance synced (${spriteSet === loadedSprites.multi ? "multi" : "normal"})`);
        } catch (e) {
            console.log(`[note-texture] failed Hold instance sync: ${e}`);
        }
    };

    LevelControl.method("Awake", 0).implementation = function (this: any): void {
        this.method("Awake").invoke();

        if (replacedOnce) {
            return;
        }
        replacedOnce = true;

        loadedSprites = {
            normal: loadSpriteSet(NOTE_TEXTURES.normal),
            multi: loadSpriteSet(NOTE_TEXTURES.multi)
        };

        try {
            this.field("ClickHL").value = loadedSprites.multi.click;
            console.log(`[note-texture] ClickHL <= ${NOTE_TEXTURES.multi.click}`);
        } catch (e) {
            console.log(`[note-texture] failed ClickHL <= ${NOTE_TEXTURES.multi.click}: ${e}`);
        }

        try {
            this.field("HoldHL0").value = loadedSprites.multi.holdHead;
            console.log(`[note-texture] HoldHL0(head) <= ${NOTE_TEXTURES.multi.holdHead}`);
        } catch (e) {
            console.log(`[note-texture] failed HoldHL0 <= ${NOTE_TEXTURES.multi.holdHead}: ${e}`);
        }

        try {
            this.field("HoldHL1").value = loadedSprites.multi.holdBody;
            console.log(`[note-texture] HoldHL1(body) <= ${NOTE_TEXTURES.multi.holdBody}`);
        } catch (e) {
            console.log(`[note-texture] failed HoldHL1 <= ${NOTE_TEXTURES.multi.holdBody}: ${e}`);
        }

        try {
            this.field("DragHL").value = loadedSprites.multi.drag;
            console.log(`[note-texture] DragHL <= ${NOTE_TEXTURES.multi.drag}`);
        } catch (e) {
            console.log(`[note-texture] failed DragHL <= ${NOTE_TEXTURES.multi.drag}: ${e}`);
        }

        try {
            this.field("FlickHL").value = loadedSprites.multi.flick;
            console.log(`[note-texture] FlickHL <= ${NOTE_TEXTURES.multi.flick}`);
        } catch (e) {
            console.log(`[note-texture] failed FlickHL <= ${NOTE_TEXTURES.multi.flick}: ${e}`);
        }

        try {
            replacePrefabNoteImage(this.field("Click").value, ClickControl, loadedSprites.normal.click);
            console.log(`[note-texture] Click(normal) <= ${NOTE_TEXTURES.normal.click}`);
        } catch (e) {
            console.log(`[note-texture] failed Click prefab replace: ${e}`);
        }

        try {
            replacePrefabNoteImage(this.field("Drag").value, DragControl, loadedSprites.normal.drag);
            console.log(`[note-texture] Drag(normal) <= ${NOTE_TEXTURES.normal.drag}`);
        } catch (e) {
            console.log(`[note-texture] failed Drag prefab replace: ${e}`);
        }

        try {
            replacePrefabNoteImage(this.field("Flick").value, FlickControl, loadedSprites.normal.flick);
            console.log(`[note-texture] Flick(normal) <= ${NOTE_TEXTURES.normal.flick}`);
        } catch (e) {
            console.log(`[note-texture] failed Flick prefab replace: ${e}`);
        }

        try {
            replaceHoldPrefabNoteImages(this.field("Hold").value, HoldControl, loadedSprites.normal);
            console.log(`[note-texture] Hold(normal) head/body/end <= ${NOTE_TEXTURES.normal.holdHead} | ${NOTE_TEXTURES.normal.holdBody} | ${NOTE_TEXTURES.normal.holdEnd}`);
        } catch (e) {
            console.log(`[note-texture] failed Hold prefab replace: ${e}`);
        }
    };

    console.log("[note-texture] hook installed at LevelControl.Awake and HoldControl.NoteMove");
});
