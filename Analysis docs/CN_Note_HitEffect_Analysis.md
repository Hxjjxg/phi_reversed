# Phigros 音符贴图与打击特效 (HitEffect) 分析与 Hook 报告

基于对 `dump_android.cs` (或 `dump.cs`) 的源码反汇编以及 IDA Pro (mcp) 分析，我们梳理了游戏中 Tap (Click)、Drag、Hold、Flick 四种 Note（音符）的外观逻辑，以及打击之后生成的打击特效和粒子的触发位置。

## 1. 核心参考函数列表及 RVA
在逆向分析中，以下几个核心生命周期及判定函数是控制音符生成、贴图分配和打击特效播放的关键：

| 类名 (Class) | 方法名 (Method) | RVA (相对虚拟地址) | 用途说明 |
|:---:|:---|:---|:---|
| **LevelControl** | `Awake()` | `0x239a63c` | 关卡总控初始化，保存了全局音符外观贴图与打击特效预制体的根类。 |
| **LevelControl** | `Start()` | `0x239a874` | 关卡启动协程（实际 MoveNext 逻辑位于 `0x239d300`）。 |
| **JudgeLineControl** | `Start()` | `0x2398c80` | 判定线初始化，缓存各个音符的贴图 (Sprite) 引用。 |
| **JudgeLineControl** | `CreateNote(...)` | `0x239739c` | 在对应判定线上实例化具体的单体音符。 |
| **ScoreControl** | `Perfect(...)` | `0x1e98d04` | 判定为 Perfect 时触发的方法，并在指定坐标播放打击特效。 |
| **ScoreControl** | `Good(...)` | `0x1e98b5c` | 判定为 Good 时触发的方法，播放对应颜色的特效。 |
| **ClickControl** | `Start()` / `Judge()` | `0x1f3a3b8` / `0x1f39e64` | Tap 音符初始化与本体碰撞判定。 |
| **DragControl** | `Start()` / `Judge()` | `0x1f4d084` / `0x1f4cd60` | Drag 音符初始化与本体碰撞判定。 |
| **FlickControl** | `Start()` / `Judge()` | `0x2137340` / `0x2136fdc` | Flick 音符初始化与本体碰撞判定。 |
| **HoldControl** | `Start()` / `Judge()` | `0x2147aa8` / `0x21474b8` | Hold 音符初始化与击打保持判定。 |

## 2. 核心字段列表及内存偏移 (Offset)
用于储存“贴图 (HL)”和“特效预制体 (GameObject)”的相关类和内存偏移量如下。利用这些偏移量，能够在运行时获取或者替换对应的指针位置。

### `LevelControl` 类
*(作为资源储存的最全载体，最适合进行全局替换)*
- `ClickHL` : `0x58` (Tap的基准/高光贴图引用)
- `HoldHL0` : `0x60` (Hold的顶端贴图引用)
- `DragHL` : `0x70` (Drag的贴图引用)
- `FlickHL` : `0x78` (Flick的贴图引用)
- `perfectJudge` : `0x80` (Perfect特效的GameObject/ParticleSystem预制体)
- `goodJudge` : `0x88` (Good特效预制体)

### `ScoreControl` 类
*(负责统计分数并实际触发特效的类)*
- `perfectJudge`: `0x18` 
- `goodJudge`: `0x20` 

### `JudgeLineControl` 类
*(单条判定线的管理实例，各音符生成时由其赋予贴图)*
- `ClickHL`: `0x38`
- `HoldHL0`: `0x40`
- `DragHL`: `0x50`
- `FlickHL`: `0x58`

### `UiChange` 类
*(UI控制类，部分渲染重定义也会使用)*
- `ClickHL`: `0x38`
- `HoldHL0`: `0x40`
- `DragHL`: `0x50`
- `FlickHL`: `0x58`
- `perfectJudge`: `0x60`
- `goodJudge`: `0x68`

---

## 3. 分析报告与 Hook 策略

### 3.1 音符逻辑控制与类型区分
在代码实现中，Phigros 并没有将所谓的「Note」合并为一个通用基类，而是分成 `ClickControl`（代表 Tap）、`DragControl`、`HoldControl` 和 `FlickControl` 分别处理，每个类包含着自身的 `Start()` 初始化与 `Judge()` 各种打击逻辑。
想要修改单条特定轨迹上的音符形态，可以切入各个 XXXControl 的 `Start`。

### 3.2 外观与贴图 (Sprite) 的覆盖
游戏所有音符和高光特效的基础贴图是通过注入诸如 `ClickHL` 和 `DragHL` 的全局引用分配下去的。
**推荐方案（替换贴图）：**
1. 获取对 `LevelControl.Awake` (`0x239a63c`) 的 Hook 控制。
2. 该函数执行完毕后，访问 `LevelControl` 实例的指定偏移处（如 `0x58` 到 `0x78`）。
3. 使用 Unity API 把这些储存了原本材质/Sprite对象的字段，更换为您自己加载的自定义纹理 (Texture2D / Sprite)。
4. 如果遇到某些延迟加载不生效的情况，可以使用 `JudgeLineControl.Start()` 进行替换覆盖。

### 3.3 打击特效与粒子系统 (HitEffect & Particle) 的拦截
在逆向IDA的 `ScoreControl.Perfect` (`0x1e98d04`) 的代码中，可以发现如下声明模式：
```c
__int64 __fastcall Perfect(__int64 ScoreControl_inst, char a2, long double a3, float a4, long double position_vector, long double a6, long double a7);
```
在这些判定被触发时，函数会接收来自发生打击事件处的空间世界坐标点，随后实例化或刷新位于 `ScoreControl` 偏移 `0x18` 或 `0x20` 处的 `perfectJudge` / `goodJudge` 特效对象。
打击后特效向随机发散的行为是粒子系统本身的参数（发射器 Shape / 初始速度等 Unity 粒子生命周期），直接修改代码意义较弱。

**推荐方案（修改打击后的特效和粒子）：**
1. **替换原生粒子系统：** 在游戏初始化时（或 `LevelControl.Awake`），直接取偏移 `0x80` (`perfectJudge`) 的 `GameObject`。提取其挂载的 `ParticleSystem` 组件，修改它的 `MainModule` 贴图、设置 `StartColor`、发射速度、发散角度，以此改变发散行为，但不需修改触发代码。
2. **完全的特效劫持：** 如果您希望用自己的一套定制特效彻底取代原生特效，应立刻 Hook `ScoreControl.Perfect` (`0x1e98d04`) 和 `ScoreControl.Good` (`0x1e98b5c`)。通过读取传入的环境参数与世界坐标 `Vector3`（对应那些长双精度浮点传参），然后禁用掉原函数的执行逻辑，在此位置生成您自己提前准备的、封装好了特定贴图与动画发散效果的自制 `GameObject`。

## 4. 总结
- **替换 Note 贴图：** Hook `0x239a63c` 或 `0x2398c80`，利用 Unity 反射更换 Field 内存偏移中对应的贴图。
- **替换判定系统粒子：** Hook `0x1e98d04` 与 `0x1e98b5c`，拦截特效事件自己处理，或直接干涉 `LevelControl` 偏移 `0x80`/`0x88` 保存的 GameObject 进行对象覆盖。