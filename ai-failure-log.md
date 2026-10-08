# AI failure log — app local

Ghi tám lỗi thực tế trong quá trình AI hỗ trợ; không phải evidence triển khai Azure.

| Lỗi | Quan sát | Cách xử lý/kiểm chứng |
| --- | --- | --- |
| Giả định TCP Docker hoạt động trên host | Kết nối bị reset khi đi qua WARP | Giữ WARP; dùng Unix socket cho host và smoke internal Docker network; migration + MySQL CRUD pass |
| Tích hợp MapLibre thiếu worker/CSS container | Worker 404 hoặc map có canvas nhưng panel trống | Bundle worker bằng Vite, đặt sizing/position rõ; browser desktop/mobile xác nhận pan, marker và route |
| Runtime Debian/distroless và gate có exception | Gate HIGH/CRITICAL xanh nhưng scan mọi severity còn CVE, trái M9 | Chuyển runtime Node 22 Alpine, upgrade OS, bỏ npm/corepack; Trivy mọi severity không ignore đạt 0 và container smoke pass |
| Terraform bootstrap ghép public image với ACR URL | App Service tìm image MCR trong ACR | Tách bootstrap registry; build/push source đã review và để CD sở hữu image SHA |
| CD chỉ mở runner access cho staging | Observer production và Key Vault read bị deny | Mở IP tạm đúng bốn scope cần thiết, cleanup tất cả trong `always()`, hậu kiểm rule orphan bằng 0 |
| Semgrep partial parse JSX có ký tự `&` | Scanner exit 0 nhưng report incomplete, gate fail-closed | Escape thành `&amp;`; scan lại report không còn parse error |
| Gitleaks dùng `--all` | PR sạch bị dính secret từ nhánh negative test không liên quan | Scan full history reachable từ `HEAD`; PR secret vẫn bị central gate chặn, PR sạch xanh |
| Restart sau khi revoke Key Vault role | Reference cache giữ secret nên health vẫn 200 | Buộc resolve lại đúng secret version; recovery `trap` phục hồi role/reference và cả hai slot về 200 |

Các lỗi được sửa theo test/scan thật, không hạ gate hoặc thêm ignore để làm xanh.
Nội dung AI tạo phải được người học đọc hiểu và khai báo trong PR, không trình bày
là tự làm trong phần AI-OFF.
