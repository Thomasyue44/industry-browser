#!/bin/zsh
cd "$(dirname "$0")"
"/Users/xurui/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" "./build_all_industries.py"
echo
echo "Data refreshed. You can close this window."
read -k 1
