variable "project_name" {
  type        = string
  default     = "hanoitrip"
  description = "Short resource name prefix."
}

variable "environment" {
  type        = string
  default     = "dev"
  description = "Environment suffix."
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "Use dev, test, or prod."
  }
}

variable "location" {
  type        = string
  default     = "southeastasia"
  description = "Azure region."
}

variable "allowed_ip_cidrs" {
  type        = list(string)
  description = "Public CIDRs allowed to access production and staging."
  validation {
    condition     = length(var.allowed_ip_cidrs) > 0 && alltrue([for cidr in var.allowed_ip_cidrs : can(cidrhost(cidr, 0))])
    error_message = "Provide at least one valid CIDR, normally your current public IP as /32."
  }
}

variable "initial_image" {
  type        = string
  default     = "appsvc/staticsite:latest"
  description = "Bootstrap image; CD replaces this with an immutable ACR SHA tag."
}

variable "initial_registry_url" {
  type        = string
  default     = "https://mcr.microsoft.com"
  description = "Registry used only for the public bootstrap image."
}

variable "routes_mode" {
  type        = string
  default     = "demo"
  description = "Use demo until Google keys have been placed in Key Vault."
  validation {
    condition     = contains(["demo", "google"], var.routes_mode)
    error_message = "Use demo or google."
  }
}

variable "mysql_sku_name" {
  type        = string
  default     = "B_Standard_B1ms"
  description = "Small sandbox MySQL SKU; verify availability in the selected region."
}

variable "app_service_sku" {
  type        = string
  default     = "S1"
  description = "Standard is the minimum intended tier for deployment slots and autoscale."
}

variable "alert_email" {
  type        = string
  description = "Email receiver for Azure Monitor alerts."
}

variable "github_actions_principal_object_id" {
  type        = string
  default     = null
  nullable    = true
  description = "Object ID of the GitHub OIDC service principal; optional until OIDC is created."
}

variable "tags" {
  type = map(string)
  default = {
    project     = "hanoitrip"
    environment = "sandbox"
    managed_by  = "terraform"
  }
}
