// Phigros Score Swap: Good → 100%, Perfect → 65%
// 原理：在 ScoreControl$$Update 计算分数前，交换 perfect/good 计数器
//       计算完毕后再换回来，这样不影响判定统计显示
//
// 得分公式(普通模式):
//   NoteScore  = (perfect + good × 0.65) / total × 900,000
//   ComboScore = maxCombo × 100,000 / total
//   交换后变为：
//   NoteScore  = (good + perfect × 0.65) / total × 900,000

"use strict";

const LIB_NAME = "libil2cpp.so";

// ============ 函数偏移 (基于 IDA 分析) ============
const OFFSET = {
    // ScoreControl 方法
    ScoreControl$$Update:  0x11E2578,  // 每帧计算得分
    ScoreControl$$Perfect: 0x11E229C,  // Perfect 判定入口
    ScoreControl$$Good:    0x11E20F4,  // Good 判定入口
};

// ============ ScoreControl 对象字段偏移 ============
const FIELD = {
    _score:       0x38,  // float  - 最终得分
    _percent:     0x3C,  // float  - 百分比
    scoreOfNote:  0x40,  // float  - 音符分(不含combo)
    _combo:       0x44,  // int32  - 当前连击
    isAllPerfect: 0x48,  // bool
    isFullCombo:  0x49,  // bool
    maxcombo:     0x4C,  // int32  - 最大连击
    perfect:      0x50,  // int32  - Perfect 计数
    good:         0x54,  // int32  - Good 计数
    bad:          0x58,  // int32  - Bad 计数
    miss:         0x5C,  // int32  - Miss 计数
    early:        0x60,  // int32
    late:         0x64,  // int32
};

function swapPerfectGood(obj) {
    const pPerfect = obj.add(FIELD.perfect);
    const pGood    = obj.add(FIELD.good);
    const p = pPerfect.readS32();
    const g = pGood.readS32();
    pPerfect.writeS32(g);
    pGood.writeS32(p);
}

function main() {
    let base = null;
    try {
        base = Process.getModuleByName(LIB_NAME).base;
    } catch (_e) {
        base = null;
    }
    if (!base) {
        console.log("[-] " + LIB_NAME + " not found, retrying...");
        setTimeout(main, 1000);
        return;
    }
    console.log("[*] " + LIB_NAME + " @ " + base);

    // ======== 核心 Hook: ScoreControl$$Update ========
    // 在分数计算前交换 perfect/good，计算后换回
    Interceptor.attach(base.add(OFFSET.ScoreControl$$Update), {
        onEnter(args) {
            this.obj = args[0];  // ScoreControl* this (X0)
            swapPerfectGood(this.obj);
        },
        onLeave(_retval) {
            swapPerfectGood(this.obj);
        }
    });

    // ======== 可选: 日志 Hook ========
    // 监控每次 Perfect/Good 判定，打印实时信息
    Interceptor.attach(base.add(OFFSET.ScoreControl$$Perfect), {
        onEnter(args) {
            this.obj = args[0];
        },
        onLeave() {
            const p = this.obj.add(FIELD.perfect).readS32();
            const g = this.obj.add(FIELD.good).readS32();
            const s = this.obj.add(FIELD._score).readFloat();
            console.log(`[P] perfect=${p} good=${g} score=${s.toFixed(1)}`);
        }
    });

    Interceptor.attach(base.add(OFFSET.ScoreControl$$Good), {
        onEnter(args) {
            this.obj = args[0];
        },
        onLeave() {
            const p = this.obj.add(FIELD.perfect).readS32();
            const g = this.obj.add(FIELD.good).readS32();
            const s = this.obj.add(FIELD._score).readFloat();
            console.log(`[G] perfect=${p} good=${g} score=${s.toFixed(1)}`);
        }
    });

    console.log("[*] Score swap hooks installed!");
    console.log("[*] Good → 100% weight, Perfect → 65% weight");
}

// 等待 libil2cpp.so 加载后执行
Java.perform(main);

