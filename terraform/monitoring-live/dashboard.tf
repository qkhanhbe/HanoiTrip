locals {
  dashboard_metrics = {
    requests = {
      resource_id = data.azurerm_linux_web_app.live.id
      metric      = "Requests"
      aggregation = "Total"
      title       = "App requests"
    }
    response_time = {
      resource_id = data.azurerm_linux_web_app.live.id
      metric      = "AverageResponseTime"
      aggregation = "Average"
      title       = "App response time"
    }
    http_5xx = {
      resource_id = data.azurerm_linux_web_app.live.id
      metric      = "Http5xx"
      aggregation = "Total"
      title       = "App HTTP 5xx"
    }
    cpu = {
      resource_id = data.azurerm_service_plan.live.id
      metric      = "CpuPercentage"
      aggregation = "Average"
      title       = "App Service CPU"
    }
    memory = {
      resource_id = data.azurerm_service_plan.live.id
      metric      = "MemoryPercentage"
      aggregation = "Average"
      title       = "App Service memory"
    }
    http_queue = {
      resource_id = data.azurerm_service_plan.live.id
      metric      = "HttpQueueLength"
      aggregation = "Average"
      title       = "App Service HTTP queue"
    }
    mysql_cpu = {
      resource_id = data.azurerm_mysql_flexible_server.live.id
      metric      = "cpu_percent"
      aggregation = "Average"
      title       = "MySQL CPU"
    }
    mysql_connections = {
      resource_id = data.azurerm_mysql_flexible_server.live.id
      metric      = "active_connections"
      aggregation = "Average"
      title       = "MySQL active connections"
    }
    mysql_storage = {
      resource_id = data.azurerm_mysql_flexible_server.live.id
      metric      = "storage_percent"
      aggregation = "Average"
      title       = "MySQL storage"
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
        type = "Extension/HubsExtension/PartType/MonitorChartPart"
        inputs = [
          {
            name = "options"
            value = {
              chart = {
                metrics = [{
                  resourceMetadata = {
                    id = definition.resource_id
                  }
                  name            = definition.metric
                  aggregationType = definition.aggregation == "Total" ? 1 : 4
                  namespace       = join("/", slice(split("/", definition.resource_id), 6, 8))
                }]
                title     = definition.title
                titleKind = 1
                visualization = {
                  chartType = 2
                }
                timespan = { relative = { duration = 3600000 } }
              }
            }
          },
          { name = "sharedTimeRange", isOptional = true }
        ]
        settings = {}
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
