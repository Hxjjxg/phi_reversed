#!/usr/bin/env python3
"""
dump_metadata_recv.py — 通过 Frida send() 接收解密后的 global-metadata.dat
==========================================================================

无需 root / debuggable，通过 Frida 消息通道传输二进制数据到 PC。

用法 (直接运行，自动附加到 Gadget):
    python dump_metadata_recv.py

高级用法:
    python dump_metadata_recv.py --attach com.PigeonGames.Phigros
    python dump_metadata_recv.py --attach 12345 --output my_metadata.dat
    python dump_metadata_recv.py --device local --attach SomeProcess
"""

import sys
import os
import struct
import argparse
import time
import threading

try:
    import frida
except ImportError:
    print("请先安装 frida: pip install frida")
    sys.exit(1)

# ─────────────────────────────────────────────────────────
# 全局状态
# ─────────────────────────────────────────────────────────
received_chunks = {}  # index -> bytes
total_chunks = 0
total_size = 0
output_path = ""
done_event = threading.Event()


def on_message(message, data):
    """处理 Frida send() 消息"""
    global total_chunks, total_size

    if message["type"] == "send":
        payload = message["payload"]

        if payload.get("event") == "metadata_info":
            total_size = payload["totalSize"]
            total_chunks = payload["totalChunks"]
            print(f"[*] metadata: {total_size} bytes, {total_chunks} 块")

        elif payload.get("event") == "metadata_chunk":
            idx = payload["index"]
            received_chunks[idx] = data
            pct = len(received_chunks) * 100 // total_chunks
            print(f"\r[*] 接收中: {len(received_chunks)}/{total_chunks} ({pct}%)", end="", flush=True)

        elif payload.get("event") == "metadata_done":
            print(f"\n[+] 所有 {total_chunks} 块已接收")
            assemble_and_save()
            done_event.set()

        elif payload.get("event") == "error":
            print(f"\n[-] 错误: {payload.get('message', '未知')}")
            done_event.set()

    elif message["type"] == "error":
        print(f"\n[-] Frida 错误: {message.get('description', message)}")
    
    # 转发 console.log / console.error 输出
    else:
        stack = message.get("stack")
        if stack:
            print(message.get("description", ""))
            print(stack)
        else:
            print(str(message))


def assemble_and_save():
    """将接收到的块按顺序拼接并写入文件"""
    print(f"[*] 正在拼接并写入 → {output_path}")
    with open(output_path, "wb") as f:
        for i in range(total_chunks):
            chunk = received_chunks.get(i)
            if chunk is None:
                print(f"[-] 警告: 缺少块 #{i}")
                f.write(b"\x00" * (1024 * 1024))  # 占位
            else:
                f.write(chunk)

    actual_size = os.path.getsize(output_path)

    # 截断到实际大小 (最后一块可能不满)
    if actual_size > total_size:
        with open(output_path, "r+b") as f:
            f.truncate(total_size)
        actual_size = total_size

    print(f"[+] 已保存: {output_path} ({actual_size} bytes, {actual_size / 1048576:.2f} MB)")

    # 验证 magic
    with open(output_path, "rb") as f:
        magic = struct.unpack("<I", f.read(4))[0]
        version = struct.unpack("<i", f.read(4))[0]
    if magic == 0xFAB11BAF:
        print(f"[+] 验证通过: magic=0xFAB11BAF, version={version}")
    else:
        print(f"[-] 验证失败: magic=0x{magic:08X} (期望 0xFAB11BAF)")


def main():
    global output_path

    parser = argparse.ArgumentParser(description="通过 Frida 接收 global-metadata.dat")
    parser.add_argument("--device", "-d", default="usb", help="Frida 设备类型: usb / local / remote")
    parser.add_argument("--attach", "-a", default="gadget", help="附加目标: 进程名或 PID (不区分大小写)")
    parser.add_argument("--output", "-o", default="global-metadata.dat", help="输出文件路径")
    parser.add_argument("--timeout", "-t", type=int, default=120, help="超时秒数 (默认 120)")
    args = parser.parse_args()

    output_path = args.output

    # 连接设备
    print(f"[*] 连接 Frida 设备 ({args.device}) ...")
    if args.device == "usb":
        device = frida.get_usb_device(timeout=10)
    elif args.device == "local":
        device = frida.get_local_device()
    else:
        device = frida.get_remote_device()

    print(f"[*] 设备: {device.name}")

    # 附加进程 (支持大小写不敏感的进程名匹配)
    try:
        pid = int(args.attach)
        print(f"[*] 附加到 PID {pid} ...")
        session = device.attach(pid)
    except ValueError:
        # 尝试直接附加
        target = args.attach
        print(f"[*] 附加到 '{target}' ...")
        try:
            session = device.attach(target)
        except frida.ProcessNotFoundError:
            # 尝试大小写不敏感匹配
            print(f"[*] 进程 '{target}' 未找到，尝试大小写不敏感匹配 ...")
            processes = device.enumerate_processes()
            matched = None
            for proc in processes:
                if proc.name.lower() == target.lower():
                    matched = proc
                    break
            if matched:
                print(f"[*] 找到匹配进程: {matched.name} (PID {matched.pid})")
                session = device.attach(matched.pid)
            else:
                print(f"[-] 错误: 找不到进程 '{target}'")
                print(f"[*] 提示: 请检查进程是否正在运行，或使用以下命令查看所有进程:")
                print(f"    frida-ps -Uai")
                sys.exit(1)

    # 加载 JS 脚本
    js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dump_metadata.js")
    print(f"[*] 加载脚本: {js_path}")
    with open(js_path, "r", encoding="utf-8") as f:
        js_code = f.read()

    script = session.create_script(js_code)
    script.on("message", on_message)
    script.load()
    
    print(f"[*] 脚本已加载")
    print(f"[*] 等待 metadata dump (超时 {args.timeout}s) ...")
    print("-" * 60)
    
    if done_event.wait(timeout=args.timeout):
        print("-" * 60)
        print("[+] 完成!")
    else:
        print("-" * 60)
        print(f"[-] 超时 ({args.timeout}s), 已收到 {len(received_chunks)}/{total_chunks or '?'} 块")
        if received_chunks:
            assemble_and_save()

    # 清理
    try:
        script.unload()
    except:
        pass
    
    print("\n[*] 会话已结束")
    
    # 如果成功，提示可以使用 Il2CppDumper
    if os.path.exists(output_path):
        size_mb = os.path.getsize(output_path) / 1048576
        print(f"[*] 文件已保存: {os.path.abspath(output_path)} ({size_mb:.2f} MB)")
        print(f"\n下一步: 使用 Il2CppDumper 分析")
        print(f"  1. 从 APK 提取 libil2cpp.so")
        print(f"  2. 运行: Il2CppDumper.exe libil2cpp.so {output_path}")
        print(f"  3. 选择 ARM64, 自动模式 (a)")


if __name__ == "__main__":
    main()
