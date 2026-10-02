# HanoiTrip

HanoiTrip là ứng dụng web lập hành trình dành cho Hà Nội. Người dùng có thể tìm địa điểm, chọn điểm đi và điểm đến trực tiếp trên bản đồ, so sánh các phương án di chuyển và lưu lại hành trình thường dùng.

## Trải nghiệm hiện tại

- Tìm kiếm và chuẩn hóa địa điểm trong khu vực Hà Nội.
- Chỉ đường thực tế cho ô tô và xe máy, kèm thời gian, quãng đường và đường đi trên bản đồ.
- Hiển thị nhiều phương án để người dùng so sánh.
- Chọn điểm đi hoặc điểm đến trực tiếp trên bản đồ.
- Lưu và xem lại các hành trình yêu thích.
- Giao diện responsive, hỗ trợ thao tác bằng bàn phím và thông báo lỗi rõ ràng.

Chỉ đường giao thông công cộng hiện chưa phải tính năng chính thức. Khi chưa cấu hình nhà cung cấp dữ liệu thật, ứng dụng có thể chạy với dữ liệu minh họa để phát triển và kiểm thử giao diện.

## Công nghệ

- React, TypeScript và Vite cho giao diện.
- MapLibre GL cùng bản đồ nền OpenFreeMap/OpenStreetMap.
- Fastify cho API.
- MySQL cho dữ liệu hành trình đã lưu.
- VIETMAP cho tìm kiếm địa điểm và chỉ đường bộ khi được cấu hình.
- Vitest và Playwright cho kiểm thử.

## Chạy trên máy cá nhân

Yêu cầu Node.js `>=22.22.2 <23`, npm và Docker Compose. Từ thư mục gốc của dự án:

```bash
node scripts/setup-local.mjs
npm ci --engine-strict
docker compose up -d --wait mysql
npm run migrate
npm run build
npm start
```

Mở `http://127.0.0.1:8080`. Script thiết lập sẽ tạo `.env` từ cấu hình mẫu nếu file này chưa tồn tại. Dữ liệu MySQL được giữ trong Docker volume sau khi container dừng.

Để phát triển frontend và API với hot reload:

```bash
npm run dev
```

Nếu kết nối TCP tới MySQL trong Docker bị gián đoạn, xem phương án Unix socket trong [hướng dẫn phát triển local](docs/local-development.md).

Để dừng môi trường local nhưng giữ dữ liệu:

```bash
docker compose down
```

## Cấu hình

Sao chép và điều chỉnh [.env.example](.env.example). Không commit API key hoặc mật khẩu thật.

| Biến                                                       | Mục đích                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `DB_MODE`                                                  | Chọn chế độ lưu dữ liệu; dùng `mysql` cho chức năng lưu hành trình |
| `DB_MIGRATE_ON_START`                                      | Tự tạo schema idempotent khi khởi động; mặc định tắt               |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` | Thông tin kết nối MySQL                                            |
| `MYSQL_PASSWORD`                                           | Mật khẩu của tài khoản ứng dụng                                    |
| `MYSQL_TLS`, `MYSQL_CA_FILE`                               | Cấu hình kết nối TLS tùy môi trường                                |
| `MYSQL_SOCKET_PATH`                                        | Unix socket thay cho TCP khi chạy local                            |
| `ROUTES_MODE`                                              | Chọn dữ liệu hành trình minh họa hoặc nhà cung cấp transit         |
| `GOOGLE_ROUTES_API_KEY`                                    | Khóa phía server cho hành trình transit khi được cấu hình          |
| `ROAD_PROVIDER`                                            | `disabled` hoặc `vietmap`                                          |
| `VIETMAP_API_KEY`                                          | Khóa phía server cho tìm kiếm, địa điểm và chỉ đường bộ            |
| `BUILD_SHA`                                                | Mã phiên bản hiển thị qua endpoint `/version`                      |
| `DIAGNOSTICS_ENABLED`                                      | Bật các endpoint chẩn đoán; mặc định tắt                           |

## API chính

| Endpoint                  | Chức năng                                                      |
| ------------------------- | -------------------------------------------------------------- |
| `GET /health`             | Kiểm tra trạng thái ứng dụng và kết nối dữ liệu                |
| `GET /version`            | Trả về phiên bản đang chạy                                     |
| `GET /items`              | Liệt kê hành trình đã lưu                                      |
| `POST /items`             | Lưu điểm đi và điểm đến                                        |
| `POST /routes`            | Tìm hành trình transit hoặc trả dữ liệu minh họa theo cấu hình |
| `GET /v1/search`          | Gợi ý địa điểm trong khu vực phục vụ                           |
| `POST /v1/places/resolve` | Chuẩn hóa địa điểm đã chọn                                     |
| `POST /v1/routes/road`    | Tìm đường cho ô tô hoặc xe máy                                 |
| `GET /config`             | Trả về cấu hình công khai cần cho giao diện                    |

API key chỉ được sử dụng ở server và không được trả về trình duyệt. Các endpoint dùng nhà cung cấp thật sẽ trả lỗi rõ ràng nếu thiếu cấu hình, thay vì âm thầm chuyển sang dữ liệu minh họa.

## Kiểm thử

Chạy toàn bộ kiểm tra tĩnh, unit test và build:

```bash
npm run check
```

Một số lệnh hữu ích khác:

```bash
npm run test:mysql
npm run test:browser
npm run test:browser:road
```

Xem phạm vi và điều kiện chạy từng nhóm test tại [docs/testing.md](docs/testing.md).

## Cấu trúc dự án

```text
app/
  client/          Giao diện và bản đồ tương tác
  server/          API, provider adapters và database
  shared/          Kiểu dữ liệu dùng chung
public/            Tài nguyên tĩnh
tests/             Unit, integration và browser tests
scripts/           Công cụ thiết lập, kiểm thử và vận hành
terraform/         Mô tả hạ tầng
docs/              Tài liệu kỹ thuật
evidence/          Hồ sơ kiểm chứng theo từng tiêu chí
```

Các file cấu hình công cụ cần nằm ở thư mục gốc để hệ sinh thái Node.js, Docker và TypeScript tự nhận diện đúng. Tài liệu dài và hồ sơ kiểm chứng được tách vào `docs/` và `evidence/` để giữ phần giới thiệu sản phẩm gọn gàng.

## Giới hạn hiện tại

- Hành trình đã lưu đang dùng chung, chưa có tài khoản cá nhân.
- Chỉ đường giao thông công cộng bằng dữ liệu thật chưa được hoàn thiện.
- Phạm vi tìm kiếm và chọn điểm được giới hạn quanh Hà Nội.
- Chất lượng tìm kiếm và chỉ đường phụ thuộc vào dữ liệu của nhà cung cấp đã cấu hình.

## Tài liệu kỹ thuật

- [Kiến trúc hệ thống](architecture.md)
- [Phát triển local](docs/local-development.md)
- [Chiến lược kiểm thử](docs/testing.md)
- [Triển khai và teardown hạ tầng](terraform/README.md)
- [Runbook](runbook.md)
- [Known issues](known-issues.md)
- [Hồ sơ kiểm chứng](evidence/README.md)

## Đóng góp

Tạo một nhánh ngắn cho mỗi thay đổi, giữ commit tập trung vào một mục tiêu và chạy `npm run check` trước khi gửi review. Không commit secret, file `.env`, dữ liệu sinh ra khi chạy local hoặc dependency đã cài đặt.
