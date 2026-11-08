#!/usr/bin/env bash
set -euo pipefail
# Run on Ubuntu matching the EC2 architecture, with Node >=22 and Python 3.12+.
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
release_id="${1:?Usage: package-release.sh RELEASE_ID}"
[[ "$release_id" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
python3 "$repo_dir/deploy/source_archive.py"
cd "$repo_dir/frontend"
npm ci
npm run build
cd "$repo_dir"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT
mkdir -p "$stage_dir/frontend/.next" "$stage_dir/wheels"
cp -a frontend/.next/standalone/. "$stage_dir/frontend/"
cp -a frontend/.next/static "$stage_dir/frontend/.next/static"
cp -a frontend/public "$stage_dir/frontend/public"
mkdir -p "$stage_dir/backend" "$stage_dir/database" "$stage_dir/deploy"
cp -a backend/app backend/requirements.txt backend/.env.example "$stage_dir/backend/"
cp -a database/manage.py database/sample.vi-en.json database/migrations "$stage_dir/database/"
cp -a deploy/*.sh deploy/*.py deploy/*.json deploy/systemd "$stage_dir/deploy/"
find "$stage_dir" -type d -name __pycache__ -prune -exec rm -rf {} +
# Next traces may include build-machine .env files; never ship those to EC2.
find "$stage_dir" \( -type f -o -type l \) -name '.env*' ! -name '.env.example' -delete
# All Python wheels are bundled; ASG machines need no PyPI network access.
python3 -m pip download --only-binary=:all: -r backend/requirements.txt -d "$stage_dir/wheels"
printf '%s\n' "$release_id" > "$stage_dir/RELEASE"
mkdir -p releases
tar -czf "releases/$release_id.tar.gz" -C "$stage_dir" .
cd releases
sha256sum "$release_id.tar.gz" > "$release_id.tar.gz.sha256"
echo "Upload this immutable artifact to private S3; configure its exact key/version and SHA256 in user data."
