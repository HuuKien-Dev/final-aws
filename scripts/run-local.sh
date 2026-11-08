#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$app_dir"
mode="${1:-doctor}"
load_backend_env() {
  if [[ ! -f backend/.env ]]; then echo 'Thiếu backend/.env: sao chép backend/.env.example rồi điền cấu hình.' >&2; exit 1; fi
  set -a
  source backend/.env
  set +a
  : "${DATABASE_URL:?Thiếu DATABASE_URL trong backend/.env}"
}
require_python() {
  if [[ ! -x .venv/bin/python ]] || ! .venv/bin/python -c 'import fastapi,asyncpg,uvicorn' >/dev/null 2>&1; then
    echo 'Thiếu thư viện Python. Chạy bash scripts/run-local.sh setup trước.' >&2
    exit 1
  fi
}
case "$mode" in
  doctor)
    python3 scripts/doctor.py
    ;;
  setup)
    command -v node >/dev/null || { echo 'Cần Node 24+: sudo bash deploy/install-node.sh' >&2; exit 1; }
    command -v npm >/dev/null
    node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Cần Node >=22");process.exit(1)}'
    python3 -m venv .venv
    .venv/bin/python -m pip install -r backend/requirements.txt -r tests/requirements.txt
    (cd frontend && npm ci)
    umask 077
    [[ -f backend/.env ]] || cp backend/.env.example backend/.env
    [[ -f frontend/.env.local ]] || cp frontend/.env.example frontend/.env.local
    echo 'Đã cài dependencies; điền DATABASE_URL trong backend/.env rồi chạy migrate và seed.'
    ;;
  migrate|seed)
    require_python
    load_backend_env
    exec .venv/bin/python database/manage.py "$mode" "${@:2}"
    ;;
  all)
    require_python
    load_backend_env
    command -v node >/dev/null || { echo 'Thiếu Node trong PATH.' >&2; exit 1; }
    command -v npm >/dev/null
    exec python3 scripts/dev.py
    ;;
  backend)
    require_python
    load_backend_env
    cd backend
    exec "$app_dir/.venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
    ;;
  frontend)
    cd frontend
    exec npm run dev
    ;;
  build)
    python3 deploy/source_archive.py
    cd frontend
    exec npm run build
    ;;
  test)
    python3 -m unittest discover -s tests -p 'test_offline.py' -v
    ;;
  *)
    echo 'Dùng: run-local.sh {doctor|setup|migrate|seed|all|backend|frontend|build|test}' >&2
    exit 2
    ;;
esac
