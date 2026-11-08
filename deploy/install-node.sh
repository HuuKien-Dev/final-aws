#!/usr/bin/env bash
set -euo pipefail
# Ubuntu builder/local host only; not called by ASG user data.
# Requires curl, xz-utils, ca-certificates. Uses only official Node distribution.
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64) node_arch=arm64 ;;
  *) echo 'Unsupported CPU architecture' >&2; exit 2 ;;
esac
node_work="$(mktemp -d)"
trap 'rm -rf "$node_work"' EXIT
cd "$node_work"
node_base=https://nodejs.org/dist/latest-v24.x
curl -fSLO "$node_base/SHASUMS256.txt"
node_file="$(awk -v suffix="linux-$node_arch.tar.xz" '$2 ~ suffix"$" {print $2}' SHASUMS256.txt)"
[[ "$node_file" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || exit 2
curl -fSLO "$node_base/$node_file"
awk -v file="$node_file" '$2==file' SHASUMS256.txt | sha256sum --check --status
tar -xJf "$node_file" -C /usr/local --strip-components=1
/usr/local/bin/node --version
/usr/local/bin/npm --version
# Pin the resulting version in the AMI and release record, not in runtime boot.
