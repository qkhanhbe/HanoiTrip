# HanoiTrip

Web app lập hành trình giao thông công cộng tại Hà Nội: React/TypeScript, Node/TypeScript, MySQL; giao diện gọn lấy cảm hứng từ Opal. Một Docker image phục vụ cả frontend và API.

Repo hiện có app local, CI/source-security workflow, CD disabled-by-default và Terraform cho Azure. App/CI local đã kiểm chứng; các mốc Azure chỉ được coi là đạt sau khi có resource và evidence thật trong `evidence/`.

## Chạy trên máy hiện tại (Ubuntu, giữ WARP bật)

Máy có Node 18; lệnh dưới dùng Node 22 qua npm, không thay Node hệ thống.

```bash
cd /home/tts/tts/HanoiTrip
node scripts/setup-local.mjs
docker compose -f compose.yml -f compose.socket.yml up -d --wait mysql
npx --yes --package=node@22 --call 'npm ci && npm run build'
MYSQL_SOCKET_PATH="$PWD/.local/mysql-run/mysqld.sock" npx --yes --package=node@22 --call 'npm run migrate'
npx --yes --package=node@22 --call 'npm run start:local'
```

Mở **http://127.0.0.1:8080**. `Ctrl+C` dừng app; MySQL vẫn giữ dữ liệu. Nếu container app đang chiếm port 8080, chạy `docker compose stop app` trước.

`start:local` tự nhận Unix socket nếu tồn tại: kết nối có mật khẩu giữa hai tiến trình trên cùng máy qua file socket, không tắt/đổi WARP. Máy khác có Node 22 và TCP Docker bình thường có thể dùng `npm ci`, `docker compose up -d --wait mysql`, `npm run migrate`, `npm run build`, `npm start`.

Vào MySQL không phải gõ lại mật khẩu local:

```bash
npm run db:shell
```

Khi thấy `mysql>`:

```sql
SHOW TABLES;
SELECT id, label, created_at FROM items ORDER BY created_at DESC LIMIT 5;
exit;
```

Chi tiết Docker, tắt/bật DB và network: [LOCAL_SETUP.md](docs/LOCAL_SETUP.md). Không commit hoặc gửi `.env` cho người khác. Không dùng `docker compose down -v` nếu cần giữ dữ liệu.

## Dùng thử

1. Chọn điểm đi/đến từ gợi ý, hoặc nhập `vĩ độ, kinh độ`.
2. Chọn Đi ngay/Chọn giờ rồi **Tìm hành trình**.
3. Chọn phương án để đổi route trên map, mở **Chi tiết hành trình**.
4. **Lưu**, mở tab **Đã lưu** rồi chọn lại để tìm lịch trình mới.

Mặc định dùng **bản đồ Hà Nội thật từ OpenFreeMap/OpenStreetMap**, hiển thị bằng MapLibre, không cần API key. Có kéo, zoom, chọn điểm đi/đến trên map và nút về trung tâm Hà Nội. Bản đồ tải trực tiếp từ `https://tiles.openfreemap.org`; cần Internet và WebGL. Giữ attribution hiển thị trên map; nếu tải lỗi, dùng nút thử lại, không tắt WARP.

**Tuyến và thời gian vẫn là dữ liệu minh họa**, không phải lịch trình để đi thực tế. Đường demo vẽ nét đứt, không bảo đảm bám đường phố. Favorites dùng chung trong sandbox; không có tài khoản cá nhân. Gợi ý địa danh là danh sách giới hạn, không phải Google Places autocomplete. Chọn tọa độ trên bản đồ không tự tra tên địa chỉ.

Adapter Google Routes và Google Maps đã có code; **chưa kiểm chứng live vì chưa cấu hình key**. Khi học đến integration, dùng `ROUTES_MODE=google`, server Routes key và browser Maps key riêng. Google mode không tự đổi sang dữ liệu giả khi provider lỗi. Browser key phải giới hạn domain/API; server key không gửi xuống browser.

## API local

| Endpoint                       | Hành vi                                                 |
| ------------------------------ | ------------------------------------------------------- |
| `GET /health`                  | 200 khi DB/bảng items truy cập được, 503 khi DB lỗi     |
| `GET /version`                 | buildSha, version, environment; không trả secret        |
| `GET /items?limit=30&offset=0` | Liệt kê favorites; limit tối đa 100                     |
| `POST /items`                  | Lưu label + điểm đi/đến, server tạo UUID, trả 201       |
| `POST /routes`                 | Validate A/B/thời gian, chuẩn hóa route provider        |
| `GET /boom`                    | Ném exception, trả 500 + request ID khi diagnostics bật |
| `GET /load?seconds=1`          | CPU worker 1–5 giây, một lượt đồng thời, rate limit     |
| `GET /config`                  | Chế độ route/storage + browser Maps key công khai       |

`/boom` và `/load` mặc định tắt (404). Chỉ bật `DIAGNOSTICS_ENABLED=true` khi học/test local hoặc sandbox được bảo vệ. Dùng app đã build để chạy CPU worker. JSON logs có requestId, buildSha, statusCode, durationMs; không ghi body/password. Migration là lệnh riêng, không tự chạy mỗi lần web server khởi động.

## Kiểm chứng local

```bash
npx --yes --package=node@22 --call 'npm run check'
MYSQL_TEST=1 MYSQL_SOCKET_PATH="$PWD/.local/mysql-run/mysqld.sock" npx --yes --package=node@22 --call 'node --env-file=.env node_modules/vitest/vitest.mjs run tests/app/mysql.integration.test.ts'
npx --yes --package=node@22 --call 'npm run smoke'
```

`check` gồm format, lint, typecheck, unit/API/UI tests và build. MySQL integration là opt-in riêng; skipped không tính là pass. Test DB chỉ xóa các hàng do chính nó tạo. `test:browser` kiểm tra desktop/mobile, tải map thật, pan/zoom/chọn điểm; cần Chromium hỗ trợ WebGL, Internet và ghi một favorite minh họa. Unit/UI tests mock phần WebGL, không gọi dịch vụ bản đồ. [Kết quả kiểm chứng](docs/LOCAL_VALIDATION.md).

## GitHub flow và Azure

- Tạo nhánh `feat/`, `fix/` hoặc `chore/`, mở PR vào `main`; PR chạy app tests, Terraform fmt/validate, Docker/MySQL smoke, image scan và bốn source scanner.
- `source-security-gate` chặn secret, HIGH/CRITICAL, report thiếu/hỏng hoặc scanner lỗi; MEDIUM/LOW tạo warning.
- Sau squash merge, CD chỉ báo `pending` cho tới khi `AZURE_CD_ENABLED=true` và OIDC/repository variables/environment đã được cấu hình. Không dùng client secret.
- Terraform tách `bootstrap/` (remote state) và `app/` (workload). Xem [terraform/README.md](terraform/README.md) và [CI_GITHUB.md](docs/CI_GITHUB.md).
- Teardown workload bằng `terraform -chdir=terraform/app destroy`; chỉ xóa backend sau khi state không còn cần. Không commit state, plan binary, `.env`, `tfvars`, backend config hoặc IP thật.

## Tài liệu

- [Masterplan duy nhất](MASTERPLAN_HANOI_TRIP_PLANNER.md).
- [AGENT.MD](AGENT.MD): yêu cầu, harness, validation và ranh giới công việc.
- [Kiến trúc traffic/auth/release](architecture.md) và [sơ đồ Excalidraw](docs/hanoitrip-azure-flow.png).
- [CI/CD GitHub](docs/CI_GITHUB.md), [runbook](runbook.md), [known issues](known-issues.md) và [evidence index](evidence/README.md).
- Nguồn GitLab: [README (1)](README%20%281%29.md), [gitlab-ci.yml](gitlab-ci.yml), [README template](docs/reference/gitlab-template-README.md).

App local hoặc workflow xanh không tự động chứng minh Azure. Google live, ACR/MI/Key Vault, slot swap, Terraform rebuild và monitoring vẫn phải có evidence thật trước khi đánh dấu hoàn thành.
