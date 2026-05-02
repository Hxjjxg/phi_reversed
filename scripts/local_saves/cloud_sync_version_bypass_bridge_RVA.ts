import "frida-il2cpp-bridge";

declare const Il2Cpp: any;
declare const Process: any;
declare const Memory: any;
declare const Instruction: any;
declare const Arm64Writer: any;
type NativePointer = any;

type VersionSnapshot = {
    saveVersion: number | null;
    gameVersion: number | null;
};

type DisplayRole = "local" | "cloud" | "unknown";

const TARGET_MODULE = "libil2cpp.so";

// Android 3.14.2 RVAs (from current IDA database)
const SYNC_COMPARE_SAVE_BRANCH_RVA = 0x1F3FF18; // B.HI -> fail branch
const SYNC_COMPARE_GAME_BRANCH_RVA = 0x1F3FF28; // B.LE -> normal branch
const SYNC_NORMAL_PATH_RVA = 0x1F40C84;

const VERSION_OVERLAY_NAME = "CloudSyncVersionOverlayText";
const VERSION_OVERLAY_OFFSET_Y = -80;
const VERSION_FONT_SCALE = 1;
const VERSION_FONT_MIN_SIZE = 25;
const VERSION_COLOR_LOCAL = "#9dffb1";
const VERSION_COLOR_CLOUD = "#B3ECFE";

function resolveAssemblyCSharp(): any {
    const asm = Il2Cpp.domain.tryAssembly("Assembly-CSharp");
    if (!asm) {
        throw new Error("Assembly-CSharp not found");
    }
    return asm;
}

function formatMaybeNumber(value: number | null): string {
    return value === null || !Number.isFinite(value) ? "?" : `${value}`;
}

function safeSetText(textObject: any, content: string): void {
    if (!textObject) {
        return;
    }

    try {
        textObject.method("set_text", 1).invoke(Il2Cpp.string(content));
    } catch {
        // Ignore destroyed / invalid ui object.
    }
}

function colorize(text: string, color: string): string {
    return `<color=${color}>${text}</color>`;
}

function readSummaryVersions(summary: any): VersionSnapshot {
    if (!summary) {
        return { saveVersion: null, gameVersion: null };
    }

    let saveVersion: number | null = null;
    let gameVersion: number | null = null;

    try {
        saveVersion = Number(summary.field("<SaveVersion>k__BackingField").value);
    } catch {
        try {
            saveVersion = Number(summary.method("get_SaveVersion", 0).invoke());
        } catch {
            saveVersion = null;
        }
    }

    try {
        gameVersion = Number(summary.field("<GameVersion>k__BackingField").value);
    } catch {
        try {
            gameVersion = Number(summary.method("get_GameVersion", 0).invoke());
        } catch {
            gameVersion = null;
        }
    }

    return {
        saveVersion: Number.isFinite(saveVersion) ? saveVersion : null,
        gameVersion: Number.isFinite(gameVersion) ? gameVersion : null,
    };
}

function assertArm64(): void {
    if (`${Process.arch}` !== "arm64") {
        throw new Error(`unsupported architecture: ${Process.arch}`);
    }
}

function expectMnemonic(address: NativePointer, expectedPrefix: string): void {
    const insn = Instruction.parse(address);
    const actual = `${insn.mnemonic}`.toLowerCase();
    const expected = expectedPrefix.toLowerCase();
    if (!actual.startsWith(expected)) {
        throw new Error(`unexpected instruction at ${address}: expected ${expectedPrefix}, got ${insn}`);
    }
}

function getMnemonic(address: NativePointer): string {
    return `${Instruction.parse(address).mnemonic}`.toLowerCase();
}

function patchNop(address: NativePointer): void {
    Memory.patchCode(address, 4, (code: NativePointer) => {
        const writer = new Arm64Writer(code, { pc: address });
        writer.putNop();
        writer.flush();
    });
}

function patchBranch(address: NativePointer, target: NativePointer): void {
    Memory.patchCode(address, 4, (code: NativePointer) => {
        const writer = new Arm64Writer(code, { pc: address });
        writer.putBImm(target);
        writer.flush();
    });
}

function installSyncVersionBypass(baseAddress: NativePointer): void {
    const saveBranch = baseAddress.add(SYNC_COMPARE_SAVE_BRANCH_RVA);
    const gameBranch = baseAddress.add(SYNC_COMPARE_GAME_BRANCH_RVA);
    const normalPath = baseAddress.add(SYNC_NORMAL_PATH_RVA);

    const saveMnemonic = getMnemonic(saveBranch);
    if (saveMnemonic.startsWith("b.hi")) {
        patchNop(saveBranch);
    } else if (!saveMnemonic.startsWith("nop")) {
        throw new Error(`unexpected instruction at ${saveBranch}: expected b.hi/nop, got ${Instruction.parse(saveBranch)}`);
    }

    const gameMnemonic = getMnemonic(gameBranch);
    if (gameMnemonic.startsWith("b.le")) {
        patchBranch(gameBranch, normalPath);
    } else if (!(gameMnemonic === "b" || gameMnemonic.startsWith("b."))) {
        throw new Error(`unexpected instruction at ${gameBranch}: expected b.le/branch, got ${Instruction.parse(gameBranch)}`);
    }

    console.log(`[cloud-sync] compare-branch bypass ready @ ${saveBranch} and ${gameBranch} (idempotent)`);
}

Il2Cpp.perform(() => {
    assertArm64();

    const module = Process.findModuleByName(TARGET_MODULE);
    if (!module) {
        throw new Error(`${TARGET_MODULE} not found`);
    }

    installSyncVersionBypass(module.base);

    const AssemblyCSharp = resolveAssemblyCSharp();
    const UnityCore = Il2Cpp.domain.assembly("UnityEngine.CoreModule");
    const UnityObject = UnityCore.image.class("UnityEngine.Object");
    const instantiateObjectMethod = UnityObject.method("Instantiate", 1).overload("UnityEngine.Object");

    const SelectSavePopup = AssemblyCSharp.image.class("SelectSavePopup");
    const CloudSaveInfoDisplay = AssemblyCSharp.image.class("CloudSaveInfoDisplay");

    const popupAwakeMethod = SelectSavePopup.method("Awake", 0);
    const setInfoMethod = CloudSaveInfoDisplay.method("SetInfo", 3);

    const displayRoleByHandle = new Map<string, DisplayRole>();
    const versionOverlayByPopupHandle = new Map<string, any>();
    const localVersions: VersionSnapshot = { saveVersion: null, gameVersion: null };
    const cloudVersions: VersionSnapshot = { saveVersion: null, gameVersion: null };

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
            }

            try {
                overlayText.method("set_enabled", 1).invoke(true);
            } catch {
            }
        } catch {
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
        }
    }

    function trySetSmallFont(referenceText: any, overlayText: any): void {
        try {
            const baseSize = Number(referenceText.method("get_fontSize", 0).invoke() ?? 0);
            if (baseSize > 0) {
                const small = Math.max(VERSION_FONT_MIN_SIZE, Math.floor(baseSize * VERSION_FONT_SCALE));
                overlayText.method("set_fontSize", 1).invoke(small);
            }
        } catch {
        }
    }

    function tryEnableRichText(textObject: any): void {
        try {
            textObject.method("set_supportRichText", 1).invoke(true);
        } catch {
            try {
                textObject.method("set_richText", 1).invoke(true);
            } catch {
            }
        }
    }

    function formatVersionOverlayLine(): string {
        const localText = `local gv=${formatMaybeNumber(localVersions.gameVersion)} sv=${formatMaybeNumber(localVersions.saveVersion)}`;
        const cloudText = `cloud gv=${formatMaybeNumber(cloudVersions.gameVersion)} sv=${formatMaybeNumber(cloudVersions.saveVersion)}`;
        return `${colorize(localText, VERSION_COLOR_LOCAL)}  |  ${colorize(cloudText, VERSION_COLOR_CLOUD)}`;
    }

    function refreshAllVersionOverlays(): void {
        const content = formatVersionOverlayLine();
        for (const overlayText of versionOverlayByPopupHandle.values()) {
            safeSetText(overlayText, content);
        }
    }

    function ensurePopupVersionOverlay(popupObj: any): any | null {
        const popupKey = popupObj.handle?.toString?.();
        if (!popupKey) {
            return null;
        }

        const existing = versionOverlayByPopupHandle.get(popupKey);
        if (existing) {
            return existing;
        }

        try {
            const subtitleText = popupObj.field("subtitle").value;
            if (!subtitleText) {
                return null;
            }

            const overlayText = instantiateObjectMethod.invoke(subtitleText);
            overlayText.method("set_name", 1).invoke(Il2Cpp.string(VERSION_OVERLAY_NAME));
            tryAttachOverlay(subtitleText, overlayText);
            tryEnableRichText(overlayText);
            trySetSmallFont(subtitleText, overlayText);
            tryOffsetOverlayWith(subtitleText, overlayText, VERSION_OVERLAY_OFFSET_Y);

            versionOverlayByPopupHandle.set(popupKey, overlayText);
            return overlayText;
        } catch (e) {
            console.log(`[cloud-sync] create version overlay failed: ${e}`);
            return null;
        }
    }

    function updateDisplayText(role: DisplayRole, current: VersionSnapshot): void {
        const roleText = role === "unknown" ? "summary" : role;
        const currentText = `${roleText} gv=${formatMaybeNumber(current.gameVersion)} sv=${formatMaybeNumber(current.saveVersion)}`;
        console.log(`[cloud-sync] ${currentText}`);
        refreshAllVersionOverlays();
    }

    popupAwakeMethod.implementation = function (this: any): void {
        this.method("Awake", 0).invoke();

        try {
            const localDisplay = this.field("localSave").value;
            const cloudDisplay = this.field("cloudSave").value;

            if (localDisplay?.handle) {
                displayRoleByHandle.set(localDisplay.handle.toString(), "local");
            }

            if (cloudDisplay?.handle) {
                displayRoleByHandle.set(cloudDisplay.handle.toString(), "cloud");
            }

            const overlayText = ensurePopupVersionOverlay(this);
            if (overlayText) {
                safeSetText(overlayText, formatVersionOverlayLine());
            }
        } catch (e) {
            console.log(`[cloud-sync] SelectSavePopup.Awake hook failed: ${e}`);
        }
    };

    setInfoMethod.implementation = function (
        this: any,
        summary: any,
        updateTime: any,
        hideAT: boolean
    ): void {
        this.method("SetInfo", 3).invoke(summary, updateTime, hideAT);

        const snapshot = readSummaryVersions(summary);
        const handle = this.handle?.toString?.() || "";

        let role: DisplayRole = displayRoleByHandle.get(handle) || "unknown";

        if (role === "unknown") {
            if (localVersions.gameVersion === null && localVersions.saveVersion === null) {
                role = "local";
            } else if (cloudVersions.gameVersion === null && cloudVersions.saveVersion === null) {
                role = "cloud";
            }
        }

        if (role === "local") {
            localVersions.gameVersion = snapshot.gameVersion;
            localVersions.saveVersion = snapshot.saveVersion;
        } else if (role === "cloud") {
            cloudVersions.gameVersion = snapshot.gameVersion;
            cloudVersions.saveVersion = snapshot.saveVersion;
        }

        updateDisplayText(role, snapshot);
    };

    console.log("[cloud-sync] hooks installed");
    console.log("[cloud-sync] version compare bypass enabled (without modifying local version fields)");
});
