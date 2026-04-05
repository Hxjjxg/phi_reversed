# UI / 歌曲 / 解锁 / 幻象回放(VisionReplay)分析

## 范围

此笔记重点分析当前加载在IDA中的iOS `UnityFramework` 二进制文件。

- 二进制文件：`UnityFramework`
- 以下地址对应的平台：iOS / Mach-O ARM64
- 交叉引用来源：`dump_ios.cs`
- 之前的Android笔记仍可用于逻辑对比；主要区别通常仅在于RVA（相对虚拟地址）。

## 1. 主UI和选歌流程

### 1.1 核心数据载体

`dump_ios.cs` 中的相关类：

- `SongsItem` 位于 `dump_ios.cs:592874`
- `LevelStartInfo` 位于 `dump_ios.cs:593356`
- `SongSelectorItem` 位于 `dump_ios.cs:605170`
- `SongSelector` 位于 `dump_ios.cs:604386`

`SongsItem` 存储静态歌曲元数据：

- `songsId`, `songsKey`, `songsName`, `songsTitle`
- `difficulty[]` (难度)
- `charter[]` (谱师)
- `composer` (作曲)
- `levels[]`
- `unlockInfo[]`
- `judgeLineImages`
- `levelMods`
- `hasDifferentMusic`, `differentMusic`
- `hasDifferentCover`, `differentCover`

这意味着歌曲难度和谱师信息并非从谱面JSON中读取。它们是存储在歌曲数据库对象(`SongsItem`)中的更高级别的歌曲元数据，然后在进入游戏前被复制到 `LevelStartInfo` 中。

### 1.2 `SongsItem -> LevelStartInfo`

函数：

- `SongsItem__GetLevelStartInfo` 位于 `0x11FB460`

关键逻辑：

- 分配一个新的 `LevelStartInfo`。
- 从 `SongsItem` 复制文本元数据：
  - `songsId`
  - `songsName`
  - `composer`
  - `charter[level]`
  - `illustrator`
  - `songsLevel = levels[level]`
  - `songsDifficulty = (int)difficulty[level]` 转换为字符串
- 构建资源键：
  - `musicAddressableKey`
  - `chartAddressableKey`
  - `illustrationKey`
- 克隆每级别的 `judgeLineImages` 和 `levelMods`。

这是歌曲数据库元数据移交至游戏过程的主要交接点。

### 1.3 作为运行时包装器的 `SongSelectorItem`

相关函数：

- `SongSelectorItem__.ctor` 位于 `0x11F5268`
- `SongSelectorItem__Init` 位于 `0x11F6110`
- `SongSelectorItem__GetLevelStartInfo` 位于 `0x11FB2F8`
- `SongSelectorItem__ChangeChartCode` 位于 `0x11FA1EC`
- `SongSelectorItem__Unlock` 位于 `0x11F9C30`

`SongSelectorItem` 包装了 `SongsItem` 并添加了运行时状态：

- `records`
- `chartAssetCode : Dictionary<int, string>`
- `unlockType`
- `unlockInfo`
- `price`
- `coverAssetCode`
- `coverBlurAssetCode`
- `extraLevelMods`
- `Unlocked` (已解锁)
- `LegacyPlayable` (旧版可玩)

`SongSelectorItem__GetLevelStartInfo(0x11FB2F8)`:

- 调用 `SongsItem__GetLevelStartInfo`。
- 追加运行时添加的 `extraLevelMods[level]`。
- 如果 `chartAssetCode` 包含 `level`，则覆盖 `levelStartInfo.chartAddressableKey`。

这是运行时替换谱面的清晰Hook点。任何交换谱面的特殊歌曲行为最终必定会落实到 `LevelStartInfo.chartAddressableKey` 上。

### 1.4 `SongSelector` UI行为

重要函数：

- `SongSelector.Start` 位于 `0x11F3ECC`
- `SongSelector.Update` 位于 `0x11F7E30`
- `SongSelector.SortSong` 位于 `0x11F6ABC`
- `SongSelector.RandomSong` 位于 `0x11F98CC`
- `SongSelector.LegacyStart` 位于 `0x11F8D68`
- `SongSelector.RandomStart` 位于 `0x11F8E10`
- `SongSelector.GameStart` 位于 `0x11FA3F0`
- `SongSelector.RefreshMirrorDisplay` 位于 `0x11F7D84`

`SongSelector.Update(0x11F7E30)` 处理：

- 歌曲列表拖动
- 封面拖动
- 吸附到目标歌曲
- 切换 `nowSong`
- 当前歌曲改变时调用 `SetText` 和 `ReplaceCover`
- 长按的隐藏操作（针对旧版(legacy) / 随机(random)入口）

`Update` 中值得注意的隐藏检查：

- 如果启用了旧版 (`enableLegacy`) 且当前 `SongSelectorItem.LegacyPlayable` 为 true，长按特定标记区域超过 `5.0s` 会触发 `LegacyStart`。
- 如果当前歌曲 ID 匹配特殊的随机歌曲 ID，长按另一个标记区域超过 `2.0s` 会触发 `RandomStart`。

### 1.5 游戏开始路径

函数：

- `SongSelector__GameStart` 位于 `0x11FA3F0`

主要流程：

1. 设置 `nowSongSelectorValue` 和 `nowSong`。
2. 读取 `SongSelectorItem`。
3. 将当前背景存储到 `GameInformation._main.background`。
4. 调用 `SongSelectorItem__GetLevelStartInfo`。
5. 在进入游戏前应用特殊歌曲替换。
6. 如果幻象回放(VisionReplay)模式开启，则应用其替换或状态回调。
7. 应用 QZK 或其他 level mods。
8. 将 `mirror` 标志写入 `LevelStartInfo`。
9. 将最终的 `LevelStartInfo` 存储至 `GameInformation._main.levelStartInfo`。
10. 更新 UI 文本（画师、谱师、难度、等级）。
11. 启动开始动画协程。

这是游戏开始前的核心调度器。

## 2. 歌曲 / 谱面 JSON 资源定位

### 2.1 谱面 JSON 不是歌曲数据库

谱面 JSON 仅携带谱面结构：

- `Chart` 位于 `dump_ios.cs:600547`
- `JudgeLine` 位于 `dump_ios.cs:600525`
- `ChartNote` 位于 `dump_ios.cs:600467`

字段：

- `Chart.formatVersion`
- `Chart.offset`
- `Chart.judgeLineList`
- `ChartNote.type`
- `ChartNote.time`
- `ChartNote.positionX`
- `ChartNote.holdTime`
- `ChartNote.speed`
- `ChartNote.floorPosition`

因此：

- 难度数值不存储在谱面 JSON 中
- 谱师 / 作曲 / 画师不存储在谱面 JSON 中
- 章节或歌单分组不存储在谱面 JSON 中

这些属于 `SongsItem`、`Chapter` 以及选择器侧的数据。

### 2.2 谱面 JSON 加载点

函数：

- `LevelControl__Start_d__42__MoveNext` 位于 `0x11B0360`，在协程 `MoveNext` 内部调用

`LevelControl__Start_d__42__MoveNext` 中的关键逻辑：

1. 读取 `GameInformation._main.levelStartInfo`。
2. 使用 `levelStartInfo.chartAddressableKey`。
3. 调用 `AssetStore__Get_TextAsset_(chartAddressableKey)`。
4. 获取 `TextAsset.text`。
5. 在 `0x11B0360` 处调用 `UnityEngine.JsonUtility.FromJson<Chart>`。
6. 将结果存储至 `LevelControl.chart`。
7. 如果 `levelStartInfo.mirror` 为 true，调用 `Chart__Mirror`。
8. 从 `levelStartInfo.musicAddressableKey` 设置音乐剪辑。
9. 将 `chart.judgeLineList` 复制到 `LevelInformation`。

这是实际按包加载谱面 JSON 的入口。

### 2.3 如何构建音乐 / 谱面 / 封面键值

来自 `SongsItem__GetLevelStartInfo(0x11FB460)`:

- `musicAddressableKey` 从歌曲 ID 构建，对于包含 `hasDifferentMusic` 的歌曲，可能会包含难度级别段。
- `chartAddressableKey` 始终从歌曲 ID + 级别名称构建。
- `illustrationKey` 通过 `IdBuilder__BuildCoverImageId(songId, levelOrEmpty)` 构建。

来自 `SongSelectorItem__GetLevelStartInfo(0x11FB2F8)`:

- 各个级别的 `chartAddressableKey` 可以通过 `chartAssetCode[level]` 进行重写。

来自 `SongSelectorItem__Init(0x11F6110)`:

- 预览剪辑代码也从歌曲 ID 构建，对于包含 `hasDifferentMusic` 的歌曲，它使用 `previewClipDifficulty`。

### 2.4 章节 / 专辑样式分组的位置

这部分不在谱面 JSON 中。静态分析证据表明分组在选择器一侧：

- `SongSelector` 包含 `nowChapterInfo`
- `GameInformation` 包含 `chapters`
- 歌曲显示和解锁逻辑由章节驱动

我没有在 `SongsItem` 中找到 `album` 字段。如果面向用户的“专辑/章节归属”指的是常规的选择器分组，那么它是章节侧的元数据，而不是谱面侧的元数据。

如果未来的工作需要精确的章节-歌曲映射，请检查 `Chapter`、`ChapterSongItem` 和选择器初始化代码，而不是谱面解析代码。

## 3. noteCode 和 noteCodes 数组

### 3.1 单个音符的运行时 ID

相关结构体：

- `ChartNote.noteCode` 位于 `dump_ios.cs:600481`
- `GameInformation.noteCodes` 位于 `dump_ios.cs:592955`
- `ScoreControl._noteCodes` 位于 `dump_ios.cs:601033`
- `ChallengeSongItem.noteCodes` 位于 `dump_ios.cs:604026`

生成函数：

- `LevelControl__SetCodeForNote` 位于 `0x11ACFF8`

逻辑：

- 遍历每个 `JudgeLine`。
- 对于 `notesAbove`，从 `0` 开始，每次递增 `10`。
- 对于 `notesBelow`，从 `100000` 开始，每次递增 `10`。
- 每个判定线之后，两个基数都增加 `1000000`。

因此，`noteCode` 是一个编码了以下信息的确定性运行时标识符：

- 判定线块
- 上/下轨道组
- 该组内音符的具体顺序

它不是原始的谱面 JSON 内容，而是在 JSON 加载后分配的。

### 3.2 运行时元数据填充

位于 `0x11AD4A8` 的 `LevelControl__SetInformation` 进一步填充了诸如以下的运行时字段：

- `realTime`
- `judgeLineIndex`
- `noteIndex`
- 其他音符排序信息

结合 `noteCode`，每个音符都变成唯一可追溯的，用于分数 / 回放 / 课题结算逻辑。

### 3.3 `ScoreControl._noteCodes` 是一个结果事件数组

相关函数：

- `ScoreControl__Miss` 位于 `0x11E1FA8`
- `ScoreControl__Bad` 位于 `0x11E2044`
- `ScoreControl__Good` 位于 `0x11E20F4`
- `ScoreControl__Perfect` 位于 `0x11E229C`
- `ScoreControl__SetNoteCodeList` 位于 `0x11E2418`

观察到的编码：

- `Miss(noteCode)` 压入原始的 `noteCode`
- `Bad(noteCode, judgeTime)` 压入 `(noteCode + 1.0 + 0.5) + judgeTime`
- `Good(noteCode, judgeTime, ...)` 压入 `(noteCode + 2.0 + 0.5) + judgeTime`
- `Perfect(noteCode, judgeTime, ...)` 压入 `(noteCode + 3.0 + 0.5) + judgeTime`

然后位于 `0x11E2418` 的 `ScoreControl__SetNoteCodeList` 会将 `_noteCodes` 复制到 `GameInformation._main.noteCodes`。

结论：

- `ChartNote.noteCode` 是单音符标识。
- `ScoreControl._noteCodes` / `GameInformation.noteCodes` 是每次游玩的结果/事件数组。
- 事件数组将标识与判定结果类型及时间偏移量混合，这样以后的系统可以重建每个音符的判定结果。

这很可能是为什么课题 / 回放风格的系统保留一个 `List<float> noteCodes` 的原因：它是密集的结果遥测数据，而不仅仅是一个 ID 列表。

## 4. 课题模式 (Challenge mode) 相关路径

### 4.1 课题选择器

类：

- `ChallengeSongSelectorControl` 位于 `dump_ios.cs:603925`

函数：

- `Start` 位于 `0x116FFA8`
- `SetUiPos` 位于 `0x1170018`
- `SelectSong` 位于 `0x1170304`
- `SetText` 位于 `0x1170680`
- `UndoSelectSong` 位于 `0x117082C`
- `Play` 位于 `0x1170938`

### 4.2 选择逻辑

`ChallengeSongSelectorControl__SelectSong(0x1170304)`:

- 最大选择数量为3。
- 通过 `(SongSelectorItem, levelIndex)` 去重。
- 创建 `ChallengeSongItem`。
- 存储：
  - `songInfo`
  - `levelIndex`
- 更新侧边三个预览封面和难度文本。

`ChallengeSongSelectorControl__SetText(0x1170680)`:

- 如果当前歌曲+难度已选中，则禁用 `selectButton`。
- 仅当选中数量 `> 2` 时，`playButton` 才变为可交互。

`ChallengeSongSelectorControl__Play(0x1170938)`:

- 要求至少选择 3 首歌曲。
- 开始跳转到场景 `StringLiteral_11468`，即课题场景。
- 写入 `GameInformation`：
  - `nowChallengeIndex = 0`
  - `challengeSongItems = this.challengeSongItems`
- 如果不知何故存在多于 3 个项目，会将其修剪回 3 个。

### 4.3 课题模式游戏开始

函数：

- `ChallengeModeControl__GameStart` 位于 `0x116D95C`

逻辑：

- 将选定的背景复制到 `GameInformation._main.background`
- 调用 `SongSelectorItem__GetLevelStartInfo(songItem, levelIndex)`
- 将一个课题模式 level mod 标记 (`StringLiteral_11464`) 追加到 `levelStartInfo.levelMods` 中
- 将最终的 `levelStartInfo` 写入 `GameInformation._main.levelStartInfo`
- 启动课题模式开始协程

### 4.4 课题模式结果载体

`ChallengeSongItem` 字段：

- `songInfo`
- `levelIndex`
- `result`
- `noteCodes`

这强烈暗示了课题模式为每个阶段/歌曲存储了常规结果结构体以及按音符编码的结果数组。

## 5. 特殊歌曲解锁和替换逻辑

### 5.1 `SongSelectorItem` 上的普通解锁状态

`SongSelectorItem__.ctor(0x11F5268)`:

- `unlockType == -1` 表示已解锁。
- `unlockType == 1` 将 `unlockInfo` 解析为 MB 价格，并存入 `price`。
- `chartUnlockInfo[]` 控制可玩的难度数量。
- 同时计算 `_hasLegacy` 和 `_LegacyPlayable`。

`SongSelectorItem__Unlock(0x11F9C30)`:

- 仅处理 `unlockType == 1` 的购买式解锁。
- 设置 `Unlocked = true`
- 清除锁定视觉效果
- 重新计算 `LegacyPlayable`

这是通用的付费解锁路径，而不是特殊过场动画解锁路径。

### 5.2 Igallta / Rrharil / DESTRUCTION 3,2,1 / Distorted Fate 专属控制器

专属类：

- `D321UnlockControl` 位于 `dump_ios.cs:606420`
- `DFUnlockControl` 位于 `dump_ios.cs:606560`
- `IgalltaUnlock` 位于 `dump_ios.cs:606820`
- `RrharilUnlockControl` 位于 `dump_ios.cs:607529`

值得注意的方法：

- `D321UnlockControl.Start` 位于 `0x118AE30`
- `IgalltaUnlock.PlayUnlockVideo` 位于 `0x11A5CC8`
- `IgalltaUnlock.UnlockAnimation` 位于 `0x11A5D30`
- `RrharilUnlockControl.PlayUnlockVideo` 位于 `0x11D6E74`
- `RrharilUnlockControl.GameStart` 协程位于 `0x11D6FD4`

这些是表现 / 过场动画控制器。实际的持久化状态位保存在存档键和 VisionReplay 进度键中，而不单独在这些 MonoBehaviours 内。

### 5.3 开始期间第八章特殊替换

在 `SongSelector__GameStart(0x11FA3F0)` 中：

- 它在进入游戏前对两个特定的歌曲 ID 执行特殊处理。
- 如果条件匹配，它会将选定歌曲的 `LevelStartInfo` 替换为另一首歌的 `LevelStartInfo`，更新 UI 选择器中的名称/艺术家/封面，并且可能会添加额外的 `levelMods`。

两个辅助函数：

- `SongSelector__ReplaceWithMicroWave` 位于 `0x11FC2C8`
- `SongSelector__ReplaceWithTheChariotReviival` 位于 `0x11FC770`

`ReplaceWithMicroWave(0x11FC2C8)`:

- 检查 `VisionReplay.Process[Chapter8UnlockBegin]`
- 检查 `VisionReplay.Process[C8CraveWaveUnlocked]`
- 如果当前歌曲 ID 匹配触发歌曲，并且 Crave Wave 尚未解锁，则执行：
  - 播放闪光动画
  - 将 `*levelStartInfo` 交换为在 `GameInformation.song.mainSongs` 中找到的另一首歌曲
  - 重写显示的歌曲名称 / 艺术家 / 封面 / 模糊效果

`ReplaceWithTheChariotReviival(0x11FC770)`:

- 逻辑相似
- 检查 `VisionReplay.Process[Chapter8UnlockBegin]`
- 检查 `VisionReplay.Process[C8TheChariotREVIIVALUnlocked]`
- 交换到另一首歌曲，并追加额外的 level mod 标记 `StringLiteral_11503`

所以这些“特殊歌曲”不只是通过一个简单的布尔值来解锁。开始路径可以基于存储的进度标志，动态地将一个歌曲条目重定向到另一个谱面/音乐包。

## 6. 幻象回放 (VisionReplay) / 虫眼 / 第八章进度

### 6.1 核心回放状态

类：

- `Phigros2.VisionReplay.VisionReplay`

字段：

- `IsOn`
- `IsSimulateMode`
- 持久化键名 `IsVisionReplayOn`

核心方法：

- `TurnOn` 位于 `0x11C8864`
- `TurnOff` 位于 `0x11C94B8`
- `BootSimulateMode` 位于 `0x11C9E6C`
- `ExitSimulateMode` 位于 `0x11C9EC0`
- `InitC8ReplayProcess` 位于 `0x11C9CEC`
- `ResetC8Process` 位于 `0x11C9F10`
- `RecoverC8SecondPhase` 位于 `0x11CA340`

### 6.2 `TurnOn` 做了什么

`VisionReplay__TurnOn(0x11C8864)`:

- `SaveManagement.SaveBool(IsVisionReplayOn, true)`
- 静态变量设为 `IsOn = true`
- 加载另一个布尔键 (`StringLiteral_11501`) 存入 `IsSimulateMode`
- 调用 `InitC8ReplayProcess()`

`TurnOff(0x11C94B8)`:

- `SaveManagement.SaveBool(IsVisionReplayOn, false)`
- 清除 `IsOn`
- 清除 `IsSimulateMode`

### 6.3 VisionReplay 键

`VisionReplay.Key` 暴露了用于以下内容的持久化字符串键：

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

这是最清晰的静态证据，表明 VisionReplay 直接与第8章进度重播 / 恢复逻辑绑定，而不仅仅是一个外观开关。

### 6.4 回放进度的初始化 / 重置 / 恢复

`InitC8ReplayProcess(0x11C9CEC)`:

- 如果存在 `Chapter8Passed`，则调用 `ResetC8Process()`
- 如果存在 `FirstOpenGameAfterChapter8FirstPhaseClear`，则调用 `RecoverC8SecondPhase()`

`ResetC8Process(0x11C9F10)`:

- 删除 `Chapter8UnlockSecondPhase`
- 删除 `Chapter8Passed`
- 重置 `C8Unlock`
- 将第8章的重播进度值重置为 0：
  - `Chapter8UnlockBegin`
  - `C8CraveWaveUnlocked`
  - `C8TheChariotREVIIVALUnlocked`
  - `C8RetributionUnlocked`
  - `C8DESTRUCTION321Unlocked`
  - `Chapter8UnlockSecondPhase`
  - `C8DistortedFateUnlocked`
  - `Chapter8Passed`
- 同时通过 `C8Unlock__SetValue(...)` 重置了几个 `C8Unlock` 歌曲 ID

`RecoverC8SecondPhase(0x11CA340)`:

- 将第8章第二阶段相关的进度值重置为 1：
  - `Chapter8UnlockBegin`
  - `C8CraveWaveUnlocked`
  - `C8TheChariotREVIIVALUnlocked`
  - `C8RetributionUnlocked`
  - `C8DESTRUCTION321Unlocked`
  - `Chapter8UnlockSecondPhase`
- 并在 `C8Unlock` 中标记几个第8章的解锁 ID

由此可见 VisionReplay 实际上是一个第8章状态机的重播器 / 恢复器。

### 6.5 UI 按钮

类：

- `VisionReplayButton` 位于 `dump_ios.cs:608592`

重要方法：

- `OnEnable` 位于 `0x11C8F2C`
- `OnDisable` 位于 `0x11C8F9C`
- `ToggleStyle` 位于 `0x11C9014`
- `OnClick` 位于 `0x11C93D0`

`VisionReplayButton__OnClick(0x11C93D0)`:

- 如果回放已经开启：
  - 调用手动关闭弹窗事件
  - 切换 UI
  - 播放 SE
  - 调用 `VisionReplay.TurnOff()`
- 如果回放关闭：
  - 开启弹窗事件而不是立即启用
  - 播放 SE

这意味着实际的开启很可能是通过一个弹窗确认流程来实现的，而不是直接通过按钮切换。

## 7. 尚未完全解决的问题

### 7.1 `Album` 确切字段

此处的静态分析显示：

- 歌曲元数据位于 `SongsItem` 中
- 分组位于章节侧
- 谱面 JSON 不包含专辑(album)/章节(chapter)信息

但是我并没有在 `SongsItem` 中找到专属的 `album` 字段。如果后续工作需要确切的“专辑”概念，请检查选择器的初始化和章节/横幅资源。

### 7.2 字符串常量(String literal)到具体歌曲 ID 的精确映射

几个特殊的分支使用 `StringLiteral_xxxxx` 常量。其控制流是清晰的，但每个分支对应的确切面向用户的歌曲名称依然需要：

- 从元数据表中解析字符串常量，或
- 使用运行时钩子(hook)进行日志记录

## 8. 建议的 Frida 探针(Probes)

### 8.1 在进入游戏前记录最终的 `LevelStartInfo`

使用它来确认特殊歌曲替换和回放相关的覆写。

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

### 8.2 记录谱面键覆盖(Override)

使用它来确认通过 `SongSelectorItem.chartAssetCode` 进行的运行时谱面替换。

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

### 8.3 记录回放切换(Toggle)和第8章恢复

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

### 8.4 记录 noteCode 结果编码

使用它来验证分数-事件的编码公式。

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

## 9. 简短总结

- 歌曲元数据和难度位于选择器/数据库侧 (`SongsItem`)，而不属于谱面 JSON 侧。
- 谱面 JSON 是在 `LevelControl__Start_d__42__MoveNext` 中通过 `LevelStartInfo.chartAddressableKey` 加载的。
- 运行时的谱面替换通过覆盖 `SongSelectorItem.chartAssetCode[level]` 来实现。
- `noteCode` 是一个生成的单个音符运行时 ID；`noteCodes` 数组代表结果/事件追踪，而不单纯仅是原始 ID。
- 课题模式会将恰好 3 个 `(歌曲, 难度)` 组合预选进 `GameInformation.challengeSongItems`。
- VisionReplay 紧密地耦合了第八章的状态恢复和特殊歌曲替换功能，它绝不仅仅是一个视觉切换按钮。
