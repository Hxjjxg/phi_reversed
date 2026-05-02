# Multi Hold Tail 历史问题与方案回顾

## 1. 背景

本文件整理的是本轮围绕 `scripts/note_texture_hook/note_texture_replace_bridge_changed.ts` 的历史对话结论。

目标问题是：

- 普通 hold 和多押 hold 的尾巴需要分开处理
- 普通 hold 走 `hold_end.png`
- 多押 hold 目标是走 `hold_end_multi.png`

当前需要特别记住的一点：

- 游戏原生并不区分单押 hold 尾和多押 hold 尾
- 原生只在多押 hold 上写 `HoldHL0` / `HoldHL1`
- 多押 hold 的尾巴必须自己补

---

## 2. 历史问题 -> 方案 -> 结果

### 2.1 原脚本只替换 HL 贴图，普通 note 不变

问题：

- 最早的 note 贴图脚本只改了 `LevelControl` 上的 HL 字段
- 结果只有双押/多押的高亮 note 会变，普通 note 不会变

当时方案：

- 扩展脚本，不只改 `ClickHL / HoldHL0 / DragHL / FlickHL`
- 同时直接改普通 prefab 上挂着的组件字段
- 额外补上 `HoldHL1`
- 入口放在 `LevelControl.Awake`，并补 `UiChange.OnEnable`

结果：

- 普通 `Click / Drag / Flick / Hold` 和多押的头/身贴图都能覆盖到
- 这一步解决了“普通 note 不换图”的问题

---

### 2.2 Hold 三段贴图顺序不确定

问题：

- `HoldControl.noteImages` 到底是头/身/尾哪个顺序，最初并不完全确定
- 如果顺序写错，会出现头尾混用、身体不显示、尾巴错位

当时方案：

- 结合 IDA 和文档确认 `HoldControl.NoteMove`
- 确认顺序是：
  - `noteImages[0] = holdHead`
  - `noteImages[1] = holdBody`
  - `noteImages[2] = holdEnd`

结果：

- 当前脚本已经按这个顺序写
- 这一步本身没有争议，属于已确认事实

---

### 2.3 需要区分普通 hold 尾与多押 hold 尾

问题：

- 模式设计上需要：
  - `mode 1`: 不显示尾巴
  - `mode 2`: 普通/多押共用 `hold_end.png`
  - `mode 3`: 普通走 `hold_end.png`，多押走 `hold_end_multi.png`

当时方案：

- 在脚本中引入 `HOLD_TAIL_MODE`
- 普通 hold 的尾巴直接在 prefab 上替换
- 多押 hold 的尾巴在运行时补

结果：

- `mode 1` / `mode 2` 早期测试相对正常
- 真正卡住的是 `mode 3` 的多押尾

---

### 2.4 发现原生 `CreateNote` 对多押 hold 只写头/身，不写尾

问题：

- 为什么 `mode 3` 下多押 hold 不直接出现 `hold_end_multi.png`

当时分析结论：

- `JudgeLineControl.CreateNote` 是 note 实例创建和多押判定的核心位置
- 对 `Hold` 来说，原生多押分支只写：
  - `noteImages[0]`
  - `noteImages[1]`
- 原生没有独立的多押尾字段，也不会写 `noteImages[2]`

当时方案：

- 在 `HoldControl.NoteMove` 里额外 hook
- 等实例跑起来后，再把多押 hold 的尾巴补到：
  - `noteImages[2]`
  - `_holdEndSpriteRenderer1`

结果：

- 这解释清楚了“为什么必须自己补多押尾”
- 但并没有解决后续的稳定性问题

---

### 2.5 第一个运行时补尾方案：`processedHolds` + 一次性同步

问题：

- 既然多押尾要自己补，最早想到的是每个 `HoldControl` 实例第一次命中时补一次

当时方案：

- 在 `HoldControl.NoteMove` hook 里做一次性同步
- 用 `processedHolds` 防止重复处理
- 用头/身 sprite 是否等于 multi 资源来判断当前实例是不是多押

结果：

- 失败
- 静态分析认为这个方案和对象池复用冲突
- 一旦实例先被当成普通 hold 处理，后面复用成多押 hold 时就可能直接跳过

---

### 2.6 第二个运行时补尾方案：去掉一次性判定，按当前头/身状态持续同步

问题：

- 既然对象池会复用实例，按实例只处理一次不稳

当时方案：

- 去掉 `processedHolds` 的一次性阻断
- 改成在 `HoldControl.NoteMove` 中按当前 `noteImages[0] / [1]` 的状态持续决定尾巴
- 同步 normal / multi 两种尾巴

结果：

- 用户反馈“和之前效果一样”
- 仍然没有稳定看到 `hold_end_multi.png`
- 说明仅仅去掉一次性处理，不足以解决根因

---

### 2.7 第三个运行时补尾方案：按 `noteInfor.time` 和同刻 note 数量判断多押

问题：

- 用户补充了原生判定规则：
  - 一个 hold 是否算多押，不是看 hold 对 hold
  - 只要同一时刻存在其他任意 note（tap / drag / flick / hold），就算多押

当时方案：

- 不再靠 sprite 指针推断多押
- 改成读：
  - `HoldControl.noteInfor`
  - `HoldControl.judgeLine`
  - `JudgeLineControl.notesAbove / notesBelow`
- 通过同一时刻 note 数量判断该 hold 是否属于 chord

结果：

- 用户反馈：
  - “所有的 hold 都有了尾巴”
  - “仍然没看到 `hold_end_multi.png`”
  - 还出现了：
    - 白色尾巴
    - 多押不显示尾巴
    - 多押显示成 `hold_end.png`
    - 极其卡顿

结论：

- 多押判定规则更接近原生了
- 但运行时补尾这条链路仍然不稳定

---

### 2.8 第四个运行时补尾方案：给 chord 判定和 tail 状态加缓存，降低卡顿

问题：

- 上一版在 `HoldControl.NoteMove` 中做了太多逐帧工作
- 用户明确反馈“极其卡顿”

当时方案：

- 为每条 `judgeLine` 缓存 `time -> 同刻 note 数量`
- 为每个 hold 实例缓存“上次已经应用过的 tail 状态”
- 目标是减少每帧重复扫描和重复 set

结果：

- 没有形成稳定的正反馈
- 用户后续反馈仍然是：
  - 有时白尾
  - 有时多押没尾
  - 有时多押还是 `hold_end.png`
  - 仍然没看到 `hold_end_multi.png`

结论：

- 缓存降低了部分重复工作
- 但并没有从根上解决“时机太晚、状态互相打架”的问题

---

## 3. 当前已确认事实

### 3.1 已确认的静态事实

- `JudgeLineControl.CreateNote` 是 note 创建和多押判定核心位置
- `Hold` 的原生多押分支只写头/身，不写尾
- `HoldControl.NoteMove` 在首次渲染时会把：
  - `noteImages[0] -> 头 renderer`
  - `noteImages[1] -> 身 renderer`
  - `noteImages[2] -> 尾 renderer`
- 仓库文档和对话里都已经接受一个结论：
  - note object pool 存在

### 3.2 已确认的用户观测现象

- `mode 1` / `mode 2` 相对正常
- `mode 3` 问题集中在多押 hold 尾巴
- 现象并不稳定，可能出现：
  - 白色尾巴
  - 多押没有尾巴
  - 多押仍然显示 `hold_end.png`
  - 严重卡顿
- 到目前为止，用户明确说过：
  - 从来没有稳定看到 `hold_end_multi.png`

---

## 4. 当前仍然存在的问题

### 4.1 `hold_end_multi.png` 是否真的成功加载，仍未被证实

当前脚本里如果独立多押尾图加载失败，会直接回退到共享尾。

但是：

- 当前没有针对这个点的有效日志
- 所以无法单靠肉眼区分：
  - 是压根没加载成功
  - 还是加载成功了，但从没稳定写到屏幕

---

### 4.2 `HoldControl.NoteMove` 作为主补尾入口，时机太晚

当前几轮方案的共同问题是：

- 都试图在 `HoldControl.NoteMove` 里补尾

这带来几个天然风险：

- 每帧都会和原生运行时状态打架
- 容易受到对象池复用影响
- 容易出现“这一帧修好了，下一帧又被别的逻辑改回去”
- 性能成本高

---

### 4.3 当前没有窄而准的调试日志

到现在还缺少下面这些最关键的日志：

- `hold_end_multi.png` 是否加载成功
- 当前 hold 实例在创建时被原生判成普通还是多押
- 脚本最终给当前实例写入的是哪一张尾图
- `_holdEndSpriteRenderer1` 最终实际持有的是哪张 sprite

没有这些日志，很多现象只能靠肉眼推测。

---

### 4.4 当前“白尾”仍然没有被定性

现在只能确认：

- 它不是一个单一稳定症状
- 它会和同刻多 note、运行时补尾、卡顿一起出现

但还不能定性它到底更接近：

- 多押尾 sprite 本身加载异常
- renderer 状态被原生逻辑改白
- 缓存/时机导致尾图没稳定写进去

---

## 5. 当前最合理的下一步方向

### 5.1 不再把 `HoldControl.NoteMove` 当主链路

当前对话已经形成比较明确的判断：

- `CreateNote` 本来就是原生做“是否多押”判断的地方
- 如果能在 `JudgeLineControl.CreateNote` 的 hold 分支拿到刚创建好的 `HoldControl` 实例
- 那么更合理的方式是：
  - 等原生完成多押判定
  - 一次性把该实例的尾巴改掉
  - 不再依赖逐帧 `NoteMove` 补救

这条路线的优点：

- 用原生判定结果
- 不再自己猜多押
- 不再每帧修 tail
- 更不容易和对象池/运行时状态打架

---

### 5.2 下一步应优先验证的两个事实

如果后续继续推进，优先级建议是：

1. 先验证 `hold_end_multi.png` 是否真的成功创建成独立 sprite
2. 再验证 `JudgeLineControl.CreateNote` 的 hold 分支里，刚创建出的 `HoldControl` 实例到底在什么时刻可拿到

这两个点一旦明确，后面的实现方向会比继续修 `NoteMove` 更清晰。

---

## 6. 当前阶段结论

一句话总结当前阶段：

- 历史上已经把“普通 note 不换图”“Hold 三段顺序不清”“为什么多押尾需要自己补”这些问题分析清楚了
- 但围绕 `HoldControl.NoteMove` 的多次补尾尝试都没有拿到稳定结果
- 当前最值得转向的方向，不是继续在 `NoteMove` 上叠修补，而是回到 `JudgeLineControl.CreateNote`，利用原生多押判定结果做一次性实例补尾

