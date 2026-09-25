# Công cụ local

Docker Engine và Compose đã có trên máy Ubuntu; không cài lại hoặc thay cấu hình daemon. MySQL chạy bằng Docker, không phải service MySQL cài trực tiếp lên Ubuntu. Terraform CLI cài trong `/home/tts/.local/bin/terraform` từ bản phát hành HashiCorp, có kiểm tra chữ ký/checksum.

## MySQL cho HanoiTrip

Từ thư mục repo:

```bash
node scripts/setup-local.mjs
docker compose -f compose.yml -f compose.socket.yml up -d --wait mysql
docker compose ps
```

Script tạo `.env` với mật khẩu ngẫu nhiên, quyền đọc/ghi chỉ cho tài khoản hiện tại; không ghi đè file có sẵn. `.env` được Git bỏ qua. Không gửi nội dung file này vào chat hoặc commit. Mật khẩu root chỉ phục vụ quản trị DB local; app dùng tài khoản `hanoitrip` riêng.

- Host: `127.0.0.1`, port: `3306`.
- Database/user: `hanoitrip`; mật khẩu ở `.env`.
- Chỉ mở cổng loopback, không mở ra LAN/Internet.
- Dữ liệu nằm trong Docker volume `hanoitrip_mysql-data`, giữ lại khi restart hoặc `docker compose down`.
- **Không chạy `docker compose down -v` nếu cần giữ dữ liệu**: tùy chọn này xóa volume.
- TLS tắt cho DB local loopback; Azure production phải dùng TLS được xác thực.

Mở MySQL CLI dễ nhất: `npm run db:shell` (dùng credential đã có trong container, không in ra). Cách nhập mật khẩu thủ công:

```bash
docker compose exec mysql mysql -u hanoitrip -p hanoitrip
```

Chưa cài `mysql` CLI trực tiếp trên host; dùng CLI có sẵn trong container. TCP `127.0.0.1:3306` hiện bị ảnh hưởng bởi route WARP, không nên coi là đã hoạt động. Với app trên host, `npm run start:local` nhận socket `.local/mysql-run/mysqld.sock` để kết nối local có mật khẩu, không cần đổi WARP. Overlay `compose.socket.yml` chỉ dùng trên Linux. `.local/` không được commit; MySQL có thể đổi owner thư mục socket để daemon dùng được.

```bash
docker compose stop mysql       # tắt, giữ dữ liệu
docker compose start mysql      # bật lại
terraform version
docker version
docker compose version
```

Thay mật khẩu trong `.env` không tự thay mật khẩu đã lưu trong volume MySQL; phải đổi bằng SQL có quyền thích hợp. Không xóa volume để sửa lỗi mật khẩu nếu có dữ liệu cần giữ.

Nguồn: [HashiCorp Terraform](https://developer.hashicorp.com/terraform/install), [MySQL official image](https://hub.docker.com/_/mysql).

## Kết quả kiểm tra 24/09/2026

- Docker Engine `29.8.1`, Compose `5.5.1`: đã có sẵn, daemon hoạt động.
- Terraform `1.16.4`: đã cài vào tài khoản `tts`, xác thực chữ ký HashiCorp và SHA256 trước khi chạy.
- MySQL `8.4.11`: container healthy; `SELECT VERSION(), DATABASE()` trong container thành công với user app, database `hanoitrip`. Image được pin digest trong Compose.
- **Host → DB chưa hoạt động:** TCP `127.0.0.1:3306` bị đóng trước greeting; migration từ host thất bại `PROTOCOL_CONNECTION_LOST`. `ip route get 172.18.0.2` cho thấy route qua `CloudflareWARP table 65743`, thay vì bridge Docker. Chưa thay đổi chính sách WARP, firewall hay route của máy.
- App trong Docker dùng hostname `mysql`: đã kết nối, chạy migration, ghi/đọc favorite và giữ dữ liệu khi restart app thành công.
- Host dùng Unix socket: migration đã thành công, không thay đổi WARP. Bảng `items` đã có; không xóa dữ liệu người dùng.

## Build Docker local khi bridge không tải được npm

Đã kiểm chứng host tải npm qua chính mạng/WARP hiện có, trong khi bridge timeout. Có thể build qua mạng host (chỉ bước build), không đổi route/firewall:

```bash
docker build --network=host --build-arg BUILD_SHA=local-dev -t hanoitrip:local-dev .
docker compose -f compose.yml -f compose.socket.yml up -d --wait --no-build
```

Browser host vẫn có thể gặp vấn đề TCP vào container app. Cách chạy giao diện hiện tại là app trên host + MySQL Unix socket theo README. Không tắt WARP. Không triển khai Azure hoặc CI/CD trong bước này.

## Browser harness

Trên máy hiện tại Chromium đã có sẵn:

```bash
CHROMIUM_PATH=/home/tts/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npx --yes --package=node@22 --call 'npm run test:browser'
```

Ảnh desktop/mobile nằm trong `output/playwright/` (không commit). Harness ghi một favorite minh họa để kiểm tra save/reopen; không dùng DB thật của công ty.
