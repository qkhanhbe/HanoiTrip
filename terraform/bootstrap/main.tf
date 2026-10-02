resource "azurerm_resource_group" "state" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# LRS is intentional for this disposable, single-region internship sandbox.
# Production state needs a separate resilience review before this expires.
# Queue logging is configured by azurerm_storage_account_queue_properties.state.
# The company rule evaluates only this storage-account block and cannot correlate
# the standalone resource required for Entra authentication in AzureRM v4.
# nosemgrep: terraform.azure.security.storage.storage-queue-services-logging.storage-queue-services-logging
#trivy:ignore:AVD-AZU-0058:exp:2027-03-31
resource "azurerm_storage_account" "state" {
  name                              = var.storage_account_name
  resource_group_name               = azurerm_resource_group.state.name
  location                          = azurerm_resource_group.state.location
  account_tier                      = "Standard"
  account_replication_type          = "LRS"
  infrastructure_encryption_enabled = true
  min_tls_version                   = "TLS1_2"
  shared_access_key_enabled         = false
  allow_nested_items_to_be_public   = false
  tags                              = var.tags

  network_rules {
    default_action = "Deny"
    bypass         = ["Logging", "Metrics", "AzureServices"]
    # Storage accepts a single host as a bare IPv4 address, not CIDR /32.
    # Keep wider CIDRs unchanged and normalize only exact-host entries.
    ip_rules = [
      for cidr in var.allowed_ip_cidrs : trimsuffix(cidr, "/32")
    ]
  }
}

locals {
  state_data_principal_object_ids = setunion(
    toset([data.azurerm_client_config.current.object_id]),
    var.state_principal_object_ids,
  )
}

resource "azurerm_role_assignment" "state_blob_data_contributor" {
  for_each = local.state_data_principal_object_ids

  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = each.value
}

resource "azurerm_role_assignment" "state_queue_data_contributor" {
  for_each = local.state_data_principal_object_ids

  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Queue Data Contributor"
  principal_id         = each.value
}

# Data-plane RBAC can take a short time to become effective after ARM accepts
# the role assignments. Waiting here keeps the first bootstrap apply reliable.
resource "time_sleep" "state_data_plane_rbac" {
  create_duration = "45s"

  depends_on = [
    azurerm_role_assignment.state_blob_data_contributor,
    azurerm_role_assignment.state_queue_data_contributor,
  ]
}

resource "azurerm_storage_account_queue_properties" "state" {
  storage_account_id = azurerm_storage_account.state.id

  logging {
    delete                = true
    read                  = true
    write                 = true
    version               = "1.0"
    retention_policy_days = 7
  }

  depends_on = [time_sleep.state_data_plane_rbac]
}

resource "azurerm_storage_container" "state" {
  name                  = var.container_name
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"

  depends_on = [time_sleep.state_data_plane_rbac]
}
