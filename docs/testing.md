# Kiểm thử

Chạy tại thư mục gốc repo trên Linux/POSIX shell, Node 22.23.2:

```bash
npm ci --engine-strict
npm run check
python3 -m unittest discover -s tests/ci -v
```

`check` gồm format, lint, typecheck, unit/API/UI tests và build. Unit tests dùng repository trong bộ nhớ và mock dịch vụ bên ngoài. Test MySQL bị skip trong lượt chạy mặc định; cần chạy riêng để xác nhận persistence.

## MySQL thật

Khởi tạo database local theo [local setup](local-development.md), rồi chạy test bằng cấu hình trong `.env`:

```bash
MYSQL_TEST=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/app/mysql.integration.test.ts
```

Nếu host phải dùng Unix socket:

```bash
MYSQL_TEST=1 MYSQL_SOCKET_PATH="$PWD/.local/mysql-run/mysqld.sock" node --env-file=.env node_modules/vitest/vitest.mjs run tests/app/mysql.integration.test.ts
```

Test chạy migration idempotent, ghi chuỗi giống SQL như dữ liệu thường và đọc lại qua pool mới. Chỉ xóa các hàng do chính test tạo; luôn dùng DB test/local.

## HTTP và browser smoke

Sau khi migration và app local đã chạy:

```bash
npm run smoke
SMOKE_WRITE=1 npm run smoke
```

Lệnh thứ hai ghi một favorite giả để kiểm tra đọc/ghi. Chỉ chạy với DB dành cho thử nghiệm. `BASE_URL` mặc định là `http://127.0.0.1:8080`; `EXPECTED_SHA` có thể dùng để kiểm tra đúng bản build.

`npm run test:browser` kiểm tra desktop/mobile, bản đồ và thao tác favorite; cần Chromium/WebGL và Internet. Unit UI tests không thay thế bước kiểm tra bản đồ thật.

Sau khi build, `npm run test:browser:road` khởi động một BFF tạm với upstream
VIETMAP giả lập, rồi dùng Chromium đi xuyên suốt search → signed resolve → route ô tô
và xe máy. Test xác nhận geometry, attribution, responsive UI và API key không xuất
hiện ở public config/DOM. Nó không gọi VIETMAP thật, không tiêu quota và không thay
thế benchmark staging; GitHub PR chạy test này trong job `browser-road-check`.

Khi staging đã cấu hình `ROAD_PROVIDER=vietmap`, chạy gate provider thật mà không
truyền API key ra runner/browser:

Nhập key Search/Place/Route một lần bằng prompt ẩn; lệnh dùng file tạm quyền hạn
chế nên key không nằm trong shell history hoặc tham số tiến trình. Nó chỉ cập nhật
`.env` bị Git ignore và secret `vietmap-api-key`, không bật provider hoặc restart app:

```bash
bash scripts/release/configure-vietmap-key.sh <key-vault-name>
```

Sau khi xác nhận secret/reference và quota, mới cấu hình riêng staging với
`ROAD_PROVIDER=vietmap`, rồi chạy gate:

```bash
BASE_URL=https://<staging-host> EXPECTED_SHA=<git-sha> SMOKE_ROAD=1 npm run smoke
```

Gate tìm và resolve hai địa điểm Hà Nội rồi yêu cầu cả route `car` và `motorcycle`,
kiểm tra distance, duration và LineString có geometry. GitHub CD chỉ chạy gate này
khi `AZURE_RELEASE_REQUIRE_ROAD_PROVIDER=true`; production swap còn có cờ độc lập
`AZURE_PRODUCTION_SWAP_ENABLED`.

Browser gate provider thật dùng đúng 6 request (2 search, 2 resolve, 2 route), xác
nhận UI desktop/mobile, attribution và cả hai mode. Nó bắt buộc build SHA để tránh
kiểm tra nhầm release:

```bash
BASE_URL=https://<staging-host> \
EXPECTED_SHA=<git-sha> \
LIVE_ROAD_CONFIRM=6 \
npm run test:browser:road:live
```

Trước khi đưa PR release B về trạng thái ready, chạy benchmark có giới hạn trên
staging. Lệnh này thực hiện đúng 40 provider request: search + resolve 10 địa danh,
sau đó kiểm tra 10 cặp A–B cho cả `car` và `motorcycle`. Delay mặc định 4,1 giây
giữ route requests dưới rate limit của app. Kiểm tra quota/cost trước rồi mới xác nhận:

```bash
mkdir -p output
BASE_URL=https://<staging-host> \
EXPECTED_SHA=<git-sha> \
ROAD_BENCHMARK_CONFIRM=40 \
npm run --silent benchmark:road > output/road-benchmark.json
```

File trong `output/` chỉ là evidence local đang bị Git ignore. Review latency,
distance, duration, số điểm geometry và snap distance; sau khi redact mới chép phần
cần thiết vào evidence được track. Script không nhận hoặc in API key/provider token.

## Kết quả gần nhất

08/10/2026, nhánh `docs/complete-must-evidence`, Node 22.23.2: 41 app/UI
tests pass (1 MySQL integration opt-in skip trong suite mặc định), production
build pass và 35 policy tests pass. Terraform bootstrap/app fmt + validate pass.
Runtime chuyển sang Node 22 Alpine, `apk upgrade`, bỏ npm/corepack và chạy bằng
UID 1000. Container migration + MySQL CRUD + SPA/API/diagnostics smoke pass.
Trivy DB cùng ngày quét mọi severity
`UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL` không ignore và trả `0` finding.
Docker bridge từ host bị WARP reset nên smoke được chạy bên trong app container;
healthcheck nội bộ vẫn healthy và compose đã cleanup bằng `trap`.

30/09/2026, release staging SHA `21b756c59686b58760afaddf9695fa63b70e8838`:
[GitHub CD run 36688199042](https://github.com/qkhanhbe/HanoiTrip/actions/runs/36688199042)
đã build/scan/push image bất biến, migrate và warm staging thành công; production swap
được skip theo gate. `/version`, `/health` và road smoke pass. Browser provider thật
pass search/resolve, route ô tô + xe máy, attribution, desktop/mobile và không lộ key.
Benchmark staging pass 10 địa danh, 20 route bằng đúng 40 request (search p95 930,40
ms; route p95 1.261,89 ms; geometry 70–335 điểm). Production vẫn chạy image A và
không còn access rule tạm sau job. M2/M10 chưa hoàn thành vì chưa chạy production
observer/swap và rollback rehearsal.

30/09/2026, nhánh `feat/real-hanoi-routing`, Node 22.23.2: `npm run check`
pass (40 tests thường, 1 MySQL integration skip trong suite mặc định), 20 policy
tests pass và MySQL integration opt-in pass. Browser contract và browser provider
thật đều pass search → signed resolve → car/motorcycle route, attribution và
desktop/mobile. Local live smoke pass; benchmark giới hạn pass 10 địa danh, 20 route
và đúng 40 provider request (search p95 886,36 ms; route p95 770,82 ms; geometry
70–335 điểm). Evidence local nằm trong `output/` bị Git ignore; chưa thay thế gate
staging. Image distroless build thành công bằng `docker build --network=host`,
container user `65532:65532` pass HTTP/MySQL write smoke qua socket. Một row smoke do
lượt test tạo đã được xóa. Trivy local và GitHub `container-check` đều pass với 0
HIGH/CRITICAL sau exception có hạn đã ghi nhận. Kết quả này là gate local trước khi
staging run ở đoạn trên, không phải bằng chứng production swap.

29/09/2026, worktree GitHub riêng trên nhánh `chore/github-ci-flow`, Node 22.23.2:
`npm ci` qua public registry cài 329 package; `npm run check` pass (29 tests,
1 MySQL integration skipped), 14 Python policy tests pass, YAML/shell/diff checks
pass. Build có cảnh báo chunk bản đồ lớn. Chưa chạy MySQL thật, browser, Docker
build/image scan hoặc remote GitHub CI trong lượt này. Không dùng kết quả local
này thay cho các evidence cloud bên dưới.

Ngày 28/09/2026, dưới Node 22.23.2: clean install với `--engine-strict`, toàn bộ `npm run check` (29 test thường), 14 policy tests, 1 MySQL integration test, migration và HTTP smoke ghi/đọc dữ liệu đều pass local. Database tạm đã được dừng sau kiểm thử.

Docker build của thay đổi CI hiện tại chưa xác nhận: lần thử local bị hủy khi chờ `npm ci`. GitLab runner, Terraform plan và release Azure cần kết quả riêng. Xem [CI GitLab](ci-gitlab.md) và [CI GitHub](ci-github.md) để biết phạm vi từng pipeline.
