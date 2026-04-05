'use strict';

/**
 * Phigros for Android — Chart 倍速改写脚本
 *
 * 目标位置：Android 版 libil2cpp.so
 * - LevelControl__Start_d__40_MoveNext: 0x239D300
 * - MoveNext 内 chart_1 返回点: 0x239D780
 * - JsonUtility.FromJson<Chart> wrapper: 0x1EBF690
 *
 * 说明：
 * - hook FromJson<Chart>，在反序列化前改写 JSON，实现倍速效果。
 * - 改写逻辑: offset /= speed, bpm *= speed, floorPosition /= speed
 */

const LIB_NAME = 'libil2cpp.so';

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

// ======== 倍速配置 ========
// 修改此值来设置倍速，例如 2.0 = 2倍速，0.5 = 半速
const SPEED_MULTIPLIER = 1.5;

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

function installHook(module) {
    const chartReturn = module.base.add(CHART_RET_RVA);
    const fromJsonChart = module.base.add(FROM_JSON_CHART_RVA);
    const il2cppStringNewPtr = module.findExportByName('il2cpp_string_new');

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

    console.log('[*] Android chart hook 已安装，进入关卡后会输出反序列化 JSON 与 chart 摘要');
}

function main() {
    waitForModule(LIB_NAME, (module) => {
        installHook(module);
    });
}

setImmediate(main);