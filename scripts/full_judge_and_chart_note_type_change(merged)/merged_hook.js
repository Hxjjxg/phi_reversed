'use strict';

/**
 * Phigros for Android — 合并脚本
 *
 * 功能 1：
 * - Chart 反序列化结果日志
 * - FromJson<Chart> JSON 改写
 *
 * 功能 2：
 * - 全屏判定 Patch
 *
 * 说明：
 * - 不修改原脚本，仅合并为一个新脚本。
 * - 保留原核心逻辑与日志输出风格。
 */

const LIB_NAME = 'libil2cpp.so';

/* ──────────────────────────────────────────────────────────────
 * Part 1: Chart 反序列化 / JSON 改写
 * ────────────────────────────────────────────────────────────── */

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

const loggedCharts = new Set();
const MODULE_POLL_INTERVAL_MS = 500;

function safeJsonLoads(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

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
    if (strPtr.isNull()) {
        return null;
    }

    const length = strPtr.add(0x10).readS32();
    if (length < 0 || length > 10 * 1024 * 1024) {
        throw new Error(`invalid Il2CppString length: ${length}`);
    }

    return strPtr.add(0x14).readUtf16String(length);
}

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

function previewText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength)}...`;
}

function rewriteNotes(notes, stats) {
    if (!Array.isArray(notes)) {
        return;
    }

    for (const note of notes) {
        if (!note || typeof note !== 'object') {
            continue;
        }

        const originalType = note.type;
        note.type = 2;
        note.holdTime = 0.0;
        stats.totalNotes += 1;

        if (originalType === 3) {
            note.speed = 1.0;
            stats.speedChanged += 1;
        }
    }
}

function rewriteChartJson(rawJson) {
    const chartData = safeJsonLoads(rawJson);
    if (!chartData) {
        return null;
    }

    const stats = {
        totalNotes: 0,
        speedChanged: 0,
    };

    const judgeLineList = Array.isArray(chartData.judgeLineList) ? chartData.judgeLineList : [];
    for (const judgeLine of judgeLineList) {
        if (!judgeLine || typeof judgeLine !== 'object') {
            continue;
        }

        rewriteNotes(judgeLine.notesAbove, stats);
        rewriteNotes(judgeLine.notesBelow, stats);
    }

    return {
        json: JSON.stringify(chartData),
        stats,
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

function installChartHook(module) {
    const chartReturn = module.base.add(CHART_RET_RVA);
    const fromJsonChart = module.base.add(FROM_JSON_CHART_RVA);
    const il2cppStringNewPtr = module.findExportByName('il2cpp_string_new')
        || Module.findGlobalExportByName('il2cpp_string_new');

    if (!il2cppStringNewPtr) {
        throw new Error('找不到导出符号 il2cpp_string_new');
    }

    const il2cppStringNew = new NativeFunction(il2cppStringNewPtr, 'pointer', ['pointer']);

    console.log(`[*] 模块: ${module.name}`);
    console.log(`[*] 基址: ${module.base}`);
    console.log(`[*] MoveNext RVA: 0x${MOVE_NEXT_RVA.toString(16)}`);
    console.log(`[*] chart_1 返回点: ${chartReturn}`);
    console.log(`[*] JsonUtility.FromJson<Chart>: ${fromJsonChart}`);
    console.log(`[*] il2cpp_string_new: ${il2cppStringNewPtr}`);

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

                        console.log(`[*] 已改写谱面: notes=${rewritten.stats.totalNotes}, speed改写=${rewritten.stats.speedChanged}`);
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

    console.log('[*] Android chart hook 已安装，进入关卡后会输出反序列化 JSON 与 chart 摘要');
}

/* ──────────────────────────────────────────────────────────────
 * Part 2: 全屏判定 Patch
 * ────────────────────────────────────────────────────────────── */

const JUDGE_PATCH_MODE = 'patch';

const PATCH_MODE = Object.freeze({
    patch: 'patch',
    restore: 'restore',
});

// ARM64 NOP: 1F 20 03 D5 (小端)
const ARM64_NOP_BYTES = [0x1f, 0x20, 0x03, 0xd5];

const PATCHES = [
    {
        name: 'HoldControl_Judge — Hold 尾部全屏按住 (B.PL @ +0x444)',
        rva: 0x21478FC,
        originalBytes: [0x65, 0x00, 0x00, 0x54],
        patchedBytes: ARM64_NOP_BYTES,
    },
    {
        name: 'CheckNote — Tap + Hold 头判强制 distance=0 (STR WZR @ +0x674)',
        rva: 0x214AA8C,
        originalBytes: [0x60, 0x8a, 0x00, 0xbd],
        patchedBytes: [0x7f, 0x8a, 0x00, 0xb9],
    },
    {
        name: 'DragControl_Judge — Drag 全屏判定 (B.PL @ +0x128)',
        rva: 0x1F4CE88,
        originalBytes: [0x45, 0x00, 0x00, 0x54],
        patchedBytes: ARM64_NOP_BYTES,
    },
    {
        name: 'CheckFlick — Flick 全屏判定 (B.PL @ +0x35C)',
        rva: 0x214B358,
        originalBytes: [0x25, 0x1d, 0x00, 0x54],
        patchedBytes: ARM64_NOP_BYTES,
    },
];

function readU32(addr) {
    return addr.readU32().toString(16).padStart(8, '0');
}

function normalizePatchMode(mode) {
    return mode === PATCH_MODE.restore ? PATCH_MODE.restore : PATCH_MODE.patch;
}

function getDesiredBytes(patch, mode) {
    return mode === PATCH_MODE.restore ? patch.originalBytes : patch.patchedBytes;
}

function applyPatch(base, patch) {
    const mode = normalizePatchMode(JUDGE_PATCH_MODE);
    const addr = base.add(patch.rva);
    const currentBytes = readU32(addr);
    const desiredBytes = getDesiredBytes(patch, mode);
    const desiredBytesHex = desiredBytes.map((value) => value.toString(16).padStart(2, '0')).join(' ');
    const expectedCurrentBytes = mode === PATCH_MODE.restore ? patch.patchedBytes : patch.originalBytes;
    const expectedCurrentHex = expectedCurrentBytes.map((value) => value.toString(16).padStart(2, '0')).join(' ');

    if (currentBytes === desiredBytes.slice().reverse().map((value) => value.toString(16).padStart(2, '0')).join('')) {
        console.log(`[=] ${patch.name}`);
        console.log(`    地址: ${addr}  当前已是目标机器码: 0x${currentBytes}`);
        return;
    }

    if (currentBytes !== expectedCurrentBytes.slice().reverse().map((value) => value.toString(16).padStart(2, '0')).join('')) {
        console.warn(`[!] ${patch.name}`);
        console.warn(`    地址: ${addr}  当前机器码: 0x${currentBytes}，期望切换前为: ${expectedCurrentHex}`);
    }

    try {
        Memory.patchCode(addr, 4, (code) => {
            code.writeByteArray(desiredBytes);
        });

        const patchedBytes = readU32(addr);
        const actionLabel = mode === PATCH_MODE.restore ? '恢复原码' : '应用 patch';
        console.log(`[+] ${patch.name}`);
        console.log(`    动作: ${actionLabel}`);
        console.log(`    地址: ${addr}  当前: 0x${currentBytes} → 修改后: 0x${patchedBytes} (目标字节: ${desiredBytesHex})`);
    } catch (e) {
        console.error(`[-] 失败 ${patch.name}: ${e.message}`);
    }
}

function applyPatches(base) {
    PATCHES.forEach((p) => applyPatch(base, p));
    if (normalizePatchMode(JUDGE_PATCH_MODE) === PATCH_MODE.restore) {
        console.log('[*] 所有 patch 已恢复为原始机器码');
        return;
    }

    console.log('[*] 所有 patch 已应用，全屏判定已激活');
}

/* ──────────────────────────────────────────────────────────────
 * Entry
 * ────────────────────────────────────────────────────────────── */

function main() {
    waitForModule(LIB_NAME, (module) => {
        console.log(`[*] 模块 ${module.name} 基地址: ${module.base}  大小: 0x${module.size.toString(16)}`);

        applyPatches(module.base);
        installChartHook(module);
    });
}

setImmediate(main);