variable "resource_group_name" {
  type        = string
  default     = "rg-hanoitrip-sandbox"
  description = "Existing resource group containing the live HanoiTrip workload."
}

variable "web_app_name" {
  type        = string
  default     = "hanoitrip"
  description = "Existing production App Service name."
}

variable "service_plan_name" {
  type        = string
  default     = "asp-hanoitrip-eastasia"
  description = "Existing App Service Plan name."
}

variable "mysql_server_name" {
  type        = string
  default     = "mysql-hanoitrip-bqk"
  description = "Existing MySQL Flexible Server name."
}

variable "workspace_name" {
  type        = string
  default     = "log-hanoitrip-bqk"
  description = "Log Analytics workspace managed by this monitoring-only stack."
}

variable "dashboard_name" {
  type        = string
  default     = "dashboard-hanoitrip-bqk"
  description = "Azure Portal dashboard resource name."
}

variable "action_group_name" {
  type        = string
  default     = "ag-hanoitrip-bqk"
  description = "Azure Monitor action group name."
}

variable "autoscale_name" {
  type        = string
  default     = "autoscale-hanoitrip-bqk"
  description = "Autoscale setting name."
}

variable "alert_email" {
  type        = string
  sensitive   = true
  description = "Email receiver for Azure Monitor alerts."

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.alert_email))
    error_message = "Provide a valid alert email address."
  }
}

variable "tags" {
  type = map(string)
  default = {
    project     = "hanoitrip"
    environment = "sandbox"
    managed_by  = "terraform-monitoring-live"
  }
}
