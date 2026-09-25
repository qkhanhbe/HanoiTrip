# Đối chiếu đề gốc và hướng dẫn build validate

Đây là trạng thái triển khai, không phải xác nhận đã hoàn thành bài thực tập. Nguồn: đề gốc trong workspace và hướng dẫn bổ sung build Dockerfile khi mở MR.

| Yêu cầu                             | Trạng thái và phần còn thiếu                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoint bắt buộc + JSON log        | Đã có code/test; `/boom` và `/load` cần bật diagnostics trong sandbox để demo.                                                                                                                                   |
| Trunk-based / PR / build validation | PR #1/#2 đã merge qua CI, ruleset và squash. Còn thiếu thử nghiệm merge bị chặn và screenshot theo đề.                                                                                                           |
| M1–M6                               | App/MySQL local và cấu hình Azure đã có; chưa có evidence ACR/MI/KV/firewall/whitelist/swap thật.                                                                                                                |
| M7                                  | Có cấu hình max 2 instance và bản nháp báo cáo; chưa có Cost Analysis và autoscale evidence thật.                                                                                                                |
| M8                                  | Terraform fmt/validate đạt; chưa plan/apply, state lock hay destroy/apply tái tạo app. Validate không chứng minh deploy được.                                                                                    |
| M9                                  | App/source/image CI đã chạy trên GitHub. Còn thiếu plan artifact thật, PR secret giả và bằng chứng merge bị chặn. Image scan chỉ gate HIGH/CRITICAL, chưa đáp ứng câu chữ “không còn CVE” nếu tính mọi severity. |
| M10                                 | Workflow có sẵn nhưng deploy đang disabled. Cần hoàn thiện/kiểm chứng lần deploy đầu, warm-up `/health`, rollback và cleanup trước khi bật. Manual dispatch cũng cần khóa ref `main` ngay trong deploy job.      |
| M11                                 | Có JSON logs, diagnostic/alert IaC và runbook; chưa dashboard, log query thực tế hoặc email alert được trigger. Alert 5xx hiện đếm số lỗi, chưa phải tỷ lệ lỗi.                                                  |
| Deliverables                        | Có README/architecture/runbook/AI log/evidence files; nhiều evidence chỉ là checklist. Chưa hai cross-review thật và demo live.                                                                                  |

## Hướng dẫn mới: build Dockerfile trong MR

Với GitHub, MR tương ứng PR. Job required `container-check` trong `.github/workflows/ci.yml` thực hiện:

1. `docker build --file Dockerfile` với tag SHA; build lỗi làm job đỏ.
2. `docker compose up --no-build` dùng chính image vừa build cho migration/app và MySQL smoke.
3. Trivy scan cùng image. Không registry login/push/deploy trong job PR.

Trước đây build đã diễn ra qua `docker compose up --build`; nay tách thành step riêng để dễ kiểm tra log và tránh rebuild ở bước smoke. Giữ nguyên tên required check để branch protection tiếp tục chặn merge khi build lỗi.

Template được cung cấp có Docker build-only cho MR (`push: auto/false`). Chuyển hành vi đó sang workflow GitHub hiện có; `gitlab-ci.yml` vẫn là tài liệu nguồn và không được GitHub thực thi. Không cần duy trì thêm pipeline GitLab cho cùng repo.

Snapshot template mới cũng chứa source scan và TI blacklist. Vì vậy ghi chú cũ “chưa được cung cấp blacklist” đã lỗi thời; phần còn thiếu là đối chiếu phiên bản và tích hợp policy được duyệt. Không sao chép dữ liệu/template nội bộ vào repo public; gate severity hiện hành chưa được coi là tương đương toàn bộ policy nội bộ.
