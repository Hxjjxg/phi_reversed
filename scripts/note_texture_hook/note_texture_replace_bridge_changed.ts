import "frida-il2cpp-bridge";

declare const Il2Cpp: any;
declare const Process: any;
declare const Memory: any;
declare const Arm64Writer: any;
declare const ptr: any;

type NativePointer = any;

type NoteSpritePathSet = {
    click: string;
    drag: string;
    flick: string;
    holdHead: string;
    holdBody: string;
    holdEnd: string;
};

type LoadedNoteSpriteSet = {
    click: any;
    drag: any;
    flick: any;
    holdHead: any;
    holdBody: any;
    holdEnd: any | null;
};

type HoldTailMode = 1 | 2 | 3;

const HOLD_TAIL_MODE_NONE: HoldTailMode = 1;
const HOLD_TAIL_MODE_SHARED: HoldTailMode = 2;
const HOLD_TAIL_MODE_SEPARATE: HoldTailMode = 3;

const ARM64_B_MIN = -0x08000000n;
const ARM64_B_MAX = 0x07fffffcn;

// 1: do not use hold tail
// 2: normal/multi share hold_end.png
// 3: normal/multi use different hold tail sprites
let HOLD_TAIL_MODE: HoldTailMode = HOLD_TAIL_MODE_SEPARATE;

const NOTE_TEXTURES: { normal: NoteSpritePathSet; multi: NoteSpritePathSet } = {
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

function clamp01(value: number): number {
    if (value < 0) {
        return 0;
    }

    if (value > 1) {
        return 1;
    }

    return value;
}

function readStructNumber(structObj: any, fieldName: string): number {
    try {
        const value = structObj.field(fieldName).value;
        return Number(value);
    } catch {
        try {
            const value = structObj.method(`get_${fieldName}`).invoke();
            return Number(value);
        } catch {
            return Number.NaN;
        }
    }
}

function getSpriteCreateParams(templateSprite: any): { pivotX: number; pivotY: number; pixelsPerUnit: number } {
    let pivotX = 0.5;
    let pivotY = 0.5;
    let pixelsPerUnit = 100;

    if (!templateSprite || templateSprite.isNull?.()) {
        return { pivotX, pivotY, pixelsPerUnit };
    }

    try {
        const ppu = Number(templateSprite.method("get_pixelsPerUnit").invoke());
        if (Number.isFinite(ppu) && ppu > 0) {
            pixelsPerUnit = ppu;
        }
    } catch {
    }

    try {
        const pivot = templateSprite.method("get_pivot").invoke();
        const rect = templateSprite.method("get_rect").invoke();

        const pivotPixelsX = readStructNumber(pivot, "x");
        const pivotPixelsY = readStructNumber(pivot, "y");
        const rectWidth = readStructNumber(rect, "width");
        const rectHeight = readStructNumber(rect, "height");

        if (
            Number.isFinite(pivotPixelsX) &&
            Number.isFinite(pivotPixelsY) &&
            Number.isFinite(rectWidth) &&
            Number.isFinite(rectHeight) &&
            rectWidth > 0 &&
            rectHeight > 0
        ) {
            pivotX = clamp01(pivotPixelsX / rectWidth);
            pivotY = clamp01(pivotPixelsY / rectHeight);
        }
    } catch {
    }

    return { pivotX, pivotY, pixelsPerUnit };
}

function createCustomSprite(imagePath: string, templateSprite: any = null): any {
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

    const params = getSpriteCreateParams(templateSprite);
    const pivot = Vector2.alloc();
    pivot.method(".ctor").overload("System.Single", "System.Single").invoke(params.pivotX, params.pivotY);

    return Sprite.method("Create")
        .overload("UnityEngine.Texture2D", "UnityEngine.Rect", "UnityEngine.Vector2", "System.Single")
        .invoke(texture, rect.unbox(), pivot.unbox(), params.pixelsPerUnit);
}

function getOrCreateSprite(cacheKey: string, imagePath: string, templateSprite: any): any {
    let sprite = spriteCache.get(cacheKey);
    if (!sprite) {
        sprite = createCustomSprite(imagePath, templateSprite);
        spriteCache.set(cacheKey, sprite);
    }
    return sprite;
}

function loadSpriteSet(prefix: string, paths: NoteSpritePathSet, templates: LoadedNoteSpriteSet): LoadedNoteSpriteSet {
    return {
        click: getOrCreateSprite(`${prefix}:click:${paths.click}`, paths.click, templates.click),
        drag: getOrCreateSprite(`${prefix}:drag:${paths.drag}`, paths.drag, templates.drag),
        flick: getOrCreateSprite(`${prefix}:flick:${paths.flick}`, paths.flick, templates.flick),
        holdHead: getOrCreateSprite(`${prefix}:holdHead:${paths.holdHead}`, paths.holdHead, templates.holdHead),
        holdBody: getOrCreateSprite(`${prefix}:holdBody:${paths.holdBody}`, paths.holdBody, templates.holdBody),
        holdEnd: getOrCreateSprite(`${prefix}:holdEnd:${paths.holdEnd}`, paths.holdEnd, templates.holdEnd)
    };
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

function replacePrefabNoteImage(gameObject: any, componentClass: any, sprite: any): void {
    const component = getComponent(gameObject, componentClass);
    component.field("noteImage").value = sprite;
}

function applyHoldNoteImages(noteImages: any, sprites: LoadedNoteSpriteSet): void {
    if (!noteImages || noteImages.isNull?.()) {
        throw new Error("HoldControl.noteImages is null");
    }

    if (noteImages.length < 3) {
        throw new Error(`HoldControl.noteImages length=${noteImages.length}, expected >=3`);
    }

    // HoldControl.NoteMove reads index 0/1/2 as head/body/end respectively.
    noteImages.set(0, sprites.holdHead);
    noteImages.set(1, sprites.holdBody);

    // Do not write null into Unity Sprite[]: keep original tail slot when mode disables tail.
    if (sprites.holdEnd) {
        noteImages.set(2, sprites.holdEnd);
    }
}

function replaceHoldPrefabNoteImages(gameObject: any, holdControlClass: any, sprites: LoadedNoteSpriteSet): void {
    const component = getComponent(gameObject, holdControlClass);
    const noteImages = component.field("noteImages").value;
    applyHoldNoteImages(noteImages, sprites);
    component.field("noteImages").value = noteImages;
}

function getHoldPrefabImages(levelControl: any, holdControlClass: any): any {
    const holdPrefab = levelControl.field("Hold").value;
    const holdComponent = getComponent(holdPrefab, holdControlClass);
    return holdComponent.field("noteImages").value;
}

function collectTemplateSprites(levelControl: any, clickControl: any, dragControl: any, flickControl: any, holdControlClass: any): { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } {
    const clickNormal = getComponent(levelControl.field("Click").value, clickControl).field("noteImage").value;
    const dragNormal = getComponent(levelControl.field("Drag").value, dragControl).field("noteImage").value;
    const flickNormal = getComponent(levelControl.field("Flick").value, flickControl).field("noteImage").value;

    const holdImages = getHoldPrefabImages(levelControl, holdControlClass);
    if (!holdImages || holdImages.isNull?.() || holdImages.length < 3) {
        throw new Error("Hold prefab noteImages is invalid");
    }

    const holdEndShared = holdImages.get(2);

    return {
        normal: {
            click: clickNormal,
            drag: dragNormal,
            flick: flickNormal,
            holdHead: holdImages.get(0),
            holdBody: holdImages.get(1),
            holdEnd: holdEndShared
        },
        multi: {
            click: levelControl.field("ClickHL").value,
            drag: levelControl.field("DragHL").value,
            flick: levelControl.field("FlickHL").value,
            holdHead: levelControl.field("HoldHL0").value,
            holdBody: levelControl.field("HoldHL1").value,
            holdEnd: holdEndShared
        }
    };
}

function applyToLevelControl(levelControl: any, sprites: { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet }, clickControl: any, dragControl: any, flickControl: any, holdControlClass: any): void {
    levelControl.field("ClickHL").value = sprites.multi.click;
    levelControl.field("HoldHL0").value = sprites.multi.holdHead;
    levelControl.field("HoldHL1").value = sprites.multi.holdBody;
    levelControl.field("DragHL").value = sprites.multi.drag;
    levelControl.field("FlickHL").value = sprites.multi.flick;

    replacePrefabNoteImage(levelControl.field("Click").value, clickControl, sprites.normal.click);
    replacePrefabNoteImage(levelControl.field("Drag").value, dragControl, sprites.normal.drag);
    replacePrefabNoteImage(levelControl.field("Flick").value, flickControl, sprites.normal.flick);
    replaceHoldPrefabNoteImages(levelControl.field("Hold").value, holdControlClass, sprites.normal);

    const holdComponent = getComponent(levelControl.field("Hold").value, holdControlClass);
    const disableTail = Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_NONE;

    try {
        const tailGo = holdComponent.field("holdEnd").value;
        if (tailGo && !tailGo.isNull?.()) {
            tailGo.method("SetActive").overload("System.Boolean").invoke(!disableTail);
        }
    } catch {
    }

    try {
        const tailRenderer = holdComponent.field("_holdEndSpriteRenderer1").value;
        if (tailRenderer && !tailRenderer.isNull?.()) {
            tailRenderer.method("set_enabled").overload("System.Boolean").invoke(!disableTail);
        }
    } catch {
    }
}

function resolveTailModeSprites(templates: { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet }): { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } {
    const normal = loadSpriteSet("normal", NOTE_TEXTURES.normal, templates.normal);

    // Build multi from normal-tail baseline to improve robustness when not in separate-tail mode.
    const multiBasePaths: NoteSpritePathSet = {
        ...NOTE_TEXTURES.multi,
        holdEnd: NOTE_TEXTURES.normal.holdEnd
    };
    const multi = loadSpriteSet("multi", multiBasePaths, templates.multi);

    if (Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_NONE) {
        // Keep a valid sprite pointer in arrays; mode-1 visibility is controlled by renderer toggling.
        multi.holdEnd = normal.holdEnd;
        return { normal, multi };
    }

    if (Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_SHARED) {
        multi.holdEnd = normal.holdEnd;
        return { normal, multi };
    }

    // HOLD_TAIL_MODE_SEPARATE
    try {
        multi.holdEnd = getOrCreateSprite(
            `multi:holdEndSeparate:${NOTE_TEXTURES.multi.holdEnd}`,
            NOTE_TEXTURES.multi.holdEnd,
            templates.multi.holdEnd
        );
    } catch (e) {
        multi.holdEnd = normal.holdEnd;
        console.log(`[note-texture] separate multi hold tail load failed, fallback to shared tail: ${e}`);
    }

    return { normal, multi };
}

function tryGetParentLevelControl(uiChange: any, levelControlClass: any): any | null {
    const transform = uiChange.method("get_transform").invoke();
    if (!transform || transform.isNull?.()) {
        return null;
    }

    const parent = transform.method("get_parent").invoke();
    if (!parent || parent.isNull?.()) {
        return null;
    }

    const parentGameObject = parent.method("get_gameObject").invoke();
    if (!parentGameObject || parentGameObject.isNull?.()) {
        return null;
    }

    const levelControl = parentGameObject.method("GetComponent")
        .overload("System.Type")
        .invoke(levelControlClass.type.object);

    if (!levelControl || levelControl.isNull?.()) {
        return null;
    }

    return levelControl;
}

function pointerToBigInt(address: NativePointer): bigint {
    return BigInt(address.toString());
}

function isArm64BReachable(from: NativePointer, to: NativePointer): boolean {
    const delta = pointerToBigInt(to) - pointerToBigInt(from);
    return delta >= ARM64_B_MIN && delta <= ARM64_B_MAX && (delta & 0x3n) === 0n;
}

function allocCaveNear(hookAddr: NativePointer): NativePointer {
    const nearOptions = {
        near: hookAddr,
        maxDistance: Number(ARM64_B_MAX)
    };

    try {
        return (Memory as any).alloc(Process.pageSize, nearOptions);
    } catch (e) {
        console.log(`[note-texture] near cave alloc failed, fallback to default alloc: ${e}`);
        return Memory.alloc(Process.pageSize);
    }
}

Il2Cpp.perform(() => {
    const AssemblyCSharp = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const LevelControl = AssemblyCSharp.class("LevelControl");
    const ClickControl = AssemblyCSharp.class("ClickControl");
    const DragControl = AssemblyCSharp.class("DragControl");
    const FlickControl = AssemblyCSharp.class("FlickControl");
    const HoldControl = AssemblyCSharp.class("HoldControl");
    const UiChange = AssemblyCSharp.tryClass("UiChange");

    let loadedSprites: { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } | null = null;

    // Shared storage for the multi.holdEnd sprite pointer.
    // The code caves read from this address at runtime.
    // Initialized to NULL; updated when sprites load in LevelControl.Awake.
    const spritePtrSlot = Memory.alloc(8);
    spritePtrSlot.writePointer(ptr(0));

    const ensureLoadedSprites = (levelControl: any): { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } => {
        if (loadedSprites) {
            return loadedSprites;
        }

        const templates = collectTemplateSprites(levelControl, ClickControl, DragControl, FlickControl, HoldControl);

        loadedSprites = resolveTailModeSprites(templates);

        if (loadedSprites.multi.holdEnd) {
            spritePtrSlot.writePointer(loadedSprites.multi.holdEnd.handle);
        }

        return loadedSprites;
    };

    // ---------- Inline hooks (code-cave style) ----------
    //
    // In JudgeLineControl.CreateNote, when a Hold is detected as multi-press (chord),
    // the game writes:
    //   noteImages[0] = HoldHL0  (head)    — STR X20, [Xn, #0x20]
    //   noteImages[1] = HoldHL1  (body)    — STR X20, [Xn, #0x28]
    // but NEVER writes noteImages[2] (tail).
    //
    // We replace the second STR with a branch to a code cave that:
    //   1. Executes the original STR (noteImages[1] = HoldHL1)
    //   2. Loads the multi.holdEnd sprite pointer from spritePtrSlot
    //   3. If non-null, writes it to noteImages[2]  (array + 0x30)
    //   4. Branches back to the next original instruction
    //
    // This patches exactly ONE instruction (4 bytes) per path, so
    // the branch-target at LABEL_130 / LABEL_188 is never touched.
    //
    // Hook addresses (RVA):
    //   "above" path: 0x2397bb8  STR X20, [X22, #0x28]  → return to 0x2397bbc
    //   "below" path: 0x2397f64  STR X20, [X23, #0x28]  → return to 0x2397f68

    function installHoldEndCave(
        hookRva: number,
        noteImagesReg: string,
        returnRva: number
    ): void {
        const base = Il2Cpp.module.base;
        const hookAddr = base.add(hookRva);
        const returnAddr = base.add(returnRva);

        // Read the original 4-byte instruction before we overwrite it
        const originalBytes = hookAddr.readByteArray(4)!;

        // Allocate code cave
        const cave = allocCaveNear(hookAddr);

        if (!isArm64BReachable(hookAddr, cave)) {
            throw new Error(
                `hook->cave branch out of range (hook=${hookAddr}, cave=${cave})`
            );
        }

        if (!isArm64BReachable(cave, returnAddr)) {
            throw new Error(
                `cave->return branch out of range (cave=${cave}, return=${returnAddr})`
            );
        }

        const w = new Arm64Writer(cave, { pc: cave });

        // 1. Execute original: STR X20, [Xn, #0x28]
        w.putBytes(originalBytes);

        // 2. Load sprite pointer: X8 = *spritePtrSlot
        //    (Arm64Writer emits LDR X8, [PC, #literal] with the address in a
        //     literal pool appended after flush)
        w.putLdrRegAddress("x8", spritePtrSlot);
        w.putLdrRegRegOffset("x8", "x8", 0);

        // 3. Skip if sprite pointer is NULL
        w.putCbzRegLabel("x8", "skip");

        // 4. noteImages[2] = sprite  →  STR X8, [Xn, #0x30]
        (w as any).putStrRegRegOffset("x8", noteImagesReg, 0x30);

        // 5. Branch back to the instruction after the original STR
        w.putLabel("skip");
        w.putBImm(returnAddr);

        w.flush();

        // Make the cave executable (drop write permission)
        Memory.protect(cave, Process.pageSize, "r-x");

        // Patch the original STR with an unconditional B to the cave
        Memory.patchCode(hookAddr, 4, (code: NativePointer) => {
            const p = new Arm64Writer(code, { pc: hookAddr });
            p.putBImm(cave);
            p.flush();
        });

        console.log(
            `[note-texture] code cave installed: RVA 0x${hookRva.toString(16)} → ${cave} (reg=${noteImagesReg})`
        );
    }

    if (Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_SEPARATE) {
        let caveInstallFailed = false;

        try {
            // "above" path — noteImages in X22
            installHoldEndCave(0x2397bb8, "x22", 0x2397bbc);
        } catch (e) {
            caveInstallFailed = true;
            console.log(`[note-texture] failed cave install (above @ 0x2397bb8): ${e}`);
        }

        try {
            // "below" path — noteImages in X23
            installHoldEndCave(0x2397f64, "x23", 0x2397f68);
        } catch (e) {
            caveInstallFailed = true;
            console.log(`[note-texture] failed cave install (below @ 0x2397f64): ${e}`);
        }

        if (!caveInstallFailed) {
            console.log("[note-texture] code caves installed for multi hold tail (SEPARATE mode)");
        }
    }

    LevelControl.method("Awake", 0).implementation = function (this: any): void {
        this.method("Awake").invoke();

        try {
            const sprites = ensureLoadedSprites(this);
            applyToLevelControl(this, sprites, ClickControl, DragControl, FlickControl, HoldControl);
            console.log("[note-texture] reapplied textures at LevelControl.Awake");
        } catch (e) {
            console.log(`[note-texture] failed apply at LevelControl.Awake: ${e}`);
        }
    };

    if (UiChange) {
        UiChange.method("OnEnable", 0).implementation = function (this: any): void {
            this.method("OnEnable").invoke();

            try {
                const levelControl = tryGetParentLevelControl(this, LevelControl);
                if (!levelControl) {
                    return;
                }

                const sprites = ensureLoadedSprites(levelControl);
                applyToLevelControl(levelControl, sprites, ClickControl, DragControl, FlickControl, HoldControl);
                console.log("[note-texture] reapplied textures after UiChange.OnEnable");
            } catch (e) {
                console.log(`[note-texture] failed apply after UiChange.OnEnable: ${e}`);
            }
        };
    }

    console.log(`[note-texture] hook installed at LevelControl.Awake + UiChange.OnEnable (tail mode=${HOLD_TAIL_MODE})`);
});
