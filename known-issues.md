# Known issues

## Các phần cần kiểm chứng triển khai

- Chưa `terraform apply/destroy`, chưa có remote state/lock evidence và chưa kiểm chứng tên SKU/metric tại subscription thực tế.
- Cấu hình ACR, Managed Identity, Key Vault và network thao tác qua Portal cần được đối chiếu với Terraform và log kiểm chứng; kiểm thử local không xác nhận cấu hình Azure.
- CD được giữ disabled bằng `AZURE_CD_ENABLED`; chưa có run staging → swap → rollback và raw zero-downtime log.
- Terraform plan job chỉ tạo artifact khi OIDC/backend được cấu hình; run hiện tại chỉ có fmt/validate.
- Dashboard, KQL schema, email action group và alert thật chưa được kích hoạt. Không bật Application Insights do yêu cầu monitoring hiện ghi rõ không dùng.
- Google Routes/Google Maps live chưa có key và chưa test coverage transit Hà Nội; UI đang ghi rõ route demo.
- VIETMAP adapter và contract tests đã có nhưng chưa có dev key/quota evidence, chưa chạy live Search/Place/Route hoặc xác minh điều khoản cache/attribution. `ROAD_PROVIDER` phải giữ `disabled` ở Azure cho tới khi gate này pass.

## Gap đã biết

- GitHub chạy app CI/CD với npm public; GitLab dành cho review/scan, không deploy.
  GitLab image scan chưa nối nguồn image; xem [phạm vi GitLab](docs/ci-gitlab.md).
- CD vẫn khóa: cần rà hostname thực, sitecontainers, tài khoản migration và cleanup
  firewall trước khi bật cả AZURE_CD_ENABLED và AZURE_CD_CONFIG_REVIEWED.

- Trivy IaC hiện còn Medium/Low: MySQL public endpoint có firewall, App Service authentication chưa bật, storage state dùng LRS/không CMK và một số hardening phụ. Gate theo đề chỉ chặn secret/High/Critical; warnings vẫn phải review.
- Policy SCA GitHub tạm chặn HIGH/CRITICAL vì không có TI blacklist/component nội bộ từ GitLab để tái tạo chính xác.
- Runtime scan tạm miễn đúng `CVE-2026-84782` đến `2026-10-14`: Debian 13/Distroless chưa có fixed OpenSSL package và app không dùng DTLS. Không mở rộng thành `--ignore-unfixed`; xóa exception ngay khi image hỗ trợ có bản vá.
- MapLibre được lazy-load nhưng chunk map vẫn lớn; lần đầu mở map có thể chậm trên mạng yếu.
- Favorites dùng chung sandbox, chưa có tài khoản hay phân quyền người dùng.
- GitHub-hosted runner cần mở IP tạm cho production, staging, MySQL và Key Vault; cleanup có `always()`, nhưng vẫn phải kiểm tra rule orphan sau mọi run lỗi.

## Nếu làm lại

Tạo Azure sandbox/OIDC trước khi viết CD để validate lệnh CLI và metric names sớm hơn; dùng private networking khi ngân sách/quyền cho phép; snapshot Semgrep rules nội bộ để scan tái lập tuyệt đối.
