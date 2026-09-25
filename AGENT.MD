# HanoiTrip — requirements, harness, validation

This is the canonical agent contract. Read it with `MASTERPLAN_HANOI_TRIP_PLANNER.md` before changes. `AGENTS.md` only points here. The supplied `README (1).md` and `gitlab-ci.yml` are reference requirements, not executable GitHub pipelines.

## Current authorization — complete the repository workflow

The user's latest instruction (25 September 2026) authorizes completing the remaining mandatory parts at a practical first-pass level, applying the topics already learned, and publishing through GitHub feature branch → PR → CI → squash merge to `main`. Active workflows and Terraform may therefore be added. The empty repository bootstrap commit is the documented direct-main exception.

Azure deployment still requires real Azure credentials/resources and must never be represented as complete without evidence. CD may be committed in a disabled-by-default state and enabled only after OIDC, Terraform outputs, repository variables and the protected environment are configured. Keep mandatory WARP enabled and do not modify corporate network/security policy.

## Scope and boundaries

- Build a Vietnamese, responsive Hanoi public-transit planner inspired by Opal's clarity, not a brand/UI copy. React + TypeScript frontend, Node + TypeScript backend, MySQL, ONE Docker image.
- Google Routes is the live routing engine; Google Maps JS renders its routes. Never claim demo schedules are real, silently fall back from failed Google to demo, or scrape private transport APIs. No LLM routing, custom ranking, accounts or unrelated product features.
- Store only favorite endpoints/labels in MySQL, not Google's route response. Favorites are shared sandbox data until authentication is explicitly added. Do not use real customer data.
- Required endpoints: GET `/health`, `/version`, `/load?seconds=n`, `/items`, `/boom`; POST `/items`, `/routes`. `/boom` must throw and return a correlated 500; diagnostics are disabled by default, bounded and rate-limited when enabled.
- `/health` is readiness: DB outage => 503. `/version` exposes immutable `buildSha`, no secrets. JSON request logs include requestId, buildSha, statusCode and durationMs. Never log request bodies, Google keys, passwords or raw provider errors.
- Production DB requires verified TLS. Parameterized SQL, input/body limits, timeouts, graceful shutdown. Browser Maps key is public but HTTP-referrer/API restricted; server Routes key never crosses to the client.
- Azure target: ACR admin disabled, App Service MI + AcrPull, Key Vault references, MySQL outbound-IP firewall, default-deny inbound allowlist, production/staging slots. Live Google and Azure need separately supplied credentials; do not invent evidence.
- Release: immutable SHA image; staging readiness + expected SHA; start 1-second production observer BEFORE swap; preserve raw status/SHA evidence; verify B, reverse swap and verify A on failure; ALWAYS remove temporary runner IP rules. Schema migrations must remain compatible with both versions.
- Terraform remote state/locking + destroy/apply evidence and Azure Monitor/Log Analytics remain required. Do not enable App Insights until the contradictory instruction is resolved. Local app completion is NOT completion of the Azure internship.
- AI-OFF portions of the instructor's schedule remain AI-OFF. AI-assisted implementation must be disclosed in the PR. This implementation was explicitly requested with AI; do not present it as unaided work.

## Repository workflow

- `main` is trunk. Short-lived branches, PR review, squash merge. The initial empty-repository bootstrap is the sole documented direct-main exception.
- Source scan is PR-only: Gitleaks FULL history; Trivy dependencies + CycloneDX; Trivy misconfig; Semgrep JSON/SARIF. Secrets and HIGH/CRITICAL block; MEDIUM/LOW pass with warning. Missing/broken reports, scanner failure/skip/cancel and unknown severity MUST fail closed.
- `source-security-gate` is required when branch protection is configured. No blanket `continue-on-error`. No upload to DefectDojo/Dependency-Track. Keep redacted artifacts 7 days.
- SCA HIGH/CRITICAL is a provisional translation: the supplied internal template mentions TI blacklist, which is unavailable. Public Semgrep rules are not identical to internal rules. Keep this gap visible.
- PR CI has no Azure deploy permission. Future CD alone owns `push: main`. No secrets in PR workflows; use scoped OIDC for future Azure jobs. Pin actions and container scanners.
- Preserve user edits. Never commit `.env`, state, credentials, dependency folders, raw personal data or unreviewed diagnostic artifacts. Do not lower scanner severity or add ignores merely to turn CI green.

## Harness (target commands; README records verified status)

Prerequisites: Node 22.12+ (Node 22 LTS recommended), npm, Python 3; Docker with Compose for persistence/container checks.

```bash
npm ci
npm run check          # formatting, lint, typecheck, unit/API/component tests, build
python3 -m unittest discover -s tests/ci -v
npm run dev           # explicit demo routing; local env chooses DB mode
docker compose up --build -d
npm run smoke         # built app endpoints; BASE_URL defaults localhost:8080
npm run test:mysql    # integration against configured MySQL
```

Use `.env.example` as a documented template, never a source of real credentials. `DB_MODE=memory` is only for tests/demo; MySQL is mandatory for persistence evidence. `ROUTES_MODE=demo` must be visible in the UI and response. With `ROUTES_MODE=google`, failures remain real errors, and key validation fails fast.

For scans: create a fresh report directory OUTSIDE the checkout with `mktemp -d`; invoke each `scripts/ci/scan-source.sh` job; run `scripts/ci/security_gate.py --reports PATH` only after confirming every scanner succeeded. Full commands are in README.

## Validation matrix

| Layer         | Required checks                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts     | Invalid coordinates/time/body -> 400; empty items -> 200; create -> 201; unknown API -> 404; provider timeout/unavailable -> 504/502; no false demo fallback |
| Product       | Place selection, swap A/B, departure selection, alternate cards/map, leg details, save/reopen favorite; loading, empty, error and retry states               |
| Data          | Parameterized MySQL create/list; persistence after app restart; read/write failure -> 503; verified TLS in production; migration separate from web startup   |
| Diagnostics   | Health 200/503; version SHA; deliberate 500 with request ID; safe load bounds and concurrency; structured logs without secrets                               |
| UI            | Keyboard and visible focus, labels, accessible feedback; desktop and mobile screenshots; no horizontal overflow; no console errors; route details readable   |
| Container     | Multi-stage image; non-root runtime; port 8080; readiness healthcheck; same image serves SPA+API; no secrets copied/baked                                    |
| CI            | Gate policy tests, all four report formats, real PR checks and protected-branch behavior distinguished from local-only results                               |
| Azure (later) | M1–M11 evidence from masterplan; real Google coverage checks; no fabricated deploy/swap/alert/identity evidence                                              |

## Handoff

Update README, masterplan status, known issues and evidence after implementation. Record exact commands/results, distinguish verified local checks from pending GitHub/cloud work. For failures introduced by AI, keep an honest `ai-failure-log.md`. Do not declare the complete internship done on the strength of a local build.
