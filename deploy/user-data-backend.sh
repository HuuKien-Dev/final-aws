#!/usr/bin/env bash
set -euo pipefail
# Use a tested Ubuntu AMI containing deploy/install-release.sh at this path.
# No shell tracing: configuration contains secrets.
export AWS_DEFAULT_REGION=ap-southeast-1
export RELEASE_BUCKET=REPLACE_PRIVATE_RELEASE_BUCKET
export RELEASE_KEY=releases/english-1.0.0.tar.gz
export RELEASE_VERSION=REPLACE_S3_OBJECT_VERSION_ID
export RELEASE_SHA256=REPLACE_64_HEX_SHA256
export CONFIG_SECRET_ARN=REPLACE_BACKEND_SECRET_ARN
exec /usr/local/sbin/english-install-release backend
