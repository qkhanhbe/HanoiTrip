# Known issues

## Các phần cần kiểm chứng triển khai

- Chưa `terraform apply/destroy`, chưa có remote state/lock evidence và chưa kiểm chứng tên SKU/metric tại subscription thực tế.
- Stack Portal hiện tại chưa có Terraform state. Cấu hình đã dùng cùng mô hình UAMI/RBAC/sitecontainers, nhưng tên live chưa được import và chưa có zero-change plan.
- CD đã build/push/deploy staging thành công; production swap vẫn khóa nên chưa có run staging → swap → rollback và raw zero-downtime log.
- Terraform plan job chỉ tạo artifact khi OIDC/backend được cấu hình; run hiện tại chỉ có fmt/validate.
- Dashboard, KQL schema, email action group và alert thật chưa được kích hoạt. Không bật Application Insights do yêu cầu monitoring hiện ghi rõ không dùng.
- Google Routes/Google Maps live chưa có key và chưa test coverage transit Hà Nội; UI đang ghi rõ route demo.
- VIETMAP adapter và contract tests đã có; staging đã chạy Search/Place/Route thật nhưng vẫn thiếu quota/điều khoản cache-attribution evidence và production chưa swap bản này.

## Gap đã biết

- GitHub chạy app CI/CD với npm public; GitLab dành cho review/scan, không deploy.
  GitLab image scan chưa nối nguồn image; xem [phạm vi GitLab](docs/ci-gitlab.md).
- Production swap vẫn khóa đến khi poller chứng minh tuyệt đối 0 non-200 và rollback được diễn tập.

- Trivy IaC hiện còn Medium/Low: MySQL public endpoint có firewall, App Service authentication chưa bật, storage state dùng LRS/không CMK và một số hardening phụ. Gate theo đề chỉ chặn secret/High/Critical; warnings vẫn phải review.
- Policy SCA GitHub tạm chặn HIGH/CRITICAL vì không có TI blacklist/component nội bộ từ GitLab để tái tạo chính xác.
- Runtime scan tạm miễn đúng `CVE-2026-84782` đến `2026-10-14`: Debian 13/Distroless chưa có fixed OpenSSL package và app không dùng DTLS. Không mở rộng thành `--ignore-unfixed`; xóa exception ngay khi image hỗ trợ có bản vá.
- MapLibre được lazy-load nhưng chunk map vẫn lớn; lần đầu mở map có thể chậm trên mạng yếu.
- Favorites dùng chung sandbox, chưa có tài khoản hay phân quyền người dùng.
- GitHub-hosted runner cần mở IP tạm cho production, staging, MySQL và Key Vault; cleanup có `always()`, nhưng vẫn phải kiểm tra rule orphan sau mọi run lỗi.

## Nếu làm lại

Tạo Azure sandbox/OIDC trước khi viết CD để validate lệnh CLI và metric names sớm hơn; dùng private networking khi ngân sách/quyền cho phép; snapshot Semgrep rules nội bộ để scan tái lập tuyệt đối.
