# Evidence index

Audit gần nhất: **02/10/2026**. Trạng thái dưới đây phân biệt rõ:

- **Đạt kỹ thuật:** trạng thái live đã được kiểm tra bằng lệnh đọc.
- **Một phần:** đã có code hoặc một phần hạ tầng nhưng chưa đạt đủ điều kiện bắt buộc.
- **Chưa đạt:** trạng thái live còn thiếu hoặc trái với yêu cầu.

Không dùng output local thay cho bằng chứng cloud. Screenshot và log nộp cuối phải được che dữ liệu nhạy cảm, ghi ngày, commit SHA và lệnh hoặc URL run tương ứng.

## Kết luận hiện tại

| Mốc | Trạng thái   | Kết quả audit                                                                                                                                     |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Đạt kỹ thuật | Registry tắt admin; ứng dụng pull image bằng user-assigned managed identity có `AcrPull`; production và staging đều chạy image trong registry.    |
| M2  | Chưa đạt     | Chưa swap production A→B. Poller hiện cho phép lỗi tạm thời nên chưa cưỡng chế yêu cầu `0 non-200`.                                               |
| M3  | Một phần     | `/health` và `GET /items` live hoạt động với MySQL/TLS. Firewall có 4 outbound IP của App Service nhưng vẫn còn 3 rule IP client cũ.              |
| M4  | Đạt kỹ thuật | Managed identity có `AcrPull` và `Key Vault Secrets User`; app settings nhạy cảm dùng Key Vault reference.                                        |
| M5  | Một phần     | Secret và reference đã có; chưa thực hiện phép thử thu hồi quyền MI làm app lỗi rồi cấp lại quyền để phục hồi.                                    |
| M6  | Chưa đạt     | Staging default-deny và whitelist đúng; production hiện còn rule `Allow all`.                                                                     |
| M7  | Chưa đạt     | Live đang dùng App Service S1 và MySQL B1ms, nhưng chưa có autoscale live và chưa có số liệu Cost Analysis thật.                                  |
| M8  | Đạt kỹ thuật | Backend Entra + locking đã kiểm chứng; greenfield `destroy → apply` dựng môi trường chạy được, CRUD/no-change đạt và cleanup cuối phiên hoàn tất. |
| M9  | Một phần     | CI và branch protection đang hoạt động; thiếu hai bằng chứng negative bắt buộc và Terraform plan thật vẫn chưa được tạo.                          |
| M10 | Một phần     | Main đã build/scan/push và triển khai staging thành công; production swap đang tắt nên chưa có run end-to-end.                                    |
| M11 | Chưa đạt     | Chưa có workspace, diagnostic setting, action group hoặc metric alert live; provider `Microsoft.Insights` đang `NotRegistered`.                   |

Theo chuẩn chấm nghiêm ngặt, **chưa thể tuyên bố hoàn tất M1–M11**. M1, M4 và M8 đã đạt trạng thái kỹ thuật nhưng vẫn nên bổ sung ảnh Portal hoặc log redacted vào đúng file trước khi nộp.

## Evidence cần bổ sung

### M1 — image và managed identity

- Output registry cho thấy `adminUserEnabled=false`.
- Output container của production và staging: image tag bất biến, `authType=UserAssigned`.
- Output role assignment tại scope registry: managed identity có `AcrPull`.
- `/version` trả đúng SHA của image đang chạy.

### M2 — zero downtime

- Sửa production observer để fail nếu có bất kỳ non-200/network error nào.
- Bật release được phê duyệt và lưu raw JSONL khi swap A→B.
- Tổng hợp log chứng minh `non200=0`, có cả SHA A và SHA B.
- Thực hiện reverse swap B→A và lưu raw log rollback.

### M3 — MySQL

- Xóa các firewall rule client cũ sau khi xác nhận không còn cần thiết; chỉ giữ outbound IP của ứng dụng.
- Log `POST /items` tạo một record kiểm thử và `GET /items` đọc lại đúng record đó.
- Output firewall rules và hai server parameters `require_secure_transport=ON`, `tls_version` có TLS 1.2 trở lên.
- Screenshot trang Networking của MySQL sau khi dọn rule.

### M4 — managed identity

- Screenshot Identity của ứng dụng/slot và role assignments tại registry và vault.
- Output app settings chỉ hiện tên setting và trạng thái `Key Vault reference`, không hiện giá trị.
- `/health` và một request cần secret/provider trả thành công.

### M5 — Key Vault

- Screenshot reference status đã resolve; không chụp giá trị secret.
- Thu hồi riêng role đọc secret của managed identity, restart ứng dụng và lưu `/health` hoặc startup log bị lỗi.
- Cấp lại đúng role, restart và lưu `/health` trở về 200.
- Ghi rõ thời gian bắt đầu/kết thúc để tránh để môi trường ở trạng thái lỗi.

### M6 — IP whitelist

- Đổi production sang default-deny trước khi thử.
- `curl` từ IP được whitelist trả 200.
- `curl` từ hotspot hoặc máy khác không nằm trong whitelist trả 403.
- Screenshot access restrictions của cả production và staging; xác nhận không còn rule runner tạm.

### M7 — chi phí

- Tạo autoscale live với min 1, max 2 và lưu screenshot rule.
- Chạy load ngắn, chụp instance count tăng nhưng không vượt 2 rồi giảm lại.
- Export hoặc screenshot Cost Analysis theo resource group, có khoảng thời gian, currency và tổng chi phí thật.
- Điền số liệu thật và ba biện pháp tiết kiệm vào [`cost-report.md`](../cost-report.md).

### M8 — Terraform

- Đã hoàn tất; xem [`M8.md`](M8.md) và transcript redacted
  [`logs/m8-terraform-rebuild-2026-10-02.txt`](logs/m8-terraform-rebuild-2026-10-02.txt).
- Khi nộp báo cáo cuối, có thể đính kèm raw terminal logs đã redaction từ
  `.local/harness/`; không cần dựng lại stack chỉ để chụp Portal.

### M9 — CI gate

- PR có secret giả: screenshot job secret scan đỏ và nút merge bị chặn; đóng PR, không merge secret.
- PR có lỗi build hoặc test: screenshot check đỏ và merge bị chặn.
- Một PR sạch: lint, unit test, Docker build và Trivy image scan xanh.
- Bật Terraform plan thật, tải artifact plan và chụp phần artifact trên PR.
- Screenshot branch protection với các required checks.

### M10 — release từ main

- Một PR sạch được merge vào `main`.
- Một run duy nhất chứng minh build → image scan → push image → migration → staging smoke → production swap.
- Artifact chứa staging poll và production swap poll; `/version` production trả SHA mới.
- Thực hiện rollback rehearsal và lưu run/log tương ứng.

### M11 — monitoring

- Đăng ký provider cần thiết rồi apply workspace, diagnostic settings, action group và 3 alerts.
- Screenshot dashboard không dùng Application Insights: response time, request rate, failure rate; CPU, memory, HTTP queue; MySQL CPU, connections, storage.
- Lưu KQL và kết quả log thật có request ID/build SHA/status/duration.
- Screenshot ba alert active và action group email.
- Bật diagnostics có kiểm soát, trigger ít nhất một alert thật, lưu fired alert và email nhận được, sau đó tắt diagnostics.

## Thứ tự hoàn thiện hợp lý

1. Đồng bộ Terraform với stack live và hoàn thành M8 trước; đây là nền cho M6, M7 và M11.
2. Hoàn thiện M6, autoscale và monitoring; sau đó thu M7/M11 evidence.
3. Hoàn thiện negative CI evidence và Terraform plan thật cho M9.
4. Sửa observer zero-downtime, diễn tập rollback, rồi mới bật một production swap để chốt M2/M10.
5. Thực hiện phép thử thu hồi quyền vault ở cuối cùng, trong một cửa sổ ngắn, để chốt M5 mà không làm gián đoạn các bước khác.
