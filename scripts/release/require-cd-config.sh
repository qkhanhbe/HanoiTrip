#!/usr/bin/env bash
set -euo pipefail

required=(CLIENT_ID TENANT_ID SUBSCRIPTION_ID RESOURCE_GROUP WEBAPP_NAME ACR_NAME MYSQL_SERVER KEY_VAULT_NAME)
missing=()
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then missing+=("$name"); fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing CD configuration: %s\n' "${missing[*]}" >&2
  exit 2
fi
