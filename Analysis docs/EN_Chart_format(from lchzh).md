---
# Phigros Chart Format Explanation

Phigros charts use the **JSON** format and can be written using any text editor.
---

# Concepts

⚠ **WARNING**

The following concepts are defined by the author simply to facilitate understanding, and do not represent official definitions.

We agree that:

* **px** is the pixel unit, **W** is the screen width, **H** is the screen height.
* **X**: Horizontal unit length
  `1 X = 0.05625 W = 108 px (1920×1080)`
  
  * It is the distance unit for `Note.positionX`.
* **Y**: Vertical unit length
  `1 Y = 0.6 H = 648 px (1920×1080)`
  
  * It is the distance unit for `Note.floorPosition` and speed events.
* **BPM**: Beats Per Minute, i.e., `JudgeLine.bpm`.
* **T**: Unit time
  
  ```
  1 T = 1.875 / BPM s
  ```
  
  Equivalent to a **128th note**.
  
  * It is the time unit for `Note.time`, `Note.holdTime`, and various events.

---

# Structure

## Root structure `root`

* **formatVersion int**: Format version, currently available values are **1** and **3**.

This value currently only affects how coordinates are read for judge line move events. Different values correspond to different coordinate reading methods.

* **When the value is 1**
  
  The bottom-left corner of the screen is used as the coordinate origin,
  to the right is the **positive x-axis direction**, and upwards is the **positive y-axis direction**.
  The top-right corner coordinates are **(880, 520)**.
  
  The `start` and `end` of the event are:
  
  ```
  (1000x + y)
  ```
* **When the value is 3**
  
  The bottom-left corner of the screen is used as the coordinate origin,
  to the right is the **positive x-axis direction**, and upwards is the **positive y-axis direction**.
  The top-right corner coordinates are **(1, 1)**.
  
  Event parameters:
  
  ```
  start  = x
  end    = x
  start2 = y
  end2   = y
  ```

---

<details>
<summary>You know too much</summary>

When the value is not 1 or 3, the center of the screen is used as the coordinate origin, to the right is the positive x-axis direction, and upwards is the positive y-axis direction, the unit length in both directions is 0.1H. The start and end of the event are x, and start2 and end2 are y.

</details>

---

* **offset float**: Chart offset (unit: seconds).
  
  * When the value is non-negative, the music starts immediately, and the chart is delayed by the absolute value of `offset` seconds.
  * So far, the game itself has never had a chart with a negative `offset`.

---

* **judgeLineList Array<JudgeLine>**: Judge line list.

---

## TIP

The following properties existed in the past:

* **numOfNotes int**: Total number of notes, involved in Score and Acc calculation.

Version `v2.5.0` and subsequent versions removed this attribute. The total number of notes is instead calculated in real-time by the chart (needs verification).

---

# Judge Line JudgeLine

* **bpm float** : Beats Per Minute, determines the **T** time value unit of the judge line.
* **notesAbove Array<Note>** : The list of notes above the judge line.
* **notesBelow Array<Note>** : The list of notes below the judge line.
* **speedEvents Array<SpeedEvent>** : The list of speed events for the judge line.
* **judgeLineDisappearEvents Array<JudgeLineEvent>** : The list of disappear events for the judge line.
* **judgeLineMoveEvents Array<JudgeLineEvent>** : The list of move events for the judge line.
* **judgeLineRotateEvents Array<JudgeLineEvent>** : The list of rotate events for the judge line.

---

## TIP

The following properties existed in the past:

* **numOfNotes int** : Total number of notes for the judge line.
  
  * This value is equal to the sum of the array lengths of **notesAbove** and **notesBelow**.
* **numOfNotesAbove int** : The number of notes above the judge line.
  
  * This value is equal to the array length of **notesAbove**.
* **numOfNotesBelow int** : The number of notes below the judge line.
  
  * This value is equal to the array length of **notesBelow**.

These properties are not used when loading charts.

**v2.5.0 and subsequent versions removed these properties.**

---

# Note Note

* **type int** : The type of note, currently available values are **1 2 3 4**.
  
  * **1 : Tap note**, tap them at the judgment time.
  * **2 : Drag note**, hold them at the judgment time, no need to tap.
  * **3 : Hold note**, tap and hold at the judgment time until the note disappears.
  * **4 : Flick note**, flick in any direction at the judgment time, no need to tap.
  * Any other values appear invisible and unjudgable.

---

* **time int** : Judgment time, unit **T**.

---

* **positionX float** : The horizontal position of the note from the center of the judge line, unit **X**.
  
  * A value of **1** is often used for clock effects.

---

* **holdTime int** : The hold time of the note, unit **T**.
  
  * For non-**Hold** notes, this value is meaningless and is always **0** in official charts.
  * For **Hold** notes, the note is invisible when this value is **0**. In official charts, it is always greater than **0**.
  * Even though this value contains **.0** in most official charts, looking like a float, it is actually still read as an integer.

---

* **speed float** : The speed multiplier of the note, unitless.
  
  * For **Hold notes**, the speed multiplier of the Hold head is always **1**. This property indicates **the speed multiplier of the Hold tail when hit**:
  
  Hold length calculation:

[
d = (\eta \cdot t_H \cdot \frac{1.875}{BPM}) , Y
]

Where:

* ( \eta ) = speed
* ( t_H ) = holdTime

Usually equal to the real-time speed of the judge line at the **judgment time**, to ensure that the hold tail speed when hit is the same as before hitting.

---

* **floorPosition**

  * **floorPosition float**: The initial vertical position of the note from the center of the judge line, unit **Y**.
  * Usually equal to the real-time vertical position of the judge line at the **judgment time**, to ensure that it accurately overlaps the judge line at the judgment time.

---

# Speed Event SpeedEvent

* **startTime int**: Event start time, unit **T**.
* **endTime int**: Event end time, unit **T**.
* **value float**: Speed of the event, unit **Y/s**.

---

## TIP

The following properties existed in the past:

When **formatVersion is 3:**

* **floorPosition float**: The vertical position at the start time of the event, unit **Y**.

This property is not used when loading charts, but is **recalculated** based on other properties (values should be equal).

**v2.5.0 and subsequent versions removed this property.**

---

# Judge Line Event JudgeLineEvent

* **startTime int**: Event start time, unit **T**.
* **endTime int**: Event end time, unit **T**.

The remaining properties vary depending on the event type.

---

## For Judge Line Disappear Events

* **start float**: The opacity at the event start time.
* **end float**: The opacity at the event end time.
* Values **≤ 0** indicate completely transparent.
* Values **≥ 1** indicate completely opaque.

---

## For Judge Line Move Events

### When formatVersion is 1

* **start int**: The position at the event start time.
* **end int**: The position at the event end time.

---

### When formatVersion is 3

* **start float**: The **horizontal position** at the event start time.
* **end float**: The **horizontal position** at the event end time.
* **start2 float**: The **vertical position** at the event start time.
* **end2 float**: The **vertical position** at the event end time.

---

## For Judge Line Rotate Events

* **start float**: The rotation angle at the event start time.
* **end float**: The rotation angle at the event end time.

Values indicate the **counter-clockwise rotation angle (unit: degrees)**.

---