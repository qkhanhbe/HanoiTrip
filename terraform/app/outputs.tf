output "deployment" {
  value = {
    resource_group     = azurerm_resource_group.app.name
    web_app_name       = azurerm_linux_web_app.app.name
    staging_slot       = azurerm_linux_web_app_slot.staging.name
    production_url     = "https://${azurerm_linux_web_app.app.default_hostname}"
    staging_url        = "https://${azurerm_linux_web_app.app.name}-staging.azurewebsites.net"
    acr_name           = azurerm_container_registry.app.name
    acr_login_server   = azurerm_container_registry.app.login_server
    mysql_server_name  = azurerm_mysql_flexible_server.db.name
    key_vault_name     = azurerm_key_vault.app.name
    log_analytics_name = azurerm_log_analytics_workspace.app.name
  }
}

output "app_principal_id" {
  value = azurerm_linux_web_app.app.identity[0].principal_id
}

output "staging_principal_id" {
  value = azurerm_linux_web_app_slot.staging.identity[0].principal_id
}
