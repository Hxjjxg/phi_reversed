'use strict';

// Full local-save dumper (console mode)
// - Dumps plaintext key/value
// - Dumps encrypted key/value ("raw")
// - Adds base64 of raw UTF-8 bytes
// - Attempts JSON parse for plaintext values

const OFFSETS = {
  SaveManagement_SaveString: 0x1e9654c,
  SaveManagement_LoadString: 0x1e97004,
  SaveManagement_DecryptStr: 0x1e9689c,
  SaveManagement_Encrypt2: 0x1e98104,
  SaveManagement_Decrypt2: 0x1e985fc,
  SaveManagement_DecryptLegacyBytes: 0x1e97d30,
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

function nowIso() {
  return new Date().toISOString();
}

let seq = 0;
function nextId(tag) {
  seq += 1;
  return `${tag}_${Date.now()}_${seq}`;
}

function readIl2CppString(obj) {
  if (!obj || obj.isNull()) {
    return null;
  }
  try {
    const len = obj.add(0x10).readU32();
    if (len > 0x200000) {
      return `<str-len-too-large:${len}>`;
    }
    return obj.add(0x14).readUtf16String(len);
  } catch (e) {
    return `<bad-str:${obj}>`;
  }
}

function readIl2CppByteArray(obj) {
  if (!obj || obj.isNull()) {
    return null;
  }
  try {
    const len = obj.add(0x18).readU32();
    if (len > 0x1000000) {
      return {
        len,
        bytes: null,
      };
    }
    const dataPtr = obj.add(0x20);
    const bytes = [];
    for (let i = 0; i < len; i += 1) {
      bytes.push(dataPtr.add(i).readU8());
    }
    return {
      len,
      bytes,
    };
  } catch (e) {
    return null;
  }
}

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);

    if (code < 0x80) {
      out.push(code);
      continue;
    }

    if (code < 0x800) {
      out.push(0xc0 | (code >> 6));
      out.push(0x80 | (code & 0x3f));
      continue;
    }

    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const low = str.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const cp = (((code - 0xd800) << 10) | (low - 0xdc00)) + 0x10000;
        out.push(0xf0 | (cp >> 18));
        out.push(0x80 | ((cp >> 12) & 0x3f));
        out.push(0x80 | ((cp >> 6) & 0x3f));
        out.push(0x80 | (cp & 0x3f));
        i += 1;
        continue;
      }
    }

    out.push(0xe0 | (code >> 12));
    out.push(0x80 | ((code >> 6) & 0x3f));
    out.push(0x80 | (code & 0x3f));
  }
  return out;
}

function bytesToBase64(bytes) {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    const n = (b0 << 16) | (b1 << 8) | b2;

    out += table[(n >> 18) & 0x3f];
    out += table[(n >> 12) & 0x3f];
    out += i + 1 < bytes.length ? table[(n >> 6) & 0x3f] : '=';
    out += i + 2 < bytes.length ? table[n & 0x3f] : '=';
  }

  return out;
}

function toUtf8Base64(str) {
  if (str === null || str === undefined) {
    return null;
  }
  return bytesToBase64(utf8Bytes(String(str)));
}

function tryParseJson(text) {
  if (typeof text !== 'string') {
    return { ok: false, reason: 'not-string' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

function emit(tag, payload) {
  console.log(`[save-full][dump] ${JSON.stringify({ id: nextId(tag), tag, time: nowIso(), ...payload })}`);
}

function attachHook(name, handlers) {
  try {
    const addr = p(name);
    Interceptor.attach(addr, handlers);
    console.log(`[save-full] hook ok: ${name} @ ${addr}`);
    return true;
  } catch (e) {
    console.log(`[save-full] hook fail: ${name} err=${e}`);
    return false;
  }
}

// In-memory snapshot keyed by plaintext key.
const snapshot = Object.create(null);

function updateSnapshot(plainKey, patch) {
  if (typeof plainKey !== 'string' || plainKey.length === 0) {
    return;
  }
  const prev = snapshot[plainKey] || { key: plainKey };
  snapshot[plainKey] = { ...prev, ...patch, updated_at: nowIso() };
}

// Thread-local contexts to correlate SaveString <-> PlayerPrefs.SetString.
const saveCtxByTid = new Map(); // tid -> queue of { key, value }
const loadCtxByTid = new Map(); // tid -> stack of key
const folderLoadCtxByTid = new Map(); // tid -> { folder, isSilent, saveVer, decryptIndex }

console.log(`[save-full] base=${base}`);
let installed = 0;

installed += Number(
  attachHook('CloudSaveManager_LoadFromFolder', {
    onEnter(args) {
      const tid = Process.getCurrentThreadId();
      const folder = readIl2CppString(args[0]);
      const isSilent = Number(args[1]) & 1;
      const saveVer = Number(args[2]);

      folderLoadCtxByTid.set(tid, {
        folder,
        isSilent,
        saveVer,
        decryptIndex: 0,
      });

      emit('load_from_folder_enter', {
        folder,
        is_silent: isSilent,
        save_ver: saveVer,
      });
    },
    onLeave() {
      const tid = Process.getCurrentThreadId();
      const ctx = folderLoadCtxByTid.get(tid) || null;
      emit('load_from_folder_leave', {
        folder: ctx ? ctx.folder : null,
        is_silent: ctx ? ctx.isSilent : null,
        save_ver: ctx ? ctx.saveVer : null,
      });
      folderLoadCtxByTid.delete(tid);
    },
  })
);

installed += Number(
  attachHook('SaveManagement_SaveString', {
    onEnter(args) {
      const tid = Process.getCurrentThreadId();
      const key = readIl2CppString(args[0]);
      const value = readIl2CppString(args[1]);

      const q = saveCtxByTid.get(tid) || [];
      q.push({ key, value });
      saveCtxByTid.set(tid, q);

      const parsed = tryParseJson(value);
      updateSnapshot(key, {
        plain_value: value,
        parsed_json: parsed.ok ? parsed.value : null,
      });

      emit('save_string_plain', {
        key,
        value,
        parsed_json_ok: parsed.ok,
      });
    },
  })
);

installed += Number(
  attachHook('PlayerPrefs_SetString', {
    onEnter(args) {
      const tid = Process.getCurrentThreadId();
      const encKey = readIl2CppString(args[0]);
      const encValue = readIl2CppString(args[1]);

      const q = saveCtxByTid.get(tid) || [];
      const pair = q.length > 0 ? q.shift() : null;
      saveCtxByTid.set(tid, q);

      const plainKey = pair ? pair.key : null;
      const plainValue = pair ? pair.value : null;
      const parsed = tryParseJson(plainValue);

      if (plainKey) {
        updateSnapshot(plainKey, {
          plain_value: plainValue,
          parsed_json: parsed.ok ? parsed.value : null,
          raw_encrypted_key: encKey,
          raw_encrypted_value: encValue,
          raw_encrypted_key_base64_utf8: toUtf8Base64(encKey),
          raw_encrypted_value_base64_utf8: toUtf8Base64(encValue),
          source: 'save',
        });
      }

      emit('playerprefs_setstring', {
        plain_key: plainKey,
        plain_value: plainValue,
        parsed_json_ok: parsed.ok,
        raw_encrypted_key: encKey,
        raw_encrypted_value: encValue,
        raw_encrypted_key_base64_utf8: toUtf8Base64(encKey),
        raw_encrypted_value_base64_utf8: toUtf8Base64(encValue),
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_LoadString', {
    onEnter(args) {
      const tid = Process.getCurrentThreadId();
      const key = readIl2CppString(args[0]);
      const st = loadCtxByTid.get(tid) || [];
      st.push(key);
      loadCtxByTid.set(tid, st);
    },
    onLeave(retval) {
      const tid = Process.getCurrentThreadId();
      const st = loadCtxByTid.get(tid) || [];
      const key = st.length > 0 ? st.pop() : null;
      loadCtxByTid.set(tid, st);

      const plain = readIl2CppString(retval);
      const parsed = tryParseJson(plain);

      if (key) {
        updateSnapshot(key, {
          plain_value: plain,
          parsed_json: parsed.ok ? parsed.value : null,
          source: 'load',
        });
      }

      emit('load_string_plain', {
        key,
        value: plain,
        parsed_json_ok: parsed.ok,
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_DecryptStr', {
    onEnter(args) {
      this.cipher = readIl2CppString(args[0]);
      const tid = Process.getCurrentThreadId();
      const st = loadCtxByTid.get(tid) || [];
      this.loadKey = st.length > 0 ? st[st.length - 1] : null;
    },
    onLeave(retval) {
      const plain = readIl2CppString(retval);
      const parsed = tryParseJson(plain);

      if (this.loadKey) {
        updateSnapshot(this.loadKey, {
          plain_value: plain,
          parsed_json: parsed.ok ? parsed.value : null,
          raw_encrypted_value: this.cipher,
          raw_encrypted_value_base64_utf8: toUtf8Base64(this.cipher),
          source: 'load',
        });
      }

      emit('decrypt_pair', {
        load_key: this.loadKey,
        raw_encrypted_value: this.cipher,
        raw_encrypted_value_base64_utf8: toUtf8Base64(this.cipher),
        plain_value: plain,
        parsed_json_ok: parsed.ok,
      });
    },
  })
);

installed += Number(
  attachHook('PlayerPrefs_Save', {
    onEnter() {
      const entries = Object.values(snapshot);
      emit('full_snapshot', {
        count: entries.length,
        entries,
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_Encrypt2', {
    onEnter(args) {
      const arr = readIl2CppByteArray(args[0]);
      emit('encrypt2_input', {
        len: arr ? arr.len : -1,
        data_base64: arr && arr.bytes ? bytesToBase64(arr.bytes) : null,
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_Decrypt2', {
    onEnter(args) {
      const tid = Process.getCurrentThreadId();
      const arr = readIl2CppByteArray(args[0]);
      const ctx = folderLoadCtxByTid.get(tid) || null;
      let moduleIndex = -1;
      if (ctx) {
        moduleIndex = ctx.decryptIndex;
        ctx.decryptIndex += 1;
        folderLoadCtxByTid.set(tid, ctx);
      }

      this.decrypt2Ctx = {
        tid,
        folder: ctx ? ctx.folder : null,
        saveVer: ctx ? ctx.saveVer : null,
        moduleIndex,
        cipher: arr,
      };

      emit('decrypt2_input', {
        folder: this.decrypt2Ctx.folder,
        save_ver: this.decrypt2Ctx.saveVer,
        module_index: moduleIndex,
        len: arr ? arr.len : -1,
        data_base64: arr && arr.bytes ? bytesToBase64(arr.bytes) : null,
      });
    },
    onLeave(retval) {
      const plain = readIl2CppByteArray(retval);
      const ctx = this.decrypt2Ctx || null;
      emit('decrypt2_output', {
        folder: ctx ? ctx.folder : null,
        save_ver: ctx ? ctx.saveVer : null,
        module_index: ctx ? ctx.moduleIndex : -1,
        cipher_len: ctx && ctx.cipher ? ctx.cipher.len : -1,
        cipher_base64: ctx && ctx.cipher && ctx.cipher.bytes ? bytesToBase64(ctx.cipher.bytes) : null,
        plain_len: plain ? plain.len : -1,
        plain_base64: plain && plain.bytes ? bytesToBase64(plain.bytes) : null,
      });
    },
  })
);

installed += Number(
  attachHook('SaveManagement_DecryptLegacyBytes', {
    onEnter(args) {
      const arr = readIl2CppByteArray(args[0]);
      emit('decrypt_legacy_input', {
        len: arr ? arr.len : -1,
        data_base64: arr && arr.bytes ? bytesToBase64(arr.bytes) : null,
      });
    },
  })
);

console.log(`[save-full] hooks installed: ${installed}`);
