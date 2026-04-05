---
# Phigros 谱面格式说明

Phigros 谱面采用 **JSON** 格式，可以使用任何文本编辑器进行编写。
---

# 概念

⚠ **WARNING**

以下概念为笔者设定仅方便理解，不代表官方定义。

我们约定：

* **px** 为像素单位，**W** 为画面宽度，**H** 为画面高度。
* **X**：水平单位长度
  `1 X = 0.05625 W = 108 px (1920×1080)`
  
  * 是 `Note.positionX` 的距离单位。
* **Y**：垂直单位长度
  `1 Y = 0.6 H = 648 px (1920×1080)`
  
  * 是 `Note.floorPosition` 和速度事件的距离单位。
* **BPM**：每分钟节拍数（Beats Per Minute），即 `JudgeLine.bpm`。
* **T**：单位时间
  
  ```
  1 T = 1.875 / BPM s
  ```
  
  相当于 **128 分音符**。
  
  * 是 `Note.time`、`Note.holdTime` 和各种事件的时间单位。

---

# 结构

## 根结构 `root`

* **formatVersion int**：格式版本，目前可用的值为 **1** 和 **3**。

该值目前只影响判定线移动事件的坐标读取方式，不同的值对应不同的坐标读取方式。

* **值为 1 时**
  
  将画面左下角作为坐标原点，
  向右为 **x 轴正方向**，向上为 **y 轴正方向**，
  右上角坐标为 **(880, 520)**。
  
  事件的 `start` 和 `end` 为：
  
  ```
  (1000x + y)
  ```
* **值为 3 时**
  
  将画面左下角作为坐标原点，
  向右为 **x 轴正方向**，向上为 **y 轴正方向**，
  右上角坐标为 **(1, 1)**。
  
  事件参数：
  
  ```
  start  = x
  end    = x
  start2 = y
  end2   = y
  ```

---

<details>
<summary>你知道的太多了</summary>

值不为1或3时，将画面中心作为坐标原点，向右为x 轴正方向，向上为y 轴正方向，两个方向上的单位长度均为 0.1H，事件的 start 和 end 为 x，start2 和 end2 为 y。

</details>

---

* **offset float**：谱面偏移（单位：秒）。
  
  * 值为非负数时，音乐立即开始，谱面延迟 `offset` 的绝对值秒开始。
  * 目前为止，游戏本体从未出现 `offset` 为负数的谱面。

---

* **judgeLineList Array<JudgeLine>**：判定线列表。

---

## TIP

过去还存在以下属性：

* **numOfNotes int**：音符总数，参与分数与 Acc 计算。

`v2.5.0` 及后续版本移除了这个属性，音符总数转而通过谱面实时计算（需要验证）。

---

# 判定线 JudgeLine

* **bpm float** ：每分钟节拍数 (Beats Per Minute)，确定了判定线的单位 **T** 时值。
* **notesAbove Array<Note>** ：判定线上面的音符列表。
* **notesBelow Array<Note>** ：判定线下面的音符列表。
* **speedEvents Array<SpeedEvent>** ：判定线的速度事件列表。
* **judgeLineDisappearEvents Array<JudgeLineEvent>** ：判定线的消失事件列表。
* **judgeLineMoveEvents Array<JudgeLineEvent>** ：判定线的移动事件列表。
* **judgeLineRotateEvents Array<JudgeLineEvent>** ：判定线的旋转事件列表。

---

## TIP

过去还存在以下属性：

* **numOfNotes int** ：判定线的音符总数。
  
  * 该值等于 **notesAbove** 和 **notesBelow** 的数组长度之和。
* **numOfNotesAbove int** ：判定线上面的音符数目。
  
  * 该值等于 **notesAbove** 的数组长度。
* **numOfNotesBelow int** ：判定线下面的音符数目。
  
  * 该值等于 **notesBelow** 的数组长度。

谱面读取时不会使用这些属性。

**v2.5.0 及后续版本移除了这些属性。**

---

# 音符 Note

* **type int** ：音符的类型，目前可用的值为 **1 2 3 4**。
  
  * **1 ：Tap 音符**，在判定时刻点击它们。
  * **2 ：Drag 音符**，在判定时刻按住它们，无需点击。
  * **3 ：Hold 音符**，在判定时刻点击并长按直至音符消失。
  * **4 ：Flick 音符**，在判定时刻向任意方向滑动，无需点击。
  * 其他值均表现为不可见也不可判定。

---

* **time int** ：判定时刻，单位 **T**。

---

* **positionX float** ：音符距离判定线中心的水平位置，单位 **X**。
  
  * 值为 **1** 时常用于时钟效果。

---

* **holdTime int** ：音符的长按时间，单位 **T**。
  
  * 对于非 **Hold** 音符，该值无意义，官谱内恒为 **0**。
  * 对于 **Hold** 音符，该值为 **0** 时音符不可见，官谱内恒大于 **0**。
  * 即使大部分官谱中该值包含 **.0**，看起来像是浮点数，实际仍以整数读取。

---

* **speed float** ：音符的速度倍率，无单位。
  
  * 对于 **Hold 音符**，Hold 头速度倍率恒为 **1**，该属性表示 **打击时 Hold 尾的速度倍率**：
  
  Hold 长度计算：

[
d = (\eta \cdot t_H \cdot \frac{1.875}{BPM}) , Y
]

其中：

* ( \eta ) = speed
* ( t_H ) = holdTime

通常与判定线在**判定时刻的实时速度**相等，确保打击时 Hold 尾速度与打击前相同。

---

* **floorPosition**

  * **floorPosition float**：音符距离判定线中心的初始垂直位置，单位 **Y**。
  * 通常与判定线在**判定时刻的实时垂直位置**相等，确保在判定时刻恰好与判定线重合。

---

# 速度事件 SpeedEvent

* **startTime int**：事件开始时刻，单位 **T**。
* **endTime int**：事件结束时刻，单位 **T**。
* **value float**：事件的速度，单位 **Y/s**。

---

## TIP

过去还存在以下属性：

当 **formatVersion 为 3 时：**

* **floorPosition float**：事件开始时刻的垂直位置，单位 **Y**。

谱面读取时不会使用这个属性，而会根据其它属性**重新计算**（数值上应该相等）。

**v2.5.0 及后续版本移除了这个属性。**

---

# 判定线事件 JudgeLineEvent

* **startTime int**：事件开始时刻，单位 **T**。
* **endTime int**：事件结束时刻，单位 **T**。

其余属性根据事件类型不同而不同。

---

## 对于判定线的消失事件

* **start float**：事件开始时刻的不透明度。
* **end float**：事件结束时刻的不透明度。
* 值 **≤ 0** 表示完全透明
* 值 **≥ 1** 表示完全不透明

---

## 对于判定线的移动事件

### formatVersion 为 1 时

* **start int**：事件开始时刻的位置
* **end int**：事件结束时刻的位置

---

### formatVersion 为 3 时

* **start float**：事件开始时刻的**水平位置**
* **end float**：事件结束时刻的**水平位置**
* **start2 float**：事件开始时刻的**垂直位置**
* **end2 float**：事件结束时刻的**垂直位置**

---

## 对于判定线的旋转事件

* **start float**：事件开始时刻的旋转角度
* **end float**：事件结束时刻的旋转角度

值表示**逆时针旋转的角度（单位：度）**。

---

