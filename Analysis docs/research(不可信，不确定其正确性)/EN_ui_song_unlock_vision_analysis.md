# UI / Song / Unlock / VisionReplay Analysis

## Scope

This note focuses on the iOS `UnityFramework` binary currently loaded in IDA.

- Binary: `UnityFramework`
- Platform for addresses below: iOS / Mach-O ARM64
- Cross-reference source: `dump_ios.cs`
- Older Android notes can still be used for logic comparison; the main difference is usually RVA only.

## 1. Main UI and song selection flow

### 1.1 Core data carriers

Relevant classes in `dump_ios.cs`:

- `SongsItem` at `dump_ios.cs:592874`
- `LevelStartInfo` at `dump_ios.cs:593356`
- `SongSelectorItem` at `dump_ios.cs:605170`
- `SongSelector` at `dump_ios.cs:604386`

`SongsItem` stores the static song metadata:

- `songsId`, `songsKey`, `songsName`, `songsTitle`
- `difficulty[]`
- `charter[]`
- `composer`
- `levels[]`
- `unlockInfo[]`
- `judgeLineImages`
- `levelMods`
- `hasDifferentMusic`, `differentMusic`
- `hasDifferentCover`, `differentCover`

This means song difficulty and charter info are not read from chart JSON. They are higher-level song metadata stored in the song database object (`SongsItem`), then copied into `LevelStartInfo` before entering gameplay.

### 1.2 `SongsItem -> LevelStartInfo`

Function:

- `SongsItem__GetLevelStartInfo` at `0x11FB460`

Key logic:

- Allocates a new `LevelStartInfo`.
- Copies textual metadata from `SongsItem`:
  - `songsId`
  - `songsName`
  - `composer`
  - `charter[level]`
  - `illustrator`
  - `songsLevel = levels[level]`
  - `songsDifficulty = (int)difficulty[level]` converted to string
- Builds resource keys:
  - `musicAddressableKey`
  - `chartAddressableKey`
  - `illustrationKey`
- Clones per-level `judgeLineImages` and `levelMods`.

This is the main handoff point from song database metadata into gameplay.

### 1.3 `SongSelectorItem` as runtime wrapper

Relevant functions:

- `SongSelectorItem__.ctor` at `0x11F5268`
- `SongSelectorItem__Init` at `0x11F6110`
- `SongSelectorItem__GetLevelStartInfo` at `0x11FB2F8`
- `SongSelectorItem__ChangeChartCode` at `0x11FA1EC`
- `SongSelectorItem__Unlock` at `0x11F9C30`

`SongSelectorItem` wraps `SongsItem` and adds runtime state:

- `records`
- `chartAssetCode : Dictionary<int, string>`
- `unlockType`
- `unlockInfo`
- `price`
- `coverAssetCode`
- `coverBlurAssetCode`
- `extraLevelMods`
- `Unlocked`
- `LegacyPlayable`

`SongSelectorItem__GetLevelStartInfo(0x11FB2F8)`:

- Calls `SongsItem__GetLevelStartInfo`.
- Appends runtime-added `extraLevelMods[level]`.
- If `chartAssetCode` contains `level`, overrides `levelStartInfo.chartAddressableKey`.

This is the clean hook point for runtime chart replacement. Any special song behavior that swaps谱面最终都要落到 `LevelStartInfo.chartAddressableKey`。

### 1.4 `SongSelector` UI behavior

Important functions:

- `SongSelector.Start` at `0x11F3ECC`
- `SongSelector.Update` at `0x11F7E30`
- `SongSelector.SortSong` at `0x11F6ABC`
- `SongSelector.RandomSong` at `0x11F98CC`
- `SongSelector.LegacyStart` at `0x11F8D68`
- `SongSelector.RandomStart` at `0x11F8E10`
- `SongSelector.GameStart` at `0x11FA3F0`
- `SongSelector.RefreshMirrorDisplay` at `0x11F7D84`

`SongSelector.Update(0x11F7E30)` handles:

- song list dragging
- cover dragging
- snapping to target song
- switching `nowSong`
- calling `SetText` and `ReplaceCover` when current song changes
- long-hold hidden actions for legacy / random entry

Notable hidden checks in `Update`:

- If `enableLegacy` and current `SongSelectorItem.LegacyPlayable` is true, holding a specific tagged region for more than `5.0s` triggers `LegacyStart`.
- If current song id matches a special random song id, holding another tagged region for more than `2.0s` triggers `RandomStart`.

### 1.5 Song start path

Function:

- `SongSelector__GameStart` at `0x11FA3F0`

Main flow:

1. Sets `nowSongSelectorValue` and `nowSong`.
2. Reads `SongSelectorItem`.
3. Stores current background into `GameInformation._main.background`.
4. Calls `SongSelectorItem__GetLevelStartInfo`.
5. Applies special-song substitutions before entering gameplay.
6. Applies `VisionReplay` substitutions or state callbacks if replay mode is on.
7. Applies QZK or other level mods.
8. Writes `mirror` flag into `LevelStartInfo`.
9. Stores final `LevelStartInfo` into `GameInformation._main.levelStartInfo`.
10. Updates UI texts (`illustrator`, `charter`, `difficulty`, `level`).
11. Starts start-animation coroutine.

This is the central pre-game dispatcher.

## 2. Song / chart JSON resource location

### 2.1 Chart JSON is not the song database

Chart JSON only carries chart structure:

- `Chart` at `dump_ios.cs:600547`
- `JudgeLine` at `dump_ios.cs:600525`
- `ChartNote` at `dump_ios.cs:600467`

Fields:

- `Chart.formatVersion`
- `Chart.offset`
- `Chart.judgeLineList`
- `ChartNote.type`
- `ChartNote.time`
- `ChartNote.positionX`
- `ChartNote.holdTime`
- `ChartNote.speed`
- `ChartNote.floorPosition`

Therefore:

- difficulty number is not stored in chart JSON
- charter / composer / illustrator are not stored in chart JSON
- chapter or song list grouping is not stored in chart JSON

Those belong to `SongsItem`, `Chapter`, and selector-side data.

### 2.2 Chart JSON load point

Function:

- `LevelControl__Start_d__42__MoveNext` at `0x11B0360` callsite inside coroutine `MoveNext`

Key logic in `LevelControl__Start_d__42__MoveNext`:

1. Reads `GameInformation._main.levelStartInfo`.
2. Uses `levelStartInfo.chartAddressableKey`.
3. Calls `AssetStore__Get_TextAsset_(chartAddressableKey)`.
4. Gets `TextAsset.text`.
5. Calls `UnityEngine.JsonUtility.FromJson<Chart>` at `0x11B0360`.
6. Stores result into `LevelControl.chart`.
7. If `levelStartInfo.mirror` is true, calls `Chart__Mirror`.
8. Sets music clip from `levelStartInfo.musicAddressableKey`.
9. Copies `chart.judgeLineList` into `LevelInformation`.

This is the actual bundle-chart JSON load entry.

### 2.3 How music / chart / cover keys are built

From `SongsItem__GetLevelStartInfo(0x11FB460)`:

- `musicAddressableKey` is built from song id, and for songs with `hasDifferentMusic` it may include level difficulty segment.
- `chartAddressableKey` is always built from song id + level name.
- `illustrationKey` is built through `IdBuilder__BuildCoverImageId(songId, levelOrEmpty)`.

From `SongSelectorItem__GetLevelStartInfo(0x11FB2F8)`:

- `chartAddressableKey` can be overridden per-level by `chartAssetCode[level]`.

From `SongSelectorItem__Init(0x11F6110)`:

- preview clip code is also built from song id, and for `hasDifferentMusic` songs it uses `previewClipDifficulty`.

### 2.4 Where chapter / album style grouping lives

This part is not in chart JSON. Static evidence shows grouping is selector-side:

- `SongSelector` has `nowChapterInfo`
- `GameInformation` has `chapters`
- song display and unlock logic are chapter-driven

I did not find an `album` field in `SongsItem`. If the user-facing `专辑/章节归属` refers to normal selector grouping, it is chapter-side metadata, not chart-side metadata.

If future work needs exact chapter-song mapping, inspect `Chapter`, `ChapterSongItem`, and selector initialization code rather than chart parsing code.

## 3. noteCode and noteCodes array

### 3.1 Per-note runtime id

Relevant structures:

- `ChartNote.noteCode` at `dump_ios.cs:600481`
- `GameInformation.noteCodes` at `dump_ios.cs:592955`
- `ScoreControl._noteCodes` at `dump_ios.cs:601033`
- `ChallengeSongItem.noteCodes` at `dump_ios.cs:604026`

Generation function:

- `LevelControl__SetCodeForNote` at `0x11ACFF8`

Logic:

- Iterates every `JudgeLine`.
- For `notesAbove`, starts from `0`, increments by `10`.
- For `notesBelow`, starts from `100000`, increments by `10`.
- After each judge line, both bases add `1000000`.

So `noteCode` is a deterministic runtime identifier encoding:

- judge line block
- above/below lane group
- per-note order within that group

It is not raw chart JSON content. It is assigned after JSON load.

### 3.2 Runtime metadata fill

`LevelControl__SetInformation` at `0x11AD4A8` further fills runtime fields such as:

- `realTime`
- `judgeLineIndex`
- `noteIndex`
- other note ordering info

Combined with `noteCode`, each note becomes uniquely traceable for score / replay / challenge result logic.

### 3.3 `ScoreControl._noteCodes` is a result event array

Relevant functions:

- `ScoreControl__Miss` at `0x11E1FA8`
- `ScoreControl__Bad` at `0x11E2044`
- `ScoreControl__Good` at `0x11E20F4`
- `ScoreControl__Perfect` at `0x11E229C`
- `ScoreControl__SetNoteCodeList` at `0x11E2418`

Observed encoding:

- `Miss(noteCode)` pushes raw `noteCode`
- `Bad(noteCode, judgeTime)` pushes `(noteCode + 1.0 + 0.5) + judgeTime`
- `Good(noteCode, judgeTime, ...)` pushes `(noteCode + 2.0 + 0.5) + judgeTime`
- `Perfect(noteCode, judgeTime, ...)` pushes `(noteCode + 3.0 + 0.5) + judgeTime`

Then `ScoreControl__SetNoteCodeList(0x11E2418)` copies `_noteCodes` to `GameInformation._main.noteCodes`.

Conclusion:

- `ChartNote.noteCode` is the per-note identity.
- `ScoreControl._noteCodes` / `GameInformation.noteCodes` is a per-play result/event array.
- The event array mixes the identity with result type and timing offset, so later systems can reconstruct judgment outcome per note.

This is likely why challenge / replay style systems keep a `List<float> noteCodes`: it is compact result telemetry, not just a list of ids.

## 4. Challenge mode / 课题模式 related path

### 4.1 Challenge selector

Class:

- `ChallengeSongSelectorControl` at `dump_ios.cs:603925`

Functions:

- `Start` at `0x116FFA8`
- `SetUiPos` at `0x1170018`
- `SelectSong` at `0x1170304`
- `SetText` at `0x1170680`
- `UndoSelectSong` at `0x117082C`
- `Play` at `0x1170938`

### 4.2 Selection logic

`ChallengeSongSelectorControl__SelectSong(0x1170304)`:

- Maximum selected count is 3.
- Deduplicates by `(SongSelectorItem, levelIndex)`.
- Creates `ChallengeSongItem`.
- Stores:
  - `songInfo`
  - `levelIndex`
- Updates three side preview covers and difficulty text.

`ChallengeSongSelectorControl__SetText(0x1170680)`:

- `selectButton` is disabled if current song+level is already selected.
- `playButton` becomes interactable only when selected count `> 2`.

`ChallengeSongSelectorControl__Play(0x1170938)`:

- Requires at least 3 selected songs.
- Starts transition to scene `StringLiteral_11468` which is the challenge scene.
- Writes into `GameInformation`:
  - `nowChallengeIndex = 0`
  - `challengeSongItems = this.challengeSongItems`
- If more than 3 items somehow exist, trims back to 3.

### 4.3 Challenge gameplay start

Function:

- `ChallengeModeControl__GameStart` at `0x116D95C`

Logic:

- Copies selected background into `GameInformation._main.background`
- Calls `SongSelectorItem__GetLevelStartInfo(songItem, levelIndex)`
- Appends a challenge mode level mod marker (`StringLiteral_11464`) into `levelStartInfo.levelMods`
- Writes final `levelStartInfo` into `GameInformation._main.levelStartInfo`
- Starts challenge start coroutine

### 4.4 Challenge mode result carrier

`ChallengeSongItem` fields:

- `songInfo`
- `levelIndex`
- `result`
- `noteCodes`

This strongly suggests challenge mode stores both normal result struct and the per-note encoded result array for each segment/song.

## 5. Special song unlock and replacement logic

### 5.1 Normal unlock state on `SongSelectorItem`

`SongSelectorItem__.ctor(0x11F5268)`:

- `unlockType == -1` means already unlocked.
- `unlockType == 1` parses `unlockInfo` as MB price, stores to `price`.
- `chartUnlockInfo[]` controls playable level count.
- Also computes `_hasLegacy` and `_LegacyPlayable`.

`SongSelectorItem__Unlock(0x11F9C30)`:

- Only handles `unlockType == 1` purchase-style unlock.
- Sets `Unlocked = true`
- Clears lock visuals
- Recomputes `LegacyPlayable`

This is the generic paid unlock path, not the special cutscene unlock path.

### 5.2 Igallta / Rrharil / DESTRUCTION 3,2,1 / Distorted Fate dedicated controllers

Dedicated classes:

- `D321UnlockControl` at `dump_ios.cs:606420`
- `DFUnlockControl` at `dump_ios.cs:606560`
- `IgalltaUnlock` at `dump_ios.cs:606820`
- `RrharilUnlockControl` at `dump_ios.cs:607529`

Notable methods:

- `D321UnlockControl.Start` at `0x118AE30`
- `IgalltaUnlock.PlayUnlockVideo` at `0x11A5CC8`
- `IgalltaUnlock.UnlockAnimation` at `0x11A5D30`
- `RrharilUnlockControl.PlayUnlockVideo` at `0x11D6E74`
- `RrharilUnlockControl.GameStart` coroutine at `0x11D6FD4`

These are presentation / cutscene controllers. The actual persistent state bits are saved in save keys and VisionReplay process keys, not in these MonoBehaviours alone.

### 5.3 Chapter 8 special substitution during start

In `SongSelector__GameStart(0x11FA3F0)`:

- It performs special handling for two specific song ids before entering gameplay.
- If conditions match, it replaces the selected `LevelStartInfo` with another song's `LevelStartInfo`, updates selector UI name/artist/cover, and may add extra `levelMods`.

Two helper functions:

- `SongSelector__ReplaceWithMicroWave` at `0x11FC2C8`
- `SongSelector__ReplaceWithTheChariotReviival` at `0x11FC770`

`ReplaceWithMicroWave(0x11FC2C8)`:

- Checks `VisionReplay.Process[Chapter8UnlockBegin]`
- Checks `VisionReplay.Process[C8CraveWaveUnlocked]`
- If current song id matches the trigger song and Crave Wave is not yet unlocked, it:
  - plays flash animation
  - swaps `*levelStartInfo` to another song found in `GameInformation.song.mainSongs`
  - rewrites displayed song name / artist / cover / blur

`ReplaceWithTheChariotReviival(0x11FC770)`:

- Similar logic
- Checks `VisionReplay.Process[Chapter8UnlockBegin]`
- Checks `VisionReplay.Process[C8TheChariotREVIIVALUnlocked]`
- Swaps to a different song and appends extra level mod marker `StringLiteral_11503`

So these `special songs` are not only unlocked by a simple bool. The start path can dynamically redirect one song entry to another chart/music package based on stored process flags.

## 6. VisionReplay / 虫眼 / chapter8 process

### 6.1 Core replay state

Class:

- `Phigros2.VisionReplay.VisionReplay`

Fields:

- `IsOn`
- `IsSimulateMode`
- persistent key name `IsVisionReplayOn`

Key methods:

- `TurnOn` at `0x11C8864`
- `TurnOff` at `0x11C94B8`
- `BootSimulateMode` at `0x11C9E6C`
- `ExitSimulateMode` at `0x11C9EC0`
- `InitC8ReplayProcess` at `0x11C9CEC`
- `ResetC8Process` at `0x11C9F10`
- `RecoverC8SecondPhase` at `0x11CA340`

### 6.2 What `TurnOn` does

`VisionReplay__TurnOn(0x11C8864)`:

- `SaveManagement.SaveBool(IsVisionReplayOn, true)`
- sets static `IsOn = true`
- loads another bool key (`StringLiteral_11501`) into `IsSimulateMode`
- calls `InitC8ReplayProcess()`

`TurnOff(0x11C94B8)`:

- `SaveManagement.SaveBool(IsVisionReplayOn, false)`
- clears `IsOn`
- clears `IsSimulateMode`

### 6.3 VisionReplay keys

`VisionReplay.Key` exposes persistent string keys for:

- `IsVisionReplayEnable`
- `UnlockFlagOfSpasmodic`
- `RebornComplete`
- `UnlockFlagOfIgalltaMain`
- `UnlockFlagOfRrharil`
- `Chapter8UnlockBegin`
- `Chapter8UnlockSecondPhase`
- `FirstOpenGameAfterChapter8FirstPhaseClear`
- `Chapter8Passed`
- `C8CraveWaveUnlocked`
- `C8TheChariotREVIIVALUnlocked`
- `C8LuminescenceUnlocked`
- `C8RetributionUnlocked`
- `C8DESTRUCTION321Unlocked`
- `C8DistortedFateUnlocked`

This is the cleanest static evidence that VisionReplay is tied directly into chapter8 progression replay / restoration logic, not just a cosmetic toggle.

### 6.4 Replay process init / reset / recover

`InitC8ReplayProcess(0x11C9CEC)`:

- if `Chapter8Passed` is present, calls `ResetC8Process()`
- if `FirstOpenGameAfterChapter8FirstPhaseClear` is present, calls `RecoverC8SecondPhase()`

`ResetC8Process(0x11C9F10)`:

- deletes `Chapter8UnlockSecondPhase`
- deletes `Chapter8Passed`
- resets `C8Unlock`
- sets chapter8 replay-process values back to 0:
  - `Chapter8UnlockBegin`
  - `C8CraveWaveUnlocked`
  - `C8TheChariotREVIIVALUnlocked`
  - `C8RetributionUnlocked`
  - `C8DESTRUCTION321Unlocked`
  - `Chapter8UnlockSecondPhase`
  - `C8DistortedFateUnlocked`
  - `Chapter8Passed`
- also resets several `C8Unlock` song ids via `C8Unlock__SetValue(...)`

`RecoverC8SecondPhase(0x11CA340)`:

- sets chapter8 second-phase related process values back to 1:
  - `Chapter8UnlockBegin`
  - `C8CraveWaveUnlocked`
  - `C8TheChariotREVIIVALUnlocked`
  - `C8RetributionUnlocked`
  - `C8DESTRUCTION321Unlocked`
  - `Chapter8UnlockSecondPhase`
- also marks several C8 unlock ids in `C8Unlock`

So VisionReplay is effectively a chapter8 state machine replayer / restorer.

### 6.5 UI button

Class:

- `VisionReplayButton` at `dump_ios.cs:608592`

Important methods:

- `OnEnable` at `0x11C8F2C`
- `OnDisable` at `0x11C8F9C`
- `ToggleStyle` at `0x11C9014`
- `OnClick` at `0x11C93D0`

`VisionReplayButton__OnClick(0x11C93D0)`:

- If replay is already on:
  - calls manual turn-off popup event
  - toggles UI
  - plays SE
  - calls `VisionReplay.TurnOff()`
- If replay is off:
  - opens popup event instead of immediately enabling
  - plays SE

That means actual enablement likely happens through a popup confirmation flow rather than button direct toggle.

## 7. What is still not fully resolved

### 7.1 `Album` exact field

Static analysis here shows:

- song metadata is in `SongsItem`
- grouping is chapter-side
- chart JSON does not contain album/chapter info

But I did not find a dedicated `album` field in `SongsItem`. If later work needs an exact `专辑` concept, inspect selector initialization and chapter/banner resources.

### 7.2 Exact string literal to concrete song id mapping

Several special branches use `StringLiteral_xxxxx` constants. The control flow is clear, but exact user-facing song names for every branch still need either:

- string literal resolution from metadata tables, or
- runtime hook logging

## 8. Suggested Frida probes

### 8.1 Log final `LevelStartInfo` before entering gameplay

Use this to confirm special-song substitution and replay-related rewrites.

```javascript
// frida -U -f <bundle> -l probe_levelstartinfo.js
const base = Module.findBaseAddress("UnityFramework");
const gameStart = base.add(0x11FA3F0);

Interceptor.attach(gameStart, {
  onEnter(args) {
    this.songIndex = args[1].toInt32();
    this.levelIndex = args[2].toInt32();
    console.log("[GameStart] songIndex=", this.songIndex, "levelIndex=", this.levelIndex);
  }
});

const replaceMicrowave = base.add(0x11FC2C8);
Interceptor.attach(replaceMicrowave, {
  onEnter(args) {
    console.log("[ReplaceWithMicroWave] levelIndex=", args[3].toInt32());
  }
});

const replaceChariot = base.add(0x11FC770);
Interceptor.attach(replaceChariot, {
  onEnter(args) {
    console.log("[ReplaceWithTheChariotReviival] levelIndex=", args[3].toInt32());
  }
});
```

### 8.2 Log chart key override

Use this to confirm runtime chart replacement through `SongSelectorItem.chartAssetCode`.

```javascript
const base = Module.findBaseAddress("UnityFramework");
const getLevelStartInfo = base.add(0x11FB2F8);

Interceptor.attach(getLevelStartInfo, {
  onEnter(args) {
    this.level = args[1].toInt32();
  },
  onLeave(retval) {
    console.log("[SongSelectorItem.GetLevelStartInfo] level=", this.level, "retval=", retval);
  }
});
```

### 8.3 Log replay toggle and chapter8 restore

```javascript
const base = Module.findBaseAddress("UnityFramework");

[
  ["VisionReplay.TurnOn", 0x11C8864],
  ["VisionReplay.TurnOff", 0x11C94B8],
  ["VisionReplay.InitC8ReplayProcess", 0x11C9CEC],
  ["VisionReplay.ResetC8Process", 0x11C9F10],
  ["VisionReplay.RecoverC8SecondPhase", 0x11CA340],
].forEach(([name, rva]) => {
  Interceptor.attach(base.add(rva), {
    onEnter() {
      console.log("[VR]", name);
    }
  });
});
```

### 8.4 Log noteCode result encoding

Use this to validate the score-event encoding formula.

```javascript
const base = Module.findBaseAddress("UnityFramework");

[
  ["Miss", 0x11E1FA8],
  ["Bad", 0x11E2044],
  ["Good", 0x11E20F4],
  ["Perfect", 0x11E229C],
].forEach(([name, rva]) => {
  Interceptor.attach(base.add(rva), {
    onEnter(args) {
      const noteCode = args[1].readFloat();
      console.log("[Score]", name, "noteCode=", noteCode);
    }
  });
});
```

## 9. Short conclusions

- Song metadata and difficulty are selector/database-side (`SongsItem`), not chart JSON side.
- Chart JSON is loaded through `LevelStartInfo.chartAddressableKey` in `LevelControl__Start_d__42__MoveNext`.
- Runtime chart replacement is implemented by overriding `SongSelectorItem.chartAssetCode[level]`.
- `noteCode` is a generated per-note runtime id; `noteCodes` arrays are result/event traces, not raw ids only.
- Challenge mode preselects exactly 3 `(song, level)` pairs into `GameInformation.challengeSongItems`.
- VisionReplay is tightly coupled with chapter8 state restoration and special song substitutions, not just a visual toggle.
