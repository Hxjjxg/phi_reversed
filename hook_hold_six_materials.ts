import "frida-il2cpp-bridge";

/**
 * Hold note 6-way material control (ROOT HYPOTHESIS H1 — see DEBUG.md).
 *
 * Native facts (verified via IDA against dump_android.cs):
 *  - HoldControl.noteImages is a 3-element Sprite[]: [0]=body, [1]=head, [2]=end.
 *  - JudgeLineControl.CreateNote decides HL (multi-press) PER NOTE at creation:
 *      if chordSupport && a neighbor note shares realTime (|dt|<=0.001s):
 *          noteImages[0] = JudgeLineControl.HoldHL0 (body-HL)
 *          noteImages[1] = JudgeLineControl.HoldHL1 (head-HL)
 *      noteImages[2] (END/tail) is NEVER swapped -> tail shares one sprite.
 *  - HoldControl.NoteMove applies noteImages[] to the 3 SpriteRenderers on the
 *    note's FIRST frame (once per note).
 *
 * Therefore, to control all SIX slots independently — including a tail-HL that
 * the native game does not distinguish — we hook NoteMove (the per-note point
 * where HL is already baked in) and rewrite noteImages[0..2] right before the
 * native first-frame set_sprite runs.
 *
 * HL detection at NoteMove (no need to re-run the neighbor-timing scan):
 *   compare current noteImages[1] (head) against judgeLine.HoldHL1.
 *   Equal  -> this hold is HL (multi-press).
 *   (Equivalently compare noteImages[0] to HoldHL0.)
 *
 * Fill in the six getters below with your own loaded Sprites. Any getter
 * returning null leaves that slot untouched (keeps the native sprite).
 */

Il2Cpp.perform(() => {
    const img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const HoldControl = img.class("HoldControl");
    const noteMove = HoldControl.method("NoteMove");

    // ----------------------------------------------------------------------
    // Provide your six replacement Sprites here (Il2Cpp.Object of UnityEngine.Sprite).
    // Return null to keep the game's original sprite for that slot.
    // ----------------------------------------------------------------------
    function bodyNormal(): Il2Cpp.Object | null { return null; }
    function bodyHL(): Il2Cpp.Object | null { return null; }
    function headNormal(): Il2Cpp.Object | null { return null; }
    function headHL(): Il2Cpp.Object | null { return null; }
    function tailNormal(): Il2Cpp.Object | null { return null; }
    function tailHL(): Il2Cpp.Object | null { return null; }

    const seen = new Set<string>();

    Interceptor.attach(noteMove.virtualAddress, {
        onEnter(args) {
            const self = new Il2Cpp.Object(args[0] as NativePointer);
            const key = self.handle.toString();
            if (seen.has(key)) return; // only the first frame assigns sprites
            seen.add(key);

            const arr = self.field<Il2Cpp.Array<Il2Cpp.Object>>("noteImages").value;
            if (arr.isNull() || arr.length < 3) return;

            const judgeLine = self.field<Il2Cpp.Object>("judgeLine").value;
            let isHL = false;
            if (!judgeLine.isNull()) {
                const hl1 = judgeLine.field<Il2Cpp.Object>("HoldHL1").value; // head-HL
                const head = arr.get(1);
                isHL = !head.isNull() && !hl1.isNull() && head.handle.equals(hl1.handle);
            }

            const body = isHL ? bodyHL() : bodyNormal();
            const head = isHL ? headHL() : headNormal();
            const tail = isHL ? tailHL() : tailNormal();

            if (body != null && !body.isNull()) arr.set(0, body);
            if (head != null && !head.isNull()) arr.set(1, head);
            if (tail != null && !tail.isNull()) arr.set(2, tail); // <-- enables independent tail-HL

            // console.log(`[Hold] HL=${isHL} body=${arr.get(0).handle} head=${arr.get(1).handle} tail=${arr.get(2).handle}`);
        },
    });

    console.log(`[+] HoldControl.NoteMove hooked @ ${noteMove.virtualAddress} — 6-slot control ready.`);
    console.log("[*] Fill bodyNormal/bodyHL/headNormal/headHL/tailNormal/tailHL with your Sprites.");
});
