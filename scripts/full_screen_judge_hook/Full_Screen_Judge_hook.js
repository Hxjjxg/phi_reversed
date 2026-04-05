'use strict';

/**
 * Phigros for Android — 全屏判定 Frida Hook 脚本
 * Target: libil2cpp.so (ARM64, il2cpp)
 *
 * ═══════════════════════════════════════════════════════════════════
 * Patch 1  HoldControl_Judge  — Hold 尾部「任意位置按住即算」
 *   函数基地址: 0x21474B8
 *   Patch 位置: 0x21478FC  (偏移 +0x444)
 *   原始指令: B.PL loc_2147908      ; 若 abs(fingerX-noteX) >= 1.9 则跳过
 *   效果:     NOP → 无论手指在屏幕哪里，每帧都触发 missed=0; _safeFrame=2
 *
 *   关键上下文（IDA 反汇编）:
 *     21478F4  FABD  S0, S9, S10    ; S0 = abs(fingerX - noteX)
 *     21478F8  FCMP  S0, S8         ; 与 1.9 比较
 *     21478FC  B.PL  loc_2147908    ; ← NOP 此处
 *     2147900  STRB  WZR,[X19,#85]  ; missed = 0
 *     2147904  STR   W23,[X19,#AC]  ; _safeFrame = 2
 *
 * ═══════════════════════════════════════════════════════════════════
 * Patch 2  CheckNote  — Tap + Hold 头判强制 distance = 0
 *   覆盖音符类型: Tap / Hold 起手
 *   函数基地址: 0x214A418
 *   Patch 位置: 0x214AA8C  (偏移 +0x674)
 *   原始指令: STR S0, [X19,#0x88]   ; 将 vabds_f32 算出的 distance 写入 this+0x88
 *   修改指令: STR WZR,[X19,#0x88]   ; 直接写入 0（位模式 0x00000000，即 float 0.0）
 *   效果:     后续 LDR S0,[X19,#88] 读到的始终是 0.0
 *             因而总是走完整时间窗分支，不再出现“只在某些 late 时机全屏”的问题
 *
 *   关键上下文（IDA 反汇编）:
 *     214AA88  FABD  S0, S14, S15   ; S0 = abs(fingerX - noteX)
 *     214AA8C  STR   S0, [X19,#88]  ; ← 改成 STR WZR,[X19,#88]
 *     214AB08  LDR   S0, [X19,#88]  ; 之后读取 distance
 *     214AB0C  FCMP  S0, S9         ; 与 1.9 比较
 *
 * ═══════════════════════════════════════════════════════════════════
 * Patch 3  DragControl_Judge  — Drag 全屏判定（跳过水平距离比较）
 *   函数基地址: 0x1F4CD60
 *   Patch 位置: 0x1F4CE88  (偏移 +0x128)
 *   原始指令: B.PL loc_1F4CE90   ; 若 abs(fingerX-noteX) >= 2.1 则跳过
 *   效果:     NOP → 无论手指在屏幕哪里，只要时间窗 ±0.1 内就设 isJudged=1
 *
 *   关键上下文（IDA 反汇编）:
 *     1F4CE80  FABD  S0, S10, S11   ; S0 = abs(fingerX - noteX)
 *     1F4CE84  FCMP  S0, S8         ; 与 2.1 比较
 *     1F4CE88  B.PL  loc_1F4CE90    ; ← NOP 此处
 *     1F4CE8C  STRB  W23,[X19,#58]  ; isJudged = 1
 *
 * ═══════════════════════════════════════════════════════════════════
 * Patch 4  CheckFlick  — Flick 全屏判定（跳过横向距离比较）
 *   调用来源: JudgeControl_Update (0x2149D80)
 *   CheckFlick: 0x214AFFC
 *   Patch 位置: 0x214B358  (偏移 +0x35C)
 *   原始指令: B.PL loc_214B6FC      ; 若 abs(fingerX-noteX) >= 2.1 则跳过该 flick 候选
 *   效果:     NOP → CheckFlick 命中时不再比较横向距离，任意位置滑动都可命中 flick
 *
 *   关键上下文（IDA 反汇编）:
 *     214B350  FABD  S0, S11, S12   ; S0 = abs(fingerX - noteX)
 *     214B354  FCMP  S0, S9         ; 与 2.1 比较
 *     214B358  B.PL  loc_214B6FC    ; ← NOP 此处
 *     214B35C  LDRSW X26, [X20,#80] ; 继续后续候选筛选逻辑
 * ═══════════════════════════════════════════════════════════════════
 */

const LIB_NAME = 'libil2cpp.so';

// ARM64 NOP: 1F 20 03 D5 (小端)
const PATCHES = [
    {
        name: 'HoldControl_Judge — Hold 尾部全屏按住 (B.PL @ +0x444)',
        rva: 0x21478FC,
    },
    {
        name: 'CheckNote — Tap + Hold 头判强制 distance=0 (STR WZR @ +0x674)',
        rva: 0x214AA8C,
        bytes: [0x7f, 0x8a, 0x00, 0xb9],
    },
    {
        name: 'DragControl_Judge — Drag 全屏判定 (B.PL @ +0x128)',
        rva: 0x1F4CE88,
    },
    {
        name: 'CheckFlick — Flick 全屏判定 (B.PL @ +0x35C)',
        rva: 0x214B358,
    },
];

// ─── 工具函数 ──────────────────────────────────────────────────────

function readU32(addr) {
    return addr.readU32().toString(16).padStart(8, '0');
}

function applyPatch(base, patch) {
    const addr = base.add(patch.rva);
    const originalBytes = readU32(addr);
    try {
        Memory.patchCode(addr, 4, (code) => {
            if (patch.bytes) {
                code.writeByteArray(patch.bytes);
                return;
            }

            const writer = new Arm64Writer(code, { pc: addr });
            writer.putNop();
            writer.flush();
        });
        const patchedBytes = readU32(addr);
        console.log(`[+] ${patch.name}`);
        console.log(`    地址: ${addr}  原始: 0x${originalBytes} → 修改后: 0x${patchedBytes}`);
    } catch (e) {
        console.error(`[-] 失败 ${patch.name}: ${e.message}`);
    }
}

// ─── 入口 ──────────────────────────────────────────────────────────

function main() {
    const mod = Process.findModuleByName(LIB_NAME);
    if (!mod) {
        // il2cpp 有时以不同名字加载，尝试模糊匹配
        const allMods = Process.enumerateModules();
        const il2cppMod = allMods.find(m => m.name.toLowerCase().includes('il2cpp'));
        if (!il2cppMod) {
            console.error(`[-] 找不到模块 "${LIB_NAME}"，请确认目标进程正确`);
            return;
        }
        console.warn(`[!] 使用备用模块名: ${il2cppMod.name}`);
        applyPatches(il2cppMod.base);
        return;
    }

    console.log(`[*] 模块 ${LIB_NAME} 基地址: ${mod.base}  大小: 0x${mod.size.toString(16)}`);
    applyPatches(mod.base);
}

function applyPatches(base) {
    PATCHES.forEach(p => applyPatch(base, p));
    console.log('[*] 所有 patch 已应用，全屏判定已激活');
}

// il2cpp 模块一般在进程启动时就已加载，可直接执行
// 如果遇到模块未加载的情况，可换用 waitForModuleInitialization 或 dlopen hook
main();
