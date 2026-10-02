#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
terraform_dir="$repo_root/terraform/app"
firewall_vars="$terraform_dir/mysql-firewall.auto.tfvars.json"

for command_name in terraform jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

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
