# Evidence index

Audit gần nhất: **08/10/2026**.

## Kết luận

Toàn bộ yêu cầu kỹ thuật MUST M1–M11 đã có kiểm chứng bằng CI, cloud state hoặc
negative test thật. Phần còn lại là đóng gói bằng chứng trực quan cho báo cáo:
screenshot Portal, GitHub Actions và email alert. Danh sách chụp nằm tại
[`docs/final-validation-and-screenshots.md`](../docs/final-validation-and-screenshots.md).

| Mốc | Trạng thái | Evidence chính |
| --- | --- | --- |
| M1 | Đạt kỹ thuật | ACR tắt admin; App Service pull image bằng UAMI có `AcrPull`; production chạy image SHA bất biến. |
| M2 | Đạt kỹ thuật | Observer strict có 30/30 HTTP 200, 0 lỗi và SHA A → B trong slot swap. |
| M3 | Đạt kỹ thuật | CRUD MySQL thật; TLS bắt buộc; firewall chỉ còn bốn outbound IP App Service. |
| M4 | Đạt kỹ thuật | UAMI dùng cho ACR/Key Vault; app settings chỉ giữ Key Vault reference. |
| M5 | Đạt kỹ thuật | Thu hồi quyền làm cả hai slot lỗi; khôi phục quyền/reference làm cả hai trở lại 200. |
| M6 | Đạt kỹ thuật | Site/SCM default-deny; nguồn WARP trả 200; nguồn ACI ngoài allowlist trả 403 và đã cleanup. |
| M7 | Đạt kỹ thuật | S1/B1ms, autoscale min 1/max 2, retention 30 ngày, Actual Cost và ba biện pháp tiết kiệm. |
| M8 | Đạt kỹ thuật | Entra-backed remote state/lock; destroy → apply greenfield → no-change → cleanup, không thao tác Portal. |
| M9 | Đạt kỹ thuật | PR sạch xanh + plan artifact thật; PR secret và PR test lỗi đều đỏ, bị block, không merge. |
| M10 | Đạt kỹ thuật | Một main run hoàn chỉnh build/scan/push/migrate/staging/swap/verify/cleanup. |
| M11 | Đạt kỹ thuật | Dashboard không App Insights, KQL/logs, ba alert/action group; HTTP 5xx Fired rồi Resolved thật. |

## Quy tắc đóng gói

- Không dùng output local thay cho cloud evidence.
- Screenshot/log phải có ngày, commit SHA hoặc run URL tương ứng.
- Che token, secret value, connection string, object ID đầy đủ, email và IP nếu
  tài liệu được chia sẻ công khai.
- Không dựng lại hoặc phá môi trường chỉ để có ảnh khi transcript hiện tại đã đủ;
  chỉ chụp trạng thái Portal hiện hành và trang run/PR đã lưu.

## Liên kết

- [M1](M1.md), [M2](M2.md), [M3](M3.md), [M4](M4.md), [M5](M5.md),
  [M6](M6.md), [M7](M7.md), [M8](M8.md), [M9](M9.md), [M10](M10.md),
  [M11](M11.md)
- [Checklist chạy lại và chụp ảnh](../docs/final-validation-and-screenshots.md)
- [Tiến độ và kế hoạch tiếp theo](../docs/progress-and-next-plan.md)
