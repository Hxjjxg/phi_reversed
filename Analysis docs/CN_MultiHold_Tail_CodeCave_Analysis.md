# Multi-Press Hold 尾部 (noteImages[2]) Code Cave 修复方案

## 问题描述

`HOLD_TAIL_MODE = 3` (SEPARATE) 模式下：
- 普通 Hold 的尾部 (hold_end.png) 正常显示
- 多押 Hold 的尾部 (hold_end_multi.png) 不显示，空白

---

## IDA 逆向分析结果

### 关键数据结构

#### Il2Cpp 数组内存布局 (Sprite[])

```
偏移    内容
+0x00   Il2Cpp Object Header (klass pointer)
+0x08   monitor
+0x10   bounds (null for 1D arrays)
+0x18   length (uint32)
+0x20   elem[0]  ← noteImages[0] = holdHead
+0x28   elem[1]  ← noteImages[1] = holdBody
+0x30   elem[2]  ← noteImages[2] = holdEnd
```

#### HoldControl 字段偏移 (dump_android.cs 行 301026)

```csharp
public class HoldControl : MonoBehaviour
{
    public ScoreControl scoreControl;               // 0x18
    public ProgressControl progressControl;          // 0x20
    public LevelInformation levelInformation;        // 0x28
    public ChartNote noteInfor;                      // 0x30
    public JudgeLineControl judgeLine;               // 0x38
    public Boolean isVisible;                        // 0x40
    public Sprite[] noteImages;                      // 0x48  ← 关键数组
    public Single[] FingerPositionX;                 // 0x50
    public Single scale;                             // 0x58
    public GameObject holdHead;                      // 0x60
    public GameObject holdEnd;                       // 0x68
    public GameObject perfect;                       // 0x70
    public GameObject good;                          // 0x78
    // ...
    private SpriteRenderer _holdHeadSpriteRenderer;  // 0x90
    private SpriteRenderer _holdSpriteRenderer;      // 0x98
    private SpriteRenderer _holdEndSpriteRenderer1;  // 0xa0
}
```

#### JudgeLineControl 字段偏移 (dump_android.cs 行 300577)

```csharp
public class JudgeLineControl : MonoBehaviour
{
    public GameObject Click;      // 0x18
    public GameObject Drag;       // 0x20
    public GameObject Hold;       // 0x28
    public GameObject Flick;      // 0x30
    public Sprite ClickHL;        // 0x38
    public Sprite HoldHL0;        // 0x40  ← 多押 Hold 头
    public Sprite HoldHL1;        // 0x48  ← 多押 Hold 身
    public Sprite DragHL;         // 0x50
    public Sprite FlickHL;        // 0x58
    // ...
    private Boolean chordSupport; // 0x10c  ← 是否开启多押检测
}
```

---

### JudgeLineControl.CreateNote 反编译分析

- **函数 RVA**: `0x239739C`
- **函数参数**: `(JudgeLineControl this, int thisIndex, bool ifAbove)`
- **完整反编译已保存**: `.ida-mcp/CreateNote_decompile.json`

#### 整体结构

CreateNote 内部有两个大的 switch-case 结构，分别处理 `ifAbove == true`（above 路径）和 `ifAbove == false`（below 路径）。每个 switch 都按 note 类型分支：

```
case 1: Click
case 2: Drag
case 3: Hold    ← 我们关注的
case 4: Flick
```

#### Hold (case 3) 的关键逻辑

两条路径（above/below）的 Hold 处理逻辑完全对称，核心流程：

1. **实例化 Hold prefab**
   - `sub_1EBFAE4(Hold_prefab, transform, 1, ...)`（Object.Instantiate）
   
2. **获取 HoldControl 组件**
   - `sub_1EBF404(instance, HoldControl_type)`（GetComponent）

3. **设置基础字段**
   - `HoldControl.progressControl = JudgeLineControl.progressControl` (offset 0x60→0x20)
   - `HoldControl.scoreControl = JudgeLineControl.scoreControl` (offset 0x68→0x18)
   - `HoldControl.levelInformation = JudgeLineControl.levelInformation` (offset 0x70→0x28)
   - `HoldControl.noteInfor = notesAbove[i]` (从 List 取)
   - `HoldControl.judgeLine = this` (JudgeLineControl 实例)

4. **多押检测** (offset 0x10c: `chordSupport`)
   - 检查 `JudgeLineControl.chordSupport` (偏移 268 = 0x10c)
   - 如果 `chordSupport == false` → 跳过多押逻辑，直接到 LABEL_130/LABEL_188
   - 如果 `chordSupport == true` → 进入多押判断

5. **chord 判定算法**
   - 调用 `sub_3090C54` 做二分查找，在 `notesAbove` 列表中找当前 note 的索引
   - 检查前一个 note（index - 1）的 `floorPosition`（偏移 +44）是否与当前 note 相同（差值 < 0.001）
   - 如果前一个不匹配，检查后一个 note（index + 1）
   - 任一匹配 → 判定为 chord/多押 → 进入 HL 资源覆盖

6. **HL 资源覆盖 — 问题的根源**

   上面路径的反编译（行 1122-1156）：
   ```c
   // LABEL_121:
   v85 = *(_QWORD *)(klass_14 + 72);    // klass_14 = HoldControl, +0x48 = noteImages
   // ...
   *(_QWORD *)(v85 + 32) = v86;          // noteImages + 0x20 = elem[0] = HoldHL0
   // ...
   *(_QWORD *)(v87 + 40) = v88;          // noteImages + 0x28 = elem[1] = HoldHL1
   // 注意: 没有写 noteImages + 0x30 (elem[2])
   ```

   对应汇编（above 路径）：
   ```asm
   0x2397b84  STR  X20, [X22, #0x20]   ; noteImages[0] = HoldHL0  (从 JLC + 0x40 加载)
   0x2397bb8  STR  X20, [X22, #0x28]   ; noteImages[1] = HoldHL1  (从 JLC + 0x48 加载)
   ;; 没有对 [X22, #0x30] 的写入操作
   0x2397bbc  LDR  X8, [X19, #0x120]   ; → LABEL_130，继续后续流程
   ```

   下面路径（below）同理：
   ```asm
   0x2397f30  STR  X20, [X23, #0x20]   ; noteImages[0] = HoldHL0
   0x2397f64  STR  X20, [X23, #0x28]   ; noteImages[1] = HoldHL1
   ;; 没有对 [X23, #0x30] 的写入操作
   0x2397f68  LDR  X8, [X19, #0x120]   ; → LABEL_188，继续后续流程
   ```

---

### HoldControl.NoteMove 反编译分析

- **函数 RVA**: `0x2146B64`
- **作用**: 每帧移动 Hold note，首次调用时初始化 SpriteRenderer

首次运行时的 sprite 初始化逻辑：

```c
// 1. holdHead → _holdHeadSpriteRenderer
gameObject = sub_1EBF304(gameObject, SpriteRenderer_type);  // GetComponent<SpriteRenderer>
*(_QWORD *)(updated + 152) = gameObject;                      // _holdHeadSpriteRenderer (offset 0x98 不对, 实际按分析是 +0x98)
UnityEngine_set_sprite(gameObject, noteImages[1], 0);          // 注意: noteImages + 0x28 = elem[1] = body

// 2. holdBody → _holdSpriteRenderer
gameObject = sub_1EBF304(gameObject, SpriteRenderer_type);
*(_QWORD *)(updated + 144) = gameObject;                      // _holdSpriteRenderer
UnityEngine_set_sprite(gameObject, noteImages[0], 0);          // noteImages + 0x20 = elem[0] = head

// 3. holdEnd → _holdEndSpriteRenderer1
gameObject = sub_1EBF304(gameObject, SpriteRenderer_type);
*(_QWORD *)(updated + 160) = gameObject;                      // _holdEndSpriteRenderer1
// 关键: 检查 noteImages.length > 2 后才写
if ( *(_DWORD *)(v6 + 24) <= 2u )                             // array.length <= 2 → 抛异常
    goto LABEL_120;
UnityEngine_set_sprite(gameObject, noteImages[2], 0);          // noteImages + 0x30 = elem[2] = end
```

**关键发现**: NoteMove 在首次调用时读取 `noteImages[2]` 并写入 `_holdEndSpriteRenderer1`。如果此时 `noteImages[2]` 仍然是 prefab 原始值（普通版 holdEnd），多押 Hold 的尾部就会显示普通版贴图或者空白。

---

## 根因总结

```
CreateNote 多押 Hold 路径:
  noteImages[0] = HoldHL0 (head) ← 写了
  noteImages[1] = HoldHL1 (body) ← 写了
  noteImages[2] = ???             ← 从未写入! 保持 prefab 原始值

NoteMove 首次调用:
  _holdEndSpriteRenderer1.sprite = noteImages[2]  ← 读到的是 prefab 原始值, 不是 multi 版

结果: 多押 Hold 尾部显示异常
```

游戏原生只有 `HoldHL0`（头）和 `HoldHL1`（身）两个多押字段，**没有 HoldHL2 / HoldHLEnd** 字段，所以 CreateNote 里根本没有写 noteImages[2] 的代码。

---

## 旧方案 (NoteMove method hook) 失败原因

旧脚本通过 `HoldControl.method("NoteMove").implementation` hook：

```typescript
HoldControl.method("NoteMove", 0).implementation = function(this: any): void {
    this.method("NoteMove").invoke();  // 先执行原始 NoteMove
    syncMultiHoldTailOnce(this, loadedSprites);  // 再补写 noteImages[2]
};
```

问题：
1. **时序问题**: `this.method("NoteMove").invoke()` 已经执行完毕，NoteMove 首次运行时已经用旧的 `noteImages[2]` 初始化了 `_holdEndSpriteRenderer1`。事后写 `noteImages[2]` 对已初始化的 renderer 无效。
2. **身份判断脆弱**: `sameObject()` 通过比对 Il2Cpp handle 判断是否是多押。Il2Cpp bridge 的 handle 对比在不同生命周期可能不稳定。
3. **性能**: 每帧每个 Hold 都会调用 `syncMultiHoldTailOnce`，即使已处理过的也要查 Set。

---

## 新方案: Code Cave 内联 Hook

### 核心思路

在 CreateNote 写入 `noteImages[1] = HoldHL1` 的那条 STR 指令处，替换为跳转到 code cave。code cave 内：
1. 执行原始 STR（写 noteImages[1]）
2. 额外写入 `noteImages[2] = multiHoldEnd`
3. 跳回原始下一条指令

### 汇编级细节

#### Hook 点 1: Above 路径

```
原始指令:
  0x2397bb8: F9 00 16 D4   STR X20, [X22, #0x28]    ; noteImages[1] = HoldHL1
  0x2397bbc: F9 40 92 68   LDR X8, [X19, #0x120]    ; LABEL_130 入口 (不能被覆盖)

替换后:
  0x2397bb8: B  <cave_above>                          ; 4 字节, 精确替换一条指令
  0x2397bbc: (保持不变)                                ; LABEL_130 入口完好

cave_above 内容:
  STR  X20, [X22, #0x28]     ; 原始指令: noteImages[1] = HoldHL1
  LDR  X8, <spritePtrSlot>   ; 从共享内存槽读取 multi.holdEnd 指针
  LDR  X8, [X8]              ; 解引用
  CBZ  X8, skip               ; 如果指针为 NULL 则跳过
  STR  X8, [X22, #0x30]      ; noteImages[2] = multi.holdEnd
skip:
  B    base+0x2397bbc         ; 跳回 LABEL_130
```

#### Hook 点 2: Below 路径

```
原始指令:
  0x2397f64: F9 00 16 F4   STR X20, [X23, #0x28]    ; noteImages[1] = HoldHL1
  0x2397f68: F9 40 92 68   LDR X8, [X19, #0x120]    ; LABEL_188 入口 (不能被覆盖)

替换后:
  0x2397f64: B  <cave_below>
  0x2397f68: (保持不变)

cave_below 内容:
  STR  X20, [X23, #0x28]     ; 原始指令: noteImages[1] = HoldHL1
  LDR  X8, <spritePtrSlot>   ; 从共享内存槽读取 multi.holdEnd 指针
  LDR  X8, [X8]              ; 解引用
  CBZ  X8, skip               ; 如果指针为 NULL 则跳过
  STR  X8, [X23, #0x30]      ; noteImages[2] = multi.holdEnd
skip:
  B    base+0x2397f68         ; 跳回 LABEL_188
```

### spritePtrSlot 机制

- `Memory.alloc(8)` 分配 8 字节空间，初始化为 NULL
- `LevelControl.Awake` hook 中加载贴图后，将 `multi.holdEnd` 的原生指针写入 spritePtrSlot
- Code cave 在运行时从 spritePtrSlot 读取，如果为 NULL 则跳过（sprites 尚未加载时安全）
- 这避免了在 code cave 的纯汇编中调用任何 JS 回调

### 为什么不能用 Interceptor.attach

Frida 的 `Interceptor.attach` 在 ARM64 上的 trampoline 实现:
- 通常需要 `ADRP + LDR + BR` (12 字节 = 3 条指令) 来跳转到远端 handler
- 即使只 hook 一个地址，也会覆盖 hook 点 **之后** 的至少 2 条指令
- `0x2397bbc` 是 `LABEL_130` 的入口（非多押 Hold 和其他 note 类型都会跳转到这里），被覆盖后所有走到 LABEL_130 的路径都会崩溃
- 同理 `0x2397f68` 是 `LABEL_188` 的入口

手动 code cave 只替换 1 条指令（4 字节），用 `B <cave>` 跳转，ARM64 的 B 指令有 ±128MB 范围，完全够用。

---

## 完整寄存器上下文

### Above 路径 (hook at 0x2397bb8)

在执行到 `STR X20, [X22, #0x28]` 时：
- **X19** = JudgeLineControl (this)
- **X20** = HoldHL1 sprite (从 JLC + 0x48 加载)
- **X21** = HoldControl 实例
- **X22** = HoldControl.noteImages 数组指针 (从 X21 + 0x48 加载)

上下文来源（反编译行 1122-1156）：
```c
v85 = *(_QWORD *)(klass_14 + 72);   // X22 = HoldControl->noteImages (offset 0x48)
v86 = *(_QWORD *)(klass_1 + 64);    // X20 = JLC->HoldHL0 (offset 0x40)
*(_QWORD *)(v85 + 32) = v86;         // noteImages[0] = HoldHL0

v87 = *(_QWORD *)(klass_14 + 72);   // X22 重新加载 noteImages
v88 = *(_QWORD *)(klass_1 + 72);    // X20 = JLC->HoldHL1 (offset 0x48)
*(_QWORD *)(v87 + 40) = v88;         // noteImages[1] = HoldHL1  ← 我们 hook 这里
```

### Below 路径 (hook at 0x2397f64)

在执行到 `STR X20, [X23, #0x28]` 时：
- **X19** = JudgeLineControl (this)
- **X20** = HoldHL1 sprite
- **X22** = HoldControl 实例（注意: 和 above 路径的寄存器分配不同）
- **X23** = HoldControl.noteImages 数组指针

---

## 脚本改动记录

### 删除的代码

1. **`processedHolds`** (Set) — 不再需要跟踪已处理的 Hold 实例
2. **`sameObject()`** — 不再需要通过 handle 对比判断多押
3. **`syncMultiHoldTailOnce()`** — 整个函数删除
4. **`HoldControl.NoteMove` method hook** — 不再 hook NoteMove

### 新增的代码

1. **`spritePtrSlot`** — `Memory.alloc(8)` 分配的共享内存槽
2. **`installHoldEndCave()`** — 安装 code cave 的函数
   - 参数: `hookRva`（hook 的 RVA）、`noteImagesReg`（数组寄存器名）、`returnRva`（返回地址 RVA）
   - 使用 `Arm64Writer` 生成 cave 代码
   - 使用 `Memory.patchCode` 替换原始指令
3. **两处 cave 安装调用**:
   - `installHoldEndCave(0x2397bb8, "x22", 0x2397bbc)` — above 路径
   - `installHoldEndCave(0x2397f64, "x23", 0x2397f68)` — below 路径

### 未改动的代码

- `LevelControl.Awake` method hook — 保留（负责加载贴图和替换资源字段）
- `UiChange.OnEnable` method hook — 保留（负责重新应用贴图）
- `applyToLevelControl()` — 保留（修改 prefab 和 HL 字段）
- `resolveTailModeSprites()` — 保留（按 tail mode 解析贴图）
- 所有贴图加载逻辑 — 保留

---

## 各 tail mode 行为对比

| Mode | 值 | 普通 Hold 尾 | 多押 Hold 尾 | code cave 是否激活 |
|------|---|-------------|-------------|-------------------|
| NONE | 1 | 隐藏 | 隐藏 | 否 |
| SHARED | 2 | hold_end.png | hold_end.png | 否 |
| SEPARATE | 3 | hold_end.png | hold_end_multi.png | 是 |

Mode 1 和 2 不需要 code cave，因为：
- Mode 1: renderer 直接禁用，不需要关心 noteImages[2] 是什么
- Mode 2: prefab 的 noteImages[2] 已经被 `replaceHoldPrefabNoteImages()` 设置为 normal.holdEnd，多押实例从 prefab 继承即可

---

## 潜在风险与注意事项

1. **B 指令范围**: ARM64 的 `B imm26` 有 ±128MB 跳转范围。`Memory.alloc` 分配的页可能离 hook 点很远。如果超出范围，`Arm64Writer.putBImm` 会抛异常。实际上 Frida 的 `Memory.alloc` 通常在进程地址空间的合理范围内分配，不太会超限。

2. **GC 安全**: 我们直接往 Il2Cpp 管理的 array 写入指针。这个 sprite 对象由 `spriteCache` 持有强引用，不会被 GC 回收。`spritePtrSlot` 由 `Memory.alloc` 分配，Frida 生命周期内不会释放。

3. **spritePtrSlot 初始化时序**: code cave 在 `LevelControl.Awake` 之前就已安装。如果在 Awake 之前有 CreateNote 调用（理论上不会），spritePtrSlot 为 NULL，CBZ 会跳过写入，安全。

4. **非多押路径安全**: code cave 只在多押路径上被执行（非多押 Hold 在 chordSupport 检查时就已跳过，直接走 LABEL_130/LABEL_188）。所以 cave 中写入的 noteImages[2] 只会影响多押 Hold。
