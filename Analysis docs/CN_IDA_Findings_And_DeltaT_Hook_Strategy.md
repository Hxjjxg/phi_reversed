# IDA 发现与 Delta T Hook 思路

## 目标

在游玩过程中显示每个 note 的点击偏差，也就是 `delta t` / `judgeTime`。

这次主要回答两个问题：

1. 游戏内 `combo` / `score` HUD 是谁在更新
2. `delta t` 应该 hook 到哪里，以及显示应该挂到哪里

---

## 一、IDA 中确认到的核心链路

## 1. HUD 布局层

### `LevelUICont`

- 类位置：`dump_android.cs` 中 `LevelUICont`
- 关键方法：`Update`
- RVA: `0x239F170`

字段：

- `pause // 0x18`
- `score // 0x20`
- `songsName // 0x28`
- `songsLevel // 0x30`

结论：

- 顶部游玩 HUD 的“分数区域”是一个独立对象
- `combo` / `score` 文本都属于这一块 HUD
- `LevelUICont` 负责的是布局与位置调整，不负责每帧算分和改文字内容

---

## 2. 真正负责 HUD 文本刷新的类

### `ScoreControl`

在 `dump_android.cs` 中：

- 类定义：`ScoreControl`
- `comboText // 0x30`
- `_score // 0x38`
- `_combo // 0x44`
- `score // 0x68`
- `combo // 0x70`

关键方法：

- `Miss` RVA: `0x1E98A10`
- `Bad` RVA: `0x1E98AAC`
- `Good` RVA: `0x1E98B5C`
- `Perfect` RVA: `0x1E98D04`
- `Update` RVA: `0x1E99000`

### `ScoreControl.Update` 的实际作用

经 IDA 反编译确认，`ScoreControl.Update()` 每帧都会做这些事：

1. 根据 `perfect/good/bad/miss` 等状态重新计算 `_score`
2. 根据 `_combo` 更新 `comboText.text`
3. 根据 `_combo` 更新 `combo.text`
4. 更新 `score.text`

这点是整个显示问题的关键。

### `comboText` / `combo` / `score` 的职责

- `comboText`
  - 显示 `COMBO` 标签
- `combo`
  - 显示 combo 数字
- `score`
  - 显示分数

### `ScoreControl.Update` 的原版显示逻辑

从反编译可以看出：

- 当 `combo >= 3`
  - `comboText.text = "COMBO"`
  - `combo.text = _combo.ToString()`
- 当 `combo < 3`
  - `comboText.text = ""`
  - `combo.text = ""`

结论：

- 如果你只在判定函数里临时改 `combo.text`
  - 下一帧就会被 `ScoreControl.Update()` 覆盖
- 如果你把内容拼在 `comboText` 上
  - `combo < 3` 时会被一起清空

所以显示层最稳的 hook 点不是判定函数本身，而是 **`ScoreControl.Update`**。

---

## 3. 判定链路

### 判定总控

#### `JudgeControl`

- `Start` RVA: `0x2149C54`
- `Update` RVA: `0x2149D80`
- `CheckNote` RVA: `0x214A418`
- `CheckFlick` RVA: `0x214AFFC`

`JudgeControl.Update` 负责：

1. 获取当前时间
2. 获取手指位置
3. 调 `CheckNote`
4. 调 `CheckFlick`

它主要负责在候选 note 范围内设置“可判定标记”，不是最终给分的地方。

---

## 4. 最终结算发生在各 Note 控制类

### `ClickControl`

- `Judge` RVA: `0x1F39E64`

### `DragControl`

- `Judge` RVA: `0x1F4CD60`

### `FlickControl`

- `NoteMove` RVA: `0x2136D04`
- `Judge` RVA: `0x2136FDC`

说明：

- 你当前关注的 `0x2136D04` 是 `FlickControl.NoteMove`
- 真正进入 flick 判定结算的是 `FlickControl.Judge`

### `HoldControl`

- `Judge` RVA: `0x21474B8`

---

## 5. 各 Note 类型如何走到 `ScoreControl`

经 IDA `xrefs_to` 确认：

### `ScoreControl.Perfect`

被以下函数调用：

- `ClickControl.Judge`
- `DragControl.Judge`
- `FlickControl.Judge`
- `HoldControl.Judge`

### `ScoreControl.Good`

被以下函数调用：

- `ClickControl.Judge`
- `HoldControl.Judge`

### `ScoreControl.Bad`

被以下函数调用：

- `ClickControl.Judge`

### `ScoreControl.Miss`

被以下函数调用：

- `ClickControl.Judge`
- `DragControl.Judge`
- `FlickControl.Judge`
- `HoldControl.Judge`

结论：

- `ScoreControl.Perfect/Good/Bad/Miss` 是最终判定结果的统一入口
- 这里非常适合记录最近一次 `delta t`

---

## 二、`judgeTime` / `delta t` 在 IDA 中的含义

从 `ClickControl.Judge`、`HoldControl.Judge` 等反编译结果可见，结算时传给 `ScoreControl` 的 `judgeTime` 本质上来自：

- `nowTime - note.realTime`
  或与之等价的符号形式

对显示来说可以直接理解成：

- `judgeTime > 0`
  - 晚判
- `judgeTime < 0`
  - 早判

转成毫秒后：

- `+12ms` 表示晚 12ms
- `-18ms` 表示早 18ms

---

## 三、关于“能不能直接拼到 combo 后面”

## 结论

可以，但不能只拼一次。

### 技术上为什么可以

`combo` 本身就是一个 `UnityEngine.UI.Text`，所以直接设置：

- `combo.text = "123  +12ms"`

是完全可行的。

### 为什么“只在 Perfect/Good/Bad 里拼字符串”不够

因为 `ScoreControl.Update()` 每帧都会重写：

- `comboText.text`
- `combo.text`
- `score.text`

也就是说：

- 你在 `Perfect()` 里刚改完
- 下一帧 `Update()` 又会把它还原成原版字符串

所以想复用现有 combo HUD，必须：

1. 在判定入口记录结果
2. 在 `ScoreControl.Update()` 之后再次写 UI

---

## 四、推荐的 Hook 设计

## 方案总览

建议把实现分成两层：

### 第一层：记录层

hook 这些函数：

- `ScoreControl.Perfect`
- `ScoreControl.Good`
- `ScoreControl.Bad`
- `ScoreControl.Miss`

用途：

- 保存最近一次判定结果
- 保存最近一次 `judgeTime`
- 可按 `ScoreControl` 实例分别存状态

示例状态：

```ts
{
  text: "dt=+12ms",
  ttl: 45
}
```

或者：

```ts
{
  text: "MISS",
  ttl: 30
}
```

### 第二层：显示层

hook：

- `ScoreControl.Update`

用途：

- 先让游戏原始 `Update()` 跑完
- 再把 `combo.text` 改成你想显示的内容

这是避免被原版 UI 覆盖的关键。

---

## 五、推荐显示策略

## 方案 A：拼到 combo 数字后面

推荐度：高

建议逻辑：

- 如果 `combo >= 3`
  - `combo.text = "{combo}  {delta}"`
- 如果 `combo < 3`
  - `combo.text = "{delta}"`

示例：

- `123  dt=+12ms`
- `dt=-18ms`
- `MISS`

优点：

- 不需要额外创建 UI
- 直接复用现有 HUD
- 数字位通常比 `COMBO` 标签位更宽，更容易看清

缺点：

- 会占用原本 combo 数字区域

---

## 方案 B：拼到 `COMBO` 标签后面

推荐度：中

例如：

- `COMBO  +12ms`

缺点：

- `comboText` 原版会在 `combo < 3` 时清空
- 位置通常更窄
- 可读性一般不如数字位

---

## 方案 C：单独新建一个 Text

推荐度：最高

优点：

- 不受 `combo >= 3` 逻辑影响
- 可以一直显示最近判定
- 后续更容易做颜色、淡出、Early/Late 字样

缺点：

- 要额外注入或创建一个 UI 文本对象

如果目标是“先快速验证效果”，建议优先做方案 A。

---

## 六、这次实现时踩到的 bridge 细节

在 `frida-il2cpp-bridge` 里，实例方法不能用“类方法对象 + this 参数”去调。

错误示例：

```ts
updateMethod.invoke(this)
```

这会报：

- `cannot invoke non-static method Update as it must be invoked throught a Il2Cpp.Object, not a Il2Cpp.Class`

正确写法应该是：

```ts
this.method("Update", 0).invoke()
```

同理：

```ts
this.method("Perfect", 4).invoke(...)
this.method("Good", 4).invoke(...)
this.method("Bad", 2).invoke(...)
this.method("Miss", 1).invoke(...)
```

---

## 七、最终建议

如果目标是“在现有 HUD 上最小改动显示 `delta t`”，推荐最终方案如下：

### 记录点

- `ScoreControl.Perfect`
- `ScoreControl.Good`
- `ScoreControl.Bad`
- `ScoreControl.Miss`

### 显示点

- `ScoreControl.Update`

### 显示位置

- 优先写到 `combo` 数字文本

### 推荐显示格式

- `123  dt=+12ms`
- `57  dt=-18ms`
- `MISS`

### 原因

因为：

1. 判定结果在 `ScoreControl` 四个函数里最集中
2. HUD 文本在 `ScoreControl.Update` 里统一被重写
3. `combo` 数字位比 `comboText` 标签位更适合追加内容

---

## 八、对应仓库文件

这次整理基于以下文件与 IDA 结果：

- `binary_file_and_exported_symbols/dump_android.cs`
- `Analysis docs/CN_Judge_Analysis.md`
- `scripts/bundle_redirect/score_control.txt`
- `scripts/delta_t_display_hook/delta_t_display_bridge.ts`

---

## 九、一句话版本

`delta t` 最适合在 `ScoreControl.Perfect/Good/Bad/Miss` 里记录，在 `ScoreControl.Update` 里显示；如果直接拼到 combo 后面，可以做，但必须每帧重写，否则会被原版 HUD 覆盖。
