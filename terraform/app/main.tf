resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

resource "random_password" "mysql_admin" {
  length  = 24
  special = true
}

locals {
  suffix          = "${var.environment}-${random_string.suffix.result}"
  compact_name    = "${var.project_name}${var.environment}${random_string.suffix.result}"
  key_vault_name  = "kv-${local.compact_name}"
  repository_root = abspath("${path.module}/../..")
  bootstrap_source_files = sort(distinct(concat(
    tolist(fileset(local.repository_root, "app/**")),
    tolist(fileset(local.repository_root, "public/**")),
    [
      "Dockerfile",
      "index.html",
      "package-lock.json",
      "package.json",
      "tsconfig.json",
      "tsconfig.server.json",
      "vite.config.ts",
    ],
  )))
  bootstrap_source_sha = sha256(join("", [
    for source_file in local.bootstrap_source_files :
    filesha256("${local.repository_root}/${source_file}")
  ]))
  bootstrap_image_tag = substr(local.bootstrap_source_sha, 0, 16)
  common_app_settings = {
    WEBSITES_PORT       = "8080"
    NODE_ENV            = "production"
    HOST                = "0.0.0.0"
    PORT                = "8080"
    BUILD_SHA           = local.bootstrap_image_tag
    DB_MODE             = "mysql"
    DB_MIGRATE_ON_START = "true"
    MYSQL_HOST          = azurerm_mysql_flexible_server.db.fqdn
    MYSQL_PORT          = "3306"
    MYSQL_DATABASE      = azurerm_mysql_flexible_database.app.name
    MYSQL_USER          = azurerm_mysql_flexible_server.db.administrator_login
    MYSQL_PASSWORD      = "@Microsoft.KeyVault(VaultName=${local.key_vault_name};SecretName=mysql-admin-password)"
    MYSQL_TLS           = "true"
    ROUTES_MODE         = var.routes_mode
    ROAD_PROVIDER       = var.road_provider
    DIAGNOSTICS_ENABLED = "false"
  }
  google_app_settings = var.routes_mode == "google" ? {
    GOOGLE_ROUTES_API_KEY   = "@Microsoft.KeyVault(VaultName=${local.key_vault_name};SecretName=google-routes-api-key)"
    GOOGLE_MAPS_BROWSER_KEY = "@Microsoft.KeyVault(VaultName=${local.key_vault_name};SecretName=google-maps-browser-key)"
  } : {}
  vietmap_app_settings = var.road_provider == "vietmap" ? {
    VIETMAP_API_KEY = "@Microsoft.KeyVault(VaultName=${local.key_vault_name};SecretName=vietmap-api-key)"
  } : {}
  app_settings = merge(local.common_app_settings, local.google_app_settings, local.vietmap_app_settings)
}

resource "azurerm_resource_group" "app" {
  name     = "rg-${var.project_name}-${local.suffix}"
  location = var.location
  tags     = var.tags
}

resource "azurerm_virtual_network" "app" {
  name                = "vnet-${var.project_name}-${local.suffix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  address_space       = var.vnet_address_space
  tags                = var.tags
}

resource "azurerm_subnet" "app" {
  name                 = "snet-app-service"
  resource_group_name  = azurerm_resource_group.app.name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = var.app_subnet_address_prefixes
  service_endpoints    = ["Microsoft.KeyVault"]

  delegation {
    name = "app-service"

    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${var.project_name}-${local.suffix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  tags                = var.tags
}

resource "azurerm_container_registry" "app" {
  name                = "acr${local.compact_name}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.tags
}

# The first image is application delivery rather than infrastructure, but M8
# requires a single unattended Terraform apply to leave a runnable stack. The
# subscription blocks ACR Tasks, so local Docker builds the reviewed context and
# Azure CLI obtains short-lived ACR authentication; no registry password,
# source token or Portal action is required.
resource "terraform_data" "bootstrap_image" {
  triggers_replace = [
    azurerm_container_registry.app.id,
    local.bootstrap_source_sha,
  ]

  provisioner "local-exec" {
    working_dir = local.repository_root
    interpreter = ["/bin/bash", "-c"]
    environment = {
      ACR_LOGIN_SERVER = azurerm_container_registry.app.login_server
      ACR_NAME         = azurerm_container_registry.app.name
      BUILD_SHA        = local.bootstrap_image_tag
      IMAGE_REPOSITORY = var.bootstrap_image_repository
    }
    command = <<-EOT
      set -euo pipefail
      command -v az >/dev/null
      command -v docker >/dev/null
      for attempt in 1 2 3; do
        if az acr login --name "$ACR_NAME"; then
          break
        fi
        if [ "$attempt" = 3 ]; then
          echo "ACR login failed after three attempts." >&2
          exit 1
        fi
        sleep 5
      done
      image="$ACR_LOGIN_SERVER/$IMAGE_REPOSITORY:$BUILD_SHA"
      docker build --network=host --build-arg "BUILD_SHA=$BUILD_SHA" --tag "$image" .
      docker push "$image"
    EOT
  }
}

resource "azurerm_service_plan" "app" {
  name                = "asp-${var.project_name}-${local.suffix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = var.tags
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = "log-${var.project_name}-${local.suffix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_key_vault" "app" {
  name                          = local.key_vault_name
  resource_group_name           = azurerm_resource_group.app.name
  location                      = azurerm_resource_group.app.location
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 7
  public_network_access_enabled = true
  tags                          = var.tags

  network_acls {
    bypass         = "AzureServices"
    default_action = "Deny"
    ip_rules       = var.allowed_ip_cidrs
    virtual_network_subnet_ids = [
      azurerm_subnet.app.id,
    ]
  }

}

resource "azurerm_role_assignment" "terraform_key_vault_secrets_officer" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

# Expiry is a required, RFC 3339-validated deployment input. Trivy cannot resolve
# required Terraform variables during its configuration-only scan.
#trivy:ignore:AVD-AZU-0017:exp:2027-03-31
resource "azurerm_key_vault_secret" "mysql_password" {
  name            = "mysql-admin-password"
  value           = random_password.mysql_admin.result
  key_vault_id    = azurerm_key_vault.app.id
  content_type    = "password"
  expiration_date = var.mysql_secret_expiration_date

  depends_on = [azurerm_role_assignment.terraform_key_vault_secrets_officer]
}

# The internship requires a public MySQL endpoint restricted to App Service
# outbound IPs (M3), so private-only networking is intentionally out of scope.
# Flexible Server enforces TLS through server parameters rather than attributes
# understood by this legacy Trivy rule; the explicit configurations below are
# the compensating controls. Reassess both exceptions before 31 March 2027.
#trivy:ignore:AVD-AZU-0022:exp:2027-03-31 trivy:ignore:AVD-AZU-0026:exp:2027-03-31
resource "azurerm_mysql_flexible_server" "db" {
  name                         = "mysql-${var.project_name}-${local.suffix}"
  resource_group_name          = azurerm_resource_group.app.name
  location                     = azurerm_resource_group.app.location
  administrator_login          = "hanoiadmin"
  administrator_password       = random_password.mysql_admin.result
  backup_retention_days        = 7
  geo_redundant_backup_enabled = false
  sku_name                     = var.mysql_sku_name
  version                      = "8.0.21"
  zone                         = "1"
  tags                         = var.tags
}

resource "azurerm_mysql_flexible_server_configuration" "secure_transport" {
  name                = "require_secure_transport"
  resource_group_name = azurerm_resource_group.app.name
  server_name         = azurerm_mysql_flexible_server.db.name
  value               = "ON"
}

resource "azurerm_mysql_flexible_server_configuration" "tls_version" {
  name                = "tls_version"
  resource_group_name = azurerm_resource_group.app.name
  server_name         = azurerm_mysql_flexible_server.db.name
  value               = "TLSv1.2"
}

resource "azurerm_mysql_flexible_database" "app" {
  name                = "hanoitrip"
  resource_group_name = azurerm_resource_group.app.name
  server_name         = azurerm_mysql_flexible_server.db.name
  charset             = "utf8mb4"
  collation           = "utf8mb4_unicode_ci"
}

# This anonymous planner is protected by the required default-deny IP allowlist.
# Requiring App Service Easy Auth or a client certificate would break the M6 curl
# evidence and browser access. Reassess if user accounts enter scope.
#trivy:ignore:AVD-AZU-0001:exp:2027-03-31 trivy:ignore:AVD-AZU-0003:exp:2027-03-31
resource "azurerm_linux_web_app" "app" {
  name                            = "app-${var.project_name}-${local.suffix}"
  resource_group_name             = azurerm_resource_group.app.name
  location                        = azurerm_resource_group.app.location
  service_plan_id                 = azurerm_service_plan.app.id
  https_only                      = true
  app_settings                    = local.app_settings
  key_vault_reference_identity_id = azurerm_user_assigned_identity.app.id
  virtual_network_subnet_id       = azurerm_subnet.app.id
  tags                            = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  site_config {
    always_on                                     = true
    container_registry_use_managed_identity       = true
    container_registry_managed_identity_client_id = azurerm_user_assigned_identity.app.client_id
    ftps_state                                    = "Disabled"
    health_check_path                             = "/health"
    health_check_eviction_time_in_min             = 2
    http2_enabled                                 = true
    minimum_tls_version                           = "1.2"
    scm_minimum_tls_version                       = "1.2"
    vnet_route_all_enabled                        = true
    ip_restriction_default_action                 = "Deny"
    scm_ip_restriction_default_action             = "Deny"

    dynamic "ip_restriction" {
      for_each = { for index, cidr in var.allowed_ip_cidrs : cidr => index }
      content {
        name       = "allowed-${ip_restriction.value + 1}"
        action     = "Allow"
        ip_address = ip_restriction.key
        priority   = 100 + ip_restriction.value
      }
    }
  }

  lifecycle {
    ignore_changes = [
      app_settings["BUILD_SHA"],
    ]
  }
}

resource "azurerm_linux_web_app_slot" "staging" {
  name                            = "staging"
  app_service_id                  = azurerm_linux_web_app.app.id
  app_settings                    = local.app_settings
  key_vault_reference_identity_id = azurerm_user_assigned_identity.app.id
  virtual_network_subnet_id       = azurerm_subnet.app.id
  tags                            = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  site_config {
    always_on                                     = true
    container_registry_use_managed_identity       = true
    container_registry_managed_identity_client_id = azurerm_user_assigned_identity.app.client_id
    ftps_state                                    = "Disabled"
    health_check_path                             = "/health"
    health_check_eviction_time_in_min             = 2
    http2_enabled                                 = true
    minimum_tls_version                           = "1.2"
    scm_minimum_tls_version                       = "1.2"
    vnet_route_all_enabled                        = true
    ip_restriction_default_action                 = "Deny"
    scm_ip_restriction_default_action             = "Deny"

    dynamic "ip_restriction" {
      for_each = { for index, cidr in var.allowed_ip_cidrs : cidr => index }
      content {
        name       = "allowed-${ip_restriction.value + 1}"
        action     = "Allow"
        ip_address = ip_restriction.key
        priority   = 100 + ip_restriction.value
      }
    }
  }

  lifecycle {
    ignore_changes = [
      app_settings["BUILD_SHA"],
    ]
  }
}

# AzureRM does not yet model App Service's sitecontainers child resources.
# Keep the Web App/slot lifecycle in AzureRM and use AzAPI only for the new
# container deployment mode that the release workflow updates by immutable SHA.
resource "azapi_update_resource" "app_sitecontainers_mode" {
  type        = "Microsoft.Web/sites/config@2024-04-01"
  resource_id = "${azurerm_linux_web_app.app.id}/config/web"
  body = {
    properties = {
      linuxFxVersion = "sitecontainers"
    }
  }
}

resource "azapi_update_resource" "staging_sitecontainers_mode" {
  type        = "Microsoft.Web/sites/slots/config@2024-04-01"
  resource_id = "${azurerm_linux_web_app_slot.staging.id}/config/web"
  body = {
    properties = {
      linuxFxVersion = "sitecontainers"
    }
  }
}

resource "azapi_resource" "production_main_container" {
  type      = "Microsoft.Web/sites/sitecontainers@2024-04-01"
  name      = "main"
  parent_id = azurerm_linux_web_app.app.id
  body = {
    properties = {
      authType                    = "UserAssigned"
      image                       = "${azurerm_container_registry.app.login_server}/${var.bootstrap_image_repository}:${local.bootstrap_image_tag}"
      isMain                      = true
      targetPort                  = "8080"
      userManagedIdentityClientId = azurerm_user_assigned_identity.app.client_id
    }
  }

  depends_on = [
    azapi_update_resource.app_sitecontainers_mode,
    azurerm_key_vault_secret.mysql_password,
    terraform_data.bootstrap_image,
    time_sleep.acr_pull_rbac,
    time_sleep.key_vault_reference_rbac,
  ]

  lifecycle {
    # CD owns the immutable image and switches auth to the shared UAMI.
    ignore_changes = [body]
  }
}

resource "azapi_resource" "staging_main_container" {
  type      = "Microsoft.Web/sites/slots/sitecontainers@2024-04-01"
  name      = "main"
  parent_id = azurerm_linux_web_app_slot.staging.id
  body = {
    properties = {
      authType                    = "UserAssigned"
      image                       = "${azurerm_container_registry.app.login_server}/${var.bootstrap_image_repository}:${local.bootstrap_image_tag}"
      isMain                      = true
      targetPort                  = "8080"
      userManagedIdentityClientId = azurerm_user_assigned_identity.app.client_id
    }
  }

  depends_on = [
    azapi_update_resource.staging_sitecontainers_mode,
    azurerm_key_vault_secret.mysql_password,
    terraform_data.bootstrap_image,
    time_sleep.acr_pull_rbac,
    time_sleep.key_vault_reference_rbac,
  ]

  lifecycle {
    # CD owns the immutable image and switches auth to the shared UAMI.
    ignore_changes = [body]
  }
}

resource "azurerm_role_assignment" "app_acr_pull" {
  scope                = azurerm_container_registry.app.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "time_sleep" "acr_pull_rbac" {
  depends_on      = [azurerm_role_assignment.app_acr_pull]
  create_duration = "30s"
}

resource "azurerm_role_assignment" "app_key_vault_secrets_user" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "time_sleep" "key_vault_reference_rbac" {
  depends_on = [
    azurerm_key_vault_secret.mysql_password,
    azurerm_role_assignment.app_key_vault_secrets_user,
  ]
  create_duration = "60s"
}

resource "azurerm_mysql_flexible_server_firewall_rule" "app_outbound" {
  # App Service reports these addresses only after it exists. Feeding the first
  # apply's output back as an input keeps resource instance keys known at plan
  # time while the wrapper script still performs the process without Portal work.
  for_each = var.mysql_app_outbound_ips

  name                = "app-${replace(each.value, ".", "-")}"
  resource_group_name = azurerm_resource_group.app.name
  server_name         = azurerm_mysql_flexible_server.db.name
  start_ip_address    = each.value
  end_ip_address      = each.value
}

resource "azurerm_role_assignment" "github_acr_push" {
  count                = var.github_actions_principal_object_id == null ? 0 : 1
  scope                = azurerm_container_registry.app.id
  role_definition_name = "AcrPush"
  principal_id         = var.github_actions_principal_object_id
}

resource "azurerm_role_assignment" "github_deploy" {
  count                = var.github_actions_principal_object_id == null ? 0 : 1
  scope                = azurerm_resource_group.app.id
  role_definition_name = "Contributor"
  principal_id         = var.github_actions_principal_object_id
}

resource "azurerm_role_assignment" "github_key_vault_secrets_user" {
  count                = var.github_actions_principal_object_id == null ? 0 : 1
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.github_actions_principal_object_id
}
