# Unity Addressables Bundle Redirector

通用的 Unity IL2CPP 游戏 AssetBundle 重定向框架，基于 Frida。

## 原理

```
Addressables.LoadAssetAsync("chart/xxx.mc")
  → ResourceManager.TransformInternalId()  ← HOOK 1: 替换路径
    → GetLoadInfo()
      → 路径包含 "://" ?
          YES → loadType=2 → WebRequest 下载（远程 bundle）
          NO  → loadType=1 → LoadLocalBundle()
                               → AssetBundle.LoadFromFileAsync(path, crc)  ← HOOK 2: CRC=0
```

**只需一个核心 Hook（TransformInternalId）即可同时支持本地和远程重定向**，引擎会根据路径格式自动选择加载方式。

## 文件结构

```
hook/
├── bundle_redirects.json   # 重定向配置（编辑这个文件即可）
├── bundle_hook.js          # Frida hook 脚本
└── README.md               # 本文件
```

## 快速使用

### 1. 编辑配置

修改 `bundle_redirects.json`：

```json
{
    "redirects": {
        "chartassets_assets_all.bundle": {
            "type": "local",
            "target": "E:\\mods\\my_modified.bundle",
            "enabled": true
        }
    }
}
```

### 2. 运行

```bash
# 附加到已运行的进程
frida -p <PID> -l bundle_hook.js

# 或者启动时注入
frida -f 4k.exe -l bundle_hook.js --no-pause
```

## 配置说明

| 字段 | 说明 |
|------|------|
| key (如 `"chartassets_assets_all.bundle"`) | 匹配关键词，原始路径中包含此字符串即触发替换 |
| `type` | `"local"` 本地文件 / `"remote"` 远程 URL |
| `target` | 替换目标：本地绝对路径 或 `https://...` URL |
| `enabled` | `true` 启用 / `false` 禁用（不删配置即可临时关闭） |

### 本地替换示例

```json
"chartassets_assets_all.bundle": {
    "type": "local",
    "target": "C:\\mods\\custom_chart.bundle",
    "enabled": true
}
```

### 远程替换示例

```json
"chartassets_assets_all.bundle": {
    "type": "remote",
    "target": "https://cdn.example.com/modded/custom_chart.bundle",
    "enabled": true
}
```

### 多个 bundle 同时替换

```json
"redirects": {
    "chartassets_assets_all.bundle": {
        "type": "local",
        "target": "C:\\mods\\chart_mod.bundle",
        "enabled": true
    },
    "noteassets_assets_all.bundle": {
        "type": "remote",
        "target": "https://cdn.example.com/note_mod.bundle",
        "enabled": true
    }
}
```

## 适配新游戏

只需修改 `bundle_hook.js` 顶部的 `CONFIG` 区 RVA 值：

```javascript
const CONFIG = {
    moduleName: "GameAssembly.dll",
    RVA_TransformInternalId: 0x1BA0E10,  // ← 用 IDA 找到新游戏的对应函数
    RVA_LoadFromFileAsync:   0x1D2C020,
    RVA_CreateWebRequest:    0x1B7C090,
    redirectConfigPath: "...",
};
```

### 如何在新游戏中定位这些函数

1. **TransformInternalId**: 搜索字符串 `"TransformInternalId"` 或函数名 `ResourceManager_TransformInternalId`
2. **LoadFromFileAsync**: 搜索 icall `"UnityEngine.AssetBundle::LoadFromFileAsync_Internal"`
3. **CreateWebRequest**: 搜索 `AssetBundleResource_CreateWebRequest`

如果游戏用了 `il2cpp_dump` / `Il2CppInspector` / `Il2CppDumper`，可以直接从 dump 结果中查找。

## 匹配逻辑

- 匹配方式：**子字符串包含**（`originalPath.indexOf(keyword) !== -1`）
- 仅匹配 `enabled: true` 的规则
- 未匹配的路径**完全不受影响**
- CRC bypass 仅作用于已重定向的路径

## 注意事项

- 替换的 bundle 必须与原始 bundle **资产结构兼容**（包含相同的 asset path）
- 远程 URL 必须返回有效的 AssetBundle 二进制数据
- 如果原始游戏有 CRC 校验，框架会自动置零
