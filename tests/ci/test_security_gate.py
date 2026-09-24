"""Policy tests use synthetic reports, never live secrets or vulnerable packages."""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import os
import sys

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/ci/security_gate.py"
spec = importlib.util.spec_from_file_location("security_gate", SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class SecurityGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write("gitleaks.json", [])
        for name in ("trivy-source.json", "trivy-misconfig.json"):
            self.write(name, {"SchemaVersion": 2, "ArtifactName": "/src", "Results": []})
        self.write("sbom.cdx.json", {"bomFormat": "CycloneDX", "specVersion": "1.6"})
        self.write("semgrep.json", {"results": [], "errors": []})
        self.write("semgrep.sarif", {"version": "2.1.0", "runs": [{"results": []}]})

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value), encoding="utf-8")

    def vulnerability(self, level):
        self.write("trivy-source.json", {
            "SchemaVersion": 2, "ArtifactName": "/src", "Results": [{
                "Target": "package-lock.json", "Vulnerabilities": [{
                    "VulnerabilityID": "CVE-SYNTHETIC", "PkgName": "demo",
                    "InstalledVersion": "1.0", "Severity": level,
                }],
            }],
        })

    def test_clean_reports_pass(self):
        result = gate.evaluate(self.root, {job: "success" for job in gate.JOBS})
        self.assertEqual(result["exit_code"], 0)
        self.assertFalse(result["errors"])

    def test_medium_low_warn_without_blocking(self):
        for level in ("MEDIUM", "LOW"):
            with self.subTest(level=level):
                self.vulnerability(level)
                result = gate.evaluate(self.root)
                self.assertEqual(result["exit_code"], 0)
                self.assertEqual(result["total"][level], 1)
                self.assertIn("PASS WITH WARNINGS", gate.summary(result))

    def test_high_critical_block(self):
        for level in ("HIGH", "CRITICAL"):
            with self.subTest(level=level):
                self.vulnerability(level)
                self.assertEqual(gate.evaluate(self.root)["exit_code"], 1)

    def test_any_secret_blocks_without_printing_secret(self):
        self.write("gitleaks.json", [{"Fingerprint": "synthetic:rule:1", "Secret": "DO_NOT_PRINT"}])
        result = gate.evaluate(self.root)
        self.assertEqual(result["exit_code"], 1)
        self.assertNotIn("DO_NOT_PRINT", gate.summary(result))

    def test_misconfiguration_blocks(self):
        self.write("trivy-misconfig.json", {
            "SchemaVersion": 2, "ArtifactName": "/src", "Results": [{
                "Target": "Dockerfile", "Misconfigurations": [{"ID": "TEST", "Severity": "HIGH"}],
            }],
        })
        self.assertEqual(gate.evaluate(self.root)["exit_code"], 1)

    def test_semgrep_severity_mapping(self):
        for original, mapped, code in (("ERROR", "HIGH", 1), ("WARNING", "MEDIUM", 0), ("INFO", "LOW", 0)):
            with self.subTest(level=original):
                self.write("semgrep.json", {"results": [{
                    "check_id": "demo", "path": "app.ts", "start": {"line": 1},
                    "extra": {"severity": original},
                }], "errors": []})
                result = gate.evaluate(self.root)
                self.assertEqual(result["total"][mapped], 1)
                self.assertEqual(result["exit_code"], code)

    def test_semgrep_scan_errors_block(self):
        self.write("semgrep.json", {"results": [], "errors": [{"type": "ParseError"}]})
        self.assertEqual(gate.evaluate(self.root)["exit_code"], 2)

    def test_failed_skipped_or_cancelled_job_blocks_even_with_clean_reports(self):
        for state in ("failure", "skipped", "cancelled"):
            with self.subTest(state=state):
                jobs = {job: "success" for job in gate.JOBS}
                jobs["gitleaks-scan"] = state
                self.assertEqual(gate.evaluate(self.root, jobs)["exit_code"], 2)

    def test_missing_report_or_export_blocks(self):
        for name in ("gitleaks.json", "trivy-source.json", "trivy-misconfig.json", "semgrep.json", "semgrep.sarif", "sbom.cdx.json"):
            with self.subTest(name=name):
                original = (self.root / name).read_bytes()
                (self.root / name).unlink()
                self.assertEqual(gate.evaluate(self.root)["exit_code"], 2)
                (self.root / name).write_bytes(original)

    def test_invalid_report_schema_blocks(self):
        for value in (None, {}, {"SchemaVersion": 2, "ArtifactName": "/src", "Results": "invalid"}):
            with self.subTest(value=value):
                self.write("trivy-source.json", value)
                self.assertEqual(gate.evaluate(self.root)["exit_code"], 2)

    def test_unknown_severity_is_not_silently_ignored(self):
        self.vulnerability("UNKNOWN")
        self.assertEqual(gate.evaluate(self.root)["exit_code"], 2)

    def test_exports_and_unrelated_json_do_not_double_count_findings(self):
        self.vulnerability("MEDIUM")
        self.write("sbom.cdx.json", {
            "bomFormat": "CycloneDX", "specVersion": "1.6",
            "vulnerabilities": [{"ratings": [{"severity": "medium"}]}],
        })
        self.write("package.json", {"severity": "CRITICAL"})
        result = gate.evaluate(self.root)
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["total"]["MEDIUM"], 1)
        self.assertEqual(result["total"]["CRITICAL"], 0)

    def test_cli_exit_and_github_warning_summary(self):
        self.vulnerability("LOW")
        summary_path = self.root / "github-summary.md"
        env = {**os.environ, "GITHUB_ACTIONS": "true", "GITHUB_STEP_SUMMARY": str(summary_path),
               "SCAN_JOB_RESULTS": json.dumps({job: "success" for job in gate.JOBS})}
        result = subprocess.run([sys.executable, str(SCRIPT), "--reports", str(self.root)],
                                env=env, text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("::warning::", result.stdout)
        self.assertIn("PASS WITH WARNINGS", summary_path.read_text())
        self.assertTrue((self.root / "summary.md").is_file())

    def test_cli_fails_if_job_results_missing_in_github(self):
        env = {**os.environ, "GITHUB_ACTIONS": "true"}
        env.pop("SCAN_JOB_RESULTS", None)
        env.pop("GITHUB_STEP_SUMMARY", None)
        result = subprocess.run([sys.executable, str(SCRIPT), "--reports", str(self.root)],
                                env=env, text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 2, result.stderr)


if __name__ == "__main__":
    unittest.main()
