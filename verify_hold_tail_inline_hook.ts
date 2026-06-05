import "frida-il2cpp-bridge";

declare const Il2Cpp: any;

/**
 * Read-only verifier for the proposed hold tail HL inline hook.
 *
 * Goal:
 *   Prove that JudgeLineControl.CreateNote + 0xbc8 is the native hold-HL branch
 *   point where:
 *     - X19 = JudgeLineControl
 *     - X22 = HoldControl
 *     - X23 = HoldControl.noteImages
 *     - X20 = JudgeLineControl.HoldHL1
 *   and that noteImages[2] is still the shared tail at this point.
 *
 * This script does NOT modify noteImages[2].
 */

const CREATE_NOTE_HOLD_BODY_HL_WRITE_OFFSET = 0xbc8; // 0x2397f64 - 0x239739c
const MAX_INLINE_LOGS = 120;
const MAX_NOTEMOVE_LOGS = 120;

Il2Cpp.perform(() => {
    const asm = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const JudgeLineControl = asm.class("JudgeLineControl");
    const HoldControl = asm.class("HoldControl");

    const createNote = JudgeLineControl.method("CreateNote", 2);
    const noteMove = HoldControl.method("NoteMove", 0);
    const hookAddr = createNote.virtualAddress.add(CREATE_NOTE_HOLD_BODY_HL_WRITE_OFFSET);

    const expectedBytes = [
        0xe8, 0x1a, 0x40, 0xb9, // LDR W8, [X23,#0x18]
        0x1f, 0x05, 0x00, 0x71, // CMP W8, #1
        0xe9, 0x67, 0x00, 0x54, // B.LS ...
        0xf4, 0x16, 0x00, 0xf9  // STR X20, [X23,#0x28]
    ];

    function ptrOf(value: any): NativePointer {
        return ptr(value as any);
    }

    function isNullPtr(value: NativePointer): boolean {
        return value.isNull();
    }

    function hex(value: any): string {
        try {
            const p = ptrOf(value);
            return p.isNull() ? "0x0" : p.toString();
        } catch {
            return "<err>";
        }
    }

    function samePtr(a: NativePointer, b: NativePointer): boolean {
        try {
            return a.equals(b);
        } catch {
            return a.toString() === b.toString();
        }
    }

    function readPtr(base: NativePointer, offset: number): NativePointer {
        if (base.isNull()) return NULL;
        try {
            return base.add(offset).readPointer();
        } catch {
            return NULL;
        }
    }

    function readS32(base: NativePointer, offset: number): number {
        if (base.isNull()) return -1;
        try {
            return base.add(offset).readS32();
        } catch {
            return -1;
        }
    }

    function readFloat(base: NativePointer, offset: number): number {
        if (base.isNull()) return Number.NaN;
        try {
            return base.add(offset).readFloat();
        } catch {
            return Number.NaN;
        }
    }

    function readBool(base: NativePointer, offset: number): boolean | null {
        if (base.isNull()) return null;
        try {
            return base.add(offset).readU8() !== 0;
        } catch {
            return null;
        }
    }

    function arrayLen(arrayPtr: NativePointer): number {
        return readS32(arrayPtr, 0x18);
    }

    function arrayItem(arrayPtr: NativePointer, index: number): NativePointer {
        const len = arrayLen(arrayPtr);
        if (arrayPtr.isNull() || index < 0 || index >= len) return NULL;
        return readPtr(arrayPtr, 0x20 + index * Process.pointerSize);
    }

    function bytesMatch(address: NativePointer, expected: number[]): boolean {
        try {
            const raw = address.readByteArray(expected.length);
            if (raw === null) return false;
            const actual = new Uint8Array(raw);
            if (actual.length !== expected.length) return false;
            for (let i = 0; i < expected.length; i++) {
                if (actual[i] !== expected[i]) return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    function formatRealTime(notePtr: NativePointer): string {
        const realTime = readFloat(notePtr, 0x2c);
        return Number.isFinite(realTime) ? realTime.toFixed(6) : "?";
    }

    const inlineHitsByHold = new Map<string, {
        noteImages: string;
        headBefore: string;
        bodyBefore: string;
        tailBefore: string;
        holdHl0: string;
        holdHl1: string;
        realTime: string;
    }>();

    const seenNoteMove = new Set<string>();
    let inlineLogCount = 0;
    let noteMoveLogCount = 0;

    const patternOk = bytesMatch(hookAddr.sub(12), expectedBytes);
    console.log(`[hold-inline-verify] CreateNote=${createNote.virtualAddress} hook=${hookAddr} offset=0x${CREATE_NOTE_HOLD_BODY_HL_WRITE_OFFSET.toString(16)}`);
    console.log(`[hold-inline-verify] byte-pattern ${patternOk ? "OK" : "MISMATCH"} at hook-12; script is read-only`);
    if (!patternOk) {
        console.log("[hold-inline-verify] WARNING: expected instruction pattern missing. Do not use this RVA for write-hook until IDA is rechecked.");
    }

    Interceptor.attach(hookAddr, {
        onEnter(this: InvocationContext) {
            const judgeLine = ptrOf((this.context as any).x19);
            const holdControl = ptrOf((this.context as any).x22);
            const noteImages = ptrOf((this.context as any).x23);
            const x20 = ptrOf((this.context as any).x20);

            const holdKey = hex(holdControl);
            const fieldNoteImages = readPtr(holdControl, 0x48);
            const fieldJudgeLine = readPtr(holdControl, 0x38);
            const noteInfo = readPtr(holdControl, 0x30);
            const holdHl0 = readPtr(judgeLine, 0x40);
            const holdHl1 = readPtr(judgeLine, 0x48);
            const chordSupport = readBool(judgeLine, 0x10c);

            const len = arrayLen(noteImages);
            const head0 = arrayItem(noteImages, 0);
            const body1 = arrayItem(noteImages, 1);
            const tail2 = arrayItem(noteImages, 2);

            const noteImagesMatchesField = samePtr(noteImages, fieldNoteImages);
            const judgeLineMatchesField = samePtr(judgeLine, fieldJudgeLine);
            const x20MatchesHoldHl1 = samePtr(x20, holdHl1);
            const headAlreadyHl0 = samePtr(head0, holdHl0);
            const bodyAlreadyHl1BeforeStore = samePtr(body1, holdHl1);

            inlineHitsByHold.set(holdKey, {
                noteImages: hex(noteImages),
                headBefore: hex(head0),
                bodyBefore: hex(body1),
                tailBefore: hex(tail2),
                holdHl0: hex(holdHl0),
                holdHl1: hex(holdHl1),
                realTime: formatRealTime(noteInfo)
            });

            if (inlineLogCount < MAX_INLINE_LOGS) {
                inlineLogCount++;
                console.log(
                    `[hold-inline #${inlineLogCount}] hold=${holdKey} noteImages=${hex(noteImages)} len=${len} t=${formatRealTime(noteInfo)} chord=${chordSupport}\n` +
                    `  regs: x19(judgeLine)=${hex(judgeLine)} x22(hold)=${hex(holdControl)} x23(arr)=${hex(noteImages)} x20=${hex(x20)}\n` +
                    `  field-check: hold.noteImages==x23:${noteImagesMatchesField} hold.judgeLine==x19:${judgeLineMatchesField} x20==HoldHL1:${x20MatchesHoldHl1}\n` +
                    `  before-store: arr[0]=${hex(head0)} HoldHL0=${hex(holdHl0)} arr0==HL0:${headAlreadyHl0}\n` +
                    `                arr[1]=${hex(body1)} HoldHL1=${hex(holdHl1)} arr1==HL1(before):${bodyAlreadyHl1BeforeStore}\n` +
                    `                arr[2]=${hex(tail2)}`
                );
            }
        }
    });

    Interceptor.attach(noteMove.virtualAddress, {
        onEnter(args: InvocationArguments) {
            const hold = ptrOf(args[0]);
            const holdKey = hex(hold);
            if (seenNoteMove.has(holdKey)) return;
            seenNoteMove.add(holdKey);

            const inlineInfo = inlineHitsByHold.get(holdKey);
            if (!inlineInfo) return;

            const noteImages = readPtr(hold, 0x48);
            const noteInfo = readPtr(hold, 0x30);
            const head0 = arrayItem(noteImages, 0);
            const body1 = arrayItem(noteImages, 1);
            const tail2 = arrayItem(noteImages, 2);
            const headIsHl0 = samePtr(head0, ptr(inlineInfo.holdHl0));
            const bodyIsHl1 = samePtr(body1, ptr(inlineInfo.holdHl1));
            const tailUnchanged = samePtr(tail2, ptr(inlineInfo.tailBefore));

            if (noteMoveLogCount < MAX_NOTEMOVE_LOGS) {
                noteMoveLogCount++;
                console.log(
                    `[hold-inline/notemove #${noteMoveLogCount}] hold=${holdKey} t=${formatRealTime(noteInfo)} inlineT=${inlineInfo.realTime}\n` +
                    `  final arr[0]=${hex(head0)} ==HoldHL0:${headIsHl0}\n` +
                    `        arr[1]=${hex(body1)} ==HoldHL1:${bodyIsHl1}\n` +
                    `        arr[2]=${hex(tail2)} unchangedFromInline:${tailUnchanged}\n` +
                    `  This confirms the inline hook point saw the native HL hold before NoteMove applied sprites.`
                );
            }
        }
    });

    console.log(`[hold-inline-verify] attached inline verifier and HoldControl.NoteMove cross-check @ ${noteMove.virtualAddress}`);
    console.log("[hold-inline-verify] Play a chart with hold+drag / hold+hold chords. No game data is modified by this script.");
});
