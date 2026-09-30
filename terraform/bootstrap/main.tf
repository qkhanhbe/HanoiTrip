resource "azurerm_resource_group" "state" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# LRS is intentional for this disposable, single-region internship sandbox.
# Production state needs a separate resilience review before this expires.
# Keep queue logging inline while AzureRM is pinned to v4: the company Semgrep
# policy does not yet recognize the standalone queue-properties resource.
# Migrate both together before upgrading this module to AzureRM v5.
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
    ip_rules       = var.allowed_ip_cidrs
  }

  queue_properties {
    logging {
      delete                = true
      read                  = true
      write                 = true
      version               = "1.0"
      retention_policy_days = 7
    }
  }
}

resource "azurerm_storage_container" "state" {
  name                  = var.container_name
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
}
