#!/usr/bin/env bash
set -euo pipefail
# Run in the user's Ubuntu terminal, outside a restricted coding sandbox.
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$app_dir"
trap 'echo "Khởi động bị dừng tại dòng $LINENO. Giữ phần lỗi phía trên để chẩn đoán." >&2' ERR
if [[ "$EUID" == 0 ]]; then
  echo 'Chạy script bằng tài khoản thường; chỉ các bước cài hệ thống dùng sudo.' >&2
  exit 2
fi
command -v sudo >/dev/null
sudo apt-get update
sudo apt-get install -y python3-venv postgresql postgresql-client ca-certificates curl xz-utils
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=24?0:1)'; then
  sudo bash deploy/install-node.sh
fi
export PATH="/usr/local/bin:$PATH"
command -v npm >/dev/null
sudo systemctl enable --now postgresql
bash scripts/run-local.sh setup
set -a
source backend/.env
set +a
python3 scripts/init-local-db.py
bash scripts/run-local.sh migrate
bash scripts/run-local.sh seed
printf '\nĐang chuẩn bị khởi động. Chờ dòng ĐÃ SẴN SÀNG sau khi kiểm tra HTTP.\nGiữ cửa sổ Terminal này mở; Ctrl+C dừng cả hai dịch vụ.\n\n'
export ENGLISH_OPEN_BROWSER=1
exec bash scripts/run-local.sh all
