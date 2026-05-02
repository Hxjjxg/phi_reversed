import "frida-il2cpp-bridge";

declare const Il2Cpp: any;
declare const Interceptor: any;

type VersionSnapshot = {
    saveVersion: number | null;
    gameVersion: number | null;
};

type DisplayRole = "local" | "cloud" | "unknown";

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

function writeSummaryVersions(summary: any, patch: Partial<VersionSnapshot>): void {
    if (!summary) {
        return;
    }

    if (patch.saveVersion !== undefined && patch.saveVersion !== null) {
        const nextSaveVersion = Number(patch.saveVersion);
        if (Number.isFinite(nextSaveVersion)) {
            try {
                summary.field("<SaveVersion>k__BackingField").value = nextSaveVersion;
            } catch {
                try {
                    summary.method("set_SaveVersion", 1).invoke(nextSaveVersion);
                } catch {
                }
            }
        }
    }

    if (patch.gameVersion !== undefined && patch.gameVersion !== null) {
        const nextGameVersion = Number(patch.gameVersion);
        if (Number.isFinite(nextGameVersion)) {
            try {
                summary.field("<GameVersion>k__BackingField").value = nextGameVersion;
            } catch {
                try {
                    summary.method("set_GameVersion", 1).invoke(nextGameVersion);
                } catch {
                }
            }
        }
    }
}

function findSyncSaveStateMachineClass(assemblyImage: any): any {
    for (const klass of assemblyImage.classes) {
        const className = `${klass.name}`;
        if (!(className.includes("SyncSave") && className.includes("d__"))) {
            continue;
        }

        const hasMoveNext = !!klass.tryMethod("MoveNext", 0);
        if (!hasMoveNext) {
            continue;
        }

        const fieldNames = klass.fields
            .filter((field: any) => !field.isStatic)
            .map((field: any) => `${field.name}`);

        const hasLocalSummary = fieldNames.some((name: string) => name.includes("localSummary"));
        const hasCloudSummary = fieldNames.some((name: string) => name.includes("cloudSummary"));

        if (hasLocalSummary && hasCloudSummary) {
            return klass;
        }
    }

    throw new Error("could not locate <SyncSave>d__* state machine class");
}

function findStateSummaryFieldName(stateClass: any, marker: "localSummary" | "cloudSummary"): string {
    for (const field of stateClass.fields) {
        if (field.isStatic) {
            continue;
        }

        const fieldName = `${field.name}`;
        if (fieldName.includes(marker)) {
            return fieldName;
        }
    }

    throw new Error(`could not find ${marker} field in ${stateClass.name}`);
}

function installSyncVersionBypassHook(assemblyImage: any): void {
    const syncSaveStateClass = findSyncSaveStateMachineClass(assemblyImage);
    const moveNextMethod = syncSaveStateClass.method("MoveNext", 0);

    const localSummaryFieldName = findStateSummaryFieldName(syncSaveStateClass, "localSummary");
    const cloudSummaryFieldName = findStateSummaryFieldName(syncSaveStateClass, "cloudSummary");

    Interceptor.attach(moveNextMethod.virtualAddress, {
        onEnter(args: any[]) {
            this._localSummaryObj = null;
            this._restoreLocal = null;

            try {
                const stateMachine = new Il2Cpp.ValueType(args[0], syncSaveStateClass.type);
                const localSummaryObj = stateMachine.field(localSummaryFieldName).value;
                const cloudSummaryObj = stateMachine.field(cloudSummaryFieldName).value;

                if (!localSummaryObj?.handle || !cloudSummaryObj?.handle) {
                    return;
                }

                const local = readSummaryVersions(localSummaryObj);
                const cloud = readSummaryVersions(cloudSummaryObj);

                const shouldBypassSave =
                    local.saveVersion !== null &&
                    cloud.saveVersion !== null &&
                    cloud.saveVersion > local.saveVersion;
                const shouldBypassGame =
                    local.gameVersion !== null &&
                    cloud.gameVersion !== null &&
                    cloud.gameVersion > local.gameVersion;

                if (!(shouldBypassSave || shouldBypassGame)) {
                    return;
                }

                this._localSummaryObj = localSummaryObj;
                this._restoreLocal = {
                    saveVersion: local.saveVersion,
                    gameVersion: local.gameVersion,
                };

                writeSummaryVersions(localSummaryObj, {
                    saveVersion: shouldBypassSave ? cloud.saveVersion : local.saveVersion,
                    gameVersion: shouldBypassGame ? cloud.gameVersion : local.gameVersion,
                });

                const localAfter = readSummaryVersions(localSummaryObj);
                console.log(
                    `[cloud-sync] bypass compare hit local(gv=${formatMaybeNumber(local.gameVersion)},sv=${formatMaybeNumber(local.saveVersion)})` +
                    ` cloud(gv=${formatMaybeNumber(cloud.gameVersion)},sv=${formatMaybeNumber(cloud.saveVersion)})` +
                    ` patchedLocal(gv=${formatMaybeNumber(localAfter.gameVersion)},sv=${formatMaybeNumber(localAfter.saveVersion)})`
                );
            } catch (e) {
                console.log(`[cloud-sync] compare bypass onEnter failed: ${e}`);
            }
        },
        onLeave() {
            if (!this._localSummaryObj || !this._restoreLocal) {
                return;
            }

            try {
                writeSummaryVersions(this._localSummaryObj, this._restoreLocal);
            } catch (e) {
                console.log(`[cloud-sync] compare bypass restore failed: ${e}`);
            }
        },
    });

    console.log(
        `[cloud-sync] attached ${syncSaveStateClass.name}.MoveNext ` +
        `(fields: ${localSummaryFieldName}, ${cloudSummaryFieldName})`
    );
}

function installSummarySourceBypassHook(assemblyImage: any): void {
    const CloudSaveSummary = assemblyImage.class("CloudSaveSummary");
    const fromLocalSaveMethod = CloudSaveSummary.method("FromLocalSave", 0);
    const deserializeMethod = CloudSaveSummary.method("Deserialize", 1).overload("System.String");

    let pendingLocalSummary: any | null = null;
    let pendingLocalSummaryAt = 0;

    fromLocalSaveMethod.implementation = function (this: any): any {
        const localSummary = this.method("FromLocalSave", 0).invoke();
        pendingLocalSummary = localSummary;
        pendingLocalSummaryAt = Date.now();

        try {
            const local = readSummaryVersions(localSummary);
            console.log(
                `[cloud-sync] FromLocalSave captured local(gv=${formatMaybeNumber(local.gameVersion)},sv=${formatMaybeNumber(local.saveVersion)})`
            );
        } catch {
        }

        return localSummary;
    };

    deserializeMethod.implementation = function (this: any, base64: any): any {
        const cloudSummary = this.method("Deserialize", 1).invoke(base64);

        try {
            const cloud = readSummaryVersions(cloudSummary);
            const isRecentPair = pendingLocalSummary && Date.now() - pendingLocalSummaryAt <= 15000;

            if (isRecentPair) {
                const local = readSummaryVersions(pendingLocalSummary);
                const shouldBypassSave =
                    local.saveVersion !== null &&
                    cloud.saveVersion !== null &&
                    cloud.saveVersion > local.saveVersion;
                const shouldBypassGame =
                    local.gameVersion !== null &&
                    cloud.gameVersion !== null &&
                    cloud.gameVersion > local.gameVersion;

                if (shouldBypassSave || shouldBypassGame) {
                    writeSummaryVersions(pendingLocalSummary, {
                        saveVersion: shouldBypassSave ? cloud.saveVersion : local.saveVersion,
                        gameVersion: shouldBypassGame ? cloud.gameVersion : local.gameVersion,
                    });

                    const localAfter = readSummaryVersions(pendingLocalSummary);
                    console.log(
                        `[cloud-sync] source bypass hit local(gv=${formatMaybeNumber(local.gameVersion)},sv=${formatMaybeNumber(local.saveVersion)})` +
                        ` cloud(gv=${formatMaybeNumber(cloud.gameVersion)},sv=${formatMaybeNumber(cloud.saveVersion)})` +
                        ` patchedLocal(gv=${formatMaybeNumber(localAfter.gameVersion)},sv=${formatMaybeNumber(localAfter.saveVersion)})`
                    );
                }
            }
        } catch (e) {
            console.log(`[cloud-sync] source bypass failed: ${e}`);
        } finally {
            pendingLocalSummary = null;
            pendingLocalSummaryAt = 0;
        }

        return cloudSummary;
    };

    console.log("[cloud-sync] attached CloudSaveSummary.FromLocalSave/Deserialize source bypass");
}

Il2Cpp.perform(() => {
    const AssemblyCSharp = resolveAssemblyCSharp();
    installSummarySourceBypassHook(AssemblyCSharp.image);
    installSyncVersionBypassHook(AssemblyCSharp.image);

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
    console.log("[cloud-sync] version compare bypass enabled (method-level, no RVA dependency)");
});
