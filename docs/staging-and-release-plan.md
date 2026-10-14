# Staging VIETMAP và phát hành blue-green

Ngày cập nhật: 2026-10-14. Đây là kế hoạch triển khai, không phải chứng nhận các bước đã hoàn thành.

## Mục tiêu và giới hạn

- Production đích phải phục vụ **OpenFreeMap đã refine UI, màu map và mức chi tiết theo zoom qua các bước trước**. Người dùng xác nhận đây không phải image production hiện tại.
- Staging dùng VIETMAP để tiếp tục cải tiến; chỉ promote sau khi kiểm tra đạt.
- GitHub chạy CI/CD, build image và deploy Azure. GitLab chỉ CI/review nội bộ.
- Người vận hành tự thực hành swap trên Azure Portal. Push/merge thông thường không được tự swap.
- Không đưa pipeline nội bộ, hostname công ty, template, runner tags, báo cáo hay ảnh nội bộ lên GitHub. Hai remote dùng lịch sử riêng; chuyển patch được chọn, không mirror.

## Phát hiện đã xác minh

- Azure báo cả hai slot Running. App settings production có BUILD_SHA `42d24aa22897aa0067d2c8fbaf703840d76e3652`; staging có `a13ec63299ec55e96b35cf2b86eb6a9a28262545`. Đây là metadata, chưa phải bằng chứng runtime: HTTP từ máy hiện tại bị Access Restrictions chặn 403.
- Các chỉnh sửa màu, độ chi tiết theo zoom và traffic mới vẫn còn trong working tree, khác bản production trên. Vì vậy **giữ image production hiện tại không đồng nghĩa đã có toàn bộ bản refine mới**.
- Tilemap key riêng mới đã pass local config/style/tile thật/sprite; browser render VIETMAP không có console error. Key vẫn chỉ nằm trong cấu hình local, chưa xác minh Key Vault/staging.
- GitHub đã có app, browser, Terraform, container, secret/SAST/SCA/misconfiguration scans và security gate. Ưu tiên chất lượng check và bằng chứng, không thêm job chỉ để tăng số lượng.
- Đã đọc source CI tham khảo qua Git với quyền hiện có, trong thư mục tạm ngoài repo. Tham khảo cách chia scan/test/check/report, JUnit/coverage và kiểm tra cấu hình; không sao chép template, địa chỉ hoặc metadata nội bộ. Browser riêng chưa đăng nhập. GitHub đã kết nối/fetch lại được, nhưng repo tham khảo trả 404 với tài khoản hiện có nên chưa đọc được workflow đó.

## Phần đã triển khai local

- CI tách log format/lint/typecheck/test/build, xuất JUnit; thêm JSON/Bash syntax/Compose checks.
- CD chạy app checks và browser road smoke trên đúng SHA; gọi lại source security workflow cùng commit trước job deploy, không truyền cloud secrets cho scans.
- Staging chọn basemap bằng biến cấu hình; VIETMAP yêu cầu Tilemap secret reference và kiểm tra tile thực ngoài style/config/sprite.
- Push main không swap. Workflow swap cần manual dispatch + `promote=true` + cờ cho phép; Portal manual swap có runbook riêng.
- Local đã pass lint/typecheck/build, 56 test app/UI (1 MySQL integration bị skip), 41 test policy và browser road smoke desktop/mobile bằng Node 22 + Chromium trên máy. Smoke dùng provider fixture, kiểm tra 3 mức traffic, timestamp và fallback thiếu dữ liệu; không chứng minh độ chính xác traffic ngoài thực tế. Chưa phải kết quả CI remote, cloud rollout hay scanner thực tế.
- Chưa commit/push/deploy các thay đổi này. Đã thêm coverage gate toàn bộ app, ShellCheck và actionlint cho workflow GitHub; chạy local đạt. Coverage baseline: lines 63.73%, statements 61.98%, functions 63.06%, branches 59.91%; ngưỡng chống tụt tương ứng 63/61/63/59, không loại file chưa được import khỏi phép đo. Browser coverage chưa được gộp vào báo cáo này.
- CI GitLab được sửa trong worktree riêng: app format/lint/typecheck/test/build + JUnit, JSON/Bash syntax và thiếu scan report phải fail. Chưa chạy trên runner hoặc push MR; không có deploy/cloud job.
- Đã có ảnh local baseline OpenFreeMap refine desktop/mobile trong `output/playwright/openfreemap-refined-*.png`; còn cần duyệt ảnh và xác minh release từ image.

## Thứ tự thực hiện

### 1. Chốt hai bản để so sánh

- [x] Đọc working tree, pipeline hiện có và metadata hai slot.
- [ ] Xác minh runtime SHA/image digest của production và staging qua mạng được phép.
- [ ] Tạo bản OpenFreeMap đã refine từ patch app được chọn; giữ cấu hình OpenFreeMap và chụp desktop/mobile.
- [ ] Gắn nhãn release baseline sau CI; không tự gọi production hiện tại là baseline đã refine.
- [ ] Đưa baseline OpenFreeMap đã refine qua staging để người dùng kiểm tra và tự swap lên production; đây là bước bắt buộc theo xác nhận của người dùng.
- [ ] Sau baseline, deploy candidate VIETMAP lên staging; production vẫn giữ baseline OpenFreeMap.

**Điểm dừng phát hành:** không ghi đè staging bằng VIETMAP trong lúc baseline OpenFreeMap còn chờ người dùng swap. Có thể hoàn thiện và kiểm thử candidate VIETMAP local song song; chỉ deploy candidate sau khi xác minh baseline đã được promote.

### 2. Hoàn thiện VIETMAP staging

- [ ] Đặt Tilemap key hợp lệ trong Key Vault bằng file/secure input; không ghi key vào Git hoặc log.
- [ ] Cấu hình staging `BASEMAP_PROVIDER=vietmap` và `VIETMAP_TILEMAP_API_KEY` bằng Key Vault reference; giữ services key riêng.
- [ ] Build/scan image immutable, deploy staging đúng SHA, warm-up và kiểm tra health/database.
- [ ] Kiểm tra config, style, tile thực, sprite, font và browser render; style 200 riêng lẻ không đủ.
- [ ] Kiểm tra search/route ô tô, xe máy; desktop/mobile; traffic 3 màu và trạng thái thiếu dữ liệu.
- [ ] Báo cáo SHA/digest, kết quả, ảnh không chứa secret; đánh dấu candidate ready.

### 3. CI có ý nghĩa ở từng nền tảng

| Nhóm | Việc cần bổ sung/kiểm tra | Tiêu chí đạt |
| --- | --- | --- |
| Code | Format, lint, TypeScript, unit/API/UI; tách log dễ đọc | Fail thực sự khi lỗi, job bắt buộc không bị skip |
| Tests | JUnit và coverage; đo baseline rồi đặt ngưỡng hợp lý | Artifact đọc được, không đặt ngưỡng tùy ý để pipeline xanh |
| Runtime | Browser, MySQL integration, Docker/API smoke | Chạy image vừa build; mock ở PR, live có giới hạn ở staging |
| Config | ShellCheck, YAML/JSON, Compose và Terraform validate | Kiểm tra đúng file dự án, không yêu cầu cloud credentials ở PR |
| Security | Giữ Gitleaks, Semgrep, Trivy source/image/IaC, SBOM | Thiếu report hoặc scanner lỗi phải fail; không giảm policy hiện có |
| Release | CI của đúng commit, immutable image, preflight, staging verify | Không deploy từ check của SHA khác; xuất release evidence |
| Privacy | Rà patch và lịch sử reachable, metadata commit, artifacts | Không đưa dữ liệu tổ chức hoặc config nội bộ sang remote công khai |

GitLab thực hiện các check phù hợp runner/template được cấp, không Azure login, ACR push, deploy hay swap. Không tự bổ sung SonarQube khi chưa có instance và quyền được cấp. Tham khảo pipeline khác về cấu trúc, không sao chép nội dung nội bộ sang GitHub.

### 4. CD và buổi thực hành swap

- [ ] Tách các pha hiển thị rõ: preflight → build/scan → deploy staging → verify → ready for manual promotion.
- [x] Thêm app/browser và source-security gates cho đúng source SHA trước build/deploy, kể cả manual dispatch (chưa xác minh chạy remote).
- [ ] Ghi image digest/SHA hai slot trước swap; khóa deploy mới trong buổi thực hành.
- [ ] Thiết lập warm-up `/health` và chỉ chấp nhận HTTP 200; kiểm tra cấu hình DB tương thích hai bản.
- [ ] Chạy quan sát production trước/trong/sau swap; người dùng thao tác Portal theo runbook.
- [ ] Xác minh SHA, basemap, API, DB và UI sau swap; lưu số mẫu HTTP/thời gian quan sát, không suy rộng thành SLA tuyệt đối.
- [ ] Giữ nguyên image cũ ở staging trong cửa sổ rollback; không deploy đè slot ngay sau promote.

## Deploy khác swap ở đâu?

`build image → deploy staging → kiểm thử → người dùng swap → verify production`

Deploy staging thay image tại staging, chưa chuyển người dùng production sang bản mới. Swap chuyển bản đã warm-up sang production; bản production trước đó chuyển về staging. Staging là một slot, không phải nơi luôn luôn chứa bản mới nhất sau swap.

`AZURE_PRODUCTION_SWAP_ENABLED` là cờ trong workflow của repo, không phải công tắc bật/tắt kiến trúc blue-green của Azure. Portal swap thủ công không phụ thuộc cờ này. Giữ cờ false trong giai đoạn thử nghiệm vẫn cho phép deploy staging và swap thủ công.

`BASEMAP_PROVIDER` là cấu hình tính năng đi cùng release: nếu mục tiêu promote VIETMAP lên production, không giữ nó sticky theo slot. `BUILD_SHA` cũng phải đi cùng image. Với secret/DB gắn cố định theo môi trường, xác minh target có quyền/key cần thiết; không đổi tính sticky theo suy đoán. Nếu cố định production=openfreemap và staging=vietmap, swap code sẽ không promote lựa chọn bản đồ.

Tài liệu chính thức: [Azure deployment slots](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots).

Hướng dẫn thực hành: [Manual slot swap](manual-slot-swap.md).
