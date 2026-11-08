#!/usr/bin/env bash
set -euo pipefail
# Install this app on one Ubuntu host with Node/Python/PostgreSQL installed directly.
# Run from the source checkout AFTER setup, migration, seed and frontend build.
# Does not install system packages or modify the database.
[[ "$EUID" == 0 ]] || { echo 'Chạy: sudo bash deploy/install-ubuntu.sh' >&2; exit 2; }
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
test -x /usr/local/bin/node || { echo 'Cài Node tại /usr/local/bin/node bằng deploy/install-node.sh trước.' >&2; exit 1; }
for command in python3 systemctl curl; do command -v "$command" >/dev/null; done
for file in frontend/.next/standalone/server.js backend/.env frontend/.env.local; do
  test -f "$source_dir/$file" || { echo "Thiếu $file. Chạy setup, cấu hình .env và build trước." >&2; exit 1; }
done
# Refuse to mistake a running development server for the new systemd service.
for role in frontend backend; do
  port=3000
  [[ "$role" == backend ]] && port=8000
  if ! systemctl is-active --quiet "english-$role"; then
    python3 - "$port" <<'PY_PORT'
import socket,sys
try:
    connection=socket.create_connection(("127.0.0.1",int(sys.argv[1])),timeout=1)
except OSError:
    pass
else:
    connection.close()
    raise SystemExit("Cổng "+sys.argv[1]+" đang được dùng. Dừng server dev trước khi cài systemd.")
PY_PORT
  fi
done
release_dir="/opt/english/releases/local-$(date -u +%Y%m%dT%H%M%SZ)-$$"
id english >/dev/null 2>&1 || useradd --system --home-dir /opt/english --shell /usr/sbin/nologin english
install -d -m 755 "$release_dir/frontend/.next" "$release_dir/backend"
install -d -m 700 /etc/english
cp -a "$source_dir/frontend/.next/standalone/." "$release_dir/frontend/"
cp -a "$source_dir/frontend/.next/static" "$release_dir/frontend/.next/static"
cp -a "$source_dir/frontend/public" "$release_dir/frontend/public"
cp -a "$source_dir/backend/app" "$source_dir/backend/requirements.txt" "$release_dir/backend/"
find "$release_dir" \( -type f -o -type l \) -name '.env*' -delete
python3 -m venv "$release_dir/.venv"
"$release_dir/.venv/bin/python" -m pip install -r "$release_dir/backend/requirements.txt"
install -m 600 "$source_dir/backend/.env" /etc/english/backend.env
install -m 600 "$source_dir/frontend/.env.local" /etc/english/frontend.env
chown -R english:english "$release_dir"
ln -sfn "$release_dir" /opt/english/current
for role in frontend backend; do
  install -m 644 "$source_dir/deploy/systemd/english-$role.service" "/etc/systemd/system/english-$role.service"
done
systemctl daemon-reload
systemctl enable english-backend english-frontend
systemctl restart english-backend english-frontend
for attempt in $(seq 1 60); do
  if systemctl is-active --quiet english-backend && systemctl is-active --quiet english-frontend && curl --fail --silent http://127.0.0.1:8000/health >/dev/null && curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then
    echo 'Đã cài hai dịch vụ systemd. Mở http://localhost:3000'
    echo 'Kiểm tra: systemctl status english-frontend english-backend'
    exit 0
  fi
  sleep 2
done
echo 'Health check chưa đạt. Kiểm tra journalctl -u english-backend -u english-frontend; xác nhận migration/seed và .env.' >&2
exit 1
