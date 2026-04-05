# Frida 17+ API 迁移指南

> Frida 17.0.0 于 2025 年 5 月发布，包含多项破坏性变更。本文档供 Agent / LLM 在编写或审查 Frida 脚本时参考。

## 1. 静态 Module 方法已移除

所有 `Module` 上的静态查找方法已删除，改为先通过 `Process` 获取模块实例，再调用实例方法。

### 模块基址

```javascript
// ❌ 旧写法
Module.findBaseAddress('libc.so')
Module.getBaseAddress('libc.so')

// ✅ 新写法
Process.findModuleByName('libc.so').base   // 找不到返回 null
Process.getModuleByName('libc.so').base    // 找不到抛异常
```

### 导出函数查找

```javascript
// ❌ 旧写法 — 指定模块
Module.findExportByName('libc.so', 'open')
Module.getExportByName('libc.so', 'open')

// ✅ 新写法 — 指定模块
Process.getModuleByName('libc.so').findExportByName('open')
Process.getModuleByName('libc.so').getExportByName('open')

// ❌ 旧写法 — 全局查找 (第一个参数为 null)
Module.findExportByName(null, 'open')
Module.getExportByName(null, 'open')
Module.findSymbolByName(null, 'open')
Module.getSymbolByName(null, 'open')

// ✅ 新写法 — 全局查找
Module.findGlobalExportByName('open')
Module.getGlobalExportByName('open')
```

### 枚举导出 / 符号

```javascript
// ❌ 旧写法
Module.enumerateExports('libc.so')
Module.enumerateSymbols('libc.so')
Module.ensureInitialized('libc.so')

// ✅ 新写法
const libc = Process.getModuleByName('libc.so');
libc.enumerateExports()
libc.enumerateSymbols()
libc.ensureInitialized()
```

### 推荐：缓存模块引用

```javascript
const libc = Process.getModuleByName('libc.so');
const openImpl  = libc.getExportByName('open');
const readImpl  = libc.getExportByName('read');
const writeImpl = libc.getExportByName('write');
```

## 2. 静态 Memory 读写方法已移除

所有 `Memory.readXxx()` / `Memory.writeXxx()` 静态方法已删除，改用 `NativePointer` 实例方法。

```javascript
// ❌ 旧写法
Memory.readU32(somePtr)
Memory.writeU32(somePtr, value)
Memory.readByteArray(somePtr, length)
Memory.readCString(somePtr)
Memory.readUtf8String(somePtr)
Memory.readUtf16String(somePtr)
Memory.readAnsiString(somePtr)
Memory.readInt(somePtr)
Memory.writeUInt(somePtr)

// ✅ 新写法
somePtr.readU32()
somePtr.writeU32(value)
somePtr.readByteArray(length)
somePtr.readCString()
somePtr.readUtf8String()
somePtr.readUtf16String()
somePtr.readAnsiString()
somePtr.readInt()
somePtr.writeUInt()
```

写方法现在返回 `NativePointer` 自身，支持链式调用：

```javascript
ptr('0x1234')
    .add(4).writeU32(13)
    .add(4).writeU16(37)
    .add(2).writeU16(42);
```

## 3. 旧式枚举 API 已移除

回调风格和 `Sync` 后缀的枚举方法全部删除，统一返回数组。

```javascript
// ❌ 旧写法
Process.enumerateModules({ onMatch: fn, onComplete: fn })
Process.enumerateModulesSync()

// ✅ 新写法 — 直接返回数组
for (const mod of Process.enumerateModules()) {
    console.log(mod.name);
}
```

同理适用于 `enumerateRanges()`、`enumerateThreads()` 等所有枚举 API。

## 4. 运行时桥接不再内置

`ObjC`、`Java`、`Swift` 桥接不再打包在 GumJS 运行时中。

- REPL 和 `frida-trace` 仍内置三个桥接，一次性脚本不受影响。
- 使用 `frida-compile` 编译 Agent 时，需要显式导入：

```typescript
import Java from "frida-java-bridge";
import ObjC  from "frida-objc-bridge";
import Swift  from "frida-swift-bridge";
```

安装步骤：

```bash
frida-create -t agent
npm install
npm install frida-java-bridge    # 按需安装
npm install frida-objc-bridge
npm install frida-swift-bridge
```

## 5. 保留标识符

以下名称为 Frida 内置，不可作为自定义函数 / 变量名，否则抛出 `TypeError: cannot define variable`：

| 保留名 | 说明 | 替代命名建议 |
|--------|------|-------------|
| `hexdump` | 内置十六进制转储函数 | `dumpHex` |
| `ptr` | 指针构造快捷方式 | `ptrAddr` |
| `NULL` | 空指针常量 | `nullVal` |

## 6. NativePointer 常用实例方法速查

### 读取

| 方法 | 说明 |
|------|------|
| `readU8()` / `readS8()` | 无符号/有符号 8 位 |
| `readU16()` / `readS16()` | 无符号/有符号 16 位 |
| `readU32()` / `readS32()` | 无符号/有符号 32 位 |
| `readU64()` / `readS64()` | 无符号/有符号 64 位 |
| `readByteArray(length)` | 返回 ArrayBuffer |
| `readPointer()` | 读取指针 |
| `readCString()` | 读取 C 字符串 |
| `readUtf8String()` | 读取 UTF-8 字符串 |
| `readUtf16String()` | 读取 UTF-16 字符串 |

### 写入（均返回 NativePointer 自身，可链式调用）

| 方法 | 说明 |
|------|------|
| `writeU8(v)` / `writeS8(v)` | 写入 8 位 |
| `writeU16(v)` / `writeS16(v)` | 写入 16 位 |
| `writeU32(v)` / `writeS32(v)` | 写入 32 位 |
| `writeU64(v)` / `writeS64(v)` | 写入 64 位 |
| `writeByteArray(bytes)` | bytes 为 ArrayBuffer 或 JS 数组 |
| `writePointer(ptr)` | 写入指针 |
| `writeUtf8String(str)` | 写入 UTF-8 字符串 |

### 指针运算

`add(rhs)` · `sub(rhs)` · `and(rhs)` · `or(rhs)` · `xor(rhs)` · `shr(n)` · `shl(n)` · `not()` · `isNull()` · `equals(rhs)` · `compare(rhs)`

### 注意

- `toUInt32()` 不存在，使用 `toInt32()`（值 < 2^31 时等效）。

## 7. 常见迁移模式

### Hook libc 函数

```javascript
const libc = Process.findModuleByName('libc.so');
if (libc) {
    const open = libc.findExportByName('open');
    if (open) {
        Interceptor.attach(open, {
            onEnter(args) {
                console.log('open(' + args[0].readCString() + ')');
            }
        });
    }
}
```

### 等待库加载

```javascript
function waitForLibrary(name, callback) {
    const lib = Process.findModuleByName(name);
    if (lib) { callback(lib); return; }
    const timer = setInterval(() => {
        const lib = Process.findModuleByName(name);
        if (lib) { clearInterval(timer); callback(lib); }
    }, 500);
}
```

### Java 层 Hook（无变化）

```javascript
Java.perform(() => {
    const MyClass = Java.use('com.example.MyClass');
    MyClass.myMethod.implementation = function(arg) {
        console.log('called with: ' + arg);
        return this.myMethod(arg);
    };
});
```

## 参考链接

- [Frida 17.0.0 Release Notes](https://frida.re/news/2025/05/17/frida-17-0-0-released/)
- [Frida JavaScript API](https://frida.re/docs/javascript-api/)
- [Frida Bridges 文档](https://frida.re/docs/bridges/)
