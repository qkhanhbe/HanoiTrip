import os
from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]


class ReleasePolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (ROOT / ".github/workflows/cd.yml").read_text(encoding="utf-8")
        cls.workflows = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted((ROOT / ".github/workflows").glob("*.yml"))
        )

    def test_actions_are_immutable_and_node24_capable(self):
        uses = re.findall(r"uses:\s+([^\s#]+)", self.workflows)
        remote_actions = [action for action in uses if not action.startswith("./")]
        for action in remote_actions:
            with self.subTest(action=action):
                self.assertRegex(action, r"^[^@]+@[0-9a-f]{40}$")

        expected_node24_actions = (
            "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
            "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
            "actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f",
            "actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131",
            "Azure/login@a641126d1b8aa4d1fa005f4f92df94a3a4c4c906",
            "hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e",
        )
        for action in expected_node24_actions:
            self.assertIn(action, self.workflows)

        deprecated_node20_actions = (
            "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
            "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
            "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
            "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
            "Azure/login@7184910d9eb2b1c5e48f7073824a90609bb9b6d6",
            "hashicorp/setup-terraform@b9cd54a3c349d3f38e8881555d616ced269862dd",
        )
        for action in deprecated_node20_actions:
            self.assertNotIn(action, self.workflows)

    def test_only_main_can_enter_deploy_job(self):
        self.assertIn("branches: [main]", self.workflow)
        self.assertIn("github.ref == 'refs/heads/main'", self.workflow)
        self.assertIn("vars.AZURE_CD_ENABLED == 'true'", self.workflow)
        self.assertIn("vars.AZURE_CD_CONFIG_REVIEWED == 'true'", self.workflow)

    def test_oidc_probe_is_main_only_and_read_only(self):
        marker = "oidc-probe:"
        start = self.workflow.index(marker)
        end = self.workflow.index("\n  deploy:", start)
        probe = self.workflow[start:end]
        self.assertIn("github.ref == 'refs/heads/main'", probe)
        self.assertIn("AZURE_CD_OIDC_PROBE_ENABLED", probe)
        self.assertIn("environment: azure-sandbox", probe)
        self.assertIn("id-token: write", probe)
        self.assertIn("az webapp show", probe)
        self.assertIn("az acr show", probe)
        self.assertIn("az mysql flexible-server show", probe)
        self.assertIn("az keyvault show", probe)
        for mutation in (" create", " update", " set", " delete", " swap", " restart"):
            self.assertNotIn(mutation, probe)

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

    def test_live_road_release_configures_a_key_vault_reference_fail_closed(self):
        self.assertIn("AZURE_VIETMAP_API_KEY_SECRET", self.workflow)
        self.assertIn('"ROAD_PROVIDER=vietmap"', self.workflow)
        self.assertIn(
            "VIETMAP_API_KEY=@Microsoft.KeyVault(VaultName=$KEY_VAULT_NAME;SecretName=$VIETMAP_API_KEY_SECRET)",
            self.workflow,
        )

        environment = {
            **os.environ,
            "CLIENT_ID": "fixture-client",
            "TENANT_ID": "fixture-tenant",
            "SUBSCRIPTION_ID": "fixture-subscription",
            "RESOURCE_GROUP": "fixture-rg",
            "WEBAPP_NAME": "fixture-app",
            "ACR_NAME": "fixture-acr",
            "KEY_VAULT_NAME": "fixture-kv",
            "MYSQL_SERVER": "fixture-mysql",
            "MYSQL_DATABASE": "fixture-db",
            "MYSQL_MIGRATION_USER": "fixture-user",
            "MYSQL_PASSWORD_SECRET": "fixture-db-secret",
            "REQUIRE_ROAD_PROVIDER": "true",
        }
        command = ["bash", str(ROOT / "scripts/release/require-cd-config.sh")]
        missing = subprocess.run(command, env=environment, capture_output=True, text=True)
        self.assertEqual(missing.returncode, 2)
        self.assertIn("VIETMAP_API_KEY_SECRET", missing.stderr)

        environment["VIETMAP_API_KEY_SECRET"] = "vietmap-api-key"
        configured = subprocess.run(command, env=environment, capture_output=True, text=True)
        self.assertEqual(configured.returncode, 0, configured.stderr)

    def test_oidc_bootstrap_is_environment_scoped_and_keeps_cd_disabled(self):
        script = (ROOT / "scripts/release/configure-github-oidc.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            'expected_subject="repo:${owner_login}@${owner_id}/${repo_name}@${repo_id}:environment:${environment}"',
            script,
        )
        self.assertIn('legacy_subject="repo:${repo}:environment:${environment}"', script)
        self.assertIn('if [ "$actual_subject" = "$legacy_subject" ]', script)
        self.assertIn("az ad app federated-credential delete", script)
        self.assertIn('--federated-credential-id "$credential_name"', script)
        self.assertIn("refusing to widen trust", script)
        self.assertIn("api://AzureADTokenExchange", script)
        self.assertNotIn("az ad app credential reset", script)
        self.assertNotIn("client-secret", script)
        self.assertIn("set_variable AZURE_CD_ENABLED false", script)
        self.assertIn("set_variable AZURE_CD_CONFIG_REVIEWED false", script)
        self.assertIn("set_variable AZURE_CD_OIDC_PROBE_ENABLED true", script)
        self.assertIn("set_variable AZURE_PRODUCTION_SWAP_ENABLED false", script)
        self.assertNotIn('ensure_role Contributor "$resource_group', script)
        self.assertIn('ensure_role Reader "$acr_id"', script)
        self.assertIn('ensure_role AcrPush "$acr_id"', script)
        self.assertNotIn('ensure_role Contributor "$acr_id"', script)

    def test_staging_updates_the_existing_sitecontainer_without_mode_conversion(self):
        self.assertIn("--query linuxFxVersion", self.workflow)
        self.assertIn('if [ "$container_mode" != "sitecontainers" ]', self.workflow)
        self.assertIn("az webapp sitecontainers show", self.workflow)
        self.assertIn("az webapp sitecontainers update", self.workflow)
        self.assertIn("--container-name main --image \"$IMAGE\"", self.workflow)
        self.assertNotIn("az webapp config container set", self.workflow)

    def test_release_image_scan_uses_the_reviewed_expiring_exception_file(self):
        marker = "- name: Build, scan and push immutable image"
        start = self.workflow.index(marker)
        end = self.workflow.index("- name: Open temporary runner access", start)
        image_gate = self.workflow[start:end]
        self.assertIn(".trivyignore.yaml:/policy/.trivyignore.yaml:ro", image_gate)
        self.assertIn("--ignorefile /policy/.trivyignore.yaml", image_gate)
        self.assertIn("--severity HIGH,CRITICAL --exit-code 1", image_gate)

        exceptions = (ROOT / ".trivyignore.yaml").read_text(encoding="utf-8")
        self.assertIn("CVE-2026-84782", exceptions)
        self.assertIn("expired_at: 2026-10-14", exceptions)
        self.assertIn("HanoiTrip does not expose or initiate DTLS", exceptions)

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
