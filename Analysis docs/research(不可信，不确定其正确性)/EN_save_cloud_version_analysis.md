# Save / Cloud Save / Version Verification Analysis

Based on the iOS `UnityFramework` in the current IDA session, combined with cross-confirmation from `dump_ios.cs`. This document prioritizes recording iOS addresses; if older Android conclusions exist, they generally only differ in addresses, not in logic.

## Conclusion First

1. The "local save" during daily runtime is not a single JSON file, but a `PlayerPrefs` key-value store.
2. The key names and string values in `PlayerPrefs` are encrypted by `SaveManagement` before being written; older version compatibility paths still retain DES.
3. Cloud saves do not directly upload `PlayerPrefs`. Instead, the 5 `ISaveModule`s are first exported into 5 binary files, then zipped together for upload.
4. The format of each module file is: `1 byte module version` + `AES/AES2 encrypted module binary body`.
5. The cloud summary `CloudSaveSummary` is not JSON, but `base64(binary structure)`.
6. The restriction that "higher version cloud saves cannot overwrite lower version local saves" is real. The check point is at `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`:
   - `cloud.SaveVersion > local.SaveVersion`
   - or `cloud.GameVersion > local.GameVersion`
   If either condition is met, a "Needs Update" prompt will pop up directly, bypassing the prompt to choose between local/cloud overwrite.

## 1. Local Runtime Save: PlayerPrefs + SaveManagement

### 1.1 `SaveManagement` Handles Unified Encryption/Decryption

- `SaveManagement$$SaveInt` `0x11DF814`
  - First `Encrypt(keyName)`.
  - Then convert the value to string, `Encrypt(valueString)`.
  - Finally, call `UnityEngine.PlayerPrefs.SetString`.
- `SaveManagement$$LoadString` `0x11E04D0`
  - First, try the new scheme: `Encrypt(key)` + `Decrypt(value)`.
  - If the new key does not exist, fallback to the old compatibility scheme: `EncryptDES(key)` + `DecryptDES(value)`.
  - After reading the old format, it will immediately migrate to the new AES format and rewrite it back to `PlayerPrefs`.

This means that the core form of the active local save is:

```text
PlayerPrefs[
  AES(original_key_name)
] = AES(original_string_value)
```

Booleans, integers, dates, and strings are ultimately all wrapped into this system.

### 1.2 New and Old Encryption Schemes

#### New String Encryption

- `SaveManagement$$Encrypt` `0x11DEFBC`
- `SaveManagement$$Decrypt` `0x11DFD4C`

Process:

1. `aes` is created during the static initialization of `SaveManagement`.
2. The Key and IV are not used directly as plaintext, but instead:
   - First, ASCII bytes are extracted;
   - Then, passed through `BinaryUtils$$LoopReverseXor` `0x116A460`.
3. Finally, AES + `CryptoStream` is used for encrypting/decrypting the string.
4. The string layer is ultimately stored as base64.

For static initialization, see `SaveManagement$$.cctor` `0x11E0B18`:

- `encryptKey` string: `"PGRS"`
- `aes` Key source string: `"Phigros.enc.j57vnvr8wlZssXM7eWpa"`, used as the real Key after being processed by `LoopReverseXor`
- `aes` IV source string: `"Q4zHm5vUEMJJ3iS9"`, used as the real IV after being processed by `LoopReverseXor`

#### Old String Compatibility Encryption

- `SaveManagement$$EncryptDES` `0x11DF490`
- `SaveManagement$$DecryptDES` `0x11DFA74`

Characteristics:

- Uses `DESCryptoServiceProvider`
- Both Key and IV come directly from `Unicode("PGRS")`
- Only used for compatibility when reading old saves, not the main path for the current version

#### Binary Module Encryption

The current cloud save module body uses `aes2`:

- `SaveManagement$$Encrypt2` `0x11E1624`
- `SaveManagement$$Decrypt2` `0x11E1B4C`

The old version module body compatibility path uses `aes`:

- `SaveManagement$$Encrypt_18746592` `0x11E0CE0`
- `SaveManagement$$Decrypt_18747912` `0x11E1208`

`aes2` initialization is also in `SaveManagement$$.cctor` `0x11E0B18`:

- `aes2` Key: base64 decoded `"6Jaa0qVAJZuXkZCLiOa/Ax5tIZVu+taKUN1V1nqwkks="`
- `aes2` IV: base64 decoded `"Kk/wisgNYwcAV8WVGMgyUw=="`

## 2. Cloud Save Wrapping: 5 Module Files + zip

### 2.1 Packing Entry Point

- `CloudSaveManager$$SaveToFolder` `0x117E22C`

Logic:

1. Construct 5 `ISaveModule` instances:
   - `SettingsSaveModule`
   - `UserSaveModule`
   - `GameProgressSaveModule`
   - `GameRecordSaveModule`
   - `GameKeySaveModule`
2. Execute `Apply()` one by one, pulling the state from current memory / PlayerPrefs.
3. Execute `Serialize()` one by one, obtaining the module body binary.
4. Execute `SaveManagement.Encrypt2` on the body.
5. File output format:
   - 1st byte: module version number, i.e., `module.Version`
   - Subsequent bytes: `Encrypt2(serialized_bytes)`
6. The filename is determined by `module.Name`.

### 2.2 Unpacking Entry Point

- `CloudSaveManager$$LoadFromFolder` `0x117E7A4`

Logic:

1. Similarly, construct these 5 `ISaveModule`s first.
2. For each module file:
   - Read the 1st byte as the module version;
   - Read the remaining bytes as the encrypted body;
   - If `saveVersion >= 2`, use `SaveManagement$$Decrypt2` `0x11E1B4C`
   - Otherwise, use `SaveManagement$$Decrypt_18747912` `0x11E1208`
   - Then execute `module.LoadFromBinary(versionByte, decryptedBytes)`
3. Afterwards, several local PlayerPrefs items will be preserved, then `DeleteAll()` is called, and then the modules are `Apply()`'d back to the current local environment.

This indicates:

- The module file itself does not carry a "total save version"; it only carries a "module version".
- The "total save version" comes from the externally passed `saveVersion` parameter, which is `CloudSaveSummary.SaveVersion`.
- `saveVersion` primarily determines whether to use the old AES or the new AES2 for decrypting the module body.

### 2.3 Zip is just an outer container

Both downloading and uploading wrap the module directory into a zip:

- When uploading: `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`
  - `SaveToFolder(path)`
  - `ZipFile.CreateFromDirectory(...)`
  - `TapGameSave.set_GameFilePath(...)`
  - `TapGameSave.Save()`
- When downloading: `CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C`
  - `WebClient.DownloadFile(url, zipPath)`
  - `ZipFile.ExtractToDirectory(zipPath, folderPath)`
  - `LoadFromFolder(folderPath, loadSettings, saveVersion)`

## 3. Module List, Filenames, Versions, and Fields

### 3.1 `SettingsSaveModule`

- Class definition: `dump_ios.cs:599333`
- Filename: `settings`
- `Name`: `SettingsSaveModule$$get_Name` `0x11E943C`
- `Version = 1`: `SettingsSaveModule$$get_Version` `0x11E9484`
- Key fields:
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
- Key functions:
  - `Apply` `0x11E948C`
  - `LoadFromBinary` `0x11E9614`
  - `LoadV1` `0x11E96E4`
  - `LoadFromLocal` `0x11E989C`
  - `Serialize` `0x11E99F8`

### 3.2 `UserSaveModule`

- Class definition: `dump_ios.cs:599380`
- Filename: `user`
- `Name`: `UserSaveModule$$get_Name` `0x1211728`
- `Version = 1`: `UserSaveModule$$get_Version` `0x1211770`
- Fields:
  - `selfIntro`
  - `avatar`
  - `background`
  - `showPlayerId`
- Key functions:
  - `Apply` `0x1211778`
  - `LoadFromBinary` `0x1211838`
  - `LoadV1` `0x1211908`
  - `LoadFromLocal` `0x12119A0`
  - `Serialize` `0x1211A90`

### 3.3 `GameProgressSaveModule`

- Class definition: `dump_ios.cs:599103`
- Filename: `gameProgress`
- `Name`: `GameProgressSaveModule$$get_Name` `0x119D99C`
- `Version = 4`: `GameProgressSaveModule$$get_Version` `0x119D9E4`
- Fields:
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
- Version branching:
  - `GameProgressSaveModule$$LoadFromBinary` `0x119E4F0`
  - `LoadV1` `0x119E634`
  - `LoadV2` `0x119E830`
  - `LoadV3` `0x119E8DC`
  - `LoadV4` `0x119E9E0`
- Serialization assembly order:
  - `SerializeGameProgressKeys` `0x119F638`
  - `SerializeMoneyAmount` `0x119F798`
  - `SerializeChapter567Keys` `0x119F850`
  - `SerializeSongUnlockKeys` `0x119F8E0`
  - `SerializeRandomUnlockKeys` `0x119F948`
  - `SerializeChapter8Keys` `0x119F9FC`
  - `SerializeTakumiATUnlockKey` `0x119FB04`

This is also the disk storage location for the status flags of most special songs, chapter unlocks, challenge rank, and Chapter 8.

### 3.4 `GameRecordSaveModule`

- Class definition: `dump_ios.cs:599296`
- Filename: `gameRecord`
- `Name`: `GameRecordSaveModule$$get_Name` `0x119FFB0`
- `Version = 1`: `GameRecordSaveModule$$get_Version` `0x119FFF8`
- Fields:
  - `Dictionary<string, byte[]> data`
- Key functions:
  - `Apply` `0x11A0000`
  - `LoadFromBinary` `0x11A03D4`
  - `LoadV1` `0x11A04A4`
  - `LoadFromLocal` `0x11A060C`
  - `Serialize` `0x11A0C3C`

For serialization format, see `GameRecordSaveModule$$Serialize` `0x11A0C3C`:

1. `varint(count)`
2. For each record, write:
   - `BinaryUtils.GetSaveByteArray(key)`, which is `varint(len) + utf8(key)`
   - `1 byte value_len`
   - `value_bytes`

This shows that its essence is a custom binary "song/difficulty record dictionary", not JSON.

### 3.5 `GameKeySaveModule`

- Class definition: `dump_ios.cs:599035`
- Filename: `gameKey`
- `Name`: `GameKeySaveModule$$get_Name` `0x119C674`
- `Version = 3`: `GameKeySaveModule$$get_Version` `0x119C6BC`
- Fields:
  - `Dictionary<string, List<byte>> keys`
  - `lanotaReadKeys`
  - `camelliaReadKey`
  - `sideStory4BeginReadKey`
  - `oldScoreClearedV390`
- Key functions:
  - `Apply` `0x119C6C4`
  - `LoadFromBinary` `0x119CA54`
  - `LoadV1` `0x119CB6C`
  - `LoadV2` `0x119CD58`
  - `LoadV3` `0x119CDAC`
  - `LoadFromLocal` `0x119CE14`
  - `Serialize` `0x119D6A8`

For serialization format, see `GameKeySaveModule$$Serialize` `0x119D6A8`:

1. `varint(count)`
2. For each record, write:
   - `1 byte key_utf8_len`
   - `key_utf8_bytes`
   - `1 byte list_len`
   - `list_bytes`
3. At the end, append 4 single-byte fields:
   - `lanotaReadKeys`
   - `camelliaReadKey`
   - `sideStory4BeginReadKey`
   - `oldScoreClearedV390`

## 4. Basic Binary Tool Formats

### 4.1 Strings

- `BinaryUtils$$GetSaveByteArray` `0x116A2A8`
  - First, UTF-8 encode
  - Then write `varint(length)`
  - Final format: `varint(len) + utf8_bytes`
- `BinaryUtils$$GetString_18260892` `0x116A39C`
  - First `GetVarInt`
  - Then read fixed length according to UTF-8

### 4.2 Integers

- `BinaryUtils$$ToVarInt` `0x1169F14`
- `BinaryUtils$$GetVarInt_18260096` `0x116A080`

Therefore, both cloud save module bodies and `CloudSaveSummary` are "custom binary + varint", not JSON.

## 5. Cloud Summary `CloudSaveSummary`

### 5.1 Structure Definition

For class definition, see `dump_ios.cs:598672`:

- `byte SaveVersion`
- `int GameVersion`
- `int ChallengeModeRank`
- `float RankingScore`
- `string Avatar`
- `int[] Cleared`
- `int[] FullCombo`
- `int[] Phi`

The four difficulty labels are initialized in `CloudSaveSummary$$.cctor` `0x11847B0`:

- `EZ`
- `HD`
- `IN`
- `AT`

### 5.2 Generating Local Summary

- `CloudSaveSummary$$FromLocalSave` `0x11818CC`

Logic:

1. Iterate through all songs and 4 difficulties.
2. Count from local records:
   - `Cleared`: Score `>= 820000`
   - `FullCombo`: `c > 0` or `score >= 1000000`
   - `Phi`: `score >= 1000000`
3. Read from `PlayerPrefs`:
   - `ChallengeModeRank`, key name is `ChallengeModeRank`
   - `Avatar`
4. Read from `GameInformation`:
   - `RankingScore`
5. Default values during current construction:
   - `SaveVersion = 6`
   - `GameVersion = 135`

### 5.3 Summary Serialization Format

- `CloudSaveSummary$$Serialize` `0x1181E4C`
- `CloudSaveSummary$$Deserialize` `0x11843E0`

Serialization order:

1. `1 byte SaveVersion`
2. `2 bytes ChallengeModeRank`
3. `4 bytes RankingScore(float)`
4. `varint GameVersion`
5. `BinaryUtils.GetSaveByteArray(Avatar)`
6. 4 groups of difficulty statistics, each with 3 `int16`s:
   - `Cleared[i]`
   - `FullCombo[i]`
   - `Phi[i]`
7. Use `Convert.ToBase64String` on the whole thing

So `TapGameSave.Summary` is:

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

## 6. Version Verification and Overwrite Limitations

### 6.1 The real check point where "Higher version cloud saves cannot be downgraded to lower versions"

Key function:

- `CloudSaveManager._SyncSave_d__14$$MoveNext` `0x11820F4`

Core logic snippet:

1. Generate local summary:
   - `localSummary = CloudSaveSummary.FromLocalSave()`
2. Read cloud summary:
   - `cloudSummary = CloudSaveSummary.Deserialize(TapGameSave.Summary)`
3. Direct comparison:

```c
if (cloudSummary.SaveVersion > localSummary.SaveVersion
 || cloudSummary.GameVersion > localSummary.GameVersion)
{
    HideBackground();
    ShowOkMessageBox(syncFailedText, updateText);
    return false;
}
```

This means the restriction doesn't just check one field, but simultaneously checks:

- `SaveVersion`
- `GameVersion`

If either on the cloud is higher, the current version client is not allowed to download and overwrite.

### 6.2 Branches When Versions Are Compatible

If versions are compatible, `SyncSave` will continue:

1. Generate `SelectSavePopup`
2. Display local summary and cloud summary left and right:
   - `CloudSaveInfoDisplay$$SetInfo` `0x117D8E4`
3. Pop up selection box:
   - `SelectSavePopup$$Show` `0x11E2A7C`
   - `KeepLocal` `0x11E2A68`
   - `KeepCloud` `0x11E2A74`
4. After user selection:
   - `keepLocal == true`: Repack the local save and upload it to the cloud.
   - `keepLocal == false`: Call `CloudSaveManager$$LoadCloudSave` `0x117E074` to download from cloud and overwrite local.

### 6.3 When Downloading and Overwriting, Use `SaveVersion` from the Cloud Summary

After compatible versions and the user selects cloud overwrite, `SyncSave` calls:

- `CloudSaveManager$$LoadCloudSave` `0x117E074`

Inside the parameters, explicitly passed in:

- `saveBaseTime = cloud.ModifiedAt`
- `saveVersion = cloudSummary.SaveVersion`

Then the download coroutine `CloudSaveManager._LoadCloudSave_d__16$$MoveNext` `0x117F99C` ultimately executes:

- `LoadFromFolder(path, loadSettings, saveVersion)`

Therefore:

- When overwriting local, the decryption branch used depends on the cloud summary `SaveVersion`
- The current higher-version blocking logic occurs before the download and will not enter `LoadFromFolder`

## 7. Silent Synchronization Conflicts: `SaveConflict`

Key function:

- `CloudSaveManager._SilenceSyncSave_d__15$$MoveNext` `0x1180E10`

Logic:

1. If not logged in, return `SilenceSyncResult.NotLoggedIn`
2. Pull current cloud save `TapSDKWrapper.QueryCloudSave`
3. Read `saveBaseTime` from local `PlayerPrefs`
   - Key name: `saveBaseTime`
4. If a save already exists on the cloud:
   - Take `cloud.ModifiedAt`
   - Calculate time diff with locally saved `saveBaseTime`
   - If `abs(diff) > 10ms`, return `SilenceSyncResult.SaveConflict` directly
5. Otherwise, package and upload normally

This indicates that silent sync conflict detection is not based on summary version, but on whether "the cloud baseline timestamp you thought you were based on when uploading" still matches.

## 8. Addition: Key Plaintext Key Names During Runtime

Several key plaintext key names that have been confirmed:

- `ChallengeModeRank`
- `saveBaseTime`
- `lastSyncTime`

They STILL go through `SaveManagement` encryption before entering `PlayerPrefs` and will not appear directly as plaintext key names.

## 9. Ready-to-use Frida Confirmation Scripts

The following scripts use the iOS `UnityFramework` as the base address, primarily for subsequent dynamic confirmation of version thresholds and module formats.

### 9.1 Print Cloud Summary Version, Game Version, and Statistics

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

### 9.2 Confirm the `saveVersion` passed when Downloading and Overwriting

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

### 9.3 Confirm that Download will not be entered when Version Threshold is triggered

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

Usage:

- If you deliberately make the `SaveVersion` or `GameVersion` in the cloud summary higher than your local version, and then trigger sync:
  - You should see the `CloudSaveSummary.Deserialize` log first.
  - But you won't see `CloudSaveManager.LoadCloudSave` being called.
  - It will only go through the "Needs Update" fail prompt branch.

## 10. Points still suggested for dynamic confirmation

1. Although the byte-by-byte layout of `GameProgressSaveModule.Serialize` can be confirmed sequentially from the helper, if you want to build an offline reconstruction tool, it is recommended to hook `Serialize` / `LoadV4` to actually dump the raw bytes.
2. The value content of `GameRecordSaveModule.data` itself is `byte[]`. Whether there are nested sub-structures inside it is recommended to be dynamically verified with a specific song record.
3. The base64 Key/IV of `SaveManagement.aes2` has been located. If you want to write a complete offline unpacker later, it is recommended to run a full round-trip `Encrypt2/Decrypt2` test with a real module file.

## Key Addresses Quick Reference

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