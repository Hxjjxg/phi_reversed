# Phigros Note Textures and HitEffect Analysis & Hook Report

Based on the source code disassembly of `dump_android.cs` (or `dump.cs`) and IDA Pro (mcp) analysis, we have outlined the appearance logic of the four Note types—Tap (Click), Drag, Hold, and Flick—as well as the hit effects generated after they are struck, and the trigger locations of their particles.

## 1. Core Reference Function List and RVAs
In reverse analysis, the following core lifecycle and judgment functions are the key to controlling note generation, texture allocation, and hit effect playback:

| Class Name | Method Name | RVA (Relative Virtual Address) | Purpose Description |
|:---:|:---|:---|:---|
| **LevelControl** | `Awake()` | `0x239a63c` | Level master control initialization; saves the root classes for global note appearance textures and hit effect prefabs. |
| **LevelControl** | `Start()` | `0x239a874` | Level startup coroutine (the actual MoveNext logic is located at `0x239d300`). |
| **JudgeLineControl** | `Start()` | `0x2398c80` | Judgment line initialization; caches the Sprite references for each note. |
| **JudgeLineControl** | `CreateNote(...)` | `0x239739c` | Instantiates specific single notes on the corresponding judgment line. |
| **ScoreControl** | `Perfect(...)` | `0x1e98d04` | Method triggered upon a Perfect judgment; plays the hit effect at specified coordinates. |
| **ScoreControl** | `Good(...)` | `0x1e98b5c` | Method triggered upon a Good judgment; plays the corresponding colored effect. |
| **ClickControl** | `Start()` / `Judge()` | `0x1f3a3b8` / `0x1f39e64` | Tap note initialization and main body collision judgment. |
| **DragControl** | `Start()` / `Judge()` | `0x1f4d084` / `0x1f4cd60` | Drag note initialization and main body collision judgment. |
| **FlickControl** | `Start()` / `Judge()` | `0x2137340` / `0x2136fdc` | Flick note initialization and main body collision judgment. |
| **HoldControl** | `Start()` / `Judge()` | `0x2147aa8` / `0x21474b8` | Hold note initialization and strike holding judgment. |

## 2. Core Field List and Memory Offsets
The related classes and memory offsets used to store "Textures (HL)" and "Effect Prefabs (GameObject)" are as follows. By utilizing these offsets, you can obtain or replace the corresponding pointer locations at runtime.

### `LevelControl` Class
*(As the most comprehensive carrier for resource storage, it is most suitable for global replacement)*
- `ClickHL` : `0x58` (Reference to Tap's base/highlight texture)
- `HoldHL0` : `0x60` (Reference to Hold's top texture)
- `DragHL` : `0x70` (Reference to Drag's texture)
- `FlickHL` : `0x78` (Reference to Flick's texture)
- `perfectJudge` : `0x80` (GameObject/ParticleSystem prefab for the Perfect effect)
- `goodJudge` : `0x88` (Prefab for the Good effect)

### `ScoreControl` Class
*(Class responsible for calculating scores and actually triggering the effects)*
- `perfectJudge`: `0x18` 
- `goodJudge`: `0x20` 

### `JudgeLineControl` Class
*(Management instance for a single judgment line; assigns textures to individual notes when generated)*
- `ClickHL`: `0x38`
- `HoldHL0`: `0x40`
- `DragHL`: `0x50`
- `FlickHL`: `0x58`

### `UiChange` Class
*(UI Control class; some rendering re-definitions will also use this)*
- `ClickHL`: `0x38`
- `HoldHL0`: `0x40`
- `DragHL`: `0x50`
- `FlickHL`: `0x58`
- `perfectJudge`: `0x60`
- `goodJudge`: `0x68`

---

## 3. Analysis Report and Hook Strategies

### 3.1 Note Logic Control and Type Differentiation
In the code implementation, Phigros does not merge the so-called "Notes" into a universal base class; instead, it separates them into `ClickControl` (representing Tap), `DragControl`, `HoldControl`, and `FlickControl` to handle them individually. Each class contains its own `Start()` initialization and `Judge()` for various strike logics.
To modify the note form on a specific single trajectory, you can intercept the `Start` of the respective XXXControl.

### 3.2 Appearance and Texture (Sprite) Overriding
The base textures of all notes and highlight effects in the game are distributed by injecting global references such as `ClickHL` and `DragHL`.
**Recommended Solution (Replacing Textures):**
1. Gain Hook control of `LevelControl.Awake` (`0x239a63c`).
2. After this function has executed, access the specified offsets of the `LevelControl` instance (e.g., `0x58` to `0x78`).
3. Use the Unity API to replace these fields—which store the original Material/Sprite objects—with your own custom loaded textures (Texture2D / Sprite).
4. If you encounter situations where delayed loading prevents it from taking effect, you can use `JudgeLineControl.Start()` for replacement and overriding.

### 3.3 Hit Effect and Particle System Interception
In the reverse-engineered code for `ScoreControl.Perfect` (`0x1e98d04`) via IDA, the following declaration pattern can be found:
```c
__int64 __fastcall Perfect(__int64 ScoreControl_inst, char a2, long double a3, float a4, long double position_vector, long double a6, long double a7);
```
When these judgments are triggered, the function receives a spatial world coordinate point from where the strike event occurred, then instantiates or refreshes the `perfectJudge` / `goodJudge` effect object located at the `ScoreControl` offsets `0x18` or `0x20`.
The behavior of the post-hit effect scattering randomly is intrinsic to the parameters of the particle system itself (emitter Shape / initial velocity, and other Unity particle lifecycle settings); directly modifying the code for this has weak significance.

**Recommended Solution (Modifying Post-Hit Effects and Particles):**
1. **Replace the Native Particle System:** During game initialization (or `LevelControl.Awake`), directly retrieve the `GameObject` at offset `0x80` (`perfectJudge`). Extract the attached `ParticleSystem` component, modify its `MainModule` texture, and set the `StartColor`, emission speed, and scattering angle. This bypasses the need to alter the trigger code while still changing the scattering behavior.
2. **Complete Effect Hijacking:** If you wish to completely replace the native effect with your own set of customized effects, immediately Hook `ScoreControl.Perfect` (`0x1e98d04`) and `ScoreControl.Good` (`0x1e98b5c`). Read the passed environment parameters and the world coordinate `Vector3` (corresponding to those long double precision float parameters), then disable the original function's execution logic. At this position, instantiate a custom `GameObject` that you prepared in advance, which encapsulates your specific textures and animated scattering effects.

## 4. Summary
- **Replacing Note Textures:** Hook `0x239a63c` or `0x2398c80`, and use Unity reflection to swap the corresponding textures at their Field memory offsets.
- **Replacing Judgment System Particles:** Hook `0x1e98d04` and `0x1e98b5c` to intercept effect events and process them manually, or directly intervene with the GameObject saved at `LevelControl` offsets `0x80`/`0x88` to perform object overriding.
