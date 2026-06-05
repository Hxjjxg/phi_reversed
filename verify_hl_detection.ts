import "frida-il2cpp-bridge";

declare const Il2Cpp: any;

/**
 * 観測専用（何も書き換えない）。
 *
 * 目的: Hold の多押し(HL)判定を「原生が焼き込んだ結果を読む」方式に統一できるか検証する。
 *
 * HoldControl.NoteMove の入口で、同じ Hold ノートに対して 3 つの判定を比較する:
 *   A) 提案方式 : noteImages[0] == judgeLine.HoldHL0   (= 原生が CreateNote で HL 時のみ書き込む head-HL)
 *   B) 既存方式 : floorPosition ベースの前後隣接ノート比較 (note_texture_replace_bridge_changed.ts と同じ)
 *   C) 原生相当 : realTime(ChartNote+0x2c) ベースの前後隣接ノート比較 (CreateNote の vabds_f32(+44) を再現)
 *
 * A==C が常に成立すれば、提案方式 A は原生判定と一致する（=判定の再実装が不要）と確定。
 * A!=B の箇所が、既存スクリプトが取りこぼす/誤検出するケース。
 *
 * 各 Hold につき 1 回だけログ（seen で去重）。谱面はブロックしない（read only）。
 */

Il2Cpp.perform(() => {
    const asm = Il2Cpp.domain.assembly("Assembly-CSharp").image;
    const HoldControl = asm.class("HoldControl");
    const noteMove = HoldControl.method("NoteMove", 0);

    const seen = new Set<string>();
    let logCount = 0;
    let mismatchAC = 0;
    const MAX_LOG = 2000;

    const handleStr = (o: any): string => {
        try { return o?.handle?.toString?.() ?? "0x0"; } catch { return "<err>"; }
    };
    const isNull = (o: any): boolean => {
        try { return !o || o.isNull?.() === true; } catch { return true; }
    };
    const sameObj = (a: any, b: any): boolean => {
        if (isNull(a) || isNull(b)) return false;
        try { return a.handle.equals(b.handle); } catch { return handleStr(a) === handleStr(b); }
    };

    const listCount = (lst: any): number => {
        if (isNull(lst)) return 0;
        try { return Number(lst.method("get_Count", 0).invoke()); } catch { return 0; }
    };
    const listItem = (lst: any, i: number): any => {
        if (isNull(lst) || i < 0) return null;
        try { return lst.method("get_Item", 1).invoke(i); } catch { return null; }
    };

    // ChartNote field readers
    const noteField = (n: any, name: string): number => {
        try { return Number(n.field(name).value); } catch { return Number.NaN; }
    };

    // 提案方式 A: 原生が焼き込んだ head-HL を読む
    const detectA = (hold: any, judgeLine: any): boolean | null => {
        try {
            const arr = hold.field("noteImages").value;
            if (isNull(arr) || arr.length < 1) return null;
            const head = arr.get(0);
            const hl0 = judgeLine.field("HoldHL0").value;   // head-HL
            if (isNull(hl0)) return false;
            return sameObj(head, hl0);
        } catch { return null; }
    };

    // 共通: 同一リスト内の前後隣接ノートを field 名で比較
    const neighborChord = (judgeLine: any, list: any, idx: number, field: string, tol: number): boolean => {
        const cur = listItem(list, idx);
        if (isNull(cur)) return false;
        const curV = noteField(cur, field);
        if (!Number.isFinite(curV)) return false;
        const prev = listItem(list, idx - 1);
        if (!isNull(prev) && Math.abs(noteField(prev, field) - curV) < tol) return true;
        const next = listItem(list, idx + 1);
        if (!isNull(next) && Math.abs(noteField(next, field) - curV) < tol) return true;
        return false;
    };

    // この Hold が judgeLine の notesAbove / notesBelow のどちらの何番目かを noteInfor 同一性で探す
    const locate = (judgeLine: any, noteInfor: any): { list: any; idx: number; above: boolean } | null => {
        for (const above of [true, false]) {
            let lst: any = null;
            try { lst = judgeLine.field(above ? "notesAbove" : "notesBelow").value; } catch { lst = null; }
            if (isNull(lst)) continue;
            const c = listCount(lst);
            for (let i = 0; i < c; i++) {
                if (sameObj(listItem(lst, i), noteInfor)) return { list: lst, idx: i, above };
            }
        }
        return null;
    };

    Interceptor.attach(noteMove.virtualAddress, {
        onEnter(args: any) {
            const self = new Il2Cpp.Object(args[0]);
            const key = handleStr(self);
            if (seen.has(key)) return;
            seen.add(key);
            if (logCount >= MAX_LOG) return;

            try {
                const judgeLine = self.field("judgeLine").value;
                const noteInfor = self.field("noteInfor").value;
                if (isNull(judgeLine) || isNull(noteInfor)) return;

                let chordSupport = false;
                try { chordSupport = !!judgeLine.field("chordSupport").value; } catch {}

                const A = detectA(self, judgeLine);

                const loc = locate(judgeLine, noteInfor);
                let B: boolean | null = null;
                let C: boolean | null = null;
                if (loc && chordSupport) {
                    B = neighborChord(judgeLine, loc.list, loc.idx, "floorPosition", 0.001);
                    C = neighborChord(judgeLine, loc.list, loc.idx, "realTime", 0.001);
                } else if (loc) {
                    B = false; C = false;
                }

                const realTime = noteField(noteInfor, "realTime");
                const agreeAC = (A === C);
                if (A !== null && C !== null && !agreeAC) mismatchAC++;

                logCount++;
                console.log(
                    `[hl-verify #${logCount}] t=${realTime} chord=${chordSupport} ` +
                    `loc=${loc ? (loc.above ? "above" : "below") + "[" + loc.idx + "]" : "??"} ` +
                    `A(read-native)=${A} B(floorPos)=${B} C(realTime)=${C} ` +
                    `A==C:${agreeAC}${A !== B ? " [A!=B]" : ""}${!agreeAC ? " <<< MISMATCH" : ""} ` +
                    `(cumMismatchAC=${mismatchAC})`
                );
            } catch (e) {
                console.log(`[hl-verify] err: ${e}`);
            }
        },
    });

    console.log(`[+] HL detection verifier attached @ ${noteMove.virtualAddress} (read-only)`);
    console.log(`[*] Play a chart with single + chord holds (incl. hold+drag, hold+hold same time). Watch for MISMATCH.`);
});
