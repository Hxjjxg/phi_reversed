import "frida-il2cpp-bridge";

declare const Il2Cpp: any;

type JudgeKind = "perfect" | "good" | "bad" | "miss";

type OverlayState = {
    text: string;
    ttl: number;
    overlayText: any | null;
};

const HUD_TTL_FRAMES = 45;
const MISS_TTL_FRAMES = 30;
const OVERLAY_NAME = "DeltaTOverlayText";
const OVERLAY_OFFSET_Y = -90;
const ACC_OVERLAY_NAME = "AccOverlayText";
const ACC_OFFSET_Y = -54;
const ACC_FONT_SCALE = 0.55;
const ACC_FONT_MIN_SIZE = 16;
const JUDGE_CORE_WIDTH = 4;
const JUDGE_OUTER_PAD = 2;
const DELTA_T_YELLOW_MAX_MS = 80;
const DELTA_T_BLUE_MAX_MS = 180;
const DELTA_T_COLOR_YELLOW = "#fdff9d";
const DELTA_T_COLOR_BLUE = "#B3ECFE";
const DELTA_T_COLOR_RED = "#f86159";

function resolveAssemblyCSharp(): any {
    const asm = Il2Cpp.domain.tryAssembly("Assembly-CSharp");
    if (!asm) {
        throw new Error("Assembly-CSharp not found");
    }
    return asm;
}

function centerText(text: string, width: number): string {
    if (text.length >= width) {
        return text;
    }

    const totalPadding = width - text.length;
    const leftPadding = Math.floor(totalPadding / 2);
    const rightPadding = totalPadding - leftPadding;
    return `${" ".repeat(leftPadding)}${text}${" ".repeat(rightPadding)}`;
}

function formatJudgeTimeMs(judgeTime: number): string {
    const ms = Math.round(judgeTime * 1000);
    const signed = `${ms >= 0 ? "+" : "-"}${Math.abs(ms)}`;
    const core = centerText(signed, JUDGE_CORE_WIDTH);
    const outerPad = " ".repeat(JUDGE_OUTER_PAD + 2);
    // negative => [◄][ ][core x4][    ]
    // positive => [    ][core x4][ ][►]
    if (ms < 0) {
        return `◄ ${core}${outerPad}`;
    }
    return `${outerPad}${core} ►`;
}

function getJudgeTimeColor(judgeTime: number): string {
    const ms = Math.abs(Math.round(judgeTime * 1000));
    if (ms <= DELTA_T_YELLOW_MAX_MS) {
        return DELTA_T_COLOR_YELLOW;
    }
    if (ms <= DELTA_T_BLUE_MAX_MS) {
        return DELTA_T_COLOR_BLUE;
    }
    return DELTA_T_COLOR_RED;
}

function colorizeJudgeTime(text: string, judgeTime: number): string {
    return `<color=${getJudgeTimeColor(judgeTime)}>${text}</color>`;
}

function colorizeRed(text: string): string {
    return `<color=${DELTA_T_COLOR_RED}>${text}</color>`;
}

function makeOverlayText(kind: JudgeKind, judgeTime?: number): string {
    if (kind === "miss") {
        return colorizeRed("MISS");
    }
    if (kind === "bad") {
        return colorizeRed("BAD");
    }
    const safeJudgeTime = judgeTime ?? 0;
    return colorizeJudgeTime(formatJudgeTimeMs(safeJudgeTime), safeJudgeTime);
}

function formatAccuracyText(percent: number): string {
    const safe = Number.isFinite(percent) ? percent : 0;
    // percent is 0..1 ratio, display as percentage
    const normalized = safe > 0 && safe <= 1.0001 ? safe * 100 : safe;
    return `acc=${normalized.toFixed(2)}%`;
}

function computeAccuracy(thisObj: any): number {
    const good = Number(thisObj.field("good").value ?? 0);
    const perfect = Number(thisObj.field("perfect").value ?? 0);
    const bad = Number(thisObj.field("bad").value ?? 0);
    const miss = Number(thisObj.field("miss").value ?? 0);
    const total = good + perfect + bad + miss;
    if (total === 0) return 0;
    // weighted accuracy: good gets 65%, perfect gets 100%
    return (good * 0.65 + perfect) / total;
}

function safeSetText(textObject: any, content: string): void {
    if (!textObject) {
        return;
    }
    try {
        textObject.method("set_text", 1).invoke(Il2Cpp.string(content));
    } catch {
        // Object can be destroyed between scenes; ignore and recreate later.
    }
}

Il2Cpp.perform(() => {
    const AssemblyCSharp = resolveAssemblyCSharp();
    const UnityCore = Il2Cpp.domain.assembly("UnityEngine.CoreModule");
    const UnityObject = UnityCore.image.class("UnityEngine.Object");
    const instantiateObjectMethod = UnityObject.method("Instantiate", 1).overload("UnityEngine.Object");

    const ScoreControl = AssemblyCSharp.image.class("ScoreControl");

    const perfectMethod = ScoreControl.method("Perfect", 4);
    const goodMethod = ScoreControl.method("Good", 4);
    const badMethod = ScoreControl.method("Bad", 2);
    const missMethod = ScoreControl.method("Miss", 1);
    const updateMethod = ScoreControl.method("Update", 0);

    const overlayState = new Map<string, OverlayState>();
    const accTextState = new Map<string, any>();

    function tryAttachOverlay(referenceText: any, overlayText: any): void {
        try {
            const referenceRect = referenceText.method("get_rectTransform", 0).invoke();
            const overlayRect = overlayText.method("get_rectTransform", 0).invoke();
            const parent = referenceRect.method("get_parent", 0).invoke();

            if (!parent) {
                return;
            }

            try {
                overlayRect.method("SetParent", 2).invoke(parent, false);
            } catch {
                overlayRect.method("set_parent", 1).invoke(parent);
            }

            try {
                const overlayGo = overlayText.method("get_gameObject", 0).invoke();
                overlayGo.method("SetActive", 1).invoke(true);
            } catch {
                // Ignore when SetActive is unavailable on this runtime variant.
            }

            try {
                overlayText.method("set_enabled", 1).invoke(true);
            } catch {
                // Ignore when Text.enable setter is unavailable.
            }
        } catch {
            // Keep clone default hierarchy if attach failed.
        }
    }

    function tryOffsetOverlay(referenceText: any, overlayText: any): void {
        try {
            const referenceRect = referenceText.method("get_rectTransform", 0).invoke();
            const overlayRect = overlayText.method("get_rectTransform", 0).invoke();
            const anchored = referenceRect.method("get_anchoredPosition", 0).invoke();

            anchored.field("y").value = Number(anchored.field("y").value) + OVERLAY_OFFSET_Y;
            overlayRect.method("set_anchoredPosition", 1).invoke(anchored);
        } catch {
            // Keep default clone position when RectTransform operation is unavailable.
        }
    }

    function tryOffsetOverlayWith(referenceText: any, overlayText: any, offsetY: number): void {
        try {
            const referenceRect = referenceText.method("get_rectTransform", 0).invoke();
            const overlayRect = overlayText.method("get_rectTransform", 0).invoke();
            const anchored = referenceRect.method("get_anchoredPosition", 0).invoke();

            anchored.field("y").value = Number(anchored.field("y").value) + offsetY;
            overlayRect.method("set_anchoredPosition", 1).invoke(anchored);
        } catch {
            // Keep default clone position when RectTransform operation is unavailable.
        }
    }

    function trySetSmallFont(referenceText: any, overlayText: any): void {
        try {
            const baseSize = Number(referenceText.method("get_fontSize", 0).invoke() ?? 0);
            if (baseSize > 0) {
                const small = Math.max(ACC_FONT_MIN_SIZE, Math.floor(baseSize * ACC_FONT_SCALE));
                overlayText.method("set_fontSize", 1).invoke(small);
            }
        } catch {
            // Keep default size when font-size API is unavailable.
        }
    }

    function tryEnableRichText(textObject: any): void {
        try {
            textObject.method("set_supportRichText", 1).invoke(true);
        } catch {
            try {
                textObject.method("set_richText", 1).invoke(true);
            } catch {
                // Ignore when rich-text API is unavailable on this runtime variant.
            }
        }
    }

    function ensureOverlayText(thisObj: any, state: OverlayState): any | null {
        if (state.overlayText) {
            return state.overlayText;
        }

        const comboText = thisObj.field("combo").value;
        if (!comboText) {
            return null;
        }

        try {
            const overlayText = instantiateObjectMethod.invoke(comboText);
            overlayText.method("set_name", 1).invoke(Il2Cpp.string(OVERLAY_NAME));
            tryAttachOverlay(comboText, overlayText);
            tryEnableRichText(overlayText);
            safeSetText(overlayText, "");
            tryOffsetOverlay(comboText, overlayText);

            state.overlayText = overlayText;
            return overlayText;
        } catch (e) {
            console.log(`[delta_t_display] create overlay text failed: ${e}`);
            return null;
        }
    }

    function ensureAccText(thisObj: any): any | null {
        const key = thisObj.handle.toString();
        const cached = accTextState.get(key);
        if (cached) {
            return cached;
        }

        const scoreText = thisObj.field("score").value;
        if (!scoreText) {
            return null;
        }

        try {
            const accText = instantiateObjectMethod.invoke(scoreText);
            accText.method("set_name", 1).invoke(Il2Cpp.string(ACC_OVERLAY_NAME));
            tryAttachOverlay(scoreText, accText);
            trySetSmallFont(scoreText, accText);
            tryOffsetOverlayWith(scoreText, accText, ACC_OFFSET_Y);
            safeSetText(accText, "acc=0.00%");

            accTextState.set(key, accText);
            return accText;
        } catch (e) {
            console.log(`[delta_t_display] create acc text failed: ${e}`);
            return null;
        }
    }

    function setOverlay(thisObj: any, kind: JudgeKind, judgeTime?: number): void {
        const key = thisObj.handle.toString();
        const existing = overlayState.get(key);
        if (existing) {
            existing.text = makeOverlayText(kind, judgeTime);
            existing.ttl = (kind === "miss" || kind === "bad") ? MISS_TTL_FRAMES : HUD_TTL_FRAMES;
            return;
        }

        overlayState.set(key, {
            text: makeOverlayText(kind, judgeTime),
            ttl: kind === "miss" ? MISS_TTL_FRAMES : HUD_TTL_FRAMES,
            overlayText: null,
        });
    }

    perfectMethod.implementation = function (
        this: any,
        noteCode: number,
        judgeTime: number,
        judgeTransform: any,
        isHold: boolean
    ): void {
        setOverlay(this, "perfect", judgeTime);
        this.method("Perfect", 4).invoke(noteCode, judgeTime, judgeTransform, isHold);
    };

    goodMethod.implementation = function (
        this: any,
        noteCode: number,
        judgeTime: number,
        judgeTransform: any,
        isHold: boolean
    ): void {
        setOverlay(this, "good", judgeTime);
        this.method("Good", 4).invoke(noteCode, judgeTime, judgeTransform, isHold);
    };

    badMethod.implementation = function (
        this: any,
        noteCode: number,
        judgeTime: number
    ): void {
        setOverlay(this, "bad", judgeTime);
        this.method("Bad", 2).invoke(noteCode, judgeTime);
    };

    missMethod.implementation = function (this: any, noteCode: number): void {
        setOverlay(this, "miss");
        this.method("Miss", 1).invoke(noteCode);
    };

    updateMethod.implementation = function (this: any): void {
        this.method("Update", 0).invoke();

        const accText = ensureAccText(this);
        if (accText) {
            const percent = computeAccuracy(this);
            safeSetText(accText, formatAccuracyText(percent));
        }

        const key = this.handle.toString();
        const state = overlayState.get(key);
        if (!state) {
            return;
        }

        const overlayText = ensureOverlayText(this, state);
        if (!overlayText) {
            return;
        }

        if (state.ttl > 0) {
            safeSetText(overlayText, state.text);
            state.ttl -= 1;
        } else {
            safeSetText(overlayText, "");
        }
    };

    console.log("[delta_t_display] hooks installed");
    console.log("[delta_t_display] positive judgeTime => late, negative => early");
});




