# global-metadata.dat Dumper for Android IL2CPP

从加密的 Android IL2CPP 游戏中提取解密后的 `global-metadata.dat`。

## 背景

本游戏将 `global-metadata.dat` 加密为 `game.dat` 打包在 APK 中，运行时通过 `libUnityPlugin.so` 提供的解密回调进行解密。此工具通过 Frida hook 在解密后拦截 metadata 并通过消息通道传回 PC。

## 特点

✅ 无需 root  
✅ 无需 debuggable  
✅ 无需访问手机文件系统  
✅ 自动解密字符串表  
✅ 通过 Frida 消息通道传输（不写手机存储）

## 前置要求

```bash
# 安装 Python 依赖
pip install frida frida-tools

# 确认手机已连接
adb devices

# 确认 Frida Gadget 已注入游戏并运行
frida-ps -Uai | grep -i gadget
# 或
frida-ps -Uai | findstr /i gadget
```

## 使用方法

### 1. 启动游戏（Frida Gadget 会自动加载）

确保游戏已启动并等待在 Gadget 加载界面（通常是黑屏或特定提示）。

### 2. 运行 dump 脚本

```bash
# 最简单用法（自动附加到 Gadget）
python dump_metadata_recv.py

# 指定输出文件
python dump_metadata_recv.py --output my_metadata.dat

# 附加到特定进程（按包名）
python dump_metadata_recv.py --attach com.PigeonGames.Phigros

# 附加到特定进程（按 PID）
python dump_metadata_recv.py --attach 12345
```

### 3. 等待输出

脚本会：
1. 附加到进程
2. 注入 JS hook
3. 等待 metadata 加载和解密
4. 分块接收数据
5. 验证并保存到当前目录

示例输出：
```
[*] 连接 Frida 设备 (usb) ...
[*] 设备: MAR AL00
[*] 附加到 'gadget' ...
[*] 加载脚本: E:\project\4kdemo\4k\hook_android_phigros\dump_metadata.js
[*] 脚本已加载
[*] 等待 metadata dump (超时 120s) ...
------------------------------------------------------------
====================================
  global-metadata.dat Dumper
  Frida 17+ | Android IL2CPP
====================================

[*] libil2cpp.so 基址: 0x7066bd5000
[*] Hook: LoadMetadataFile @ 0x7067d4d2bc
[*] Hooks 已安装, 等待 metadata 加载 ...
[*] LoadMetadataFile("game.dat")
[+] LoadMetadataFile 返回: 0x7064c00000
[+] Header 有效: magic=0xFAB11BAF, version=24
[+] metadata 大小: 9915188 bytes (9.46 MB)
[*] metadata: 9915188 bytes, 20 块
[*] 接收中: 20/20 (100%)
[+] 所有 20 块已接收
[*] 正在拼接并写入 → global-metadata.dat
[+] 已保存: global-metadata.dat (9915188 bytes, 9.46 MB)
[+] 验证通过: magic=0xFAB11BAF, version=24

[+] ===== 完成 =====
------------------------------------------------------------
[+] 完成!
[*] 会话已结束

[*] 文件已保存: E:\project\4kdemo\4k\hook_android_phigros\global-metadata.dat (9.46 MB)

下一步: 使用 Il2CppDumper 分析
  1. 从 APK 提取 libil2cpp.so
  2. 运行: Il2CppDumper.exe libil2cpp.so global-metadata.dat
  3. 选择 ARM64, 自动模式 (a)
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `dump_metadata.js` | Frida JS hook 脚本，运行在手机进程中 |
| `dump_metadata_recv.py` | Python 接收脚本，运行在 PC 上 |
| `global-metadata.dat` | dump 出的解密后的 metadata（自动生成） |

## 技术细节

### Hook 点

- **LoadMetadataFile** (`0x11782BC`)  
  拦截返回值 (`X0`) = 解密后的 metadata buffer 指针

### 解密流程

1. Hook `LoadMetadataFile` 的 `onLeave`
2. 验证 header magic (`0xFAB11BAF`)
3. 计算 metadata 总大小（从 header 读取所有 section 的 offset+size）
4. 复制 buffer 到新内存（避免影响游戏）
5. 调用 `off_448DF30` 解密字符串表中的所有标识符字符串
6. 通过 `send(msg, data)` 分块发送到 PC（每块 512KB）
7. Python 端接收、拼接、验证、保存

### 为什么不写手机文件系统？

- 非 debuggable 应用的私有目录无法通过 `adb pull` 访问
- `/sdcard/` 需要存储权限（某些游戏可能没有）
- Frida 消息通道绕过文件系统，任何情况下都能工作

## 故障排查

### 提示 "进程未找到"

```bash
# 查看所有进程
frida-ps -Uai

# 确认 Gadget 进程名（可能是 "Gadget" 或 "gadget"）
# 然后用 --attach 指定正确名称
```

### 超时 (120s)

可能原因：
- 游戏还没加载到 metadata（需要等待游戏初始化）
- Hook 点 RVA 偏移不正确（重新分析 IDA）

增加超时：
```bash
python dump_metadata_recv.py --timeout 300
```

### 验证失败 (magic != 0xFAB11BAF)

字符串解密逻辑有误，检查：
- `RVA_DecryptStringCb` 是否正确
- `decryptStringSection` 是否正确遍历了所有字符串

## 下一步：Il2CppDumper

```bash
# 从 APK 提取 libil2cpp.so
adb pull /data/app/com.PigeonGames.Phigros-xxxx/lib/arm64/libil2cpp.so

# 运行 Il2CppDumper
Il2CppDumper.exe libil2cpp.so global-metadata.dat

# 选择:
#   - ARM64
#   - 自动模式 (a)

# 生成:
#   - dump.cs (C# 定义)
#   - script.json (IDA/Ghidra 脚本)
#   - DummyDll/ (重建的 .NET DLL，可用反编译器查看)
```

## 许可

仅供学习研究使用。
