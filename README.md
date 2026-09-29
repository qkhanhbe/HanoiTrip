# HanoiTrip

Ứng dụng lập hành trình tại Hà Nội với React/TypeScript, Fastify và MySQL. Một Docker image phục vụ cả frontend và API.

Bản đồ OpenFreeMap/OpenStreetMap là dữ liệu thật; tuyến và thời gian trong chế độ `demo` là minh họa. Favorites hiện dùng chung trong sandbox, chưa có tài khoản cá nhân. Adapter Google Routes/Maps đã có code; cần cấu hình key và kiểm chứng live trước khi sử dụng.

## Chạy local

Yêu cầu Linux/POSIX shell, Node >=22.22.2 <23 (khuyến nghị 22.23.2 theo `.node-version`), npm và Docker Compose. Python 3 dùng cho policy tests; Terraform CLI dùng khi triển khai hạ tầng. Chạy từ thư mục gốc repo:

```bash
node scripts/setup-local.mjs
npm ci --engine-strict
docker compose up -d --wait mysql
npm run migrate
npm run build
npm start
```

Mở `http://127.0.0.1:8080`. Script setup tạo `.env` nếu chưa có; database nằm trong Docker volume và giữ dữ liệu khi restart.

Nếu TCP từ host tới Docker bị ảnh hưởng bởi WARP, xem cách dùng Unix socket trong [hướng dẫn local](docs/local-development.md). Máy chưa có Node phù hợp có thể chạy các lệnh npm bằng `npx --yes --package=node@22.23.2 --call 'npm run check'`.

## Cấu hình

Các biến được mô tả trong [.env.example](.env.example); không commit giá trị secret thật.

| Biến | Mục đích |
| --- | --- |
| `DB_MODE=mysql` | Lưu favorites bằng MySQL |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER` | Kết nối database |
| `MYSQL_PASSWORD` | Mật khẩu app DB; Azure dùng Key Vault reference |
| `MYSQL_TLS`, `MYSQL_CA_FILE` | TLS và CA tùy chọn; production yêu cầu TLS được xác thực |
| `MYSQL_SOCKET_PATH` | Unix socket khi chạy local cần thay TCP |
| `ROUTES_MODE` | `demo` hoặc `google` |
| `GOOGLE_ROUTES_API_KEY`, `GOOGLE_MAPS_BROWSER_KEY` | Key server và browser riêng khi dùng Google |
| `BUILD_SHA` | SHA/version bất biến cho production |
| `DIAGNOSTICS_ENABLED` | Bật endpoint chẩn đoán có giới hạn; mặc định tắt |

## API

| Endpoint | Chức năng |
| --- | --- |
| `GET /health` | Readiness: 200 khi truy cập được bảng items, 503 khi DB lỗi |
| `GET /version` | Build SHA, version và environment |
| `GET /items` | Liệt kê favorites; hỗ trợ limit/offset |
| `POST /items` | Lưu tên và tọa độ điểm đi/đến |
| `POST /routes` | Tìm route demo hoặc gọi Google Routes |
| `GET /config` | Cấu hình công khai cho frontend |
| `GET /boom`, `GET /load` | Chẩn đoán có giới hạn; mặc định tắt |

Migration là lệnh riêng. Logs gồm request ID, build SHA, status và duration; không ghi password hay request body.

## Cấu trúc repo

```text
app/                 Frontend, backend và kiểu dữ liệu dùng chung
public/              Tài nguyên tĩnh
tests/               Test ứng dụng, UI và policy CI
scripts/             Công cụ local, CI và release
terraform/           Bootstrap remote state và hạ tầng ứng dụng
docs/                Hướng dẫn kỹ thuật và sơ đồ
evidence/            Kết quả từng tiêu chí M1–M11 theo đề gốc
.github/             Workflow và PR template cho GitHub
Dockerfile           Image frontend + API
compose*.yml         Môi trường app/MySQL local
```

Các báo cáo được đề gốc yêu cầu giữ ở root: `architecture.md`, `runbook.md`, `known-issues.md`, `cost-report.md`, `ai-failure-log.md`. Kế hoạch học, hướng dẫn agent, bản template tham khảo và slide chỉ lưu local, được bỏ qua bởi `.gitignore`.

## Kiểm thử và CI

```bash
npm run check
python3 -m unittest discover -s tests/ci -v
```

MySQL integration và HTTP/browser smoke chạy riêng; xem [kiểm thử](docs/testing.md). GitHub là nơi chạy application/policy CI, Docker + MySQL smoke, image scan, Terraform checks và CD Azure cá nhân; npm tải từ public registry. GitLab công ty dùng để review/source scan, không deploy; tích hợp image scan GitLab còn chờ nguồn OCI artifact phù hợp. Chưa coi YAML là bằng chứng pipeline đã chạy thành công.

## Triển khai và dừng môi trường

Thiết lập state, biến Azure và plan/apply theo [Terraform](terraform/README.md). Xem [CI/CD GitHub](docs/ci-github.md) để cấu hình OIDC và release; deploy mặc định bị khóa bằng `AZURE_CD_ENABLED` cho tới khi cấu hình sẵn sàng. Chỉ branch `main` được deploy App Service.

Dừng app host bằng Ctrl+C và dừng môi trường local:

```bash
docker compose down
```

Lệnh trên giữ volume MySQL; không thêm `-v` nếu cần giữ dữ liệu. Với hạ tầng do Terraform quản lý, review `terraform -chdir=terraform/app plan -destroy` trước khi chạy `terraform -chdir=terraform/app destroy`. Giữ backend state tới khi không còn workload phụ thuộc. Tài nguyên tạo thủ công trên Portal cần được kiểm kê/import trước khi coi Terraform là nguồn quản lý đầy đủ. Theo quy tắc sandbox, lập kế hoạch dừng tài nguyên sau buổi làm việc, không để chạy qua đêm.

## Tài liệu

- [Chạy local và MySQL](docs/local-development.md)
- [Kiến trúc](architecture.md) và [sơ đồ](docs/assets/hanoitrip-azure-flow.png)
- [CI GitLab](docs/ci-gitlab.md), [CI/CD GitHub](docs/ci-github.md), [kiểm thử](docs/testing.md)
- [Runbook](runbook.md), [known issues](known-issues.md), [cost report](cost-report.md), [AI failure log](ai-failure-log.md)
- [Evidence M1–M11](evidence/README.md)

## Quy trình đóng góp

`main` là nhánh dài hạn duy nhất. Nhánh `feat/`, `fix/`, `chore/` sống tối đa 2 ngày, mọi thay đổi qua MR/PR, yêu cầu CI xanh và squash merge; không push trực tiếp hoặc force-push lên `main`. Mô tả MR nêu vấn đề, thay đổi, kiểm chứng (gồm trường hợp lỗi liên quan) và khai báo phần AI hỗ trợ. Giữ pre-commit Gitleaks; không bypass security gate.

GitHub là nguồn phát hành chính theo đề gốc; GitLab công ty là nơi review/scan bổ sung, không CD. Xem flow hai remote và điều kiện bật deploy trong [CI/CD GitHub](docs/ci-github.md). Không force-push để ép hai lịch sử squash giống nhau.

Chỉ commit source, cấu hình mẫu và tài liệu phục vụ dự án. File mẫu `.env.example`, Terraform `*.example` và lockfile vẫn được theo dõi. `.dockerignore` giới hạn build context vào source và file cần để build image.
