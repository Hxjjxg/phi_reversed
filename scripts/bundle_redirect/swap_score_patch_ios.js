// Phigros Score Swap (指令 Patch 版): Good → 100%, Perfect → 65%
//
// ==================== 原理 ====================
//
// 原始公式: score = (perfect + good × 0.65) / total × base
//
// 原始汇编 (挑战模式 0x11E2604 / 普通模式 0x11E2668):
//   LDP  S1, S0, [X19, #0x50]   ; S1 = [+0x50]=perfect, S0 = [+0x54]=good
//   SCVTF S0, S0                 ; good → float
//   LDR  S2, [0x2FA96B0]        ; S2 = 0.65
//   FMUL S0, S0, S2             ; S0 = good × 0.65    ← 0.65 乘的是 S0
//   SCVTF S1, S1                ; perfect → float
//   FADD S_, S0, S1             ; = good×0.65 + perfect
//
// 只需交换 LDP 的目标寄存器 S0↔S1:
//   LDP  S0, S1, [X19, #0x50]   ; S0 = perfect, S1 = good
//   → FMUL S0, S0, S2           ; S0 = perfect × 0.65  (0.65 现在乘 perfect)
//   → FADD S_, S0, S1           ; = perfect×0.65 + good (good 变成 100%)
//
// ==================== 为什么不直接改常量 ====================
//
// 问题分析:
//   常量 0.65 存储在 0x2FA96B0，公式为 perfect + good × 0.65
//   Perfect 的权重 1.0 是"隐式"的 —— 它直接参与 FADD 加法，没有乘系数
//
//   如果只改常量:
//     改成 1.0 → perfect + good × 1.0 = 全部100%，不是我们要的
//     改成 X   → perfect + good × X，Perfect 永远是100%，无法变成65%
//
//   结论: 单独修改常量无法实现 "Perfect=65%, Good=100%"
//         因为 Perfect 的 100% 权重是代码结构决定的，不是常量决定的
//
// 真正的方案: 交换 LDP 加载的寄存器顺序，让 0.65 乘到 perfect 上
//
// 这不是大问题 —— 只需 patch 4 个字节 × 2 处 = 8 字节
// 比 Interceptor hook 每帧执行的方案性能更好（零运行时开销）
//

"use strict";

const LIB_NAME = "libil2cpp.so";

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

    // 两处 LDP 指令地址 (挑战模式 + 普通模式，代码结构完全相同)
    const patchTargets = [
        base.add(0x11E2604),  // 挑战模式路径
        base.add(0x11E2668),  // 普通模式路径
    ];

    // 原始指令: LDP S1, S0, [X19, #0x50]  →  0x2D4A0261
    // 目标指令: LDP S0, S1, [X19, #0x50]  →  0x2D4A0A60
    //
    // 编码差异 (ARM64 LDP SIMD Signed-offset):
    //   原始: ... Rt2=00000 Rn=10011 Rt=00001  (S1, S0)
    //   目标: ... Rt2=00001 Rn=10011 Rt=00000  (S0, S1)
    //   仅交换 Rt 和 Rt2 字段

    const ORIGINAL = [0x61, 0x02, 0x4A, 0x2D];  // LDP S1, S0, [X19, #0x50]
    const PATCHED  = [0x60, 0x0A, 0x4A, 0x2D];  // LDP S0, S1, [X19, #0x50]

    let patchCount = 0;
    for (const addr of patchTargets) {
        // 安全校验：确认原始字节匹配
        const current = addr.readByteArray(4);
        const bytes = new Uint8Array(current);
        const match = ORIGINAL.every((b, i) => bytes[i] === b);

        if (!match) {
            console.log("[!] 字节不匹配 @ " + addr +
                        " (当前: " + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ') + ")");
            continue;
        }

        // 修改内存保护 → 写入 → 恢复
        Memory.protect(addr, 4, 'rwx');
        addr.writeByteArray(PATCHED);
        patchCount++;
        console.log("[✓] Patched @ " + addr);
    }

    if (patchCount === 2) {
        console.log("[*] 全部 patch 成功！");
        console.log("[*] Perfect → 65% weight, Good → 100% weight");
        console.log("[*] 影响: 挑战模式 + 普通模式");
    } else {
        console.log("[!] 仅 patch 了 " + patchCount + "/2 处");
    }
}

Java.perform(main);

