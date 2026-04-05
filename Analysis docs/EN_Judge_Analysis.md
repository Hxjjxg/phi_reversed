## Main Call Chain (Overview)

- **Upper-level frame update (Note objects)**: `NoteUpdateManager$$Update (0x11BF308)`
  - Loops through and calls by type:
    - `ClickControl$$Judge (0x117CECC)`
    - `DragControl$$Judge (0x118F8F8)`
    - `HoldControl$$Judge (0x11A4EF0)`
    - `FlickControl$$Judge (0x1195014)`
  - When `Judge` returns `true`, the current note object is destroyed and removed from the corresponding List (`RemoveAt`).

- **Input matching layer (Finger -> Candidate Note)**: `JudgeControl$$Update (0x11A7924)`
  - Calls `GetFingerPosition` first every frame
  - For each finger:
    - `CheckNote (0x11A7EB0)`: Normal touch matching
    - If `isNewFlick`: `CheckFlick (0x11A8AF8)`: Flick matching
  - This layer is primarily responsible for **flagging notes as judgeable** (e.g., `isJudged` / `isJudgedForFlick`).

- **Threshold source layer**: `ProgressControl$$Update (0x11CE234)` + `JudgeControl$$.cctor (0x11A9434)`
  - Normal mode: Uses static default values (Perfect 0.08 / Good 0.18 / Bad 0.22)
  - Challenge mode: Rewrites JudgeControl time windows every frame (`_timeSum + 0.04/0.09/0.14`)

---

## Which is the "Main Judgement Function"?

Strictly speaking, there are two "main" functions:

- **Main input judgement (Finding what was hit)**: `JudgeControl$$CheckNote / CheckFlick`
  - Responsible for selecting candidate notes within the time window + spatial tolerance, and setting the `isJudged` flag.
- **Main result judgement (Assigning score grades)**: various `*Control$$Judge`
  - Reads `isJudged` and `deltaTime`, and finally calls `Perfect/Good/Bad/Miss` in `ScoreControl`.

So it is a **two-stage judgement architecture**:  
`JudgeControl` handles "matching", and `*Control.Judge` handles "settlement".

---

## Score Callback Trigger Relationships (The Core You Need)

Confirmed via `xrefs_to`:

- `ScoreControl$$Perfect (0x11E229C)` is called by:
  - `ClickControl$$Judge`
  - `DragControl$$Judge`
  - `FlickControl$$Judge`
  - `HoldControl$$Judge`
- `ScoreControl$$Good (0x11E20F4)` is called by:
  - `ClickControl$$Judge`
  - `HoldControl$$Judge`
- `ScoreControl$$Bad (0x11E2044)` is called by:
  - `ClickControl$$Judge` (Tap only)
- `ScoreControl$$Miss (0x11E1FA8)` is called by:
  - All of them call it (Click/Drag/Flick/Hold)

---

## Note Judge Branch Logic (Settlement Layer)

- **Tap (`ClickControl$$Judge`)**
  - If matched (`isJudged`):
    - `|delta| < perfect` -> `Perfect`
    - `perfect <= |delta| < good` -> `Good`
    - `|delta| >= good` -> `Bad`
  - If not matched and past the late window (`delta < -bad`) -> `Miss`

- **Drag (`DragControl$$Judge`)**
  - First checks the near time window and horizontal distance (`abs(fingerX - noteX) < 2.1`) to set `isJudged`
  - At settlement point:
    - `v5 < 0.005 && isJudged` -> `Perfect`
    - `v5 < -0.1 && !isJudged` -> `Miss`
  - No Good/Bad branches

- **Flick (`FlickControl$$Judge`)**
  - Relies on `isJudgedForFlick` (from `CheckFlick`)
  - At settlement point:
    - `v5 < 0.005 && isJudged` -> `Perfect`
    - If late by more than `-perfect*1.75` -> `Miss`
  - No Good/Bad branches

- **Hold (`HoldControl$$Judge`)**
  - Initial press phase: Can get Perfect/Good initial judgement (and records `isPerfect`)
  - Holding phase: Has a disconnect tolerance of `_safeFrame = 2`; `Miss` if exceeded
  - Final settlement phase: Gives `Perfect` or `Good` based on the initial judgement (`isHold` is flagged as 1)
  - Additional timeout without initial judgement results in `Miss`

---

## State Impact of ScoreControl's Four Functions (Decompilation Confirmed)

- `Perfect`: `combo++`, `perfect++`
- `Good`: `isAllPerfect=0`, `combo++`, `good++`, and calculates `early/late`
- `Bad`: `isAllPerfect=0`, `isFullCombo=0`, `combo=0`, `bad++`
- `Miss`: `isAllPerfect=0`, `isFullCombo=0`, `combo=0`, `miss++`

---

## "Call Relationship Graph" You Can Use Directly (Simplified)

`ProgressControl.Update`  
-> Updates Judge time windows (Normal/Challenge)

`JudgeControl.Update`  
-> `CheckNote` / `CheckFlick` (Sets note's judgeable flags)

`NoteUpdateManager.Update`  
-> `Click/Drag/Hold/FlickControl.Judge`  
-> `ScoreControl.Perfect/Good/Bad/Miss`
---
---

# Hold Note Judgement Logic — Deep Reverse Engineering Analysis

## 1. Core Call Chain Overview

```
Execution order per frame:

1. FingerManagement$$Update
   └─ Collects/updates all active touches → Fingers[] (includes phase, nowPosition, isNewFlick, etc.)

2. JudgeControl$$Update (0x11A7824)
   ├─ JudgeControl$$GetFingerPosition (0x11A7DB0)
   │   └─ For each judgeLine × each finger:
   │       Screen coordinates → Judge line local coordinates (fingerPositionX[], fingerPositionY[])
   ├─ Iterate through all fingers:
   │   ├─ if finger.phase == 0 (Began/New touch):
   │   │   └─ JudgeControl$$CheckNote (0x11A7EB0)
   │   │       └─ Find the optimal candidate note within time window + spatial tolerance → Set note.isJudged = 1
   │   └─ if finger.isNewFlick:
   │       └─ JudgeControl$$CheckFlick (0x11A8AF8)

3. NoteUpdateManager$$Update (0x11BF308)
   └─ Iterate through holdControls[]:
       ├─ HoldControl$$NoteMove (Move/Render)
       ├─ HoldControl$$Judge (0x11A4EF0)  ← Core judgement
       │   ├─ Phase 1: Initial head judgement (reads isJudged, assigns Perfect/Good)
       │   ├─ Phase 2: Continuous hold detection (iterates all fingers, checks spatial distance)
       │   ├─ Phase 3: Final settlement (assigns final score based on initial judgement)
       │   └─ Phase 4: Timeout fallback Miss
       └─ if Judge() == true → Destroy + RemoveAt
```

---

## 2. Key Data Structures

### Fingers (Touch Finger Object)
```
Fingers_Fields {
    int32_t  fingerId;
    Vector2  lastMove;
    Vector2  nowMove;
    Vector2* lastPositions;
    Vector2  lastPosition;
    Vector2  nowPosition;      // ← Screen touch coordinates (after Camera transformation)
    bool     isNewFlick;
    bool     stopped;
    int32_t  phase;            // 0=Began, 1=Moved, 2=Stationary, 3=Ended, 4=Canceled
}
```

### HoldControl (Hold Note Control Object)
```
HoldControl_Fields {
    ScoreControl*      scoreControl;
    ProgressControl*   progressControl;
    LevelInformation*  levelInformation;
    ChartNote*         noteInfor;       // Basic note info (realTime, holdTime, positionX, etc.)
    JudgeLineControl*  judgeLine;
    bool               isVisible;
    ...
    float              scale;
    GameObject*        holdHead;
    GameObject*        holdEnd;
    GameObject*        perfect;         // Perfect effect prefab
    GameObject*        good;            // Good effect prefab
    float              timeOfJudge;     // Accumulated frame time
    bool               isJudged;        // Whether head is matched (from CheckNote or self-cached)
    bool               missed;          // Whether current frame is judged as unheld
    bool               judged;          // Whether head initial judgement is complete (Perfect/Good)
    bool               judgeOver;       // Whether entire Hold judgement is over
    bool               isPerfect;       // Head initial judgement is Perfect (affects final score)
    ...
    int32_t            _safeFrame;      // Disconnect tolerance frame counter (default 0)
    float              _judgeTime;      // deltaTime during head judgement
}
```

### ChartNote (Note Chart Data)
```
ChartNote_Fields {
    int32_t  type;             // 1=Click, 2=Drag, 3=Hold, 4=Flick
    int32_t  time;
    float    positionX;        // Note local X coordinate on judge line
    float    holdTime;         // Hold duration (seconds)
    float    speed;
    float    floorPosition;
    bool     isJudged;         // ← match flag set by CheckNote
    bool     isJudgedForFlick;
    float    realTime;         // Actual judgement time of the note (seconds)
    int32_t  judgeLineIndex;   // Belonging judge line index
    int32_t  noteIndex;        // Index in notesAbove/notesBelow
    float    noteCode;         // Identifier passed to ScoreControl
}
```

### JudgeControl Static Thresholds (cctor: 0x11A9434)
```
JudgeControl_StaticFields {
    bool   inChallengeMode;
    float  perfectTimeRange = 0.08;   // ±80ms
    float  goodTimeRange    = 0.18;   // ±180ms
    float  badTimeRange     = 0.22;   // ±220ms (Bad only used by Click)
}
```

---

## 3. Touch Input → Note Matching (JudgeControl Layer)

### 3.1 GetFingerPosition — Coordinate Transformation

`JudgeControl$$GetFingerPosition` executes once per frame, transforming the screen coordinates of all fingers into the **local coordinate system** of each judge line:

```
For each judgeLine[j], for each finger[i]:
    linePos = judgeLine[j].transform.position  (World coordinate)
    fingerPos = finger[i].nowPosition          (Screen/World coordinate)
    theta = judgeLineControl[j].theta          (Judge line rotation angle)

    // Transform to judge line local X axis (along the line):
    fingerPositionX[i] = (lineY - fingerY) * sin(-θ/180*π)
                       - (lineX - fingerX) * cos(-θ/180*π)

    // Transform to judge line local Y axis (perpendicular to the line):
    fingerPositionY[i] = (lineX - fingerX) * sin(θ/180*π)
                       - cos(-θ/180*π) * (lineY - fingerY)
```

The results are stored in `JudgeLineControl.fingerPositionX[]` and `fingerPositionY[]` for subsequent judgement use.

### 3.2 CheckNote — Input Matching Algorithm

`JudgeControl$$CheckNote(fingerIndex)` is called only when `finger.phase == 0` (**New touch**):

**1) Determine Scanning Window:**
```
endIndex: Search forward until note.realTime >= nowTime + badTimeRange (0.22)
startIndex: Search backward from endIndex until note.realTime <= nowTime - goodTimeRange (0.18)

Scan range: [nowTime - 0.18, nowTime + 0.22]
// Note: Early window (+0.22) is larger than late window (0.18), because hitting early has a larger time margin
```

**2) Evaluate Note by Note:**
```
For each unjudged note within the scan window:
    touchPos = abs(fingerPositionX[fingerIndex] - note.positionX)

    if note is already judged (isJudged): Skip
    if deltaTime is not closer than current optimal (incl. 0.01 tolerance): Skip

    Spatial distance judgement + dynamic time window adjustment:
    if touchPos <= 0.9:
        _badTime = badTimeRange            // Full time window (0.22)
    elif touchPos < 1.9:
        // The further the distance, the narrower the time window (linear reduction)
        _badTime = badTimeRange + (touchPos - 0.9) * perfectTimeRange * (-0.5)
        // i.e. 0.22 - (touchPos - 0.9) * 0.04; when touchPos=1.9, _badTime = 0.18
    else:
        No match (distance too far)

    if (note.realTime - nowTime) <= _badTime:
        Record as candidate (_code = index), update _minDeltaTime

    // Type priority: Hold(type=3)/Click(type=1) > Drag(type=2)/Flick(type=4)
    // Hold/Click at the same time (±0.01) will be prioritized over Drag/Flick
    // Same type notes at the same time are chosen optimally by spatial distance (including Y axis)
```

**3) Set Flags:**
```
After finding the optimal candidate:
    // Based on the notesAbove/notesBelow list where the note is located
    note.isJudged = 1
```

**Key Point: CheckNote is only executed once on a new touch (phase=0)**. Hold head matching can only be triggered by a new touch.

---

## 4. HoldControl$$Judge — Core Hold Judgement (0x11A4EF0)

Called every frame by `NoteUpdateManager$$Update`. It is the core state machine of the entire Hold judgement, divided into 4 phases:

### 4.0 Pre-guard
```c
if (this.judged || this.missed)
    goto Phase2_HoldCheck;  // Already initially judged or Missed, jump to continuous detection
```

### 4.1 Phase 1 — Initial Head Judgement

Calculate time difference:
```c
_judgeTime = noteInfor.realTime - progressControl.nowTime
// > 0 means note hasn't arrived (hit early)
// < 0 means note passed (hit late)

isJudged = noteInfor.isJudged || this.isJudged  // Merge CheckNote flag
this.isJudged = isJudged
```

**Branch A: Not Matched (isJudged == false)**
```c
if (_judgeTime >= -goodTimeRange)    // Has not passed late window (-0.18)
    goto Phase2;                     // Continue waiting

// Past late window → Miss
this.missed = 1
ScoreControl.Miss(noteCode)
```
Note: The Miss threshold for the Hold head is `goodTimeRange(0.18)`, **NOT** Click's `badTimeRange(0.22)`.

**Branch B: Matched (isJudged == true)**
```c
v7 = abs(_judgeTime)

if (v7 < perfectTimeRange) {         // < 0.08 seconds
    this.judged = 1
    this.isPerfect = 1
    PlayHitFx(7)                     // Play Sound effect
    Instantiate(this.perfect)        // Instantiate Perfect effect
    this._judgeTime = _judgeTime
    goto Phase2
}

if (v7 < goodTimeRange) {            // < 0.18 seconds
    this.judged = 1
    this.isPerfect = 0
    PlayHitFx(7)
    Instantiate(this.good)           // Instantiate Good effect
    this._judgeTime = _judgeTime
    goto Phase2
}

// v7 >= goodTimeRange (0.18) -- Touch matched but time is too far
// Revoke match flag, allowing the note to be matched again
note.isJudged = 0
goto Phase2
```

**Table Summary: Hold Head Judgement**
| Condition | Result | isPerfect |
|------|------|-----------|
| isJudged && \|Δt\| < 0.08 | ✅ judged, Perfect effect | 1 |
| isJudged && 0.08 ≤ \|Δt\| < 0.18 | ✅ judged, Good effect | 0 |
| isJudged && \|Δt\| ≥ 0.18 | ❌ Revoke match (reset isJudged=0) | — |
| !isJudged && Δt < -0.18 | ❌ Miss | — |
| !isJudged && Δt ≥ -0.18 | ⏳ Wait | — |

---

### 4.2 Phase 2 — Continuous Hold Detection (_safeFrame Tolerance Mechanism)

**Entry conditions:** `judged == true && missed == false && judgeOver == false`
(Head initially judged successfully, not yet missed, settlement not yet completed)

Executed per frame:
```c
this.missed = 1                      // Default assumption: unheld this frame

// Get local X coordinates of all fingers on this judge line
FingerPositionX = judgeLine.fingerPositionX
numOfFingers = judgeLine.numOfFingers    // Current active finger count

if (numOfFingers < 1)
    goto SafeFrameCheck               // No fingers → Check tolerance directly

for (i = 0; i < numOfFingers; i++) {
    fingerX = FingerPositionX[i]       // Local X of the i-th finger on judge line
    noteX = noteInfor.positionX        // Local X of the note on judge line

    if (abs(fingerX - noteX) < 1.9) {  // ← Spatial tolerance: 1.9 units
        this.missed = 0               // Finger is in range!
        this._safeFrame = 2           // Reset tolerance counter
    }
}

if (this.missed) {                    // No finger in range this frame
SafeFrameCheck:
    safeFrame = this._safeFrame
    if (safeFrame < 0) {
        // Tolerance frames depleted → Hard Miss
        this.judgeOver = 1
        ScoreControl.Miss(noteCode)
    } else {
        this._safeFrame = safeFrame - 1  // Consume 1 tolerance frame
        this.missed = 0                  // Temporarily forgiven this frame
    }
}
```

**SafeFrame Tolerance Timing Diagram (After finger leaves):**
```
Frame N:   Finger in range → _safeFrame = 2, missed = 0 ✓
Frame N+1: Finger leaves   → _safeFrame 2→1, missed = 0 (Tolerance)
Frame N+2: Still no finger → _safeFrame 1→0, missed = 0 (Tolerance)
Frame N+3: Still no finger → _safeFrame 0→-1, missed = 0 (Tolerance)
Frame N+4: Still no finger → _safeFrame = -1 < 0 → judgeOver=1, Miss! ✗
```

**Actual tolerance = 3 frames** (3 chances of forgiveness before `_safeFrame` decreases from 2 to -1).
The code sets `_safeFrame = 2` but since the condition is `< 0` rather than `<= 0`, it actually allows a 3-frame disconnection.

**Important details:**
- Detects **all active fingers**, not limited to the one initially pressed.
- The spatial tolerance `1.9` is more lenient than CheckNote's initial match range of `0.9`/`1.9` (CheckNote reduces the time window between 0.9~1.9).
- The default initial value of `_safeFrame` is `0` (C# int32 default), which means if no finger is in range on the first frame right after head initial judgement, the tolerance would be 0→-1→-2... However, since `judged` is just set to true on the first frame and the code instantly proceeds to Phase 2 detection, under normal circumstances the finger is still pressing on the first frame, immediately resetting `_safeFrame` to 2.

---

### 4.3 Phase 3 — Final Settlement

**Entry conditions:**
```c
progressControl.nowTime > (noteInfor.realTime + noteInfor.holdTime - 0.22)
&& this.judged == true
&& this.judgeOver == false
```

Meaning: Current time has reached 0.22 seconds before the end of the Hold tail (triggers settlement early), head has been successfully judged, and it hasn't ended yet.

```c
isPerfect = this.isPerfect
noteCode = noteInfor.noteCode
judgeTime = this._judgeTime          // Time difference recorded at head initial judgement

if (isPerfect) {
    ScoreControl.Perfect(noteCode, -judgeTime, position, isHold=1)
} else {
    ScoreControl.Good(noteCode, -judgeTime, position, isHold=1)
}
this.judgeOver = 1
```

**Key Points:**
- The final score of Hold is entirely determined by the **head initial judgement** (isPerfect).
- The hold phase only affects whether it is a Miss, and does not affect the Perfect/Good grading.
- Settlement time is `realTime + holdTime - 0.22`, which means it **gives the score 0.22 seconds before the Hold ends**.
- The `isHold=1` parameter passed to ScoreControl flags that this is a Hold note.

---

### 4.4 Phase 4 — Timeout Fallback

**Entry conditions:**
```c
float deadline = noteInfor.realTime + noteInfor.holdTime + 0.25

if (nowTime > deadline && !judged && !missed && !judgeOver)
    ScoreControl.Miss(noteCode)
```

This is a safety net: if a Hold note isn't processed at all (neither initially judged nor Missed), it will be forced to Miss 0.25 seconds after its tail passes.

### 4.5 Return Value

```c
return nowTime > (realTime + holdTime + 0.25)
```

When the current time passes 0.25 seconds after the Hold ends, it returns `true`, and based on this, `NoteUpdateManager` destroys the Hold object and removes it from the list.

---

## 5. Complete State Transition Diagram

```
                    ┌─────────────────────────────┐
                    │         Initial State       │
                    │ judged=0, missed=0           │
                    │ judgeOver=0, _safeFrame=0    │
                    └─────────┬───────────────────┘
                              │
                    ┌─────────▼───────────────────┐
                    │     Phase 1: Wait for head  │
                    │        judgement            │
                    │  CheckNote sets isJudged=1  │
                    └────┬──────────────┬─────────┘
                         │              │
              isJudged=1 │              │ Past late window (-0.18)
              |Δt|<0.18  │              │ and isJudged=0
                         │              │
                ┌────────▼──┐    ┌──────▼────────┐
                │ Judge OK  │    │  Head Miss    │
                │ judged=1  │    │  missed=1     │
                │ isPerfect │    │  ScoreControl │
                │  = 0 or 1 │    │  .Miss()      │
                └────┬──────┘    └───────────────┘
                     │
           ┌─────────▼───────────────────────────┐
           │    Phase 2: Continuous hold         │
           │         detection (per frame)       │
           │  Iterate all fingers,               │
           │    |fingerX-noteX| < 1.9            │
           └────┬───────────────────┬────────────┘
                │                   │
         Finger in range      No finger in range
         _safeFrame=2          _safeFrame--
                │                   │
                │            ┌──────▼──────────┐
                │            │ _safeFrame < 0?  │
                │            └──┬──────────┬───┘
                │           No  │      Yes │
                │   (Tolerance) │          │
                │               │    ┌─────▼──────┐
                │               │    │ Hold Miss   │
                │               │    │ judgeOver=1 │
                │               │    │ .Miss()     │
                │               │    └─────────────┘
                │               │
           ┌────▼───────────────▼────────────────┐
           │  Phase 3: Final settlement          │
           │  nowTime > realTime+holdTime-0.22    │
           │  && judged && !judgeOver             │
           ├──────────────────────────────────────┤
           │  isPerfect=1 → ScoreControl.Perfect  │
           │  isPerfect=0 → ScoreControl.Good     │
           │  judgeOver = 1                       │
           └────┬─────────────────────────────────┘
                │
           ┌────▼──────────────────────────┐
           │  Return nowTime > realTime     │
           │        + holdTime + 0.25       │
           │  true → Destroy Hold object    │
           └────────────────────────────────┘
```

---

## 6. Key Numerical Parameters Quick Reference

| Parameter | Value | Usage |
|------|-----|------|
| `perfectTimeRange` | 0.08s (±80ms) | Hold head Perfect, CheckNote spatial reduction coefficient |
| `goodTimeRange` | 0.18s (±180ms) | Hold head Good upper bound / Hold head Miss late window |
| `badTimeRange` | 0.22s (±220ms) | CheckNote scan maximum early window |
| Hold head initial judge window | ±0.18s | Perfect/Good (No Bad grade) |
| Hold continuous detection spatial tolerance | 1.9 units | Judge line local X-axis distance |
| `_safeFrame` reset value | 2 | Tolerance frame counter |
| Actual tolerance frames | **3 frames** | 2→1→0→-1 to trigger Miss |
| Hold early settlement time | realTime+holdTime-0.22 | Gives score 0.22s before end |
| Hold destruction time | realTime+holdTime+0.25 | Destroys object 0.25s after end |
| Phase 4 Timeout Miss | realTime+holdTime+0.25 | Fallback Miss trigger time |