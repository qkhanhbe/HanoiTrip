# Intern — GitLab CI

Template `.gitlab-ci.yml` chạy quét bảo mật mã nguồn (source scan) cho các repo intern.

## Flow MR

```
Tạo / cập nhật MR ──► stage: scan
                        ├─ gitleaks-scan       (secret, clone full history)
                        ├─ trivy-source-sbom   (SCA / SBOM dependency)
                        ├─ trivy-misconfig     (misconfig IaC / Dockerfile)
                        └─ semgrep-sast        (SAST)
                     ──► stage: report
                        └─ severity-check      (đếm finding MEDIUM / LOW)
```

- **Chỉ chạy trên MR** (`merge_request_event`). Push hay merge vào `main` **không** tạo pipeline.
- **Trạng thái pipeline:**

  | Kết quả scan                  | Pipeline                          | MR          |
  |-------------------------------|-----------------------------------|-------------|
  | Có CRITICAL / HIGH            | 🔴 failed (do gate của component) | Bị chặn     |
  | Chỉ có MEDIUM / LOW           | 🟠 passed with warnings           | Merge được  |
  | Không có finding              | 🟢 passed                         | Merge được  |

- `severity-check` gom artifact của các job scan (`*.json`, `*.sarif`), đọc trường severity rồi `exit 3` nếu có MEDIUM/LOW. Job đặt `allow_failure: exit_codes: [3]` nên pipeline chuyển sang màu cam chứ không đỏ.
- Đã tắt job upload lên DefectDojo / Dependency-Track (`upload-scan-source`).
- gosec / python / mobsf tự bỏ qua khi repo không có mã Go, Python hay mobile.
- Runner tags: `intern`, `nonprod`, `vsf-vf-kdhmdl`.

## Sử dụng

1. Copy `intern/.gitlab-ci.yml` vào thư mục gốc của repo đích.
2. Mở một MR để kích hoạt pipeline.
3. Nếu gitleaks báo nhầm (false positive), thêm fingerprint vào `.gitleaksignore`.
4. Nếu runner không kéo được `alpine:3.20` hoặc không cài được `jq`, hãy override biến `SEVERITY_CHECK_IMAGE` sang một image nội bộ đã có sẵn `jq`.
