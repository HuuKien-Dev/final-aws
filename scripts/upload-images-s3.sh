#!/usr/bin/env bash
set -euo pipefail
# Run from a trusted operator machine after creating the private bucket in the AWS guide.
bucket="${1:?Usage: upload-images-s3.sh BUCKET REGION [PREFIX]}"
region="${2:?Missing AWS region}"
prefix="${3:-media}"
prefix="${prefix#/}"
prefix="${prefix%/}"
[[ -n "$prefix" ]] || { echo 'PREFIX must not be empty' >&2; exit 2; }
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT
python3 - "$repo_dir" "$stage_dir" <<'PY'
import hashlib,json,shutil,sys
from pathlib import Path
root,stage=map(Path,sys.argv[1:])
manifest=json.loads((root/'assets/picture-vocabulary/manifest.json').read_text())
for asset in manifest:
    source=root/'assets/picture-vocabulary'/asset['file']
    if hashlib.sha256(source.read_bytes()).hexdigest()!=asset['sha256']:raise SystemExit('Image checksum mismatch')
    shutil.copyfile(source,stage/source.name)
for name in ['manifest.json','COPYRIGHT.txt','vocabulary-images.zip']:
    shutil.copyfile(root/'assets/picture-vocabulary'/name,stage/name)
for asset in json.loads((root/'backend/app/branding-manifest.json').read_text()):
    source=root/asset['local_path']
    if hashlib.sha256(source.read_bytes()).hexdigest()!=asset['sha256']:raise SystemExit('Logo checksum mismatch')
    shutil.copyfile(source,stage/source.name)
shutil.copyfile(root/'frontend/public/LICENSE-FreeLingo.txt',stage/'BRANDING-LICENSE.txt')
print('Prepared 9 image files plus vocabulary ZIP and credits; no credentials in upload set.')
PY
aws s3api head-bucket --bucket "$bucket" --region "$region"
aws s3 sync "$stage_dir/" "s3://$bucket/$prefix/" --region "$region" --sse AES256 --no-progress
printf 'Uploaded private image set. Configure S3_IMAGE_BUCKET=%s and S3_IMAGE_PREFIX=%s in the backend secret.\n' "$bucket" "$prefix"
