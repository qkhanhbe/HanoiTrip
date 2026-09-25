# Known issues

## Chưa hoàn thành vì cần Azure thật

- Chưa `terraform apply/destroy`, chưa có remote state/lock evidence và chưa kiểm chứng tên SKU/metric tại subscription thực tế.
- Chưa push image vào ACR, chưa chứng minh Managed Identity pull/Key Vault negative test/MySQL firewall/IP allowlist.
- CD được giữ disabled bằng `AZURE_CD_ENABLED`; chưa có run staging → swap → rollback và raw zero-downtime log.
- Terraform plan job chỉ tạo artifact khi OIDC/backend được cấu hình; run hiện tại chỉ có fmt/validate.
- Dashboard, KQL schema, email action group và alert thật chưa được kích hoạt. Không bật Application Insights do yêu cầu monitoring hiện ghi rõ không dùng.
- Google Routes/Google Maps live chưa có key và chưa test coverage transit Hà Nội; UI đang ghi rõ route demo.

## Gap đã biết

- Trivy IaC hiện còn Medium/Low: MySQL public endpoint có firewall, App Service authentication chưa bật, storage state dùng LRS/không CMK và một số hardening phụ. Gate theo đề chỉ chặn secret/High/Critical; warnings vẫn phải review.
- Policy SCA GitHub tạm chặn HIGH/CRITICAL vì không có TI blacklist/component nội bộ từ GitLab để tái tạo chính xác.
- MapLibre được lazy-load nhưng chunk map vẫn lớn; lần đầu mở map có thể chậm trên mạng yếu.
- Favorites dùng chung sandbox, chưa có tài khoản hay phân quyền người dùng.
- GitHub-hosted runner cần mở IP tạm cho production, staging, MySQL và Key Vault; cleanup có `always()`, nhưng vẫn phải kiểm tra rule orphan sau mọi run lỗi.

## Nếu làm lại

Tạo Azure sandbox/OIDC trước khi viết CD để validate lệnh CLI và metric names sớm hơn; dùng private networking khi ngân sách/quyền cho phép; snapshot Semgrep rules nội bộ để scan tái lập tuyệt đối.
