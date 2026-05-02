import argparse
import base64
import json
from pathlib import Path

from Crypto.Cipher import AES
from Crypto.Util import Padding

# Same key/iv as dec.py
KEY = bytes.fromhex("627ff1942185e011c815e81e639b9a00001c766b826c29bd96578589f19a6fd6")
IV = bytes.fromhex("be56167f83da3befeff81861a5c5f3cd")


def parse_dump_json(line: str):
    marker = "[save-full][dump] "
    pos = line.find(marker)
    if pos < 0:
        return None
    payload = line[pos + len(marker) :].strip()
    if not payload:
        return None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def preview_utf8(data: bytes, limit: int = 120) -> str:
    text = data.decode("utf-8", errors="replace")
    if len(text) > limit:
        return text[:limit] + "..."
    return text


def try_dec_py_style(cipher_bytes: bytes):
    cipher = AES.new(KEY, AES.MODE_CBC, iv=IV)
    decrypted = cipher.decrypt(cipher_bytes)

    result = {
        "cipher_len": len(cipher_bytes),
        "raw_decrypted_len": len(decrypted),
        "raw_decrypted_base64": base64.b64encode(decrypted).decode("ascii"),
        "raw_decrypted_utf8_preview": preview_utf8(decrypted),
    }

    try:
        unpadded = Padding.unpad(decrypted, AES.block_size)
        result.update(
            {
                "pkcs7_unpad_ok": True,
                "plain_len": len(unpadded),
                "plain_base64": base64.b64encode(unpadded).decode("ascii"),
                "plain_utf8_preview": preview_utf8(unpadded),
            }
        )
    except ValueError as exc:
        result.update(
            {
                "pkcs7_unpad_ok": False,
                "unpad_error": str(exc),
            }
        )

    return result


def extract_and_try_dec(log_path: Path):
    input_by_index = {}
    output_by_index = {}

    with log_path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            obj = parse_dump_json(line)
            if not obj:
                continue
            tag = obj.get("tag")
            idx = obj.get("module_index")
            if idx is None:
                continue

            if tag == "decrypt2_input":
                input_by_index[idx] = obj
            elif tag == "decrypt2_output":
                output_by_index[idx] = obj

    indices = sorted(set(input_by_index) | set(output_by_index))
    records = []

    for idx in indices:
        inp = input_by_index.get(idx)
        out = output_by_index.get(idx)

        record = {
            "module_index": idx,
            "input": inp,
            "output": out,
        }

        data_b64 = None
        if inp:
            data_b64 = inp.get("data_base64")
        elif out:
            data_b64 = out.get("cipher_base64")

        if data_b64:
            try:
                cipher_bytes = base64.b64decode(data_b64)
                record["dec_py_try"] = try_dec_py_style(cipher_bytes)
            except Exception as exc:  # pylint: disable=broad-except
                record["dec_py_try"] = {
                    "decode_or_decrypt_error": str(exc),
                }
        else:
            record["dec_py_try"] = {
                "error": "no cipher base64 found",
            }

        # Compare with hook's decrypt2_output plain bytes when available.
        if out and out.get("plain_base64"):
            try:
                plain_bytes = base64.b64decode(out["plain_base64"])
                record["hook_plain_preview"] = {
                    "plain_len": len(plain_bytes),
                    "plain_utf8_preview": preview_utf8(plain_bytes),
                    "plain_base64": out["plain_base64"],
                }
            except Exception as exc:  # pylint: disable=broad-except
                record["hook_plain_preview"] = {"error": str(exc)}

        records.append(record)

    return {
        "log_path": str(log_path),
        "decrypt2_input_count": len(input_by_index),
        "decrypt2_output_count": len(output_by_index),
        "records": records,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Extract decrypt2 records from save log and try dec.py AES-CBC decryption"
    )
    parser.add_argument("--log", default="log2.log", help="Path to log file")
    parser.add_argument(
        "--out",
        default="decrypt2_extract_dec_results.json",
        help="Output JSON report path",
    )
    args = parser.parse_args()

    result = extract_and_try_dec(Path(args.log))

    out_path = Path(args.out)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"decrypt2_input_count={result['decrypt2_input_count']}")
    print(f"decrypt2_output_count={result['decrypt2_output_count']}")
    print(f"report={out_path}")

    # Print brief per-module status
    for rec in result["records"]:
        idx = rec["module_index"]
        dec_try = rec.get("dec_py_try", {})
        ok = dec_try.get("pkcs7_unpad_ok")
        if ok is True:
            status = "dec.py style unpad OK"
        elif ok is False:
            status = f"dec.py style unpad FAIL ({dec_try.get('unpad_error')})"
        else:
            status = "dec.py style decrypt error"
        print(f"module_index={idx}: {status}")


if __name__ == "__main__":
    main()
