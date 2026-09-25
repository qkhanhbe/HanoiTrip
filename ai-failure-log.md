# AI failure log — app local

Ghi lỗi thực tế trong quá trình AI hỗ trợ; không phải evidence triển khai Azure.

| Lỗi                                                                     | Quan sát                                                | Cách xử lý/kiểm chứng                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Test MySQL khởi tạo config ở thân suite dù suite skipped                | Unit run báo thiếu MYSQL_PASSWORD                       | Chuyển setup vào beforeAll; 28 test thường pass, integration opt-in chạy thật pass                                |
| Giả định TCP Docker hoạt động trên host                                 | Kết nối bị đóng, route qua WARP                         | Giữ WARP, kiểm chứng internal Docker network; thêm Unix socket local có xác thực, migration và browser+MySQL pass |
| Tích hợp MapLibre thiếu worker và CSS container đúng                    | Browser báo worker 404 hoặc map load nhưng panel trống  | Bundle worker bằng Vite, đặt kích thước/position rõ; browser smoke xác nhận canvas, pan và marker                 |
| Runtime dùng Debian slim mang theo nhiều package/CVE không cần thiết    | Trivy chặn 56 OS và 11 Node HIGH/CRITICAL               | Đổi runtime sang distroless Debian 13, giữ build stage riêng; scan lại 0 HIGH/CRITICAL và container smoke pass    |
| Compose migration vẫn gọi `node` sau khi đổi sang distroless entrypoint | Container tìm nhầm `/app/node`, migration exit 1        | Đổi command thành script path cho entrypoint Node; migration và MySQL smoke pass                                  |
| Terraform bootstrap image ghép nhầm public image với ACR URL            | App Service sẽ tìm image MCR trong ACR                  | Tách bootstrap registry MCR; để CD sở hữu image SHA và Terraform ignore release-managed fields                    |
| CD runner chỉ được mở staging                                           | Production observer và Key Vault secret read sẽ bị deny | Mở IP tạm cho prod/staging/MySQL/KV, cleanup tất cả trong `always()`                                              |
| Semgrep partial parse tại JSX text có `&`                               | Gate báo scan incomplete dù process scanner trả 0       | Escape thành `&amp;`, gate vẫn fail-closed theo report; scan lại không còn error                                  |

Các lỗi được sửa theo kết quả test/scan thật, không hạ gate hoặc thêm ignore để làm xanh. Nội dung đã tạo bằng AI phải được người học đọc hiểu và khai báo trong PR, không trình bày là tự làm trong phần AI-OFF.
