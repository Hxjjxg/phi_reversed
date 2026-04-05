'use strict';

const base = Module.findBaseAddress('UnityFramework');
if (base === null) {
  throw new Error('UnityFramework not found');
}

const OFFSETS = {
  ChapterSelector_LoadSongSelector: 0x117B3E0,
  SongSelector_Start: 0x11F3ECC,
  SongSelector_GameStart: 0x11FA3F0,
  SongsItem_GetLevelStartInfo: 0x11FB460,
  SongSelectorItem_GetLevelStartInfo: 0x11FB2F8,
  LevelControl_SetCodeForNote: 0x11ACFF8,
  ScoreControl_SetNoteCodeList: 0x11E2418,
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
    console.log(`[song-chart] ${name}: ${extra}`);
  } else {
    console.log(`[song-chart] ${name}`);
  }
}

Interceptor.attach(p('ChapterSelector_LoadSongSelector'), {
  onEnter(args) {
    logHit('ChapterSelector.LoadSongSelector', `chapterCode=${readIl2CppString(args[1])}`);
  }
});

Interceptor.attach(p('SongSelector_Start'), {
  onEnter() {
    logHit('SongSelector.Start');
  }
});

Interceptor.attach(p('SongSelector_GameStart'), {
  onEnter(args) {
    logHit('SongSelector.GameStart', `songIndex=${args[1].toInt32()} levelIndex=${args[2].toInt32()}`);
  }
});

Interceptor.attach(p('SongsItem_GetLevelStartInfo'), {
  onEnter(args) {
    logHit('SongsItem.GetLevelStartInfo', `level=${args[1].toInt32()}`);
  }
});

Interceptor.attach(p('SongSelectorItem_GetLevelStartInfo'), {
  onEnter(args) {
    logHit('SongSelectorItem.GetLevelStartInfo', `level=${args[1].toInt32()}`);
  }
});

Interceptor.attach(p('LevelControl_SetCodeForNote'), {
  onEnter() {
    logHit('LevelControl.SetCodeForNote');
  }
});

Interceptor.attach(p('ScoreControl_SetNoteCodeList'), {
  onEnter(args) {
    logHit('ScoreControl.SetNoteCodeList', `this=${args[0]}`);
  }
});

console.log(`[song-chart] UnityFramework base=${base}`);
