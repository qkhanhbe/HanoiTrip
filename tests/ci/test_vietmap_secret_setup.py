import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/release/configure-vietmap-key.sh"


class VietmapSecretSetupTests(unittest.TestCase):
    def test_secret_uses_file_input_and_never_appears_in_process_output_or_arguments(self):
        fixture_key = "fixture-vietmap-key-not-real-123"
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            env_file = temp / ".env"
            env_file.write_text(
                "ROAD_PROVIDER=disabled\nVIETMAP_API_KEY=\nBUILD_SHA=local-dev\n",
                encoding="utf-8",
            )
            calls = temp / "az-calls"
            fake_az = temp / "az"
            fake_az.write_text(
                '#!/bin/sh\nprintf "%s\\n" "$*" >> "$AZ_CALLS"\n',
                encoding="utf-8",
            )
            fake_az.chmod(0o700)
            environment = {
                **os.environ,
                "PATH": f"{temp}:{os.environ['PATH']}",
                "AZ_CALLS": str(calls),
                "HANOITRIP_ENV_FILE": str(env_file),
            }
            result = subprocess.run(
                ["bash", str(SCRIPT), "kv-hanoitrip-test"],
                input=f"{fixture_key}\n",
                text=True,
                capture_output=True,
                cwd=ROOT,
                env=environment,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn(fixture_key, result.stdout + result.stderr)
            self.assertIn(f"VIETMAP_API_KEY={fixture_key}\n", env_file.read_text(encoding="utf-8"))
            self.assertIn("ROAD_PROVIDER=disabled\n", env_file.read_text(encoding="utf-8"))
            self.assertEqual(stat.S_IMODE(env_file.stat().st_mode), 0o600)
            az_arguments = calls.read_text(encoding="utf-8")
            self.assertIn("keyvault secret set", az_arguments)
            self.assertIn("--file", az_arguments)
            self.assertNotIn("--value", az_arguments)
            self.assertNotIn(fixture_key, az_arguments)


if __name__ == "__main__":
    unittest.main()
