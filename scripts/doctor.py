"""Read-only diagnostics; never opens the database or prints secrets."""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
failures = []


def check(ok, label):
    print(f"{'OK  ' if ok else 'THIẾU'} {label}")
    if not ok:
        failures.append(label)


print("Kiểm tra môi trường app tại", ROOT)
check(sys.version_info >= (3, 12), "Python >=3.12")
for binary in ("node", "npm", "psql"):
    check(bool(shutil.which(binary)), binary)
if shutil.which("node"):
    result = subprocess.run(["node", "-p", "Number(process.versions.node.split('.')[0]) >= 22"], capture_output=True, text=True)
    check(result.returncode == 0 and result.stdout.strip() == "true", "Node >=22")
python = ROOT / ".venv/bin/python"
if python.is_file():
    result = subprocess.run([str(python), "-c", "import fastapi,asyncpg,uvicorn"], capture_output=True)
    check(result.returncode == 0, "Thư viện FastAPI/asyncpg/uvicorn trong .venv")
else:
    check(False, "Virtualenv .venv")
check((ROOT / "backend/.env").is_file(), "Cấu hình backend/.env")
check((ROOT / "frontend/.env.local").is_file(), "Cấu hình frontend/.env.local")
for asset in json.loads((ROOT / "frontend/public/freelingo-assets/asset-manifest.json").read_text()):
    path = ROOT / asset["local_path"]
    check(path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"], asset["public_url"])
if failures:
    print("\nCài công cụ và cấu hình theo README.md, sau đó chạy lại doctor.")
    sys.exit(1)
print("\nĐủ điều kiện khởi động. Doctor chưa xác nhận kết nối PostgreSQL hoặc AWS.")
