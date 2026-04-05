'use strict';

const LIB_NAME = 'libil2cpp.so';

// Change this multiplier as needed. 1.25 means 25% faster and higher pitch.
const SPEED_MULTIPLIER = 1.75;

// LevelControl__Start_d__40_MoveNext callsite:
// AddressableAudioSource_set_Clip(progressControl.audioSource, musicAddressableKey)
const MARK_BGM_CALL_RVA = 0x239D7E0;

// AddressableAudioSource__SetClip_d__41_MoveNext callsite:
// MOV X1, X19 ; BL UnityEngine_set_clip
// Hook here so replacing X19 also updates AddressableAudioSource.clipFile later.
const REPLACE_CLIP_CALLSITE_RVA = 0x1F96128;

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

const MODULE_POLL_INTERVAL_MS = 500;
const MAX_FLOAT_SAMPLES = 100 * 1024 * 1024;
const ADDRESSABLE_AUDIO_SOURCE_PLAYSCHEDULED_RVA = 0x1F959A8;
const ADDRESSABLE_AUDIO_SOURCE_UPDATE_RVA = 0x1F9558C;
const AUDIO_CLIP_LOAD_TYPE_STREAMING = 2;

const targetOwners = new Set();
const ownerToKey = new Map();
const remappedClips = new Map();
const replacementClipPtrs = new Set();
const loggedFailureKeys = new Set();
const pitchFallbackOwners = new Set();

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
    if (length < 0 || length > 1024 * 1024) {
        throw new Error(`invalid Il2CppString length: ${length}`);
    }

    return strPtr.add(0x14).readUtf16String(length);
}

function findExport(module, name) {
    return module.findExportByName(name) || Module.findGlobalExportByName(name);
}

function sanitizeName(text) {
    return text.replace(/[^0-9A-Za-z_.-]/g, '_').slice(0, 96);
}

function installHook(module) {
    if (SPEED_MULTIPLIER <= 0) {
        throw new Error(`invalid SPEED_MULTIPLIER: ${SPEED_MULTIPLIER}`);
    }

    const il2cppStringNewPtr = findExport(module, 'il2cpp_string_new');
    const il2cppGetCorlibPtr = findExport(module, 'il2cpp_get_corlib');
    const il2cppClassFromNamePtr = findExport(module, 'il2cpp_class_from_name');
    const il2cppArrayNewPtr = findExport(module, 'il2cpp_array_new');

    if (!il2cppStringNewPtr || !il2cppGetCorlibPtr || !il2cppClassFromNamePtr || !il2cppArrayNewPtr) {
        throw new Error('required il2cpp exports are missing');
    }

    const il2cppStringNew = new NativeFunction(il2cppStringNewPtr, 'pointer', ['pointer']);
    const il2cppGetCorlib = new NativeFunction(il2cppGetCorlibPtr, 'pointer', []);
    const il2cppClassFromName = new NativeFunction(il2cppClassFromNamePtr, 'pointer', ['pointer', 'pointer', 'pointer']);
    const il2cppArrayNew = new NativeFunction(il2cppArrayNewPtr, 'pointer', ['pointer', 'uint64']);

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

    const markBgmCall = module.base.add(MARK_BGM_CALL_RVA);
    const replaceClipCallsite = module.base.add(REPLACE_CLIP_CALLSITE_RVA);
    const playScheduled = module.base.add(ADDRESSABLE_AUDIO_SOURCE_PLAYSCHEDULED_RVA);
    const addressableAudioSourceUpdate = module.base.add(ADDRESSABLE_AUDIO_SOURCE_UPDATE_RVA);

    console.log(`[*] module: ${module.name}`);
    console.log(`[*] base: ${module.base}`);
    console.log(`[*] SPEED_MULTIPLIER=${SPEED_MULTIPLIER}`);
    console.log(`[*] mark BGM callsite: ${markBgmCall}`);
    console.log(`[*] replace clip callsite: ${replaceClipCallsite}`);
    console.log(`[*] play scheduled entry: ${playScheduled}`);
    console.log(`[*] addressable audio update: ${addressableAudioSourceUpdate}`);

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

    console.log('[*] BGM samplerate hook installed');
}

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
