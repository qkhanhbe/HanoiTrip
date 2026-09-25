# Kiểm chứng local — cập nhật 25/09/2026

## Phạm vi

App, container, CI security gate và Terraform static validation được kiểm chứng trên máy local. GitHub Actions/ruleset sẽ có evidence riêng sau PR; không có Azure credential/resource nên không coi local validation là deploy evidence.

## Kết quả thực tế

| Kiểm tra                                       | Kết quả                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` dưới Node 22.23.2              | PASS: format, ESLint, TypeScript, 29 test pass + 1 MySQL integration skipped theo thiết kế, Vite + backend build                        |
| MySQL integration opt-in                       | PASS: migration idempotent, create/list, SQL-like label được lưu như text, đọc qua pool mới; chỉ xóa hàng test tạo                      |
| MySQL transport                                | PASS qua service `mysql` trong Docker; PASS qua Unix socket từ host. TCP host → Docker bị WARP routing ảnh hưởng, không thay chính sách |
| Docker multi-stage build                       | PASS với distroless Node 22/Debian 13 runtime, non-root UID 65532                                                                       |
| Compose runtime                                | PASS: migration riêng hoàn tất; app/MySQL healthy; API đọc/ghi thật vào MySQL                                                           |
| Persistence                                    | Sau restart container app, favorite đã ghi vẫn được trả về (200, count 1 tại thời điểm thử)                                             |
| Host runtime                                   | `npm run start:local`: nhận socket, `/health` 200, `/version` buildSha local-dev, `/items` đọc DB thật                                  |
| `npm run smoke`                                | PASS: SPA, health/version/config, items, input lỗi, 404, demo route; không lộ server key                                                |
| Diagnostics smoke trên port 8082 riêng         | PASS: `/boom` 500, `/load?seconds=0` 400, `/load?seconds=1` 200. Process diagnostics đã dừng sau test                                   |
| Diagnostics mặc định port 8080                 | `/boom` 404: không vô tình bật endpoint lỗi trong bản để lại                                                                            |
| Browser smoke desktop 1440×1000/mobile 390×844 | PASS: tìm 3 demo route, mở chặng, lưu/mở lại từ MySQL, keyboard landmark search, không horizontal overflow hoặc page error              |
| UI render                                      | Đã xem ảnh desktop/mobile; ảnh tại `output/playwright/`, không commit                                                                   |
| Secrets                                        | `.env` mode 600, Git ignored; `.local/` ignored; Docker context whitelist không copy `.env`                                             |
| Trivy runtime image                            | PASS: 0 HIGH/CRITICAL; không dùng ignore                                                                                                |
| Terraform                                      | PASS: fmt, init `-backend=false`, validate cho bootstrap/app                                                                            |
| Security gate policy                           | PASS: 14 test trường hợp clean/warn/block/report lỗi                                                                                    |
| Source scanners thật                           | PASS WITH WARNINGS: 0 secret/Critical/High; 4 Medium + 4 Low IaC; SBOM + SARIF được tạo                                                 |

Lệnh tái lập nằm trong README và `LOCAL_SETUP.md`. Unit run có một MySQL test skipped theo mặc định; test đó đã chạy riêng với `MYSQL_TEST=1` và PASS. Không coi skipped là pass. Browser harness có ghi favorite minh họa, dữ liệu không phải khách hàng.

## Giới hạn không che giấu

- Google live chưa chạy vì chưa cấu hình keys: chỉ kiểm thử adapter bằng response giả và chế độ demo ghi rõ. Chưa xác minh coverage/10 hành trình transit Hà Nội; bản đồ Google cần kiểm tra với key khi đến bài integration.
- Địa danh gợi ý là catalog nhỏ + tọa độ/map click khi có Google; không phải geocoding toàn Hà Nội. Favorites dùng chung sandbox, chưa có auth; không mở app này ra Internet.
- TLS production được yêu cầu bằng config/code, chưa có handshake Azure thực tế. MySQL local dùng socket hoặc network Docker, không được dùng làm evidence firewall/TLS Azure.
- Image Debian slim ban đầu bị Trivy chặn; runtime đã đổi sang distroless Debian 13 và scan lại đạt. Build stage không được đưa vào runtime image.
- Semgrep ban đầu partial-parse JSX do ký tự `&`; đã escape và scan lại không còn error. TI blacklist/ruleset nội bộ vẫn thiếu nên SCA policy công khai chỉ là bản chuyển tạm thời.
- Chưa có evidence ACR, Managed Identity, Key Vault, slot swap/rollback, whitelist, Terraform rebuild hoặc Azure alerts. Xem `known-issues.md` và `evidence/`.

## Trạng thái để lại

- App host: `http://127.0.0.1:8080`, demo routing, MySQL thật, diagnostics mặc định tắt.
- MySQL container giữ volume `hanoitrip_mysql-data`; WARP vẫn bật. Không xóa volume.
- Container app đã dừng để giải phóng port cho app host; image đã build vẫn còn.
- Dừng app host bằng Ctrl+C tại terminal chạy app; khởi động lại theo README. Việc hoàn thành local không đánh dấu các milestone Azure là đã xong.
