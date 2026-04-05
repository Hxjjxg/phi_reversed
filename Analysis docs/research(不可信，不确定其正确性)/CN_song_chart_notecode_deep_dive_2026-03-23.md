# 主界面 / 歌曲元数据 / 谱面 JSON / noteCode 首版深挖

基于当前 IDA 会话中的 iOS `UnityFramework`，以下地址均为 iOS / Mach-O ARM64。

## 1. 概览

目前可以静态确认的核心结论有 4 条：

1. 主界面选曲真正进入游戏的总入口是 `SongSelector__GameStart` `0x11FA3F0`。
2. 歌曲名、难度、charter、曲绘 key、音乐 key、谱面 key 都来自 `SongsItem` 和章节侧数据，不来自 chart JSON。
3. “歌曲属于哪个章节/专辑”这一层归属信息落在 `Chapter` / `ChapterSongInfo` / `ChapterSongItem` 一侧，chart JSON 只描述谱面结构。
4. `noteCode` 不是谱面 JSON 原始字段，而是在谱面装载后由 `LevelControl__SetCodeForNote` `0x11ACFF8` 批量生成的运行时 note 身份码；`noteCodes` 则是结算/重演/挑战模式复用的结果事件数组。

## 2. 主界面选曲主流程

### 2.1 章节入口到选曲界面

- `ChapterSelector__LoadSongSelector` `0x117B3E0`
- `SongSelector__Start` `0x11F3ECC`
- `SongSelector__Update` `0x11F7E30`
- `SongSelector__GameStart` `0x11FA3F0`

静态结构上可以确认：

- `GameInformation` 持有 `chapters` 字段。
- `GameInformation` 还有静态字段 `nowChapterCode`。
- `SongSelector` 持有 `nowChapterInfo` 字段。

结合 `ChapterSelector.LoadSongSelector(string chapterCode)` 的签名和 `SongSelector.nowChapterInfo` 字段，较高置信度推断主流程是：

1. 章节界面把当前 `chapterCode` 写入全局状态。
2. 选曲界面 `SongSelector.Start` 根据 `GameInformation.nowChapterCode` 从 `GameInformation.chapters` 里取到当前章节对象。
3. 再把章节里的歌单映射成 `SongSelectorItem` 列表，交给后续滚动、显示、开局逻辑使用。

这条初始化链路的字段层面已经明确，但“写入 `nowChapterCode` 的具体语句位置”还建议动态 hook 坐实。

### 2.2 `SongSelector` 运行时职责

`SongSelector` 自身负责：

- 滑动和吸附选歌
- 当前歌曲/难度切换
- UI 文本刷新
- 镜像状态显示
- 最终开局分发

其中：

- `SongSelector__Update` `0x11F7E30` 负责当前歌索引切换、列表拖动和隐藏入口判定。
- `SongSelector__GameStart` `0x11FA3F0` 是真正把当前 `SongSelectorItem + levelIndex` 变成 `LevelStartInfo` 并写入全局 `GameInformation` 的总入口。

## 3. SongsItem 与章节归属

### 3.1 歌曲元数据在 `SongsItem`

关键函数：

- `SongsItem__GetLevelStartInfo` `0x11FB460`
- `SongSelectorItem__GetLevelStartInfo` `0x11FB2F8`
- `SongSelectorItem__Init` `0x11F6110`

`SongsItem` 一侧已经静态确认持有的典型字段包括：

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

`SongsItem__GetLevelStartInfo(0x11FB460)` 会把这些高层元数据拷贝到 `LevelStartInfo`，同时构造：

- `musicAddressableKey`
- `chartAddressableKey`
- `illustrationKey`

`SongSelectorItem__GetLevelStartInfo(0x11FB2F8)` 则在此基础上追加运行时覆盖：

- `extraLevelMods[level]`
- `chartAssetCode[level]` 对 `chartAddressableKey` 的覆写

因此，歌曲难度数值、charter、音乐/曲绘/谱面资源 key 都是先从 `SongsItem` 抽出来，再传入游戏内场景。

### 3.2 “歌曲属于哪个章节/专辑”不在 chart JSON

章节侧类定义已经能直接说明归属信息落点：

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

这说明“某首歌属于哪个章节”是通过 `Chapter.songInfo.songs[*].songsId` 来组织的，而不是写在 chart JSON 里。

如果玩家口中的“专辑”本质上就是 UI 里的章节分组，那么它对应的是 `Chapter` 侧数据，不是 `SongsItem` 的单字段，更不是 chart JSON 字段。

目前没有静态看到 `SongsItem` 里存在单独的 `album` 字段。

## 4. Chart JSON 装载点

关键函数：

- `LevelControl__Start_d__42__MoveNext` 内 chart 装载链
- `UnityEngine.JsonUtility.FromJson<Chart>` 调用点 `0x11B0360`

静态确认的流程：

1. 从 `GameInformation._main.levelStartInfo` 读出 `chartAddressableKey`。
2. 通过 `AssetStore__Get_TextAsset_(chartAddressableKey)` 取到 `TextAsset`。
3. 读取 `TextAsset.text`。
4. 调 `JsonUtility.FromJson<Chart>` 解析成 `Chart`。
5. 保存到 `LevelControl.chart`。
6. 如有镜像标志，再走 `Chart__Mirror`。

`Chart` / `ChartNote` 确认包含的主要是谱面结构字段：

- `Chart.formatVersion`
- `Chart.offset`
- `Chart.judgeLineList`
- `ChartNote.type`
- `ChartNote.time`
- `ChartNote.positionX`
- `ChartNote.holdTime`
- `ChartNote.speed`
- `ChartNote.floorPosition`

因此 chart JSON 负责的是“怎么打”，不是“这首歌在 UI 中叫什么、归属哪个章节、标多少难度”。

## 5. noteCode / noteCodes 链路

### 5.1 `noteCode` 的生成

关键函数：

- `LevelControl__SetCodeForNote` `0x11ACFF8`
- `LevelControl__SetInformation` `0x11AD4A8`

静态确认逻辑：

- 每条判定线分别处理。
- `notesAbove` 从 `0` 开始，每个 note 递增 `10`。
- `notesBelow` 从 `100000` 开始，每个 note 递增 `10`。
- 每处理完一条判定线，两组基数都额外加 `1000000`。

因此 `noteCode` 实际编码了：

- 判定线块
- 上下区
- 该区内 note 顺序

`LevelControl__SetInformation(0x11AD4A8)` 还会继续补运行时字段，如：

- `realTime`
- `judgeLineIndex`
- `noteIndex`

这意味着 `noteCode` 是运行时统一身份码，不是 chart JSON 原始字段。

### 5.2 `noteCodes` 的消费

关键函数：

- `ScoreControl__Miss` `0x11E1FA8`
- `ScoreControl__Bad` `0x11E2044`
- `ScoreControl__Good` `0x11E20F4`
- `ScoreControl__Perfect` `0x11E229C`
- `ScoreControl__SetNoteCodeList` `0x11E2418`

静态确认逻辑：

- `Miss` 直接压入原始 `noteCode`
- `Bad` 压入 `noteCode + 1.5 + judgeTime`
- `Good` 压入 `noteCode + 2.5 + judgeTime`
- `Perfect` 压入 `noteCode + 3.5 + judgeTime`

随后 `ScoreControl__SetNoteCodeList(0x11E2418)` 会把 `_noteCodes` 复制到 `GameInformation._main.noteCodes`。

`ChallengeSongItem` 也持有 `List<float> noteCodes`，说明挑战模式/重演类系统复用的是“编码后的每 note 结果流”，不是单纯的 note id 列表。

## 6. 关键函数表

- `0x117B3E0` `ChapterSelector__LoadSongSelector`
- `0x11F3ECC` `SongSelector__Start`
- `0x11F7E30` `SongSelector__Update`
- `0x11FA3F0` `SongSelector__GameStart`
- `0x11FB460` `SongsItem__GetLevelStartInfo`
- `0x11FB2F8` `SongSelectorItem__GetLevelStartInfo`
- `0x11F6110` `SongSelectorItem__Init`
- `0x11B0360` `JsonUtility.FromJson<Chart>` 调用点
- `0x11ACFF8` `LevelControl__SetCodeForNote`
- `0x11AD4A8` `LevelControl__SetInformation`
- `0x11E1FA8` `ScoreControl__Miss`
- `0x11E2044` `ScoreControl__Bad`
- `0x11E20F4` `ScoreControl__Good`
- `0x11E229C` `ScoreControl__Perfect`
- `0x11E2418` `ScoreControl__SetNoteCodeList`

## 7. 动态验证建议

建议优先动态确认 3 件事：

1. `ChapterSelector__LoadSongSelector(0x117B3E0)` 是否直接写 `GameInformation.nowChapterCode`。
2. `SongSelector__Start(0x11F3ECC)` 如何从 `GameInformation.chapters` 找到 `nowChapterInfo`，以及是否有“按地区/限制歌单旁路”的分支。
3. `SongSelector__GameStart(0x11FA3F0)` 在不同特殊曲和动态替换条件下，最终落到哪个 `chartAddressableKey`。

可配合 `frida_song_chart_probe.js` 观察这些函数的命中顺序和资源 key。

## 8. 未确认点

- `ChapterSelector.LoadSongSelector -> GameInformation.nowChapterCode -> SongSelector.nowChapterInfo` 这条链的字段级证据已经较强，但具体赋值指令位置还没有单独写出。
- 没有看到单独名为 `album` 的字段；如果后续发现“专辑”在游戏内是另一套数据结构，需要继续补 `Chapter` 以外的初始化路径。
- 某些限时/地区限制歌单的旁路逻辑，可能通过 `songsBypassLimited` 或 selector 初始化局部 lambda 处理，建议后续针对 `SongSelector.Start` 继续深挖。
