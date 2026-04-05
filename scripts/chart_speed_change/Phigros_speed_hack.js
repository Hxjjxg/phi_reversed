'use strict';

/**
 * Phigros for Android — 谱面 + BGM 倍速合并脚本
 *
 * 目标位置：Android 版 libil2cpp.so
 *
 * 谱面改写 (Chart):
 * - LevelControl__Start_d__40_MoveNext: 0x239D300
 * - MoveNext 内 chart_1 返回点: 0x239D780
 * - JsonUtility.FromJson<Chart> wrapper: 0x1EBF690
 *
 * BGM 变速 (AudioClip samplerate remap / pitch fallback):
 * - mark BGM callsite: 0x239D7E0
 * - replace clip callsite: 0x1F96128
 * - AddressableAudioSource.PlayScheduled: 0x1F959A8
 * - AddressableAudioSource.Update: 0x1F9558C
 *
 * 说明：
 * - hook FromJson<Chart>，在反序列化前改写 JSON，实现谱面倍速。
 * - hook BGM AudioClip，通过重采样或 pitch 回退实现音频倍速。
 * - 改写逻辑: offset /= speed, bpm *= speed, floorPosition /= speed
 */

const LIB_NAME = 'libil2cpp.so';

// ======== 倍速配置 ========
// 修改此值来设置倍速，例如 2.0 = 2倍速，0.5 = 半速
const SPEED_MULTIPLIER = 1.5;

// ======== Chart RVA ========
const MOVE_NEXT_RVA = 0x239D300;
const CHART_RET_RVA = 0x239D780;
const FROM_JSON_CHART_RVA = 0x1EBF690;

const CHART_OFFSETS = {
    formatVersion: 0x10,
    offset: 0x14,
    judgeLineList: 0x18,
};

const LIST_OFFSETS = {
    size: 0x18,
};

// ======== BGM RVA ========
const MARK_BGM_CALL_RVA = 0x239D7E0;
const REPLACE_CLIP_CALLSITE_RVA = 0x1F96128;
const ADDRESSABLE_AUDIO_SOURCE_PLAYSCHEDULED_RVA = 0x1F959A8;
const ADDRESSABLE_AUDIO_SOURCE_UPDATE_RVA = 0x1F9558C;

const AUDIOCLIP_RVAS = {
    getLength: 0x1BFE03C,
    getSamples: 0x1BFE07C,
    getChannels: 0x1BFE0BC,
    getFrequency: 0x1BFE0FC,
    getIsReadyToPlay: 0x1BFE13C,
    getLoadType: 0x1BFE17C,
    loadAudioData: 0x1BFE1BC,
    getLoadState: 0x1BFE2FC,
    getData: 0x1BFE33C,
    setData: 0x1BFE4C8,
    create: 0x1BFE6F0,
};

const AUDIOSOURCE_RVAS = {
    getClip: 0x1C002DC,
    setClip: 0x1C0031C,
    getTime: 0x1C001BC,
    setPitch: 0x1C0016C,
};

const ADDRESSABLE_AUDIO_SOURCE_OFFSETS = {
    clipKey: 0x18,
    audioSource: 0x28,
};

// ======== 公共常量 ========
const MODULE_POLL_INTERVAL_MS = 500;
const MAX_FLOAT_SAMPLES = 100 * 1024 * 1024;
const AUDIO_CLIP_LOAD_TYPE_STREAMING = 2;

// ======== 公共工具函数 ========

function findIl2CppModule() {
    const exact = Process.findModuleByName(LIB_NAME);
    if (exact) {
        return exact;
    }

    return Process.enumerateModules().find((module) =>
        module.name.toLowerCase().includes('il2cpp')
    );
}

function waitForModule(name, onReady) {
    const loaded = Process.findModuleByName(name);
    if (loaded) {
        onReady(loaded);
        return;
    }

    const timer = setInterval(() => {
        const module = Process.findModuleByName(name) || findIl2CppModule();
        if (!module) {
            return;
        }

        clearInterval(timer);
        onReady(module);
    }, MODULE_POLL_INTERVAL_MS);
}

function readIl2CppString(strPtr) {
    if (!strPtr || strPtr.isNull()) {
        return null;
    }

    const length = strPtr.add(0x10).readS32();
    if (length < 0 || length > 10 * 1024 * 1024) {
        throw new Error(`invalid Il2CppString length: ${length}`);
    }

    return strPtr.add(0x14).readUtf16String(length);
}

function findExport(module, name) {
    return module.findExportByName(name) || Module.findGlobalExportByName(name);
}

function safeJsonLoads(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function previewText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength)}...`;
}

function sanitizeName(text) {
    return text.replace(/[^0-9A-Za-z_.-]/g, '_').slice(0, 96);
}

// ======== Chart 谱面改写 ========

const loggedCharts = new Set();

function readChartSummary(chartPtr) {
    if (chartPtr.isNull()) {
        return null;
    }

    const judgeLineList = chartPtr.add(CHART_OFFSETS.judgeLineList).readPointer();
    let judgeLineCount = -1;

    if (!judgeLineList.isNull()) {
        judgeLineCount = judgeLineList.add(LIST_OFFSETS.size).readS32();
    }

    return {
        ptr: chartPtr.toString(),
        formatVersion: chartPtr.add(CHART_OFFSETS.formatVersion).readS32(),
        offset: chartPtr.add(CHART_OFFSETS.offset).readFloat(),
        judgeLineCount,
    };
}

function rewriteFloorPosition(notes) {
    if (!Array.isArray(notes)) {
        return 0;
    }

    let count = 0;
    for (const note of notes) {
        if (!note || typeof note !== 'object') {
            continue;
        }

        note.floorPosition /= SPEED_MULTIPLIER;
        count += 1;
    }
    return count;
}

function rewriteChartJson(rawJson) {
    const chartData = safeJsonLoads(rawJson);
    if (!chartData) {
        return null;
    }

    chartData.offset /= SPEED_MULTIPLIER;

    let totalNotes = 0;
    let linesChanged = 0;

    const judgeLineList = Array.isArray(chartData.judgeLineList) ? chartData.judgeLineList : [];
    for (const judgeLine of judgeLineList) {
        if (!judgeLine || typeof judgeLine !== 'object') {
            continue;
        }

        judgeLine.bpm *= SPEED_MULTIPLIER;
        linesChanged += 1;

        totalNotes += rewriteFloorPosition(judgeLine.notesAbove);
        totalNotes += rewriteFloorPosition(judgeLine.notesBelow);
    }

    return {
        json: JSON.stringify(chartData),
        stats: { totalNotes, linesChanged },
    };
}

function dumpChart(chartPtr, sourceTag, rawJson) {
    if (!chartPtr || chartPtr.isNull()) {
        console.log(`[!] ${sourceTag}: chart_1 为 null`);
        return;
    }

    const key = chartPtr.toString();
    if (loggedCharts.has(key)) {
        return;
    }
    loggedCharts.add(key);

    console.log('============================================================');
    console.log(`[*] ${sourceTag}: 捕获 chart_1 ${chartPtr}`);

    try {
        const summary = readChartSummary(chartPtr);
        if (summary) {
            console.log(`[*] formatVersion=${summary.formatVersion} offset=${summary.offset} judgeLineCount=${summary.judgeLineCount}`);
        }

        if (rawJson) {
            console.log(`[*] 原始 JSON 长度: ${rawJson.length}`);
            console.log('[*] Chart JSON begin');
            console.log(rawJson);
            console.log('[*] Chart JSON end');
        }
    } catch (error) {
        console.log(`[!] ${sourceTag}: 读取 chart 摘要失败: ${error.message}`);
    }

    console.log('============================================================');
}

// ======== BGM 变速 ========

const targetOwners = new Set();
const ownerToKey = new Map();
const remappedClips = new Map();
const replacementClipPtrs = new Set();
const loggedFailureKeys = new Set();
const pitchFallbackOwners = new Set();

// ======== 安装 Hook ========

function installHook(module) {
    if (SPEED_MULTIPLIER <= 0) {
        throw new Error(`invalid SPEED_MULTIPLIER: ${SPEED_MULTIPLIER}`);
    }

    // --- 公共导出 ---
    const il2cppStringNewPtr = findExport(module, 'il2cpp_string_new');
    const il2cppGetCorlibPtr = findExport(module, 'il2cpp_get_corlib');
    const il2cppClassFromNamePtr = findExport(module, 'il2cpp_class_from_name');
    const il2cppArrayNewPtr = findExport(module, 'il2cpp_array_new');

    if (!il2cppStringNewPtr) {
        throw new Error('找不到导出符号 il2cpp_string_new');
    }
    if (!il2cppGetCorlibPtr || !il2cppClassFromNamePtr || !il2cppArrayNewPtr) {
        throw new Error('required il2cpp exports are missing');
    }

    const il2cppStringNew = new NativeFunction(il2cppStringNewPtr, 'pointer', ['pointer']);
    const il2cppGetCorlib = new NativeFunction(il2cppGetCorlibPtr, 'pointer', []);
    const il2cppClassFromName = new NativeFunction(il2cppClassFromNamePtr, 'pointer', ['pointer', 'pointer', 'pointer']);
    const il2cppArrayNew = new NativeFunction(il2cppArrayNewPtr, 'pointer', ['pointer', 'uint64']);

    // --- AudioClip / AudioSource native functions ---
    const audioClipGetSamples = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getSamples), 'int', ['pointer']);
    const audioClipGetLength = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getLength), 'float', ['pointer']);
    const audioClipGetChannels = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getChannels), 'int', ['pointer']);
    const audioClipGetFrequency = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getFrequency), 'int', ['pointer']);
    const audioClipGetIsReadyToPlay = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getIsReadyToPlay), 'bool', ['pointer']);
    const audioClipGetLoadType = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getLoadType), 'int', ['pointer']);
    const audioClipLoadAudioData = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.loadAudioData), 'bool', ['pointer']);
    const audioClipGetLoadState = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getLoadState), 'int', ['pointer']);
    const audioClipGetData = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.getData), 'bool', ['pointer', 'pointer', 'int']);
    const audioClipSetData = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.setData), 'bool', ['pointer', 'pointer', 'int']);
    const audioClipCreate = new NativeFunction(module.base.add(AUDIOCLIP_RVAS.create), 'pointer', ['pointer', 'int', 'int', 'int', 'bool']);
    const audioSourceGetClip = new NativeFunction(module.base.add(AUDIOSOURCE_RVAS.getClip), 'pointer', ['pointer']);
    const audioSourceSetClip = new NativeFunction(module.base.add(AUDIOSOURCE_RVAS.setClip), 'void', ['pointer', 'pointer']);
    const audioSourceGetTime = new NativeFunction(module.base.add(AUDIOSOURCE_RVAS.getTime), 'float', ['pointer']);
    const audioSourceSetPitch = new NativeFunction(module.base.add(AUDIOSOURCE_RVAS.setPitch), 'void', ['pointer', 'float']);

    // --- il2cpp corlib helpers ---
    const corlib = il2cppGetCorlib();
    if (corlib.isNull()) {
        throw new Error('il2cpp_get_corlib returned null');
    }

    const systemNs = Memory.allocUtf8String('System');
    const singleName = Memory.allocUtf8String('Single');
    const singleClass = il2cppClassFromName(corlib, systemNs, singleName);
    if (singleClass.isNull()) {
        throw new Error('failed to resolve System.Single');
    }

    function newManagedString(text) {
        return il2cppStringNew(Memory.allocUtf8String(text));
    }

    function newFloatArray(length) {
        const array = il2cppArrayNew(singleClass, length);
        if (array.isNull()) {
            throw new Error(`il2cpp_array_new failed for length=${length}`);
        }

        return array;
    }

    // --- BGM helper functions ---

    function getClipMeta(clip) {
        return {
            samples: audioClipGetSamples(clip),
            channels: audioClipGetChannels(clip),
            frequency: audioClipGetFrequency(clip),
            length: audioClipGetLength(clip),
            isReadyToPlay: !!audioClipGetIsReadyToPlay(clip),
            loadType: audioClipGetLoadType(clip),
            loadState: audioClipGetLoadState(clip),
        };
    }

    function logClipState(reason, owner, clip, meta, extra) {
        const key = ownerToKey.get(owner.toString()) || 'unknown_bgm';
        const suffix = extra ? ` ${extra}` : '';
        console.log(
            `[*] ${reason} key=${key} owner=${owner} clip=${clip}` +
            ` samples=${meta.samples} channels=${meta.channels}` +
            ` freq=${meta.frequency} len=${meta.length}` +
            ` loadType=${meta.loadType} loadState=${meta.loadState}` +
            ` ready=${meta.isReadyToPlay}${suffix}`
        );
    }

    function enablePitchFallback(owner, meta, reason) {
        const ownerKey = owner.toString();
        if (pitchFallbackOwners.has(ownerKey)) {
            return;
        }

        pitchFallbackOwners.add(ownerKey);
        const key = ownerToKey.get(ownerKey) || 'unknown_bgm';
        console.log(
            `[*] enabling pitch fallback for streaming clip key=${key} owner=${owner}` +
            ` loadType=${meta.loadType} reason=${reason} multiplier=${SPEED_MULTIPLIER}`
        );
    }

    function makeRetimedClip(originalClip, owner, reason) {
        const cacheKey = originalClip.toString();
        const cached = remappedClips.get(cacheKey);
        if (cached) {
            return cached;
        }

        if (replacementClipPtrs.has(cacheKey)) {
            return originalClip;
        }

        const before = getClipMeta(originalClip);
        logClipState(reason, owner, originalClip, before, 'before_remap');

        if (before.loadType === AUDIO_CLIP_LOAD_TYPE_STREAMING) {
            enablePitchFallback(owner, before, reason);
            return originalClip;
        }

        if (before.loadState !== 2) {
            const loadTriggered = !!audioClipLoadAudioData(originalClip);
            const afterLoadRequest = getClipMeta(originalClip);
            logClipState(reason, owner, originalClip, afterLoadRequest, `after_LoadAudioData=${loadTriggered}`);
            if (afterLoadRequest.loadState !== 2) {
                return originalClip;
            }
        }

        const samples = before.samples;
        const channels = before.channels;
        const frequency = before.frequency;

        if (samples <= 0 || channels <= 0 || frequency <= 0) {
            console.log(`[!] invalid AudioClip metadata: samples=${samples}, channels=${channels}, frequency=${frequency}`);
            return originalClip;
        }

        const totalFloats = samples * channels;
        if (totalFloats <= 0 || totalFloats > MAX_FLOAT_SAMPLES) {
            console.log(`[!] invalid sample buffer length: ${totalFloats}`);
            return originalClip;
        }

        const newFrequency = Math.max(1, Math.round(frequency * SPEED_MULTIPLIER));
        const key = ownerToKey.get(owner.toString()) || 'unknown_bgm';
        const clipName = sanitizeName(`frida_sr_x${SPEED_MULTIPLIER}_${key}`);

        let sampleBuffer;
        try {
            sampleBuffer = newFloatArray(totalFloats);
        } catch (error) {
            console.log(`[!] failed to allocate float array: ${error.message}`);
            return originalClip;
        }

        const okRead = audioClipGetData(originalClip, sampleBuffer, 0);
        if (!okRead) {
            const failureMeta = getClipMeta(originalClip);
            const failureKey = `${reason}:${cacheKey}:${failureMeta.loadState}:${failureMeta.loadType}:${failureMeta.isReadyToPlay}`;
            if (!loggedFailureKeys.has(failureKey)) {
                loggedFailureKeys.add(failureKey);
                logClipState(reason, owner, originalClip, failureMeta, 'GetData_failed');
            }
            return originalClip;
        }

        const newClip = audioClipCreate(newManagedString(clipName), samples, channels, newFrequency, false);
        if (newClip.isNull()) {
            console.log('[!] AudioClip.Create returned null');
            return originalClip;
        }

        const okWrite = audioClipSetData(newClip, sampleBuffer, 0);
        if (!okWrite) {
            console.log(`[!] AudioClip.SetData failed for ${newClip}`);
            return originalClip;
        }

        remappedClips.set(cacheKey, newClip);
        replacementClipPtrs.add(newClip.toString());
        console.log(
            `[*] remapped BGM clip ${originalClip} -> ${newClip}, ` +
            `samples=${samples}, channels=${channels}, freq=${frequency} -> ${newFrequency}, key=${key}`
        );
        return newClip;
    }

    // --- Hook 地址 ---
    const chartReturn = module.base.add(CHART_RET_RVA);
    const fromJsonChart = module.base.add(FROM_JSON_CHART_RVA);
    const markBgmCall = module.base.add(MARK_BGM_CALL_RVA);
    const replaceClipCallsite = module.base.add(REPLACE_CLIP_CALLSITE_RVA);
    const playScheduled = module.base.add(ADDRESSABLE_AUDIO_SOURCE_PLAYSCHEDULED_RVA);
    const addressableAudioSourceUpdate = module.base.add(ADDRESSABLE_AUDIO_SOURCE_UPDATE_RVA);

    console.log(`[*] 模块: ${module.name}`);
    console.log(`[*] 基址: ${module.base}`);
    console.log(`[*] SPEED_MULTIPLIER=${SPEED_MULTIPLIER}`);
    console.log(`[*] MoveNext RVA: 0x${MOVE_NEXT_RVA.toString(16)}`);
    console.log(`[*] chart_1 返回点: ${chartReturn}`);
    console.log(`[*] JsonUtility.FromJson<Chart>: ${fromJsonChart}`);
    console.log(`[*] il2cpp_string_new: ${il2cppStringNewPtr}`);
    console.log(`[*] mark BGM callsite: ${markBgmCall}`);
    console.log(`[*] replace clip callsite: ${replaceClipCallsite}`);
    console.log(`[*] play scheduled entry: ${playScheduled}`);
    console.log(`[*] addressable audio update: ${addressableAudioSourceUpdate}`);

    // ==================== Chart Hook ====================

    Interceptor.attach(fromJsonChart, {
        onEnter(args) {
            this.rawJson = null;
            this.finalJson = null;

            try {
                this.rawJson = readIl2CppString(args[0]);
                if (this.rawJson) {
                    console.log(`[*] 命中 FromJson<Chart>，JSON 预览: ${previewText(this.rawJson, 240)}`);

                    const rewritten = rewriteChartJson(this.rawJson);
                    if (rewritten) {
                        const rewrittenUtf8 = Memory.allocUtf8String(rewritten.json);
                        const rewrittenManagedString = il2cppStringNew(rewrittenUtf8);

                        args[0] = rewrittenManagedString;
                        this.finalJson = rewritten.json;

                        console.log(`[*] 已改写谱面(${SPEED_MULTIPLIER}x): notes=${rewritten.stats.totalNotes}, lines=${rewritten.stats.linesChanged}`);
                        console.log(`[*] 改写后 JSON 预览: ${previewText(rewritten.json, 240)}`);
                    } else {
                        this.finalJson = this.rawJson;
                        console.log('[!] JSON 解析失败，跳过谱面改写');
                    }
                } else {
                    console.log('[*] 命中 FromJson<Chart>，但 JSON 为空');
                }
            } catch (error) {
                console.log(`[!] 读取 FromJson<Chart> 入参失败: ${error.message}`);
            }
        },
        onLeave(retval) {
            dumpChart(retval, 'FromJson<Chart>.onLeave', this.finalJson || this.rawJson);
        },
    });

    Interceptor.attach(chartReturn, {
        onEnter() {
            dumpChart(this.context.x0, 'MoveNext+chart_return', null);
        },
    });

    // ==================== BGM Hook ====================

    Interceptor.attach(markBgmCall, {
        onEnter() {
            try {
                const owner = this.context.x0;
                const keyPtr = this.context.x1;
                if (!owner || owner.isNull()) {
                    return;
                }

                const key = readIl2CppString(keyPtr) || '<null>';
                const ownerKey = owner.toString();

                targetOwners.add(ownerKey);
                ownerToKey.set(ownerKey, key);

                console.log(`[*] marked gameplay BGM source owner=${owner} key=${key}`);
            } catch (error) {
                console.log(`[!] failed to mark BGM owner: ${error.message}`);
            }
        },
    });

    Interceptor.attach(replaceClipCallsite, {
        onEnter() {
            try {
                const owner = this.context.x20;
                const originalClip = this.context.x19;
                if (!owner || owner.isNull() || !originalClip || originalClip.isNull()) {
                    return;
                }

                const ownerKey = owner.toString();
                if (!targetOwners.has(ownerKey)) {
                    return;
                }

                const clipKeyPtr = owner.add(ADDRESSABLE_AUDIO_SOURCE_OFFSETS.clipKey).readPointer();
                const clipKey = readIl2CppString(clipKeyPtr) || ownerToKey.get(ownerKey) || '<unknown>';
                const replacement = makeRetimedClip(originalClip, owner, 'SetClipWindow');
                if (replacement.isNull() || replacement.equals(originalClip)) {
                    return;
                }

                this.context.x19 = replacement;
                console.log(`[*] replaced gameplay clip for key=${clipKey}, owner=${owner}`);
            } catch (error) {
                console.log(`[!] replace clip failed: ${error.message}`);
            }
        },
    });

    Interceptor.attach(playScheduled, {
        onEnter(args) {
            try {
                const owner = args[0];
                if (!owner || owner.isNull()) {
                    return;
                }

                const ownerKey = owner.toString();
                if (!targetOwners.has(ownerKey)) {
                    return;
                }

                const audioSource = owner.add(ADDRESSABLE_AUDIO_SOURCE_OFFSETS.audioSource).readPointer();
                if (!audioSource || audioSource.isNull()) {
                    return;
                }

                const currentClip = audioSourceGetClip(audioSource);
                if (!currentClip || currentClip.isNull()) {
                    console.log(`[*] PlayScheduled has null clip for owner=${owner}`);
                    return;
                }

                const replacement = makeRetimedClip(currentClip, owner, 'PlayScheduled');
                if (replacement.isNull() || replacement.equals(currentClip)) {
                    if (pitchFallbackOwners.has(ownerKey)) {
                        audioSourceSetPitch(audioSource, SPEED_MULTIPLIER);
                        console.log(`[*] PlayScheduled applied pitch fallback owner=${owner} pitch=${SPEED_MULTIPLIER}`);
                    }
                    return;
                }

                audioSourceSetClip(audioSource, replacement);
                console.log(`[*] PlayScheduled fallback swapped clip owner=${owner} clip=${currentClip} -> ${replacement}`);
            } catch (error) {
                console.log(`[!] PlayScheduled fallback failed: ${error.message}`);
            }
        },
    });

    Interceptor.attach(addressableAudioSourceUpdate, {
        onLeave() {
            try {
                const owner = this.context.x0;
                if (!owner || owner.isNull()) {
                    return;
                }

                const ownerKey = owner.toString();
                if (!pitchFallbackOwners.has(ownerKey)) {
                    return;
                }

                const audioSource = owner.add(ADDRESSABLE_AUDIO_SOURCE_OFFSETS.audioSource).readPointer();
                if (!audioSource || audioSource.isNull()) {
                    return;
                }

                const liveTime = audioSourceGetTime(audioSource);
                owner.add(0x38).writeFloat(liveTime);
                owner.add(0x70).writeFloat(liveTime);
            } catch (error) {
                console.log(`[!] AddressableAudioSource.Update fallback failed: ${error.message}`);
            }
        },
    });

    console.log('[*] Chart + BGM 倍速 hook 已全部安装');
}

// ======== 入口 ========

function main() {
    waitForModule(LIB_NAME, (module) => {
        try {
            installHook(module);
        } catch (error) {
            console.log(`[!] installHook failed: ${error.message}`);
        }
    });
}

setImmediate(main);
