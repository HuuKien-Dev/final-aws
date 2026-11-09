#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
project_name=vuon-xa-docker-test
compose=(docker compose --project-name "$project_name" -f compose.yaml -f compose.test.yaml)

export DATABASE_URL='postgresql://english_app:docker-test-password@database:5432/english_app_test'
export APP_ORIGIN='http://localhost:33000'
export BACKEND_URL='http://backend:8000'
export COOKIE_SECURE=false
export FRONTEND_PORT=33000
export BACKEND_PORT=38000
export ASSET_STORAGE=local

cd "$project_dir"

cleanup() {
  status=$?
  if ((status != 0)); then
    "${compose[@]}" logs --no-color --tail=150 || true
  fi
  "${compose[@]}" down --volumes --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT

wait_for_url() {
  url=$1
  label=$2
  for _ in $(seq 1 60); do
    if curl --fail --silent "$url" >/dev/null 2>&1; then
      printf '%s: OK\n' "$label"
      return 0
    fi
    sleep 2
  done
  printf '%s không sẵn sàng: %s\n' "$label" "$url" >&2
  return 1
}

command -v docker >/dev/null
command -v curl >/dev/null

"${compose[@]}" build --pull
"${compose[@]}" up -d database
"${compose[@]}" run --rm backend python /app/database/manage.py migrate
"${compose[@]}" run --rm backend python /app/database/manage.py seed
"${compose[@]}" up -d backend frontend

wait_for_url 'http://127.0.0.1:38000/health' 'Backend và database'
wait_for_url 'http://127.0.0.1:33000/health' 'Frontend'
wait_for_url 'http://127.0.0.1:33000/api/topics' 'Frontend gọi backend'

"${compose[@]}" ps
printf 'Docker build và kiểm tra luồng frontend → backend → database: ĐẠT\n'
