#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
bucket=${1:?Usage: bash scripts/upload-assets-s3.sh BUCKET REGION [IMAGE_PREFIX] [AUDIO_PREFIX]}
region=${2:?Usage: bash scripts/upload-assets-s3.sh BUCKET REGION [IMAGE_PREFIX] [AUDIO_PREFIX]}
image_prefix=${3:-media}
audio_prefix=${4:-audio}

command -v aws >/dev/null

aws s3 cp "$project_dir/assets/picture-vocabulary/" "s3://$bucket/$image_prefix/" \
  --recursive --region "$region" --only-show-errors

for file in docs-logo.png logo.png logo_large.png green-mascot.png; do
  aws s3 cp "$project_dir/assets/branding/$file" "s3://$bucket/$image_prefix/$file" \
    --region "$region" --only-show-errors
done

aws s3 cp "$project_dir/assets/audio/" "s3://$bucket/$audio_prefix/" \
  --recursive --exclude '*' --include '*.wav' --region "$region" --only-show-errors

aws s3api head-object --bucket "$bucket" --key "$image_prefix/logo.png" --region "$region" >/dev/null
aws s3api head-object --bucket "$bucket" --key "$image_prefix/leaf.jpg" --region "$region" >/dev/null
aws s3api head-object --bucket "$bucket" --key "$audio_prefix/ielts-listening.wav" --region "$region" >/dev/null
printf 'Đã tải ảnh, logo và audio lên s3://%s\n' "$bucket"
