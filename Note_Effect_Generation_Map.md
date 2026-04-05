# Note Effect Generation Map (dump_android.cs + IDA)

## Scope and Sources
- Dump source: `dump_android.cs` (Assembly-CSharp region)
- Binary analysis source: IDA via ida-pro-mcp
- Goal: map where Tap/Drag/Hold/Flick note visuals are created and where hit effects are spawned.

## 1) dump_android.cs structures and RVAs referenced

### Core gameplay controllers
- `JudgeControl` ([dump_android.cs](dump_android.cs#L300527))
  - `CheckNote`: RVA `0x214a418`
  - `CheckFlick`: RVA `0x214affc`
- `JudgeLineControl` ([dump_android.cs](dump_android.cs#L300577))
  - Fields used as note assets/prefabs:
    - `Click` `0x18`, `Drag` `0x20`, `Hold` `0x28`, `Flick` `0x30`
    - `ClickHL` `0x38`, `HoldHL0` `0x40`, `HoldHL1` `0x48`, `DragHL` `0x50`, `FlickHL` `0x58`
  - Note creation function:
    - `CreateNote(Int32 thisIndex, Boolean ifAbove)`: RVA `0x239739c`

### Per-note runtime controllers
- `ClickControl` ([dump_android.cs](dump_android.cs#L300939))
  - `Judge`: RVA `0x1f39e64`
  - `Start`: RVA `0x1f3a3b8`
  - Important fields:
    - `noteImage` `0x48`
    - `noteBad` `0x50`
- `DragControl` ([dump_android.cs](dump_android.cs#L300968))
  - `Judge`: RVA `0x1f4cd60`
  - `Start`: RVA `0x1f4d084`
- `FlickControl` ([dump_android.cs](dump_android.cs#L300997))
  - `Judge`: RVA `0x2136fdc`
  - `Start`: RVA `0x2137340`
  - Important field: `noteBad` `0x50`
- `HoldControl` ([dump_android.cs](dump_android.cs#L301026))
  - `Judge`: RVA `0x21474b8`
  - `Start`: RVA `0x2147aa8`
  - Important fields:
    - `noteImages` `0x48`
    - `holdHead` `0x60`, `holdEnd` `0x68`
    - `perfect` `0x70`, `good` `0x78`

### Score/effect dispatcher
- `ScoreControl` ([dump_android.cs](dump_android.cs#L301270))
  - Effect prefab refs:
    - `perfectJudge` `0x18`
    - `goodJudge` `0x20`
  - APIs:
    - `Miss`: RVA `0x1e98a10`
    - `Bad`: RVA `0x1e98aac`
    - `Good`: RVA `0x1e98b5c`
    - `Perfect`: RVA `0x1e98d04`

### Chart data structure
- `ChartNote` ([dump_android.cs](dump_android.cs#L300771))
  - `type` `0x10` (Tap/Drag/Hold/Flick branch selector)
  - `isJudged` `0x28`, `isJudgedForFlick` `0x29`

## 2) Function chain (runtime)

1. `JudgeControl.CheckNote/CheckFlick` decides interaction window.
2. `JudgeLineControl.CreateNote(0x239739c)` instantiates note prefab by `ChartNote.type` and assigns note sprites.
3. Per-note `*Control.Judge` decides Perfect/Good/Bad/Miss and calls `ScoreControl.*`.
4. `ScoreControl.Good/Perfect/Bad/Miss` instantiates or updates judge effect object and pushes timing/intensity values.

## 3) IDA function analysis (content + role + address)

### A. Note visual generation root
- Function: `JudgeLineControl_CreateNote`
- Address: `0x239739c`
- Role:
  - Switch on `note.type` and instantiate one of Click/Drag/Hold/Flick prefabs.
  - Inject runtime references (`levelInformation`, `progressControl`, `scoreControl`, `noteInfor`, `judgeLine`).
  - Assign note visual resources from `JudgeLineControl` fields:
    - Click branch uses `ClickHL` path
    - Drag branch uses `DragHL` path
    - Hold branch uses `HoldHL0/HoldHL1`
    - Flick branch uses `FlickHL`
- Important internal calls seen in disasm:
  - `sub_1EBFAE4` (instantiate path used repeatedly in each note branch)
  - `sub_1EBF404` (component retrieval/initialization path)
  - `sub_308FE04` (append created control to manager list)

### B. Per-note judge entrypoints
- `ClickControl_Judge` at `0x1f39e64`
  - Calls `Perfect` / `Good` / `Bad` / `Miss` based on time delta.
  - Contains explicit `noteBad` placement/transform flow (bad visual effect object handling).
- `DragControl_Judge` at `0x1f4cd60`
  - Main success path goes into `Perfect`.
  - Miss path goes into `Miss`.
- `FlickControl_Judge` at `0x2136fdc`
  - Success path uses `Perfect`.
  - Miss path uses `Miss`.
  - Also marks flick-flag style state on note objects.
- `HoldControl_Judge` at `0x21474b8`
  - Handles head-judge and tail-judge phases.
  - Uses both `Perfect` and `Good` depending on hold quality.
  - Miss path calls `Miss`.

### C. ScoreControl effect spawners
- `Miss` at `0x1e98a10`
  - Clears combo and records miss counters.
  - Pushes timing payload via `sub_30957C0(..., qword_46F3F98, ...)`.
- `Bad` at `0x1e98aac`
  - Similar payload push, with bad-specific timing offset.
- `Good` at `0x1e98b5c`
  - Instantiates/positions good judge object.
  - Scales effect with noteScale factor.
  - Pushes payload by `sub_30957C0`.
- `Perfect` at `0x1e98d04`
  - Same pattern for perfect judge object.
  - Pushes payload by `sub_30957C0`.

### D. Payload sink helper
- Function: `sub_30957C0`
- Address: `0x30957c0`
- Role:
  - Appends float payload to an internal list/array and bumps counters.
  - Used by `Miss/Bad/Good/Perfect`.
  - This is where judge effect timing/intensity queue gets written.

## 4) Address notes from IDA lookup
- In this database, some lookups may resolve nearby block starts around ScoreControl handlers.
- Practical hook recommendation:
  - Prefer dump RVAs for external scripts (as above), then verify exact function start in your local IDA database.

## 5) Direct hook targets (recommended)

### Replace note textures/visuals (Tap/Drag/Hold/Flick)
- Primary target: `JudgeLineControl_CreateNote` `0x239739c`
- Why: one root handles all four note types and sprite assignment.

### Replace hit judge effects (good/perfect/bad/miss)
- Primary targets:
  - `Good` `0x1e98b5c`
  - `Perfect` `0x1e98d04`
  - `Bad` `0x1e98aac`
  - `Miss` `0x1e98a10`
- Why: all note judge branches converge here.

### Replace bad effect object attached by click/flick logic
- `ClickControl_Judge` `0x1f39e64`
- `FlickControl_Judge` `0x2136fdc`

## 6) About particle random spread
- In the mapped judge/note creation chain above, no explicit `Random.Range`/`insideUnitCircle` spread math was found.
- Current evidence indicates random spread is likely inside spawned effect prefabs/ParticleSystem module configuration, while code here mainly performs instantiate + transform + payload push.

---
If needed, I can generate a second document with a Frida hook template indexed by these addresses.
