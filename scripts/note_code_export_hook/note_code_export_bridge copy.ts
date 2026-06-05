import "frida-il2cpp-bridge";

declare const Il2Cpp: any;

function resolveClass(fullName: string, preferredAssemblies: string[] = []): any {
    for (const asmName of preferredAssemblies) {
        const asm = Il2Cpp.domain.tryAssembly(asmName);
        const klass = asm?.image.tryClass(fullName);
        if (klass) {
            return klass;
        }
    }

    for (const asm of Il2Cpp.domain.assemblies) {
        const klass = asm.image.tryClass(fullName);
        if (klass) {
            return klass;
        }
    }

    throw new Error(`Class not found: ${fullName}`);
}

function readFloatList(listObject: any): number[] {
    if (!listObject || listObject.isNull?.()) {
        return [];
    }

    let count = 0;
    try {
        count = Number(listObject.method("get_Count", 0).invoke());
    } catch {
        return [];
    }

    const values: number[] = [];
    let getItem: any = null;
    try {
        getItem = listObject.method("get_Item", 1);
    } catch {
        getItem = null;
    }

    for (let index = 0; index < count; index++) {
        try {
            const value = getItem ? getItem.invoke(index) : listObject.method("get_Item", 1).invoke(index);
            values.push(Number(value));
        } catch {
            break;
        }
    }

    return values;
}

function exportNoteCodes(scoreControl: any): void {
    const noteCodeList = scoreControl.field("_noteCodes").value;
    const noteCodes = readFloatList(noteCodeList);
    const payload = {
        exportedAt: new Date().toISOString(),
        count: noteCodes.length,
        noteCodes,
    };

    console.log(`[note_code_export] ${JSON.stringify(payload)}`);
}

Il2Cpp.perform(() => {
    const ScoreControl = resolveClass("ScoreControl", ["Assembly-CSharp"]);
    const setNoteCodeList = ScoreControl.method("SetNoteCodeList", 0);

    setNoteCodeList.implementation = function (this: any): void {
        this.method("SetNoteCodeList", 0).invoke();

        try {
            exportNoteCodes(this);
        } catch (error) {
            console.log(`[note_code_export] export failed: ${error}`);
        }
    };

    console.log("[note_code_export] hook installed at ScoreControl.SetNoteCodeList");
});
