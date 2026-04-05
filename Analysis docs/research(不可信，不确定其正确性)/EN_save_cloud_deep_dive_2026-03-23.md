# Save / Cloud Save / Version Validation First Edition Notes

Based on the iOS `UnityFramework` in the current IDA session, the following addresses are all iOS / Mach-O ARM64.

## 1. SaveManagement Encryption/Decryption Chain

### 1.1 The local runtime save is not a single JSON, but encrypted PlayerPrefs

Key functions:

- `SaveManagement$$SaveInt` `0x11DF814`
- `SaveManagement$$LoadString` `0x11E04D0`
- `SaveManagement$$Encrypt` `0x11DEFBC`
- `SaveManagement$$Decrypt` `0x11DFD4C`
- `SaveManagement$$EncryptDES` `0x11DF490`
- `SaveManagement$$DecryptDES` `0x11DFA74`
- `SaveManagement$$.cctor` `0x11E0B18`

Concise logic:

- `SaveManagement$$SaveInt(0x11DF814)` will first call `Encrypt` on `keyName`, convert the integer to a string, then call `Encrypt` again, and finally call `UnityEngine.PlayerPrefs.SetString`.
- `SaveManagement$$LoadString(0x11E04D0)` first tries the new format:
  - `HasKey(AES(keyName))`
  - `GetString(AES(keyName))`
  - `AES decrypt value`
- If the new format does not exist, it falls back to the old format:
  - `HasKey(DES(keyName))`
  - `GetString(DES(keyName))`
  - `DES decrypt value`
  - Afterwards, it migrates back to the new AES format.

Therefore, the actual format of the active local save can be summarized as:

```text
PlayerPrefs[AES(keyName)] = AES(value_as_string)
```

### 1.2 AES / DES Parameter Sources

`SaveManagement$$.cctor(0x11E0B18)` confirmed:

- `encryptKey = "PGRS"`, used for the old DES path.
- String source for `aes` Key: `"Phigros.enc.j57vnvr8wlZssXM7eWpa"`
- String source for `aes` IV: `"Q4zHm5vUEMJJ3iS9"`
- Both are processed by `BinaryUtils$$LoopReverseXor` `0x116A460` before being written to `Aes.Key/IV`.
- `SaveManagement$$EncryptDES(0x11DF490)` / `DecryptDES(0x11DFA74)` use `DESCryptoServiceProvider`, where Key/IV come directly from `Unicode("PGRS")`, used only for old save compatibility.

### 1.3 AES2 for the Main Content of Cloud Save Modules

Key functions:

- `SaveManagement$$Encrypt2` `0x11E1624`
- `SaveManagement$$Decrypt2` `0x11E1B4C`
- `SaveManagement$$Encrypt_18746592` `0x11E0CE0`
- `SaveManagement$$Decrypt_18747912` `0x11E1208`

Concise logic:

- The main content of the 5 module files in cloud saves currently uses `aes2` for encryption/decryption in the main path.
- In `CloudSaveManager$$LoadFromFolder(0x117E7A4)`:
  - When `saveVersion >= 2`, it goes through `Decrypt2`.
  - When `saveVersion < 2`, it goes through the old `Decrypt_18747912`.
- `aes2` Key/IV are decoded from a base64 constant and written in `SaveManagement$$.cctor(0x11E0B18)`.

## 2. CloudSaveManager Packing / Unpacking

Key functions:

- `CloudSaveManager$$SaveToFolder` `0x117E22C`
- `CloudSaveManager$$LoadFromFolder` `0x117E7A4`
- `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`
- `CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C`

### 2.1 Packing

`CloudSaveManager$$SaveToFolder(0x117E22C)` confirmed sequence:

1. Constructs 5 `ISaveModule`s:
   - `SettingsSaveModule`
   - `UserSaveModule`
   - `GameProgressSaveModule`
   - `GameRecordSaveModule`
   - `GameKeySaveModule`
2. Calls `Apply()` on each module to pull state from current memory/PlayerPrefs.
3. Calls `Serialize()` to get the module's main content as binary.
4. Calls `SaveManagement$$Encrypt2` to encrypt the main content.
5. Creates a new file at `path + module.Name`.
6. First writes 1 byte for `module.Version`, then writes the encrypted main content.

Thus, the physical format of a single module file is:

```text
u8 module_version
bytes encrypted_payload
```

### 2.2 Uploading

`CloudSaveManager._SilenceSyncSave_d__15$$MoveNext(0x1180E10)` confirmed:

- Temporary directory: `temporaryCachePath + "/save/"`
- Temporary zip: `temporaryCachePath + "/.save"`
- First calls `CloudSaveManager$$SaveToFolder(path)`
- Then `ZipFile.CreateFromDirectory(path, zipPath)`
- Then `TapTap.Bootstrap.TapGameSave$$set_GameFilePath(zipPath)`
- Finally `TapTap.Bootstrap.TapGameSave$$Save()` to upload.

### 2.3 Unpacking / Downloading

`CloudSaveManager._LoadCloudSave_d__16$$MoveNext(0x117F99C)` confirmed:

1. Downloads the zip to the cache path.
2. `ZipFile.ExtractToDirectory(zipPath, folderPath)` to unzip.
3. Calls `CloudSaveManager$$LoadFromFolder(folderPath, loadSettings, saveVersion)`.

`CloudSaveManager$$LoadFromFolder(0x117E7A4)` confirmed:

- Opens files one by one by module name.
- Reads the 1st byte as the module version.
- Reads the remaining bytes as the encrypted main content.
- Chooses based on the outer `saveVersion`:
  - `Decrypt2`
  - Or the old `Decrypt_18747912`
- Passes the decryption result to each module's `LoadFromBinary(versionByte, decryptedBytes)`.
- Afterwards, it retains several local keys, calls `PlayerPrefs.DeleteAll()`, writes back necessary key-values, and calls `Apply()` on each module.

Conclusion:

- The cloud save is externally a zip file.
- Inside the zip are 5 module files.
- The header of the module file only contains the "module version", not the overall save version; the overall save version comes from the outer summary / `saveVersion` passed into the sync process.

## 3. Version Validation Branch

Key functions:

- `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`
- `CloudSaveSummary$$FromLocalSave` `0x11818CC`
- `CloudSaveSummary$$Serialize` `0x1181E4C`
- `CloudSaveSummary$$Deserialize` `0x11843E0`

### 3.1 Source of the Summary

`CloudSaveSummary$$FromLocalSave(0x11818CC)` confirmed to construct a local summary. Key fields include:

- `SaveVersion = 6`
- `GameVersion = 135`
- `ChallengeModeRank = SaveManagement.LoadInt("ChallengeModeRank")`
- `RankingScore = GameInformation._main._RankingScore_k__BackingField`
- `Avatar = SaveManagement.LoadString("UserIconKeyName", "")`
- `Cleared[4] / FullCombo[4] / Phi[4]`

`CloudSaveSummary$$Serialize(0x1181E4C)` and `Deserialize(0x11843E0)` confirmed the summary is `base64(binary)`, not JSON.

### 3.2 Branch Preventing Higher Version Cloud Saves from Overwriting Lower Version Local Saves

In `CloudSaveManager._SyncSave_d__14$$MoveNext(0x11820F4)`, the key comparison is located in the section around `0x1182E58`:

- `0x1182E5C` reads `cloud.SaveVersion`
- `0x1182E60` reads `local.SaveVersion`
- `0x1182E64` compares the two
- `0x1182E6C` reads `cloud.GameVersion`
- `0x1182E70` reads `local.GameVersion`
- `0x1182E74` then compares the two

Equivalent logic:

```text
if (cloud.SaveVersion > local.SaveVersion) goto update_required;
if (cloud.GameVersion > local.GameVersion) goto update_required;
else goto normal_sync_path;
```

That is, as long as `SaveVersion` or `GameVersion` in the cloud summary is higher than local, the flow will not enter the normal "choose one to overwrite" logic.

### 3.3 "Update Required" Prompt Path

After entering `loc_1182E7C`:

1. First calls `CloudSaveManager$$_SyncSave_g__HideBackground_14_0`
2. Gets the `CloudSaveManager` static multi-language text
3. Calls `PhigrosUI$$ShowOkMessageBox(...)`
4. Directly ends this synchronization path

This is the actual interception point for "higher version cloud saves cannot overwrite lower version local saves".

### 3.4 Additional Time Baseline Protection

Both `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext(0x1180E10)` and `CloudSaveManager._SyncSave_d__14$$MoveNext(0x11820F4)` have comparisons related to `saveBaseTime`:

- Local key: `saveBaseTime` (`StringLiteral_11624`)
- Comparison logic: `abs((cloud.ModifiedAt - saveBaseTime).TotalMilliseconds) <= 10.0`

If it exceeds 10ms, it also takes a different sync/prompt path instead of directly overwriting.

## 4. Dynamic Verification Suggestions

If dynamic verification is to be done later, it is recommended to verify the following 4 things first:

### 4.1 Verify the key/value encryption of local PlayerPrefs

Suggested hooks:

- `SaveManagement$$Encrypt` `0x11DEFBC`
- `SaveManagement$$Decrypt` `0x11DFD4C`
- `SaveManagement$$Encrypt2` `0x11E1624`
- `SaveManagement$$Decrypt2` `0x11E1B4C`

Goal:

- Record the plaintext `keyName` and the ciphertext key written to `PlayerPrefs`
- Record the content before and after encryption of string values and binary module payloads

### 4.2 Verify the summary content

Suggested hooks:

- `CloudSaveSummary$$Serialize` `0x1181E4C`
- `CloudSaveSummary$$Deserialize` `0x11843E0`

Goal:

- Confirm the actual values of `SaveVersion` / `GameVersion` / `ChallengeModeRank` / `RankingScore` / `Avatar` / three sets of statistics arrays
- Compare with the summary string returned from the cloud

### 4.3 Verify the version validation branches

Suggested hook:

- `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`

Goal:

- Print before comparison:
  - `localSummary.SaveVersion`
  - `cloudSummary.SaveVersion`
  - `localSummary.GameVersion`
  - `cloudSummary.GameVersion`
- Confirm the exact timing when `update_required` is triggered

### 4.4 Verify upload / download outer packaging

Suggested observations:

- `CloudSaveManager$$SaveToFolder` `0x117E22C`
- `CloudSaveManager$$LoadFromFolder` `0x117E7A4`
- `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`
- `CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C`

Goal:

- Confirm the creation/deletion timing of the temporary directory `/save/` and the temporary zip `/.save`
- Directly grab the 5 module files inside the zip to verify the conclusion of `1 byte version + Encrypt2(payload)`