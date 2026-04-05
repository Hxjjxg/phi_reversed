// Phigros 音频变速 Hook
// 通过修改 AudioClip.frequency 来实现音频加速/减速

// 配置：变速倍数（>1 加速，<1 减速）
const SPEED_FACTOR = 1.25;  // 例如：1.25倍速

// Hook UnityEngine.AudioSource.set_clip
// 在AudioClip被设置到AudioSource之前修改其采样率
function hookAudioClip() {
    const libil2cpp = Process.findModuleByName("libil2cpp.so");
    if (!libil2cpp) {
        console.log("[-] 未找到 libil2cpp.so");
        return;
    }

    // UnityEngine.AudioSource.set_clip 的地址需要从 dump 中查找
    // 这里我们hook AddressableAudioSource 的 SetClip 协程完成后的设置点
    const setClipAddr = libil2cpp.base.add(0x1F96110);  // 对应反编译中设置 clip 的位置

    console.log("[+] Hook AudioClip at: " + setClipAddr);

    Interceptor.attach(setClipAddr, {
        onEnter: function(args) {
            // args[0] = this (AddressableAudioSource)
            // args[1] = AudioClip
            const audioClip = ptr(this.context.x19);  // v7 寄存器存储 AudioClip

            if (audioClip.isNull()) {
                return;
            }

            try {
                // 获取 AudioClip.frequency (采样率)
                // 需要找到 get_frequency 的偏移
                const getFrequency = new NativeFunction(
                    libil2cpp.base.add(0x1A85000),  // 需要替换为实际的 get_frequency 地址
                    'int',
                    ['pointer']
                );

                const setFrequency = new NativeFunction(
                    libil2cpp.base.add(0x1A85100),  // 需要替换为实际的 set_frequency 地址
                    'void',
                    ['pointer', 'int']
                );

                const oldFreq = getFrequency(audioClip);
                const newFreq = Math.round(oldFreq * SPEED_FACTOR);

                setFrequency(audioClip, newFreq);

                console.log("[*] 修改音频采样率: " + oldFreq + " Hz -> " + newFreq + " Hz (x" + SPEED_FACTOR + ")");
            } catch (e) {
                console.log("[-] 修改失败: " + e);
            }
        }
    });
}

// 启动 hook
console.log("[+] Phigros 音频变速 Hook 启动");
console.log("[+] 变速倍数: " + SPEED_FACTOR);
hookAudioClip();
