#!/usr/bin/env python3
"""Aggregate explicit scanner reports, never arbitrary JSON from the repository.

Exit 0: clean or nonblocking warnings; 1: blocking findings; 2: incomplete scan.
The CycloneDX/SARIF exports are validated but not counted a second time.
"""

import argparse
import json
import os
from pathlib import Path
from collections import Counter


JOBS = ("gitleaks-scan", "trivy-source-sbom", "trivy-misconfig", "semgrep-sast")
SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW")


class InvalidReport(ValueError):
    pass


def read_report(root, name, expected_type):
    try:
        value = json.loads((root / name).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise InvalidReport(f"{name}: missing or invalid JSON") from exc
    if not isinstance(value, expected_type):
        raise InvalidReport(f"{name}: unexpected report schema")
    return value


def require(condition, message):
    if not condition:
        raise InvalidReport(message)


def severity(value):
    require(isinstance(value, str), "Finding has no severity; manual review required")
    mapped = {"ERROR": "HIGH", "WARNING": "MEDIUM", "INFO": "LOW"}.get(
        value.upper(), value.upper()
    )
    require(mapped in SEVERITIES, "Finding has unknown severity; manual review required")
    return mapped


def count_gitleaks(root):
    findings = read_report(root, "gitleaks.json", list)
    fingerprints = set()
    for finding in findings:
        require(isinstance(finding, dict), "gitleaks.json: invalid finding")
        fingerprint = finding.get("Fingerprint")
        require(isinstance(fingerprint, str) and bool(fingerprint),
                "gitleaks.json: missing finding fingerprint")
        fingerprints.add(fingerprint)
    return Counter(SECRET=len(fingerprints))


def count_trivy(root, filename, field):
    report = read_report(root, filename, dict)
    require(report.get("SchemaVersion") == 2 and isinstance(report.get("ArtifactName"), str),
            f"{filename}: unexpected Trivy schema")
    results = report.get("Results") or []
    require(isinstance(results, list), f"{filename}: invalid Results")
    counts = Counter()
    seen = set()
    for result in results:
        require(isinstance(result, dict) and isinstance(result.get("Target"), str),
                f"{filename}: invalid target")
        findings = result.get(field) or []
        require(isinstance(findings, list), f"{filename}: invalid findings list")
        for finding in findings:
            require(isinstance(finding, dict), f"{filename}: invalid finding")
            level = severity(finding.get("Severity"))
            if field == "Vulnerabilities":
                require(bool(finding.get("VulnerabilityID")) and bool(finding.get("PkgName")),
                        f"{filename}: missing vulnerability identity")
                identity = (result["Target"], finding["VulnerabilityID"],
                            finding["PkgName"], finding.get("InstalledVersion"), level)
            else:
                require(bool(finding.get("ID")), f"{filename}: missing check ID")
                location = finding.get("CauseMetadata") or {}
                require(isinstance(location, dict), f"{filename}: invalid location")
                identity = (result["Target"], finding["ID"], location.get("StartLine"), level)
            if identity not in seen:
                seen.add(identity)
                counts[level] += 1
    return counts


def count_semgrep(root):
    report = read_report(root, "semgrep.json", dict)
    require(isinstance(report.get("results"), list) and isinstance(report.get("errors"), list),
            "semgrep.json: unexpected Semgrep schema")
    require(not report["errors"], "semgrep.json: scan errors; results may be incomplete")
    counts = Counter()
    seen = set()
    for finding in report["results"]:
        require(isinstance(finding, dict) and isinstance(finding.get("extra"), dict),
                "semgrep.json: invalid finding")
        require(isinstance(finding.get("check_id"), str)
                and isinstance(finding.get("path"), str)
                and isinstance(finding.get("start"), dict),
                "semgrep.json: missing finding identity")
        line = finding["start"].get("line")
        require(isinstance(line, int), "semgrep.json: invalid finding line")
        level = severity(finding["extra"].get("severity"))
        identity = (finding["check_id"], finding["path"], line,
                    finding["start"].get("col"), level)
        if identity not in seen:
            seen.add(identity)
            counts[level] += 1
    return counts


def validate_exports(root):
    sbom = read_report(root, "sbom.cdx.json", dict)
    require(sbom.get("bomFormat") == "CycloneDX" and bool(sbom.get("specVersion")),
            "sbom.cdx.json: invalid CycloneDX SBOM")
    sarif = read_report(root, "semgrep.sarif", dict)
    require(sarif.get("version") == "2.1.0" and isinstance(sarif.get("runs"), list)
            and bool(sarif["runs"]), "semgrep.sarif: invalid SARIF export")


def evaluate(root, job_results=None):
    errors = []
    if job_results is not None:
        if not isinstance(job_results, dict) or set(job_results) != set(JOBS):
            errors.append("Missing or invalid scanner job results")
        else:
            for job in JOBS:
                if job_results[job] != "success":
                    errors.append(f"{job}: did not complete successfully")
    counts = {}
    loaders = (
        ("gitleaks-scan", lambda: count_gitleaks(root)),
        ("trivy-source-sbom", lambda: count_trivy(root, "trivy-source.json", "Vulnerabilities")),
        ("trivy-misconfig", lambda: count_trivy(root, "trivy-misconfig.json", "Misconfigurations")),
        ("semgrep-sast", lambda: count_semgrep(root)),
    )
    for job, loader in loaders:
        try:
            counts[job] = loader()
        except (InvalidReport, TypeError) as exc:
            # Do not echo report contents: they can contain secrets or source code.
            errors.append(str(exc) if isinstance(exc, InvalidReport) else f"{job}: invalid finding schema")
            counts[job] = Counter()
    try:
        validate_exports(root)
    except InvalidReport as exc:
        errors.append(str(exc))
    total = sum(counts.values(), Counter())
    code = 2 if errors else (1 if total["SECRET"] + total["CRITICAL"] + total["HIGH"] else 0)
    return {"counts": counts, "total": total, "errors": errors, "exit_code": code}


def summary(result):
    has_warning = result["total"]["MEDIUM"] + result["total"]["LOW"] > 0
    status = "BLOCK" if result["exit_code"] else ("PASS WITH WARNINGS" if has_warning else "PASS")
    rows = [f"# Source scan: {status}", "",
            "| Scanner | Secrets | Critical | High | Medium | Low |",
            "|---|---:|---:|---:|---:|---:|"]
    for job, counts in result["counts"].items():
        rows.append(f"| {job} | " + " | ".join(str(counts[key]) for key in ("SECRET", *SEVERITIES)) + " |")
    if result["errors"]:
        rows.extend(["", "Scan incomplete; zero counts in a failed row are not proof of a clean scan."])
        rows.extend(f"- {error}" for error in result["errors"])
    rows.extend(["", "Secrets and HIGH/CRITICAL block. MEDIUM/LOW are nonblocking warnings.",
                 "SCA policy is provisional: HIGH/CRITICAL, pending the internal TI blacklist.",
                 "Counts use canonical JSON only; SBOM/SARIF exports are not counted again.",
                 "Zero findings from a scanner do not prove the application is secure; review coverage and policy gaps."])
    return "\n".join(rows) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports", required=True, type=Path)
    args = parser.parse_args()
    raw_jobs = os.environ.get("SCAN_JOB_RESULTS")
    jobs = None
    if raw_jobs is not None:
        try:
            jobs = json.loads(raw_jobs)
            if jobs is None:
                jobs = {}
        except ValueError:
            jobs = {}
    elif os.environ.get("GITHUB_ACTIONS") == "true":
        jobs = {}
    result = evaluate(args.reports, jobs)
    report = summary(result)
    args.reports.mkdir(parents=True, exist_ok=True)
    (args.reports / "summary.md").write_text(report, encoding="utf-8")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
            output.write(report)
    print(report)
    if result["exit_code"]:
        print("::error::Source security gate blocked: findings or incomplete scan. See summary.")
    elif result["total"]["MEDIUM"] + result["total"]["LOW"]:
        print("::warning::MEDIUM/LOW findings require follow-up; this gate allows merging.")
    return result["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
