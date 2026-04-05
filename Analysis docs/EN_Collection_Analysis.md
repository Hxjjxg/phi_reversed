# Phigros Collection / Drop Mechanism Reverse Engineering Analysis

## 1. Core Type System

### KeyType Enum (corresponds to tooltip: "0:Songs, 1:Collections, 2:Illustration, 3:Head portrait")
| KeyType | Type | Corresponding Class | Description |
|---------|------|--------|------|
| 0 | Songs (Song Illustration) | — | Dynamically created as `IllustrationInfo` in `GetGetableItems` |
| 1 | Collections (Collectibles) | `CollectionItemIndex` | Pre-configured in the `GetCollectionControl.collectionItems` list |
| 2 | Illustration (Song Illustration) | `IllustrationInfo` | KeyType=2 |
| 3 | Head portrait (Avatar) | `AvatarInfo` | Pre-configured in the `GetCollectionControl.avatars` list |

### GetableItem Base Class Fields
```csharp
public abstract class GetableItem {
    public int getSong;    // Song matching condition (0=Any song, negative=Exact match, positive=Chapter+Offset)
    public int getType;    // Match type (-1, 0, 1, 2, 3, 4)
    public int getPower;   // Weight/Probability value (Used for random drawing)
    public string getInfo1; // Condition parameter 1
    public string getInfo2; // Condition parameter 2
    public string getInfo3; // Condition parameter 3
}
```

## 2. Settlement Drop Main Flow (`SettleAccountsControl.GetCollection`)

### Flow Overview
```
Settlement Starts
  │
  ├─ isFirstRun (First run)?
  │   └─ YES → Directly give 32 MB data, jump to display
  │
  ├─ ForceGetSideStory4BeginCollection?
  │   └─ Check if all three SideStory chapters are cleared (16 songs in total)
  │      If exactly all are cleared and not claimed yet → Force drop the specific collectible "StringLiteral_11635"
  │      Return true, skip the normal drop flow
  │
  └─ Normal drop flow:
      1. Get a list of candidate items
      2. Draw randomly from the weight pool
      3. Determine the drop type based on the weight
      4. Select a specific item randomly from the corresponding pool
      5. Display the drop result
```

### Detailed Steps

#### Step 1: Get Candidate Items (`GetCollectionControl.GetGetableItems`)
```
Inputs: levelStartInfo (Song information), levelResultInfo (Score information)

1. Filter avatars that meet the conditions from the avatars list
   → Call IsMatchRequirement(levelStartInfo, levelResultInfo)
   → Add to the candidate list

2. Filter collectibles that meet the conditions from the collectionItems list
   → Call IsMatchRequirement as well
   → Group by key (GroupBy key), take one representative per group
   → Add to the candidate list

3. Check if the current song's illustration is unlocked
   → SaveManagement.LoadInt("StringLiteral_11797" + songsKey) <= 0
   → If not unlocked, create IllustrationInfo (getPower=30), add to the candidate list
```

#### Step 2: Build Random Weight Pool
```csharp
// Filter items with getPower > 100 (Check if there are high-weight items)
bool hasHighPower = GetableItems.Any(i => i.getPower > 100);

if (hasHighPower) {
    // Remove items with getPower < 101 (Only keep high-weight items for subsequent drawing)
    GetableItems.RemoveAll(i => i.getPower < 101);
}

// Extract all distinct getPower values and sort them
List<int> powerPool = GetableItems.Select(c => c.getPower).Distinct().ToList();
powerPool.Sort();
```

#### Step 3: Cryptographic Random Number Generation (`RandomInt`)
```csharp
// Use RNGCryptoServiceProvider to generate a cryptographically secure random number
byte[] bytes = new byte[4];
new RNGCryptoServiceProvider().GetBytes(bytes);
return BitConverter.ToInt32(bytes, 0);
```
**Note: A cryptographically secure random number is used, not pseudorandom.**

#### Step 4: Weight Drawing Algorithm
```csharp
int randomScore = Abs(RandomInt()) % 100 + 1;  // 1~100
this.randomScore = randomScore;
this.randomScoreGet = randomScore;
int poolPower = 0;

// Starting from the maximum value in the weight pool, subtract the weight value one by one
for (int i = powerPool.Count - 1; i >= 0; i--) {
    randomScore -= powerPool[i];
    if (randomScore <= 0) {
        poolPower = powerPool[i];  // Hit this weight
        break;
    }
}
// If the loop ends and it's still > 0, poolPower = 0
```

#### Step 5: Determine Drop Based on poolPower
```
if (poolPower < 1):
    → Do not drop items, instead drop data (KB)
    → Condition: score >= 880000
    → KB amount = (int)((score - 700000) * GetMaxKb / 30000.0) // using 300000.0 properly later
    → If the result is Infinity, give 0
    
if (poolPower >= 1):
    → Filter items with getPower == poolPower from the candidate list
    → Select one randomly: index = Abs(RandomInt()) % filteredList.Count
    → Call GetableItem.Get() to claim
```

#### Step 6: Display Drop Result
Display different UIs based on `KeyType`:
```
KeyType == 0 (Songs/Song Illustration):
    → collectedText = Key + "StringLiteral_12456"  (Might be " illustration unlocked" etc.)
    → Do not display an extra icon

KeyType == 1 (Collection/Collectibles):
    → collectedText = Localized text of multiLanguageTitle
    → Display collectedImage[3] (Collectible icon)
    → Set collectedTip button interactable
    → Trigger async operation upon first acquisition (b__5)

KeyType == 2 (Illustration/Song Illustration):
    → collectedText = Key + "StringLiteral_12457"
    → Display collectedImage[2]

KeyType == 3 (Head portrait/Avatar):
    → collectedText = Key + "StringLiteral_12458"
    → Display collectedImage[1]
```

## 3. Item Matching Conditions (`GetableItem.IsMatchRequirement`)

### getSong Field — Song Matching
```
getSong == 0:     Any song matches
getSong < 0:      Exact match: SongsIndex + getSong == 0 (i.e., SongsIndex == -getSong)
getSong > 0:      Chapter + Offset matching:
                  chapter = getSong / 10000
                  minIndex = getSong % 10000
                  Requirement: SongsIndex/10000 == chapter && SongsIndex%10000 >= minIndex
```

### getType Field — Condition Type

#### getType == -1: Unconditional
Return true directly.

#### getType == 0: Historical Score Match (Score Range)
```
getInfo1: Comma-separated list of "songsKeyXX" (XX = difficulty suffix, e.g., EZ/HD/IN/AT)
          Parsing: songsKey = substring(0, len-2), difficulty = substring(len-2)
          
For each entry:
  → Load the LevelRecord for this song and difficulty from save data
  → When getInfo2 is not empty: record.s >= parseInt(getInfo2)  (Minimum score)
  → When getInfo3 is not empty: record.s <= parseInt(getInfo3)  (Maximum score)
  
All entries must be satisfied simultaneously (AND)
```

#### getType == 1: Historical Score Match (ACC Range)
```
getInfo1: Same as above, comma-separated list of "songsKeyXX"

For each entry:
  → Load LevelRecord from save data
  → When getInfo2 is not empty: record.a >= parseFloat(getInfo2) - 0.01  (Minimum ACC)
  → When getInfo3 is not empty: record.a <= parseFloat(getInfo3) + 0.01  (Maximum ACC)
  
All entries must be satisfied simultaneously (AND)
```

#### getType == 2: Current Play Match (Difficulty + Score)
```
getInfo1: Difficulty requirement string
  → Empty string: Any difficulty
  → "StringLiteral_11470": Requires songsLevel == "StringLiteral_11469" (Probably HD requires EZ)
  → "StringLiteral_11471": Requires songsLevel to be 11469 or 11470
  → "StringLiteral_11472": Requires songsLevel != "StringLiteral_11472"
  
When getInfo2 is not empty: levelResultInfo.percent >= parseFloat(getInfo2) - 0.01
When getInfo3 is not empty: levelResultInfo.IntScore >= parseInt(getInfo3)
```

#### getType == 3: Current Play Match (Song name + Miss count + Score)
```
getInfo1: Comma-separated list of song names
  → Requires levelStartInfo.songsName to be in the list

When getInfo2 is not empty: FailedNoteCount <= parseInt(getInfo2)  (Maximum allowed miss count)
When getInfo3 is not empty: IntScore >= parseInt(getInfo3)          (Minimum score)
```

#### getType == 4: Avatar Unlock Count Match
```
getInfo1: Comma-separated list of avatar keys
getInfo2: Number of unlocks threshold required

Iterate through the list, count the number of unlocked avatars
→ Return true when unlocked count >= parseInt(getInfo2)
```

## 4. Data (KB/MB) Drop Mechanism

### Trigger Conditions
When the weight drawing result is `poolPower < 1` (i.e., no item is drawn), it drops data instead.

### First Run
`isFirstRun == true` → Directly gives 32 MB.

### Normal Drop
Condition: `IntScore >= 880000` (Score is at least 880,000)

```csharp
int maxKb = GetMaxKb();  // Determined based on difficulty level
float kb = (float)((score - 700000) * maxKb) / 300000.0f;
if (kb == float.PositiveInfinity) kb = 0;
Money money = Money.ForKB((int)kb);
```

### GetMaxKb — Maximum KB Corresponding to Difficulty
Based on the string hash match of `songsDifficulty`:
| Return Value | Corresponding Difficulty |
|--------|----------|
| 256 | Most normal difficulties (Default value) |
| 512 | Higher difficulties (StringLiteral_1528, 1529, 1530) |
| 768 | High difficulties (StringLiteral_12504, 12505, 12506) |
| 1024 | Even higher difficulties (StringLiteral_12507, 12508) |
| 1280 | Extremely high difficulties (StringLiteral_12509) |
| 1536 | Highest difficulties (StringLiteral_1558, 12510) |

**Data Calculation Formula**: `KB = (score - 700000) / 300000 × maxKb`
- 880,000 score → (880000-700000)/300000 × maxKb = 0.6 × maxKb
- 1,000,000 score → (1000000-700000)/300000 × maxKb = 1.0 × maxKb
- That is, at perfect score, exactly maxKb of data is obtained

## 5. SideStory Special Drops

### ForceGetSideStory4BeginCollection
When all songs (16 in total) of the three SideStory chapters (matched via `chapterCode` to StringLiteral_12478/12479/12480) are fully cleared:
- If not claimed yet (`SaveManagement.LoadBool(StringLiteral_12511) == false`)
- Force drop the specific collectible `StringLiteral_11635`
- Mark as claimed `SaveManagement.SaveBool(StringLiteral_12511, true)`
- Skip the normal drop flow

### GetSideStoryChapterSongFinishNum
Counts the number of cleared songs across the three SideStory chapters (having a score on any difficulty counts as cleared).

## 6. Key Conclusions

1. **Reason for gaining collectibles while idling**: In `IsMatchRequirement`, `getType == -1` returns true directly, and `getSong == 0` matches any song. As long as an item's condition is configured as unconditional (getType=-1, getSong=0), it can enter the candidate pool even with a score of 0. The weight drawing uses `randomScore = Abs(RandomInt()) % 100 + 1`, which is unrelated to the player's score.

2. **Specific collectibles require specific songs and scores**: When `getType` is 0/1/2/3, conditions such as song, difficulty, score, ACC, and miss count are checked. Only items that meet the conditions will enter the candidate pool.

3. **Drop probability is determined by getPower**: The getPower values of all candidate items form the weight pool. A random number from 1 to 100 is subtracted by weights one by one starting from the largest; whichever weight is hit, a random item is selected from the items with that weight.

4. **Data drop is a pity mechanism**: When no item is drawn (poolPower < 1), if the score >= 880,000, calculate the KB amount according to the formula. If the score is below 880,000, nothing drops.

5. **Random numbers are cryptographically secure**: Utilizes `RNGCryptoServiceProvider`, making them unpredictable and not reproducible via a seed.

6. **Collectible chapter division**: Distinguished via the `CollectionItem.category` field (MAIN_STORY, SIDE_STORY, MISC), but the drop judgment itself does not differentiate between chapters; chapters only affect UI display.

7. **Song illustration drops**: Every song's illustration is an independent `IllustrationInfo` with getPower=30; as long as that song's illustration is not unlocked, it is added to the candidate pool.