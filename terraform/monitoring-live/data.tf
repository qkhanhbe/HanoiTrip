data "azurerm_resource_group" "live" {
  name = var.resource_group_name
}

data "azurerm_linux_web_app" "live" {
  name                = var.web_app_name
  resource_group_name = data.azurerm_resource_group.live.name
}

data "azurerm_service_plan" "live" {
  name                = var.service_plan_name
  resource_group_name = data.azurerm_resource_group.live.name
}

data "azurerm_mysql_flexible_server" "live" {
  name                = var.mysql_server_name
  resource_group_name = data.azurerm_resource_group.live.name
}
