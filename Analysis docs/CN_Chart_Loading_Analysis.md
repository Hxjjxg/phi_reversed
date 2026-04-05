# Phigros 谱面加载与 Note 列表构建逆向分析

## 一、结论总览

当前版本中，谱面不是在判定层或 `LevelInformation` 内直接读取的，而是在关卡启动协程中按资源键异步获取 `TextAsset`，随后直接反序列化为 `Chart` 对象。

主链如下：

```text
LevelControl.Start
  -> LevelControl._Start_d__42$$MoveNext (0x11AFF7C)
  -> LevelStartInfo.chartAddressableKey
  -> AssetStore.Get<TextAsset> (0x121EB18)
  -> AssetStore.AssetRef<TextAsset>.get_WaitForPrepare
  -> TextAsset.text
  -> UnityEngine.JsonUtility.FromJson<Chart> (0x2BBAD64)
  -> Chart
  -> Chart.Mirror (可选)
  -> LevelInformation.judgeLineList = chart.judgeLineList
  -> SortForNoteWithFloorPosition
  -> SetCodeForNote
  -> SetInformation
  -> SortForAllNoteWithTime
  -> LevelInformation.chartLoaded = true
```

运行时实际消费的总 note 列表不是 JSON 里直接给出的单独数组，而是由 `SetInformation` 从每条 `JudgeLine` 的 `notesAbove` / `notesBelow` 扁平化后写入 `LevelInformation.chartNoteSortByTime`。

---

## 二、关键数据结构

### 1. ChartNote

定义位置：`dump.cs` 中 `ChartNote` 类。

关键字段：

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

说明：前六个字段对应谱面 JSON 原始内容；后面的 `realTime`、`judgeLineIndex`、`noteIndex`、`noteCode` 是运行时整理阶段补写的字段。

### 2. JudgeLine

定义位置：`dump.cs` 中 `JudgeLine` 类。

关键字段：

- `bpm`
- `speedEvents`
- `notesAbove`
- `notesBelow`
- `judgeLineDisappearEvents`
- `judgeLineMoveEvents`
- `judgeLineRotateEvents`

说明：与 `ez.txt.pretty.json` / `chart.txt` 中的结构完全对应。

### 3. Chart

函数：

- `Chart$$Mirror (0x117C97C)`
- `Chart$$GetNoteCount (0x117CA84)`
- `Chart$$.ctor (0x117CBB4)`

关键字段：

- `formatVersion`
- `offset`
- `judgeLineList`

说明：这是 `JsonUtility.FromJson<Chart>` 的直接目标类型。

### 4. LevelInformation

函数：

- `LevelInformation$$Start (0x11B0E3C)`
- `LevelInformation$$Update (0x11B0EB8)`
- `LevelInformation$$.ctor (0x11B1128)`

关键字段：

- `judgeLineList`
- `chartNoteSortByTime`
- `numOfNotes`
- `offset`
- `noteScale`
- `scale`
- `chartLoaded`

说明：`judgeLineList` 保存整张谱面的判定线数据；`chartNoteSortByTime` 是运行时最终使用的扁平 note 列表。

### 5. LevelStartInfo

关键字段：

- `musicAddressableKey`
- `chartAddressableKey`
- `judgeLineImages`

说明：`chartAddressableKey` 是谱面资源的入口键，不是直接文件路径。

### 6. AssetStore / AssetRef<T>

关键函数：

- `AssetStore.Get<TextAsset> (0x121EB18)`

关键属性与方法：

- `AssetStore.AssetRef<T>.Obj`
- `AssetStore.AssetRef<T>.WaitForPrepare`
- `AssetStore.AssetRef<T>.ReleaseAll`

说明：这是资源层包装。关卡逻辑通过它按 key 获取 `TextAsset`，如果资源未准备好则等待 `WaitForPrepare`，准备完成后再读取对象。

---

## 三、谱面加载入口

### 核心函数

- `LevelControl$$Start (0x11ACF00)`
- `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)`

### 逻辑说明

`LevelControl.Start` 是一个协程，真实逻辑在编译器生成的 `MoveNext` 里。

协程中的谱面加载步骤：

1. 从 `GameInformation._main.levelStartInfo` 取到当前关卡参数。
2. 读取 `levelStartInfo.chartAddressableKey`。
3. 调用 `AssetStore.Get<TextAsset>` 获取谱面文本资源包装对象。
4. 如果 `AssetRef.obj` 仍为空，则 yield `AssetRef.WaitForPrepare`，等待资源层准备完成。
5. 资源就绪后读取 `TextAsset.text`。
6. 调用 `UnityEngine.JsonUtility.FromJson<Chart>`，把 JSON 文本直接反序列化成 `Chart`。
7. 将结果写入 `LevelControl.chart`。
8. 调用 `AssetRef.ReleaseAll` 释放当前谱面文本引用。

### 关键点

- 这里没有看到手写 JSON 字段解析循环。
- 也没有看到 `Newtonsoft.Json` 参与这条主链。
- 当前关卡谱面主路径明确是 `JsonUtility.FromJson<Chart>`。

---

## 四、反序列化后的初始化流程

仍然发生在 `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)` 中。

### 1. 镜像处理

如果 `LevelStartInfo._mirror_k__BackingField` 为真，则调用：

- `Chart$$Mirror (0x117C97C)`

作用：对谱面执行镜像，内部会继续调用各 `JudgeLine` 的镜像逻辑。

### 2. 音频设置

函数内还会把：

- `levelStartInfo.musicAddressableKey`

设置到 `progressControl.audioSource`，这说明谱面和音乐都经由同一套资源键系统取出。

### 3. 基础关卡信息写入

函数内会把反序列化后的 `Chart` 内容写入 `LevelInformation`：

- `LevelInformation.offset = chart.offset + gameOffset + mainOffset`
- `LevelInformation.noteScale = gameInformation.noteScale`
- `LevelInformation.scale = 根据屏幕比例修正后的 noteScale`
- `LevelInformation.musicVol = gameInformation.musicVol`
- `LevelInformation.hitFxIsOn = gameInformation.hitFxIsOn`
- `LevelInformation.numOfNotes = Chart.GetNoteCount()`
- `LevelInformation.speed = gameInformation.speed`
- `LevelInformation.judgeLineList = chart.judgeLineList`

其中 note 总数来自：

- `Chart$$GetNoteCount (0x117CA84)`

---

## 五、Note 列表整理阶段

在 `MoveNext` 里，谱面解析成功后会依次调用以下几个函数：

1. `LevelControl$$SortForNoteWithFloorPosition (0x11AD228)`
2. `LevelControl$$SetCodeForNote (0x11ACFF8)`
3. `LevelControl$$SetInformation (0x11AD4A8)`
4. `LevelControl$$SortForAllNoteWithTime (0x11AF80C)`

这四步共同完成从原始谱面数据到运行时消费数据的转换。

### 1. SortForNoteWithFloorPosition

函数：`LevelControl$$SortForNoteWithFloorPosition (0x11AD228)`

作用：

- 遍历 `LevelInformation.judgeLineList`
- 分别对每条线的 `notesAbove` 和 `notesBelow` 进行排序

意义：

- 保证同一条线内的 note 在进入进一步处理前，已有稳定的 floorPosition 顺序。

### 2. SetCodeForNote

函数：`LevelControl$$SetCodeForNote (0x11ACFF8)`

作用：

- 遍历每条 `JudgeLine`
- 给 `notesAbove` / `notesBelow` 的每个 `ChartNote` 写入 `noteCode`

编码特征：

- 同一条线的 `notesAbove` 从较小值递增
- `notesBelow` 从另一组大偏移值递增
- 不同 judgeLine 之间使用更大的步进分段

意义：

- `noteCode` 后续用于判定、分数或 UI 标识，是运行时唯一编号的一部分。

### 3. SetInformation

函数：`LevelControl$$SetInformation (0x11AD4A8)`

这是“获取 note 列表”的核心函数。

#### 核心职责

1. 遍历 `LevelInformation.judgeLineList`
2. 分别遍历每条线的 `notesAbove` 和 `notesBelow`
3. 对每个 `ChartNote` 计算运行时字段
4. 把所有 note 追加到 `LevelInformation.chartNoteSortByTime`

#### 已确认的字段写入

通过反编译与反汇编可确认该函数会对每个 `ChartNote` 写入：

- `realTime`
- `holdTime` 的运行时换算值
- `judgeLineIndex`
- `noteIndex`
- `isJudged = 0`

并调用：

- `List<ChartNote>.Add`

把 note 插入 `LevelInformation.chartNoteSortByTime`。

#### realTime 计算

使用：

- `LevelControl$$GetRealTime (0x11AF7F8)`

公式为：

```text
realTime = time * 1.875 / bpm
```

这与 Phigros 谱面单位 `1/128 拍` 的换算关系一致。

#### holdTime 换算

在 `SetInformation` 中，`holdTime` 也会按 bpm 被换算成运行时使用的秒数，而不是继续保持 JSON 中的谱面 tick 单位。

#### 列表扁平化

这是最关键的点：

- 原始 JSON 的 note 分散存放在 `judgeLineList[*].notesAbove` / `notesBelow`
- `SetInformation` 将它们逐个抽出并追加到 `LevelInformation.chartNoteSortByTime`

因此：

- `judgeLineList` 是原始结构化谱面
- `chartNoteSortByTime` 是运行时总 note 列表

### 4. SortForAllNoteWithTime

函数：`LevelControl$$SortForAllNoteWithTime (0x11AF80C)`

作用：

- 对 `LevelInformation.chartNoteSortByTime` 做最终排序
- 排序键是 `ChartNote` 的 `realTime`

意义：

- 便于后续 `JudgeControl`、`NoteUpdateManager`、各类 `*Control` 以时间顺序消费 note。

---

## 六、加载完成后的运行时连接点

在 `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)` 完成整理后：

1. `judgeControl.chartNoteSortByTime = levelInformation.chartNoteSortByTime`
2. 根据 `judgeLineList` 数量实例化对应数量的 `JudgeLineControl`
3. 最后设置：
   - `LevelInformation.chartLoaded = true`

这意味着：

- `chartLoaded` 是“谱面已完成解析和运行时整理”的标志，而不是“TextAsset 已经读到”的标志。
- 在它置位之前，判定更新层不会正常消费 note 列表。

---

## 七、关键函数清单

### 资源与反序列化

- `LevelControl$$Start (0x11ACF00)`
  - 关卡启动协程入口

- `LevelControl._Start_d__42$$MoveNext (0x11AFF7C)`
  - 谱面加载、反序列化、关卡初始化主逻辑

- `AssetStore.Get<TextAsset> (0x121EB18)`
  - 按 `chartAddressableKey` 获取谱面文本资源

- `UnityEngine.JsonUtility.FromJson<Chart> (0x2BBAD64)`
  - JSON 文本 -> `Chart`

### 谱面对象本身

- `Chart$$Mirror (0x117C97C)`
  - 镜像谱面

- `Chart$$GetNoteCount (0x117CA84)`
  - 统计 note 总数

### Note 运行时整理

- `LevelControl$$SortForNoteWithFloorPosition (0x11AD228)`
  - 对每条判定线内的 note 按 floorPosition 排序

- `LevelControl$$SetCodeForNote (0x11ACFF8)`
  - 为每个 note 生成 noteCode

- `LevelControl$$GetRealTime (0x11AF7F8)`
  - `time -> realTime` 换算函数

- `LevelControl$$SetInformation (0x11AD4A8)`
  - 计算运行时字段并构建总 note 列表

- `LevelControl$$SortForAllNoteWithTime (0x11AF80C)`
  - 对总 note 列表按 `realTime` 排序

---

## 八、关键调用链

### 1. 谱面加载链

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

### 2. 谱面初始化链

```text
Chart
  -> Chart.GetNoteCount
  -> LevelInformation.numOfNotes

Chart.judgeLineList
  -> LevelInformation.judgeLineList
```

### 3. Note 扁平化链

```text
LevelInformation.judgeLineList[*].notesAbove / notesBelow
  -> LevelControl.SetInformation
  -> 写入 realTime / holdTime / judgeLineIndex / noteIndex
  -> Add 到 LevelInformation.chartNoteSortByTime
  -> LevelControl.SortForAllNoteWithTime
```

### 4. 运行时消费前的连接链

```text
LevelInformation.chartNoteSortByTime
  -> JudgeControl.chartNoteSortByTime
  -> 后续 JudgeControl / NoteUpdateManager / Click/Drag/Hold/FlickControl 消费
```

---

## 九、当前可以下的判断

### 已确认

1. 谱面资源入口是 `LevelStartInfo.chartAddressableKey`。
2. 资源类型是 `TextAsset`。
3. 反序列化使用 `UnityEngine.JsonUtility.FromJson<Chart>`。
4. `Chart` / `JudgeLine` / `ChartNote` 字段与样例 JSON 对应。
5. 运行时总 note 列表由 `SetInformation` 构建到 `LevelInformation.chartNoteSortByTime`。
6. `chartLoaded = true` 出现在整套初始化完成之后。

### 仍可继续深挖

1. `AssetStore.AssetRef<T>.ctor / OnLoaded` 最终接到哪一层 Addressables / AssetBundle API。
2. `JudgeControl` 如何消费 `chartNoteSortByTime` 做候选 note 匹配。
3. `NoteUpdateManager` 如何把总 note 列表分发到 Click / Drag / Hold / Flick 对象池。

---

## 十、一句话总结

当前版本的谱面加载逻辑可以概括为：

```text
按 chartAddressableKey 从资源系统取出 TextAsset -> 用 JsonUtility 反序列化成 Chart -> 写入 LevelInformation.judgeLineList -> 通过 SetInformation 扁平化为 chartNoteSortByTime -> 标记 chartLoaded 完成关卡启动
```