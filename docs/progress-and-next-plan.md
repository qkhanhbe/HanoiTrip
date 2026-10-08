# Tiến độ và kế hoạch tiếp theo

Cập nhật: **08/10/2026**

## Đã hoàn thành

- M1–M11 đã đạt về mặt kỹ thuật; mapping và evidence chi tiết nằm tại
  [`evidence/README.md`](../evidence/README.md).
- PR #29 là positive CI path: toàn bộ app/browser/container/source/Terraform
  checks xanh; Terraform plan thật tạo 38 resource bằng OIDC read-only.
- PR #30 chứng minh secret tổng hợp làm gate đỏ và chặn merge; PR #31 chứng minh
  test lỗi làm app/policy gate đỏ và chặn merge. Cả hai đã đóng, không merge.
- CD run 37723130114 chạy end-to-end từ main tới production. Observer strict ghi
  30/30 HTTP 200 và SHA A → B; cleanup rule tạm đạt.
- Production chạy commit `42d24aa22897aa0067d2c8fbaf703840d76e3652`,
  `/health=200`, database MySQL.
- MySQL chỉ còn bốn firewall rule App Service; CRUD và TLS đã kiểm chứng.
- Key Vault negative test đã revoke → fail → restore → recover, không để lại môi
  trường lỗi.
- Production/staging đã đồng bộ access restriction default-deny cho site và SCM,
  hai nguồn WARP được allow.
- M8 greenfield rebuild/lock/cleanup đã có transcript. Monitoring live hiện hành
  được quản lý bởi root Terraform riêng `terraform/monitoring-live`: plan trước
  apply `9 add/0 change/0 destroy`, plan sau apply `No changes`.
- Dashboard `HanoiTrip operations`, Log Analytics/diagnostics, autoscale 1–2,
  action group và ba alert hiện tồn tại trên sandbox. KQL live đã trả 31 dòng
  structured log đầy đủ; alert history Fired→Resolved ngày 06/10 vẫn truy vấn được.

## Trạng thái an toàn sau kiểm chứng

- `AZURE_PRODUCTION_SWAP_ENABLED=false`; merge main tiếp theo chỉ phát hành
  staging cho tới khi có release approval mới.
- Không còn rule `github-cd-temporary` ở App Service hoặc MySQL.
- Không còn ACI/greenfield app stack kiểm thử chạy qua đêm; backend Terraform có
  lifecycle riêng vẫn được giữ.
- State monitoring dùng key riêng `hanoitrip-monitoring-live.tfstate`; state app
  greenfield vẫn rỗng. Không chạy `terraform/app apply` vào sandbox cũ trước khi
  hoàn tất quy trình adoption/import và có zero-change baseline.
- Role `Key Vault Secrets User` đã được phục hồi đúng một assignment; production
  và staging đều healthy.
- Hai nhánh negative CI đã bị xóa; trang PR và run vẫn giữ làm evidence.

## Việc còn lại

Đây không còn là gap kỹ thuật MUST:

1. Chụp năm nhóm ảnh M11 theo
   [checklist cuối](final-validation-and-screenshots.md): dashboard, KQL, ba alert,
   action group và Alert History Fired/Resolved.
2. Chụp email Fired/Resolved nếu còn trong hộp thư; che email/subscription/resource
   ID trước khi lưu.
3. Hoàn thiện hai cross-review, live demo và báo cáo theo đề gốc.
4. Sau khi bộ evidence đóng gói xong mới chuyển sang evaluate/cải tiến sản phẩm.
5. Nếu cần đồng bộ GitLab để review, người dùng tự nhập username/password; không
   force-push hoặc trộn lịch sử GitHub/GitLab.

## Blocker còn lại

Không còn blocker kỹ thuật cho M1–M11. Các phụ thuộc còn lại là bằng chứng do người
dùng phải chụp/xác nhận: email alert Fired/Resolved và ảnh Azure Portal/GitHub.
GitLab credential là thao tác thủ công, nhưng GitLab không phải đường CD và không
chặn bộ MUST trên GitHub/Azure.
