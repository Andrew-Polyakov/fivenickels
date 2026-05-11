#!/usr/bin/env bash
# Rebuild the front-end widget bundle and seed HomePage body when empty.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
front_end="${repo_root}/front-end"
wigtail="${repo_root}/wigtail"

echo "Installing front-end dependencies..."
(cd "${front_end}" && npm install)

echo "Building front-end widget bundle..."
(cd "${front_end}" && npm run build)

echo "Seeding HomePage body when empty..."
(cd "${wigtail}" && python3 manage.py seed_homepage_body "$@")

echo "Repair complete."
