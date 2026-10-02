#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
terraform_dir="$repo_root/terraform/app"
firewall_vars="$terraform_dir/mysql-firewall.auto.tfvars.json"

for command_name in terraform jq curl; do
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

for base_url in \
  "$(printf '%s' "$deployment" | jq -r '.production_url')" \
  "$(printf '%s' "$deployment" | jq -r '.staging_url')"; do
  attempt=1
  while [ "$attempt" -le 60 ]; do
    health=$(curl --fail --silent --show-error --max-time 10 "$base_url/health" 2>/dev/null || true)
    version=$(curl --fail --silent --show-error --max-time 10 "$base_url/version" 2>/dev/null || true)
    if printf '%s' "$health" | jq -e '.status == "ok" and .database == "mysql"' >/dev/null 2>&1 \
      && printf '%s' "$version" | jq -e --arg sha "$expected_sha" '.buildSha == $sha' >/dev/null 2>&1; then
      echo "Verified $base_url: MySQL health is ready and build SHA is $expected_sha."
      break
    fi
    if [ "$attempt" -eq 60 ]; then
      echo "Timed out waiting for $base_url to become healthy." >&2
      exit 1
    fi
    sleep 5
    attempt=$((attempt + 1))
  done
done
