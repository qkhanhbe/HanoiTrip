# Hanoi Trip Planner trên Azure

Web app lập hành trình giao thông công cộng tại Hà Nội, giao diện lấy cảm hứng từ Opal. Stack dự kiến: React + TypeScript, Node.js + TypeScript, MySQL, một Docker image trên Azure App Service với staging slot.

## Trạng thái hiện tại

Có masterplan, sơ đồ và workflow **source scan trên GitHub Actions**. Chưa có app/Dockerfile/Terraform hoặc CD Azure chạy thật. Kết quả scan sạch khi chưa có app không được coi là evidence hoàn thành bài thực tập.

- [Masterplan duy nhất](MASTERPLAN_HANOI_TRIP_PLANNER.md)
- [CI GitHub: policy, cách chạy và phần chưa chuyển tương đương](docs/CI_GITHUB.md)
- [Sơ đồ tổng quan](docs/hanoitrip-azure-flow.png) · [bản Excalidraw](docs/hanoitrip-azure-flow.excalidraw)
- [Workflow source scan](.github/workflows/source-scan.yml)

## CI mới trên GitHub

PR vào `main` chạy song song Gitleaks, Trivy dependency/SBOM, Trivy IaC/Dockerfile và Semgrep SAST. Job `source-security-gate` tổng hợp report:

| Kết quả | Gate |
|---|---|
| Có secret hoặc HIGH/CRITICAL | Fail; chặn merge khi required check được cấu hình |
| Chỉ MEDIUM/LOW | Pass, có warning annotation và Summary |
| Không có finding | Pass |
| Scanner lỗi, report thiếu/hỏng hoặc severity chưa biết | Fail; không coi scan chưa hoàn tất là sạch |

Policy dependency HIGH/CRITICAL là phương án tạm thời: template gốc nhắc tới **TI blacklist nội bộ**, chưa có nội dung để chuyển tương đương. Xem chi tiết trong [CI GitHub](docs/CI_GITHUB.md).

Source scan chỉ chạy trên PR. CD Azure sẽ là workflow riêng chạy khi push vào `main`, sau khi app và hạ tầng sẵn sàng.

## Kiểm tra local

Yêu cầu Python 3 để kiểm tra policy:

```bash
python3 -m unittest discover -s tests/ci -v
```

Chạy scanner cần Docker Linux/amd64, Git checkout đầy đủ lịch sử và truy cập được registry/rules/database công khai:

```bash
scan_reports=$(mktemp -d)
bash scripts/ci/scan-source.sh gitleaks-scan "$scan_reports"
bash scripts/ci/scan-source.sh trivy-source-sbom "$scan_reports"
bash scripts/ci/scan-source.sh trivy-misconfig "$scan_reports"
bash scripts/ci/scan-source.sh semgrep-sast "$scan_reports"
python3 scripts/ci/security_gate.py --reports "$scan_reports"
```

Nếu một scanner lỗi, phải xử lý và chạy lại; không dùng report cũ để kết luận scan đã thành công. Workflow GitHub còn kiểm tra trạng thái của đủ bốn job.

## Đưa lên GitHub

Sau khi tạo repo bài làm và push các file, mở PR vào `main`. Trong ruleset bảo vệ `main`, yêu cầu PR và chọn check `source-security-gate`; kiểm tra bằng PR đỏ thật. Việc này cần làm trên repo GitHub, chưa được cấu hình bởi các file local.

Quy tắc AI-OFF/khai báo AI trong PR thực hiện theo lịch người giao bài, như masterplan. Mẫu PR có phần khai báo AI và kết quả kiểm chứng.

## Tài liệu gốc để đối chiếu

- [Hướng dẫn source scan GitLab được cung cấp](README%20%281%29.md)
- [Pipeline GitLab được cung cấp](gitlab-ci.yml)
- [README GitLab mặc định trước khi chuyển](docs/reference/gitlab-template-README.md)

Các file gốc là nguồn tham khảo. GitHub chạy file trong `.github/workflows/`; các gợi ý Kubernetes/AWS của README GitLab mặc định không phải yêu cầu bổ sung cho HanoiTrip.
