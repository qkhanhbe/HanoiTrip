#!/usr/bin/env bash
set -euo pipefail

repo="${1:-qkhanhbe/HanoiTrip}"
environment="${2:-azure-sandbox}"
resource_group="${3:-rg-hanoitrip-sandbox}"
webapp_name="${4:-hanoitrip}"
acr_name="${5:-hanoitripbqk}"
mysql_server="${6:-mysql-hanoitrip-bqk}"
key_vault_name="${7:-kv-hanoitrip-bqk}"
display_name="github-hanoitrip-sandbox"
confirmation="${repo}:${environment}"

if [ "${GITHUB_OIDC_CONFIRM:-}" != "$confirmation" ]; then
  echo "Set GITHUB_OIDC_CONFIRM=$confirmation after reviewing the target resources." >&2
  exit 2
fi

for command_name in az gh jq; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required command: $command_name" >&2
    exit 2
  }
done

gh repo view "$repo" --json nameWithOwner --jq .nameWithOwner >/dev/null
subscription_id=$(az account show --query id -o tsv)
tenant_id=$(az account show --query tenantId -o tsv)

app_count=$(az ad app list --display-name "$display_name" --query 'length(@)' -o tsv)
if [ "$app_count" -gt 1 ]; then
  echo "Multiple Entra applications use display name $display_name; refusing an ambiguous update." >&2
  exit 1
fi
if [ "$app_count" -eq 0 ]; then
  app_object_id=$(az ad app create --display-name "$display_name" --query id -o tsv)
else
  app_object_id=$(az ad app list --display-name "$display_name" --query '[0].id' -o tsv)
fi
client_id=$(az ad app show --id "$app_object_id" --query appId -o tsv)

service_principal_id=$(az ad sp list --filter "appId eq '$client_id'" --query '[0].id' -o tsv)
if [ -z "$service_principal_id" ]; then
  service_principal_id=$(az ad sp create --id "$client_id" --query id -o tsv)
fi

credential_name="github-${environment}"
expected_subject="repo:${repo}:environment:${environment}"
credential_count=$(az ad app federated-credential list --id "$app_object_id" \
  --query "[?name=='$credential_name'] | length(@)" -o tsv)
if [ "$credential_count" -eq 0 ]; then
  credential_json=$(jq -c -n \
    --arg name "$credential_name" \
    --arg subject "$expected_subject" \
    '{name:$name,issuer:"https://token.actions.githubusercontent.com",subject:$subject,audiences:["api://AzureADTokenExchange"]}')
  az ad app federated-credential create --id "$app_object_id" --parameters "$credential_json" >/dev/null
else
  actual_subject=$(az ad app federated-credential list --id "$app_object_id" \
    --query "[?name=='$credential_name'].subject | [0]" -o tsv)
  if [ "$actual_subject" != "$expected_subject" ]; then
    echo "Existing federated credential has a different subject; refusing to widen trust." >&2
    exit 1
  fi
fi

webapp_id=$(az webapp show -g "$resource_group" -n "$webapp_name" --query id -o tsv)
acr_id=$(az acr show -g "$resource_group" -n "$acr_name" --query id -o tsv)
mysql_id=$(az mysql flexible-server show -g "$resource_group" -n "$mysql_server" --query id -o tsv)
key_vault_id=$(az keyvault show -g "$resource_group" -n "$key_vault_name" --query id -o tsv)

ensure_role() {
  local role="$1"
  local scope="$2"
  local count
  count=$(az role assignment list --assignee-object-id "$service_principal_id" --scope "$scope" \
    --query "[?roleDefinitionName=='$role'] | length(@)" -o tsv)
  if [ "$count" -eq 0 ]; then
    az role assignment create --assignee-object-id "$service_principal_id" \
      --assignee-principal-type ServicePrincipal --role "$role" --scope "$scope" >/dev/null
  fi
}

ensure_role Contributor "$webapp_id"
ensure_role Contributor "$mysql_id"
ensure_role Contributor "$key_vault_id"
ensure_role "Key Vault Secrets User" "$key_vault_id"
ensure_role AcrPush "$acr_id"

jq -n '{wait_timer:0,deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}}' |
  gh api --method PUT "repos/$repo/environments/$environment" --input - >/dev/null
branch_policy_count=$(gh api "repos/$repo/environments/$environment/deployment-branch-policies" \
  --jq '[.branch_policies[] | select(.name == "main" and .type == "branch")] | length')
if [ "$branch_policy_count" -eq 0 ]; then
  jq -n '{name:"main",type:"branch"}' |
    gh api --method POST "repos/$repo/environments/$environment/deployment-branch-policies" --input - >/dev/null
fi

gh secret set AZURE_CLIENT_ID --env "$environment" --repo "$repo" --body "$client_id"
gh secret set AZURE_TENANT_ID --env "$environment" --repo "$repo" --body "$tenant_id"
gh secret set AZURE_SUBSCRIPTION_ID --env "$environment" --repo "$repo" --body "$subscription_id"

set_variable() {
  gh variable set "$1" --repo "$repo" --body "$2"
}

set_variable AZURE_CD_ENABLED false
set_variable AZURE_CD_CONFIG_REVIEWED false
set_variable AZURE_PRODUCTION_SWAP_ENABLED false
set_variable AZURE_RESOURCE_GROUP "$resource_group"
set_variable AZURE_WEBAPP_NAME "$webapp_name"
set_variable AZURE_ACR_NAME "$acr_name"
set_variable AZURE_MYSQL_SERVER "$mysql_server"
set_variable AZURE_MYSQL_DATABASE hanoitrip
set_variable AZURE_MYSQL_MIGRATION_USER mysqladmin
set_variable AZURE_MYSQL_PASSWORD_SECRET hanoitrip-db-password
set_variable AZURE_KEY_VAULT "$key_vault_name"
set_variable AZURE_RELEASE_REQUIRE_ROAD_PROVIDER true
set_variable AZURE_VIETMAP_API_KEY_SECRET vietmap-api-key

echo "Configured passwordless GitHub OIDC for $repo environment $environment."
echo "CD remains disabled and unreviewed; no image was built, deployed or swapped."
