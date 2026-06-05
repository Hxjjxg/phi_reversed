import "frida-il2cpp-bridge";

/**
 * Hold note 6-way material control — NATIVE "set at creation" version.
 *
 * Hooks HoldControl.Start (@ 0x2147aa8) instead of NoteMove.
 *
 * Why Start is the most-native point (verified via IDA, see DEBUG.md):
 *  - Start has no code xref, only a vtable data ref -> it's the IL2CPP/Unity
 *    MonoBehaviour Start callback: invoked ONCE per note GameObject, right
 *    after JudgeLineControl.CreateNote instantiates the prefab and BEFORE the
 *    first NoteMove.
 *  - At Start time noteImages[] is already fully resolved:
 *      [0]=body [1]=head [2]=end, with HL (multi-press) already baked in by
 *      CreateNote (noteImages[0]=HoldHL0, [1]=HoldHL1 for chord notes).
 *  - judgeLine (0x38) and noteInfor (0x30) are already set.
 *  - SpriteRenderers are bound lazily on NoteMove's first frame, so editing the
 *    array here is sufficient — the native set_sprite runs once with our values.
 *  => single execution guaranteed by Unity (no `seen` set), zero per-frame cost.
 *
 * HL detection: noteImages[1] (head) == judgeLine.HoldHL1  -> this hold is HL.
 *
 * Fill the six getters with your Sprites; null leaves that slot native.
 * NOTE: this enables an INDEPENDENT tail-HL, which the native game cannot do
 * (it never branches the tail on HL).
 */

Il2Cpp.perform(() => {
    const img = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const HoldControl = img.class("HoldControl");
    const start = HoldControl.method("Start");

    // --- provide your six replacement Sprites (UnityEngine.Sprite); null = keep native ---
    function bodyNormal(): Il2Cpp.Object | null { return null; }
    function bodyHL(): Il2Cpp.Object | null { return null; }
    function headNormal(): Il2Cpp.Object | null { return null; }
    function headHL(): Il2Cpp.Object | null { return null; }
    function tailNormal(): Il2Cpp.Object | null { return null; }
    function tailHL(): Il2Cpp.Object | null { return null; }

    Interceptor.attach(start.virtualAddress, {
        onEnter(args) {
            const self = new Il2Cpp.Object(args[0] as NativePointer);

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
            if (tail != null && !tail.isNull()) arr.set(2, tail); // independent tail-HL

            // console.log(`[Hold.Start] HL=${isHL} -> [0]=${arr.get(0).handle} [1]=${arr.get(1).handle} [2]=${arr.get(2).handle}`);
        },
    });

    console.log(`[+] HoldControl.Start hooked @ ${start.virtualAddress} — native creation-time 6-slot control.`);
    console.log("[*] Fill the six getters with your Sprites.");
});
