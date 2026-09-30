# CI/CD GitHub Actions

## Flow chính từ 29/09/2026

GitHub là nguồn phát hành chính (`origin`); GitLab công ty (`gitlab`) là nơi
review/scan bổ sung, tuyệt đối không CD Azure cá nhân. npm CI và Docker build
dùng `https://registry.npmjs.org/` theo lockfile, không phụ thuộc jfrog-auth.

1. Review `git status`, remote và diff; không đưa ghi chú/template nội bộ không
   được phép chia sẻ sang GitHub. Không stage chung các thay đổi UI chưa review.
2. Nhánh công việc ngắn hạn từ GitHub main; push nhánh, mở PR vào GitHub main.
   Nhánh chore/github-ci-flow được tạo từ origin/main trong worktree riêng;
   chỉ chuyển nội dung đã chọn, không merge lịch sử GitLab không chung tổ tiên.
3. Nếu cần góp ý, tạo nhánh review từ gitlab/main trong workspace GitLab và chuyển
   patch nội dung app được phép chia sẻ. Giữ CI nội bộ ở đó; không push nhánh
   GitHub hiện tại sang GitLab để mở MR khi hai lịch sử chưa chung tổ tiên.
   Góp ý được áp dụng lại trên PR GitHub và chạy CI lại. Approval/checks là riêng.
4. GitHub CI: source-security-gate; app-check (npm ci/check + policy tests);
   terraform-check; container-check (Docker build không push, MySQL/HTTP smoke,
   Trivy image scan). Terraform plan chỉ có thật sau khi identity/state được cấu hình.
5. Ruleset main: bắt buộc PR/review và các checks trên, chặn direct/force push.
   Chứng minh test/secret giả làm đỏ và chặn merge. Không coi job skip là pass.
6. Squash merge PR GitHub sau review; đó là commit nguồn cho release. Nếu GitLab
   cũng cần merge MR, review diff/tree; hai squash có thể khác SHA. Không ép
   đồng bộ bằng force-push. Nhánh mới luôn bắt đầu từ origin/main.
7. Khi CD đã sẵn sàng: merge main → OIDC Azure → build/scan image SHA → ACR →
   migration additive → staging/health → quan sát production → swap → kiểm chứng
   hoặc rollback. PR không deploy. Không swap chỉ để hoàn tất bài khi bản B chưa chốt.

### Khóa CD hiện tại — chưa bật deploy

Để trống hoặc đặt false cả `AZURE_CD_ENABLED` và `AZURE_CD_CONFIG_REVIEWED`.
Deploy job cần cả hai true và ref main; không phải bằng chứng đã sẵn sàng.
Workflow CD vẫn còn các điểm phải kiểm chứng trước khi bật:

- Workflow lấy `defaultHostName` thực tế cho từng slot; cần xác nhận lại bằng một
  staging run vì Azure gắn suffix riêng cho hostname Portal-created.
- Cloud read-only 30/09 xác nhận production/staging dùng `linuxFxVersion=sitecontainers`
  với main container tên `main`. Workflow kiểm tra mode rồi dùng
  `az webapp sitecontainers update --container-name main --image ...`; nếu mode
  khác thì fail, không tự chuyển kiểu triển khai. Lệnh đã qua policy test nhưng
  chưa được chạy deploy thật.
- Migration không còn hardcode user/secret của Terraform mẫu. Trước khi bật CD,
  phải review và cấu hình `AZURE_MYSQL_DATABASE`, `AZURE_MYSQL_MIGRATION_USER`,
  `AZURE_MYSQL_PASSWORD_SECRET`, TLS CA và quyền DB thực tế; không dùng mật khẩu
  đã lộ trong chat.
- Kiểm kê/import hạ tầng Portal vào Terraform; không apply chồng để tạo tài nguyên.
- Cấu hình OIDC Azure riêng cho GitHub environment azure-sandbox, quyền tối thiểu;
  giới hạn environment chỉ main và approval nếu tài khoản hỗ trợ. Không chuyển
  token/credential GitLab công ty sang GitHub.
- Release yêu cầu VIETMAP phải đặt `AZURE_RELEASE_REQUIRE_ROAD_PROVIDER=true` và
  `AZURE_VIETMAP_API_KEY_SECRET=vietmap-api-key`. CD chỉ gắn Key Vault reference,
  không đọc hoặc truyền API key vào GitHub. `ROAD_PROVIDER` và reference để
  non-sticky nên swap cùng image B; managed identity không swap, vì vậy cả hai slot
  phải tiếp tục có UAMI được cấp `Key Vault Secrets User`.
- Review cleanup rule IP tạm và rollback; hiện cleanup có các lệnh nuốt lỗi,
  phải kiểm chứng rule đã gỡ. Chốt ngưỡng image scan: hiện HIGH/CRITICAL chưa
  tương đương yêu cầu đề gốc “không còn CVE”.

Tài liệu chính thức: [GitHub OIDC với Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure), [Azure CLI sitecontainers](https://learn.microsoft.com/cli/azure/webapp/sitecontainers) và [App Service slot swap](https://learn.microsoft.com/azure/app-service/deploy-staging-slots).
Chưa thay đổi quyền/ruleset/environment trên GitHub hoặc Azure trong bước này.

Bootstrap OIDC idempotent không tạo client secret và luôn giữ ba cờ deploy/review/
swap ở `false`:

```bash
GITHUB_OIDC_CONFIRM=qkhanhbe/HanoiTrip:azure-sandbox \
bash scripts/release/configure-github-oidc.sh
```

Script lấy immutable owner/repository ID từ GitHub API và giới hạn federated subject
theo đúng repository cùng GitHub environment. Nó chỉ tự động thay credential khi
subject hiện tại khớp chính xác mẫu legacy `repo:owner/name:environment:...`; subject
lạ làm script dừng. Environment chỉ cho nhánh `main` dùng. Quyền được cấp theo từng
Web App/MySQL/Key Vault/ACR; riêng ACR dùng `Reader` cho metadata và `AcrPush` cho
image, không cấp ACR Contributor/Tasks. Ba ID OIDC được lưu dạng environment secrets.
Chạy script chưa phải là bật CD; sau đó vẫn phải audit variables.
`AZURE_CD_OIDC_PROBE_ENABLED=true` chỉ cho phép job main đăng nhập và đọc metadata
bốn tài nguyên, không build/deploy/restart. Sau khi probe pass, đặt lại false, xử lý
drift Portal/Terraform và review cleanup trước khi đổi hai cờ
`AZURE_CD_ENABLED`/`AZURE_CD_CONFIG_REVIEWED`.

Job `container-check` trên PR build image trong step riêng, Compose smoke dùng `--no-build`, rồi scan cùng image. Xem [kiểm thử](testing.md) và [known issues](../known-issues.md) để phân biệt kết quả local với phần còn cần kiểm chứng.

Workflow hoạt động nằm trong `.github/workflows/`: `source-scan.yml` và `ci.yml` chạy trên PR vào `main`; `cd.yml` chạy sau push `main` nhưng deploy job mặc định bị khóa bằng `AZURE_CD_ENABLED` cho tới khi Azure/OIDC sẵn sàng. Không duy trì thêm một bộ workflow nháp song song để tránh cấu hình lệch nhau.

Tài liệu này mô tả các workflow GitHub hiện có. CI trên GitLab công ty được mô tả riêng trong [CI GitLab](ci-gitlab.md).

## Nguồn và phạm vi

- Source scan chạy trên PR, chặn secret/HIGH/CRITICAL, cảnh báo MEDIUM/LOW và không upload DD/DT.
- Cấu hình GitLab nội bộ giữ tại workspace/remote công ty, không chép sang nhánh
  GitHub này. Policy GitHub chưa được đối chiếu đầy đủ với ruleset nội bộ.

Bản chuyển đổi dùng [source-scan workflow](../.github/workflows/source-scan.yml), [scan-source.sh](../scripts/ci/scan-source.sh) và [security_gate.py](../scripts/ci/security_gate.py). GitHub chỉ thực thi workflow trong `.github/workflows/`.

## Mapping

| GitLab                             | GitHub áp dụng                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| MR / `merge_request_event`         | PR / `pull_request` vào `main`                                                     |
| `workflow.rules`, MR-only          | `on.pull_request`, không có `push` ở source-scan                                   |
| Component nội bộ                   | Bốn job gọi CLI scanner trong container public, pin digest                         |
| Stages `scan → report`             | Bốn job song song → `security-gate` qua `needs`                                    |
| `GIT_DEPTH: 0`                     | Checkout `fetch-depth: 0` riêng Gitleaks; scan `--all`                             |
| `when: always`                     | `if: ${{ always() }}` cho upload report và gate                                    |
| `needs.artifacts`                  | Upload/download artifacts với tên, đường dẫn xác định                              |
| `allow_failure.exit_codes: [3]`    | MEDIUM/LOW trả 0 + `::warning::` + Job Summary; không dùng `continue-on-error`     |
| CRITICAL/HIGH gate trong component | Job required check `source-security-gate` enforce policy từ report                 |
| Runner tags công ty                | Mẫu dùng `ubuntu-24.04`; self-hosted labels phải được công ty cấp nếu bắt buộc     |
| `SEVERITY_CHECK_IMAGE` Alpine/jq   | Python 3 standard library trên runner, không cần Alpine/jq                         |
| Tắt upload DD/DT                   | Không có job gọi DefectDojo/Dependency-Track; không upload SARIF lên dịch vụ ngoài |

GitHub không có trạng thái job màu cam giống GitLab. PR warning vẫn có check success; người review xem annotation và Summary. Ruleset phải thực sự yêu cầu check thì kết quả đỏ mới chặn merge.

## Policy và khác biệt chưa giải quyết

| Nhóm                   | Block                                                                       | Nonblocking              |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------ |
| Gitleaks               | Bất kỳ finding secret còn lại sau ignore được review                        | Không có finding         |
| Trivy SCA              | HIGH/CRITICAL (**tạm thời**)                                                | MEDIUM/LOW               |
| Trivy misconfiguration | HIGH/CRITICAL                                                               | MEDIUM/LOW               |
| Semgrep                | ERROR/HIGH/CRITICAL                                                         | WARNING/MEDIUM, INFO/LOW |
| Thực thi scanner       | Fail/skip/cancel; report thiếu, JSON sai; scan errors hoặc unknown severity | Chỉ khi scan hoàn tất    |

GitHub đang gate SCA theo HIGH/CRITICAL, còn component GitLab ghi SCA gated by TI blacklist. Vì chưa đối chiếu và tích hợp đầy đủ policy nội bộ, **không thể cam kết kết quả SCA giống nhau**. Ngưỡng severity hiện tại được ghi trong Summary. Các ruleset Semgrep công khai (`p/owasp-top-ten`, `p/javascript`, `p/typescript`, `p/react`) cũng chưa được đối chiếu với rules/exceptions nội bộ.

Semgrep dùng `scan` cho toàn bộ source hiện tại, tắt metrics/version check; không gọi dịch vụ scan cloud. Ruleset được tải từ registry nên cần network và có thể thay đổi độc lập với phiên bản engine; artifact giữ `check_id` và engine version để điều tra. Nếu cần tái lập tuyệt đối, đưa snapshot rules đã được review vào repo rồi đổi `--config` sang đường dẫn local.

Gitleaks giữ fingerprint ổn định nhờ full history. Khi có false positive, PR phải ghi lý do cho fingerprint trong `.gitleaksignore`; không dùng ignore rộng để làm xanh gate.

## Reports và xử lý lỗi

| Report chuẩn dùng để đếm   | Export bổ sung                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| `gitleaks.json` (redacted) | —                                                                     |
| `trivy-source.json`        | `sbom.cdx.json` CycloneDX, gồm danh sách package từ `--list-all-pkgs` |
| `trivy-misconfig.json`     | —                                                                     |
| `semgrep.json`             | `semgrep.sarif`                                                       |

Chỉ đếm report chuẩn, không duyệt đệ quy mọi JSON như template nguồn để tránh cộng cùng finding từ cả JSON/SARIF/SBOM. Report chỉ lấy từ artifact của run hiện tại, tách khỏi source checkout. Các export bắt buộc cũng được kiểm tra tồn tại/đúng dạng.

Scanner trả lỗi vận hành thì job fail ngay. Finding được để lại trong JSON để gate quyết định tập trung; một job scanner xanh **không** có nghĩa là toàn bộ scan sạch. Gate chạy sau mọi job, kiểm tra đủ bốn kết quả `success` và đủ report. Thiếu artifact không được chuyển thành warning rồi pass như nhánh fallback trong mẫu gốc.

Không có lockfile/source/IaC có thể tạo report trống hợp lệ. Khi app xuất hiện phải commit lockfile, xem target coverage và tạo evidence mới. Source scan không thay Trivy scan image sau Docker build.

## Triggers, quyền và runner

- Source scan chạy khi PR mở/cập nhật/mở lại/ready-for-review vào `main`, không có path filter bỏ sót check. Cập nhật PR hủy run cũ của chính PR đó.
- Chỉ `contents: read`, không Azure credentials/OIDC, không quyền comment hoặc push. Checkout không lưu credential. Scan repo mount read-only, artifacts ở thư mục riêng.
- GitHub Actions pin commit SHA. Scanner pin tag + Linux/amd64 digest trong `scan-source.sh`; thay phiên bản phải review cả tag và digest.
- Runner tải container, vulnerability DB, IaC checks và Semgrep rules. Nếu mạng công ty chặn, dùng runner/mirror được cấp hoặc ghi blocker; chưa giả định máy intern truy cập được registry nội bộ.
- Fork PR có thể cần chủ repo cho phép chạy theo cấu hình GitHub. Nếu dùng merge queue sau này, bổ sung `merge_group` và cập nhật policy trigger/ruleset.
- Không có job upload DefectDojo/Dependency-Track. Artifact lưu 7 ngày; không echo nội dung secret trong summary.

## CI app và CD Azure

`ci.yml` chạy lint/test/typecheck/build, test policy gate, Terraform fmt/init/validate, Docker Compose + MySQL smoke và Trivy runtime image. Job `terraform-plan` dùng OIDC identity tách riêng và chỉ tạo text artifact khi `AZURE_TERRAFORM_PLAN_ENABLED=true`; nếu chưa cấu hình, job ghi warning rõ ràng chứ không bịa plan.

`cd.yml` chạy `push` vào `main`: OIDC → build release image SHA → image scan → ACR → mở IP runner tạm → migration → staging warm-up → poll production mỗi giây trước swap → swap → xác nhận SHA B → rollback và xác nhận SHA A nếu lỗi. CD dùng concurrency riêng, cleanup production/staging/MySQL/Key Vault bằng `always()` và lưu raw evidence kể cả failure. Chỉ đặt `AZURE_CD_ENABLED=true` sau khi Terraform outputs, repository variables, secrets OIDC và environment `azure-sandbox` đã được review.

## Kiểm chứng và checklist khi đưa lên GitHub

Kiểm tra policy local:

```bash
python3 -m unittest discover -s tests/ci -v
bash -n scripts/ci/scan-source.sh
```

Các test dùng report giả để kiểm tra severity mapping, thiếu/hỏng report, job failure/skip/cancel, Semgrep lỗi, unknown severity và tránh đếm trùng. Đây là kiểm chứng logic gate, không thay scanner/GitHub run thật.

1. Push feature branch và mở PR vào `main`; khai báo AI trong PR.
2. Trong ruleset `main`, bắt buộc PR, required check `source-security-gate`, hạn chế bypass/direct push theo đề. Thêm app/IaC/image checks khi đã triển khai.
3. Evidence PR sạch: đủ 4 scan, report JSON + SBOM + SARIF + Summary.
4. Evidence PR HIGH/CRITICAL hoặc secret giả an toàn: gate fail, merge bị chặn. Không đưa credential thật vào PR thử nghiệm.
5. Evidence PR MEDIUM/LOW: gate pass, có warning và finding trong artifact.
6. Kiểm tra scanner lỗi/report thiếu dẫn tới fail, và sửa lại thì phục hồi.
7. Merge/push main không chạy source-scan; khi CD được thêm, xác nhận CD chạy đúng.
8. Ghi rõ chưa xác nhận TI blacklist/ruleset nội bộ; cập nhật policy khi nhận đủ thông tin.

Local run ngày 25/09/2026 đã chạy đủ bốn scanner: 0 secret/Critical/High, 4 Medium + 4 Low IaC, gate `PASS WITH WARNINGS`. PR #1 sau một lần sửa parser Semgrep đã xanh toàn bộ và squash merge qua ruleset `protect-main`; CD main trigger thành công nhưng deploy skipped theo safety flag. Terraform đã fmt/validate nhưng chưa plan/apply Azure.

## Tài liệu chính thức

- [GitHub workflow commands: warning và Job Summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [GitHub status checks và required checks](https://docs.github.com/en/pull-requests/reference/status-checks)
- [Gitleaks CLI: full history, redaction, ignore](https://github.com/gitleaks/gitleaks)
- [Trivy filesystem scanning](https://trivy.dev/docs/dev/target/filesystem/)
- [Trivy report conversion và SBOM](https://trivy.dev/docs/v0.56/guide/configuration/reporting/)
- [Semgrep CLI reference](https://docs.semgrep.dev/cli-reference)
