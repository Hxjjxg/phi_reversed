# Note 贴图链路 IDA 总结

## 核心结论

这次从 IDA 里确认到的关键点是：

- `LevelControl` 上同时保存了普通 note prefab 和多押用的 `HL` sprite。
- `JudgeLineControl.CreateNote` 决定每个 note 实例到底走普通贴图还是多押贴图。
- `Click / Drag / Flick` 的多押版本都是独立存在的。
- `Hold` 的多押字段只有两个：
  - `HoldHL0`
  - `HoldHL1`
- `HoldControl.noteImages` 是一个数组，静态分析确认其顺序是：
  - `index 0 = holdHead`
  - `index 1 = holdBody`
  - `index 2 = holdEnd`

也就是说：

- 普通 `Hold` 有头 / 身 / 尾三张图。
- 多押 `Hold` 原生只直接提供了“头”和“身”的 HL 字段，没有单独的 `HoldHLEnd` 字段。

---

## 已确认的类和字段

### `LevelControl`

`LevelControl` 上和 note 外观直接相关的字段：

- 普通 prefab
  - `Click`
  - `Drag`
  - `Hold`
  - `Flick`
- 多押 / 高亮 sprite
  - `ClickHL`
  - `HoldHL0`
  - `HoldHL1`
  - `DragHL`
  - `FlickHL`

这说明：

- `Click / Drag / Flick / Hold` 普通版本不是直接放在 `Sprite` 字段上，而是放在 prefab 里。
- 多押版本是直接挂在 `LevelControl` 上的 sprite 字段。

---

### `JudgeLineControl`

`JudgeLineControl` 上也有一套与 `LevelControl` 对应的字段：

- `Click`
- `Drag`
- `Hold`
- `Flick`
- `ClickHL`
- `HoldHL0`
- `HoldHL1`
- `DragHL`
- `FlickHL`

`LevelControl__Start_d__40.MoveNext` 会把 `LevelControl` 的这些字段继续拷给 `JudgeLineControl`。

所以：

- `LevelControl` 更像是关卡根资源入口。
- `JudgeLineControl` 更像是每条判定线实际用的资源持有者。

---

### `ClickControl / DragControl / FlickControl`

这三个类的共同点：

- 都有 `noteImage`
- 都有 `_spriteRenderer`

字段模式：

- `ClickControl.noteImage`
- `DragControl.noteImage`
- `FlickControl.noteImage`

说明：

- 普通和多押的 `Click / Drag / Flick` 最终都会落到单个 `noteImage` 上。

---

### `HoldControl`

`HoldControl` 和另外三种 note 最大的区别是：

- 它不是单个 `noteImage`
- 它用的是 `noteImages`

关键字段：

- `noteImages`
- `_holdHeadSpriteRenderer`
- `_holdSpriteRenderer`
- `_holdEndSpriteRenderer1`

结合 `HoldControl.NoteMove` 的静态分析，可以确认：

- `noteImages[0]` 对应头
- `noteImages[1]` 对应身
- `noteImages[2]` 对应尾

这是这次贴图改动里最重要的结论之一。

---

## 关键函数作用

### `LevelControl.Awake`

- RVA: `0x239A63C`
- 作用：
  - 关卡根控制器初始化
  - 是比较合适的资源替换入口

对贴图替换的意义：

- 在这里替换 `LevelControl.ClickHL / HoldHL0 / HoldHL1 / DragHL / FlickHL`
- 可以影响后续多押 note 的资源来源
- 也可以在这里顺手改普通 prefab 上挂着的组件字段

---

### `LevelControl__Start_d__40.MoveNext`

- RVA: `0x239D300`
- 作用：
  - `LevelControl.Start()` 协程主体
  - 创建 / 初始化 `JudgeLineControl`
  - 把 `LevelControl` 上的 note prefab 和 HL sprite 分发给 `JudgeLineControl`

对贴图替换的意义：

- 它本身不是最终决定单个 note 用哪张图的函数
- 但它解释了为什么改 `LevelControl` 字段会影响后续 note 生成

---

### `JudgeLineControl.CreateNote`

- RVA: `0x239739C`
- 作用：
  - 创建单个 note
  - 按 note 类型实例化不同 prefab
  - 按是否为 chord / 多押决定是否用 HL 资源覆盖

这是本次最关键的函数。

#### 在这个函数里确认到的行为

##### `Click`

- 普通情况下使用 `Click` prefab 上 `ClickControl.noteImage`
- 多押时会把 `ClickHL` 覆盖到 `ClickControl.noteImage`

##### `Drag`

- 普通情况下使用 `Drag` prefab 上 `DragControl.noteImage`
- 多押时会把 `DragHL` 覆盖到 `DragControl.noteImage`

##### `Flick`

- 普通情况下使用 `Flick` prefab 上 `FlickControl.noteImage`
- 多押时会把 `FlickHL` 覆盖到 `FlickControl.noteImage`

##### `Hold`

- 普通情况下使用 `Hold` prefab 上 `HoldControl.noteImages`
- 多押时会把 HL 资源写入 `HoldControl.noteImages`
- 原生多押只看到：
  - `HoldHL0`
  - `HoldHL1`

所以：

- `Click / Drag / Flick` 都有完整独立的“普通 / 多押”两套入口
- `Hold` 原生只有“普通三段 + 多押两段”的资源模型

---

### `ClickControl.NoteMove`

- RVA: `0x1F39B5C`
- 作用：
  - 首次需要渲染时，把 `noteImage` 真正写进 `_spriteRenderer`

---

### `DragControl.NoteMove`

- RVA: `0x1F4CA88`
- 作用：
  - 把 `noteImage` 真正写进 `_spriteRenderer`

---

### `FlickControl.NoteMove`

- RVA: `0x2136D04`
- 作用：
  - 把 `noteImage` 真正写进 `_spriteRenderer`

---

### `HoldControl.NoteMove`

- RVA: `0x2146B64`
- 作用：
  - 首次运行时把 `noteImages` 三个元素分别写进：
    - `_holdHeadSpriteRenderer`
    - `_holdSpriteRenderer`
    - `_holdEndSpriteRenderer1`

根据反编译可确认：

- `noteImages[0] -> _holdHeadSpriteRenderer`
- `noteImages[1] -> _holdSpriteRenderer`
- `noteImages[2] -> _holdEndSpriteRenderer1`

这也是为什么如果脚本把顺序写错，就会出现：

- 头尾看起来混乱
- 身体消失或不对

---

## 这次确认出的资源模型

### `Click`

- 普通版：有
- 多押版：有

来源：

- 普通：`Click` prefab -> `ClickControl.noteImage`
- 多押：`ClickHL`

### `Drag`

- 普通版：有
- 多押版：有

来源：

- 普通：`Drag` prefab -> `DragControl.noteImage`
- 多押：`DragHL`

### `Flick`

- 普通版：有
- 多押版：有

来源：

- 普通：`Flick` prefab -> `FlickControl.noteImage`
- 多押：`FlickHL`

### `Hold`

- 普通版：有
  - 头
  - 身
  - 尾
- 多押版：只有原生两段入口
  - `HoldHL0`
  - `HoldHL1`

结合 `HoldControl.noteImages` 顺序：

- 普通：
  - `noteImages[0] = head`
  - `noteImages[1] = body`
  - `noteImages[2] = end`
- 多押原生：
  - `HoldHL0` 对应 head
  - `HoldHL1` 对应 body
  - 没有独立 `HoldHLEnd`

---

## 当前 TS 脚本里做了什么

当前脚本文件：

- [note_texture_replace_bridge changed.ts](F:/tool/phi_reversed/scripts/note_texture_hook/note_texture_replace_bridge%20changed.ts)

### 1. 把贴图配置拆成普通版和多押版

现在配置里有两套：

- `normal`
- `multi`

每套都分别配置：

- `click`
- `drag`
- `flick`
- `holdHead`
- `holdBody`
- `holdEnd`

这解决了之前“普通版和多押版混用同一张图”的问题。

---

### 2. 改普通 prefab 的组件字段

脚本会在 `LevelControl.Awake` 中直接改普通 note prefab：

- `Click` prefab -> `ClickControl.noteImage`
- `Drag` prefab -> `DragControl.noteImage`
- `Flick` prefab -> `FlickControl.noteImage`
- `Hold` prefab -> `HoldControl.noteImages`

这让普通 note 可以独立于 HL 资源被替换。

---

### 3. 改多押字段

脚本会在 `LevelControl.Awake` 中改：

- `ClickHL`
- `HoldHL0`
- `HoldHL1`
- `DragHL`
- `FlickHL`

这样多押 note 也会走自定义贴图。

---

### 4. 修正 `Hold` 的头 / 身 / 尾顺序

当前脚本已经按 IDA 确认的顺序写：

- `noteImages[0] = holdHead`
- `noteImages[1] = holdBody`
- `noteImages[2] = holdEnd`

这一步是为了避免之前那种：

- 头尾混用
- 身体不显示
- 尾巴样式错位

---

### 5. 额外 hook `HoldControl.NoteMove`

因为原生多押 `Hold` 只有：

- `HoldHL0`
- `HoldHL1`

没有独立的 `HoldHLEnd` 字段，所以脚本额外 hook 了 `HoldControl.NoteMove`：

- 首次运行时判断当前 Hold 是普通版还是多押版
- 再把头 / 身 / 尾三张图同步到实例的三个 `SpriteRenderer`

这一步的目的：

- 让多押 `Hold` 的尾巴也能和普通版分开
- 弥补原生字段模型里没有 `HoldHLEnd` 的缺口

---

## 当前脚本的设计意图

一句话概括：

- 普通 `Click / Drag / Flick / Hold` 走 prefab 默认字段替换
- 多押 `Click / Drag / Flick` 走 `*HL` 字段替换
- 多押 `Hold` 先走 `HoldHL0 / HoldHL1`，再由 `HoldControl.NoteMove` 补齐尾巴并同步到实例 renderer

所以当前脚本是在“尊重原生链路”的基础上，尽量把普通版、多押版、Hold 三段全部拆开。

---

## 还存在的边界

### 已确认

- `Click / Drag / Flick` 都有独立多押版本
- `Hold` 普通版是三段
- `Hold` 多押原生只有两段字段
- `HoldControl.noteImages` 顺序是头 / 身 / 尾

### 仍然需要注意

- 多押 `Hold` 的尾巴不是原生独立字段，而是当前脚本额外补出来的
- 如果后续运行时发现某个特殊关卡还会二次覆盖 `LevelControl` 字段，需要继续看：
  - `UiChange.OnEnable`

---

## 建议后续调试顺序

如果后面还要继续精修，建议按这个顺序看：

1. 先看 `LevelControl.Awake` 日志，确认普通和多押资源都替换成功
2. 再看 `HoldControl.NoteMove` 日志，确认实例同步有没有成功
3. 如果特殊关卡覆盖了资源，再去补 `UiChange.OnEnable`

如果只是改图，不继续分析：

- 当前最值得优先维护的脚本就是：
  - [note_texture_replace_bridge changed.ts](F:/tool/phi_reversed/scripts/note_texture_hook/note_texture_replace_bridge%20changed.ts)
