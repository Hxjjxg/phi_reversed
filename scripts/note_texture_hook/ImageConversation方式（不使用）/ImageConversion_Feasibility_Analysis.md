# Unity ImageConversion.LoadImage 贴图替换分析报告

## 1. 函数来源与定位
该方法最初是在逆向导出文件 `dump_android.cs` 中检索到的。它隶属于 Unity 引擎的图形加载模块 `UnityEngine.ImageConversionModule.dll`，类名为 `UnityEngine.ImageConversion`。

在 `dump_android.cs` 中相关的签名如下：
```csharp
// RVA: 0x1c1c420 VA: 0x754fd2d5a420
public static Boolean LoadImage(Texture2D tex, Byte[] data) { }

// RVA: 0x1c1c3c8 VA: 0x754fd2d5a3c8
public static Boolean LoadImage(Texture2D tex, Byte[] data, Boolean markNonReadable) { }
```

## 2. IDA 反编译细节
通过 ida-pro-mcp 对 `0x1c1c420` 及其底层重载 `0x1c1c3c8` 进行反编译，可以发现它们都不是用 IL2CPP 的 C# 层逻辑实现的，而是指向引擎底层（Engine Code）的 ICall（Internal Call）：

```c
__int64 __fastcall UnityEngine_LoadImage_1C1C420(__int64 a1, __int64 a2)
{
  void *v2; // x3
  v2 = off_448D770; /*0x1c1c434*/
  if ( !off_448D770 ) /*0x1c1c440*/
  {
    // 调用 IL2CPP api 动态解析底层 C++ 实现
    v2 = (void *)sub_11BFF44("UnityEngine.ImageConversion::LoadImage(UnityEngine.Texture2D,System.Byte[],System.Boolean)"); 
    off_448D770 = v2; 
  }
  return ((__int64 (__fastcall *)(__int64, __int64, _QWORD))v2)(a1, a2, 0); // 第三个参数 0 表示 markNonReadable = false
}
```
**分析：**
1. 该函数直接穿透到了 Unity 底层图形 API。
2. 它接收一个已存在的 `Texture2D` 对象指针和一个 `System.Byte[]`（PNG 或 JPG 数据的字节数组）的指针。
3. 它会将这个字节数组直接解析覆盖到旧的 `Texture2D` 内存中，完全不需要重新申请或者实例化复杂的 `Sprite`。

## 3. 该方案的可行性与潜在隐患评估

### ✅ 可行性 (为什么能达到我们的功能？)
该函数是 Unity 官方提供的动态更换贴图的合法途径。只要你有一个指向某个 `Texture2D` 的指针，调用该方法就能立刻改变该贴图的视觉渲染。
由于在 `LevelControl` 中定义了单纯的 `public Sprite ClickHL;`，我们可以直接提取它绑定的底图：
```javascript
const texture = Sprite_get_texture(clickHLSprite);
ImageConversion.LoadImage(texture, customPngBytes);
```
由于游戏引擎在下一帧绘制时，引用的依然是同一个 `Texture2D` 地址，因此它会被自动更新为新图案。此方法**避开了复杂的资源打包 (AssetBundle)，不再需要绕过 Addressables 系统，极其轻量化。**

### ⚠️ 潜在的严重隐患 (需要后续 Agent 注意)
虽然这个函数在技术上完全可行并且能替换图案，但针对 Phigros 等商业游戏结构，有一些风险情况：

1. **“图集 (Sprite Atlas) 灾难”**：
   如果开发组优化了内存，把 `ClickHL`、`DragHL`、甚至其它游戏 UI **打包到了同一张大图（Sprite Atlas / 图集）里**。那么当你调用 `Sprite.get_texture()` 获取底图，再用 `LoadImage` 强行覆盖时，**你覆盖的是整张图集**！
   - **后果**：新注入的图片会自动填满并强行扭曲整张大图集。结果不仅按键图案可能会错位或消失，连其他UI（如暂停按钮、生命条）也会全部破碎乱码。
   - **判断方法**：最好在下发修改前，先尝试输出原 `Texture2D` 的长宽或者是 `Sprite.get_rect()` 边界。如果取出来的 `Texture2D` 是诸如 2048x2048 的巨大正方形图，且该 Sprite Rect 仅占一小部分，说明有图集打包。此时决**不能**使用此方法。

2. **尺寸与贴图长宽比 (Aspect Ratio)**：
   `LoadImage` 函数内部会自动调用 `Texture2D.Resize`，这就意味着你的 PNG 是多大，这个底图就会变成多大。但原版 `Sprite` 实例在创建时设定了 `Rect` 和 `PixelsPerUnit`，如果新注入的文件比例与原本的图相差很大，会导致游戏内渲染严重变形或者包围盒（碰撞范围判断，如果有用到的话）视觉不匹。

3. **纹理格式不兼容**：
   部分 ASTC/ETC2 等硬件压缩的贴图如果在设置中未标记为 `Readable/Writable`，通过此 API 强行写入可能会抛出底层 Assertion 警告导致失效（尽管此底层 ICall 通常很霸道）。

## 4. 总结与后续动作
这个函数 **绝对可以达到目的**，前提是目标游戏对 `ClickHL`、`Drag` 这几个 Note 的处理是**散图（独立 Texture2D）**，而非合并在同一个 `SpriteAtlas` 里。

建议：在此基础上运行测试。如果发现会导致整个界面黑屏或 UI 全错位，那就确凿证明它们在被打包成了图集。此时就必须改用另一个方向——拦截 `AssetBundle.LoadFromFileAsync` 走重定向的方案。