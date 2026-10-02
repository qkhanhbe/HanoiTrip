terraform {
  required_version = ">= 1.9.0, < 2.0.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }
}

provider "azurerm" {
  features {}

  # State storage disables Shared Key, so Blob and Queue operations must use
  # Microsoft Entra ID. Management-plane resources continue to use ARM.
  storage_use_azuread = true
}

data "azurerm_client_config" "current" {}
