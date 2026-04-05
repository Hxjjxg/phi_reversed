# Phigros 收集品/掉落机制逆向分析

## 一、核心类型体系

### KeyType 枚举 (对应 tooltip: "0:Songs, 1:Collections, 2:Illustration, 3:Head portrait")
| KeyType | 类型 | 对应类 | 说明 |
|---------|------|--------|------|
| 0 | Songs (曲绘) | — | 在 `GetGetableItems` 中以 `IllustrationInfo` 形式动态创建 |
| 1 | Collections (收集品) | `CollectionItemIndex` | 预配置在 `GetCollectionControl.collectionItems` 列表中 |
| 2 | Illustration (曲绘) | `IllustrationInfo` | KeyType=2 |
| 3 | Head portrait (头像) | `AvatarInfo` | 预配置在 `GetCollectionControl.avatars` 列表中 |

### GetableItem 基类字段
```csharp
public abstract class GetableItem {
    public int getSong;    // 歌曲匹配条件 (0=任意歌曲, 负数=精确匹配, 正数=章节+偏移)
    public int getType;    // 匹配类型 (-1, 0, 1, 2, 3, 4)
    public int getPower;   // 权重/概率值 (用于随机抽取)
    public string getInfo1; // 条件参数1
    public string getInfo2; // 条件参数2
    public string getInfo3; // 条件参数3
}
```

## 二、结算掉落主流程 (`SettleAccountsControl.GetCollection`)

### 流程概览
```
结算开始
  │
  ├─ isFirstRun (首次运行)?
  │   └─ YES → 直接给 32 MB data，跳到显示
  │
  ├─ ForceGetSideStory4BeginCollection?
  │   └─ 检查 SideStory 三章是否全部通关(共16首歌)
  │      如果刚好全部通关且未领取 → 强制掉落指定收集品 "StringLiteral_11635"
  │      返回 true，跳过正常掉落流程
  │
  └─ 正常掉落流程:
      1. 获取候选物品列表
      2. 随机抽取权重池
      3. 根据权重决定掉落类型
      4. 从对应池中随机选取具体物品
      5. 显示掉落结果
```

### 详细步骤

#### Step 1: 获取候选物品 (`GetCollectionControl.GetGetableItems`)
```
输入: levelStartInfo (歌曲信息), levelResultInfo (成绩信息)

1. 从 avatars 列表中筛选满足条件的头像
   → 调用 IsMatchRequirement(levelStartInfo, levelResultInfo)
   → 加入候选列表

2. 从 collectionItems 列表中筛选满足条件的收集品
   → 同样调用 IsMatchRequirement
   → 按 key 分组 (GroupBy key)，每组取一个代表
   → 加入候选列表

3. 检查当前歌曲的曲绘是否已解锁
   → SaveManagement.LoadInt("StringLiteral_11797" + songsKey) <= 0
   → 如果未解锁，创建 IllustrationInfo (getPower=30)，加入候选列表
```

#### Step 2: 随机权重池构建
```csharp
// 过滤出 getPower > 100 的物品（检查是否存在高权重物品）
bool hasHighPower = GetableItems.Any(i => i.getPower > 100);

if (hasHighPower) {
    // 移除 getPower < 101 的物品（只保留高权重物品参与后续抽取）
    GetableItems.RemoveAll(i => i.getPower < 101);
}

// 提取所有不同的 getPower 值，排序
List<int> powerPool = GetableItems.Select(c => c.getPower).Distinct().ToList();
powerPool.Sort();
```

#### Step 3: 加密随机数生成 (`RandomInt`)
```csharp
// 使用 RNGCryptoServiceProvider 生成密码学安全随机数
byte[] bytes = new byte[4];
new RNGCryptoServiceProvider().GetBytes(bytes);
return BitConverter.ToInt32(bytes, 0);
```
**注意：使用的是密码学安全随机数，不是伪随机。**

#### Step 4: 权重抽取算法
```csharp
int randomScore = Abs(RandomInt()) % 100 + 1;  // 1~100
this.randomScore = randomScore;
this.randomScoreGet = randomScore;
int poolPower = 0;

// 从权重池的最大值开始，逐个减去权重值
for (int i = powerPool.Count - 1; i >= 0; i--) {
    randomScore -= powerPool[i];
    if (randomScore <= 0) {
        poolPower = powerPool[i];  // 命中这个权重
        break;
    }
}
// 如果循环结束仍 > 0，poolPower = 0
```

#### Step 5: 根据 poolPower 决定掉落
```
if (poolPower < 1):
    → 不掉落物品，改为掉落 data (KB)
    → 条件: score >= 880000
    → KB数 = (int)((score - 700000) * GetMaxKb / 300000.0)
    → 如果结果为 Infinity 则给 0
    
if (poolPower >= 1):
    → 从候选列表中筛选 getPower == poolPower 的物品
    → 随机选一个: index = Abs(RandomInt()) % filteredList.Count
    → 调用 GetableItem.Get() 领取
```

#### Step 6: 显示掉落结果
根据 `KeyType` 显示不同的 UI:
```
KeyType == 0 (Songs/曲绘):
    → collectedText = Key + "StringLiteral_12456"  (可能是 " 曲绘已解锁" 之类)
    → 不显示额外图标

KeyType == 1 (Collection/收集品):
    → collectedText = multiLanguageTitle 的本地化文本
    → 显示 collectedImage[3] (收集品图标)
    → 设置 collectedTip 按钮可交互
    → 首次获得收集品时触发异步操作 (b__5)

KeyType == 2 (Illustration/曲绘):
    → collectedText = Key + "StringLiteral_12457"
    → 显示 collectedImage[2]

KeyType == 3 (Head portrait/头像):
    → collectedText = Key + "StringLiteral_12458"
    → 显示 collectedImage[1]
```

## 三、物品匹配条件 (`GetableItem.IsMatchRequirement`)

### getSong 字段 — 歌曲匹配
```
getSong == 0:     任意歌曲都匹配
getSong < 0:      精确匹配: SongsIndex + getSong == 0 (即 SongsIndex == -getSong)
getSong > 0:      章节+偏移匹配:
                  chapter = getSong / 10000
                  minIndex = getSong % 10000
                  要求: SongsIndex/10000 == chapter && SongsIndex%10000 >= minIndex
```

### getType 字段 — 条件类型

#### getType == -1: 无条件
直接返回 true。

#### getType == 0: 历史成绩匹配 (分数范围)
```
getInfo1: 逗号分隔的 "songsKeyXX" 列表 (XX = 难度后缀，如 EZ/HD/IN/AT)
          解析: songsKey = substring(0, len-2), difficulty = substring(len-2)
          
对每个条目:
  → 从存档加载该歌曲该难度的 LevelRecord
  → getInfo2 非空时: record.s >= parseInt(getInfo2)  (最低分数)
  → getInfo3 非空时: record.s <= parseInt(getInfo3)  (最高分数)
  
所有条目必须同时满足 (AND)
```

#### getType == 1: 历史成绩匹配 (ACC范围)
```
getInfo1: 同上，逗号分隔的 "songsKeyXX" 列表

对每个条目:
  → 从存档加载 LevelRecord
  → getInfo2 非空时: record.a >= parseFloat(getInfo2) - 0.01  (最低ACC)
  → getInfo3 非空时: record.a <= parseFloat(getInfo3) + 0.01  (最高ACC)
  
所有条目必须同时满足 (AND)
```

#### getType == 2: 当前游玩匹配 (难度+成绩)
```
getInfo1: 难度要求字符串
  → 空字符串: 任意难度
  → "StringLiteral_11470": 要求 songsLevel == "StringLiteral_11469" (可能是 HD 要求 EZ)
  → "StringLiteral_11471": 要求 songsLevel 是 11469 或 11470
  → "StringLiteral_11472": 要求 songsLevel != "StringLiteral_11472"
  
getInfo2 非空时: levelResultInfo.percent >= parseFloat(getInfo2) - 0.01
getInfo3 非空时: levelResultInfo.IntScore >= parseInt(getInfo3)
```

#### getType == 3: 当前游玩匹配 (歌名+miss数+分数)
```
getInfo1: 逗号分隔的歌曲名列表
  → 要求 levelStartInfo.songsName 在列表中

getInfo2 非空时: FailedNoteCount <= parseInt(getInfo2)  (最大允许miss数)
getInfo3 非空时: IntScore >= parseInt(getInfo3)          (最低分数)
```

#### getType == 4: 头像解锁数量匹配
```
getInfo1: 逗号分隔的头像key列表
getInfo2: 需要解锁的数量阈值

遍历列表，统计已解锁的头像数量
→ 已解锁数 >= parseInt(getInfo2) 时返回 true
```

## 四、Data (KB/MB) 掉落机制

### 触发条件
当权重抽取结果 `poolPower < 1` 时（即没有抽中任何物品），改为掉落 data。

### 首次运行
`isFirstRun == true` → 直接给 32 MB。

### 正常掉落
条件: `IntScore >= 880000` (分数至少88万)

```csharp
int maxKb = GetMaxKb();  // 根据难度等级决定
float kb = (float)((score - 700000) * maxKb) / 300000.0f;
if (kb == Infinity) kb = 0;
Money money = Money.ForKB((int)kb);
```

### GetMaxKb — 难度对应最大KB
根据 `songsDifficulty` 的字符串哈希匹配:
| 返回值 | 对应难度 |
|--------|----------|
| 256 | 大部分普通难度 (默认值) |
| 512 | 较高难度 (StringLiteral_1528, 1529, 1530) |
| 768 | 高难度 (StringLiteral_12504, 12505, 12506) |
| 1024 | 更高难度 (StringLiteral_12507, 12508) |
| 1280 | 极高难度 (StringLiteral_12509) |
| 1536 | 最高难度 (StringLiteral_1558, 12510) |

**Data计算公式**: `KB = (score - 700000) / 300000 × maxKb`
- 88万分 → (880000-700000)/300000 × maxKb = 0.6 × maxKb
- 100万分 → (1000000-700000)/300000 × maxKb = 1.0 × maxKb
- 即满分时恰好获得 maxKb 的 data

## 五、SideStory 特殊掉落

### ForceGetSideStory4BeginCollection
当 SideStory 三个章节（通过 `chapterCode` 匹配 StringLiteral_12478/12479/12480）的所有歌曲（共16首）全部通关时：
- 如果尚未领取过（`SaveManagement.LoadBool(StringLiteral_12511) == false`）
- 强制掉落指定收集品 `StringLiteral_11635`
- 标记已领取 `SaveManagement.SaveBool(StringLiteral_12511, true)`
- 跳过正常掉落流程

### GetSideStoryChapterSongFinishNum
统计三个 SideStory 章节中，所有歌曲的通关数量（任意难度有成绩即算通关）。

## 六、关键结论

1. **放置也能获得收集品的原因**: `IsMatchRequirement` 中 `getType == -1` 直接返回 true，且 `getSong == 0` 匹配任意歌曲。只要物品的条件配置为无条件（getType=-1, getSong=0），即使0分也能进入候选池。权重抽取使用的是 `randomScore = Abs(RandomInt()) % 100 + 1`，与玩家分数无关。

2. **特定收集品需要特定歌曲和分数**: 当 `getType` 为 0/1/2/3 时，会检查歌曲、难度、分数、ACC、miss数等条件。只有满足条件的物品才会进入候选池。

3. **掉落概率由 getPower 决定**: 所有候选物品的 getPower 值构成权重池。随机数 1~100 从最大权重开始逐个减去，命中哪个权重就从该权重的物品中随机选一个。

4. **Data 掉落是保底机制**: 当没有抽中任何物品（poolPower < 1）时，如果分数 >= 88万，按公式计算 KB 数。分数低于88万则什么都不掉。

5. **随机数是密码学安全的**: 使用 `RNGCryptoServiceProvider`，不可预测，不可通过种子复现。

6. **收集品分章**: 通过 `CollectionItem.category` 字段区分（MAIN_STORY, SIDE_STORY, MISC），但掉落判定本身不区分章节，章节只影响 UI 展示。

7. **曲绘掉落**: 每首歌的曲绘是独立的 `IllustrationInfo`，getPower=30，只要该歌曲的曲绘未解锁就会加入候选池。
