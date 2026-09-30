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
  suffix         = "${var.environment}-${random_string.suffix.result}"
  compact_name   = "${var.project_name}${var.environment}${random_string.suffix.result}"
  key_vault_name = "kv-${local.compact_name}"
  common_app_settings = {
    WEBSITES_PORT       = "8080"
    NODE_ENV            = "production"
    HOST                = "0.0.0.0"
    PORT                = "8080"
    BUILD_SHA           = "bootstrap"
    DB_MODE             = "mysql"
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
    ip_rules = distinct(concat(
      var.allowed_ip_cidrs,
      azurerm_linux_web_app.app.possible_outbound_ip_address_list,
      azurerm_linux_web_app_slot.staging.possible_outbound_ip_address_list,
    ))
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
    http2_enabled                                 = true
    minimum_tls_version                           = "1.2"
    scm_minimum_tls_version                       = "1.2"
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
    http2_enabled                                 = true
    minimum_tls_version                           = "1.2"
    scm_minimum_tls_version                       = "1.2"
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
      authType   = "Anonymous"
      image      = var.initial_image
      isMain     = true
      targetPort = "8080"
    }
  }

  depends_on = [azapi_update_resource.app_sitecontainers_mode]

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
      authType   = "Anonymous"
      image      = var.initial_image
      isMain     = true
      targetPort = "8080"
    }
  }

  depends_on = [azapi_update_resource.staging_sitecontainers_mode]

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

resource "azurerm_role_assignment" "app_key_vault_secrets_user" {
  scope                = azurerm_key_vault.app.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_mysql_flexible_server_firewall_rule" "app_outbound" {
  for_each = toset(concat(
    azurerm_linux_web_app.app.outbound_ip_address_list,
    azurerm_linux_web_app_slot.staging.outbound_ip_address_list,
  ))
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
