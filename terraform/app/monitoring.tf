resource "azurerm_monitor_diagnostic_setting" "web" {
  name                       = "send-to-log-analytics"
  target_resource_id         = azurerm_linux_web_app.app.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id

  enabled_log { category_group = "allLogs" }
  enabled_metric { category = "AllMetrics" }
}

resource "azurerm_monitor_diagnostic_setting" "mysql" {
  name                       = "send-to-log-analytics"
  target_resource_id         = azurerm_mysql_flexible_server.db.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id

  enabled_log { category_group = "allLogs" }
  enabled_metric { category = "AllMetrics" }
}

resource "azurerm_monitor_action_group" "operations" {
  name                = "ag-${var.project_name}-${local.suffix}"
  resource_group_name = azurerm_resource_group.app.name
  short_name          = "hanoitrip"
  tags                = var.tags

  email_receiver {
    name          = "intern-email"
    email_address = var.alert_email
  }
}

resource "azurerm_monitor_metric_alert" "http_5xx" {
  name                = "${var.project_name}-http-5xx"
  resource_group_name = azurerm_resource_group.app.name
  scopes              = [azurerm_linux_web_app.app.id]
  description         = "Production returned HTTP 5xx responses."
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "Http5xx"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5
  }

  action { action_group_id = azurerm_monitor_action_group.operations.id }
}

resource "azurerm_monitor_metric_alert" "cpu" {
  name                = "${var.project_name}-cpu-high"
  resource_group_name = azurerm_resource_group.app.name
  scopes              = [azurerm_service_plan.app.id]
  description         = "App Service Plan CPU stayed high."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.Web/serverfarms"
    metric_name      = "CpuPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 75
  }

  action { action_group_id = azurerm_monitor_action_group.operations.id }
}

resource "azurerm_monitor_metric_alert" "mysql_connections" {
  name                = "${var.project_name}-mysql-connections"
  resource_group_name = azurerm_resource_group.app.name
  scopes              = [azurerm_mysql_flexible_server.db.id]
  description         = "MySQL active connections exceeded the sandbox threshold."
  severity            = 2
  frequency           = "PT1M"
  window_size         = "PT5M"

  criteria {
    metric_namespace = "Microsoft.DBforMySQL/flexibleServers"
    metric_name      = "active_connections"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 20
  }

  action { action_group_id = azurerm_monitor_action_group.operations.id }
}

resource "azurerm_monitor_autoscale_setting" "app" {
  name                = "autoscale-${var.project_name}-${local.suffix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  target_resource_id  = azurerm_service_plan.app.id

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
        metric_resource_id = azurerm_service_plan.app.id
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
        metric_resource_id = azurerm_service_plan.app.id
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
