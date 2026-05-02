'use strict';

// Based on RVAs from binary_file_and_exported_symbols/dump_android.cs
// Dll: Assembly-CSharp.dll
const OFFSETS = {
  SaveManagement_SaveBool: 0x1e92be4,
  SaveManagement_SaveInt: 0x1e96378,
  SaveManagement_SaveString: 0x1e9654c,
  SaveManagement_Encrypt2: 0x1e98104,
  SaveManagement_DecryptBytes: 0x1e97d30,
  SaveManagement_Decrypt2: 0x1e985fc,
  CloudSaveManager_SaveToFolder: 0x1f3b0f0,
  CloudSaveManager_LoadFromFolder: 0x1f3b68c,
  PlayerPrefs_SetString: 0x1a8b01c,
  PlayerPrefs_Save: 0x1a8b250,
};

const targetModule = Process.findModuleByName('libil2cpp.so') || Process.findModuleByName('UnityFramework');
if (targetModule === null) {
  throw new Error('Cannot find libil2cpp.so or UnityFramework');
}
const base = targetModule.base;

function p(name) {
  return base.add(OFFSETS[name]);
}

function clip(s, maxLen = 120) {
  if (s === null || s === undefined) {
    return String(s);
  }
  const text = String(s);
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}...<len=${text.length}>`;
}

function nowTag() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '_',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
    '_',
    pad(d.getMilliseconds(), 3),
  ].join('');
}

let seq = 0;
function nextId(prefix) {
  seq += 1;
  return `${prefix}_${nowTag()}_${String(seq).padStart(6, '0')}`;
}

function readIl2CppString(obj) {
  if (obj.isNull()) {
    return null;
  }
  try {
    const len = obj.add(0x10).readU32();
    if (len > 0x2000) {
      return `<str-len-too-large:${len}>`;
    }
    return obj.add(0x14).readUtf16String(len);
  } catch (e) {
    return `<bad-str:${obj}>`;
  }
}

function readIl2CppByteArray(obj) {
  if (obj.isNull()) {
    return null;
  }

  try {
    // Il2CppArray on 64-bit:
    // 0x00 obj header (klass + monitor)
    // 0x10 bounds ptr
    // 0x18 max_length (uintptr_t)
    // 0x20 data[0]
    const len = Number(obj.add(0x18).readU64());
    if (!Number.isFinite(len) || len < 0 || len > 64 * 1024 * 1024) {
      return null;
    }
    const dataPtr = obj.add(0x20);
    const bytes = dataPtr.readByteArray(len);
    return { len, bytes };
  } catch (e) {
    return null;
  }
}

function emitDump(tag, fields) {
  const payload = {
    id: nextId(tag),
    tag,
    time: new Date().toISOString(),
    ...fields,
  };
  console.log(`[save-dump][dump] ${JSON.stringify(payload)}`);
}

function toHexPreview(buffer, maxBytes = 96) {
  if (buffer == null) {
    return '';
  }
  const u8 = new Uint8Array(buffer);
  const n = Math.min(u8.length, maxBytes);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(u8[i].toString(16).padStart(2, '0'));
  }
  return out.join('');
}

function dumpByteArray(tag, arrObj) {
  const pack = readIl2CppByteArray(arrObj);
  if (pack === null) {
    emitDump(tag, { valid: false });
    return null;
  }

  emitDump(tag, {
    valid: true,
    len: pack.len,
    hex_preview: toHexPreview(pack.bytes, 96),
    truncated: pack.len > 96,
  });
  return true;
}

function readPathArg(args) {
  const s0 = readIl2CppString(args[0]);
  if (s0 !== null && !s0.startsWith('<bad-str')) {
    return s0;
  }
  const s1 = readIl2CppString(args[1]);
  return s1;
}

function attachHook(name, handlers) {
  try {
    const addr = p(name);
    Interceptor.attach(addr, handlers);
    console.log(`[save-dump] hook ok: ${name} @ ${addr}`);
    return true;
  } catch (e) {
    console.log(`[save-dump] hook fail: ${name} err=${e}`);
    return false;
  }
}

console.log(`[save-dump] base=${base}`);
console.log('[save-dump] dump_mode=console');

let installed = 0;

installed += Number(
  attachHook('CloudSaveManager_SaveToFolder', {
  onEnter(args) {
    const path = readPathArg(args);
    console.log(`[save-dump] CloudSaveManager.SaveToFolder path=${path}`);
  },
  })
);

installed += Number(
  attachHook('CloudSaveManager_LoadFromFolder', {
  onEnter(args) {
    const path = readPathArg(args);
    let loadSettings = 0;
    let saveVersion = 0;

    try {
      loadSettings = args[1].toInt32();
      saveVersion = args[2].toInt32();
    } catch (_) {
      // Some builds include MethodInfo* at different register position.
    }

    console.log(
      `[save-dump] CloudSaveManager.LoadFromFolder path=${path} loadSettings=${loadSettings} saveVersion=${saveVersion}`
    );
  },
  })
);

installed += Number(
  attachHook('SaveManagement_SaveString', {
    onEnter(args) {
      const key = readIl2CppString(args[0]);
      const value = readIl2CppString(args[1]);
      emitDump('save_string_plain', {
        key: clip(key, 512),
        value: clip(value, 1024),
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_SaveInt', {
    onEnter(args) {
      const key = readIl2CppString(args[0]);
      const value = args[1].toInt32();
      emitDump('save_int_plain', {
        key: clip(key, 512),
        value,
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_SaveBool', {
    onEnter(args) {
      const key = readIl2CppString(args[0]);
      const value = args[1].toInt32();
      emitDump('save_bool_plain', {
        key: clip(key, 512),
        value,
      });
    },
  })
);

installed += Number(
  attachHook('PlayerPrefs_SetString', {
    onEnter(args) {
      const keyEnc = readIl2CppString(args[0]);
      const valueEnc = readIl2CppString(args[1]);
      emitDump('playerprefs_setstring', {
        key_enc: clip(keyEnc, 1024),
        value_enc: clip(valueEnc, 1024),
      });
    },
  })
);

installed += Number(
  attachHook('PlayerPrefs_Save', {
    onEnter() {
      emitDump('playerprefs_save', {
        note: 'flush to local storage backend',
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_Encrypt2', {
  onEnter(args) {
    this.id = nextId('encrypt2');
    dumpByteArray(`${this.id}_in_plain`, args[0]);
  },
  onLeave(retval) {
    dumpByteArray(`${this.id}_out_cipher`, retval);
  },
  })
);

installed += Number(
  attachHook('SaveManagement_Decrypt2', {
  onEnter(args) {
    this.id = nextId('decrypt2');
    dumpByteArray(`${this.id}_in_cipher`, args[0]);
  },
  onLeave(retval) {
    dumpByteArray(`${this.id}_out_plain`, retval);
  },
  })
);

// saveVersion < 2 branch in CloudSaveManager.LoadFromFolder uses Decrypt (legacy)
installed += Number(
  attachHook('SaveManagement_DecryptBytes', {
  onEnter(args) {
    this.id = nextId('decrypt_legacy');
    dumpByteArray(`${this.id}_in_cipher`, args[0]);
  },
  onLeave(retval) {
    dumpByteArray(`${this.id}_out_plain`, retval);
  },
  })
);

console.log(`[save-dump] hooks installed: ${installed}`);