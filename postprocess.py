import sys
from pathlib import Path
from subprocess import run

if len(sys.argv) < 2:
    print(f"Usage: python {sys.argv[0]} <input.ts> [output.js]")
    sys.exit(1)

ts_file = Path(sys.argv[1])
js_file = Path(sys.argv[2]) if len(sys.argv) >= 3 else ts_file.with_suffix(".js")

run(["npx", "frida-compile", str(ts_file), "-o", str(js_file)], check=True, shell=True)

lines = js_file.read_text(encoding="utf-8").splitlines()
# Skip first 3 lines (frida-compile banner)
content_lines = lines[3:]
# Replace "export default X();" with "X();"
content_lines[-1] = content_lines[-1].replace("export default ", "")
body = "\n".join(content_lines) + "\n"
js_file.write_text(body, encoding="utf-8")
print(f"Done: {ts_file.name} -> {js_file.name}")
