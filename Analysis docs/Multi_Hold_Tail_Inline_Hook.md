# Multi Hold Tail Inline Hook Analysis

## 核心问题

SEPARATE 模式下单押 hold\_end.png 正常显示，但多押模式下 Hold 没有尾部（hold_end_multi.png 缺失）。

## IDA 反编译分析

### JudgeLineControl.CreateNote (RVA: 0x239739C)

这是创建单个 note 的关键函数。函数有两个进入路径：

- **below 路径**（参数 `ifAbove = false`）：`switch (*(_DWORD *)(v23 + 16))` 在函数体开头约 0x23975b8 处
- **above 路径**（参数 `ifAbove = true`）：`switch (*(_DWORD *)(v8 + 16))` 在约 0x2397444 处

两者的逻辑完全对称。

#### Hold 路径（case 3）

当 note 类型为 Hold (case 3) 时，游戏会判断该 note 是否为多押（chord）。判断方式是检查下一个 note 的 `positionX` 是否与当前 Hold 的 positionX 足够接近（差值 < 0.001）。

##### 非多押 Hold（正常路径）

从 Hold prefab（`JudgeLineControl.Hold`，偏移 +0x28）实例化后，HoldControl 的 `noteImages` 数组由 prefab 默认填充：
- `noteImages[0] = head`（来自 prefab 默认值）
- `noteImages[1] = body`（来自 prefab 默认值）
- `noteImages[2] = end`（来自 prefab 默认值）

##### 多押 Hold（问题路径）

当检测到多押时，游戏会额外执行以下步骤来覆盖 noteImages：

**above 路径：**
```
klass_14+40 = HoldHL0  →  noteImages[0] = HoldHL0   (line 1040)
klass_14+48 = ...      →  ... (judgeLine field)
klass_14+56 = klass_1 →  ... (judgeLine field)
...
// ... 多押判断逻辑 ...
LABEL_130:
... 注册到 NoteUpdateManager (line 1164) ...
```

关键赋值（above 路径）：
```
*(_QWORD *)(klass_14 + 40) = *(_QWORD *)(klass_1 + 64)   // noteImages[0] = HoldHL0
// noteImages[1] = HoldHL1  ← 在下面的多押分支中
```

**下面关键的多押判断逻辑**：

在 LABEL_121（above 路径）/ LABEL_188（below 路径）之后：

```c
v22 = *(_QWORD *)(klass_14 + 72);  // above: X21+0x48 → noteImages
if ( !v22 ) goto LABEL_378;

// 判断是否为多押：检查 levelInformation.notesAbove 中当前 note 之后是否有 X 坐标重合的 note
v65 = *(_QWORD *)(v63 + 48);  // notes 列表
klass = sub_3090C54(v65, ...);  // 查找下一个 note
// ... 比较 positionX ...
if ( vabds_f32(v73, v75) <= 0.001 ) goto LABEL_121;  // 如果 X 相同 → 多押
```

如果确定是多押，游戏会执行：

**above 路径**（LABEL_121 之后）：
```asm
2397b58  LDR   X22, [X21, #0x48]     ; X22 = noteImages
2397b60  LDR   X20, [X19, #0x40]     ; X20 = ClickHL (复用)
; ... 判断逻辑确定是否多押 ...
2397b84  STR   X20, [X22, #0x20]     ; noteImages[0] = HoldHL0
2397b90  LDR   X20, [X19, #0x48]     ; X20 = HoldHL1 ← 注意：这里写的是偏移 0x48
2397bb4  B.LS  loc_2398C50           ; 如果不是多押，跳过
2397bb8  STR   X20, [X22, #0x28]     ; noteImages[1] = HoldHL1  ← 多押分支
2397bbc  LDR   X8, [X19, #0x120]      ; ← 下一条指令（LABEL_130）
```

**below 路径**（LABEL_188 之后）：
```asm
2397f04  LDR   X23, [X22, #0x48]     ; X23 = noteImages
...
2397f30  STR   X20, [X23, #0x20]     ; noteImages[0] = HoldHL0
2397f3c  LDR   X20, [X19, #0x48]     ; X20 = HoldHL1
2397f60  B.LS  loc_2398C5C           ; 如果不是多押，跳过
2397f64  STR   X20, [X23, #0x28]     ; noteImages[1] = HoldHL1  ← 多押分支
2397f68  LDR   X8, [X19, #0x120]      ; ← 下一条指令（LABEL_188）
```

### 问题根因

**游戏只在多押时写了 noteImages[0] 和 noteImages[1]，从未写 noteImages[2]！**

| 路径 | 地址 | 汇编 | 含义 | 下一个指令地址 |
|------|------|------|------|----------------|
| above | `0x2397b84` | `STR X20, [X22, #0x20]` | noteImages[0] = HoldHL0 | 0x2397b88 |
| above | `0x2397bb8` | `STR X20, [X22, #0x28]` | noteImages[1] = HoldHL1 | 0x2397bbc |
| below | `0x2397f30` | `STR X20, [X23, #0x20]` | noteImages[0] = HoldHL0 | 0x2397f34 |
| below | `0x2397f64` | `STR X20, [X23, #0x28]` | noteImages[1] = HoldHL1 | 0x2397f68 |

其中，noteImages[0] 的赋值总是执行（both normal and multi），noteImages[1] 的赋值在非多押时跳过。

但 noteImages[2] 始终没有被写入——多押 Hold 的尾部 slot 保留了 prefab 原始值（即普通 hold_end.png），这就是为什么多押 Hold 不显示自定义尾部。

### 为什么 NoteMove method hook 方案不稳定

原脚本尝试在 `HoldControl.NoteMove` 首次调用时通过比较 `noteImages[0/1]` 与模板 sprite（`sameObject`）来判断是否为多押，然后补充 noteImages[2]。该方案存在以下问题：

1. **`sameObject` 对比 Il2Cpp 对象 handle 不稳定**——`handle.equals()` 或 `.toString()` 比较可能因 Il2Cpp 内部实现而变化
2. **时序问题**——NoteMove 首次调用时，原始方法已经用 `noteImages[2]` 初始化了 `_holdEndSpriteRenderer1`，事后覆盖 sprite 指针不会更新 renderer 的当前 sprite
3. **`processedHolds` 去重集合**——依赖 instance handle 的 String 化，可能漏判
4. **Method hook 性能**——NoteMove 每帧调用，需要 `processedHolds` 去重以避免重复执行

### Code Cave 方案

在 `JudgeLineControl.CreateNote` 的两个多押分支的 **STR X20, [Xn, #0x28]** 指令处（`0x2397bb8` above / `0x2397f64` below）进行 code cave 替换：

#### 为什么选择 code cave 而非 Interceptor.attach

Frida 的 `Interceptor.attach` 在 ARM64 上可能需要 12 字节（ADRP + LDR + BR）来构造跳转 trampoline。但这些 4 字节 STR 指令的下一条指令恰好是 `LABEL_130` / `LABEL_188`，是其他分支的跳转目标。12 字节的 trampoline 会覆写目标地址处的代码，导致分支跳转到被破坏的指令序列，引发崩溃。

Code cave 方案只覆写单个 STR 指令（4 字节），用一条 `B` 指令（4 字节，±128MB 跳转范围）替换，不会触碰到相邻的 LABEL 代码。

#### 架构

```
全局共享内存（spritePtrSlot）: 8 字节
    初始值: 0 (NULL)
    在 LevelControl.Awake 加载 sprite 后更新为 multi.holdEnd handle

原始 STR 指令地址: 0x2397bb8 (above), 0x2397f64 (below)
    被一条 B 指令替换 → 跳转到 code cave

Code cave（分配在可执行内存页中）:
    1. 执行原始 STR X20, [Xn, #0x28]  (保持原逻辑)
    2. LDR X8, =spritePtrSlot → 加载 sprite 指针
       LDR X8, [X8]            → 解引用得到实际 sprite ptr
    3. CBZ X8, skip             → 如果 sprite 为 NULL，跳过写入
    4. STR X8, [Xn, #0x30]     → noteImages[2] = multi.holdEnd
    5. [skip:] B returnAddr    → 返回到原函数下一条指令
```

#### Il2Cpp 数组内存布局

```
noteImages 指向的结构体:
    +0x00: 类型元数据指针
    +0x08: 同步块索引 / 其他
    +0x10: 长度（数组元素个数）
    +0x18: length = 数组元素个数（32位）
    +0x20: elements[0] = noteImages[0]
    +0x28: elements[1] = noteImages[1]
    +0x30: elements[2] = noteImages[2]
    ...
```

所以在 code cave 中：
- `[Xn, #0x28]` = elements[1]（原有）
- `[Xn, #0x30]` = elements[2]（新增写入）

#### 关键地址汇总

| 项目 | above 路径 | below 路径 |
|------|-----------|-----------|
| Hook 地址 | 0x2397bb8 | 0x2397f64 |
| 返回地址 | 0x2397bbc | 0x2397f68 |
| noteImages 寄存器 | X22 | X23 |
| Hook 字节验证 | `d4 16 00 f9` (STR X20,[X22,#0x28]) | `f4 16 00 f9` (STR X20,[X23,#0x28]) |
| 原始字节验证 | `68 92 40 f9` (LDR X8,[X19,#0x120]) | `68 92 40 f9` (LDR X8,[X19,#0x120]) |

#### 执行时机

1. **启动时**：脚本注入 → 安装 code caves（patch 4 字节）→ `spritePtrSlot` = NULL
2. **进入谱面时**：`LevelControl.Awake` 触发 → 加载自定义贴图 → `spritePtrSlot` = multi.holdEnd handle
3. **创建多押 Hold 时**：CreateNote 的 B 指令跳到 cave → cave 写 noteImages[2] = multi.holdEnd → 返回
4. **NoteMove 首次执行**：使用已正确的 noteImages[2] 初始化 renderer

## 代码实现

文件：`scripts/note_texture_hook/note_texture_replace_bridge_changed.ts`

### 关键新增代码

```typescript
// 共享存储，用于 code cave 在运行时读取 sprite 指针
const spritePtrSlot = Memory.alloc(8);
spritePtrSlot.writePointer(ptr(0));

// 在 LevelControl.Awake 中更新指针
if (loadedSprites.multi.holdEnd) {
    spritePtrSlot.writePointer(loadedSprites.multi.holdEnd.handle);
}

// 安装 code cave 的通用函数
function installHoldEndCave(
    hookRva: number,
    noteImagesReg: string,    // "x22" 或 "x23"
    returnRva: number
): void {
    const base = Il2Cpp.module.base;
    const hookAddr = base.add(hookRva);
    const returnAddr = base.add(returnRva);

    // 读取原始 4 字节指令（STR X20, [Xn, #0x28]）
    const originalBytes = hookAddr.readByteArray(4)!;

    // 分配 code cave
    const cave = Memory.alloc(Process.pageSize);

    const w = new Arm64Writer(cave, { pc: cave });

    // 1. 执行原始 STR
    w.putBytes(originalBytes);

    // 2. 加载 sprite 指针: X8 = *spritePtrSlot
    w.putLdrRegAddress("x8", spritePtrSlot);
    w.putLdrRegRegOffset("x8", "x8", 0);

    // 3. 如果指针为 NULL，跳过写入
    w.putCbzRegLabel("x8", "skip");

    // 4. noteImages[2] = sprite → STR X8, [Xn, #0x30]
    (w as any).putStrRegRegOffset("x8", noteImagesReg, 0x30);

    // 5. 分支返回
    w.putLabel("skip");
    w.putBImm(returnAddr);

    w.flush();

    // 设置为只读可执行
    Memory.protect(cave, Process.pageSize, "r-x");

    // 将原始指令替换为无条件 B 到 cave
    Memory.patchCode(hookAddr, 4, (code: NativePointer) => {
        const p = new Arm64Writer(code, { pc: hookAddr });
        p.putBImm(cave);
        p.flush();
    });
}

// 安装两个路径的 code caves
if (Number(HOLD_TAIL_MODE) === HOLD_TAIL_MODE_SEPARATE) {
    try {
        installHoldEndCave(0x2397bb8, "x22", 0x2397bbc);  // above
        installHoldEndCave(0x2397f64, "x23", 0x2397f68);  // below
    } catch (e) {
        console.log(`[note-texture] failed to install code caves: ${e}`);
    }
}
```

### 代码变化

**删除的内容：**
- `processedHolds: Set<string>` — 不再需要去重
- `sameObject()` 函数 — 不再需要运行时 sprite 比较判断
- `syncMultiHoldTailOnce()` 函数 — NoteMove 中的事后补救逻辑
- `HoldControl.method("NoteMove")` 的 method hook

**新增的内容：**
- `spritePtrSlot: NativePointer` — 8 字节全局共享存储
- `installHoldEndCave()` — code cave 安装函数
- 两个 code cave 注册点

## 测试验证

- 模式 1 (NONE)：单押/多押均没有尾部（不受 code cave 影响，模式判断跳过安装）
- 模式 2 (SHARED)：单押/多押均使用 hold_end.png（code cave 不安装，模式 2 共用 normal 的 holdEnd）
- 模式 3 (SEPARATE)：单押 hold_end.png / 多押 hold_end_multi.png（code cave 安装生效）
