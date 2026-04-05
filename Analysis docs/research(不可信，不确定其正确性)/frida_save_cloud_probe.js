'use strict';

const base = Module.findBaseAddress('UnityFramework');
if (base === null) {
  throw new Error('UnityFramework not found');
}

const OFFSETS = {
  SaveManagement_Encrypt: 0x11DEFBC,
  SaveManagement_Decrypt: 0x11DFD4C,
  SaveManagement_Encrypt2: 0x11E1624,
  SaveManagement_Decrypt2: 0x11E1B4C,
  CloudSaveManager_SaveToFolder: 0x117E22C,
  CloudSaveManager_LoadFromFolder: 0x117E7A4,
  CloudSaveManager_SyncSave_MoveNext: 0x11820F4,
  CloudSaveSummary_FromLocalSave: 0x11818CC,
  CloudSaveSummary_Deserialize: 0x11843E0,
};

function p(name) {
  return base.add(OFFSETS[name]);
}

function readIl2CppString(ptr) {
  if (ptr.isNull()) return null;
  try {
    const len = Memory.readU32(ptr.add(0x10));
    if (len > 0x400) return `<len=${len}>`;
    return Memory.readUtf16String(ptr.add(0x14), len);
  } catch (e) {
    return `<bad-string ${ptr}>`;
  }
}

function logHit(name, extra) {
  if (extra) {
    console.log(`[save-cloud] ${name}: ${extra}`);
  } else {
    console.log(`[save-cloud] ${name}`);
  }
}

Interceptor.attach(p('SaveManagement_Encrypt'), {
  onEnter(args) {
    logHit('SaveManagement.Encrypt', `plain=${readIl2CppString(args[0])}`);
  }
});

Interceptor.attach(p('SaveManagement_Decrypt'), {
  onEnter(args) {
    logHit('SaveManagement.Decrypt', `cipher=${readIl2CppString(args[0])}`);
  }
});

Interceptor.attach(p('SaveManagement_Encrypt2'), {
  onEnter(args) {
    logHit('SaveManagement.Encrypt2', `byteArray=${args[0]}`);
  }
});

Interceptor.attach(p('SaveManagement_Decrypt2'), {
  onEnter(args) {
    logHit('SaveManagement.Decrypt2', `byteArray=${args[0]}`);
  }
});

Interceptor.attach(p('CloudSaveManager_SaveToFolder'), {
  onEnter(args) {
    logHit('CloudSaveManager.SaveToFolder', `path=${readIl2CppString(args[1])}`);
  }
});

Interceptor.attach(p('CloudSaveManager_LoadFromFolder'), {
  onEnter(args) {
    logHit(
      'CloudSaveManager.LoadFromFolder',
      `path=${readIl2CppString(args[1])} loadSettings=${args[2].toInt32()} saveVersion=${args[3].toInt32()}`
    );
  }
});

Interceptor.attach(p('CloudSaveSummary_FromLocalSave'), {
  onEnter() {
    logHit('CloudSaveSummary.FromLocalSave');
  }
});

Interceptor.attach(p('CloudSaveSummary_Deserialize'), {
  onEnter(args) {
    logHit('CloudSaveSummary.Deserialize', `summary=${readIl2CppString(args[0])}`);
  }
});

Interceptor.attach(p('CloudSaveManager_SyncSave_MoveNext'), {
  onEnter() {
    logHit('CloudSaveManager._SyncSave_d__14.MoveNext');
  }
});

console.log(`[save-cloud] UnityFramework base=${base}`);
