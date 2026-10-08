# Known issues

## Evidence và vận hành

- M1–M11 đã đạt kỹ thuật; vẫn cần đóng gói screenshot Portal/Actions và email
  alert theo [checklist cuối](docs/final-validation-and-screenshots.md).
- Autoscale min 1/max 2 đã active nhưng chưa có biểu đồ một lần scale-out thật.
  Đây là evidence bổ sung, không phải điều kiện MUST còn thiếu.
- Actual Cost có độ trễ billing; số mới nhất phải lấy lại khi chốt báo cáo.
- Sandbox cũ nằm ngoài Terraform state greenfield; không import/xóa nhầm bằng
  stack M8.
- GitHub production swap đã khóa lại. Một release mới cần review và bật cờ riêng,
  không dựa vào trạng thái của run 37723130114.

## Sản phẩm

- Google transit chưa có key và chưa kiểm tra coverage Hà Nội; app hiện có
  VIETMAP road routing thật cho ô tô/xe máy, public transport vẫn là demo.
- MapLibre được lazy-load nhưng chunk map còn lớn; lần đầu mở map có thể chậm trên
  mạng yếu.
- Favorites dùng chung sandbox, chưa có tài khoản hoặc phân quyền người dùng.

## Security và CI

- GitHub dùng npm public. GitLab chỉ review/source scan; image scan GitLab chưa
  nối OCI producer và GitLab không CD Azure cá nhân.
- GitHub SCA tạm gate HIGH/CRITICAL vì không có TI blacklist nội bộ để tái tạo
  policy GitLab chính xác.
- Runtime Alpine đã scan 0 CVE ở mọi severity sau khi upgrade OS và bỏ
  npm/corepack khỏi image cuối. CI/CD không có vulnerability exception; package
  hoặc database mới làm xuất hiện CVE sẽ chặn release cho tới khi được sửa.
- Source scan chỉ xét history reachable từ `HEAD`; dùng `--all` sẽ làm nhánh
  negative test không liên quan khiến PR sạch đỏ.
- GitHub-hosted runner cần rule tạm cho App Service/MySQL/Key Vault; cleanup có
  `always()`, nhưng vẫn phải hậu kiểm rule orphan sau mọi run lỗi.
