resource "azurerm_log_analytics_workspace" "operations" {
  name                = var.workspace_name
  resource_group_name = data.azurerm_resource_group.live.name
  location            = data.azurerm_resource_group.live.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_monitor_diagnostic_setting" "web" {
  name                       = "send-to-log-analytics"
  target_resource_id         = data.azurerm_linux_web_app.live.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.operations.id

  enabled_log {
    category_group = "allLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "mysql" {
  name                       = "send-to-log-analytics"
  target_resource_id         = data.azurerm_mysql_flexible_server.live.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.operations.id

  enabled_log {
    category_group = "allLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_action_group" "operations" {
  name                = var.action_group_name
  resource_group_name = data.azurerm_resource_group.live.name
  short_name          = "hanoitrip"
  tags                = var.tags

  email_receiver {
    name          = "intern-email"
    email_address = var.alert_email
  }
}

resource "azurerm_monitor_metric_alert" "http_5xx" {
  name                = "hanoitrip-http-5xx"
  resource_group_name = data.azurerm_resource_group.live.name
  scopes              = [data.azurerm_linux_web_app.live.id]
  description         = "Production returned more than five HTTP 5xx responses in five minutes."
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "Http5xx"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action {
    action_group_id = azurerm_monitor_action_group.operations.id
  }
}

resource "azurerm_monitor_metric_alert" "cpu" {
  name                = "hanoitrip-cpu-high"
  resource_group_name = data.azurerm_resource_group.live.name
  scopes              = [data.azurerm_service_plan.live.id]
  description         = "App Service Plan CPU stayed above 75 percent for five minutes."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.Web/serverfarms"
    metric_name      = "CpuPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 75
  }

  action {
    action_group_id = azurerm_monitor_action_group.operations.id
  }
}

resource "azurerm_monitor_metric_alert" "mysql_connections" {
  name                = "hanoitrip-mysql-connections"
  resource_group_name = data.azurerm_resource_group.live.name
  scopes              = [data.azurerm_mysql_flexible_server.live.id]
  description         = "MySQL active connections exceeded the sandbox threshold."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.DBforMySQL/flexibleServers"
    metric_name      = "active_connections"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 20
  }

  action {
    action_group_id = azurerm_monitor_action_group.operations.id
  }
}

resource "azurerm_monitor_autoscale_setting" "app" {
  name                = var.autoscale_name
  resource_group_name = data.azurerm_resource_group.live.name
  location            = data.azurerm_resource_group.live.location
  target_resource_id  = data.azurerm_service_plan.live.id
  tags                = var.tags

  profile {
    name = "cpu"

    capacity {
      default = 1
      minimum = 1
      maximum = 2
    }

    rule {
      metric_trigger {
        metric_name        = "CpuPercentage"
        metric_resource_id = data.azurerm_service_plan.live.id
        time_grain         = "PT1M"
        statistic          = "Average"
        time_window        = "PT5M"
        time_aggregation   = "Average"
        operator           = "GreaterThan"
        threshold          = 70
      }

      scale_action {
        direction = "Increase"
        type      = "ChangeCount"
        value     = "1"
        cooldown  = "PT5M"
      }
    }

    rule {
      metric_trigger {
        metric_name        = "CpuPercentage"
        metric_resource_id = data.azurerm_service_plan.live.id
        time_grain         = "PT1M"
        statistic          = "Average"
        time_window        = "PT10M"
        time_aggregation   = "Average"
        operator           = "LessThan"
        threshold          = 35
      }

      scale_action {
        direction = "Decrease"
        type      = "ChangeCount"
        value     = "1"
        cooldown  = "PT10M"
      }
    }
  }
}
