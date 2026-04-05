# Note Texture Replace Function Summary

## 背景

本次问题的核心是：`note_texture_replace_bridge.ts` 原先只替换了 `LevelControl` 上的 `*HL` 精灵字段，因此只会影响游戏里“双押/多押”时使用的高亮 note 样式，不会影响普通单 note。

这不是脚本“没生效”，而是脚本命中的资源链路本来就只覆盖 chord/highlight 分支。

## 这次确认过的关键函数作用

### `LevelControl.Awake` (`0x239a63c`)

作用：

- 关卡控制器初始化。
- 遍历并实例化一批 Addressables 资源。
- 是一个适合做资源替换入口的时机，因为此时 `LevelControl` 实例字段已经存在。

和本次问题的关系：

- 旧脚本就是 hook 在这里。
- 旧脚本只修改了 `LevelControl` 上的 `ClickHL`、`HoldHL0`、`DragHL`、`FlickHL`。
- 因为这里只改了 HL 字段，所以后续只会影响 chord note。

### `LevelControl.<Start>d__40.MoveNext` (`0x239d300`)

作用：

- `LevelControl.Start()` 对应的协程主体。
- 加载关卡运行所需资源。
- 创建并初始化 `JudgeLineControl` 实例。
- 把 `LevelControl` 上的 prefab 字段和 HL sprite 字段拷贝到 `JudgeLineControl`。

这次静态分析确认到的关键点：

- `LevelControl.Click/Drag/Hold/Flick` 会被拷到 `JudgeLineControl.Click/Drag/Hold/Flick`。
- `LevelControl.ClickHL/HoldHL0/HoldHL1/DragHL/FlickHL` 也会被拷到 `JudgeLineControl` 对应字段。

结论：

- `MoveNext` 本身不是“普通 note 贴图最终决定点”。
- 它的作用更像是把 `LevelControl` 的资源分发给每条判定线控制器。

### `JudgeLineControl.CreateNote` (`0x239739c`)

作用：

- 真正创建单个 note 实例。
- 按 note 类型实例化不同 prefab：
  - `Click`
  - `Drag`
  - `Hold`
  - `Flick`
- 给对应控制器组件写入 `scoreControl`、`progressControl`、`levelInformation`、`noteInfor` 等字段。
- 按是否为 chord，决定是否覆盖默认贴图为 HL 贴图。

这是本次最关键的函数。

#### `Click` 分支

确认到的行为：

- 普通情况下，实例化 `Click` prefab，`ClickControl.noteImage` 继续使用 prefab 自带值。
- 如果当前 note 与前后 note 构成 chord，则会把 `JudgeLineControl.ClickHL` 写入 `ClickControl.noteImage`。

结论：

- `ClickHL` 只影响双押/多押。
- 单 note 使用的是 `Click` prefab 上 `ClickControl.noteImage`。

#### `Drag` 分支

确认到的行为：

- 普通情况下，实例化 `Drag` prefab，`DragControl.noteImage` 继续使用 prefab 默认值。
- chord 情况下，会把 `JudgeLineControl.DragHL` 写入 `DragControl.noteImage`。

结论：

- `DragHL` 只影响双押/多押。
- 单 note 使用的是 `Drag` prefab 上 `DragControl.noteImage`。

#### `Flick` 分支

确认到的行为：

- 普通情况下，实例化 `Flick` prefab，`FlickControl.noteImage` 使用 prefab 默认值。
- chord 情况下，会把 `JudgeLineControl.FlickHL` 写入 `FlickControl.noteImage`。

结论：

- `FlickHL` 只影响双押/多押。
- 单 note 使用的是 `Flick` prefab 上 `FlickControl.noteImage`。

#### `Hold` 分支

确认到的行为：

- `HoldControl` 使用的是 `noteImages` 数组，而不是单个 `noteImage`。
- 普通情况下使用 prefab 里预设的 `noteImages`。
- chord 情况下会把 HL 资源写入数组中的对应位置。
- `HoldHL0` / `HoldHL1` 分别对应 hold 相关的不同部位资源。

结论：

- `Hold` 不能按单 sprite 处理，必须考虑数组。
- 原脚本只改 `HoldHL0`，而且没有碰普通 `Hold` prefab，所以普通 hold 不会被覆盖。

### `ClickControl.Start` / `DragControl.Start` / `FlickControl.Start` / `HoldControl.Start`

作用：

- 这些 `Start()` 主要处理旋转、初始朝向等逻辑。
- 这次确认到它们不是决定贴图的关键位置。

结论：

- 这几个 `Start()` 不是最合适的贴图替换点。
- 贴图实际使用链路更靠前，在 prefab 默认字段或 `JudgeLineControl.CreateNote` 的 chord 覆写逻辑里。

### `ClickControl.NoteMove` / `DragControl.NoteMove` / `FlickControl.NoteMove` / `HoldControl.NoteMove`

作用：

- note 运行时移动、显示、透明度、位置调整等。
- 在第一次需要渲染时，会把控制器里的 `noteImage` 或 `noteImages` 真正写进 `SpriteRenderer`。

结论：

- `NoteMove()` 是“最终把 sprite 塞进 renderer”的地方。
- 但这里不是最优改点，因为如果前面的 `noteImage` / `noteImages` 已经改对，运行时会自然生效。

## 原脚本的问题

原脚本逻辑：

- 在 `LevelControl.Awake` 中创建自定义 sprite。
- 仅替换 `LevelControl` 上的这些字段：
  - `ClickHL`
  - `HoldHL0`
  - `DragHL`
  - `FlickHL`

所以原脚本只能覆盖：

- chord note
- 也就是双押/多押使用的高亮贴图

不能覆盖：

- 普通 `Click`
- 普通 `Drag`
- 普通 `Flick`
- 普通 `Hold`

## 我做的改动

修改文件：

- [note_texture_replace_bridge.ts](F:/tool/phi_reversed/note_texture_replace_bridge.ts)

### 1. 补上 `HoldHL1`

新增了：

- `HoldHL1: "/data/local/tmp/hold.png"`

原因：

- 静态分析确认 `Hold` 的 HL 分支并不只有 `HoldHL0`，还会用到 `HoldHL1`。

### 2. 增加 sprite 缓存

新增：

- `spriteCache`
- `getOrCreateSprite()`

作用：

- 同一路径只创建一次 `Sprite`。
- 避免重复 `LoadImage` 和重复构造。

### 3. 增加普通 prefab 的组件替换逻辑

新增：

- `getComponent()`
- `replacePrefabNoteImage()`
- `replaceHoldPrefabNoteImages()`

作用：

- 对普通 note prefab 上挂着的控制器组件直接改字段。

具体覆盖内容：

- `Click` prefab 上的 `ClickControl.noteImage`
- `Drag` prefab 上的 `DragControl.noteImage`
- `Flick` prefab 上的 `FlickControl.noteImage`
- `Hold` prefab 上的 `HoldControl.noteImages`

### 4. 保留原有 HL 替换，同时补齐普通 note 替换

现在脚本在 `LevelControl.Awake` 中会同时做两类替换：

第一类：替换 HL 资源

- `ClickHL`
- `HoldHL0`
- `HoldHL1`
- `DragHL`
- `FlickHL`

第二类：替换普通 prefab 默认贴图

- `Click -> ClickControl.noteImage`
- `Drag -> DragControl.noteImage`
- `Flick -> FlickControl.noteImage`
- `Hold -> HoldControl.noteImages`

## 改动后的实际效果

改动前：

- 只有双押/多押的高亮 note 会变。
- 单 note 不变。

改动后：

- 单 note 会走 prefab 默认字段替换后的贴图。
- 双押/多押会继续走 HL 字段替换后的贴图。

也就是说，普通 note 和 chord note 两条链路现在都覆盖到了。

## 为什么这次不需要额外 Frida 运行时取材质名

因为这次问题已经能通过静态分析完全解释清楚：

- 问题不在“不知道材质名是什么”。
- 问题在“原脚本只改了 HL 分支，没有改普通 prefab 分支”。

所以这次不需要再额外通过 Frida 去 dump 材质名，也能直接完成修复。

如果后续还要继续区分：

- `Hold` 的头/body/end 三段具体该分别用哪张图
- 或者想精确确认 prefab 里原始 sprite 名称

那时再补运行时脚本会更合适。

## 本次结论

一句话总结：

- `JudgeLineControl.CreateNote` 决定“单 note 用 prefab 默认图，chord 用 HL 覆写图”。
- 我这次的修改，就是把这两条资源链路都覆盖掉，而不是只改 HL。
