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
        cls.ci_workflow = (ROOT / ".github/workflows/ci.yml").read_text(
            encoding="utf-8"
        )
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

    def test_pr_plan_is_real_read_only_and_detached_from_remote_state(self):
        self.assertIn("secrets.AZURE_PLAN_CLIENT_ID", self.ci_workflow)
        self.assertIn("id-token: write", self.ci_workflow)
        self.assertIn('terraform -chdir="$plan_root/terraform/app" plan', self.ci_workflow)
        self.assertIn('rm "$plan_root/terraform/app/backend.tf"', self.ci_workflow)
        self.assertIn("-backend=false", self.ci_workflow)
        self.assertIn("-refresh=false", self.ci_workflow)
        self.assertIn("terraform-plan.txt", self.ci_workflow)
        self.assertNotIn("TFSTATE_STORAGE_ACCOUNT", self.ci_workflow)
        self.assertNotIn("terraform -chdir=terraform/app apply", self.ci_workflow)

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

    def test_staging_tolerates_restarts_but_production_observer_is_strict(self):
        poller = (ROOT / "scripts/release/poll-version.mjs").read_text(
            encoding="utf-8"
        )
        self.assertIn("stableExpected >= 3", poller)
        self.assertIn("transient failed response(s)", poller)
        self.assertIn("strict && failedObservation", poller)
        self.assertNotIn('staging-version.jsonl" --strict', self.workflow)
        self.assertIn('production-swap.jsonl" --strict', self.workflow)
        self.assertIn('rollback.jsonl" --strict', self.workflow)

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
        self.assertIn("az webapp identity show", self.workflow)
        self.assertIn("--user-assigned-identity \"$acr_pull_client_id\"", self.workflow)
        self.assertNotIn("az webapp config container set", self.workflow)

    def test_terraform_models_sitecontainers_and_shared_user_identity(self):
        app = (ROOT / "terraform/app/main.tf").read_text(encoding="utf-8")
        versions = (ROOT / "terraform/app/versions.tf").read_text(encoding="utf-8")
        self.assertIn('source  = "Azure/azapi"', versions)
        self.assertIn('resource "azurerm_user_assigned_identity" "app"', app)
        self.assertIn('type         = "UserAssigned"', app)
        self.assertIn('rbac_authorization_enabled    = true', app)
        self.assertIn(
            'type      = "Microsoft.Web/sites/sitecontainers@2024-04-01"', app
        )
        self.assertIn(
            'type      = "Microsoft.Web/sites/slots/sitecontainers@2024-04-01"',
            app,
        )
        self.assertNotIn("azurerm_key_vault_access_policy", app)

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

    def test_state_storage_uses_entra_data_plane_and_keeps_queue_logging(self):
        bootstrap = (ROOT / "terraform/bootstrap/main.tf").read_text(encoding="utf-8")
        terraform_readme = (ROOT / "terraform/README.md").read_text(encoding="utf-8")
        versions = (ROOT / "terraform/bootstrap/versions.tf").read_text(
            encoding="utf-8"
        )
        variables = (ROOT / "terraform/bootstrap/variables.tf").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            'resource "azurerm_storage_account_queue_properties" "state"',
            bootstrap,
        )
        self.assertIn("retention_policy_days = 7", bootstrap)
        self.assertIn('trimsuffix(cidr, "/32")', bootstrap)
        self.assertIn('default     = "eastasia"', variables)
        self.assertIn("storage_use_azuread = true", versions)
        self.assertIn(
            'role_definition_name = "Storage Blob Data Contributor"', bootstrap
        )
        self.assertIn(
            'role_definition_name = "Storage Queue Data Contributor"', bootstrap
        )
        self.assertIn("infrastructure_encryption_enabled = true", bootstrap)
        for finding_id in ("AVD-AZU-0057", "AVD-AZU-0058", "AVD-AZU-0060"):
            self.assertIn(
                f"#trivy:ignore:{finding_id}:exp:2027-03-31",
                bootstrap,
            )
        self.assertIn("standalone queue logging", terraform_readme)
        self.assertIn("accepts LRS", terraform_readme)
        self.assertIn("Microsoft-managed keys", terraform_readme)
        self.assertIn("31/03/2027", terraform_readme)
        self.assertIn('variable "state_principal_object_ids"', variables)

    def test_migration_uses_reviewed_configuration_not_template_credentials(self):
        self.assertIn("AZURE_MYSQL_DATABASE", self.workflow)
        self.assertIn("AZURE_MYSQL_MIGRATION_USER", self.workflow)
        self.assertIn("AZURE_MYSQL_PASSWORD_SECRET", self.workflow)
        self.assertIn('--name "$MYSQL_PASSWORD_SECRET"', self.workflow)
        self.assertIn('MYSQL_USER="$MYSQL_MIGRATION_USER"', self.workflow)
        self.assertNotIn("MYSQL_USER: hanoiadmin", self.workflow)
        self.assertNotIn("--name mysql-admin-password", self.workflow)

    def test_mysql_firewall_uses_plan_time_inputs_and_automated_reconciliation(self):
        app = (ROOT / "terraform/app/main.tf").read_text(encoding="utf-8")
        variables = (ROOT / "terraform/app/variables.tf").read_text(
            encoding="utf-8"
        )
        outputs = (ROOT / "terraform/app/outputs.tf").read_text(encoding="utf-8")
        reconcile = (ROOT / "scripts/terraform/apply-app.sh").read_text(
            encoding="utf-8"
        )

        self.assertIn("for_each = var.mysql_app_outbound_ips", app)
        self.assertNotIn(
            "for_each = toset(concat(\n    azurerm_linux_web_app.app.outbound_ip_address_list",
            app,
        )
        self.assertIn('variable "mysql_app_outbound_ips"', variables)
        self.assertIn('output "app_outbound_ip_addresses"', outputs)
        self.assertIn("mysql-firewall.auto.tfvars.json", reconcile)
        self.assertIn('select(type == "string" and length > 0)', reconcile)
        self.assertIn("state show azurerm_linux_web_app.app", reconcile)
        self.assertIn("MySQL health is ready and build SHA", reconcile)
        self.assertIn("config/configreferences/appsettings/refresh", reconcile)
        self.assertIn('all(. == "Resolved")', reconcile)
        self.assertIn('deadline=$(( $(date +%s) + 600 ))', reconcile)
        self.assertEqual(reconcile.count('terraform -chdir="$terraform_dir" apply'), 2)

    def test_key_vault_references_use_vnet_instead_of_public_egress_ips(self):
        app = (ROOT / "terraform/app/main.tf").read_text(encoding="utf-8")

        self.assertIn('resource "azurerm_virtual_network" "app"', app)
        self.assertIn('resource "azurerm_subnet" "app"', app)
        self.assertIn('service_endpoints    = ["Microsoft.KeyVault"]', app)
        self.assertEqual(
            len(
                re.findall(
                    r"virtual_network_subnet_id\s*=\s*azurerm_subnet\.app\.id",
                    app,
                )
            ),
            2,
        )
        self.assertEqual(app.count("vnet_route_all_enabled                        = true"), 2)
        self.assertIn("virtual_network_subnet_ids", app)
        self.assertNotIn("possible_outbound_ip_address_list", app)
        self.assertIn('resource "time_sleep" "key_vault_reference_rbac"', app)

    def test_each_web_app_health_check_has_an_eviction_window(self):
        app = (ROOT / "terraform/app/main.tf").read_text(encoding="utf-8")

        self.assertEqual(app.count('health_check_path                             = "/health"'), 2)
        self.assertEqual(
            app.count("health_check_eviction_time_in_min             = 2"), 2
        )

    def test_greenfield_apply_builds_a_runnable_uami_image(self):
        app = (ROOT / "terraform/app/main.tf").read_text(encoding="utf-8")
        config = (ROOT / "app/server/config.ts").read_text(encoding="utf-8")
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

        self.assertIn('resource "terraform_data" "bootstrap_image"', app)
        self.assertIn('az acr login --name "$ACR_NAME"', app)
        self.assertIn('docker push "$image"', app)
        self.assertEqual(app.count('authType                    = "UserAssigned"'), 2)
        self.assertEqual(app.count("userManagedIdentityClientId"), 2)
        self.assertIn('DB_MIGRATE_ON_START = "true"', app)
        self.assertIn("DB_MIGRATE_ON_START", config)
        self.assertIn("Acquire::ForceIPv4=true", dockerfile)
        self.assertNotIn("appsvc/staticsite", app)


if __name__ == "__main__":
    unittest.main()
