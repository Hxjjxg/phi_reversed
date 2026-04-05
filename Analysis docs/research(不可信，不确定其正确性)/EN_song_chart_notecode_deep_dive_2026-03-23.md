# Main Menu / Song Metadata / Chart JSON / noteCode Initial Deep Dive

Based on the iOS `UnityFramework` in the current IDA session, all addresses below are iOS / Mach-O ARM64.

## 1. Overview

There are 4 core conclusions that can be statically confirmed currently:

1. The true main entry point from the main menu song selection into the game is `SongSelector__GameStart` `0x11FA3F0`.
2. The song name, difficulty, charter, illustration key, music key, and chart key all come from `SongsItem` and chapter-side data, not from the chart JSON.
3. The ownership information of "which chapter/album a song belongs to" falls on the `Chapter` / `ChapterSongInfo` / `ChapterSongItem` side; the chart JSON only describes the chart structure.
4. `noteCode` is not an original field of the chart JSON, but a runtime note identity code generated in batch by `LevelControl__SetCodeForNote` `0x11ACFF8` after the chart is loaded; `noteCodes` is an array of result events reused across settlement/replay/challenge modes.

## 2. Main Flow of Song Selection in Main Menu

### 2.1 From Chapter Entry to Song Selection UI

- `ChapterSelector__LoadSongSelector` `0x117B3E0`
- `SongSelector__Start` `0x11F3ECC`
- `SongSelector__Update` `0x11F7E30`
- `SongSelector__GameStart` `0x11FA3F0`

It can be confirmed structurally (statically):

- `GameInformation` holds the `chapters` field.
- `GameInformation` also has the static field `nowChapterCode`.
- `SongSelector` holds the `nowChapterInfo` field.

Combining the signature of `ChapterSelector.LoadSongSelector(string chapterCode)` and the `SongSelector.nowChapterInfo` field, it is inferred with high confidence that the main flow is:

1. The chapter UI writes the current `chapterCode` to the global state.
2. The song selection UI's `SongSelector.Start` retrieves the current chapter object from `GameInformation.chapters` based on `GameInformation.nowChapterCode`.
3. It then maps the song list in the chapter to a list of `SongSelectorItem`s, handing them over for subsequent scrolling, display, and game start logic.

The field level of this initialization chain is already clear, but it is still recommended to use dynamic hooking to confirm "the specific statement location where `nowChapterCode` is written".

### 2.2 Runtime Responsibilities of `SongSelector`

`SongSelector` itself is responsible for:

- Slidng and snapping for song selection
- Switching the current song/difficulty
- Refreshing UI text
- Displaying mirror status
- Final dispatch for game start

Among them:

- `SongSelector__Update` `0x11F7E30` handles the current song index switching, list dragging, and determining the visibility of entries.
- `SongSelector__GameStart` `0x11FA3F0` is the general main entry point that actually turns the current `SongSelectorItem + levelIndex` into `LevelStartInfo` and writes it into the global `GameInformation`.

## 3. SongsItem and Chapter Ownership

### 3.1 Song Metadata in `SongsItem`

Key functions:

- `SongsItem__GetLevelStartInfo` `0x11FB460`
- `SongSelectorItem__GetLevelStartInfo` `0x11FB2F8`
- `SongSelectorItem__Init` `0x11F6110`

Typical fields already statically confirmed on the `SongsItem` side include:

- `songsId`
- `songsName`
- `songsTitle`
- `difficulty[]`
- `charter[]`
- `composer`
- `levels[]`
- `unlockInfo[]`
- `judgeLineImages`
- `levelMods`
- `hasDifferentMusic`
- `hasDifferentCover`

`SongsItem__GetLevelStartInfo(0x11FB460)` will copy these high-level metadata into `LevelStartInfo`, while constructing:

- `musicAddressableKey`
- `chartAddressableKey`
- `illustrationKey`

`SongSelectorItem__GetLevelStartInfo(0x11FB2F8)` further appends runtime overrides on top of this:

- `extraLevelMods[level]`
- Overwriting `chartAddressableKey` with `chartAssetCode[level]`

Therefore, the song difficulty values, charter, and asset keys for music/illustration/chart are all first extracted from `SongsItem` before being passed into the in-game scene.

### 3.2 "Which Chapter/Album a Song Belongs To" is Not in Chart JSON

The class definitions on the chapter side can already directly explain where the ownership information lands:

- `Chapter`
  - `chapterCode`
  - `songInfo`
  - `unlockInfo`
- `ChapterSongInfo`
  - `title`
  - `subTitle`
  - `banner`
  - `List<ChapterSongItem> songs`
- `ChapterSongItem`
  - `songsId`
  - `unlockType`
  - `unlockInfo`
  - `secretType`
  - `secretInfo`

This indicates that "which chapter a certain song belongs to" is organized via `Chapter.songInfo.songs[*].songsId`, rather than being written in the chart JSON.

If the "album" spoken by players is essentially chapter grouping in UI, then it corresponds to chapter side data, not a single field of `SongsItem`, and definitely not a chart JSON field.

Currently, there is no statically confirmed separate `album` field within `SongsItem`.

## 4. Chart JSON Load Point

Key functions:

- The chart loading chain inside `LevelControl__Start_d__42__MoveNext`
- `UnityEngine.JsonUtility.FromJson<Chart>` call point `0x11B0360`

Statically confirmed flow:

1. Read `chartAddressableKey` from `GameInformation._main.levelStartInfo`.
2. Retrieve the `TextAsset` via `AssetStore__Get_TextAsset_(chartAddressableKey)`.
3. Read `TextAsset.text`.
4. Call `JsonUtility.FromJson<Chart>` to parse it into a `Chart`.
5. Save to `LevelControl.chart`.
6. If there is a mirror flag, route through `Chart__Mirror`.

`Chart` / `ChartNote` are confirmed to mostly contain chart structure fields:

- `Chart.formatVersion`
- `Chart.offset`
- `Chart.judgeLineList`
- `ChartNote.type`
- `ChartNote.time`
- `ChartNote.positionX`
- `ChartNote.holdTime`
- `ChartNote.speed`
- `ChartNote.floorPosition`

Thus, chart JSON is responsible for "how to play", not "what this song is called in the UI, what chapter it belongs to, or what its difficulty level is".

## 5. noteCode / noteCodes Chain

### 5.1 Generation of `noteCode`

Key functions:

- `LevelControl__SetCodeForNote` `0x11ACFF8`
- `LevelControl__SetInformation` `0x11AD4A8`

Statically confirmed logic:

- Each judgment line is processed respectively.
- `notesAbove` starts from `0`, incrementing by `10` for each note.
- `notesBelow` starts from `100000`, incrementing by `10` for each note.
- After processing each judgment line, an extra `1000000` is added to both sets of bases.

Therefore, `noteCode` actually encodes:

- The judgment line chunk
- Upper/lower zone
- The note order within that zone

`LevelControl__SetInformation(0x11AD4A8)` will continuously fill in runtime fields, such as:

- `realTime`
- `judgeLineIndex`
- `noteIndex`

This means that `noteCode` is a unified runtime identity code, not an original field of the chart JSON.

### 5.2 Consumption of `noteCodes`

Key functions:

- `ScoreControl__Miss` `0x11E1FA8`
- `ScoreControl__Bad` `0x11E2044`
- `ScoreControl__Good` `0x11E20F4`
- `ScoreControl__Perfect` `0x11E229C`
- `ScoreControl__SetNoteCodeList` `0x11E2418`

Statically confirmed logic:

- `Miss` directly pushes the original `noteCode`
- `Bad` pushes `noteCode + 1.5 + judgeTime`
- `Good` pushes `noteCode + 2.5 + judgeTime`
- `Perfect` pushes `noteCode + 3.5 + judgeTime`

Subsequently, `ScoreControl__SetNoteCodeList(0x11E2418)` will copy `_noteCodes` to `GameInformation._main.noteCodes`.

`ChallengeSongItem` also holds `List<float> noteCodes`, indicating that what the challenge mode/replay-like systems reuse is an "encoded flow of results per note", instead of a simple list of note IDs.

## 6. Key Function Table

- `0x117B3E0` `ChapterSelector__LoadSongSelector`
- `0x11F3ECC` `SongSelector__Start`
- `0x11F7E30` `SongSelector__Update`
- `0x11FA3F0` `SongSelector__GameStart`
- `0x11FB460` `SongsItem__GetLevelStartInfo`
- `0x11FB2F8` `SongSelectorItem__GetLevelStartInfo`
- `0x11F6110` `SongSelectorItem__Init`
- `0x11B0360` `UnityEngine.JsonUtility.FromJson<Chart>` call point
- `0x11ACFF8` `LevelControl__SetCodeForNote`
- `0x11AD4A8` `LevelControl__SetInformation`
- `0x11E1FA8` `ScoreControl__Miss`
- `0x11E2044` `ScoreControl__Bad`
- `0x11E20F4` `ScoreControl__Good`
- `0x11E229C` `ScoreControl__Perfect`
- `0x11E2418` `ScoreControl__SetNoteCodeList`

## 7. Dynamic Verification Suggestions

It is recommended to prioritize dynamically confirming 3 things:

1. Whether `ChapterSelector__LoadSongSelector(0x117B3E0)` writes to `GameInformation.nowChapterCode` directly.
2. How `SongSelector__Start(0x11F3ECC)` finds `nowChapterInfo` from `GameInformation.chapters`, and whether there is a bypass branch for "region/restricted song lists".
3. Under different special song and dynamic substitution conditions, to which `chartAddressableKey` does `SongSelector__GameStart(0x11FA3F0)` ultimately fall.

This can be combined with `frida_song_chart_probe.js` to observe the hit order and resource keys of these functions.

## 8. Unconfirmed Points

- The field-level evidence for the chain `ChapterSelector.LoadSongSelector -> GameInformation.nowChapterCode -> SongSelector.nowChapterInfo` is already quite strong, but the exact location of the assignment instructions hasn't been written out explicitly yet.
- Did not see a field separately named `album`; if it is discovered later that "album" is another data structure in-game, initialization paths outside of `Chapter` will need to be further investigated.
- Bypass logic for certain limited-time/region-restricted song lists might be handled locally by `songsBypassLimited` or selector initialization lambdas. Follow-up deep dives specifically focusing on `SongSelector.Start` are recommended.