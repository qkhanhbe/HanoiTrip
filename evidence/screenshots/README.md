# Screenshot index

Ảnh trong thư mục này là evidence gốc đã được kiểm tra để không chứa secret,
token, password, connection string hoặc API key. Tên file dùng tiền tố mốc MUST
để liên kết trực tiếp từ `evidence/M*.md`.

| File | Mốc | Nội dung | Ngày chụp |
| --- | --- | --- | --- |
| `m07-autoscale-max-two.png` | M7 | Custom autoscale: min/default/max 1/1/2; CPU >70 tăng 1, <35 giảm 1 | 08/10/2026 |
| `m11-alert-summary-redacted.png` | M11 | Stack test: 19 HTTP 5xx vượt ngưỡng 5, Resolved; giữ thông báo target đã bị di chuyển/xóa | 08/10/2026 |
| `m11-alert-history-redacted.png` | M11 | Stack test: Fired 14:55 → Resolved 15:02 ngày 06/10, cùng action group được gọi hai lần | 08/10/2026 |
| `m11-action-group-redacted.png` | M11 | Action group có Email receiver; verification Pending; che subscription ID và email | 08/10/2026 |
| `m11-alert-rules.png` | M11 | Ba metric alert Enabled; rõ condition, severity và target scope | 08/10/2026 |
| `m11-kql-request-logs.png` | M11 | KQL trả 20 request log, đủ timestamp, requestId, buildSha, statusCode và durationMs | 08/10/2026 |
| `m11-dashboard-app-infra.png` | M11 | Sáu chart App/App Service render dữ liệu; chưa bao gồm hàng MySQL | 08/10/2026 |
| `m11-dashboard-mysql.png` | M11 | Ba chart MySQL CPU, active connections và storage có dữ liệu | 08/10/2026 |
| `m03-local-compose-healthy.png` | M3 | App và MySQL healthy; migration exit 0 | 08/10/2026 |
| `m03-local-mysql-smoke-pass.png` | M3 | Smoke test đọc/ghi MySQL và diagnostics đạt | 08/10/2026 |
| `m03-mysql-firewall-redacted.png` | M3 | Networking: bốn firewall rule App Service, IP được che | 08/10/2026 |
| `m03-mysql-server-parameters.png` | M3 | require_secure_transport=ON; TLS có hai protocol được chọn | 08/10/2026 |
| `m06-production-access-restrictions.png` | M6 | Production Main site: hai WARP allow, unmatched Deny; CIDR được che | 08/10/2026 |
| `m06-staging-access-restrictions.png` | M6 | Staging Main site: hai WARP allow, unmatched Deny; CIDR được che | 08/10/2026 |
| `m06-staging-scm-use-main-rules.png` | M6 | Staging SCM dùng Main site rules; unmatched action Deny | 08/10/2026 |
| `m06-production-scm-use-main-rules.png` | M6 | Production SCM dùng Main site rules; unmatched action Deny | 08/10/2026 |
| `m02-cd-production-swap-observed.png` | M2 | Log xác nhận production nhận đúng SHA trong ba lần poll liên tiếp, 0 lỗi tạm thời | 08/10/2026 |
| `m09-pr32-required-checks-green.png` | M9 | PR #32 merged; đủ 10 required checks xanh | 08/10/2026 |
| `m09-pr30-secret-gate-blocked.png` | M9 | PR #30 đóng, chưa merge; source-security-gate đỏ | 08/10/2026 |
| `m09-pr30-secret-gate-failed-run.png` | M9 | Run #54 hiển thị source-security-gate thất bại | 08/10/2026 |
| `m09-pr31-closed-required-check-failed.png` | M9 | PR #31 đóng; app-check và source gate đỏ | 08/10/2026 |
| `m09-pr31-source-gate-intentional-failure.png` | M9 | Log policy test cố ý fail; source-security-gate đỏ | 08/10/2026 |
| `m09-pr31-app-check-intentional-failure.png` | M9 | Log policy test cố ý fail; app-check đỏ | 08/10/2026 |
| `m10-cd-run-37723130114-success.png` | M10 | CD deploy thành công; build đến cleanup đều xanh | 08/10/2026 |
| `m10-production-vietmap-route.png` | M10 | Production UI: tuyến ô tô VIETMAP thực, geometry và ba phương án | 08/10/2026 |
| `m04-acrpull-role-assignment.png` | M1/M4 | Managed Identity có role AcrPull tại scope ACR | 08/10/2026 |
| `m04-key-vault-secrets-user-role.png` | M4 | Managed Identity có Key Vault Secrets User tại scope vault | 08/10/2026 |
| `m04-key-vault-references-healthy.png` | M4 | App Service Key Vault references có dấu xanh; secret values ẩn | 08/10/2026 |
| `m07-app-service-plan-s1.png` | M7 | App Service Plan S1, East Asia, một instance; subscription ID được che | 08/10/2026 |
| `m07-mysql-flexible-server-b1ms.png` | M7 | MySQL B1ms, 1 vCore/2 GiB, 20 GiB storage, backup retention 7 ngày; subscription ID được che | 08/10/2026 |

Các ảnh được sao chép nguyên bản từ screenshot người dùng cung cấp và chỉ đổi
tên, ngoại trừ tám ảnh đã redaction: `m03-mysql-firewall-redacted.png`,
`m06-production-access-restrictions.png`, `m06-staging-access-restrictions.png`,
`m07-app-service-plan-s1.png`, `m07-mysql-flexible-server-b1ms.png` và
`m11-action-group-redacted.png`, `m11-alert-summary-redacted.png` và
`m11-alert-history-redacted.png`. Hai ảnh alert Summary/History chỉ che
Subscription ID; pixel ngoài vùng che đã được kiểm tra không đổi.
Ảnh action group M11 che Subscription ID và email bằng
hai hình chữ nhật đặc; đã kiểm tra pixel ngoài vùng che không đổi. Ảnh
firewall MySQL che 10 vùng chứa IP; mỗi ảnh M6 che hai CIDR WARP; hai ảnh M7
che subscription ID. Pixel bên ngoài vùng che được giữ nguyên. Các bản gốc có
IP không được đưa vào repository.
