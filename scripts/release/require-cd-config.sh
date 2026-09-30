#!/usr/bin/env bash
set -euo pipefail

required=(
  CLIENT_ID TENANT_ID SUBSCRIPTION_ID
  RESOURCE_GROUP WEBAPP_NAME ACR_NAME KEY_VAULT_NAME
  MYSQL_SERVER MYSQL_DATABASE MYSQL_MIGRATION_USER MYSQL_PASSWORD_SECRET
)
missing=()
for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then missing+=("$name"); fi
done
if [ "${REQUIRE_ROAD_PROVIDER:-false}" = "true" ] && [ -z "${VIETMAP_API_KEY_SECRET:-}" ]; then
  missing+=("VIETMAP_API_KEY_SECRET")
fi
if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing CD configuration: %s\n' "${missing[*]}" >&2
  exit 2
fi
