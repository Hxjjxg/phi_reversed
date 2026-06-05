import "frida-il2cpp-bridge";

/**
 * EXPERIMENT (diagnostic, observe-only) for DEBUG.md ROOT HYPOTHESIS H1.
 *
 * Goal: verify at runtime, for Hold notes:
 *   1. noteImages.length == 3
 *   2. index mapping body=[0], head=[1], end=[2]
 *   3. HL holds have noteImages[0]==JudgeLineControl.HoldHL0 and [1]==HoldHL1,
 *      while non-HL holds keep the prefab defaults; [2] (end) identical for both.
 *   4. We can detect HL at NoteMove time by comparing noteImages[1] to judgeLine.HoldHL1.
 *
 * This does NOT modify anything. Run, hit a chart with both single and
 * chord (simultaneous) holds, read the log, then update DEBUG.md.
 */

Il2Cpp.perform(() => {
    const img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const HoldControl = img.class("HoldControl");
    const noteMove = HoldControl.method("NoteMove");

    const seen = new Set<string>();

    Interceptor.attach(noteMove.virtualAddress, {
        onEnter(args) {
            const self = new Il2Cpp.Object(args[0] as NativePointer);
            const key = self.handle.toString();
            if (seen.has(key)) return; // first-frame snapshot only
            seen.add(key);

            try {
                const arr = self.field<Il2Cpp.Array<Il2Cpp.Object>>("noteImages").value;
                const judgeLine = self.field<Il2Cpp.Object>("judgeLine").value;
                const noteInfor = self.field<Il2Cpp.Object>("noteInfor").value;

                const len = arr.isNull() ? -1 : arr.length;
                const body = !arr.isNull() && len > 0 ? arr.get(0).handle : NULL;
                const head = !arr.isNull() && len > 1 ? arr.get(1).handle : NULL;
                const end = !arr.isNull() && len > 2 ? arr.get(2).handle : NULL;

                const hl0 = judgeLine.isNull() ? NULL : judgeLine.field<Il2Cpp.Object>("HoldHL0").value.handle; // body-HL
                const hl1 = judgeLine.isNull() ? NULL : judgeLine.field<Il2Cpp.Object>("HoldHL1").value.handle; // head-HL
                const chordSupport = judgeLine.isNull() ? "?" : judgeLine.field<boolean>("chordSupport").value;

                const realTime = noteInfor.isNull() ? "?" : noteInfor.field<number>("realTime").value;

                const isHL_byHead = !head.isNull() && head.equals(hl1);
                const isHL_byBody = !body.isNull() && body.equals(hl0);

                console.log(
                    `[HoldDiag] t=${realTime} len=${len} chordSupport=${chordSupport}\n` +
                    `   body[0]=${body} head[1]=${head} end[2]=${end}\n` +
                    `   HoldHL0(body-HL)=${hl0} HoldHL1(head-HL)=${hl1}\n` +
                    `   => HL(byHead)=${isHL_byHead} HL(byBody)=${isHL_byBody}`,
                );
            } catch (e) {
                console.log(`[HoldDiag] error: ${e}`);
            }
        },
    });

    console.log(`[+] HoldControl.NoteMove diagnostic attached @ ${noteMove.virtualAddress}`);
    console.log("[*] Play a chart with single & chord holds, then inspect output.");
});
