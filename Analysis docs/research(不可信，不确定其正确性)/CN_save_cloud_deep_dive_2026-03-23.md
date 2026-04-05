# 存档 / 云存档 / 版本校验 首版笔记

基于当前 IDA 会话中的 iOS `UnityFramework`，以下地址均为 iOS / Mach-O ARM64。

## 1. SaveManagement 加解密链路

### 1.1 本地运行时存档不是单个 JSON，而是加密后的 PlayerPrefs

关键函数：

- `SaveManagement$$SaveInt` `0x11DF814`
- `SaveManagement$$LoadString` `0x11E04D0`
- `SaveManagement$$Encrypt` `0x11DEFBC`
- `SaveManagement$$Decrypt` `0x11DFD4C`
- `SaveManagement$$EncryptDES` `0x11DF490`
- `SaveManagement$$DecryptDES` `0x11DFA74`
- `SaveManagement$$.cctor` `0x11E0B18`

简明逻辑：

- `SaveManagement$$SaveInt(0x11DF814)` 会先对 `keyName` 调 `Encrypt`，再把整数转成字符串后再次 `Encrypt`，最后调 `UnityEngine.PlayerPrefs.SetString`。
- `SaveManagement$$LoadString(0x11E04D0)` 先尝试新格式：
  - `HasKey(AES(keyName))`
  - `GetString(AES(keyName))`
  - `AES 解密 value`
- 如果新格式不存在，则回退旧格式：
  - `HasKey(DES(keyName))`
  - `GetString(DES(keyName))`
  - `DES 解密 value`
  - 之后再迁移回新的 AES 格式。

因此本地活动存档真实形态可以概括为：

```text
PlayerPrefs[AES(keyName)] = AES(value_as_string)
```

### 1.2 AES / DES 参数来源

`SaveManagement$$.cctor(0x11E0B18)` 已确认：

- `encryptKey = "PGRS"`，供旧 DES 路径使用。
- `aes` 的 Key 来源字符串：`"Phigros.enc.j57vnvr8wlZssXM7eWpa"`
- `aes` 的 IV 来源字符串：`"Q4zHm5vUEMJJ3iS9"`
- 两者都先经 `BinaryUtils$$LoopReverseXor` `0x116A460` 处理，再写入 `Aes.Key/IV`。
- `SaveManagement$$EncryptDES(0x11DF490)` / `DecryptDES(0x11DFA74)` 使用 `DESCryptoServiceProvider`，Key/IV 直接来自 `Unicode("PGRS")`，仅用于旧存档兼容。

### 1.3 云存档模块正文的 AES2

关键函数：

- `SaveManagement$$Encrypt2` `0x11E1624`
- `SaveManagement$$Decrypt2` `0x11E1B4C`
- `SaveManagement$$Encrypt_18746592` `0x11E0CE0`
- `SaveManagement$$Decrypt_18747912` `0x11E1208`

简明逻辑：

- 云存档 5 个模块文件的正文当前主路径用 `aes2` 加解密。
- `CloudSaveManager$$LoadFromFolder(0x117E7A4)` 中：
  - `saveVersion >= 2` 时走 `Decrypt2`
  - `saveVersion < 2` 时走旧的 `Decrypt_18747912`
- `aes2` Key/IV 在 `SaveManagement$$.cctor(0x11E0B18)` 中由 base64 常量解码后写入。

## 2. CloudSaveManager 打包 / 解包

关键函数：

- `CloudSaveManager$$SaveToFolder` `0x117E22C`
- `CloudSaveManager$$LoadFromFolder` `0x117E7A4`
- `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`
- `CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C`

### 2.1 打包

`CloudSaveManager$$SaveToFolder(0x117E22C)` 已确认顺序：

1. 构造 5 个 `ISaveModule`：
   - `SettingsSaveModule`
   - `UserSaveModule`
   - `GameProgressSaveModule`
   - `GameRecordSaveModule`
   - `GameKeySaveModule`
2. 对每个模块调用 `Apply()` 从当前内存/PlayerPrefs 拉取状态。
3. 调 `Serialize()` 得到模块正文二进制。
4. 调 `SaveManagement$$Encrypt2` 加密正文。
5. 新建文件 `path + module.Name`。
6. 先写 1 字节 `module.Version`，再写加密正文。

单个模块文件物理格式因此是：

```text
u8 module_version
bytes encrypted_payload
```

### 2.2 上传

`CloudSaveManager._SilenceSyncSave_d__15$$MoveNext(0x1180E10)` 已确认：

- 临时目录：`temporaryCachePath + "/save/"`
- 临时 zip：`temporaryCachePath + "/.save"`
- 先 `CloudSaveManager$$SaveToFolder(path)`
- 再 `ZipFile.CreateFromDirectory(path, zipPath)`
- 再 `TapTap.Bootstrap.TapGameSave$$set_GameFilePath(zipPath)`
- 最后 `TapTap.Bootstrap.TapGameSave$$Save()` 上传

### 2.3 解包 / 下载

`CloudSaveManager._LoadCloudSave_d__16$$MoveNext(0x117F99C)` 已确认：

1. 下载 zip 到缓存路径。
2. `ZipFile.ExtractToDirectory(zipPath, folderPath)` 解压。
3. 调 `CloudSaveManager$$LoadFromFolder(folderPath, loadSettings, saveVersion)`。

`CloudSaveManager$$LoadFromFolder(0x117E7A4)` 已确认：

- 逐个按模块名打开文件。
- 读第 1 字节作为模块版本。
- 读剩余字节作为加密正文。
- 根据外层 `saveVersion` 选择：
  - `Decrypt2`
  - 或旧的 `Decrypt_18747912`
- 再把解密结果交给各模块的 `LoadFromBinary(versionByte, decryptedBytes)`。
- 之后会保留若干本地键，`PlayerPrefs.DeleteAll()`，再回写必要键值并 `Apply()` 各模块。

结论：

- 云存档对外是 zip。
- zip 内是 5 个模块文件。
- 模块文件头只含“模块版本”，不含总存档版本；总存档版本来自外层 summary / 同步流程传入的 `saveVersion`。

## 3. 版本校验分支

关键函数：

- `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`
- `CloudSaveSummary$$FromLocalSave` `0x11818CC`
- `CloudSaveSummary$$Serialize` `0x1181E4C`
- `CloudSaveSummary$$Deserialize` `0x11843E0`

### 3.1 Summary 的来源

`CloudSaveSummary$$FromLocalSave(0x11818CC)` 已确认会构造本地 summary，关键字段包括：

- `SaveVersion = 6`
- `GameVersion = 135`
- `ChallengeModeRank = SaveManagement.LoadInt("ChallengeModeRank")`
- `RankingScore = GameInformation._main._RankingScore_k__BackingField`
- `Avatar = SaveManagement.LoadString("UserIconKeyName", "")`
- `Cleared[4] / FullCombo[4] / Phi[4]`

`CloudSaveSummary$$Serialize(0x1181E4C)` 和 `Deserialize(0x11843E0)` 已确认 summary 是 `base64(binary)`，不是 JSON。

### 3.2 阻止高版本云存档覆盖低版本本地的分支

在 `CloudSaveManager._SyncSave_d__14$$MoveNext(0x11820F4)` 中，关键比较位于 `0x1182E58` 一段：

- `0x1182E5C` 读取 `cloud.SaveVersion`
- `0x1182E60` 读取 `local.SaveVersion`
- `0x1182E64` 比较二者
- `0x1182E6C` 读取 `cloud.GameVersion`
- `0x1182E70` 读取 `local.GameVersion`
- `0x1182E74` 再比较二者

等价逻辑：

```text
if (cloud.SaveVersion > local.SaveVersion) goto update_required;
if (cloud.GameVersion > local.GameVersion) goto update_required;
else goto normal_sync_path;
```

也就是说，只要云端 summary 里的 `SaveVersion` 或 `GameVersion` 高于本地，流程就不会进入普通的“本地/云端二选一覆盖”逻辑。

### 3.3 “需要更新”提示路径

进入 `loc_1182E7C` 后：

1. 先调 `CloudSaveManager$$_SyncSave_g__HideBackground_14_0`
2. 再取 `CloudSaveManager` 静态多语言文本
3. 调 `PhigrosUI$$ShowOkMessageBox(...)`
4. 直接结束这一条同步路径

这就是“高版本云存档不能覆盖低版本本地”的实际拦截点。

### 3.4 额外的时间基线保护

`CloudSaveManager._SilenceSyncSave_d__15$$MoveNext(0x1180E10)` 和 `CloudSaveManager._SyncSave_d__14$$MoveNext(0x11820F4)` 里都存在 `saveBaseTime` 相关比较：

- 本地键：`saveBaseTime`（`StringLiteral_11624`）
- 比较逻辑：`abs((cloud.ModifiedAt - saveBaseTime).TotalMilliseconds) <= 10.0`

如果超出 10ms，也会走不同的同步/提示路径，而不是直接覆盖。

## 4. 动态验证建议

如果后续要做动态确认，优先建议验证以下 4 件事：

### 4.1 验证本地 PlayerPrefs 的 key/value 加密

建议 hook：

- `SaveManagement$$Encrypt` `0x11DEFBC`
- `SaveManagement$$Decrypt` `0x11DFD4C`
- `SaveManagement$$Encrypt2` `0x11E1624`
- `SaveManagement$$Decrypt2` `0x11E1B4C`

目标：

- 记录明文 `keyName` 与写入 `PlayerPrefs` 的密文 key
- 记录字符串值和二进制模块正文的加密前后内容

### 4.2 验证 summary 内容

建议 hook：

- `CloudSaveSummary$$Serialize` `0x1181E4C`
- `CloudSaveSummary$$Deserialize` `0x11843E0`

目标：

- 确认 `SaveVersion` / `GameVersion` / `ChallengeModeRank` / `RankingScore` / `Avatar` / 三组统计数组的实际值
- 对照云端返回的 summary 字符串

### 4.3 验证版本校验分支

建议 hook：

- `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`

目标：

- 在比较前打印：
  - `localSummary.SaveVersion`
  - `cloudSummary.SaveVersion`
  - `localSummary.GameVersion`
  - `cloudSummary.GameVersion`
- 确认触发 `update_required` 的具体时机

### 4.4 验证上传 / 下载外层封装

建议观察：

- `CloudSaveManager$$SaveToFolder` `0x117E22C`
- `CloudSaveManager$$LoadFromFolder` `0x117E7A4`
- `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`
- `CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C`

目标：

- 确认临时目录 `/save/` 与临时 zip `/.save` 的生成/删除时机
- 直接抓取 zip 内部 5 个模块文件，验证 `1 byte 版本 + Encrypt2(payload)` 的结论
