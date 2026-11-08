#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
upload_dir="$app_dir"
expected_remote=https://github.com/HuuKien-Dev/final-aws.git
git -C "$upload_dir" rev-parse --verify main >/dev/null || { echo 'Chưa có commit trên nhánh main.' >&2; exit 1; }
remote_url="$(git -C "$upload_dir" remote get-url origin)"
[[ "$remote_url" == "$expected_remote" || "$remote_url" == 'git@github.com:HuuKien-Dev/final-aws.git' ]] || { echo 'Remote khác repo được yêu cầu. Dừng.' >&2; exit 1; }
[[ -z "$(git -C "$upload_dir" status --porcelain)" ]] || { echo 'Dự án có thay đổi chưa commit. Hãy commit trước khi push.' >&2; exit 1; }
echo 'Đang đẩy commit đã chuẩn bị lên HuuKien-Dev/final-aws (không force push)…'
git -C "$upload_dir" push -u origin main
echo 'Đã đẩy thành công: https://github.com/HuuKien-Dev/final-aws'
