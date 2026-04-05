# Combo / Score UI 与 Delta T 显示分析

## 结论先说

- 游戏内游玩 HUD 的 **combo / score 显示核心在 `ScoreControl`**。
- `combo` 和 `score` 不是在判定函数里直接长期维护的，而是由 **`ScoreControl.Update()` 每帧重写**。
- 因此，如果你只在 `Perfect/Good/Bad/Miss` 里把字符串拼到 `combo` 或 `comboText` 上，**下一帧就会被 `ScoreControl.Update()` 覆盖掉**。
- 所以要做 `delta t` 实时显示，最稳的方案是：
  1. 在 `ScoreControl.Perfect/Good/Bad/Miss` 里记录最近一次判定结果和 `judgeTime`
  2. 在 `ScoreControl.Update()` 末尾再次写 UI 文本

## 本次用 IDA 确认到的关键点

### 1. HUD 布局层

- `LevelUICont.Update`
  - RVA: `0x239F170`
  - 作用：根据屏幕宽高重新摆放 HUD
  - 关键字段：
    - `pause // 0x18`
    - `score // 0x20`
    - `songsName // 0x28`
    - `songsLevel // 0x30`

这说明顶部 HUD 的“分数区域”是一个单独的 `score` 根对象，combo / score 文本基本都挂在这里。

### 2. 真正更新 combo / score 的类

- `ScoreControl`
  - 在 `dump_android.cs` 中：
    - 类定义：`binary_file_and_exported_symbols/dump_android.cs:301270`
    - `comboText`: `0x30`
    - `score`: `0x68`
    - `combo`: `0x70`
    - `Update()`: `binary_file_and_exported_symbols/dump_android.cs:301335`

字段含义经 IDA 反编译确认如下：

- `comboText`
  - `UnityEngine.UI.Text`
  - 用来显示 `COMBO` 标签
- `combo`
  - `UnityEngine.UI.Text`
  - 用来显示 combo 数字
- `score`
  - `UnityEngine.UI.Text`
  - 用来显示分数

### 3. `ScoreControl.Update()` 的实际行为

- RVA: `0x1E99000`
- 关键行为：
  - 每帧重新计算 `_score`
  - 每帧重新设置 `comboText.text`
  - 每帧重新设置 `combo.text`
  - 每帧重新设置 `score.text`

从仓库已有反编译文本 `scripts/bundle_redirect/score_control.txt` 可以直接读出：

- 当 `combo >= 3`
  - `comboText.text = "COMBO"`
  - `combo.text = _combo.ToString()`
- 当 `combo < 3`
  - `comboText.text = ""`
  - `combo.text = ""`

这点非常关键：

- 如果你把 `delta t` 拼到 `comboText` 后面
  - 在 `combo < 3` 时会被直接清空
- 如果你把 `delta t` 拼到 `combo` 数字后面
  - 同样会在 `combo < 3` 时被清空
- 如果你只在 `Perfect/Good/Bad` 时写一次
  - 下一帧会被 `ScoreControl.Update()` 覆盖

## 判定链路与 `judgeTime`

### `ScoreControl` 判定入口

- `Miss`
  - RVA: `0x1E98A10`
- `Bad`
  - RVA: `0x1E98AAC`
- `Good`
  - RVA: `0x1E98B5C`
- `Perfect`
  - RVA: `0x1E98D04`

### xref 关系

经 IDA `xrefs_to` 确认：

- `ScoreControl.Perfect`
  - `ClickControl.Judge`
  - `DragControl.Judge`
  - `FlickControl.Judge`
  - `HoldControl.Judge`
- `ScoreControl.Good`
  - `ClickControl.Judge`
  - `HoldControl.Judge`
- `ScoreControl.Bad`
  - `ClickControl.Judge`
- `ScoreControl.Miss`
  - `Click/Drag/Flick/Hold.Judge`

### 各 Note 类型判定函数

- `ClickControl.Judge`
  - RVA: `0x1F39E64`
- `DragControl.Judge`
  - RVA: `0x1F4CD60`
- `FlickControl.Judge`
  - RVA: `0x2136FDC`
- `HoldControl.Judge`
  - RVA: `0x21474B8`

### `judgeTime` 的符号方向

从反编译可以看出，传给 `ScoreControl` 的 `judgeTime` 实际是：

- `judgeTime = nowTime - note.realTime`

因此：

- `judgeTime > 0`
  - 打晚了
- `judgeTime < 0`
  - 打早了

如果你直接显示成毫秒：

- `+12ms` = 晚 12ms
- `-18ms` = 早 18ms

## 关于“能不能直接拼到 combo 后面”

### 技术上：能

可以直接对 `UnityEngine.UI.Text.text` 赋值，比如：

- `combo.text = "123  +12ms"`
- `comboText.text = "COMBO  +12ms"`

### 但直接在判定函数里拼，不够

因为 `ScoreControl.Update()` 会每帧覆盖：

- 你在 `Perfect()` 里写进去的字符串
- 下一帧马上就会被原始 UI 刷掉

### 另外还有一个隐藏问题

游戏原本有一个逻辑：

- `combo < 3` 时，不显示 combo HUD

所以如果你只是“借 combo 区域显示 delta t”，那：

- 前两连不会显示
- 断连后也不会显示
- Miss 后也不会稳定显示

## 推荐方案

### 方案 A：复用 `combo` 数字文本，最省事

推荐度：高

做法：

1. Hook `ScoreControl.Perfect/Good/Bad/Miss`
2. 把最近一次判定结果存到你自己的状态里
   - 比如 `lastJudgeText = "+12ms"`
   - 或 `lastJudgeText = "MISS"`
3. Hook `ScoreControl.Update()`
4. 在原始 `Update()` 跑完后，重新改写 `combo.text`

建议显示逻辑：

- `combo >= 3`
  - `combo.text = "{combo}  {delta}"`
- `combo < 3`
  - `combo.text = "{delta}"`

这样：

- 有连击时，显示在 combo 数字后面
- 没连击时，依然能显示最近一次判定

### 方案 B：复用 `comboText` 标签

推荐度：中

做法类似，但要注意：

- 原版会在 `combo < 3` 时把 `comboText` 清空
- 所以仍然必须在 `ScoreControl.Update()` 后置改写

缺点：

- 标签位通常比数字位更短
- 拼接后更容易挤

### 方案 C：新建一个独立 `Text`

推荐度：最高

优点：

- 不和原始 combo 逻辑互相抢
- 不受 `combo >= 3` 阈值影响
- 后续更容易加颜色、大小、淡出动画

缺点：

- 比直接复用现有文本多一步 UI 注入

## 本仓库里我建议的落点

仓库已经有现成 Android hook 风格：

- `scripts/bundle_redirect/swap_score_android.js`

因此最自然的做法是新增一个 delta t 显示脚本：

- 记录点：
  - `ScoreControl.Perfect`
  - `ScoreControl.Good`
  - `ScoreControl.Bad`
  - `ScoreControl.Miss`
- 渲染点：
  - `ScoreControl.Update`

## 这次分析对应的仓库文件

- `binary_file_and_exported_symbols/dump_android.cs`
- `Analysis docs/CN_Judge_Analysis.md`
- `scripts/bundle_redirect/score_control.txt`

## 最终建议

如果你的目标是“尽快看到可用效果”，就不要只在判定函数里拼字符串。

最实用的做法是：

- 用 `ScoreControl.Perfect/Good/Bad/Miss` 记录最近一次 `delta t`
- 用 `ScoreControl.Update` 每帧重绘 `combo.text`

如果你只想最小改动复用现有 UI，我建议优先拼到 **combo 数字 (`combo`)**，而不是 `COMBO` 标签 (`comboText`)。
因为数字位更宽，而且可以做成：

- 有连击：`123  +12ms`
- 无连击：`+12ms`

这样可读性最好。
