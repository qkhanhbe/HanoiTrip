# Tiến độ và kế hoạch tiếp theo

Cập nhật: **02/10/2026**

Tài liệu này ghi lại điểm dừng kỹ thuật hiện tại để phiên làm việc tiếp theo có
thể tiếp tục mà không phải dựng lại hoặc audit lại các phần đã hoàn thành.
Trạng thái chi tiết theo từng mốc nằm trong [`../evidence/README.md`](../evidence/README.md).

## Đã hoàn thành

- M1 đạt kỹ thuật: ACR tắt admin account; App Service kéo image bằng
  user-assigned managed identity có quyền `AcrPull`.
- M4 đạt kỹ thuật: ứng dụng dùng managed identity và Key Vault reference thay
  cho secret trực tiếp trong app settings.
- M8 đạt kỹ thuật:
  - Terraform backend dùng Azure Blob và Microsoft Entra ID; Shared Key bị tắt.
  - Remote state locking đã được kiểm tra bằng lock-contention test.
  - Một app stack mới đã được dựng từ state rỗng bằng wrapper Terraform, không
    sửa tài nguyên bằng Azure Portal.
  - Production và staging đều resolve Key Vault reference, kết nối MySQL qua
    TLS, trả đúng build SHA và vượt qua smoke test có thao tác ghi/đọc.
  - Plan cuối hội tụ `No changes`.
  - Saved destroy plan đã được review trước khi cleanup; toàn bộ app stack thử
    nghiệm đã bị xóa để không phát sinh chi phí qua đêm.
- Bộ kiểm tra local trên Node `22.23.2` đạt: format, lint, typecheck, 41 test và
  production build. MySQL integration test được skip khi không bật `MYSQL_TEST`.

Evidence M8: [`../evidence/M8.md`](../evidence/M8.md) và
[`../evidence/logs/m8-terraform-rebuild-2026-10-02.txt`](../evidence/logs/m8-terraform-rebuild-2026-10-02.txt).

## Trạng thái cloud tại điểm dừng

- Không còn resource group của app stack M8.
- Backend Terraform `rg-hanoitrip-tfstate` được giữ lại theo lifecycle riêng.
- State container vẫn tồn tại; state blob ở trạng thái `available/unlocked`.
- Không cần dựng lại app stack chỉ để kiểm tra M8 hoặc chụp thêm Portal.

## Kế hoạch tiếp theo

### 1. Hoàn thiện access restriction, autoscale và monitoring

Mục tiêu: chốt M6, tạo nền cho M7 và M11 trong cùng một lượt triển khai có kiểm
soát.

- Đưa production và staging về default-deny với allowlist tối thiểu.
- Kiểm tra truy cập từ một IP được phép và một mạng không được phép.
- Xác nhận autoscale min `1`, max `2`; chạy load ngắn và thu metric scale-out/
  scale-in.
- Xác nhận Log Analytics, diagnostic settings, action group và ba metric alert.
- Trigger một alert có kiểm soát, lưu fired alert và email, rồi tắt tải/diagnostic
  thử nghiệm không còn cần thiết.
- Export Cost Analysis thật sau khi dữ liệu billing xuất hiện và cập nhật
  `cost-report.md`.

Điều kiện hoàn tất: có log/screenshot redacted cho M6, M7 và M11; không để tài
nguyên thử nghiệm hoặc tải giả chạy qua đêm.

### 2. Hoàn thiện CI gate

Mục tiêu: chốt M9 mà không đưa secret hoặc code lỗi vào `main`.

- Tạo PR chứa secret giả để chứng minh secret scan đỏ và merge bị chặn; đóng PR.
- Tạo PR có lỗi test/build để chứng minh required check chặn merge; đóng PR.
- Lưu một PR sạch có lint, test, Docker build, image scan và Terraform plan xanh.
- Lưu artifact Terraform plan và cấu hình branch protection.

Điều kiện hoàn tất: đủ hai negative evidence, một positive evidence và artifact
plan; mọi nhánh thử lỗi đều bị đóng, không merge.

### 3. Diễn tập release, zero downtime và rollback

Mục tiêu: chốt M2 và M10 sau khi pipeline production được phê duyệt.

- Sửa observer để bất kỳ non-200 hoặc network error nào cũng làm phép thử fail.
- Chạy một release từ `main`: build, scan, push, migrate, staging smoke và swap.
- Lưu poll log chứng minh `non200=0` và production trả SHA mới.
- Reverse swap để diễn tập rollback và xác nhận SHA cũ hoạt động lại.

Điều kiện hoàn tất: có một release log end-to-end và một rollback log; không có
request lỗi trong cửa sổ quan sát.

### 4. Kiểm tra thu hồi quyền Key Vault

Mục tiêu: chốt M5 trong cửa sổ ngắn, sau khi các evidence khác đã thu đủ.

- Thu hồi riêng role đọc secret của managed identity.
- Restart và ghi nhận ứng dụng lỗi vì không đọc được secret.
- Cấp lại đúng role, restart và xác nhận `/health` trở lại `200`.

Điều kiện hoàn tất: có timestamp trước/sau và ứng dụng không bị để lại ở trạng
thái lỗi.

## Blocker và phụ thuộc

- M8 không còn blocker kỹ thuật.
- M7 phụ thuộc vào thời điểm Azure Cost Analysis cập nhật dữ liệu chi phí thật.
- M2/M10 cần chủ động bật bước production swap trong một cửa sổ được phê duyệt.
- M5 cố ý gây lỗi tạm thời nên chỉ thực hiện sau cùng và phải có sẵn lệnh khôi
  phục quyền.
- Một số evidence cuối cần screenshot Portal/email do người dùng chụp; lệnh và
  log máy có thể tiếp tục được thu tự động.

## Cách tiếp tục an toàn

1. Đồng bộ `main` mới nhất và tạo một feature branch mới; không làm tiếp trên
   nhánh evidence đã merge.
2. Đọc lại `DE_BAI_GOC.md`, file evidence của mốc sắp làm và kiểm tra chi phí
   trước khi tạo tài nguyên.
3. Dùng Terraform plan đã lưu và review phạm vi trước mọi apply/destroy.
4. Thu evidence đã redaction trong cùng phiên và cleanup tài nguyên thử nghiệm
   trước khi dừng.
5. Chỉ merge qua PR/MR khi required checks xanh; dùng squash merge và xóa nhánh.
