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

    def test_staging_updates_the_existing_sitecontainer_without_mode_conversion(self):
        self.assertIn("--query linuxFxVersion", self.workflow)
        self.assertIn('if [ "$container_mode" != "sitecontainers" ]', self.workflow)
        self.assertIn("az webapp sitecontainers show", self.workflow)
        self.assertIn("az webapp sitecontainers update", self.workflow)
        self.assertIn("--container-name main --image \"$IMAGE\"", self.workflow)
        self.assertNotIn("az webapp config container set", self.workflow)

    def test_migration_uses_reviewed_configuration_not_template_credentials(self):
        self.assertIn("AZURE_MYSQL_DATABASE", self.workflow)
        self.assertIn("AZURE_MYSQL_MIGRATION_USER", self.workflow)
        self.assertIn("AZURE_MYSQL_PASSWORD_SECRET", self.workflow)
        self.assertIn('--name "$MYSQL_PASSWORD_SECRET"', self.workflow)
        self.assertIn('MYSQL_USER="$MYSQL_MIGRATION_USER"', self.workflow)
        self.assertNotIn("MYSQL_USER: hanoiadmin", self.workflow)
        self.assertNotIn("--name mysql-admin-password", self.workflow)


if __name__ == "__main__":
    unittest.main()
