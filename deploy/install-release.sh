#!/usr/bin/env bash
set -euo pipefail
# Invoked by user data. No migrations or seed here.
role="${1:?frontend or backend}"
[[ "$role" == frontend || "$role" == backend ]] || exit 2
: "${RELEASE_BUCKET:?}" "${RELEASE_KEY:?}" "${RELEASE_VERSION:?}" "${RELEASE_SHA256:?}" "${CONFIG_SECRET_ARN:?}"
[[ "$RELEASE_SHA256" =~ ^[0-9a-f]{64}$ ]] || exit 2
: "${AWS_DEFAULT_REGION:?}"
# Golden AMI supplies Node at /usr/local/bin/node, Python, venv, AWS CLI v2, curl.
command -v aws >/dev/null
command -v python3 >/dev/null
command -v curl >/dev/null
if [[ "$role" == frontend ]]; then test -x /usr/local/bin/node; fi
id english >/dev/null 2>&1 || useradd --system --home-dir /opt/english --shell /usr/sbin/nologin english
install -d -m 755 /opt/english/releases
install -d -m 700 /etc/english
release_dir="/opt/english/releases/$RELEASE_SHA256"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
aws s3api get-object --bucket "$RELEASE_BUCKET" --key "$RELEASE_KEY" --version-id "$RELEASE_VERSION" "$work_dir/release.tar.gz" >/dev/null
printf '%s  %s\n' "$RELEASE_SHA256" "$work_dir/release.tar.gz" | sha256sum --check --status
mkdir -p "$release_dir"
tar -xzf "$work_dir/release.tar.gz" -C "$release_dir"
# SecretString is plain systemd EnvironmentFile text, not JSON. Never print it.
umask 077
aws secretsmanager get-secret-value --secret-id "$CONFIG_SECRET_ARN" --query SecretString --output text > "/etc/english/$role.env"
chmod 600 "/etc/english/$role.env"
if [[ "$role" == backend ]]; then
  python3 -m venv "$release_dir/.venv"
  "$release_dir/.venv/bin/pip" install --no-index --find-links="$release_dir/wheels" -r "$release_dir/backend/requirements.txt"
fi
chown -R english:english "$release_dir"
ln -sfn "$release_dir" /opt/english/current
install -m 644 "$release_dir/deploy/systemd/english-$role.service" "/etc/systemd/system/english-$role.service"
systemctl daemon-reload
systemctl enable "english-$role"
systemctl restart "english-$role"
port=3000
if [[ "$role" == backend ]]; then port=8000; fi
for attempt in $(seq 1 60); do
  if curl --fail --silent "http://127.0.0.1:$port/health" >/dev/null; then exit 0; fi
  sleep 2
done
echo 'Application failed health check; inspect journalctl' >&2
exit 1
