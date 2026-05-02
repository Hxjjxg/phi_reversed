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
const pinnedManagedHandles = new Set<string>();
const pinnedGcHandles: any[] = [];
let unityObjectClassCache: any | null = null;
let unityObjectImplicitMethodCache: any | null = null;

function isEngineAliveUnityObject(obj: any): boolean {
    try {
        if (!unityObjectClassCache) {
            unityObjectClassCache = resolveClass("UnityEngine.Object", ["UnityEngine.CoreModule"]);
        }

        if (!unityObjectImplicitMethodCache) {
            unityObjectImplicitMethodCache = unityObjectClassCache
                .method("op_Implicit")
                .overload("UnityEngine.Object");
        }

        return !!unityObjectImplicitMethodCache.invoke(obj);
    } catch {
        // If implicit check is unavailable, do not block fallback path.
        return true;
    }
}

function isLiveUnityObject(obj: any): boolean {
    if (!obj) {
        return false;
    }

    try {
        if (obj.isNull?.()) {
            return false;
        }
    } catch {
        return false;
    }

    try {
        if (!obj.handle) {
            return false;
        }
    } catch {
        return false;
    }

    try {
        if (!isEngineAliveUnityObject(obj)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

function hasManagedHandle(obj: any): boolean {
    if (!obj) {
        return false;
    }

    try {
        return !!obj.handle;
    } catch {
        return false;
    }
}

function pinManagedReference(obj: any, tag: string): void {
    if (!hasManagedHandle(obj)) {
        return;
    }

    const key = obj.handle?.toString?.();
    if (!key || pinnedManagedHandles.has(key)) {
        return;
    }

    try {
        const GCHandle = Il2Cpp.corlib.class("System.Runtime.InteropServices.GCHandle");
        const handle = GCHandle.method("Alloc").overload("System.Object").invoke(obj);
        pinnedGcHandles.push(handle);
        pinnedManagedHandles.add(key);
    } catch (e) {
        console.log(`[note-texture] GCHandle pin failed (${tag}): ${e}`);
    }
}

function fileSignature(path: string): string {
    try {
        const bytes = readLocalBytes(path);
        const len = bytes.length;
        if (len === 0) {
            return "0:0";
        }

        // Lightweight sample checksum (not cryptographic).
        let acc = 0;
        const step = Math.max(1, Math.floor(len / 64));
        for (let i = 0; i < len; i += step) {
            acc = (acc + bytes[i]) >>> 0;
        }

        return `${len}:${acc.toString(16)}`;
    } catch (e) {
        return `err:${e}`;
    }
}

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
    pinManagedReference(texture, `texture:${imagePath}`);

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
    if (sprite) {
        let dead = false;
        try {
            dead = sprite.isNull?.() === true;
        } catch {
            dead = true;
        }

        if (dead) {
            spriteCache.delete(cacheKey);
            sprite = null;
            console.log(`[note-texture] cached sprite dead, rebuilding: ${cacheKey}`);
        }
    }

    if (!sprite) {
        sprite = createCustomSprite(imagePath, templateSprite);
        spriteCache.set(cacheKey, sprite);
    }

    pinManagedReference(sprite, cacheKey);

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

Il2Cpp.perform(() => {
    const AssemblyCSharp = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const LevelControl = AssemblyCSharp.class("LevelControl");
    const JudgeLineControl = AssemblyCSharp.class("JudgeLineControl");
    const ClickControl = AssemblyCSharp.class("ClickControl");
    const DragControl = AssemblyCSharp.class("DragControl");
    const FlickControl = AssemblyCSharp.class("FlickControl");
    const HoldControl = AssemblyCSharp.class("HoldControl");
    const UiChange = AssemblyCSharp.tryClass("UiChange");
    const UnitySprite = resolveClass("UnityEngine.Sprite", ["UnityEngine.CoreModule"]);
    const SpriteRendererClass = resolveClass("UnityEngine.SpriteRenderer", ["UnityEngine.CoreModule"]);

    let loadedSprites: { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } | null = null;
    let tailIdentityLogged = false;
    let createNoteTailPatchCount = 0;
    let createNoteTailMissCount = 0;
    let createNoteTailTraceCount = 0;
    let separateTailFallbackCount = 0;
    let noteMoveTraceCount = 0;
    let tailSetSpriteTraceCount = 0;
    const trackedHoldDebug = new Map<string, { expectedTail: any; noteIndex: number; ifAbove: boolean; noteTime: number; floor: number }>();
    const trackedTailRenderers = new Set<string>();

    const sameObject = (a: any, b: any): boolean => {
        if (!a || !b) {
            return false;
        }

        const ah = a.handle ?? a;
        const bh = b.handle ?? b;
        if (!ah || !bh) {
            return false;
        }

        try {
            if (typeof ah.equals === "function") {
                return ah.equals(bh);
            }
        } catch {
        }

        try {
            return ah.toString() === bh.toString();
        } catch {
            return false;
        }
    };

    const getHandleString = (obj: any): string => {
        try {
            return obj?.handle?.toString?.() ?? "0x0";
        } catch {
            return "<err>";
        }
    };

    const safeGetSpriteFromRenderer = (renderer: any): any | null => {
        try {
            if (!renderer || renderer.isNull?.()) {
                return null;
            }

            return renderer.method("get_sprite").overload().invoke();
        } catch {
            return null;
        }
    };

    const classifyTailSprite = (sprite: any): string => {
        if (!sprite || sprite.isNull?.()) {
            return "null";
        }

        if (!loadedSprites) {
            return "unknown";
        }

        if (sameObject(sprite, loadedSprites.multi.holdEnd)) {
            return "multi";
        }

        if (sameObject(sprite, loadedSprites.normal.holdEnd)) {
            return "normal";
        }

        return "other";
    };

    const getHoldNoteImagesTail = (holdControl: any): any | null => {
        try {
            const noteImages = holdControl.field("noteImages").value;
            if (!noteImages || noteImages.isNull?.() || noteImages.length < 3) {
                return null;
            }

            return noteImages.get(2);
        } catch {
            return null;
        }
    };

    const getHoldDebugMeta = (holdControl: any): { noteTime: number; floor: number } => {
        try {
            const noteInfor = holdControl.field("noteInfor").value;
            if (!noteInfor || noteInfor.isNull?.()) {
                return { noteTime: Number.NaN, floor: Number.NaN };
            }

            return {
                noteTime: Number(noteInfor.field("time").value),
                floor: Number(noteInfor.field("floorPosition").value)
            };
        } catch {
            return { noteTime: Number.NaN, floor: Number.NaN };
        }
    };

    const getListCount = (listObject: any): number => {
        if (!listObject || listObject.isNull?.()) {
            return 0;
        }

        try {
            return Number(listObject.method("get_Count", 0).invoke());
        } catch {
            return 0;
        }
    };

    const getListItem = (listObject: any, index: number): any | null => {
        if (!listObject || listObject.isNull?.() || index < 0) {
            return null;
        }

        try {
            return listObject.method("get_Item", 1).invoke(index);
        } catch {
            return null;
        }
    };

    const getNoteList = (judgeLine: any, ifAbove: boolean): any | null => {
        try {
            const listObject = judgeLine.field(ifAbove ? "notesAbove" : "notesBelow").value;
            return listObject && !listObject.isNull?.() ? listObject : null;
        } catch {
            return null;
        }
    };

    const getChartNoteAt = (judgeLine: any, thisIndex: number, ifAbove: boolean): any | null => {
        const noteList = getNoteList(judgeLine, ifAbove);
        if (!noteList) {
            return null;
        }

        const count = getListCount(noteList);
        if (thisIndex < 0 || thisIndex >= count) {
            return null;
        }

        return getListItem(noteList, thisIndex);
    };

    const isHoldChartNote = (chartNote: any): boolean => {
        try {
            return Number(chartNote.field("type").value) === 3;
        } catch {
            return false;
        }
    };

    const isChordHoldAtIndex = (judgeLine: any, thisIndex: number, ifAbove: boolean): boolean => {
        try {
            if (!judgeLine.field("chordSupport").value) {
                return false;
            }
        } catch {
            return false;
        }

        const noteList = getNoteList(judgeLine, ifAbove);
        if (!noteList) {
            return false;
        }

        const currentNote = getListItem(noteList, thisIndex);
        if (!currentNote || currentNote.isNull?.()) {
            return false;
        }

        let currentFloor = Number.NaN;
        try {
            currentFloor = Number(currentNote.field("floorPosition").value);
        } catch {
            return false;
        }

        if (!Number.isFinite(currentFloor)) {
            return false;
        }

        const prevNote = getListItem(noteList, thisIndex - 1);
        if (prevNote && !prevNote.isNull?.()) {
            try {
                const prevFloor = Number(prevNote.field("floorPosition").value);
                if (Math.abs(prevFloor - currentFloor) < 0.001) {
                    return true;
                }
            } catch {
            }
        }

        const nextNote = getListItem(noteList, thisIndex + 1);
        if (nextNote && !nextNote.isNull?.()) {
            try {
                const nextFloor = Number(nextNote.field("floorPosition").value);
                if (Math.abs(nextFloor - currentFloor) < 0.001) {
                    return true;
                }
            } catch {
            }
        }

        return false;
    };

    const ensureLoadedSprites = (levelControl: any): { normal: LoadedNoteSpriteSet; multi: LoadedNoteSpriteSet } => {
        if (loadedSprites) {
            return loadedSprites;
        }

        const templates = collectTemplateSprites(levelControl, ClickControl, DragControl, FlickControl, HoldControl);
        loadedSprites = resolveTailModeSprites(templates);

        pinManagedReference(loadedSprites.normal.holdEnd, "normal:holdEnd");
        pinManagedReference(loadedSprites.multi.holdEnd, "multi:holdEnd");

        if (!tailIdentityLogged) {
            tailIdentityLogged = true;
            const normalTail = loadedSprites.normal.holdEnd;
            const multiTail = loadedSprites.multi.holdEnd;
            console.log(
                `[note-texture] tail identity normal=${normalTail?.handle} multi=${multiTail?.handle} same=${sameObject(normalTail, multiTail)} fileSig(normal=${fileSignature(NOTE_TEXTURES.normal.holdEnd)}, multi=${fileSignature(NOTE_TEXTURES.multi.holdEnd)})`
            );
        }

        return loadedSprites;
    };

    const getSeparateMultiTailSprite = (): any | null => {
        if (!loadedSprites) {
            return null;
        }

        if (Number(HOLD_TAIL_MODE) !== HOLD_TAIL_MODE_SEPARATE) {
            return loadedSprites.multi.holdEnd ?? loadedSprites.normal.holdEnd;
        }

        if (hasManagedHandle(loadedSprites.multi.holdEnd)) {
            return loadedSprites.multi.holdEnd;
        }

        if (separateTailFallbackCount < 20) {
            separateTailFallbackCount++;
            console.log(
                `[note-texture][trace] separate tail fallback to normal because multi tail has no usable handle: multi=${getHandleString(loadedSprites.multi.holdEnd)} normal=${getHandleString(loadedSprites.normal.holdEnd)}`
            );
        }

        return loadedSprites.normal.holdEnd;
    };

    const findCreatedHoldControl = (noteUpdateManager: any, judgeLine: any, targetNote: any, beforeCount: number): any | null => {
        if (!noteUpdateManager || noteUpdateManager.isNull?.()) {
            return null;
        }

        let holdControls: any = null;
        try {
            holdControls = noteUpdateManager.field("holdControls").value;
        } catch {
            return null;
        }

        const count = getListCount(holdControls);
        if (count <= 0) {
            return null;
        }

        if (count > beforeCount) {
            const lastCreated = getListItem(holdControls, count - 1);
            if (lastCreated && !lastCreated.isNull?.()) {
                try {
                    if (
                        sameObject(lastCreated.field("judgeLine").value, judgeLine) &&
                        sameObject(lastCreated.field("noteInfor").value, targetNote)
                    ) {
                        return lastCreated;
                    }
                } catch {
                }
            }
        }

        for (let index = count - 1; index >= 0; index--) {
            const holdControl = getListItem(holdControls, index);
            if (!holdControl || holdControl.isNull?.()) {
                continue;
            }

            try {
                if (
                    sameObject(holdControl.field("judgeLine").value, judgeLine) &&
                    sameObject(holdControl.field("noteInfor").value, targetNote)
                ) {
                    return holdControl;
                }
            } catch {
            }
        }

        return null;
    };

    const applyTailToHoldInstance = (holdControl: any, tailSprite: any): boolean => {
        if (!holdControl || holdControl.isNull?.() || !hasManagedHandle(tailSprite)) {
            return false;
        }

        try {
            const noteImages = holdControl.field("noteImages").value;
            if (!noteImages || noteImages.isNull?.() || noteImages.length < 2) {
                return false;
            }

            if (noteImages.length >= 3) {
                noteImages.set(2, tailSprite);
                holdControl.field("noteImages").value = noteImages;
            } else {
                const expanded = Il2Cpp.array(UnitySprite, [noteImages.get(0), noteImages.get(1), tailSprite]);
                holdControl.field("noteImages").value = expanded;
            }
        } catch {
            return false;
        }

        try {
            const tailGo = holdControl.field("holdEnd").value;
            if (tailGo && !tailGo.isNull?.()) {
                tailGo.method("SetActive").overload("System.Boolean").invoke(true);
            }
        } catch {
        }

        try {
            const tailRenderer = holdControl.field("_holdEndSpriteRenderer1").value;
            if (tailRenderer && !tailRenderer.isNull?.()) {
                tailRenderer.method("set_enabled").overload("System.Boolean").invoke(true);
                tailRenderer.method("set_sprite").overload("UnityEngine.Sprite").invoke(tailSprite);
            }
        } catch {
        }

        return true;
    };

    const patchCreatedMultiHoldTail = (judgeLine: any, thisIndex: number, ifAbove: boolean, beforeCount: number): void => {
        if (Number(HOLD_TAIL_MODE) !== HOLD_TAIL_MODE_SEPARATE || !loadedSprites) {
            return;
        }

        const noteUpdateManager = judgeLine.field("_noteUpdateManager").value;
        if (!noteUpdateManager || noteUpdateManager.isNull?.()) {
            return;
        }

        let holdCountAfter = 0;
        try {
            holdCountAfter = getListCount(noteUpdateManager.field("holdControls").value);
        } catch {
            holdCountAfter = 0;
        }

        const chartNote = getChartNoteAt(judgeLine, thisIndex, ifAbove);
        if (!chartNote || chartNote.isNull?.() || !isHoldChartNote(chartNote)) {
            return;
        }

        if (!isChordHoldAtIndex(judgeLine, thisIndex, ifAbove)) {
            return;
        }

        const holdControl = findCreatedHoldControl(noteUpdateManager, judgeLine, chartNote, beforeCount);
        if (!holdControl) {
            if (createNoteTailMissCount < 30) {
                createNoteTailMissCount++;
                console.log(
                    `[note-texture] CreateNote tail patch missed instance (#${createNoteTailMissCount}, index=${thisIndex}, ifAbove=${ifAbove})`
                );
            }
            return;
        }

        const tailSprite = getSeparateMultiTailSprite();
        if (!tailSprite) {
            return;
        }

        const beforeTail = getHoldNoteImagesTail(holdControl);
        const debugMeta = getHoldDebugMeta(holdControl);

        if (applyTailToHoldInstance(holdControl, tailSprite)) {
            createNoteTailPatchCount++;
            const holdKey = getHandleString(holdControl);
            trackedHoldDebug.set(holdKey, {
                expectedTail: tailSprite,
                noteIndex: thisIndex,
                ifAbove,
                noteTime: debugMeta.noteTime,
                floor: debugMeta.floor
            });

            const afterTail = getHoldNoteImagesTail(holdControl);
            const tailRenderer = holdControl.field("_holdEndSpriteRenderer1").value;
            const rendererSprite = safeGetSpriteFromRenderer(tailRenderer);
            const rendererKey = getHandleString(tailRenderer);
            if (rendererKey !== "0x0" && rendererKey !== "<err>") {
                trackedTailRenderers.add(rendererKey);
            }

            if (createNoteTailPatchCount <= 100) {
                console.log(
                    `[note-texture] CreateNote patched multi hold tail (#${createNoteTailPatchCount}, hold=${holdControl.handle})`
                );
            }

            if (createNoteTailTraceCount < 60) {
                createNoteTailTraceCount++;
                console.log(
                    `[note-texture][trace] CreateNote patch details hold=${holdKey} index=${thisIndex} ifAbove=${ifAbove} holdCount=${beforeCount}->${holdCountAfter} noteTime=${debugMeta.noteTime} floor=${debugMeta.floor} targetTail=${getHandleString(tailSprite)}(${classifyTailSprite(tailSprite)}) beforeTail=${getHandleString(beforeTail)}(${classifyTailSprite(beforeTail)}) afterTail=${getHandleString(afterTail)}(${classifyTailSprite(afterTail)}) renderer=${rendererKey} rendererSprite=${getHandleString(rendererSprite)}(${classifyTailSprite(rendererSprite)})`
                );
            }
        }
    };

    LevelControl.method("Awake", 0).implementation = function (this: any): void {
        this.method("Awake", 0).invoke();

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
            this.method("OnEnable", 0).invoke();

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

    JudgeLineControl.method("CreateNote", 2).implementation = function (this: any, thisIndex: number, ifAbove: boolean): void {
        const index = Number(thisIndex);
        const above = !!ifAbove;
        let shouldPatchTail = false;
        let holdCountBefore = 0;

        try {
            if (Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_SEPARATE && loadedSprites) {
                const chartNote = getChartNoteAt(this, index, above);
                if (chartNote && !chartNote.isNull?.() && isHoldChartNote(chartNote)) {
                    shouldPatchTail = true;
                    const noteUpdateManager = this.field("_noteUpdateManager").value;
                    const holdControls = noteUpdateManager?.field("holdControls").value;
                    holdCountBefore = getListCount(holdControls);
                }
            }
        } catch {
        }

        this.method("CreateNote", 2).invoke(thisIndex, ifAbove);

        if (!shouldPatchTail) {
            return;
        }

        try {
            patchCreatedMultiHoldTail(this, index, above, holdCountBefore);
        } catch (e) {
            console.log(`[note-texture] CreateNote tail patch failed: ${e}`);
        }
    };

    HoldControl.method("NoteMove", 0).implementation = function (this: any): void {
        const holdKey = getHandleString(this);
        const debugMeta = trackedHoldDebug.get(holdKey) ?? null;

        if (debugMeta && noteMoveTraceCount < 80) {
            const beforeTail = getHoldNoteImagesTail(this);
            const beforeRenderer = this.field("_holdEndSpriteRenderer1").value;
            const beforeRendererSprite = safeGetSpriteFromRenderer(beforeRenderer);
            console.log(
                `[note-texture][trace] NoteMove before hold=${holdKey} index=${debugMeta.noteIndex} ifAbove=${debugMeta.ifAbove} noteTime=${debugMeta.noteTime} floor=${debugMeta.floor} expected=${getHandleString(debugMeta.expectedTail)}(${classifyTailSprite(debugMeta.expectedTail)}) noteTail=${getHandleString(beforeTail)}(${classifyTailSprite(beforeTail)}) renderer=${getHandleString(beforeRenderer)} rendererSprite=${getHandleString(beforeRendererSprite)}(${classifyTailSprite(beforeRendererSprite)})`
            );
            noteMoveTraceCount++;
        }

        this.method("NoteMove", 0).invoke();

        if (debugMeta && noteMoveTraceCount < 80) {
            const afterTail = getHoldNoteImagesTail(this);
            const afterRenderer = this.field("_holdEndSpriteRenderer1").value;
            const afterRendererKey = getHandleString(afterRenderer);
            const afterRendererSprite = safeGetSpriteFromRenderer(afterRenderer);

            if (afterRendererKey !== "0x0" && afterRendererKey !== "<err>") {
                trackedTailRenderers.add(afterRendererKey);
            }

            console.log(
                `[note-texture][trace] NoteMove after hold=${holdKey} index=${debugMeta.noteIndex} ifAbove=${debugMeta.ifAbove} noteTime=${debugMeta.noteTime} floor=${debugMeta.floor} expected=${getHandleString(debugMeta.expectedTail)}(${classifyTailSprite(debugMeta.expectedTail)}) noteTail=${getHandleString(afterTail)}(${classifyTailSprite(afterTail)}) renderer=${afterRendererKey} rendererSprite=${getHandleString(afterRendererSprite)}(${classifyTailSprite(afterRendererSprite)})`
            );
            noteMoveTraceCount++;
        }
    };

    SpriteRendererClass.method("set_sprite")
        .overload("UnityEngine.Sprite")
        .implementation = function (this: any, sprite: any): void {
            const rendererKey = getHandleString(this);
            const traced = trackedTailRenderers.has(rendererKey);
            const beforeSprite = traced ? safeGetSpriteFromRenderer(this) : null;

            this.method("set_sprite").overload("UnityEngine.Sprite").invoke(sprite);

            if (traced && tailSetSpriteTraceCount < 80) {
                const afterSprite = safeGetSpriteFromRenderer(this);
                console.log(
                    `[note-texture][trace] tail renderer set_sprite renderer=${rendererKey} arg=${getHandleString(sprite)}(${classifyTailSprite(sprite)}) before=${getHandleString(beforeSprite)}(${classifyTailSprite(beforeSprite)}) after=${getHandleString(afterSprite)}(${classifyTailSprite(afterSprite)})`
                );
                tailSetSpriteTraceCount++;
            }
        };

    console.log(
        `[note-texture] hook installed at LevelControl.Awake + UiChange.OnEnable + JudgeLineControl.CreateNote + HoldControl.NoteMove(trace) (tail mode=${HOLD_TAIL_MODE})`
    );
});
