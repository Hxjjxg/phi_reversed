# Phigros Chart Loading and Note List Construction Reverse Engineering Analysis

## I. Conclusion Overview

In the current version, the chart is not read directly within the judgment layer or `LevelInformation`. Instead, during the level startup coroutine, the `TextAsset` is asynchronously fetched using a resource key, and then directly deserialized into a `Chart` object.

The main chain is as follows:

```text
LevelControl.Start
  -> LevelControl._Start_d__42$$MoveNext (0x11AFF7C)
  -> LevelStartInfo.chartAddressableKey
  -> AssetStore.Get<TextAsset> (0x121EB18)
  -> AssetStore.AssetRef<TextAsset>.get_WaitForPrepare
  -> TextAsset.text
  -> UnityEngine.JsonUtility.FromJson<Chart> (0x2BBAD64)
  -> Chart
  -> Chart.Mirror (Optional)
  -> LevelInformation.judgeLineList = chart.judgeLineList
  -> SortForNoteWithFloorPosition
  -> SetCodeForNote
  -> SetInformation
  -> SortForAllNoteWithTime
  -> LevelInformation.chartLoaded = true
```

The actual total note list consumed at runtime is not a separate array directly given in the JSON, but is flattened by `SetInformation` from the `notesAbove` / `notesBelow` of each `JudgeLine` and written into `LevelInformation.chartNoteSortByTime`.

---

## II. Key Data Structures

### 1. ChartNote

Definition location: `ChartNote` class in `dump.cs`.

Key fields:

- `type`
- `time`
- `positionX`
- `holdTime`
- `speed`
- `floorPosition`
- `realTime`
- `judgeLineIndex`
- `noteIndex`
- `noteCode`
- `isJudged`
- `isJudgedForFlick`

Explanation: The first six fields correspond to the original contents of the chart JSON; the following `realTime`, `judgeLineIndex`, `noteIndex`, and `noteCode` are fields added during the runtime arrangement phase.

### 2. JudgeLine

Definition location: `JudgeLine` class in `dump.cs`.

Key fields:

- `bpm`
- `speedEvents`
- `notesAbove`
- `notesBelow`
- `judgeLineDisappearEvents`
- `judgeLineMoveEvents`
- `judgeLineRotateEvents`

Explanation: Completely corresponds to the structure in `ez.txt.pretty.json` / `chart.txt`.

### 3. Chart

Functions:

- `Chart$$Mirror (0x117C97C)`
- `Chart$$GetNoteCount (0x117CA84)`
- `Chart$$.ctor (0x117CBB4)`

Key fields:

- `formatVersion`
- `offset`
- `judgeLineList`

Explanation: This is the direct target type for `JsonUtility.FromJson<Chart>`.

### 4. LevelInformation

Functions:

- `LevelInformation$$Start (0x11B0E3C)`
- `LevelInformation$$Update (0x11B0EB8)`
- `LevelInformation$$.ctor (0x11B1128)`

Key fields:

- `judgeLineList`
- `chartNoteSortByTime`
- `numOfNotes`
- `offset`
- `noteScale`
- `scale`
- `chartLoaded`

Explanation: `judgeLineList` stores the judgment line data of the entire chart; `chartNoteSortByTime` is the flattened note list ultimately used at runtime.

### 5. LevelStartInfo

Key fields:

- `musicAddressableKey`
- `chartAddressableKey`
- `judgeLineImages`

Explanation: `chartAddressableKey` is the entry key for chart resources, not a direct file path.

### 6. AssetStore / AssetRef<T>

Key functions:

- `AssetStore.Get<TextAsset> (0x121EB18)`

Key properties and methods:

- `AssetStore.AssetRef<T>.Obj`
- `AssetStore.AssetRef<T>.WaitForPrepare`
- `AssetStore.AssetRef<T>.ReleaseAll`

Explanation: This is the resource layer wrapper. The level logic uses it to get the `TextAsset` by key. If the resource is not ready, it waits on `WaitForPrepare`, and reads the object after preparation is complete.

---

## III. Chart Loading Entry Point

### Core Functions

- `LevelControl$$Start (0x11ACF00)`
- `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)`

### Logic Explanation

`LevelControl.Start` is a coroutine, and the real logic is in the compiler-generated `MoveNext`.

Chart loading steps in the coroutine:

1. Retrieve the current level parameters from `GameInformation._main.levelStartInfo`.
2. Read `levelStartInfo.chartAddressableKey`.
3. Call `AssetStore.Get<TextAsset>` to fetch the chart text resource wrapper object.
4. If `AssetRef.obj` is still null, yield `AssetRef.WaitForPrepare` to wait for the resource layer to finish preparing.
5. Once the resource is ready, read `TextAsset.text`.
6. Call `UnityEngine.JsonUtility.FromJson<Chart>` to directly deserialize the JSON text into `Chart`.
7. Write the result to `LevelControl.chart`.
8. Call `AssetRef.ReleaseAll` to release the current chart text reference.

### Key Points

- No manually-written JSON field parsing loops are seen here.
- `Newtonsoft.Json` is not seen participating in this main chain either.
- The main path for current level charts is clearly `JsonUtility.FromJson<Chart>`.

---

## IV. Initialization Process After Deserialization

Still occurs within `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)`.

### 1. Mirror Processing

If `LevelStartInfo._mirror_k__BackingField` is true, it calls:

- `Chart$$Mirror (0x117C97C)`

Role: Performs mirroring on the chart, internally calling the mirroring logic of each `JudgeLine`.

### 2. Audio Setup

Inside the function, it will also set:

- `levelStartInfo.musicAddressableKey`

to `progressControl.audioSource`. This indicates that both the chart and music are retrieved via the same set of resource key systems.

### 3. Basic Level Information Writing

The function writes the contents of the deserialized `Chart` into `LevelInformation`:

- `LevelInformation.offset = chart.offset + gameOffset + mainOffset`
- `LevelInformation.noteScale = gameInformation.noteScale`
- `LevelInformation.scale = noteScale adjusted according to screen ratio`
- `LevelInformation.musicVol = gameInformation.musicVol`
- `LevelInformation.hitFxIsOn = gameInformation.hitFxIsOn`
- `LevelInformation.numOfNotes = Chart.GetNoteCount()`
- `LevelInformation.speed = gameInformation.speed`
- `LevelInformation.judgeLineList = chart.judgeLineList`

The total number of notes comes from:

- `Chart$$GetNoteCount (0x117CA84)`

---

## V. Note List Arrangement Phase

In `MoveNext`, after the chart is parsed successfully, it sequentially calls the following functions:

1. `LevelControl$$SortForNoteWithFloorPosition (0x11AD228)`
2. `LevelControl$$SetCodeForNote (0x11ACFF8)`
3. `LevelControl$$SetInformation (0x11AD4A8)`
4. `LevelControl$$SortForAllNoteWithTime (0x11AF80C)`

These four steps together complete the conversion from raw chart data to runtime consumption data.

### 1. SortForNoteWithFloorPosition

Function: `LevelControl$$SortForNoteWithFloorPosition (0x11AD228)`

Role:

- Iterates over `LevelInformation.judgeLineList`
- Sorts `notesAbove` and `notesBelow` for each line respectively

Significance:

- Ensures notes within the same line have a stable floorPosition sequence before entering further processing.

### 2. SetCodeForNote

Function: `LevelControl$$SetCodeForNote (0x11ACFF8)`

Role:

- Iterates over each `JudgeLine`
- Writes `noteCode` for each `ChartNote` in `notesAbove` / `notesBelow`

Encoding characteristics:

- `notesAbove` of the same line increases from a smaller value
- `notesBelow` increases from another set of large offset values
- Different judgeLines use larger stepping segments

Significance:

- `noteCode` is subsequently used for judgment, scoring, or UI identification, acting as part of the unique identifier at runtime.

### 3. SetInformation

Function: `LevelControl$$SetInformation (0x11AD4A8)`

This is the core function for "getting the note list".

#### Core Responsibilities

1. Iterate over `LevelInformation.judgeLineList`
2. Iterate over `notesAbove` and `notesBelow` of each line respectively
3. Calculate runtime fields for each `ChartNote`
4. Append all notes to `LevelInformation.chartNoteSortByTime`

#### Confirmed Field Writes

Through decompilation and disassembly, it is confirmed that this function writes to each `ChartNote`:

- `realTime`
- The runtime converted value of `holdTime`
- `judgeLineIndex`
- `noteIndex`
- `isJudged = 0`

And calls:

- `List<ChartNote>.Add`

to insert the note into `LevelInformation.chartNoteSortByTime`.

#### realTime Calculation

Uses:

- `LevelControl$$GetRealTime (0x11AF7F8)`

Formula is:

```text
realTime = time * 1.875 / bpm
```

This is consistent with the conversion relationship of Phigros chart units `1/128 beat`.

#### holdTime Conversion

In `SetInformation`, `holdTime` will also be mathematically converted based on bpm into seconds used at runtime, rather than keeping the chart tick units from JSON.

#### List Flattening

This is the most crucial point:

- Notes in the original JSON are scattered in `judgeLineList[*].notesAbove` / `notesBelow`
- `SetInformation` extracts them one by one and appends them to `LevelInformation.chartNoteSortByTime`

Therefore:

- `judgeLineList` is the original structured chart
- `chartNoteSortByTime` is the total note list at runtime

### 4. SortForAllNoteWithTime

Function: `LevelControl$$SortForAllNoteWithTime (0x11AF80C)`

Role:

- Performs final ranking on `LevelInformation.chartNoteSortByTime`
- Sort key is `realTime` of `ChartNote`

Significance:

- Facilitates downstream `JudgeControl`, `NoteUpdateManager`, and various `*Control` to consume notes in chronological order.

---

## VI. Runtime Connection Points After Loading Complete

After completion of arrangement in `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)`:

1. `judgeControl.chartNoteSortByTime = levelInformation.chartNoteSortByTime`
2. Instantiate the corresponding amount of `JudgeLineControl` based on the quantity of `judgeLineList`
3. Finally set:
   - `LevelInformation.chartLoaded = true`

This implies:

- `chartLoaded` is the flag indicating "chart parsing and runtime arrangement are complete", not the flag for "TextAsset has been read".
- Before it is set, the judgment update layer will not consume the note list normally.

---

## VII. Key Function List

### Resource and Deserialization

- `LevelControl$$Start (0x11ACF00)`
  - Level start coroutine entry

- `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)`
  - Main logic for chart loading, deserialization, and level initialization

- `AssetStore.Get<TextAsset> (0x121EB18)`
  - Fetches the chart text resource using `chartAddressableKey`

- `UnityEngine.JsonUtility.FromJson<Chart> (0x2BBAD64)`
  - JSON text -> `Chart`

### The Chart Object Itself

- `Chart$$Mirror (0x117C97C)`
  - Mirror the chart

- `Chart$$GetNoteCount (0x117CA84)`
  - Count total notes

### Note Runtime Arrangement

- `LevelControl$$SortForNoteWithFloorPosition (0x11AD228)`
  - Sorts notes within each judgment line by floorPosition

- `LevelControl$$SetCodeForNote (0x11ACFF8)`
  - Generates noteCode for each note

- `LevelControl$$GetRealTime (0x11AF7F8)`
  - `time -> realTime` conversion function

- `LevelControl$$SetInformation (0x11AD4A8)`
  - Computes runtime fields and builds total note list

- `LevelControl$$SortForAllNoteWithTime (0x11AF80C)`
  - Sorts total note list by `realTime`

---

## VIII. Key Call Chains

### 1. Chart Loading Chain

```text
LevelControl.Start
  -> LevelControl._Start_d__42$$MoveNext
  -> LevelStartInfo.chartAddressableKey
  -> AssetStore.Get<TextAsset>
  -> AssetRef.WaitForPrepare
  -> TextAsset.text
  -> JsonUtility.FromJson<Chart>
  -> LevelControl.chart
```

### 2. Chart Initialization Chain

```text
Chart
  -> Chart.GetNoteCount
  -> LevelInformation.numOfNotes

Chart.judgeLineList
  -> LevelInformation.judgeLineList
```

### 3. Note Flattening Chain

```text
LevelInformation.judgeLineList[*].notesAbove / notesBelow
  -> LevelControl.SetInformation
  -> Writes realTime / holdTime / judgeLineIndex / noteIndex
  -> Add to LevelInformation.chartNoteSortByTime
  -> LevelControl.SortForAllNoteWithTime
```

### 4. Connection Chain Before Runtime Consumption

```text
LevelInformation.chartNoteSortByTime
  -> JudgeControl.chartNoteSortByTime
  -> Subsequent JudgeControl / NoteUpdateManager / Click/Drag/Hold/FlickControl consumption
```

---

## IX. Judgments That Can Be Made Now

### Confirmed

1. The chart resource entry point is `LevelStartInfo.chartAddressableKey`.
2. The resource type is `TextAsset`.
3. Deserialization uses `UnityEngine.JsonUtility.FromJson<Chart>`.
4. Fields of `Chart` / `JudgeLine` / `ChartNote` correspond to the sample JSON.
5. The total note list at runtime is built into `LevelInformation.chartNoteSortByTime` by `SetInformation`.
6. `chartLoaded = true` appears after the entire initialization is complete.

### Still Worth Digging Deeper

1. Where does `AssetStore.AssetRef<T>.ctor / OnLoaded` ultimately hook up in the Addressables / AssetBundle API.
2. How `JudgeControl` consumes `chartNoteSortByTime` to perform candidate note matching.
3. How `NoteUpdateManager` distributes the total note list into Click / Drag / Hold / Flick object pools.

---

## X. One-Sentence Summary

The chart loading logic in the current version can be summarized as:

```text
Fetch TextAsset from the resource system by chartAddressableKey -> Deserialize to Chart via JsonUtility -> Write into LevelInformation.judgeLineList -> Flatten into chartNoteSortByTime via SetInformation -> Mark chartLoaded to complete level startup
```