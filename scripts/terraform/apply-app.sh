#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
terraform_dir="$repo_root/terraform/app"
firewall_vars="$terraform_dir/mysql-firewall.auto.tfvars.json"

for command_name in terraform jq curl az; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

if ! terraform -chdir="$terraform_dir" state show azurerm_linux_web_app.app >/dev/null 2>&1; then
  temporary_vars=$(mktemp "$terraform_dir/.mysql-firewall.XXXXXX.json")
  trap 'rm -f "$temporary_vars"' EXIT HUP INT TERM
  jq -n '{mysql_app_outbound_ips: []}' >"$temporary_vars"
  mv "$temporary_vars" "$firewall_vars"
  trap - EXIT HUP INT TERM
  echo "Removed stale MySQL firewall inputs for the new stack."
fi

echo "Applying the stack. A new stack intentionally has no MySQL client rules yet."
terraform -chdir="$terraform_dir" apply "$@"

outbound_ips=$(terraform -chdir="$terraform_dir" output -json app_outbound_ip_addresses)
temporary_vars=$(mktemp "$terraform_dir/.mysql-firewall.XXXXXX.json")
trap 'rm -f "$temporary_vars"' EXIT HUP INT TERM

jq -n --argjson outbound_ips "$outbound_ips" \
  '{mysql_app_outbound_ips: ($outbound_ips | map(select(type == "string" and length > 0)) | unique)}' \
  >"$temporary_vars"
mv "$temporary_vars" "$firewall_vars"

echo "Reconciling the App Service outbound addresses into the MySQL firewall."
terraform -chdir="$terraform_dir" apply "$@"

deployment=$(terraform -chdir="$terraform_dir" output -json deployment)
expected_sha=$(terraform -chdir="$terraform_dir" output -raw bootstrap_build_sha)
resource_group=$(printf '%s' "$deployment" | jq -r '.resource_group')
web_app_name=$(printf '%s' "$deployment" | jq -r '.web_app_name')
staging_slot=$(printf '%s' "$deployment" | jq -r '.staging_slot')

production_id=$(az webapp show \
  --resource-group "$resource_group" \
  --name "$web_app_name" \
  --query id -o tsv)
staging_id=$(az webapp show \
  --resource-group "$resource_group" \
  --name "$web_app_name" \
  --slot "$staging_slot" \
  --query id -o tsv)

refresh_key_vault_references() {
  site_id=$1
  deadline=$(( $(date +%s) + 300 ))

  while [ "$(date +%s)" -lt "$deadline" ]; do
    az rest --method post \
      --url "https://management.azure.com${site_id}/config/configreferences/appsettings/refresh?api-version=2022-03-01" \
      --only-show-errors -o none
    statuses=$(az rest --method get \
      --url "https://management.azure.com${site_id}/config/configreferences/appsettings?api-version=2022-03-01" \
      --query 'value[].properties.status' -o json)
    if printf '%s' "$statuses" | jq -e 'length > 0 and all(. == "Resolved")' >/dev/null; then
      echo "Resolved Key Vault references for $site_id."
      return 0
    fi
    printf 'Waiting for Key Vault references on %s; statuses=%s\n' \
      "$site_id" "$(printf '%s' "$statuses" | jq -c 'unique')"
    sleep 10
  done

  echo "Timed out resolving Key Vault references for $site_id." >&2
  return 1
}

refresh_key_vault_references "$production_id"
refresh_key_vault_references "$staging_id"

az webapp restart --resource-group "$resource_group" --name "$web_app_name" --only-show-errors
az webapp restart --resource-group "$resource_group" --name "$web_app_name" \
  --slot "$staging_slot" --only-show-errors

for base_url in \
  "$(printf '%s' "$deployment" | jq -r '.production_url')" \
  "$(printf '%s' "$deployment" | jq -r '.staging_url')"; do
  deadline=$(( $(date +%s) + 600 ))
  verified=false
  while [ "$(date +%s)" -lt "$deadline" ]; do
    health=$(curl --fail --silent --show-error --max-time 5 "$base_url/health" 2>/dev/null || true)
    version=$(curl --fail --silent --show-error --max-time 5 "$base_url/version" 2>/dev/null || true)
    if printf '%s' "$health" | jq -e '.status == "ok" and .database == "mysql"' >/dev/null 2>&1 \
      && printf '%s' "$version" | jq -e --arg sha "$expected_sha" '.buildSha == $sha' >/dev/null 2>&1; then
      echo "Verified $base_url: MySQL health is ready and build SHA is $expected_sha."
      verified=true
      break
    fi
    sleep 5
  done
  if [ "$verified" != true ]; then
    echo "Timed out waiting for $base_url to become healthy." >&2
    exit 1
  fi
done
