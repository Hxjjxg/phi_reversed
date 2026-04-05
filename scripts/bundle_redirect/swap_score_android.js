// Phigros Android - Score Swap (指令 Patch 版): Good → 100%, Perfect → 65%
//
// ==================== iOS vs Android 关键差异 ====================
//
// 1. 安卓 SO 中函数地址完全不同 (IL2CPP 编译器不同的代码布局)
// 2. 安卓版公式计算只有一处 (iOS 有挑战/普通两处)
//    安卓在模式分支前就算好了 (good*0.65+perfect)/total，再根据模式乘基数
//    所以只需 patch 一条 LDP 指令 (iOS 需要 patch 两条)
// 3. 寄存器分配相反:
//    iOS:     LDP S1, S0, [X19, #0x50]  → S1=perfect, S0=good → FMUL S0 (good*0.65)
//    Android: LDP S0, S1, [X19, #0x50]  → S0=perfect, S1=good → FMUL S1 (good*0.65)
//
// ==================== 安卓版汇编 (0x1E99078) ====================
//
//   1E99078  LDP  S0, S1, [X19, #0x50]  ; S0=perfect, S1=good
//   1E9908C  SCVTF S1, S1               ; good → float
//   1E99090  FMUL  S1, S1, S2           ; S1 = good × 0.65  ← 0.65 乘的是 S1
//   1E99098  SCVTF S0, S0               ; perfect → float
//   1E9909C  FADD  S0, S1, S0           ; S0 = good×0.65 + perfect
//
// Patch 后:
//   1E99078  LDP  S1, S0, [X19, #0x50]  ; S1=perfect, S0=good (交换)
//   → SCVTF S1, S1  → perfect as float
//   → FMUL  S1, S1, S2 → S1 = perfect × 0.65  ← 0.65 现在乘 perfect
//   → SCVTF S0, S0  → good as float
//   → FADD  S0, S1, S0 → S0 = perfect×0.65 + good ✓
//

"use strict";

const LIB_NAME = "libil2cpp.so";

// ============ 安卓版函数地址 ============
const FUNC = {
    ScoreControl_Update:   0x1E99000,
    ScoreControl_Perfect:  0x1E98D08,
    ScoreControl_Good:     0x1E98B60,
    ScoreControl_Bad:      0x1E98AB0,
    ScoreControl_Miss:     0x1E98A10,
};

// ============ ScoreControl 对象字段偏移 (与 iOS 一致) ============
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

// ============ 常量数据地址 ============
// 0x355BDE0: 0.65f (Good权重)
// 0x355BDE4: 1000000.0f (挑战模式基数)
// 0x355BDE8: 10000.0f (百分比除数)
// 0x355BDEC: 900000.0f (普通模式基数)
// 0x355BDF0: 100000.0f (连击分基数)

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

    // ======== 指令 Patch: 交换 LDP 寄存器 ========
    //
    // 安卓版只需 patch 一处 (公式在模式分支前统一计算)
    //
    // 原始: LDP S0, S1, [X19, #0x50]  →  60 06 4A 2D
    //        S0=perfect(加), S1=good(×0.65)
    // 目标: LDP S1, S0, [X19, #0x50]  →  61 02 4A 2D
    //        S1=perfect(×0.65), S0=good(加)
    //
    // ARM64 编码差异:
    //   Rt  (bits 4:0):   S0(00000) → S1(00001)  byte[0]: 0x60→0x61
    //   Rt2 (bits 14:10): S1(00001) → S0(00000)  byte[1]: 0x06→0x02

    const patchAddr = base.add(0x1E99078);
    const ORIGINAL = [0x60, 0x06, 0x4A, 0x2D];
    const PATCHED  = [0x61, 0x02, 0x4A, 0x2D];

    // 安全校验
    const current = new Uint8Array(patchAddr.readByteArray(4));
    const match = ORIGINAL.every((b, i) => current[i] === b);

    if (!match) {
        console.log("[!] 字节不匹配 @ " + patchAddr);
        console.log("[!] 期望: " + ORIGINAL.map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log("[!] 实际: " + Array.from(current).map(b => b.toString(16).padStart(2, '0')).join(' '));
        return;
    }

    Memory.protect(patchAddr, 4, 'rwx');
    patchAddr.writeByteArray(PATCHED);
    console.log("[✓] Patched LDP @ " + patchAddr);
    console.log("[*] Perfect → 65% weight, Good → 100% weight");
    console.log("[*] 影响: 挑战模式 + 普通模式 (统一计算，一处搞定)");

    // ======== 可选: 日志 Hook ========
    // 取消下面的注释可监控每次 Perfect/Good 判定

    /*
    Interceptor.attach(base.add(FUNC.ScoreControl_Perfect), {
        onLeave() {
            const obj = this.context.x0;
            const p = ptr(obj).add(FIELD.perfect).readS32();
            const g = ptr(obj).add(FIELD.good).readS32();
            const s = ptr(obj).add(FIELD._score).readFloat();
            console.log(`[P] perfect=${p} good=${g} score=${s.toFixed(1)}`);
        }
    });

    Interceptor.attach(base.add(FUNC.ScoreControl_Good), {
        onLeave() {
            const obj = this.context.x0;
            const p = ptr(obj).add(FIELD.perfect).readS32();
            const g = ptr(obj).add(FIELD.good).readS32();
            const s = ptr(obj).add(FIELD._score).readFloat();
            console.log(`[G] perfect=${p} good=${g} score=${s.toFixed(1)}`);
        }
    });
    */
}

Java.perform(main);

