import "frida-il2cpp-bridge";

declare const Il2Cpp: any;

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

function syncMultiHoldTailOnce(instance: any, sprites: { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet }): void {
    const key = instance.handle?.toString?.() ?? "";
    if (!key || processedHolds.has(key)) {
        return;
    }

    const noteImages = instance.field("noteImages").value;
    if (!noteImages || noteImages.isNull?.() || noteImages.length < 3) {
        return;
    }

    if (Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_NONE) {
        const endRenderer = instance.field("_holdEndSpriteRenderer1").value;
        if (endRenderer && !endRenderer.isNull?.()) {
            endRenderer.method("set_enabled").overload("System.Boolean").invoke(false);
        }

        processedHolds.add(key);
        return;
    }

    const isMultiHead =
        sameObject(noteImages.get(0), sprites.multi.holdHead) ||
        sameObject(noteImages.get(1), sprites.multi.holdBody);

    const isNormalHead =
        sameObject(noteImages.get(0), sprites.normal.holdHead) ||
        sameObject(noteImages.get(1), sprites.normal.holdBody);

    // Wait until noteImages are initialized into either normal or multi signature.
    if (!isMultiHead && !isNormalHead) {
        return;
    }

    if (!isMultiHead) {
        processedHolds.add(key);
        return;
    }

    if (sprites.multi.holdEnd) {
        noteImages.set(2, sprites.multi.holdEnd);
    }
    instance.field("noteImages").value = noteImages;

    const endRenderer = instance.field("_holdEndSpriteRenderer1").value;
    if (endRenderer && !endRenderer.isNull?.() && sprites.multi.holdEnd) {
        endRenderer.method("set_enabled").overload("System.Boolean").invoke(true);
        endRenderer.method("set_sprite").overload("UnityEngine.Sprite").invoke(sprites.multi.holdEnd);
    }

    processedHolds.add(key);
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

Il2Cpp.perform(() => {
    const AssemblyCSharp = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const LevelControl = AssemblyCSharp.class("LevelControl");
    const ClickControl = AssemblyCSharp.class("ClickControl");
    const DragControl = AssemblyCSharp.class("DragControl");
    const FlickControl = AssemblyCSharp.class("FlickControl");
    const HoldControl = AssemblyCSharp.class("HoldControl");
    const UiChange = AssemblyCSharp.tryClass("UiChange");

    let loadedSprites: { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } | null = null;

    const ensureLoadedSprites = (levelControl: any): { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } => {
        if (loadedSprites) {
            return loadedSprites;
        }

        const templates = collectTemplateSprites(levelControl, ClickControl, DragControl, FlickControl, HoldControl);

        loadedSprites = resolveTailModeSprites(templates);

        return loadedSprites;
    };

    if (Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_SEPARATE || Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_NONE) {
        HoldControl.method("NoteMove", 0).implementation = function (this: any): void {
            this.method("NoteMove").invoke();

            try {
                if (!loadedSprites) {
                    return;
                }

                syncMultiHoldTailOnce(this, loadedSprites);
            } catch (e) {
                console.log(`[note-texture] failed multi hold tail sync: ${e}`);
            }
        };
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
