# 存档 / 云存档 / 版本校验分析

基于当前 IDA 会话中的 iOS `UnityFramework`，并结合 `dump_ios.cs` 交叉确认。本文优先记录 iOS 地址；Android 旧结论如果存在，一般只差地址，不差逻辑。

## 结论先行

1. 日常运行时的“本地存档”不是单个 JSON 文件，而是 `PlayerPrefs` 键值存储。
2. `PlayerPrefs` 的键名和字符串值都会先经过 `SaveManagement` 加密后再写入；旧版本兼容路径还保留了 DES。
3. 云存档不是直接上传 `PlayerPrefs`，而是先把 5 个 `ISaveModule` 导出成 5 个二进制文件，再打成 zip 上传。
4. 每个模块文件的格式都是：`1 byte 模块版本` + `AES/AES2 加密后的模块二进制正文`。
5. 云端摘要 `CloudSaveSummary` 不是 JSON，而是 `base64(二进制结构)`。
6. “高版本云存档不能覆盖低版本本地” 的限制真实存在，判定点在 `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`：
   - `cloud.SaveVersion > local.SaveVersion`
   - 或 `cloud.GameVersion > local.GameVersion`
   任一成立就直接弹“需要更新”的提示，不进入选择本地/云端覆盖的弹窗。

## 一、本地运行时存档：PlayerPrefs + SaveManagement

### 1.1 `SaveManagement` 负责统一加解密

- `SaveManagement$$SaveInt` `0x11DF814`
  - 先 `Encrypt(keyName)`。
  - 再把值转成字符串，`Encrypt(valueString)`。
  - 最终调用 `UnityEngine.PlayerPrefs.SetString`。
- `SaveManagement$$LoadString` `0x11E04D0`
  - 先尝试新方案：`Encrypt(key)` + `Decrypt(value)`。
  - 如果新键不存在，则走旧兼容方案：`EncryptDES(key)` + `DecryptDES(value)`。
  - 读到旧格式后，会立刻迁移为新 AES 格式并重写回 `PlayerPrefs`。

也就是说，本地活跃存档的核心形态是：

```text
PlayerPrefs[
  AES(原始键名)
] = AES(原始字符串值)
```

布尔、整数、日期、字符串最终都被包装进这个体系里。

### 1.2 新旧加密方案

#### 新字符串加密

- `SaveManagement$$Encrypt` `0x11DEFBC`
- `SaveManagement$$Decrypt` `0x11DFD4C`

流程：

1. `SaveManagement` 静态初始化时创建 `aes`。
2. Key 和 IV 不是直接明文使用，而是：
   - 先取 ASCII 字节；
   - 再走 `BinaryUtils$$LoopReverseXor` `0x116A460`。
3. 最终用 AES + `CryptoStream` 对字符串进行加解密。
4. 字符串层最终存储为 base64。

静态初始化见 `SaveManagement$$.cctor` `0x11E0B18`：

- `encryptKey` 字符串：`"PGRS"`
- `aes` Key 源字符串：`"Phigros.enc.j57vnvr8wlZssXM7eWpa"`，经 `LoopReverseXor` 处理后作为真正 Key
- `aes` IV 源字符串：`"Q4zHm5vUEMJJ3iS9"`，经 `LoopReverseXor` 处理后作为真正 IV

#### 旧字符串兼容加密

- `SaveManagement$$EncryptDES` `0x11DF490`
- `SaveManagement$$DecryptDES` `0x11DFA74`

特点：

- 使用 `DESCryptoServiceProvider`
- Key/IV 都直接来自 `Unicode("PGRS")`
- 只用于兼容旧存档读取，不是当前主路径

#### 二进制模块加密

当前云存档模块正文用的是 `aes2`：

- `SaveManagement$$Encrypt2` `0x11E1624`
- `SaveManagement$$Decrypt2` `0x11E1B4C`

旧版模块正文兼容路径用的是 `aes`：

- `SaveManagement$$Encrypt_18746592` `0x11E0CE0`
- `SaveManagement$$Decrypt_18747912` `0x11E1208`

`aes2` 初始化同样在 `SaveManagement$$.cctor` `0x11E0B18`：

- `aes2` Key：base64 解码 `"6Jaa0qVAJZuXkZCLiOa/Ax5tIZVu+taKUN1V1nqwkks="`
- `aes2` IV：base64 解码 `"Kk/wisgNYwcAV8WVGMgyUw=="`

## 二、云存档封装：5 个模块文件 + zip

### 2.1 打包入口

- `CloudSaveManager$$SaveToFolder` `0x117E22C`

逻辑：

1. 构造 5 个 `ISaveModule` 实例：
   - `SettingsSaveModule`
   - `UserSaveModule`
   - `GameProgressSaveModule`
   - `GameRecordSaveModule`
   - `GameKeySaveModule`
2. 逐个执行 `Apply()`，从当前内存 / PlayerPrefs 拉取状态。
3. 逐个执行 `Serialize()`，得到模块正文二进制。
4. 对正文执行 `SaveManagement.Encrypt2`。
5. 文件写出格式：
   - 第 1 字节：模块版本号，即 `module.Version`
   - 后续字节：`Encrypt2(serialized_bytes)`
6. 文件名由 `module.Name` 决定。

### 2.2 解包入口

- `CloudSaveManager$$LoadFromFolder` `0x117E7A4`

逻辑：

1. 同样先构造这 5 个 `ISaveModule`。
2. 对每个模块文件：
   - 读第 1 字节作为模块版本；
   - 读剩余字节作为加密正文；
   - 如果 `saveVersion >= 2`，走 `SaveManagement$$Decrypt2` `0x11E1B4C`
   - 否则走 `SaveManagement$$Decrypt_18747912` `0x11E1208`
   - 再执行 `module.LoadFromBinary(versionByte, decryptedBytes)`
3. 之后会保留若干本地 PlayerPrefs 项，再 `DeleteAll()`，再把模块 `Apply()` 回当前本地环境。

这说明：

- 模块文件本身不自带“总存档版本”，只自带“模块版本”。
- “总存档版本”来自外层传入的 `saveVersion`，也就是 `CloudSaveSummary.SaveVersion`。
- `saveVersion` 主要决定使用旧 AES 还是新 AES2 解密模块正文。

### 2.3 zip 只是外层容器

下载和上传都把模块目录再包成 zip：

- 上传时：`CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`
  - `SaveToFolder(path)`
  - `ZipFile.CreateFromDirectory(...)`
  - `TapGameSave.set_GameFilePath(...)`
  - `TapGameSave.Save()`
- 下载时：`CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C`
  - `WebClient.DownloadFile(url, zipPath)`
  - `ZipFile.ExtractToDirectory(zipPath, folderPath)`
  - `LoadFromFolder(folderPath, loadSettings, saveVersion)`

## 三、模块清单、文件名、版本与字段

### 3.1 `SettingsSaveModule`

- 类定义：`dump_ios.cs:599333`
- 文件名：`settings`
- `Name`：`SettingsSaveModule$$get_Name` `0x11E943C`
- `Version = 1`：`SettingsSaveModule$$get_Version` `0x11E9484`
- 关键字段：
  - `deviceName`
  - `bright`
  - `musicVolume`
  - `effectVolume`
  - `hitSoundVolume`
  - `chordSupport`
  - `fcAPIndicator`
  - `soundOffset`
  - `noteScale`
  - `enableHitSound`
  - `lowResolutionMode`
- 关键函数：
  - `Apply` `0x11E948C`
  - `LoadFromBinary` `0x11E9614`
  - `LoadV1` `0x11E96E4`
  - `LoadFromLocal` `0x11E989C`
  - `Serialize` `0x11E99F8`

### 3.2 `UserSaveModule`

- 类定义：`dump_ios.cs:599380`
- 文件名：`user`
- `Name`：`UserSaveModule$$get_Name` `0x1211728`
- `Version = 1`：`UserSaveModule$$get_Version` `0x1211770`
- 字段：
  - `selfIntro`
  - `avatar`
  - `background`
  - `showPlayerId`
- 关键函数：
  - `Apply` `0x1211778`
  - `LoadFromBinary` `0x1211838`
  - `LoadV1` `0x1211908`
  - `LoadFromLocal` `0x12119A0`
  - `Serialize` `0x1211A90`

### 3.3 `GameProgressSaveModule`

- 类定义：`dump_ios.cs:599103`
- 文件名：`gameProgress`
- `Name`：`GameProgressSaveModule$$get_Name` `0x119D99C`
- `Version = 4`：`GameProgressSaveModule$$get_Version` `0x119D9E4`
- 字段：
  - `isFirstRun`
  - `legacyChapterFinished`
  - `completed`
  - `songsUpdateInfo`
  - `challengeModeRank`
  - `money[4]`
  - `unlockFlagOfSpasmodic`
  - `unlockFlagOfIgallta`
  - `unlockFlagOfRrharil`
  - `flagOfSongRecordKey`
  - `flagOfSongRecordKeyTakumi`
  - `alreadyShowCollectionTip`
  - `alreadyShowAutoUnlockINTip`
  - `randomVersionUnlocked[]`
  - `chapter8UnlockBegin`
  - `chapter8UnlockSecondPhase`
  - `chapter8Passed`
  - `chapter8SongUnlocked[]`
- 版本分发：
  - `GameProgressSaveModule$$LoadFromBinary` `0x119E4F0`
  - `LoadV1` `0x119E634`
  - `LoadV2` `0x119E830`
  - `LoadV3` `0x119E8DC`
  - `LoadV4` `0x119E9E0`
- 序列化组装顺序：
  - `SerializeGameProgressKeys` `0x119F638`
  - `SerializeMoneyAmount` `0x119F798`
  - `SerializeChapter567Keys` `0x119F850`
  - `SerializeSongUnlockKeys` `0x119F8E0`
  - `SerializeRandomUnlockKeys` `0x119F948`
  - `SerializeChapter8Keys` `0x119F9FC`
  - `SerializeTakumiATUnlockKey` `0x119FB04`

这也是当前大部分特殊曲、章节解锁、挑战 Rank、Chapter8 状态位的落盘位置。

### 3.4 `GameRecordSaveModule`

- 类定义：`dump_ios.cs:599296`
- 文件名：`gameRecord`
- `Name`：`GameRecordSaveModule$$get_Name` `0x119FFB0`
- `Version = 1`：`GameRecordSaveModule$$get_Version` `0x119FFF8`
- 字段：
  - `Dictionary<string, byte[]> data`
- 关键函数：
  - `Apply` `0x11A0000`
  - `LoadFromBinary` `0x11A03D4`
  - `LoadV1` `0x11A04A4`
  - `LoadFromLocal` `0x11A060C`
  - `Serialize` `0x11A0C3C`

序列化格式见 `GameRecordSaveModule$$Serialize` `0x11A0C3C`：

1. `varint(count)`
2. 对每条记录写：
   - `BinaryUtils.GetSaveByteArray(key)`，即 `varint(len) + utf8(key)`
   - `1 byte value_len`
   - `value_bytes`

说明它本质是“歌曲/难度记录字典”的自定义二进制，不是 JSON。

### 3.5 `GameKeySaveModule`

- 类定义：`dump_ios.cs:599035`
- 文件名：`gameKey`
- `Name`：`GameKeySaveModule$$get_Name` `0x119C674`
- `Version = 3`：`GameKeySaveModule$$get_Version` `0x119C6BC`
- 字段：
  - `Dictionary<string, List<byte>> keys`
  - `lanotaReadKeys`
  - `camelliaReadKey`
  - `sideStory4BeginReadKey`
  - `oldScoreClearedV390`
- 关键函数：
  - `Apply` `0x119C6C4`
  - `LoadFromBinary` `0x119CA54`
  - `LoadV1` `0x119CB6C`
  - `LoadV2` `0x119CD58`
  - `LoadV3` `0x119CDAC`
  - `LoadFromLocal` `0x119CE14`
  - `Serialize` `0x119D6A8`

序列化格式见 `GameKeySaveModule$$Serialize` `0x119D6A8`：

1. `varint(count)`
2. 对每条记录写：
   - `1 byte key_utf8_len`
   - `key_utf8_bytes`
   - `1 byte list_len`
   - `list_bytes`
3. 末尾再附加 4 个单字节字段：
   - `lanotaReadKeys`
   - `camelliaReadKey`
   - `sideStory4BeginReadKey`
   - `oldScoreClearedV390`

## 四、基础二进制工具格式

### 4.1 字符串

- `BinaryUtils$$GetSaveByteArray` `0x116A2A8`
  - 先 UTF-8 编码
  - 再写 `varint(length)`
  - 最终格式：`varint(len) + utf8_bytes`
- `BinaryUtils$$GetString_18260892` `0x116A39C`
  - 先 `GetVarInt`
  - 再按 UTF-8 读固定长度

### 4.2 整数

- `BinaryUtils$$ToVarInt` `0x1169F14`
- `BinaryUtils$$GetVarInt_18260096` `0x116A080`

因此云存档模块正文和 `CloudSaveSummary` 都是“自定义二进制 + varint”，不是 JSON。

## 五、云摘要 `CloudSaveSummary`

### 5.1 结构定义

类定义见 `dump_ios.cs:598672`：

- `byte SaveVersion`
- `int GameVersion`
- `int ChallengeModeRank`
- `float RankingScore`
- `string Avatar`
- `int[] Cleared`
- `int[] FullCombo`
- `int[] Phi`

四个难度标签在 `CloudSaveSummary$$.cctor` `0x11847B0` 初始化：

- `EZ`
- `HD`
- `IN`
- `AT`

### 5.2 本地生成摘要

- `CloudSaveSummary$$FromLocalSave` `0x11818CC`

逻辑：

1. 遍历所有歌曲与 4 个难度。
2. 从本地记录里统计：
   - `Cleared`：分数 `>= 820000`
   - `FullCombo`：`c > 0` 或 `score >= 1000000`
   - `Phi`：`score >= 1000000`
3. 从 `PlayerPrefs` 读取：
   - `ChallengeModeRank`，键名为 `ChallengeModeRank`
   - `Avatar`
4. 从 `GameInformation` 读取 `RankingScore`
5. 当前构造时默认值：
   - `SaveVersion = 6`
   - `GameVersion = 135`

### 5.3 摘要序列化格式

- `CloudSaveSummary$$Serialize` `0x1181E4C`
- `CloudSaveSummary$$Deserialize` `0x11843E0`

序列化顺序：

1. `1 byte SaveVersion`
2. `2 bytes ChallengeModeRank`
3. `4 bytes RankingScore(float)`
4. `varint GameVersion`
5. `BinaryUtils.GetSaveByteArray(Avatar)`
6. 4 组难度统计，每组 3 个 `int16`：
   - `Cleared[i]`
   - `FullCombo[i]`
   - `Phi[i]`
7. 整体再 `Convert.ToBase64String`

所以 `TapGameSave.Summary` 是：

```text
base64(
  save_version:u8
  challenge_rank:i16
  ranking_score:f32
  game_version:varint
  avatar:varint_len + utf8
  [EZ,HD,IN,AT] * (cleared:i16 + fc:i16 + phi:i16)
)
```

## 六、版本校验与覆盖限制

### 6.1 “高版本云存档不能下放到低版本” 的真实判定点

关键函数：

- `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`

核心逻辑片段：

1. 生成本地摘要：
   - `localSummary = CloudSaveSummary.FromLocalSave()`
2. 读取云端摘要：
   - `cloudSummary = CloudSaveSummary.Deserialize(TapGameSave.Summary)`
3. 直接比较：

```c
if (cloudSummary.SaveVersion > localSummary.SaveVersion
 || cloudSummary.GameVersion > localSummary.GameVersion)
{
    HideBackground();
    ShowOkMessageBox(syncFailedText, updateText);
    return false;
}
```

也就是说，限制并不是只看一个字段，而是同时看：

- `SaveVersion`
- `GameVersion`

任一云端更高，都不允许当前版本客户端下载覆盖。

### 6.2 兼容版本时的分支

如果版本兼容，`SyncSave` 才会继续：

1. 生成 `SelectSavePopup`
2. 左右展示本地摘要与云摘要：
   - `CloudSaveInfoDisplay$$SetInfo` `0x117D8E4`
3. 弹选择框：
   - `SelectSavePopup$$Show` `0x11E2A7C`
   - `KeepLocal` `0x11E2A68`
   - `KeepCloud` `0x11E2A74`
4. 用户选完后：
   - `keepLocal == true`：把本地重新打包上传到云端
   - `keepLocal == false`：调用 `CloudSaveManager$$LoadCloudSave` `0x117E074` 下载云端并覆盖本地

### 6.3 下载覆盖时，使用云摘要里的 `SaveVersion`

兼容版本且用户选择云端覆盖后，`SyncSave` 调用：

- `CloudSaveManager$$LoadCloudSave` `0x117E074`

传参里显式带入：

- `saveBaseTime = cloud.ModifiedAt`
- `saveVersion = cloudSummary.SaveVersion`

然后下载协程 `CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C` 最终执行：

- `LoadFromFolder(path, loadSettings, saveVersion)`

所以：

- 覆盖本地时，用的解密分支取决于云摘要 `SaveVersion`
- 当前高版本阻挡逻辑发生在下载前，不会进入 `LoadFromFolder`

## 七、静默同步冲突：`SaveConflict`

关键函数：

- `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`

逻辑：

1. 如果未登录，返回 `SilenceSyncResult.NotLoggedIn`
2. 拉取当前云存档 `TapSDKWrapper.QueryCloudSave`
3. 从本地 `PlayerPrefs` 读 `saveBaseTime`
   - 键名：`saveBaseTime`
4. 如果云端已有存档：
   - 取 `cloud.ModifiedAt`
   - 与本地保存的 `saveBaseTime` 做时间差
   - 若 `abs(diff) > 10ms`，直接返回 `SilenceSyncResult.SaveConflict`
5. 否则正常打包上传

这说明静默同步的冲突判定不是摘要版本，而是“你上传时认为自己基于的云端基线时间戳”是否还匹配。

## 八、补充：运行时关键键名

已经确认的几个关键明文键名：

- `ChallengeModeRank`
- `saveBaseTime`
- `lastSyncTime`

它们进入 `PlayerPrefs` 前仍会经过 `SaveManagement` 加密，不会以明文键名直接出现。

## 九、可直接使用的 Frida 确认脚本

下面脚本以 iOS `UnityFramework` 为基址，主要用于后续动态确认版本门槛与模块格式。

### 9.1 打印云摘要版本、游戏版本与统计

```javascript
function readIl2CppString(p) {
  if (p.isNull()) return null;
  const len = p.add(0x10).readU32();
  return p.add(0x14).readUtf16String(len);
}

function readI32Array(p) {
  if (p.isNull()) return null;
  const len = p.add(0x18).readU32();
  const out = [];
  let cur = p.add(0x20);
  for (let i = 0; i < len; i++) {
    out.push(cur.add(i * 4).readS32());
  }
  return out;
}

const base = Module.findBaseAddress("UnityFramework");
const deserialize = base.add(0x11843E0);

Interceptor.attach(deserialize, {
  onEnter(args) {
    this.base64 = readIl2CppString(args[0]);
  },
  onLeave(retval) {
    if (retval.isNull()) return;
    const saveVersion = retval.add(0x10).readU8();
    const gameVersion = retval.add(0x14).readS32();
    const challengeRank = retval.add(0x18).readS32();
    const rankingScore = retval.add(0x1C).readFloat();
    const avatar = readIl2CppString(retval.add(0x20).readPointer());
    const cleared = readI32Array(retval.add(0x28).readPointer());
    const fc = readI32Array(retval.add(0x30).readPointer());
    const phi = readI32Array(retval.add(0x38).readPointer());
    console.log("[CloudSaveSummary.Deserialize]");
    console.log("  input.base64 =", this.base64);
    console.log("  saveVersion =", saveVersion, "gameVersion =", gameVersion);
    console.log("  challengeRank =", challengeRank, "rks =", rankingScore);
    console.log("  avatar =", avatar);
    console.log("  cleared =", JSON.stringify(cleared));
    console.log("  fullCombo =", JSON.stringify(fc));
    console.log("  phi =", JSON.stringify(phi));
  }
});
```

### 9.2 确认下载覆盖时传入的 `saveVersion`

```javascript
function readIl2CppString(p) {
  if (p.isNull()) return null;
  const len = p.add(0x10).readU32();
  return p.add(0x14).readUtf16String(len);
}

const base = Module.findBaseAddress("UnityFramework");
const loadFromFolder = base.add(0x117E7A4);

Interceptor.attach(loadFromFolder, {
  onEnter(args) {
    console.log("[CloudSaveManager.LoadFromFolder]");
    console.log("  path =", readIl2CppString(args[0]));
    console.log("  loadSettings =", !!args[1].toInt32());
    console.log("  saveVersion =", args[2].toInt32());
  }
});
```

### 9.3 确认版本门槛触发时不会进入下载

```javascript
const base = Module.findBaseAddress("UnityFramework");
const loadCloudSave = base.add(0x117E074);

Interceptor.attach(loadCloudSave, {
  onEnter(args) {
    console.log("[CloudSaveManager.LoadCloudSave] called");
    console.log("  saveVersion =", args[4].toInt32());
  }
});
```

使用方式：

- 如果你故意让云端摘要的 `SaveVersion` 或 `GameVersion` 高于本地，再触发同步：
  - 应该先看到 `CloudSaveSummary.Deserialize` 日志
  - 但不会看到 `CloudSaveManager.LoadCloudSave` 被调用
  - 只会走“需要更新”的失败提示分支

## 十、当前仍建议动态确认的点

1. `GameProgressSaveModule.Serialize` 的逐字节布局虽然能从 helper 顺序确认，但如果要做离线重构工具，建议再 hook `Serialize` / `LoadV4` 实际 dump 原始字节。
2. `GameRecordSaveModule.data` 的 value 内容本身是 `byte[]`，其内部是否还嵌套二级结构，建议再结合某个具体歌曲记录动态验证。
3. `SaveManagement.aes2` 的 base64 Key/IV 已定位，若后续要写完整离线解包器，建议再用一份真实模块文件跑通一遍 `Encrypt2/Decrypt2` 往返测试。

## 关键地址速查

- `SaveManagement..cctor` `0x11E0B18`
- `SaveManagement.Encrypt` `0x11DEFBC`
- `SaveManagement.Decrypt` `0x11DFD4C`
- `SaveManagement.Encrypt2` `0x11E1624`
- `SaveManagement.Decrypt2` `0x11E1B4C`
- `CloudSaveSummary.FromLocalSave` `0x11818CC`
- `CloudSaveSummary.Serialize` `0x1181E4C`
- `CloudSaveSummary.Deserialize` `0x11843E0`
- `CloudSaveManager.SaveToFolder` `0x117E22C`
- `CloudSaveManager.LoadFromFolder` `0x117E7A4`
- `CloudSaveManager.LoadCloudSave` `0x117E074`
- `CloudSaveManager._LoadCloudSave_d__16.MoveNext` `0x117F99C`
- `CloudSaveManager._SilenceSyncSave_d__15.MoveNext` `0x1180E10`
- `CloudSaveManager._SyncSave_d__14.MoveNext` `0x11820F4`
- `SelectSavePopup.Show` `0x11E2A7C`
- `SelectSavePopup.KeepLocal` `0x11E2A68`
- `SelectSavePopup.KeepCloud` `0x11E2A74`
