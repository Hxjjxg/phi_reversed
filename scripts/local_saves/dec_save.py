import argparse
import base64
import pathlib
import sys
import urllib.parse

from Crypto.Cipher import AES
from Crypto.Util import Padding


AES2_KEY = bytes.fromhex(
    "627ff1942185e011c815e81e639b9a00001c766b826c29bd96578589f19a6fd6"
)
AES2_IV = bytes.fromhex("be56167f83da3befeff81861a5c5f3cd")


def build_parser():
    parser = argparse.ArgumentParser(
        description="Decrypt Phigros cloud-save module payloads with the AES2 key."
    )
    parser.add_argument(
        "input",
        help="Module file path, raw encrypted file path, or a base64/url-encoded ciphertext blob.",
    )
    parser.add_argument(
        "--mode",
        choices=["module-file", "raw-file", "base64"],
        default="module-file",
        help="Input format. module-file skips the first version byte.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Optional output path. Defaults to stdout.",
    )
    parser.add_argument(
        "--no-unpad",
        action="store_true",
        help="Do not strip PKCS#7 padding after AES-CBC decryption.",
    )
    parser.add_argument(
        "--print-hex",
        action="store_true",
        help="Print decrypted bytes as hex.",
    )
    return parser


def load_ciphertext(args):
    if args.mode == "base64":
        blob = urllib.parse.unquote(args.input)
        return base64.b64decode(blob)

    data = pathlib.Path(args.input).read_bytes()
    if args.mode == "module-file":
        if len(data) < 2:
            raise ValueError("module file is too short")
        print(f"[dec_save] module_version={data[0]}")
        return data[1:]
    return data


def decrypt(ciphertext, do_unpad):
    cipher = AES.new(AES2_KEY, AES.MODE_CBC, iv=AES2_IV)
    plain = cipher.decrypt(ciphertext)
    if do_unpad:
        plain = Padding.unpad(plain, AES.block_size)
    return plain


def emit_output(plain, args):
    if args.output:
        pathlib.Path(args.output).write_bytes(plain)
        print(f"[dec_save] wrote {len(plain)} bytes -> {args.output}")
        return

    if args.print_hex:
        print(plain.hex())
        return

    sys.stdout.buffer.write(plain)
    if not plain.endswith(b"\n"):
        sys.stdout.buffer.write(b"\n")


def main():
    parser = build_parser()
    args = parser.parse_args()

    try:
        ciphertext = load_ciphertext(args)
        plain = decrypt(ciphertext, do_unpad=not args.no_unpad)
    except Exception as exc:
        print(f"[dec_save] failed: {exc}", file=sys.stderr)
        return 1

    emit_output(plain, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
