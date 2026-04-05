
## 主调用链（总览）

- **上层帧驱动（音符对象）**：`NoteUpdateManager$$Update (0x11BF308)`
  - 逐类循环调用：
    - `ClickControl$$Judge (0x117CECC)`
    - `DragControl$$Judge (0x118F8F8)`
    - `HoldControl$$Judge (0x11A4EF0)`
    - `FlickControl$$Judge (0x1195014)`
  - `Judge` 返回 `true` 时，当前 note 对象会被销毁并从对应 List 移除（`RemoveAt`）。

- **输入匹配层（手指->候选音符）**：`JudgeControl$$Update (0x11A7924)`
  - 每帧先 `GetFingerPosition`
  - 对每个手指：
    - `CheckNote (0x11A7EB0)`：普通触摸匹配
    - 若 `isNewFlick`：`CheckFlick (0x11A8AF8)`：Flick 匹配
  - 这一层主要是**给 note 打可判定标记**（如 `isJudged` / `isJudgedForFlick`）。

- **阈值来源层**：`ProgressControl$$Update (0x11CE234)` + `JudgeControl$$.cctor (0x11A9434)`
  - 普通模式：使用静态默认值（Perfect 0.08 / Good 0.18 / Bad 0.22）
  - 挑战模式：每帧重写 JudgeControl 时间窗（`_timeSum + 0.04/0.09/0.14`）

---

## “主要判定函数”到底是谁？

严格来说有两个“主”：

- **输入主判定（找谁被打中）**：`JudgeControl$$CheckNote / CheckFlick`
  - 负责在时间窗+空间容差中选候选 note，并设置 `isJudged` 标志。
- **结果主判定（给分档）**：各 `*Control$$Judge`
  - 读取 `isJudged`、`deltaTime`，最终调用 `ScoreControl` 的 `Perfect/Good/Bad/Miss`。

所以它是**两阶段判定架构**：  
`JudgeControl` 做“匹配”，`*Control.Judge` 做“结算”。

---

## 评分回调触发关系（你要的核心）

已通过 `xrefs_to` 确认：

- `ScoreControl$$Perfect (0x11E229C)` 被：
  - `ClickControl$$Judge`
  - `DragControl$$Judge`
  - `FlickControl$$Judge`
  - `HoldControl$$Judge`
- `ScoreControl$$Good (0x11E20F4)` 被：
  - `ClickControl$$Judge`
  - `HoldControl$$Judge`
- `ScoreControl$$Bad (0x11E2044)` 被：
  - `ClickControl$$Judge`（仅 Tap）
- `ScoreControl$$Miss (0x11E1FA8)` 被：
  - `Click/Drag/Flick/Hold` 全部调用

---

## 各音符 Judge 分支逻辑（结算层）

- **Tap (`ClickControl$$Judge`)**
  - 若已匹配（`isJudged`）：
    - `|delta| < perfect` -> `Perfect`
    - `perfect <= |delta| < good` -> `Good`
    - `|delta| >= good` -> `Bad`
  - 若未匹配且已过晚窗（`delta < -bad`）-> `Miss`

- **Drag (`DragControl$$Judge`)**
  - 先检查时间近窗与横向距离（`abs(fingerX - noteX) < 2.1`）置 `isJudged`
  - 到结算点：
    - `v5 < 0.005 && isJudged` -> `Perfect`
    - `v5 < -0.1 && !isJudged` -> `Miss`
  - 无 Good/Bad 分支

- **Flick (`FlickControl$$Judge`)**
  - 依赖 `isJudgedForFlick`（来自 `CheckFlick`）
  - 到结算点：
    - `v5 < 0.005 && isJudged` -> `Perfect`
    - 若过晚超过 `-perfect*1.75` -> `Miss`
  - 无 Good/Bad 分支

- **Hold (`HoldControl$$Judge`)**
  - 起始按下阶段：可得到 Perfect/Good 起判（并记录 `isPerfect`）
  - 持续按住阶段：有 `_safeFrame = 2` 的断连容错；超出后 `Miss`
  - 结束结算阶段：按起判结果给 `Perfect` 或 `Good`（`isHold` 标记为 1）
  - 额外超时未起判会 `Miss`

---

## ScoreControl 四个函数的状态影响（反编译确认）

- `Perfect`：`combo++`, `perfect++`
- `Good`：`isAllPerfect=0`, `combo++`, `good++`, 并计 `early/late`
- `Bad`：`isAllPerfect=0`, `isFullCombo=0`, `combo=0`, `bad++`
- `Miss`：`isAllPerfect=0`, `isFullCombo=0`, `combo=0`, `miss++`

---

## 你可以直接用的“调用关系图”（简版）

`ProgressControl.Update`  
-> 更新 Judge 时间窗（普通/挑战）

`JudgeControl.Update`  
-> `CheckNote` / `CheckFlick`（设置 note 的可判定标记）

`NoteUpdateManager.Update`  
-> `Click/Drag/Hold/FlickControl.Judge`  
-> `ScoreControl.Perfect/Good/Bad/Miss`
---
---

# Hold 音符判定逻辑 — 深度逆向分析

## 一、核心调用链总览

```
每帧执行顺序：

1. FingerManagement$$Update
   └─ 收集/更新所有活跃触摸 → Fingers[] (包含 phase, nowPosition, isNewFlick 等)

2. JudgeControl$$Update (0x11A7824)
   ├─ JudgeControl$$GetFingerPosition (0x11A7DB0)
   │   └─ 对每条 judgeLine × 每个 finger：
   │       屏幕坐标 → 判定线局部坐标 (fingerPositionX[], fingerPositionY[])
   ├─ 遍历所有 finger:
   │   ├─ if finger.phase == 0 (Began/新触摸):
   │   │   └─ JudgeControl$$CheckNote (0x11A7EB0)
   │   │       └─ 在时间窗+空间容差内找最优候选 note → 设 note.isJudged = 1
   │   └─ if finger.isNewFlick:
   │       └─ JudgeControl$$CheckFlick (0x11A8AF8)

3. NoteUpdateManager$$Update (0x11BF308)
   └─ 遍历 holdControls[]:
       ├─ HoldControl$$NoteMove (移动/渲染)
       ├─ HoldControl$$Judge (0x11A4EF0)  ← 核心判定
       │   ├─ Phase 1: 头部起判（读取 isJudged，给 Perfect/Good）
       │   ├─ Phase 2: 持续按住检测（遍历所有手指，检查空间距离）
       │   ├─ Phase 3: 结束结算（按起判结果给最终分数）
       │   └─ Phase 4: 超时兜底 Miss
       └─ if Judge() == true → Destroy + RemoveAt
```

---

## 二、关键数据结构

### Fingers（触摸手指对象）
```
Fingers_Fields {
    int32_t  fingerId;
    Vector2  lastMove;
    Vector2  nowMove;
    Vector2* lastPositions;
    Vector2  lastPosition;
    Vector2  nowPosition;      // ← 屏幕触摸坐标（经 Camera 转换后）
    bool     isNewFlick;
    bool     stopped;
    int32_t  phase;            // 0=Began, 1=Moved, 2=Stationary, 3=Ended, 4=Canceled
}
```

### HoldControl（Hold 音符控制对象）
```
HoldControl_Fields {
    ScoreControl*      scoreControl;
    ProgressControl*   progressControl;
    LevelInformation*  levelInformation;
    ChartNote*         noteInfor;       // 音符基本信息（realTime, holdTime, positionX 等）
    JudgeLineControl*  judgeLine;
    bool               isVisible;
    ...
    float              scale;
    GameObject*        holdHead;
    GameObject*        holdEnd;
    GameObject*        perfect;         // Perfect 特效预制体
    GameObject*        good;            // Good 特效预制体
    float              timeOfJudge;     // 累积帧时间
    bool               isJudged;        // 头部是否被匹配（来自 CheckNote 或自身缓存）
    bool               missed;          // 当前帧是否判定为未按住
    bool               judged;          // 头部是否已完成起判（Perfect/Good）
    bool               judgeOver;       // 整个 Hold 判定是否结束
    bool               isPerfect;       // 头部起判为 Perfect（影响最终评分）
    ...
    int32_t            _safeFrame;      // 断连容错帧计数器（初始值 0）
    float              _judgeTime;      // 头部判定时的 deltaTime
}
```

### ChartNote（音符谱面数据）
```
ChartNote_Fields {
    int32_t  type;             // 1=Click, 2=Drag, 3=Hold, 4=Flick
    int32_t  time;
    float    positionX;        // 音符在判定线上的局部 X 坐标
    float    holdTime;         // Hold 持续时间（秒）
    float    speed;
    float    floorPosition;
    bool     isJudged;         // ← CheckNote 设置的匹配标记
    bool     isJudgedForFlick;
    float    realTime;         // 音符的实际判定时间（秒）
    int32_t  judgeLineIndex;   // 所属判定线
    int32_t  noteIndex;        // 在 notesAbove/notesBelow 中的索引
    float    noteCode;         // 传递给 ScoreControl 的标识码
}
```

### JudgeControl 静态阈值（cctor: 0x11A9434）
```
JudgeControl_StaticFields {
    bool   inChallengeMode;
    float  perfectTimeRange = 0.08;   // ±80ms
    float  goodTimeRange    = 0.18;   // ±180ms
    float  badTimeRange     = 0.22;   // ±220ms（仅 Click 用到 Bad）
}
```

---

## 三、触摸输入 → 音符匹配（JudgeControl 层）

### 3.1 GetFingerPosition — 坐标变换

`JudgeControl$$GetFingerPosition` 每帧执行一次，将所有手指的屏幕坐标变换到每条判定线的**局部坐标系**：

```
对每条 judgeLine[j]，对每个 finger[i]:
    linePos = judgeLine[j].transform.position  (世界坐标)
    fingerPos = finger[i].nowPosition          (屏幕/世界坐标)
    theta = judgeLineControl[j].theta          (判定线旋转角度)

    // 变换到判定线局部 X 轴（沿线方向）：
    fingerPositionX[i] = (lineY - fingerY) * sin(-θ/180*π)
                       - (lineX - fingerX) * cos(-θ/180*π)

    // 变换到判定线局部 Y 轴（垂直线方向）：
    fingerPositionY[i] = (lineX - fingerX) * sin(θ/180*π)
                       - cos(-θ/180*π) * (lineY - fingerY)
```

结果存入 `JudgeLineControl.fingerPositionX[]` 和 `fingerPositionY[]`，供后续判定使用。

### 3.2 CheckNote — 输入匹配算法

`JudgeControl$$CheckNote(fingerIndex)` 仅在 `finger.phase == 0`（**新触摸**）时调用：

**1) 确定扫描窗口：**
```
endIndex: 从前往后找，直到 note.realTime >= nowTime + badTimeRange (0.22)
startIndex: 从 endIndex 往回找，直到 note.realTime <= nowTime - goodTimeRange (0.18)

扫描范围: [nowTime - 0.18, nowTime + 0.22]
//注意：早窗(+0.22)比晚窗(0.18)大，因为提前打有更大时间余量
```

**2) 逐音符评估：**
```
对扫描窗口内的每个未判定音符:
    touchPos = abs(fingerPositionX[fingerIndex] - note.positionX)

    if note 已被判定(isJudged): 跳过
    if deltaTime 不是比当前最优更接近(含 0.01 容差): 跳过

    空间距离判定 + 时间窗动态调整:
    if touchPos <= 0.9:
        _badTime = badTimeRange            // 完整时间窗 (0.22)
    elif touchPos < 1.9:
        // 距离越远，时间窗越窄（线性缩减）
        _badTime = badTimeRange + (touchPos - 0.9) * perfectTimeRange * (-0.5)
        // 即 0.22 - (touchPos-0.9)*0.04，在 touchPos=1.9 时 _badTime = 0.18
    else:
        不匹配（距离太远）

    if (note.realTime - nowTime) <= _badTime:
        记录为候选(_code = index)，更新 _minDeltaTime

    // 类型优先级：Hold(type=3)/Click(type=1) > Drag(type=2)/Flick(type=4)
    // 同时间(±0.01)的 Hold/Click 会比 Drag/Flick 优先被选中
    // 同时间的同类型音符按空间距离(含 Y 轴)择优
```

**3) 设置标记：**
```
找到最优候选后：
    // 根据音符所在 notesAbove/notesBelow 列表
    note.isJudged = 1
```

**关键点：CheckNote 仅在新触摸(phase=0)时执行一次**。Hold 头部的匹配只能由新触摸触发。

---

## 四、HoldControl$$Judge — Hold 判定核心（0x11A4EF0）

每帧由 `NoteUpdateManager$$Update` 调用。是整个 Hold 判定的核心状态机，分 4 个阶段：

### 4.0 前置守卫
```c
if (this.judged || this.missed)
    goto Phase2_HoldCheck;  // 已起判或已 Miss，跳到持续检测
```

### 4.1 Phase 1 — 头部起判

计算时间差：
```c
_judgeTime = noteInfor.realTime - progressControl.nowTime
// > 0 表示音符还没到（早打）
// < 0 表示音符已过（晚打）

isJudged = noteInfor.isJudged || this.isJudged  // 合并 CheckNote 的标记
this.isJudged = isJudged
```

**分支 A：未被匹配（isJudged == false）**
```c
if (_judgeTime >= -goodTimeRange)    // 还没过晚窗 (-0.18)
    goto Phase2;                     // 继续等待

// 超过晚窗 → Miss
this.missed = 1
ScoreControl.Miss(noteCode)
```
注意：Hold 头部的 Miss 阈值是 `goodTimeRange(0.18)`，**而非** Click 的 `badTimeRange(0.22)`。

**分支 B：已被匹配（isJudged == true）**
```c
v7 = abs(_judgeTime)

if (v7 < perfectTimeRange) {         // < 0.08 秒
    this.judged = 1
    this.isPerfect = 1
    PlayHitFx(7)                     // 播放音效
    Instantiate(this.perfect)        // 实例化 Perfect 特效
    this._judgeTime = _judgeTime
    goto Phase2
}

if (v7 < goodTimeRange) {            // < 0.18 秒
    this.judged = 1
    this.isPerfect = 0
    PlayHitFx(7)
    Instantiate(this.good)           // 实例化 Good 特效
    this._judgeTime = _judgeTime
    goto Phase2
}

// v7 >= goodTimeRange (0.18) ——触摸匹配了但时间太远
// 撤销匹配标记，让音符可以被重新匹配
note.isJudged = 0
goto Phase2
```

**表格总结：Hold 头部判定**
| 条件 | 结果 | isPerfect |
|------|------|-----------|
| isJudged && \|Δt\| < 0.08 | ✅ judged, Perfect 特效 | 1 |
| isJudged && 0.08 ≤ \|Δt\| < 0.18 | ✅ judged, Good 特效 | 0 |
| isJudged && \|Δt\| ≥ 0.18 | ❌ 撤销匹配(reset isJudged=0) | — |
| !isJudged && Δt < -0.18 | ❌ Miss | — |
| !isJudged && Δt ≥ -0.18 | ⏳ 等待 | — |

---

### 4.2 Phase 2 — 持续按住检测（_safeFrame 容错机制）

**进入条件：** `judged == true && missed == false && judgeOver == false`
（头部已成功起判，尚未判失，尚未完成结算）

每帧执行：
```c
this.missed = 1                      // 默认假设本帧没按住

// 获取该判定线上所有手指的局部 X 坐标
FingerPositionX = judgeLine.fingerPositionX
numOfFingers = judgeLine.numOfFingers    // 当前活跃手指数

if (numOfFingers < 1)
    goto SafeFrameCheck               // 无手指 → 直接检查容错

for (i = 0; i < numOfFingers; i++) {
    fingerX = FingerPositionX[i]       // 第 i 个手指在判定线上的局部 X
    noteX = noteInfor.positionX        // 音符在判定线上的局部 X

    if (abs(fingerX - noteX) < 1.9) {  // ← 空间容差：1.9 单位
        this.missed = 0               // 有手指在范围内！
        this._safeFrame = 2           // 重置容错计数器
    }
}

if (this.missed) {                    // 本帧没有任何手指在范围内
SafeFrameCheck:
    safeFrame = this._safeFrame
    if (safeFrame < 0) {
        // 容错帧耗尽 → 硬性 Miss
        this.judgeOver = 1
        ScoreControl.Miss(noteCode)
    } else {
        this._safeFrame = safeFrame - 1  // 消耗一帧容错
        this.missed = 0                  // 本帧暂时原谅
    }
}
```

**SafeFrame 容错时序图（手指离开后）：**
```
帧 N:   手指在范围内 → _safeFrame = 2, missed = 0 ✓
帧 N+1: 手指离开     → _safeFrame 2→1, missed = 0 (容错)
帧 N+2: 仍无手指     → _safeFrame 1→0, missed = 0 (容错)
帧 N+3: 仍无手指     → _safeFrame 0→-1, missed = 0 (容错)
帧 N+4: 仍无手指     → _safeFrame = -1 < 0 → judgeOver=1, Miss! ✗
```

**实际容错 = 3 帧**（`_safeFrame` 从 2 递减到 -1 之前有 3 次原谅机会）。
代码中 `_safeFrame = 2` 但由于判断条件是 `< 0` 而非 `<= 0`，实际允许 3 帧断连。

**重要细节：**
- 检测的是**所有活跃手指**，不限于最初按下的那个手指
- 空间容差 `1.9` 比 CheckNote 首次匹配的 `0.9`/`1.9` 范围更宽松（CheckNote 在 0.9~1.9 之间会缩减时间窗）
- `_safeFrame` 的默认初始值为 `0`（C# int32 默认值），意味着头部刚起判后如果第一帧就没有手指在范围内，容错为 0→-1→-2... 但由于首帧 `judged` 刚被设为 true 且代码会立即进入 Phase 2 检测，正常情况下首帧手指还在按住状态，会立即将 `_safeFrame` 置为 2

---

### 4.3 Phase 3 — 结束结算

**进入条件：**
```c
progressControl.nowTime > (noteInfor.realTime + noteInfor.holdTime - 0.22)
&& this.judged == true
&& this.judgeOver == false
```

即：当前时间已经到达 Hold 尾部前 0.22 秒（提前触发结算），且头部成功起判，且尚未结束。

```c
isPerfect = this.isPerfect
noteCode = noteInfor.noteCode
judgeTime = this._judgeTime          // 头部起判时记录的时间差

if (isPerfect) {
    ScoreControl.Perfect(noteCode, -judgeTime, position, isHold=1)
} else {
    ScoreControl.Good(noteCode, -judgeTime, position, isHold=1)
}
this.judgeOver = 1
```

**关键点：**
- Hold 的最终分数完全由**头部起判**决定（isPerfect）
- 持续按住阶段只影响是否 Miss，不影响 Perfect/Good 分级
- 结算时间是 `realTime + holdTime - 0.22`，即 **Hold 结束前 0.22 秒就给分**
- 传给 ScoreControl 的 `isHold=1` 参数标识这是 Hold 音符

---

### 4.4 Phase 4 — 超时兜底

**进入条件：**
```c
float deadline = noteInfor.realTime + noteInfor.holdTime + 0.25

if (nowTime > deadline && !judged && !missed && !judgeOver)
    ScoreControl.Miss(noteCode)
```

这是安全网：如果一个 Hold 音符完全没有被处理（既没起判也没 Miss），在尾部过后 0.25 秒强制 Miss。

### 4.5 返回值

```c
return nowTime > (realTime + holdTime + 0.25)
```

当当前时间超过 Hold 结束后 0.25 秒，返回 `true`，`NoteUpdateManager` 据此销毁该 Hold 对象并从列表移除。

---

## 五、完整状态转移图

```
                    ┌─────────────────────────────┐
                    │         初始状态              │
                    │ judged=0, missed=0           │
                    │ judgeOver=0, _safeFrame=0    │
                    └─────────┬───────────────────┘
                              │
                    ┌─────────▼───────────────────┐
                    │     Phase 1: 等待头部起判     │
                    │  CheckNote 设 isJudged=1     │
                    └────┬──────────────┬─────────┘
                         │              │
              isJudged=1 │              │ 超过晚窗(-0.18)
              |Δt|<0.18  │              │ 且 isJudged=0
                         │              │
                ┌────────▼──┐    ┌──────▼────────┐
                │ 起判成功   │    │  头部 Miss     │
                │ judged=1  │    │  missed=1     │
                │ isPerfect │    │  ScoreControl │
                │  = 0 or 1 │    │  .Miss()      │
                └────┬──────┘    └───────────────┘
                     │
           ┌─────────▼───────────────────────────┐
           │    Phase 2: 持续按住检测（每帧）       │
           │  遍历所有手指, |fingerX-noteX| < 1.9  │
           └────┬───────────────────┬────────────┘
                │                   │
          有手指在范围内        无手指在范围内
          _safeFrame=2         _safeFrame--
                │                   │
                │            ┌──────▼──────────┐
                │            │ _safeFrame < 0?  │
                │            └──┬──────────┬───┘
                │           No  │      Yes │
                │         (容错)│          │
                │               │    ┌─────▼──────┐
                │               │    │ Hold Miss   │
                │               │    │ judgeOver=1 │
                │               │    │ .Miss()     │
                │               │    └─────────────┘
                │               │
           ┌────▼───────────────▼────────────────┐
           │  Phase 3: 结束结算                    │
           │  nowTime > realTime+holdTime-0.22    │
           │  && judged && !judgeOver             │
           ├──────────────────────────────────────┤
           │  isPerfect=1 → ScoreControl.Perfect  │
           │  isPerfect=0 → ScoreControl.Good     │
           │  judgeOver = 1                       │
           └────┬─────────────────────────────────┘
                │
           ┌────▼──────────────────────────┐
           │  返回 nowTime > realTime       │
           │        + holdTime + 0.25       │
           │  true → 销毁 Hold 对象         │
           └────────────────────────────────┘
```

---

## 六、关键数值参数速查

| 参数 | 值 | 用途 |
|------|-----|------|
| `perfectTimeRange` | 0.08s (±80ms) | Hold 头 Perfect、CheckNote 空间缩减系数 |
| `goodTimeRange` | 0.18s (±180ms) | Hold 头 Good 上界 / Hold 头 Miss 晚窗 |
| `badTimeRange` | 0.22s (±220ms) | CheckNote 扫描的最大早窗 |
| Hold 头起判窗口 | ±0.18s | Perfect/Good（无 Bad 分级） |
| Hold 持续检测空间容差 | 1.9 单位 | 判定线局部 X 轴距离 |
| `_safeFrame` 重置值 | 2 | 容错帧计数器 |
| 实际容错帧数 | **3 帧** | 2→1→0→-1 才触发 Miss |
| Hold 提前结算时间 | realTime+holdTime-0.22 | 结束前 0.22s 即给分 |
| Hold 销毁时间 | realTime+holdTime+0.25 | 结束后 0.25s 销毁对象 |
| Phase 4 超时 Miss | realTime+holdTime+0.25 | 兜底 Miss 触发时间 |