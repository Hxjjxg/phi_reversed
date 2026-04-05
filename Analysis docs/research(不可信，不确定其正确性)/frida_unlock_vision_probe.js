'use strict';

const base = Module.findBaseAddress('UnityFramework');
if (base === null) {
  throw new Error('UnityFramework not found');
}

const OFFSETS = {
  SongSelector_GameStart: 0x11FA3F0,
  SongSelector_ReplaceWithMicroWave: 0x11FC2C8,
  SongSelector_ReplaceWithTheChariotReviival: 0x11FC770,
  ChallengeSongSelectorControl_SelectSong: 0x1170304,
  ChallengeSongSelectorControl_Play: 0x1170938,
  ChallengeModeControl_GameStart: 0x116D95C,
  VisionReplay_InitC8ReplayProcess: 0x11C9CEC,
  VisionReplay_Process_SetValue: 0x11CA608,
  VisionReplay_Process_GetValue: 0x11CB7CC,
  VisionReplayButton_OnClick: 0x11C93D0,
  IgalltaUnlock_PlayUnlockVideo: 0x11A5CC8,
  RrharilUnlockControl_PlayUnlockVideo: 0x11D6E74,
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
    console.log(`[unlock-vision] ${name}: ${extra}`);
  } else {
    console.log(`[unlock-vision] ${name}`);
  }
}

Interceptor.attach(p('SongSelector_GameStart'), {
  onEnter(args) {
    logHit('SongSelector.GameStart', `songIndex=${args[1].toInt32()} levelIndex=${args[2].toInt32()}`);
  }
});

Interceptor.attach(p('SongSelector_ReplaceWithMicroWave'), {
  onEnter() {
    logHit('SongSelector.ReplaceWithMicroWave');
  }
});

Interceptor.attach(p('SongSelector_ReplaceWithTheChariotReviival'), {
  onEnter() {
    logHit('SongSelector.ReplaceWithTheChariotReviival');
  }
});

Interceptor.attach(p('ChallengeSongSelectorControl_SelectSong'), {
  onEnter() {
    logHit('ChallengeSongSelectorControl.SelectSong');
  }
});

Interceptor.attach(p('ChallengeSongSelectorControl_Play'), {
  onEnter() {
    logHit('ChallengeSongSelectorControl.Play');
  }
});

Interceptor.attach(p('ChallengeModeControl_GameStart'), {
  onEnter(args) {
    logHit('ChallengeModeControl.GameStart', `levelIndex=${args[2].toInt32()}`);
  }
});

Interceptor.attach(p('VisionReplay_InitC8ReplayProcess'), {
  onEnter() {
    logHit('VisionReplay.InitC8ReplayProcess');
  }
});

Interceptor.attach(p('VisionReplay_Process_SetValue'), {
  onEnter(args) {
    logHit('VisionReplay.Process.SetValue', `key=${readIl2CppString(args[0])} value=${args[1].toInt32()}`);
  }
});

Interceptor.attach(p('VisionReplay_Process_GetValue'), {
  onEnter(args) {
    this.key = readIl2CppString(args[0]);
  },
  onLeave(retval) {
    logHit('VisionReplay.Process.GetValue', `key=${this.key} ret=${retval.toInt32()}`);
  }
});

Interceptor.attach(p('VisionReplayButton_OnClick'), {
  onEnter() {
    logHit('VisionReplayButton.OnClick');
  }
});

Interceptor.attach(p('IgalltaUnlock_PlayUnlockVideo'), {
  onEnter() {
    logHit('IgalltaUnlock.PlayUnlockVideo');
  }
});

Interceptor.attach(p('RrharilUnlockControl_PlayUnlockVideo'), {
  onEnter() {
    logHit('RrharilUnlockControl.PlayUnlockVideo');
  }
});

console.log(`[unlock-vision] UnityFramework base=${base}`);
