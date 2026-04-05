# 旧版 Note / HitEffect 切换函数定位过程

## 目标

目标不是重复确认常规 note 是怎么渲染的，而是找到游戏在特殊流程里把 note 外观和打击特效一起切换成旧版资源的原生入口。

用户给出的现象有两个关键点：

1. `Glaciaxion` 期间会切到较旧版本的 note / 特效。
2. `Rrhar'il` 期间会切到更老的一套 note / 特效。

这意味着：

- 目标函数大概率不是普通的 `CreateNote` 或 `ScoreControl.Perfect/Good`。
- 更像是一个“资源包切换器”，会一次性改掉 note prefab、HL sprite、judge effect prefab。

---

## 这次最重要的前置材料

本次最重要的前置材料不是某一个地址，而是下面几份文档共同提供的“常规链路基线”：

- `Analysis docs/Note_HitEffect_Analysis.md`
  - 先确认常规 note 资源和 hit effect 资源主要挂在 `LevelControl` 上。
  - 也确认了 `JudgeLineControl`、`ScoreControl` 的常规消费关系。
- `Analysis docs/Judge_Analysis.md`
  - 用来排除“判定函数本身就是旧版视觉切换点”的可能。
  - 证明 `Click/Drag/Hold/FlickControl.Judge` 更偏结果结算，不像整套资源切换入口。
- `scripts/note_texture_hook/note_texture_replace_bridge.ts`
  - 这是实际 hook 需求的上下文。
  - 它直接说明你现在主要改的是 `LevelControl` 上的 note sprite / prefab。
- `scripts/note_texture_hook/note_texture_replace_function_summary.md`
  - 这份总结非常重要。
  - 它把常规 note 渲染链拆成了两条：
    - 普通 note 走 prefab 默认字段
    - chord / HL note 走 `JudgeLineControl.*HL`
  - 这让我可以明确判断：如果游戏里有“旧版视觉整套替换”，它必须同时覆盖 prefab 和 HL，而不是只改某一个 sprite 字段。
- `Analysis docs/research(不可信，不确定其正确性)/unlock_challenge_visionreplay_deep_dive_2026-03-23.md`
  - 这份文档不是最终证据，但它给了一个非常有价值的方向：
    - `RrharilUnlockControl`
  - 它告诉我应该沿着“特殊解锁 / 特殊演出控制器”这条线去摸。
- `scripts/bundle_redirect/dump_byzygisk.cs`
  - 这是本次最关键的静态索引。
  - 虽然 IDA 当前数据库没有直接暴露所有 C# 名字，但 `dump_byzygisk.cs` 给了类名、字段布局、RVA。
  - 我最后是靠它把 `UiChange`、`RrharilUnlockControl`、`FakeAboutUsControl`、`IgalltaUnlock` 串起来的。

---

## 从头开始的思路

### 第一步：先用已有文档把“常规链路”立住

先看的不是特殊剧情，而是普通 gameplay 里 note / hit effect 平时怎么走：

- `LevelControl.Awake` `0x239A63C`
- `LevelControl.<Start>d__40.MoveNext` `0x239D300`
- `JudgeLineControl.CreateNote` `0x239739C`
- `ScoreControl.Good` `0x1E98B5C`
- `ScoreControl.Perfect` `0x1E98D04`

这一阶段的目的不是直接找答案，而是排除错误方向：

- `JudgeLineControl.CreateNote` 负责实例化 note，并在普通 / chord 分支里分配 sprite。
- `ScoreControl.Perfect/Good` 负责实际触发特效。
- 这些函数都很重要，但它们更像“消费已有资源”，不像“切换整套旧版资源包”。

结论：

- 普通资源来源在 `LevelControl`。
- 特殊旧版视觉更可能来自某个“把资源整体覆写到 LevelControl 上”的入口。

---

### 第二步：从“特殊流程控制器”入手，而不是继续深挖判定函数

用户给的现象是：

- 只在特殊歌曲流程里发生
- 会跨过 song select / cutscene / 进场演出
- 然后 gameplay 内的视觉整体变化

所以搜索方向改成：

- 特殊歌曲 / 特殊解锁控制器
- 旧版视觉包可能的容器组件
- 会在进入 gameplay 场景前后做资源覆盖的逻辑

我先从本地文档和 dump 里搜这些名字：

- `RrharilUnlockControl`
- `IgalltaUnlock`
- `FakeAboutUsControl`
- `UiChange`

这里最关键的发现是 `dump_byzygisk.cs` 里出现了一个很可疑的类：

- `UiChange`

它的字段不是普通 UI 文本或按钮，而是：

- `Click`
- `Drag`
- `Hold`
- `Flick`
- `ClickHL`
- `HoldHL0`
- `HoldHL1`
- `DragHL`
- `FlickHL`
- `perfectJudge`
- `goodJudge`

这组字段和 `LevelControl` 的资源字段几乎一模一样。

这一步是整个分析的转折点。

---

### 第三步：直接反编译 `UiChange.OnEnable`

`UiChange` 在 `dump_byzygisk.cs` 中只有一个核心方法：

- `UiChange.OnEnable` `0x28B0AA4`

对这个函数做 IDA 反编译以后，逻辑非常清晰：

1. `this.transform`
2. `get_parent()`
3. 对 parent 做一次带类型句柄的 `GetComponentFastPath`
4. 拿到目标组件后，把 `UiChange` 自身保存的整套资源字段写进目标组件

赋值顺序是：

- `Click`
- `Drag`
- `Hold`
- `Flick`
- `ClickHL`
- `HoldHL0`
- `HoldHL1`
- `DragHL`
- `FlickHL`
- `perfectJudge`
- `goodJudge`

这已经满足了“note 样子和 hit effect 一起变化”的全部条件。

到这里，其实核心目标已经命中。

---

### 第四步：确认 `UiChange` 写入的目标是不是 `LevelControl`

`UiChange.OnEnable` 里目标类型没有直接显示成字符串类名，所以还需要做证据链校验。

我没有直接停在“看起来像 LevelControl”，而是继续验证同一个类型句柄在别的函数里怎么用。

重点摸了这些函数：

- `HPDisplayControl.Start` `0x2145CFC`
- `HPProvider__Start_d__5.MoveNext` `0x214680C`
- `IntroductionMod.OnEnable` `0x2149B9C`
- `sub_1EBEEE4`

其中 `sub_1EBEEE4` 很明显是一个 `GetComponentFastPath` 风格的 helper：

- 输入：`GameObject/Transform + 类型句柄`
- 输出：指定类型的组件实例

然后再看同一个类型句柄在别处被取回后读了什么偏移：

- `HPDisplayControl.Start` 取回组件后，读了 `+0x18` 和 `+0x20` 两个字段
  - 这正好对应 `LevelControl.levelInformation` 和 `LevelControl.progressControl`
- `UiChange.OnEnable` 取回组件后，从 `+0x38` 到 `+0x88` 连续写入
  - 这正好对应 `LevelControl.Click` 到 `LevelControl.goodJudge`
- `HPProvider__Start_d__5.MoveNext` 取回组件后，又继续从该对象内部更深处挂事件 / 读状态
  - 这进一步说明这个句柄代表的是 gameplay 根控制器，而不是普通 UI

所以这一步的结论是：

- `UiChange.OnEnable` 的目标组件可以高置信度判定为 `LevelControl`

这不是 100% 由字符串直接命名确认的，而是由“字段布局 + 多处交叉读写偏移”共同确认的。

---

### 第五步：回头摸特殊流程控制器，看 `UiChange` 可能从哪里进场

确认 `UiChange.OnEnable` 是切换点之后，还需要回答另一个问题：

- 这东西是怎么在特殊歌曲流程里被带进 gameplay scene 的？

为此又摸了三条特殊控制器链：

#### 1. `RrharilUnlockControl`

看了这些函数：

- `RrharilUnlockControl.Start` `0x1E8D63C`
- `RrharilUnlockControl.PlayUnlockVideo` `0x1E8DA80`
- `RrharilUnlockControl.GameStart` `0x1E8DBE8`
- `RrharilUnlockControl__GameStart_d__14.MoveNext` `0x1E8DCE0`

得到的信息：

- 它确实是特殊歌曲开局控制器。
- `GameStart` 协程里会处理特殊对象的激活、保活、切场景。
- 这条链非常像“把带特效 / 带旧版资源的对象一路带进 gameplay scene”。

#### 2. `IgalltaUnlock`

看了这些函数：

- `IgalltaUnlock.StartLevel` `0x21481DC`
- `IgalltaUnlock__StartLevel_d__16.MoveNext` `0x21489AC`
- `IgalltaUnlock.UnlockAnimation` `0x21482E0`
- `IgalltaUnlock__UnlockAnimation_d__18.MoveNext` `0x2148B34`

得到的信息：

- `StartLevel` 协程会 clone 一个特殊 `cutIn` 对象，并 `DontDestroyOnLoad` 后切进 gameplay scene。
- 这说明“特殊开局对象跨场景进入 gameplay”是游戏里真实存在的一套通用模式。

#### 3. `FakeAboutUsControl`

看了这些函数：

- `FakeAboutUsControl.Start` `0x21340EC`
- `FakeAboutUsControl.StartLevel` `0x2133F60`
- `FakeAboutUsControl__StartLevel_d__16.MoveNext` `0x21349F0`
- `FakeAboutUsControl.PlayUnlock` `0x2134050`

得到的信息：

- 这条链和 `IgalltaUnlock` 很像，也会把特殊 `cutIn` clone 后保活带进 gameplay scene。
- 由于用户描述里提到了“glitched song select menu”一类流程，这条链非常值得后续继续盯。

---

### 第六步：把“确认”和“推断”分开

到这里能确认的部分：

- `UiChange.OnEnable` 是实际资源覆盖点。
- 它覆盖的不只是 note sprite，也包括 `perfectJudge/goodJudge`。
- 它覆盖的目标高置信度是 `LevelControl`。

还没有完全静态确认的一点：

- `RrharilUnlockControl`、`IgalltaUnlock`、`FakeAboutUsControl` 各自和哪一首特殊曲 100% 一一对应，本次没有全部映射完。
- 但它们都体现了同一模式：把特殊对象带进 gameplay scene。

---

## 这次实际摸过的函数

下面这些函数是本次真正打开、查看、或围绕它们建立推断的函数：

- `LevelControl.Awake` `0x239A63C`
- `LevelControl__Start_d__40.MoveNext` `0x239D300`
- `JudgeLineControl.CreateNote` `0x239739C`
- `ScoreControl.Good` `0x1E98B5C`
- `ScoreControl.Perfect` `0x1E98D04`
- `UiChange.OnEnable` `0x28B0AA4`
- `HPDisplayControl.Start` `0x2145CFC`
- `HPProvider__Start_d__5.MoveNext` `0x214680C`
- `IntroductionMod.OnEnable` `0x2149B9C`
- `sub_1EBEEE4`
- `sub_1EBF934`
- `RrharilUnlockControl.Start` `0x1E8D63C`
- `RrharilUnlockControl.PlayUnlockVideo` `0x1E8DA80`
- `RrharilUnlockControl.GameStart` `0x1E8DBE8`
- `RrharilUnlockControl__GameStart_d__14.MoveNext` `0x1E8DCE0`
- `IgalltaUnlock.StartLevel` `0x21481DC`
- `IgalltaUnlock__StartLevel_d__16.MoveNext` `0x21489AC`
- `IgalltaUnlock.UnlockAnimation` `0x21482E0`
- `IgalltaUnlock__UnlockAnimation_d__18.MoveNext` `0x2148B34`
- `FakeAboutUsControl.Start` `0x21340EC`
- `FakeAboutUsControl.StartLevel` `0x2133F60`
- `FakeAboutUsControl__StartLevel_d__16.MoveNext` `0x21349F0`
- `FakeAboutUsControl.PlayUnlock` `0x2134050`

---

## 最终结论

如果问题是：

- “哪个函数负责把 note 样子和 hit effect 一起切换成旧版？”

那么本次分析给出的主答案是：

- `UiChange.OnEnable` `0x28B0AA4`

如果问题是：

- “我应该从哪里继续追这套旧版视觉是怎么被带进关卡里的？”

那么优先级建议是：

1. `UiChange.OnEnable`
2. `RrharilUnlockControl__GameStart_d__14.MoveNext`
3. `FakeAboutUsControl__StartLevel_d__16.MoveNext`
4. `IgalltaUnlock__StartLevel_d__16.MoveNext`
5. `sub_1EBF934`（跨场景 clone 观察点）

