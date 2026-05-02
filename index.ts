import "frida-il2cpp-bridge";

// Declare console for Frida runtime
declare const console: {
    log(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
};

// Game stats tracking
const stats = {
    perfect: 0,
    goodEarly: 0,
    goodLate: 0,
    bad: 0,
    miss: 0,
    totalNotes: 0,
    deltaTList: [] as { noteCode: number; deltaT: number; judge: string }[],
};

function resetStats() {
    stats.perfect = 0;
    stats.goodEarly = 0;
    stats.goodLate = 0;
    stats.bad = 0;
    stats.miss = 0;
    stats.totalNotes = 0;
    stats.deltaTList = [];
}

function getAccuracy(): string {
    const total = stats.perfect + stats.goodEarly + stats.goodLate + stats.bad + stats.miss;
    if (total === 0) return "0.00%";
    const score = stats.perfect * 100 + (stats.goodEarly + stats.goodLate) * 65;
    return (score / (total * 100) * 100).toFixed(2) + "%";
}

function formatStatsText(): string {
    const total = stats.perfect + stats.goodEarly + stats.goodLate + stats.bad + stats.miss;
    const accuracy = getAccuracy();

    let text = "";
    text += `P:${stats.perfect} GE:${stats.goodEarly} GL:${stats.goodLate}\n`;
    text += `B:${stats.bad} M:${stats.miss} Total:${total}\n`;
    text += `Acc:${accuracy}`;

    const recent = stats.deltaTList.slice(-5);
    if (recent.length > 0) {
        text += "\n--- Delta_T (ms) ---\n";
        for (const entry of recent) {
            const dt = (entry.deltaT * 1000).toFixed(1);
            text += `#${entry.noteCode.toFixed(0)} ${entry.judge} ${dt}\n`;
        }
    }

    return text;
}

Il2Cpp.perform(() => {
    console.log(`[*] Game Stats Display loaded. Unity version: ${Il2Cpp.unityVersion}`);

    const assembly = Il2Cpp.domain.assembly("Assembly-CSharp");
    const image = assembly.image;

    const ScoreControl = image.class("ScoreControl");

    // Hook Perfect method
    ScoreControl.method("Perfect").implementation = function (...args: any[]) {
        const noteCode = args[0] as number;
        const judgeTime = args[1] as number;
        stats.perfect++;
        stats.totalNotes++;
        stats.deltaTList.push({ noteCode, deltaT: judgeTime, judge: "Perfect" });
        return this.method("Perfect").invoke(...args);
    };

    // Hook Good method
    ScoreControl.method("Good").implementation = function (...args: any[]) {
        const noteCode = args[0] as number;
        const judgeTime = args[1] as number;
        if (judgeTime <= 0) {
            stats.goodEarly++;
        } else {
            stats.goodLate++;
        }
        stats.totalNotes++;
        stats.deltaTList.push({ noteCode, deltaT: judgeTime, judge: judgeTime <= 0 ? "Good(E)" : "Good(L)" });
        return this.method("Good").invoke(...args);
    };

    // Hook Bad method
    ScoreControl.method("Bad").implementation = function (...args: any[]) {
        const noteCode = args[0] as number;
        const judgeTime = args[1] as number;
        stats.bad++;
        stats.totalNotes++;
        stats.deltaTList.push({ noteCode, deltaT: judgeTime, judge: "Bad" });
        return this.method("Bad").invoke(...args);
    };

    // Hook Miss method
    ScoreControl.method("Miss").implementation = function (...args: any[]) {
        const noteCode = args[0] as number;
        stats.miss++;
        stats.totalNotes++;
        stats.deltaTList.push({ noteCode, deltaT: 0, judge: "Miss" });
        return this.method("Miss").invoke(...args);
    };

    // Hook Update method to display stats in-game
    ScoreControl.method("Update").implementation = function (...args: any[]) {
        // Call original Update first
        const result = this.method("Update").invoke(...args);

        try {
            // Access comboText field (UnityEngine.UI.Text at offset 0x30)
            const comboTextPtr = this.handle.add(0x30).readPointer();
            if (!comboTextPtr.isNull()) {
                const comboText = new Il2Cpp.Object(comboTextPtr);
                const statsText = Il2Cpp.string(formatStatsText());
                comboText.method("set_text").invoke(statsText);
            }
        } catch (e) {
            try {
                const comboText = this.field<Il2Cpp.Object>("comboText").value;
                if (comboText && !comboText.handle.isNull()) {
                    const statsText = Il2Cpp.string(formatStatsText());
                    comboText.method("set_text").invoke(statsText);
                }
            } catch (e2) {
                // Silent fail
            }
        }

        return result;
    };

    // Hook GetLevelResultInfo to display final results
    ScoreControl.method("GetLevelResultInfo").implementation = function (...args: any[]) {
        const result = this.method("GetLevelResultInfo").invoke(...args) as Il2Cpp.Object;

        const score = result.field("score").value as number;
        const percent = result.field("percent").value as number;
        const perfect = result.field("perfect").value as number;
        const good = result.field("good").value as number;
        const bad = result.field("bad").value as number;
        const miss = result.field("miss").value as number;
        const early = result.field("early").value as number;
        const late = result.field("late").value as number;
        const maxCombo = result.field("maxCombo").value as number;

        try {
            const comboTextPtr = this.handle.add(0x30).readPointer();
            if (!comboTextPtr.isNull()) {
                const comboText = new Il2Cpp.Object(comboTextPtr);
                let finalText = `FINAL: ${Math.round(score)}\n`;
                finalText += `Perfect:${perfect} Good:${good}\n`;
                finalText += `Bad:${bad} Miss:${miss}\n`;
                finalText += `E:${early} L:${late} MaxC:${maxCombo}`;
                const text = Il2Cpp.string(finalText);
                comboText.method("set_text").invoke(text);
            }
        } catch (e) {
            console.log("[*] Failed to update text for final results");
        }

        return result;
    };

    console.log("[*] Hooks installed. Stats will be displayed in-game combo text.");
});
