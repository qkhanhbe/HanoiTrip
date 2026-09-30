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

```bash
BASE_URL=https://<staging-host> EXPECTED_SHA=<git-sha> SMOKE_ROAD=1 npm run smoke
```

Gate tìm và resolve hai địa điểm Hà Nội rồi yêu cầu cả route `car` và `motorcycle`,
kiểm tra distance, duration và LineString có geometry. GitHub CD chỉ chạy gate này
khi `AZURE_RELEASE_REQUIRE_ROAD_PROVIDER=true`; production swap còn có cờ độc lập
`AZURE_PRODUCTION_SWAP_ENABLED`.

Trước khi đưa PR release B về trạng thái ready, chạy benchmark có giới hạn trên
staging. Lệnh này thực hiện đúng 40 provider request: search + resolve 10 địa danh,
sau đó kiểm tra 10 cặp A–B cho cả `car` và `motorcycle`. Delay mặc định 4,1 giây
giữ route requests dưới rate limit của app. Kiểm tra quota/cost trước rồi mới xác nhận:

```bash
mkdir -p output
BASE_URL=https://<staging-host> \
EXPECTED_SHA=<git-sha> \
ROAD_BENCHMARK_CONFIRM=40 \
npm run benchmark:road > output/road-benchmark.json
```

File trong `output/` chỉ là evidence local đang bị Git ignore. Review latency,
distance, duration, số điểm geometry và snap distance; sau khi redact mới chép phần
cần thiết vào evidence được track. Script không nhận hoặc in API key/provider token.

## Kết quả gần nhất

30/09/2026, nhánh `feat/real-hanoi-routing`, Node 22.23.2: `npm run check`
pass (40 tests thường, 1 MySQL integration skip trong suite mặc định), 17 policy
tests pass và MySQL integration opt-in pass. Browser thật xác nhận trạng thái
provider-disabled, transit demo, MapLibre và build/provider metadata; không có console
error. Image distroless build thành công bằng `docker build --network=host`, container
user `65532:65532` pass HTTP/MySQL write smoke qua socket. Một row smoke do lượt test
tạo đã được xóa. Trivy local và GitHub `container-check` đều pass với 0
HIGH/CRITICAL sau exception có hạn đã ghi nhận. VIETMAP live test và staging release
chưa chạy vì chưa có dev key/provider quota evidence.

29/09/2026, worktree GitHub riêng trên nhánh `chore/github-ci-flow`, Node 22.23.2:
`npm ci` qua public registry cài 329 package; `npm run check` pass (29 tests,
1 MySQL integration skipped), 14 Python policy tests pass, YAML/shell/diff checks
pass. Build có cảnh báo chunk bản đồ lớn. Chưa chạy MySQL thật, browser, Docker
build/image scan hoặc remote GitHub CI trong lượt này. Không dùng kết quả local
này thay cho các evidence cloud bên dưới.

Ngày 28/09/2026, dưới Node 22.23.2: clean install với `--engine-strict`, toàn bộ `npm run check` (29 test thường), 14 policy tests, 1 MySQL integration test, migration và HTTP smoke ghi/đọc dữ liệu đều pass local. Database tạm đã được dừng sau kiểm thử.

Docker build của thay đổi CI hiện tại chưa xác nhận: lần thử local bị hủy khi chờ `npm ci`. GitLab runner, Terraform plan và release Azure cần kết quả riêng. Xem [CI GitLab](ci-gitlab.md) và [CI GitHub](ci-github.md) để biết phạm vi từng pipeline.
