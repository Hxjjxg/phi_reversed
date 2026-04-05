# 旧版 Note / HitEffect 切换链路参考

## 核心结论

本次分析确认，游戏内“把 note 外观和打击特效整套切换成旧版资源”的核心入口是：

- `UiChange.OnEnable`
- RVA: `0x28B0AA4`

它不是普通判定函数，也不是单独的特效播放函数，而是一个整套资源覆盖器。

---

## 已确认信息

### 1. `UiChange` 本身就是一个“旧版视觉资源容器”

`UiChange` 的字段如下：

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

这套字段和 `LevelControl` 上 gameplay 用到的资源字段一致。

---

### 2. `UiChange.OnEnable` 会把整套资源覆写到目标组件

`UiChange.OnEnable` 的逻辑可以概括成：

1. `this.transform.parent`
2. 从 parent 上 `GetComponent(目标类型)`
3. 把 `UiChange` 自己持有的资源全部写进目标组件

按偏移和字段顺序整理如下：

| `UiChange` 字段 | `UiChange` 偏移 | 写入目标偏移 | 对应 `LevelControl` 字段 |
| --- | ---: | ---: | --- |
| `Click` | `0x18` | `0x38` | `Click` |
| `Drag` | `0x20` | `0x40` | `Drag` |
| `Hold` | `0x28` | `0x48` | `Hold` |
| `Flick` | `0x30` | `0x50` | `Flick` |
| `ClickHL` | `0x38` | `0x58` | `ClickHL` |
| `HoldHL0` | `0x40` | `0x60` | `HoldHL0` |
| `HoldHL1` | `0x48` | `0x68` | `HoldHL1` |
| `DragHL` | `0x50` | `0x70` | `DragHL` |
| `FlickHL` | `0x58` | `0x78` | `FlickHL` |
| `perfectJudge` | `0x60` | `0x80` | `perfectJudge` |
| `goodJudge` | `0x68` | `0x88` | `goodJudge` |

这张表就是本次分析最重要的静态结论。

---

### 3. `UiChange` 的目标组件高置信度是 `LevelControl`

这个结论不是通过字符串直接命名确认的，而是通过多个函数对同一个类型句柄的交叉使用确认的。

证据链如下：

#### 证据 A：字段布局完全匹配

`UiChange.OnEnable` 写入目标的偏移是：

- `0x38 .. 0x88`

而 `LevelControl` 在 `dump_byzygisk.cs` 里的对应字段正是：

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

#### 证据 B：同一个类型句柄在 `HPDisplayControl.Start` 里被当成 gameplay 根控制器使用

`HPDisplayControl.Start` 也通过同一个 helper 从 parent 上取这个组件，然后读：

- `+0x18`
- `+0x20`

这两个偏移和 `LevelControl.levelInformation`、`LevelControl.progressControl` 一致。

#### 证据 C：`HPProvider__Start_d__5.MoveNext` 也从同一个 parent 组件继续挂事件

这说明该组件不是普通 UI，而是 gameplay 的上层控制器。

结论：

- `UiChange.OnEnable` 覆盖目标可以高置信度视为 `LevelControl`

---

## 本次摸到的关键函数和作用

下面按用途分组整理。

### A. 常规 gameplay 资源链

#### `LevelControl.Awake`

- RVA: `0x239A63C`
- 作用：
  - 关卡根控制器初始化
  - 常规 note / HL / judge effect 资源的默认入口
- 用途：
  - 这是普通情况下替换资源的常见 hook 点
  - 但它不是特殊旧版视觉切换的最终入口

#### `LevelControl__Start_d__40.MoveNext`

- RVA: `0x239D300`
- 作用：
  - `LevelControl.Start()` 协程主体
  - 创建 / 初始化关卡中的运行对象
  - 把 `LevelControl` 上的资源继续分发下去
- 用途：
  - 如果要观察资源什么时候拷给 `JudgeLineControl`，这个点很有价值

#### `JudgeLineControl.CreateNote`

- RVA: `0x239739C`
- 作用：
  - 创建单个 note
  - 普通 note 走 prefab 默认字段
  - chord / HL note 会额外用 `JudgeLineControl.*HL`
- 用途：
  - 适合做“每个 note 实例级别”的跟踪
  - 但不适合作为整套旧版视觉切换点

#### `ScoreControl.Good`

- RVA: `0x1E98B5C`
- 作用：
  - `Good` 判定时实际触发 hit effect

#### `ScoreControl.Perfect`

- RVA: `0x1E98D04`
- 作用：
  - `Perfect` 判定时实际触发 hit effect

这两个函数说明：

- judge effect 的实际播放入口在 `ScoreControl`
- 但“播放什么 prefab”取决于上层资源字段，因此真正的视觉切换点仍然更靠前

---

### B. 真正的旧版视觉切换点

#### `UiChange.OnEnable`

- RVA: `0x28B0AA4`
- 作用：
  - 取 parent 上的 gameplay 根控制器
  - 把 `UiChange` 自身保存的整套 note / HL / judge effect 资源覆写进去
- 价值：
  - 本次分析的第一目标
  - 最优先的 hook 点

---

### C. 类型获取 / clone helper

#### `sub_1EBEEE4`

- 作用：
  - 带类型句柄的 `GetComponentFastPath` 风格 helper
- 用途：
  - 用来识别某个流程到底在取哪个上层组件
  - `UiChange.OnEnable`、`HPDisplayControl.Start`、`HPProvider__Start_d__5.MoveNext`、`IntroductionMod.OnEnable` 都依赖它

#### `sub_1EBF934`

- 作用：
  - clone 一个对象并返回
  - 失败时会抛出 null 相关错误
- 用途：
  - `IgalltaUnlock` / `FakeAboutUsControl` / `RrharilUnlockControl` 的特殊进场对象都走了类似 clone / 保活逻辑
  - 这是跟跨场景特效对象流转的好观察点

---

### D. 特殊流程 / 特殊开局控制器

#### `RrharilUnlockControl.Start`

- RVA: `0x1E8D63C`
- 作用：
  - 读取歌曲 / 难度相关信息
  - 配置开局展示内容

#### `RrharilUnlockControl.PlayUnlockVideo`

- RVA: `0x1E8DA80`
- 作用：
  - 到达时间条件后启动过场协程

#### `RrharilUnlockControl.GameStart`

- RVA: `0x1E8DBE8`
- 作用：
  - 创建进入 gameplay 的协程

#### `RrharilUnlockControl__GameStart_d__14.MoveNext`

- RVA: `0x1E8DCE0`
- 作用：
  - 在进 gameplay 前处理特殊对象
  - 激活、保活、切场景
  - 明显属于“把特殊演出对象一路带进 gameplay”这条链
- 价值：
  - 如果要确认 `Rrhar'il` 这段到底带了哪个 prefab 进场，这是最该继续深挖的函数

#### `IgalltaUnlock.StartLevel`

- RVA: `0x21481DC`
- 作用：
  - 创建进场协程

#### `IgalltaUnlock__StartLevel_d__16.MoveNext`

- RVA: `0x21489AC`
- 作用：
  - clone `cutIn`
  - `DontDestroyOnLoad`
  - 切到 gameplay scene
- 价值：
  - 证明“特殊 cutIn 对象跨场景进入 gameplay”是一条真实存在的机制

#### `IgalltaUnlock.UnlockAnimation`

- RVA: `0x21482E0`

#### `IgalltaUnlock__UnlockAnimation_d__18.MoveNext`

- RVA: `0x2148B34`
- 作用：
  - 负责解锁动画与进场过程的衔接

#### `FakeAboutUsControl.Start`

- RVA: `0x21340EC`
- 作用：
  - 读取歌曲和 UI 展示信息

#### `FakeAboutUsControl.StartLevel`

- RVA: `0x2133F60`
- 作用：
  - 创建进场协程

#### `FakeAboutUsControl__StartLevel_d__16.MoveNext`

- RVA: `0x21349F0`
- 作用：
  - clone `cutIn`
  - `DontDestroyOnLoad`
  - 切到 gameplay scene
- 价值：
  - 和 `IgalltaUnlock` 一样，说明特殊对象可以在场景切换后继续生效

#### `FakeAboutUsControl.PlayUnlock`

- RVA: `0x2134050`
- 作用：
  - 解锁流程协程入口

---

### E. 辅助验证函数

#### `HPDisplayControl.Start`

- RVA: `0x2145CFC`
- 作用：
  - 从 parent 上取 gameplay 根控制器
  - 读取 `levelInformation`、`progressControl`
- 价值：
  - 用来验证 `UiChange.OnEnable` 目标对象类型

#### `HPProvider__Start_d__5.MoveNext`

- RVA: `0x214680C`
- 作用：
  - 从 parent 上取 gameplay 根控制器
  - 再向更深层对象挂事件 / 读状态
- 价值：
  - 继续验证 `qword_46E4BA8` 对应的是 gameplay 根控制器，而不是普通 UI 组件

#### `IntroductionMod.OnEnable`

- RVA: `0x2149B9C`
- 作用：
  - 同样从 parent 上取同一个 gameplay 根控制器
- 价值：
  - 补强 `LevelControl` 判定证据链

---

## 适合后续 hook 的点

### 第一优先级

#### `UiChange.OnEnable` `0x28B0AA4`

适合做的事：

- 观察旧版资源何时覆写到 `LevelControl`
- 直接替换 `Click/Drag/Hold/Flick`
- 直接替换 `ClickHL/HoldHL0/HoldHL1/DragHL/FlickHL`
- 直接替换 `perfectJudge/goodJudge`

如果你的目标是“模拟游戏原生旧版视觉切换”，这个点优先级最高。

---

### 第二优先级

#### `LevelControl.Awake` `0x239A63C`

适合做的事：

- 改默认 note 资源
- 改默认 hit effect prefab

注意：

- 这个点会被后续 `UiChange.OnEnable` 覆盖
- 所以如果你只 hook 这里，特殊剧情关卡里的旧版资源可能会把你的改动冲掉

---

### 第三优先级

#### `LevelControl__Start_d__40.MoveNext` `0x239D300`

适合做的事：

- 观察 `LevelControl` 资源何时分发给下游
- 看 `JudgeLineControl` 初始化之后的资源状态

---

### 第四优先级

#### `JudgeLineControl.CreateNote` `0x239739C`

适合做的事：

- 验证某个 note 实例最终拿到的是哪套 sprite
- 做更细粒度的 per-note 替换 / 打印

---

### 第五优先级

#### `ScoreControl.Perfect` / `ScoreControl.Good`

- `0x1E98D04`
- `0x1E98B5C`

适合做的事：

- 观察打击特效最终实例化的位置和时机
- 如果想完全接管 hit effect，可以从这里截断

---

### 观察型辅助点

#### `sub_1EBF934`

适合做的事：

- 跟踪特殊对象 clone
- 看哪些 cutIn / background 对象被带进 gameplay scene

#### `RrharilUnlockControl__GameStart_d__14.MoveNext`

适合做的事：

- 确认 `Rrhar'il` 路线里真正跨场景保活的对象是谁

#### `FakeAboutUsControl__StartLevel_d__16.MoveNext`

适合做的事：

- 确认这条特殊菜单 / 特殊进场路线带入的 cutIn 对象

#### `IgalltaUnlock__StartLevel_d__16.MoveNext`

适合做的事：

- 确认另一条特殊进场路线带入的 cutIn 对象

---

## 已确认、强推断、仍模糊的边界

### 已确认

- `UiChange.OnEnable` 会整套覆盖 note prefab、HL sprite、judge effect prefab。
- 覆盖目标高置信度是 `LevelControl`。
- 特殊控制器存在“clone 特殊对象 -> DontDestroyOnLoad -> 切 gameplay scene”的模式。

### 强推断

- 特殊流程里带入 gameplay scene 的 `cutIn` / `background` 对象里，至少有一部分携带了 `UiChange` 组件。
- 这些对象就是旧版视觉包的实际载体。

### 仍模糊

- `FakeAboutUsControl`、`IgalltaUnlock`、`RrharilUnlockControl` 与具体歌曲流程的 100% 一一映射，本次没有全部静态确认。
- 哪个具体 prefab 上挂了 `UiChange`，本次没有进一步拆 asset 级别数据去做 100% 证实。

这两点都适合在后续用运行时 hook 继续补。

---

## 建议给后续 agent 的最短路径

如果后续 agent 只想最快继续推进，不想重复本次分析，建议按这个顺序：

1. 先 hook `UiChange.OnEnable`
2. 打印 `this` 的字段和 parent 上目标组件地址
3. 再 hook `sub_1EBF934`，记录被 clone 并跨场景保活的对象
4. 在 `RrharilUnlockControl__GameStart_d__14.MoveNext` / `FakeAboutUsControl__StartLevel_d__16.MoveNext` / `IgalltaUnlock__StartLevel_d__16.MoveNext` 上补日志
5. 必要时再回头看 `LevelControl.Awake` 和 `JudgeLineControl.CreateNote`

如果目标是直接改材质而不是继续分析，那么：

- 最值得补的 hook 点不是 `LevelControl.Awake`
- 而是 `UiChange.OnEnable`

