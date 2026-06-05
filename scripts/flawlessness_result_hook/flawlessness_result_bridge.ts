import "frida-il2cpp-bridge";

declare const Il2Cpp: any;

type DeltaSummary = {
    count: number;
    signedAverageMs: number;
    absoluteAverageMs: number;
};

const LOG_PREFIX = "[flawlessness_result]";
const OVERLAY_NAME = "FlawlessnessResultText";
const OVERLAY_OFFSET_Y = -42;
const OVERLAY_FONT_SCALE = 0.62;
const OVERLAY_FONT_MIN_SIZE = 14;
const OVERLAY_COLOR = "#B3ECFE";
const SIGNED_COLOR = "#fdff9d";
const ABS_COLOR = "#B3ECFE";
const UNKNOWN_TEXT = "无暇度: N/A";
const MAX_REASONABLE_JUDGE_TIME = 0.5;

let instantiateObjectMethod: any = null;
let latestNoteCodes: number[] = [];
const resultTextBySettle = new Map<string, any>();

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

function isNullLike(value: any): boolean {
    return !value || value.isNull?.() === true;
}

function safeInvoke<T>(action: () => T, fallback: T): T {
    try {
        return action();
    } catch {
        return fallback;
    }
}

function readFloatList(listObject: any): number[] {
    if (isNullLike(listObject)) {
        return [];
    }

    const count = safeInvoke(() => Number(listObject.method("get_Count", 0).invoke()), 0);
    if (!Number.isFinite(count) || count <= 0) {
        return [];
    }

    const values: number[] = [];
    let getItem: any = null;
    try {
        getItem = listObject.method("get_Item", 1);
    } catch {
        getItem = null;
    }

    for (let index = 0; index < count; index++) {
        try {
            const value = getItem ? getItem.invoke(index) : listObject.method("get_Item", 1).invoke(index);
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
                values.push(numeric);
            }
        } catch {
            break;
        }
    }

    return values;
}

function readGameInformationNoteCodes(): number[] {
    try {
        const GameInformation = resolveClass("GameInformation", ["Assembly-CSharp"]);
        const main = GameInformation.method("get_main", 0).invoke();
        if (isNullLike(main)) {
            return [];
        }

        return readFloatList(main.field("noteCodes").value);
    } catch {
        return [];
    }
}

function readScoreControlNoteCodes(scoreControl: any): number[] {
    try {
        return readFloatList(scoreControl.field("_noteCodes").value);
    } catch {
        return [];
    }
}

function fractional(value: number): number {
    return value - Math.floor(value);
}

function decodeDeltaTime(resultNoteCode: number): number | null {
    if (!Number.isFinite(resultNoteCode)) {
        return null;
    }

    const frac = fractional(resultNoteCode);
    if (frac < 0.05) {
        return null;
    }

    const delta = frac - 0.5;
    if (Math.abs(delta) > MAX_REASONABLE_JUDGE_TIME) {
        return null;
    }

    return delta;
}

function computeDeltaSummary(noteCodes: number[]): DeltaSummary | null {
    let signedSum = 0;
    let absoluteSum = 0;
    let count = 0;

    for (const code of noteCodes) {
        const delta = decodeDeltaTime(code);
        if (delta === null) {
            continue;
        }

        signedSum += delta;
        absoluteSum += Math.abs(delta);
        count++;
    }

    if (count === 0) {
        return null;
    }

    return {
        count,
        signedAverageMs: (signedSum / count) * 1000,
        absoluteAverageMs: (absoluteSum / count) * 1000,
    };
}

function formatSignedMs(ms: number): string {
    const rounded = Object.is(ms, -0) ? 0 : ms;
    const sign = rounded >= 0 ? "+" : "-";
    return `${sign}${Math.abs(rounded).toFixed(2)}ms`;
}

function formatPlainMs(ms: number): string {
    return `${Math.abs(ms).toFixed(2)}ms`;
}

function formatSummary(summary: DeltaSummary | null): string {
    if (!summary) {
        return UNKNOWN_TEXT;
    }

    return `<color=${OVERLAY_COLOR}>无暇度</color>  ` +
        `<color=${SIGNED_COLOR}>平均=${formatSignedMs(summary.signedAverageMs)}</color>  ` +
        `<color=${ABS_COLOR}>绝对=${formatPlainMs(summary.absoluteAverageMs)}</color>`;
}

function safeSetText(textObject: any, content: string): void {
    if (isNullLike(textObject)) {
        return;
    }

    try {
        textObject.method("set_text", 1).invoke(Il2Cpp.string(content));
    } catch {
        // The result scene can destroy UI objects while leaving the hook alive.
    }
}

function tryEnableRichText(textObject: any): void {
    try {
        textObject.method("set_supportRichText", 1).invoke(true);
    } catch {
        try {
            textObject.method("set_richText", 1).invoke(true);
        } catch {
            // Some Text variants do not expose rich-text setters.
        }
    }
}

function tryAttachOverlay(referenceText: any, overlayText: any): void {
    try {
        const referenceRect = referenceText.method("get_rectTransform", 0).invoke();
        const overlayRect = overlayText.method("get_rectTransform", 0).invoke();
        const parent = referenceRect.method("get_parent", 0).invoke();
        if (isNullLike(parent)) {
            return;
        }

        try {
            overlayRect.method("SetParent", 2).invoke(parent, false);
        } catch {
            overlayRect.method("set_parent", 1).invoke(parent);
        }

        try {
            overlayText.method("get_gameObject", 0).invoke().method("SetActive", 1).invoke(true);
        } catch {
            // Leave clone active state unchanged if SetActive is unavailable.
        }

        try {
            overlayText.method("set_enabled", 1).invoke(true);
        } catch {
            // Ignore missing enabled setter.
        }
    } catch {
        // Keep clone default hierarchy if RectTransform APIs are unavailable.
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
        // Keep default position if RectTransform operations fail.
    }
}

function trySetSmallFont(referenceText: any, overlayText: any): void {
    try {
        const baseSize = Number(referenceText.method("get_fontSize", 0).invoke() ?? 0);
        if (baseSize > 0) {
            const small = Math.max(OVERLAY_FONT_MIN_SIZE, Math.floor(baseSize * OVERLAY_FONT_SCALE));
            overlayText.method("set_fontSize", 1).invoke(small);
        }
    } catch {
        // Keep default font size.
    }
}

function getResultTextKey(settleAccounts: any): string {
    return settleAccounts?.handle?.toString?.() ?? "unknown";
}

function ensureResultText(settleAccounts: any): any | null {
    if (isNullLike(settleAccounts)) {
        return null;
    }

    const key = getResultTextKey(settleAccounts);
    const cached = resultTextBySettle.get(key);
    if (!isNullLike(cached)) {
        return cached;
    }

    const referenceText = safeInvoke(() => settleAccounts.field("percentText").value, null)
        ?? safeInvoke(() => settleAccounts.field("scoreText").value, null)
        ?? safeInvoke(() => settleAccounts.field("maxComboText").value, null);
    if (isNullLike(referenceText) || !instantiateObjectMethod) {
        return null;
    }

    try {
        const overlayText = instantiateObjectMethod.invoke(referenceText);
        overlayText.method("set_name", 1).invoke(Il2Cpp.string(OVERLAY_NAME));
        tryAttachOverlay(referenceText, overlayText);
        tryEnableRichText(overlayText);
        trySetSmallFont(referenceText, overlayText);
        tryOffsetOverlay(referenceText, overlayText);
        safeSetText(overlayText, "");
        resultTextBySettle.set(key, overlayText);
        return overlayText;
    } catch (error) {
        console.log(`${LOG_PREFIX} create result text failed: ${error}`);
        return null;
    }
}

function getSettleAccountsFromDisplayObject(thisObject: any): any | null {
    if (isNullLike(thisObject)) {
        return null;
    }

    try {
        const owner = thisObject.field("<>4__this").value;
        if (!isNullLike(owner)) {
            return owner;
        }
    } catch {
        // Not a compiler display-class instance; it may already be SettleAccountsControl.
    }

    return thisObject;
}

function getSettleAccountsFromHelperCall(thisObject: any, parameters: any[]): any | null {
    const fromThis = getSettleAccountsFromDisplayObject(thisObject);
    if (!isNullLike(fromThis)) {
        try {
            fromThis.field("percentText");
            return fromThis;
        } catch {
            // It may be a display class without <>4__this on this game version.
        }
    }

    for (const parameter of parameters) {
        if (isNullLike(parameter)) {
            continue;
        }

        const candidate = safeInvoke(() => parameter.value, null);
        const owner = getSettleAccountsFromDisplayObject(candidate);
        if (isNullLike(owner)) {
            continue;
        }

        try {
            owner.field("percentText");
            return owner;
        } catch {
            // Keep scanning other parameters.
        }
    }

    return fromThis;
}

function updateResultText(settleAccounts: any): void {
    const resultText = ensureResultText(settleAccounts);
    if (!resultText) {
        return;
    }

    let noteCodes = readGameInformationNoteCodes();
    if (noteCodes.length === 0) {
        noteCodes = latestNoteCodes;
    }

    const summary = computeDeltaSummary(noteCodes);
    safeSetText(resultText, formatSummary(summary));
    console.log(`${LOG_PREFIX} displayed count=${summary?.count ?? 0}`);
}

function installScoreControlHook(): void {
    const ScoreControl = resolveClass("ScoreControl", ["Assembly-CSharp"]);
    const setNoteCodeList = ScoreControl.method("SetNoteCodeList", 0);

    setNoteCodeList.implementation = function (this: any): void {
        this.method("SetNoteCodeList", 0).invoke();

        try {
            latestNoteCodes = readScoreControlNoteCodes(this);
            console.log(`${LOG_PREFIX} cached noteCodes count=${latestNoteCodes.length}`);
        } catch (error) {
            console.log(`${LOG_PREFIX} cache noteCodes failed: ${error}`);
        }
    };
}

function installSetResultInfoHook(): number {
    const asm = Il2Cpp.domain.assembly("Assembly-CSharp");
    let installed = 0;

    for (const klass of asm.image.classes) {
        const fullName = klass.fullName;
        if (!fullName.includes("SettleAccountsControl")) {
            continue;
        }

        for (const method of klass.methods) {
            const name = method.name;
            if (!name.includes("<Start>g__SetResultInfo")) {
                continue;
            }

            method.implementation = function (this: any, ...parameters: any[]): void {
                method.invokeRaw(this.handle, ...parameters.map((parameter) => parameter?.handle ?? parameter));

                try {
                    updateResultText(getSettleAccountsFromHelperCall(this, parameters));
                } catch (error) {
                    console.log(`${LOG_PREFIX} update after SetResultInfo failed: ${error}`);
                }
            };

            installed++;
            console.log(`${LOG_PREFIX} hooked ${fullName}.${name}`);
        }
    }

    return installed;
}

function installSettleStartFallbackHook(): void {
    const SettleAccountsControl = resolveClass("SettleAccountsControl", ["Assembly-CSharp"]);
    const start = SettleAccountsControl.method("Start", 0);

    start.implementation = function (this: any): any {
        const coroutine = this.method("Start", 0).invoke();
        const settleAccounts = this;

        setTimeout(() => {
            Il2Cpp.perform(() => {
                try {
                    updateResultText(settleAccounts);
                } catch (error) {
                    console.log(`${LOG_PREFIX} delayed update failed: ${error}`);
                }
            });
        }, 800);

        return coroutine;
    };
}

Il2Cpp.perform(() => {
    const UnityCore = Il2Cpp.domain.assembly("UnityEngine.CoreModule");
    const UnityObject = UnityCore.image.class("UnityEngine.Object");
    instantiateObjectMethod = UnityObject.method("Instantiate", 1).overload("UnityEngine.Object");

    installScoreControlHook();

    const setResultInfoHooks = installSetResultInfoHook();
    if (setResultInfoHooks === 0) {
        installSettleStartFallbackHook();
        console.log(`${LOG_PREFIX} SetResultInfo helper not found; installed Start fallback`);
    }

    console.log(`${LOG_PREFIX} hooks installed`);
});
