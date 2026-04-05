# Frida 17+ API Migration Guide

> Frida 17.0.0 was released in May 2025 and includes multiple braking changes. This document is provided for Agents / LLMs to reference when writing or reviewing Frida scripts.

## 1. Static Module Methods Removed

All static lookup methods on `Module` have been deleted. You should first get the module instance through `Process`, and then call the instance methods.

### Module Base Address

```javascript
// ❌ Old
Module.findBaseAddress('libc.so')
Module.getBaseAddress('libc.so')

// ✅ New
Process.findModuleByName('libc.so').base   // returns null if not found
Process.getModuleByName('libc.so').base    // throws exception if not found
```

### Export Function Lookup

```javascript
// ❌ Old — specify module
Module.findExportByName('libc.so', 'open')
Module.getExportByName('libc.so', 'open')

// ✅ New — specify module
Process.getModuleByName('libc.so').findExportByName('open')
Process.getModuleByName('libc.so').getExportByName('open')

// ❌ Old — global lookup (first parameter is null)
Module.findExportByName(null, 'open')
Module.getExportByName(null, 'open')
Module.findSymbolByName(null, 'open')
Module.getSymbolByName(null, 'open')

// ✅ New — global lookup
Module.findGlobalExportByName('open')
Module.getGlobalExportByName('open')
```

### Enumerate Exports / Symbols

```javascript
// ❌ Old
Module.enumerateExports('libc.so')
Module.enumerateSymbols('libc.so')
Module.ensureInitialized('libc.so')

// ✅ New
const libc = Process.getModuleByName('libc.so');
libc.enumerateExports()
libc.enumerateSymbols()
libc.ensureInitialized()
```

### Recommendation: Cache Module References

```javascript
const libc = Process.getModuleByName('libc.so');
const openImpl  = libc.getExportByName('open');
const readImpl  = libc.getExportByName('read');
const writeImpl = libc.getExportByName('write');
```

## 2. Static Memory Read/Write Methods Removed

All `Memory.readXxx()` / `Memory.writeXxx()` static methods have been deleted. Use `NativePointer` instance methods instead.

```javascript
// ❌ Old
Memory.readU32(somePtr)
Memory.writeU32(somePtr, value)
Memory.readByteArray(somePtr, length)
Memory.readCString(somePtr)
Memory.readUtf8String(somePtr)
Memory.readUtf16String(somePtr)
Memory.readAnsiString(somePtr)
Memory.readInt(somePtr)
Memory.writeUInt(somePtr)

// ✅ New
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

Write methods now return the `NativePointer` itself, supporting method chaining:

```javascript
ptr('0x1234')
    .add(4).writeU32(13)
    .add(4).writeU16(37)
    .add(2).writeU16(42);
```

## 3. Old Enumeration APIs Removed

Callback-style and `Sync`-suffixed enumeration methods have all been deleted. They now uniformly return arrays.

```javascript
// ❌ Old
Process.enumerateModules({ onMatch: fn, onComplete: fn })
Process.enumerateModulesSync()

// ✅ New — directly returns array
for (const mod of Process.enumerateModules()) {
    console.log(mod.name);
}
```

The same applies to `enumerateRanges()`, `enumerateThreads()`, and all other enumeration APIs.

## 4. Runtime Bridges Are No Longer Built-in

The `ObjC`, `Java`, and `Swift` bridges are no longer bundled within the GumJS runtime.

- The REPL and `frida-trace` still pack the three bridges, so one-off scripts are unaffected.
- When compiling an Agent using `frida-compile`, they need to be imported explicitly:

```typescript
import Java from "frida-java-bridge";
import ObjC  from "frida-objc-bridge";
import Swift  from "frida-swift-bridge";
```

Installation steps:

```bash
frida-create -t agent
npm install
npm install frida-java-bridge    # install as needed
npm install frida-objc-bridge
npm install frida-swift-bridge
```

## 5. Reserved Identifiers

The following names are built into Frida and cannot be used as custom function/variable names. Doing so will throw `TypeError: cannot define variable`:

| Reserved Name | Description | Suggested Alternative |
|--------|------|-------------|
| `hexdump` | Built-in hexdump function | `dumpHex` |
| `ptr` | Pointer construction shortcut | `ptrAddr` |
| `NULL` | Null pointer constant | `nullVal` |

## 6. NativePointer Common Instance Methods Cheat Sheet

### Read

| Method | Description |
|------|------|
| `readU8()` / `readS8()` | Unsigned/Signed 8-bit |
| `readU16()` / `readS16()` | Unsigned/Signed 16-bit |
| `readU32()` / `readS32()` | Unsigned/Signed 32-bit |
| `readU64()` / `readS64()` | Unsigned/Signed 64-bit |
| `readByteArray(length)` | Returns ArrayBuffer |
| `readPointer()` | Reads pointer |
| `readCString()` | Reads C string |
| `readUtf8String()` | Reads UTF-8 string |
| `readUtf16String()` | Reads UTF-16 string |

### Write (all return the NativePointer itself to support chaining)

| Method | Description |
|------|------|
| `writeU8(v)` / `writeS8(v)` | Writes 8-bit |
| `writeU16(v)` / `writeS16(v)` | Writes 16-bit |
| `writeU32(v)` / `writeS32(v)` | Writes 32-bit |
| `writeU64(v)` / `writeS64(v)` | Writes 64-bit |
| `writeByteArray(bytes)` | bytes is ArrayBuffer or JS Array |
| `writePointer(ptr)` | Writes pointer |
| `writeUtf8String(str)` | Writes UTF-8 string |

### Pointer Arithmetic

`add(rhs)` · `sub(rhs)` · `and(rhs)` · `or(rhs)` · `xor(rhs)` · `shr(n)` · `shl(n)` · `not()` · `isNull()` · `equals(rhs)` · `compare(rhs)`

### Note

- `toUInt32()` does not exist; use `toInt32()` (equivalent when value < 2^31).

## 7. Common Migration Patterns

### Hooking libc functions

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

### Waiting for library load

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

### Java Layer Hooking (No Change)

```javascript
Java.perform(() => {
    const MyClass = Java.use('com.example.MyClass');
    MyClass.myMethod.implementation = function(arg) {
        console.log('called with: ' + arg);
        return this.myMethod(arg);
    };
});
```

## Reference Links

- [Frida 17.0.0 Release Notes](https://frida.re/news/2025/05/17/frida-17-0-0-released/)
- [Frida JavaScript API](https://frida.re/docs/javascript-api/)
- [Frida Bridges Documentation](https://frida.re/docs/bridges/)