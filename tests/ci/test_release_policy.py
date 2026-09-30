from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class ReleasePolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (ROOT / ".github/workflows/cd.yml").read_text(encoding="utf-8")

    def test_only_main_can_enter_deploy_job(self):
        self.assertIn("branches: [main]", self.workflow)
        self.assertIn("github.ref == 'refs/heads/main'", self.workflow)
        self.assertIn("vars.AZURE_CD_ENABLED == 'true'", self.workflow)
        self.assertIn("vars.AZURE_CD_CONFIG_REVIEWED == 'true'", self.workflow)

    def test_production_swap_has_an_independent_opt_in(self):
        marker = "- name: Swap while observing production"
        start = self.workflow.index(marker)
        swap_section = self.workflow[start : start + 300]
        self.assertIn("vars.AZURE_PRODUCTION_SWAP_ENABLED == 'true'", swap_section)
        self.assertIn("Production verification failed; reversing the swap.", self.workflow)

    def test_staging_uses_azure_reported_hosts_and_optional_live_road_gate(self):
        self.assertGreaterEqual(self.workflow.count("--query defaultHostName"), 2)
        self.assertNotIn("$WEBAPP_NAME-$SLOT_NAME.azurewebsites.net", self.workflow)
        self.assertIn("AZURE_RELEASE_REQUIRE_ROAD_PROVIDER", self.workflow)
        self.assertIn("SMOKE_ROAD=1", self.workflow)


if __name__ == "__main__":
    unittest.main()
