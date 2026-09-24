#!/usr/bin/env bash
# Shared by GitHub Actions and local checks. Requires Docker and a Git checkout.
set -euo pipefail

scan_job=${1:?Usage: scan-source.sh JOB REPORT_DIRECTORY}
report_dir=${2:?Provide a report directory outside the source checkout}
source_dir=$(git rev-parse --show-toplevel)
mkdir -p "$report_dir"
report_dir=$(cd "$report_dir" && pwd)
case "$report_dir/" in
  "$source_dir/"*) printf 'Report directory must be outside the checkout.\n' >&2; exit 2 ;;
esac

# Linux/amd64 manifests, checked against upstream registries. No latest tags.
gitleaks_image='ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:b109bc5f8f76a38196a3e413704fc5b9e3c32360bce4e4b603bd6f45b3721dbb'
trivy_image='aquasec/trivy:0.74.0@sha256:ee940acbf1f58ebadb42d01434ce4609530bf1b52536afbd1eee66cd7123c5c9'
semgrep_image='semgrep/semgrep:1.178.0@sha256:fbba1f23d2ef94630c828e8692758f8bc6353a8089841a396a5c041451966ffb'
container_args=(--rm --platform linux/amd64 --user "$(id -u):$(id -g)"
  --volume "$source_dir:/src:ro" --volume "$report_dir:/reports" --workdir /src)
trivy_args=(--cache-dir /tmp/trivy-cache --timeout 10m --skip-version-check
  --skip-dirs /src/.git --skip-dirs /src/node_modules --skip-dirs /src/.venv
  --exit-code 0 --format json)

case "$scan_job" in
  gitleaks-scan)
    if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
      printf 'Gitleaks requires full history (checkout fetch-depth: 0).\n' >&2
      exit 2
    fi
    docker run "${container_args[@]}" "$gitleaks_image" git /src \
      --log-opts=--all --redact=100 --exit-code 0 \
      --report-format json --report-path /reports/gitleaks.json
    ;;
  trivy-source-sbom)
    docker run "${container_args[@]}" "$trivy_image" fs "${trivy_args[@]}" \
      --scanners vuln --list-all-pkgs --output /reports/trivy-source.json /src
    docker run "${container_args[@]}" "$trivy_image" convert \
      --format cyclonedx --output /reports/sbom.cdx.json /reports/trivy-source.json
    ;;
  trivy-misconfig)
    docker run "${container_args[@]}" "$trivy_image" fs "${trivy_args[@]}" \
      --scanners misconfig --output /reports/trivy-misconfig.json /src
    ;;
  semgrep-sast)
    docker run "${container_args[@]}" --env HOME=/tmp "$semgrep_image" semgrep scan \
      --config p/owasp-top-ten --config p/javascript --config p/typescript --config p/react \
      --metrics off --disable-version-check --strict --quiet \
      --json-output /reports/semgrep.json --sarif-output /reports/semgrep.sarif /src
    ;;
  *) printf 'Unknown source scan job: %s\n' "$scan_job" >&2; exit 2 ;;
esac

# Finding severity is enforced centrally by security_gate.py. Nonzero scanner
# exit codes still fail this job; they must never be hidden with "|| true".
