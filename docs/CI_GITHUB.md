# CI/CD GitHub Actions

Workflow hoạt động nằm trong `.github/workflows/`: `source-scan.yml` và `ci.yml` chạy trên PR vào `main`; `cd.yml` chạy sau push `main` nhưng deploy job mặc định bị khóa bằng `AZURE_CD_ENABLED` cho tới khi Azure/OIDC sẵn sàng. Không duy trì thêm một bộ workflow nháp song song để tránh cấu hình lệch nhau.

Tài liệu này giải thích phần CI của [masterplan](../MASTERPLAN_HANOI_TRIP_PLANNER.md), không thay thế masterplan.

## Nguồn và phạm vi

- `README (1).md`: yêu cầu source scan, MR-only, HIGH/CRITICAL chặn, MEDIUM/LOW cảnh báo, tắt upload DD/DT.
- `gitlab-ci.yml`: include component nội bộ `scan-source@v2.4.0`, job overrides và script severity-check. Chưa có mã nguồn component, TI blacklist hoặc bộ rule bên trong.
- README GitLab mặc định được lưu ở `reference/gitlab-template-README.md`. Các gợi ý mặc định Kubernetes/AWS không phải thay đổi phạm vi bài Azure.

Bản chuyển đổi dùng [source-scan workflow](../.github/workflows/source-scan.yml), [scan-source.sh](../scripts/ci/scan-source.sh) và [security_gate.py](../scripts/ci/security_gate.py). File `gitlab-ci.yml` được giữ làm nguồn đối chiếu, GitHub không thực thi file này.

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

README nguồn ghi HIGH/CRITICAL chặn chung, còn comment YAML ghi SCA gated by TI blacklist. Vì chưa có blacklist, **không thể cam kết kết quả SCA giống hệ thống nội bộ**. Ngưỡng severity hiện tại là lựa chọn tạm được ghi cả trong Summary, cần người giao xác nhận. Các ruleset Semgrep công khai (`p/owasp-top-ten`, `p/javascript`, `p/typescript`, `p/react`) cũng chưa được đối chiếu với rules/exceptions nội bộ.

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

Local run ngày 25/09/2026 đã chạy đủ bốn scanner: 0 secret/Critical/High, 4 Medium + 4 Low IaC, gate `PASS WITH WARNINGS`; Semgrep không còn parse error. Điều này chưa thay thế Actions run/ruleset thật. Terraform đã fmt/validate nhưng chưa plan/apply Azure; CD chưa được bật.

## Tài liệu chính thức

- [GitHub workflow commands: warning và Job Summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [GitHub status checks và required checks](https://docs.github.com/en/pull-requests/reference/status-checks)
- [Gitleaks CLI: full history, redaction, ignore](https://github.com/gitleaks/gitleaks)
- [Trivy filesystem scanning](https://trivy.dev/docs/dev/target/filesystem/)
- [Trivy report conversion và SBOM](https://trivy.dev/docs/v0.56/guide/configuration/reporting/)
- [Semgrep CLI reference](https://docs.semgrep.dev/cli-reference)
