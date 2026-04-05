# Special Song Unlock / Challenge Mode / VisionReplay First Edition Deep Dive

Based on the iOS `UnityFramework` in the current IDA session, all addresses below are iOS / Mach-O ARM64.

## 1. Overview

There are 5 main conclusions that can be statically confirmed currently:

1. Special songs are not just "visible after unlocking". `SongSelector__GameStart` `0x11FA3F0` performs resource replacement based on the Chapter 8 process state before the start of the game.
2. The states related to Chapter 8 are not scattered in scene scripts, but are unified into `VisionReplay.Key` and `VisionReplay.Process`.
3. `ChallengeSongSelectorControl` is responsible for selecting the three songs for the Course/Challenge mode, while `ChallengeModeControl__GameStart` `0x116D95C` is the actual entry point for the formal start of each stage.
4. `ChallengeSongItem.noteCodes` indicates that the challenge mode retains the note-by-note result stream for each song, not just the final score.
5. Special song performance controllers like `IgalltaUnlock`, `RrharilUnlockControl`, and `D321UnlockControl` are more on the presentation layer; the truly persistent state flags are still in the save key / VisionReplay process dictionary.

## 2. Special Song Unlock and Start Replacement

### 2.1 Main Entry

Key functions:

- `SongSelector__GameStart` `0x11FA3F0`
- `SongSelector__ReplaceWithMicroWave` `0x11FC2C8`
- `SongSelector__ReplaceWithTheChariotReviival` `0x11FC770`

`SongSelector__GameStart(0x11FA3F0)` will first get the current `SongSelectorItem -> LevelStartInfo`, and then decide based on the process state:

- Whether to perform Chapter 8 special song replacement
- Whether to inject additional `levelMods`
- Whether to follow VisionReplay-related playback/state logic

Therefore, this is the core breakpoint for tracking "why the selected song ends up entering another chart/another set of resources".

### 2.2 Chapter 8 Replacement Logic

Existing static conclusions show:

- `SongSelector__ReplaceWithMicroWave(0x11FC2C8)` will replace the current entry song with `Crave Wave / MicroWave` related resources and display information.
- `SongSelector__ReplaceWithTheChariotReviival(0x11FC770)` will replace the entry song with `The Chariot REVIIVAL`, while appending additional level mods.

Whether the replacement occurs depends not only on the current song id, but also on the boolean values in the process state dictionary, for example:

- `VisionReplay.Key.Chapter8UnlockBegin`
- `VisionReplay.Key.C8CraveWaveUnlocked`
- `VisionReplay.Key.C8TheChariotREVIIVALUnlocked`

This indicates that the "unlocking" of special songs actually involves two layers:

1. Whether the persistent flag allows entering a certain stage.
2. Whether the current entry song is redirected to hidden song resources before the game starts.

### 2.3 Presentation Layer Controllers

Key functions:

- `D321UnlockControl__Start` `0x118AE30`
- `IgalltaUnlock__PlayUnlockVideo` `0x11A5CC8`
- `IgalltaUnlock__UnlockAnimation` `0x11A5D30`
- `RrharilUnlockControl__PlayUnlockVideo` `0x11D6E74`
- `RrharilUnlockControl__GameStart` `0x11D6FD4`

These controllers are responsible for:

- Playing unlock videos/animations
- Filling in track information on the unlock interface
- Entering the formal game start after the animation finishes

However, from the current structure, they seem more like "presentation and cutscenes" rather than the sole source of the final persistent flags.

## 3. Challenge / Course Mode Process

### 3.1 Song Selection Stage

Key functions:

- `ChallengeSongSelectorControl__Start` `0x116FFA8`
- `ChallengeSongSelectorControl__SelectSong` `0x1170304`
- `ChallengeSongSelectorControl__SetText` `0x1170680`
- `ChallengeSongSelectorControl__UndoSelectSong` `0x117082C`
- `ChallengeSongSelectorControl__Play` `0x1170938`

Statically confirmed logic:

- Select up to 3 songs.
- `SelectSong` will deduplicate by `(SongSelectorItem, levelIndex)`.
- Upon selection, a `ChallengeSongItem` is generated.
- `Play` requires exactly 3 songs to be selected, then writes the list to the global challenge state and switches scenes.

The `ChallengeSongItem` structure has been confirmed to contain:

- `songInfo`
- `levelIndex`
- `result`
- `noteCodes`

This indicates that the result of each challenge stage saves not only the final settlement but also the note-by-note encoded results.

### 3.2 Formal Start

Key functions:

- `ChallengeModeControl__GameStart` `0x116D95C`

The responsibilities of `ChallengeModeControl__GameStart(0x116D95C)` are:

1. Read `ChallengeSongItem.songInfo + levelIndex`.
2. Call `SongSelectorItem__GetLevelStartInfo` to convert it into a formal `LevelStartInfo`.
3. Inject challenge-specific mods into this `LevelStartInfo`.
4. Then enter the normal level opening animation.

This means that the challenge mode is essentially "reusing the normal game start pipeline, but attaching extra mode markers at the entry".

### 3.3 Rank and Save

Static fields:

- `GameProgressSaveModule.challengeModeRank`

Combined with previous save analysis, it can be confirmed that the challenge mode rank is not a temporary UI value, but a field persisted to `GameProgressSaveModule`.

Furthermore, `CloudSaveSummary$$FromLocalSave` also includes `ChallengeModeRank` in the summary, indicating that it participates in cloud save display or conflict resolution information.

## 4. VisionReplay / Bug Eye / Replay / revision

### 4.1 Core State

Key functions:

- `VisionReplay__TurnOn` `0x11C8864`
- `VisionReplay__TurnOff` `0x11C94B8`
- `VisionReplay__BootSimulateMode` `0x11C9E6C`
- `VisionReplay__ExitSimulateMode` `0x11C9EC0`
- `VisionReplay__InitC8ReplayProcess` `0x11C9CEC`
- `VisionReplay__ResetC8Process` `0x11C9F10`
- `VisionReplay__RecoverC8SecondPhase` `0x11CA340`

Fields:

- `VisionReplay.IsOn`
- `VisionReplay.IsSimulateMode`

This indicates that VisionReplay has both a master switch and a separate simulate mode.

### 4.2 Persistent Keys

`VisionReplay.Key` exposes the entire set of key names:

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

This shows that Chapter 8 special songs and the VisionReplay process essentially share the same key space.

### 4.3 Process Dictionary

Key functions:

- `VisionReplay.Process__SetValue` `0x11CA608`
- `VisionReplay.Process__GetValue` `0x11CB7CC`

`VisionReplay.Process` is internally a `Dictionary<string, bool>`, so many checks like "has a certain stage been entered / has a special song been triggered" are not hardcoded fields, but dictionary values.

This is also the basis for `SongSelector__GameStart` to dynamically replace songs according to the process state.

### 4.4 Buttons and UI

Key functions:

- `VisionReplayButton__OnEnable` `0x11C8F2C`
- `VisionReplayButton__OnDisable` `0x11C8F9C`
- `VisionReplayButton__ToggleStyle` `0x11C9014`
- `VisionReplayButton__OnClick` `0x11C93D0`

`VisionReplayButton` is responsible for:

- Switching the button appearance based on the switch state
- Responding to clicks
- Refreshing the overlay/base text

Therefore, the primary targets for UI panel linkage points for "whether bug eye/replay/revision is enabled" are these functions.

## 5. Key Function Table

- `0x11FA3F0` `SongSelector__GameStart`
- `0x11FC2C8` `SongSelector__ReplaceWithMicroWave`
- `0x11FC770` `SongSelector__ReplaceWithTheChariotReviival`
- `0x116FFA8` `ChallengeSongSelectorControl__Start`
- `0x1170304` `ChallengeSongSelectorControl__SelectSong`
- `0x1170680` `ChallengeSongSelectorControl__SetText`
- `0x117082C` `ChallengeSongSelectorControl__UndoSelectSong`
- `0x1170938` `ChallengeSongSelectorControl__Play`
- `0x116D95C` `ChallengeModeControl__GameStart`
- `0x118AE30` `D321UnlockControl__Start`
- `0x11A5CC8` `IgalltaUnlock__PlayUnlockVideo`
- `0x11A5D30` `IgalltaUnlock__UnlockAnimation`
- `0x11D6E74` `RrharilUnlockControl__PlayUnlockVideo`
- `0x11D6FD4` `RrharilUnlockControl__GameStart`
- `0x11C8864` `VisionReplay__TurnOn`
- `0x11C94B8` `VisionReplay__TurnOff`
- `0x11C9CEC` `VisionReplay__InitC8ReplayProcess`
- `0x11C9F10` `VisionReplay__ResetC8Process`
- `0x11CA340` `VisionReplay__RecoverC8SecondPhase`
- `0x11CA608` `VisionReplay.Process__SetValue`
- `0x11CB7CC` `VisionReplay.Process__GetValue`
- `0x11C9014` `VisionReplayButton__ToggleStyle`
- `0x11C93D0` `VisionReplayButton__OnClick`

## 6. Dynamic Verification Suggestions

It is recommended to prioritize 4 sets of dynamic verifications:

1. Hook `SongSelector__GameStart`, `ReplaceWithMicroWave`, and `ReplaceWithTheChariotReviival` to confirm the actual song id / chart key during special song replacement.
2. Hook `VisionReplay.Process__SetValue` / `GetValue` to observe when Chapter 8 process flags are set.
3. Hook `ChallengeSongSelectorControl__Play` and `ChallengeModeControl__GameStart` to confirm how the list of three songs is written to the global state.
4. Hook the play and game start functions of `IgalltaUnlock` / `RrharilUnlockControl` to confirm the sequence relationship between presentation layer scripts and persistent flags.

`frida_unlock_vision_probe.js` can be used directly as a template for subsequent dynamic verifications.

## 7. Unconfirmed Points

- The precise call points for "setting the save key" within each special song unlock controller have not yet been disassembled and expanded individually.
- Whether the simulate mode of VisionReplay directly affects settlement or only affects the opening process still requires a dynamic run.
- The update function for `ChallengeModeRank` has not been independently tracked yet; currently, only the existence of its persistent field has been statically confirmed.
