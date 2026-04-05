# Phigros Note Texture Replace - Analysis Summary

## Current Problem

The script `note_texture_replace_bridge.ts` currently only replaces **HL (Highlight)** note textures — these are the "multi-press" (双押/多押) note sprites that have a gold border in game. Single notes are not affected.

## Why: Script Only Replaces HL Fields

The script hooks `LevelControl.Awake` and replaces these 4 fields:

| Field Name | Offset | Type   | Description           |
| ---------- | ------ | ------ | --------------------- |
| `ClickHL`  | 0x58   | Sprite | Multi-press Tap note  |
| `HoldHL0`  | 0x60   | Sprite | Multi-press Hold head |
| `DragHL`   | 0x70   | Sprite | Multi-press Drag note |
| `FlickHL`  | 0x78   | Sprite | Multi-press Flick note|

There is also `HoldHL1` at offset 0x68 (Hold body HL), not currently replaced.

## LevelControl Class Layout (from dump_android.cs)

```
public class LevelControl : MonoBehaviour   // Assembly-CSharp.dll
{
    // Reference fields
    public LevelInformation levelInformation; // 0x18
    public ProgressControl progressControl;   // 0x20
    public ScoreControl scoreControl;         // 0x28
    public JudgeControl judgeControl;         // 0x30

    // Note Prefabs (GameObjects)
    public GameObject Click;     // 0x38  ← Normal Tap prefab
    public GameObject Drag;      // 0x40  ← Normal Drag prefab
    public GameObject Hold;      // 0x48  ← Normal Hold prefab
    public GameObject Flick;     // 0x50  ← Normal Flick prefab

    // HL Sprites (multi-press highlight textures)
    public Sprite ClickHL;       // 0x58  ← Multi-press Tap sprite
    public Sprite HoldHL0;       // 0x60  ← Multi-press Hold head sprite
    public Sprite HoldHL1;       // 0x68  ← Multi-press Hold body sprite
    public Sprite DragHL;        // 0x70  ← Multi-press Drag sprite
    public Sprite FlickHL;       // 0x78  ← Multi-press Flick sprite

    // Other fields
    public GameObject perfectJudge;  // 0x80
    public GameObject goodJudge;     // 0x88
    public GameObject background;    // 0x90
    public GameObject judgeLine;     // 0x98
    ...
    public Single screenW;          // 0x130
    public Single screenH;          // 0x134
    public Int32 levelModCount;     // 0x138
    public AudioClip hitAudio;      // 0x140
}
```

## Note Control Classes

Four note controller classes, each has a `noteImage` field (type `Sprite`) and a `_spriteRenderer` field:

| Class          | noteImage offset | _spriteRenderer offset | Start() RVA |
| -------------- | --------------- | ---------------------- | ----------- |
| ClickControl   | 0x48            | 0x60                   | 0x1f3a3b8   |
| DragControl    | 0x48 (Sprite)   | 0x60                   | 0x1f4d084   |
| FlickControl   | 0x48            | 0x60                   | 0x2137340   |
| HoldControl    | 0x48 (Sprite[]) | multiple renderers     | 0x2147aa8   |

### Key Difference
- `Click/Drag/Flick/Hold` (0x38-0x50 on LevelControl) are **GameObjects** (prefabs), not Sprites. The actual normal note sprite is embedded inside these prefabs.
- `ClickHL/DragHL/FlickHL/HoldHL0/HoldHL1` (0x58-0x78 on LevelControl) are **Sprite** fields directly on LevelControl.

## How Notes Get Their Sprites (from IDA analysis of `LevelControl._Start_d__40.MoveNext`)

In the coroutine `MoveNext` (RVA 0x239d300), around address 0x239db00-0x239db50, there is a block that creates note instances and copies fields from `LevelControl` (v7) to each note instance:

```
// v7 = LevelControl instance
// width_1A4BF50 = new note control instance

// Copy basic refs (scoreControl, progressControl, levelInfo, etc.)
note + 0x60 = levelControl + 0x60   // (96 = HoldHL0 → goes to note's offset)
note + 0x68 = levelControl + 0x68   // (104 = HoldHL1)
note + 0x70 = levelControl + 0x70   // (112 = DragHL)  
note + 0x38 = levelControl + 0x58   // (56/88 = Click/ClickHL)
...
note + 0x58 = levelControl + 0x78   // (88/120 = FlickHL)
```

This shows fields from LevelControl are directly copied to note control instances. The HL sprites are assigned to the note's `noteImage` field when applicable.

## What Needs to Change

The normal (non-HL) note sprites are **not** stored as Sprite fields on LevelControl — they're embedded inside the `Click`/`Drag`/`Hold`/`Flick` **prefab GameObjects**. To replace normal note textures, the approach must be different:

### Option A: Hook Each Note's `Start()` Method
Each `ClickControl.Start()`, `DragControl.Start()`, `FlickControl.Start()`, `HoldControl.Start()` initializes `_spriteRenderer`. We could hook `Start()` and replace `_spriteRenderer.sprite` after the original runs.

### Option B: Hook `SpriteRenderer.set_sprite`
Global hook that intercepts all sprite assignments and replaces matching sprites.

### Option C: Replace the sprite inside the prefab's SpriteRenderer
After LevelControl.Awake, find the `SpriteRenderer` component on each prefab GameObject (`Click`, `Drag`, `Hold`, `Flick`) and replace its sprite.

## Still Unknown / Needs Runtime Investigation

1. **Normal note sprite names** — The actual sprite/texture names for normal (non-HL) notes are baked into the prefab assets. Static analysis doesn't reveal the string names. Need a Frida script to dump `SpriteRenderer.sprite.name` at runtime to confirm.
2. **How `noteImage` is assigned for normal notes** — Need to verify whether `noteImage` is set from the prefab's SpriteRenderer directly or via some other mechanism.
3. **Exact mapping** of which LevelControl fields map to which note control fields in `MoveNext` — the decompilation is complex and the variable names are auto-generated, so the exact mapping needs runtime verification.

## Key Functions (RVA / Android libil2cpp.so)

| Function                                     | RVA        |
| -------------------------------------------- | ---------- |
| LevelControl.Awake                           | 0x239a63c  |
| LevelControl.Start (coroutine entry)         | 0x239a874  |
| LevelControl.SetInformation                  | 0x239ae34  |
| LevelControl.SetCodeForNote                  | 0x239a974  |
| LevelControl._Start_d__40.MoveNext           | 0x239d300  |
| ClickControl.Start                           | 0x1f3a3b8  |
| ClickControl.NoteMove                        | 0x1f39b5c  |
| DragControl.Start                            | 0x1f4d084  |
| FlickControl.Start                           | 0x2137340  |
| HoldControl.Start                            | 0x2147aa8  |
| NoteUpdateManager.Update                     | 0x206e1a8  |
