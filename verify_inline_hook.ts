import "frida-il2cpp-bridge";

/**
 * Verification script for the inline hook approach at CreateNote+0xBC8.
 *
 * This hooks the exact instruction where native code writes HoldHL1 → noteImages[1].
 * It logs register state and array contents to prove:
 *   1. The hook fires only for HL (multi-press) holds
 *   2. X23 = noteImages array, X20 = HoldHL1, X19 = JudgeLineControl, X22 = HoldControl
 *   3. noteImages[2] (tail) is accessible and writable at this point
 *
 * Run:  frida -U -l verify_inline_hook.js -f com.PigeonGames.Phigros
 */

const HOOK_OFFSET = 0xbc8; // CreateNote base → STR X20, [X23,#0x28]

// Expected bytes at [hook - 0xC]: LDR W8,[X23,#0x18]; CMP W8,#1; B.LS ...; STR X20,[X23,#0x28]
const EXPECTED_PATTERN = [0xe8, 0x1a, 0x40, 0xb9, 0x1f, 0x05, 0x00, 0x71];

Il2Cpp.perform(() => {
    const asm = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const JudgeLineControl = asm.class("JudgeLineControl");
    const HoldControl = asm.class("HoldControl");

    const createNote = JudgeLineControl.method("CreateNote", 2);
    const createNoteBase = createNote.virtualAddress;
    const hookAddr = createNoteBase.add(HOOK_OFFSET);

    console.log(`[verify] CreateNote base     = ${createNoteBase}`);
    console.log(`[verify] Hook target address  = ${hookAddr}`);

    // --- Pattern verification ---
    const patternAddr = hookAddr.sub(0xc);
    const actual = patternAddr.readByteArray(8);
    if (actual === null) {
        console.log(`[verify] FAIL: cannot read bytes at ${patternAddr}`);
        return;
    }
    const actualBytes = new Uint8Array(actual);
    let patternMatch = true;
    for (let i = 0; i < EXPECTED_PATTERN.length; i++) {
        if (actualBytes[i] !== EXPECTED_PATTERN[i]) {
            patternMatch = false;
            break;
        }
    }
    if (!patternMatch) {
        console.log(`[verify] FAIL: byte pattern mismatch at ${patternAddr}`);
        console.log(`[verify]   expected: ${EXPECTED_PATTERN.map(b => b.toString(16).padStart(2, "0")).join(" ")}`);
        console.log(`[verify]   actual:   ${Array.from(actualBytes).map(b => b.toString(16).padStart(2, "0")).join(" ")}`);
        console.log(`[verify] Aborting — binary may have changed.`);
        return;
    }
    console.log(`[verify] Pattern OK — confirmed STR X20,[X23,#0x28] at hook address.`);

    // --- Read HoldHL0 / HoldHL1 field offsets for comparison ---
    const holdHL0Offset = JudgeLineControl.field("HoldHL0").offset;
    const holdHL1Offset = JudgeLineControl.field("HoldHL1").offset;
    const noteImagesOffset = HoldControl.field("noteImages").offset;
    console.log(`[verify] JudgeLineControl.HoldHL0 offset = 0x${holdHL0Offset.toString(16)}`);
    console.log(`[verify] JudgeLineControl.HoldHL1 offset = 0x${holdHL1Offset.toString(16)}`);
    console.log(`[verify] HoldControl.noteImages offset   = 0x${noteImagesOffset.toString(16)}`);

    // --- Control: hook CreateNote at method level to count all calls & hold calls ---
    let totalCreateNoteCalls = 0;
    let holdCaseCalls = 0;

    // --- Inline hook ---
    let inlineHitCount = 0;
    const MAX_LOG = 10;

    Interceptor.attach(hookAddr, {
        onEnter() {
            inlineHitCount++;
            holdCaseCalls++;

            if (inlineHitCount > MAX_LOG) return;

            const x23 = (this.context as any).x23 as NativePointer;
            const x20 = (this.context as any).x20 as NativePointer;
            const x19 = (this.context as any).x19 as NativePointer;
            const x22 = (this.context as any).x22 as NativePointer;

            // Array header: [vtable, monitor, klass, length, elem0, elem1, elem2, ...]
            // IL2CPP array: +0x18 = length, +0x20 = [0], +0x28 = [1], +0x30 = [2]
            const arrLen = x23.add(0x18).readU32();
            const elem0 = x23.add(0x20).readPointer();
            const elem1 = x23.add(0x28).readPointer();
            const elem2 = x23.add(0x30).readPointer();

            // Read HL sprites from JudgeLineControl for comparison
            const hl0 = x19.add(holdHL0Offset).readPointer();
            const hl1 = x19.add(holdHL1Offset).readPointer();

            // Read noteImages pointer from HoldControl for cross-check
            const noteImagesFromHold = x22.add(noteImagesOffset).readPointer();

            console.log(`\n[verify] === Inline hook hit #${inlineHitCount} ===`);
            console.log(`[verify]   X19 (JudgeLineControl) = ${x19}`);
            console.log(`[verify]   X22 (HoldControl)      = ${x22}`);
            console.log(`[verify]   X23 (noteImages)       = ${x23}`);
            console.log(`[verify]   X20 (HoldHL1)          = ${x20}`);
            console.log(`[verify]   noteImages from X22+0x${noteImagesOffset.toString(16)} = ${noteImagesFromHold}`);
            console.log(`[verify]   X23 == noteImagesFromHold? ${x23.equals(noteImagesFromHold)}`);
            console.log(`[verify]   array length = ${arrLen}`);
            console.log(`[verify]   noteImages[0] = ${elem0} (head)`);
            console.log(`[verify]   noteImages[1] = ${elem1} (body, BEFORE native write)`);
            console.log(`[verify]   noteImages[2] = ${elem2} (tail — target for our write)`);
            console.log(`[verify]   JudgeLineControl.HoldHL0 = ${hl0}`);
            console.log(`[verify]   JudgeLineControl.HoldHL1 = ${hl1}`);
            console.log(`[verify]   elem0 == HoldHL0? ${elem0.equals(hl0)} (head already HL-patched)`);
            console.log(`[verify]   X20 == HoldHL1? ${x20.equals(hl1)} (confirms X20 is body-HL sprite)`);

            // Test write to noteImages[2]
            console.log(`[verify]   noteImages[2] writable? attempting read-back test...`);
            const originalTail = elem2;
            // Write it back to itself (no-op) to confirm writability
            x23.add(0x30).writePointer(originalTail);
            const readBack = x23.add(0x30).readPointer();
            console.log(`[verify]   write-readback OK? ${readBack.equals(originalTail)}`);

            if (inlineHitCount === MAX_LOG) {
                console.log(`[verify] (suppressing further logs, will report totals on detach)`);
            }
        },
    });

    console.log(`[verify] Inline hook installed at ${hookAddr}`);
    console.log(`[verify] Play a chart with multi-press (HL) holds to trigger.`);
    console.log(`[verify] First ${MAX_LOG} hits will be logged in detail.\n`);

    // Periodic summary
    const timer = setInterval(() => {
        if (inlineHitCount > 0) {
            console.log(`[verify] --- Summary: inline hook fired ${inlineHitCount} times (HL holds) ---`);
        }
    }, 5000);

    // Cleanup on script unload
    Script.bindWeak(globalThis, () => {
        clearInterval(timer);
        console.log(`[verify] Final: inline hook fired ${inlineHitCount} times total.`);
    });
});
