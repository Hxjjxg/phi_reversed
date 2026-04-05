#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import sys
import wave
from pathlib import Path


def change_wav_speed_by_samplerate(input_path: Path, output_path: Path, factor: float) -> None:
    if factor <= 0:
        raise ValueError("factor 必须大于 0")

    with wave.open(str(input_path), "rb") as src:
        params = src.getparams()
        frames = src.readframes(src.getnframes())

        old_rate = params.framerate
        new_rate = int(round(old_rate * factor))

        if new_rate <= 0:
            raise ValueError("计算后的采样率无效")
        if new_rate > 0xFFFFFFFF:
            raise ValueError("计算后的采样率过大，超出 WAV 头可表示范围")

        with wave.open(str(output_path), "wb") as dst:
            dst.setnchannels(params.nchannels)
            dst.setsampwidth(params.sampwidth)
            dst.setframerate(new_rate)   # 关键：只改采样率
            dst.writeframes(frames)      # 音频数据原样写回

    old_duration = params.nframes / old_rate if old_rate else 0
    new_duration = params.nframes / new_rate if new_rate else 0

    print(f"输入文件: {input_path}")
    print(f"输出文件: {output_path}")
    print(f"原采样率: {old_rate} Hz")
    print(f"新采样率: {new_rate} Hz")
    print(f"倍数 factor: {factor}")
    print(f"原时长: {old_duration:.3f} 秒")
    print(f"新时长: {new_duration:.3f} 秒")
    print("说明: 仅修改采样率解释方式，音频数据未重采样，音调会一起变化。")


def main():
    parser = argparse.ArgumentParser(
        description="通过只修改 WAV 采样率来变速（不做重采样，音调会变化）"
    )
    parser.add_argument("input", help="输入 WAV 文件")
    parser.add_argument("output", help="输出 WAV 文件")
    parser.add_argument(
        "factor",
        type=float,
        help="变速倍数；>1 变快，<1 变慢，例如 1.25 / 0.8"
    )

    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"错误: 输入文件不存在: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        change_wav_speed_by_samplerate(input_path, output_path, args.factor)
    except wave.Error as e:
        print(f"错误: 无法处理该 WAV 文件: {e}", file=sys.stderr)
        print("提示: 这个脚本适用于标准未压缩 WAV（PCM）。", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()