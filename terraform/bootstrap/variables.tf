variable "location" {
  type        = string
  description = "Azure region for the Terraform state resources."
  default     = "southeastasia"
}

variable "resource_group_name" {
  type        = string
  description = "Resource group dedicated to remote state."
}

variable "storage_account_name" {
  type        = string
  description = "Globally unique lowercase storage account name."
  validation {
    condition     = can(regex("^[a-z0-9]{3,24}$", var.storage_account_name))
    error_message = "Use 3-24 lowercase letters or digits."
  }
}

variable "container_name" {
  type        = string
  default     = "tfstate"
  description = "Private Blob container used by the app stack."
}

variable "allowed_ip_cidrs" {
  type        = list(string)
  description = "Public CIDRs allowed to reach the state storage data plane."
  validation {
    condition     = length(var.allowed_ip_cidrs) > 0 && alltrue([for cidr in var.allowed_ip_cidrs : can(cidrhost(cidr, 0))])
    error_message = "Provide at least one valid CIDR, normally the operator public IP as /32."
  }
}

variable "tags" {
  type        = map(string)
  default     = { project = "hanoitrip", managed_by = "terraform" }
  description = "Common tags."
}
