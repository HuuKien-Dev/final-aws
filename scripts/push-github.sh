#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
upload_dir="$app_dir/.tools/github-upload"
expected_remote=https://github.com/HuuKien-Dev/final-aws.git
[[ -d "$upload_dir/.git" ]] || { echo 'Chưa có bản Git đã chuẩn bị tại .tools/github-upload.' >&2; exit 1; }
[[ "$(git -C "$upload_dir" remote get-url origin)" == "$expected_remote" ]] || { echo 'Remote khác repo được yêu cầu. Dừng.' >&2; exit 1; }
[[ -z "$(git -C "$upload_dir" status --porcelain)" ]] || { echo 'Bản upload có thay đổi chưa commit. Dừng để không bỏ sót thay đổi.' >&2; exit 1; }
echo 'Đang đẩy commit đã chuẩn bị lên HuuKien-Dev/final-aws (không force push)…'
git -C "$upload_dir" push -u origin main
echo 'Đã đẩy thành công: https://github.com/HuuKien-Dev/final-aws'
