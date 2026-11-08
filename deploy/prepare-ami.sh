#!/usr/bin/env bash
set -euo pipefail
# Run on a temporary Ubuntu 24.04 builder with outbound internet, NOT in ASG user data.
# Install Node 24 LTS from an official, checksum-verified Node distribution at
# /usr/local/bin/node before invoking this script. Install AWS CLI v2 with its
# official signature verification. Pin versions in your AMI build pipeline.
command -v aws >/dev/null
/usr/local/bin/node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
apt-get update
apt-get install -y python3 python3-venv ca-certificates curl
install -m 755 "$(dirname "$0")/install-release.sh" /usr/local/sbin/english-install-release
# Create AMI from this builder, use that AMI ID in BOTH Launch Templates.
