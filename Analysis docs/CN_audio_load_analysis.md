

**结论**

音频加载链路和谱面文本的根本差异，不在于底层是不是都走 Addressables/AssetBundle，而在于“谁来等资源”。

谱面链路是在关卡启动协程里显式等待的，所以远程 bundle 慢 10 秒，LevelControl 也会卡 10 秒，等 TextAsset 真到手后再继续。这个结论和现有文档一致，入口状态机在 ；对应的完整启动逻辑我用 IDA 反编译确认了，函数是 LevelControl__Start_d__40_MoveNext，地址 0x239D7E0。
谱面链路是在关卡启动协程里显式等待的，所以远程 bundle 慢 10 秒，LevelControl 也会卡 10 秒，等 TextAsset 真到手后再继续。这个结论和现有文档一致，android 版入口状态机定义在 dump_android.cs 的 <Start>d__40，chartAssetRef 字段在 0x38 偏移；对应方法声明是 MoveNext RVA 0x239D300，见 dump_android.cs 第 300711 行到第 300732 行。

音频链路不是这样。LevelControl 在同一个启动协程里并没有等待音频准备完成，而只是把 musicAddressableKey 塞给 AddressableAudioSource.set_Clip，然后立刻继续后面的关卡初始化。AddressableAudioSource 自己内部再开一个协程去等 AudioClip。这一点在 dump_android.cs 第 304966 行开始的 AddressableAudioSource 类定义，以及 set_Clip RVA 0x1F94C58、SetClip(String) RVA 0x1F952E4、<SetClip>d__41.MoveNext RVA 0x1F96030 上都能对上。

**两条链怎么不同**

谱面文本这条链：

1. LevelControl.Start 持有 chartAssetRef，字段定义见 dump_android.cs 第 300720 行，类型是 AssetRef`1，也就是 AssetRef<TextAsset>。
2. 如果 chartAssetRef.obj 还没就绪，状态机会 yield AssetRef<TextAsset>.WaitForPrepare。
3. 等到 TextAsset 真拿到后，才去读 text，做 JsonUtility.FromJson，随后 SetInformation、SortForAllNoteWithTime，最后把 chartLoaded 置真。
4. 所以 chart 是“外层阻塞式等待”。

音频这条链：

1. LevelControl.Start 在反序列化 chart 后，直接调用 AddressableAudioSource_set_Clip，把 musicAddressableKey 交给播放器内部协程。
2. AddressableAudioSource.SetClip 内部确实也会拿 AssetStore.AssetRef<AudioClip>，如果 obj 还没准备好，也会 yield WaitForPrepare。这说明底层资源等待机制其实和 TextAsset 很像。
3. 但这个等待发生在 AddressableAudioSource 的私有协程里，不会阻塞 LevelControl.Start。
4. 等音频准备好的标志是 loadOver，字段定义见 dump_android.cs 第 304973 行；反编译里对应偏移 0x34，也就是我看到的加 52 那个字节。AddressableAudioSource.CurrentStatus 的 getter RVA 是 0x1F952A0，ClipLength 的 getter RVA 是 0x1F95274，PlayScheduled 的 RVA 是 0x1F959A8。

所以本质差异是：

谱面：关卡启动协程自己等完再继续。
音频：关卡启动协程不等，只是把加载任务派发出去。

**为什么远程 chart 能等 10 秒，远程音频不行**

问题出在 ProgressControl 的启动时序，不在 bundle redirect 本身。

ProgressControl 的关键字段在 dump_android.cs 第 301149 行到第 301168 行，其中 _playPrepared 偏移 0x7B，_volumeSet 偏移 0x7C，_startTime 偏移 0x8C。我反编译 ProgressControl.Update，RVA 是 0x207DE24，逻辑很清楚：

1. 它先用一个 _startTime 窗口决定什么时候开始播放，第一次通常是 当前时间 + 3 秒，某些引导分支是 +1.5 秒或 +5 秒。
2. 到了 _startTime - 1 秒，就无条件把 _playPrepared 设为真，并调用一次 PlayScheduled。
3. 到了 _startTime，就无条件把 _volumeSet 设为真，并把音量拉起来。
4. 这两个动作都是一次性的，没有“如果音频还没准备好，之后再补一次”的重试逻辑。

而 AddressableAudioSource 这边，只有等内部 SetClip 协程结束后，才会把 Unity AudioSource.clip 设上并把 loadOver 置真。对应的 Update RVA 是 0x1F9558C，<SetPlayFlag>d__44.MoveNext 的 RVA 是 0x1F96280。也就是说：

如果远程音频 bundle 下载时间大于 ProgressControl 给的这 1.5 到 5 秒启动窗口，那么：

1. PlayScheduled 会在音频还没 loadOver 的时候就被调用。
2. _playPrepared 和 _volumeSet 已经被置真。
3. 后面即使音频终于下载完成，也不会再重新走一次“预定播放”和“设置音量”的逻辑。
4. 结果就是 chart 已经正常加载，但音频错过了一次性启动窗口，关卡看起来像“带音频时加载失败”。

这和你的现象完全一致：

只挂 chart 远程 bundle 时，外层协程会一直等，所以 10 秒后还能正常继续。
再加音频远程 bundle 时，chart 还是会等到，但音频启动窗口已经错过了，所以后续无法正常进入播放态。

补充一组 android 版定位点，便于后续下断或写 hook：

1. LevelStartInfo.musicAddressableKey 字段：RVA 所在定义见 dump_android.cs 第 294867 行。
2. LevelStartInfo.chartAddressableKey 字段：dump_android.cs 第 294868 行。
3. LevelControl.<Start>d__40.MoveNext：0x239D300。
4. ProgressControl.Update：0x207DE24。
5. AddressableAudioSource.set_Clip：0x1F94C58。
6. AddressableAudioSource.SetClip：0x1F952E4。
7. AddressableAudioSource.<SetClip>d__41.MoveNext：0x1F96030。
8. AddressableAudioSource.Update：0x1F9558C。
9. AddressableAudioSource.PlayScheduled：0x1F959A8。
10. AddressableAudioSource.get_CurrentStatus：0x1F952A0。
11. AddressableAudioSource.get_ClipLength：0x1F95274。

**一句话判断**

不是“音频和文本走了不同的下载 API”，而是“文本在关卡主协程里等，音频只在播放器子协程里等；而 ProgressControl 又提前按固定时间窗触发一次性播放调度”。

**建议的修正方向**

1. 最稳的是改 ProgressControl.Update，让 _startTime 的计算或 PlayScheduled 的触发依赖 audioSource.loadOver，而不是只依赖 timeSinceLevelLoad。
2. 次优是拦截 PlayScheduled 前的分支：如果音频还没 loadOver，就不要把 _playPrepared 和 _volumeSet 置真，等 loadOver 后再触发一次。
3. 也可以在 AddressableAudioSource.SetClip 协程完成时补一次“如果关卡已经错过启动窗口，则立即修正 _startTime 或直接补播”。
