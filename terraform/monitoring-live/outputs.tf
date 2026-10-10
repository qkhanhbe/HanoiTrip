output "monitoring" {
  value = {
    workspace_name    = azurerm_log_analytics_workspace.operations.name
    dashboard_name    = azurerm_portal_dashboard.operations.name
    action_group_name = azurerm_monitor_action_group.operations.name
    alert_names = [
      azurerm_monitor_metric_alert.http_5xx.name,
      azurerm_monitor_metric_alert.cpu.name,
      azurerm_monitor_metric_alert.mysql_connections.name,
    ]
    autoscale_name = azurerm_monitor_autoscale_setting.app.name
  }
}
