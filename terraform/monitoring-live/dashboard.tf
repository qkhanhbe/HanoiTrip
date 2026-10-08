locals {
  dashboard_metrics = {
    requests = {
      resource_id = data.azurerm_linux_web_app.live.id
      metric      = "Requests"
    }
    response_time = {
      resource_id = data.azurerm_linux_web_app.live.id
      metric      = "AverageResponseTime"
    }
    http_5xx = {
      resource_id = data.azurerm_linux_web_app.live.id
      metric      = "Http5xx"
    }
    cpu = {
      resource_id = data.azurerm_service_plan.live.id
      metric      = "CpuPercentage"
    }
    memory = {
      resource_id = data.azurerm_service_plan.live.id
      metric      = "MemoryPercentage"
    }
    http_queue = {
      resource_id = data.azurerm_service_plan.live.id
      metric      = "HttpQueueLength"
    }
    mysql_cpu = {
      resource_id = data.azurerm_mysql_flexible_server.live.id
      metric      = "cpu_percent"
    }
    mysql_connections = {
      resource_id = data.azurerm_mysql_flexible_server.live.id
      metric      = "active_connections"
    }
    mysql_storage = {
      resource_id = data.azurerm_mysql_flexible_server.live.id
      metric      = "storage_percent"
    }
  }

  dashboard_positions = {
    requests          = { x = 0, y = 2 }
    response_time     = { x = 4, y = 2 }
    http_5xx          = { x = 8, y = 2 }
    cpu               = { x = 0, y = 6 }
    memory            = { x = 4, y = 6 }
    http_queue        = { x = 8, y = 6 }
    mysql_cpu         = { x = 0, y = 10 }
    mysql_connections = { x = 4, y = 10 }
    mysql_storage     = { x = 8, y = 10 }
  }

  dashboard_metric_parts = {
    for key, definition in local.dashboard_metrics : key => {
      position = {
        x       = local.dashboard_positions[key].x
        y       = local.dashboard_positions[key].y
        colSpan = 4
        rowSpan = 4
      }
      metadata = {
        inputs = [{
          name = "queryInputs"
          value = {
            timespan  = { duration = "PT1H" }
            id        = definition.resource_id
            chartType = 0
            metrics = [{
              name       = definition.metric
              resourceId = definition.resource_id
            }]
          }
        }]
        type = "Extension/Microsoft_Azure_Monitoring/PartType/MetricsChartPart"
      }
    }
  }
}

resource "azurerm_portal_dashboard" "operations" {
  name                = var.dashboard_name
  resource_group_name = data.azurerm_resource_group.live.name
  location            = data.azurerm_resource_group.live.location

  dashboard_properties = jsonencode({
    lenses = {
      "0" = {
        order = 0
        parts = merge(
          {
            overview = {
              position = {
                x       = 0
                y       = 0
                colSpan = 12
                rowSpan = 2
              }
              metadata = {
                inputs = []
                type   = "Extension/HubsExtension/PartType/MarkdownPart"
                settings = {
                  content = {
                    settings = {
                      title    = "HanoiTrip operations"
                      subtitle = "Azure Monitor metrics without Application Insights"
                      content  = "Application performance, App Service capacity, and MySQL health for the last hour. Structured request logs are available in the linked Log Analytics workspace."
                    }
                  }
                }
              }
            }
          },
          local.dashboard_metric_parts
        )
      }
    }
    metadata = { model = {} }
  })

  tags = merge(var.tags, {
    hidden-title = "HanoiTrip operations"
  })
}
