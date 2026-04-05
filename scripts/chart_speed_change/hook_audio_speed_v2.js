// Phigros 音频变速 Hook v2
// 策略：在 AudioClip 被设置到 AudioSource 之前修改其 frequency

// ===== 配置区 =====
const SPEED_FACTOR = 1.25;  // 变速倍数：>1 加速，<1 减速
const ENABLE_LOG = true;    // 是否启用详细日志

// ===== 地址配置 =====
const ADDRESSES = {
    // AddressableAudioSource.<SetClip>d__41.MoveNext 中设置 clip 的位置
    setClipLocation: 0x1F96110,

    // AudioClip.get_frequency
    getFrequency: 0x1BFE0FC,

    // UnityEngine.AudioSource.set_clip (需要查找)
    setClip: 0x1C0036C  // 这是一个占位地址，需要替换
};

function log(msg) {
    if (ENABLE_LOG) {
        console.log(msg);
    }
}

// Hook 方案1：在 AudioClip 被设置到 AudioSource 之前修改
function hookAudioClipBeforeSet() {
    const libil2cpp = Process.findModuleByName("libil2cpp.so");
    if (!libil2cpp) {
        console.log("[-] 未找到 libil2cpp.so");
        return;
    }

    const hookAddr = libil2cpp.base.add(ADDRESSES.setClipLocation);
    log("[+] Hook 地址: " + hookAddr);

    Interceptor.attach(hookAddr, {
        onEnter: function(args) {
            // 在这个位置，x7 寄存器存储 AudioClip 指针
            const audioClipPtr = this.context.x7;

            if (audioClipPtr.isNull()) {
                return;
            }

            try {
                // 调用 AudioClip.get_frequency
                const getFreqFunc = new NativeFunction(
                    libil2cpp.base.add(ADDRESSES.getFrequency),
                    'int',
                    ['pointer']
                );

                const originalFreq = getFreqFunc(audioClipPtr);

                if (originalFreq <= 0 || originalFreq > 192000) {
                    log("[-] 无效的采样率: " + originalFreq);
                    return;
                }

                const newFreq = Math.round(originalFreq * SPEED_FACTOR);

                // Unity AudioClip 的 frequency 存储在 native 对象中
                // 我们需要找到 m_CachedPtr 然后修改 native 数据
                // 通常 UnityEngine.Object 的 m_CachedPtr 在偏移 0x10
                const cachedPtr = audioClipPtr.add(0x10).readPointer();

                if (!cachedPtr.isNull()) {
                    // Native AudioClip 结构中 frequency 的偏移需要测试
                    // 常见偏移：0x18, 0x1C, 0x20
                    // 我们尝试多个可能的偏移
                    const possibleOffsets = [0x18, 0x1C, 0x20, 0x24];

                    for (let offset of possibleOffsets) {
                        try {
                            const value = cachedPtr.add(offset).readInt();
                            if (value === originalFreq) {
                                // 找到了！修改它
                                cachedPtr.add(offset).writeInt(newFreq);
                                console.log("[*] ✓ 修改音频采样率: " + originalFreq + " Hz -> " + newFreq + " Hz (x" + SPEED_FACTOR + ")");
                                console.log("[*]   偏移: 0x" + offset.toString(16));
                                return;
                            }
                        } catch (e) {
                            // 继续尝试下一个偏移
                        }
                    }

                    log("[-] 未找到 frequency 字段，尝试的偏移: " + possibleOffsets.join(", "));
                }
            } catch (e) {
                log("[-] Hook 执行失败: " + e);
            }
        }
    });
}

// 启动
console.log("=".repeat(50));
console.log("[+] Phigros 音频变速 Hook v2");
console.log("[+] 变速倍数: " + SPEED_FACTOR + "x");
console.log("=".repeat(50));

hookAudioClipBeforeSet();
