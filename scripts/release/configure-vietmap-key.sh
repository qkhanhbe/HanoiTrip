#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^[A-Za-z0-9-]{3,24}$ ]]; then
  echo "Usage: bash scripts/release/configure-vietmap-key.sh <key-vault-name>" >&2
  exit 2
fi

command -v az >/dev/null || {
  echo "Azure CLI is required." >&2
  exit 2
}
az account show --output none

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
env_file=${HANOITRIP_ENV_FILE:-"$repo_root/.env"}
env_example="$repo_root/.env.example"
vault_name=$1
secret_name=vietmap-api-key

umask 077
secret_file=$(mktemp "${TMPDIR:-/tmp}/hanoitrip-vietmap.XXXXXX")
env_temp=$(mktemp "${env_file}.tmp.XXXXXX")
cleanup() {
  rm -f -- "$secret_file" "$env_temp"
}
trap cleanup EXIT INT TERM

read -r -s -p "VIETMAP Search/Place/Route API key: " vietmap_key
printf '\n'
if [ "${#vietmap_key}" -lt 8 ] || [ "${#vietmap_key}" -gt 512 ] || [[ "$vietmap_key" =~ [[:space:]] ]]; then
  echo "The key must be 8-512 characters without whitespace." >&2
  exit 2
fi
printf '%s' "$vietmap_key" >"$secret_file"

source_env=$env_file
if [ ! -f "$source_env" ]; then
  source_env=$env_example
fi
wrote_key=false
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    VIETMAP_API_KEY=*)
      if [ "$wrote_key" = false ]; then
        printf 'VIETMAP_API_KEY=%s\n' "$vietmap_key"
        wrote_key=true
      fi
      ;;
    *) printf '%s\n' "$line" ;;
  esac
done <"$source_env" >"$env_temp"
if [ "$wrote_key" = false ]; then
  printf 'VIETMAP_API_KEY=%s\n' "$vietmap_key" >>"$env_temp"
fi
chmod 600 "$env_temp"

# File input keeps the secret out of shell history and the az process arguments.
az keyvault secret set \
  --vault-name "$vault_name" \
  --name "$secret_name" \
  --file "$secret_file" \
  --encoding utf-8 \
  --content-type "VIETMAP Search/Place/Route v4 API key" \
  --output none

mv -- "$env_temp" "$env_file"
chmod 600 "$env_file"
unset vietmap_key
rm -f -- "$secret_file"
trap - EXIT INT TERM

echo "Stored VIETMAP key in the ignored local .env and Key Vault secret '$secret_name'."
echo "ROAD_PROVIDER remains unchanged; no app or slot was restarted."
