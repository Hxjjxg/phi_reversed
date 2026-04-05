# 特殊曲解锁 / 挑战模式 / VisionReplay 首版深挖

基于当前 IDA 会话中的 iOS `UnityFramework`，以下地址均为 iOS / Mach-O ARM64。

## 1. 概览

当前可以静态确认的主结论有 5 条：

1. 特殊曲并不只是“解锁后可见”这么简单，`SongSelector__GameStart` `0x11FA3F0` 在开局前会按章节 8 的流程状态做资源替换。
2. 章节 8 相关状态不是散落在场景脚本里，而是统一收口到 `VisionReplay.Key` 和 `VisionReplay.Process`。
3. `ChallengeSongSelectorControl` 负责课题/挑战模式的三首歌选取，`ChallengeModeControl__GameStart` `0x116D95C` 才是每一段正式开局的入口。
4. `ChallengeSongItem.noteCodes` 说明挑战模式会保留每首歌的逐 note 结果流，不只是最终分数。
5. 特殊曲演出控制器如 `IgalltaUnlock`、`RrharilUnlockControl`、`D321UnlockControl` 更偏表现层，真正持久化的状态位仍然在存档 key / VisionReplay 流程字典里。

## 2. 特殊曲解锁与开局替换

### 2.1 总入口

关键函数：

- `SongSelector__GameStart` `0x11FA3F0`
- `SongSelector__ReplaceWithMicroWave` `0x11FC2C8`
- `SongSelector__ReplaceWithTheChariotReviival` `0x11FC770`

`SongSelector__GameStart(0x11FA3F0)` 会先取当前 `SongSelectorItem -> LevelStartInfo`，再根据流程状态决定：

- 是否做章节 8 特殊曲替换
- 是否注入额外 `levelMods`
- 是否走 VisionReplay 相关回放/状态逻辑

因此，对“为什么选中的歌最后进的是另一张谱面/另一套资源”的追踪，核心断点就是这里。

### 2.2 章节 8 替换逻辑

已有静态结论表明：

- `SongSelector__ReplaceWithMicroWave(0x11FC2C8)` 会把当前入口歌替换成 `Crave Wave / MicroWave` 相关资源与显示信息。
- `SongSelector__ReplaceWithTheChariotReviival(0x11FC770)` 会把入口歌替换成 `The Chariot REVIIVAL`，同时附加额外 level mod。

替换是否发生，不是只看当前 song id，还会看流程状态字典中的布尔值，例如：

- `VisionReplay.Key.Chapter8UnlockBegin`
- `VisionReplay.Key.C8CraveWaveUnlocked`
- `VisionReplay.Key.C8TheChariotREVIIVALUnlocked`

这说明特殊曲“解锁”实际包含两层：

1. 持久化 flag 是否允许进入某阶段。
2. 开局前是否把当前入口歌重定向到隐藏曲资源。

### 2.3 表现层控制器

关键函数：

- `D321UnlockControl__Start` `0x118AE30`
- `IgalltaUnlock__PlayUnlockVideo` `0x11A5CC8`
- `IgalltaUnlock__UnlockAnimation` `0x11A5D30`
- `RrharilUnlockControl__PlayUnlockVideo` `0x11D6E74`
- `RrharilUnlockControl__GameStart` `0x11D6FD4`

这些控制器负责：

- 解锁视频/动画播放
- 解锁界面曲目信息装填
- 动画播完后进入正式开局

但从当前结构看，它们更像“表现与过场”，不是最终持久化 flag 的唯一来源。

## 3. Challenge / 课题模式流程

### 3.1 选曲阶段

关键函数：

- `ChallengeSongSelectorControl__Start` `0x116FFA8`
- `ChallengeSongSelectorControl__SelectSong` `0x1170304`
- `ChallengeSongSelectorControl__SetText` `0x1170680`
- `ChallengeSongSelectorControl__UndoSelectSong` `0x117082C`
- `ChallengeSongSelectorControl__Play` `0x1170938`

静态确认的逻辑：

- 最多选 3 首。
- `SelectSong` 会按 `(SongSelectorItem, levelIndex)` 去重。
- 选中后生成 `ChallengeSongItem`。
- `Play` 要求至少选满 3 首，然后把列表写到全局挑战状态并切场景。

`ChallengeSongItem` 结构已经明确包含：

- `songInfo`
- `levelIndex`
- `result`
- `noteCodes`

这说明每一段挑战结果不仅保存最终结算，还保存逐 note 编码结果。

### 3.2 正式开局

关键函数：

- `ChallengeModeControl__GameStart` `0x116D95C`

`ChallengeModeControl__GameStart(0x116D95C)` 的职责是：

1. 读取 `ChallengeSongItem.songInfo + levelIndex`。
2. 调 `SongSelectorItem__GetLevelStartInfo` 转成正式 `LevelStartInfo`。
3. 对该 `LevelStartInfo` 注入 challenge 专用 mod。
4. 再进入正常关卡开场动画。

这意味着 challenge 模式本质上是“复用普通开局管线，但在入口附加额外模式标记”。

### 3.3 Rank 与存档

静态字段：

- `GameProgressSaveModule.challengeModeRank`

结合已有存档分析，可确认挑战模式等级不是临时 UI 值，而是持久化到 `GameProgressSaveModule` 的字段。

此外，`CloudSaveSummary$$FromLocalSave` 也会把 `ChallengeModeRank` 收进摘要，说明它参与云存档展示或冲突判定信息。

## 4. VisionReplay / 虫眼 / 重演 / revision

### 4.1 核心状态

关键函数：

- `VisionReplay__TurnOn` `0x11C8864`
- `VisionReplay__TurnOff` `0x11C94B8`
- `VisionReplay__BootSimulateMode` `0x11C9E6C`
- `VisionReplay__ExitSimulateMode` `0x11C9EC0`
- `VisionReplay__InitC8ReplayProcess` `0x11C9CEC`
- `VisionReplay__ResetC8Process` `0x11C9F10`
- `VisionReplay__RecoverC8SecondPhase` `0x11CA340`

字段：

- `VisionReplay.IsOn`
- `VisionReplay.IsSimulateMode`

这说明 VisionReplay 既有总开关，也有单独的 simulate mode。

### 4.2 持久化 key

`VisionReplay.Key` 暴露了整套关键 key 名：

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

说明章节 8 特殊曲与 VisionReplay 流程本质上共享同一套 key 空间。

### 4.3 过程字典

关键函数：

- `VisionReplay.Process__SetValue` `0x11CA608`
- `VisionReplay.Process__GetValue` `0x11CB7CC`

`VisionReplay.Process` 内部是 `Dictionary<string, bool>`，因此很多“是否已进入某阶段/是否已触发某特殊曲”并不是硬编码字段，而是字典值。

这也是 `SongSelector__GameStart` 能根据流程状态动态替换歌曲的基础。

### 4.4 按钮与 UI

关键函数：

- `VisionReplayButton__OnEnable` `0x11C8F2C`
- `VisionReplayButton__OnDisable` `0x11C8F9C`
- `VisionReplayButton__ToggleStyle` `0x11C9014`
- `VisionReplayButton__OnClick` `0x11C93D0`

`VisionReplayButton` 负责：

- 根据开关状态切换按钮外观
- 响应点击
- 刷新 overlay/base 文本

因此“虫眼/重演/revision 是否开启”的 UI 面板联动点，首选就是这几个函数。

## 5. 关键函数表

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

## 6. 动态验证建议

建议优先做 4 组动态确认：

1. hook `SongSelector__GameStart`、`ReplaceWithMicroWave`、`ReplaceWithTheChariotReviival`，确认特殊曲替换时的实际 song id / chart key。
2. hook `VisionReplay.Process__SetValue` / `GetValue`，观察章节 8 流程位何时被置位。
3. hook `ChallengeSongSelectorControl__Play` 和 `ChallengeModeControl__GameStart`，确认三首歌列表如何写入全局状态。
4. hook `IgalltaUnlock` / `RrharilUnlockControl` 的播放与开局函数，确认表现层脚本和持久化 flag 的先后关系。

可直接使用 `frida_unlock_vision_probe.js` 作为后续动态确认模板。

## 7. 未确认点

- 各个特殊曲解锁控制器内部“置位保存 key”的精确调用点还没逐个反汇编展开。
- VisionReplay 的 simulate mode 是否直接影响结算或只影响开局流程，还需要动态跑一次。
- `ChallengeModeRank` 的更新函数还没有单独追到，当前只静态确认了它的持久化字段存在。
