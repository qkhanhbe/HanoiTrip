from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
MONITORING = ROOT / "terraform" / "monitoring-live"


class MonitoringLiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.terraform = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(MONITORING.glob("*.tf"))
        )

    def test_core_workload_is_read_only(self):
        data_types = set(re.findall(r'data\s+"([^"]+)"', self.terraform))
        self.assertEqual(
            data_types,
            {
                "azurerm_resource_group",
                "azurerm_linux_web_app",
                "azurerm_service_plan",
                "azurerm_mysql_flexible_server",
            },
        )

        managed_types = re.findall(r'resource\s+"([^"]+)"', self.terraform)
        self.assertCountEqual(
            managed_types,
            [
                "azurerm_log_analytics_workspace",
                "azurerm_monitor_diagnostic_setting",
                "azurerm_monitor_diagnostic_setting",
                "azurerm_monitor_action_group",
                "azurerm_monitor_metric_alert",
                "azurerm_monitor_metric_alert",
                "azurerm_monitor_metric_alert",
                "azurerm_monitor_autoscale_setting",
                "azurerm_portal_dashboard",
            ],
        )

    def test_monitoring_contract_is_complete(self):
        for metric in (
            "Requests",
            "AverageResponseTime",
            "Http5xx",
            "CpuPercentage",
            "MemoryPercentage",
            "HttpQueueLength",
            "cpu_percent",
            "active_connections",
            "storage_percent",
        ):
            self.assertIn(f'"{metric}"', self.terraform)

        self.assertIn('minimum = 1', self.terraform)
        self.assertIn('maximum = 2', self.terraform)
        self.assertIn('retention_in_days   = 30', self.terraform)
        self.assertIn('hidden-title = "HanoiTrip operations"', self.terraform)

    def test_monitoring_uses_a_distinct_remote_state_key(self):
        backend = (MONITORING / "backend.hcl.example").read_text(encoding="utf-8")
        self.assertIn('key                  = "hanoitrip-monitoring-live.tfstate"', backend)
        self.assertNotIn('key                  = "hanoitrip.tfstate"', backend)

    def test_ci_validates_monitoring_root(self):
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            "terraform -chdir=terraform/monitoring-live init -backend=false -input=false",
            workflow,
        )
        self.assertIn(
            "terraform -chdir=terraform/monitoring-live validate", workflow
        )


if __name__ == "__main__":
    unittest.main()
