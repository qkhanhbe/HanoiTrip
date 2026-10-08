# Chạy lại và chụp evidence cuối

Checklist này chỉ chạy lại các phép thử an toàn. Không lặp M5 revoke role, M8
destroy/apply, M11 tạo 5xx hoặc production swap chỉ để chụp ảnh; các phép thử đó
đã có transcript/run thật.

## 1. Local validation

Từ root repository, dùng Node theo `.node-version`:

```bash
git status --short --branch
nvm install 22.23.2
nvm use 22.23.2
node --version
npm ci --engine-strict --no-audit --no-fund
npm run check
python3 -m unittest discover -s tests/ci -v
terraform -chdir=terraform/bootstrap fmt -check
terraform -chdir=terraform/bootstrap init -backend=false
terraform -chdir=terraform/bootstrap validate
terraform -chdir=terraform/app fmt -check
terraform -chdir=terraform/app init -backend=false
terraform -chdir=terraform/app validate
node scripts/setup-local.mjs
docker build --build-arg BUILD_SHA=final-validation -t hanoitrip:final-validation .
BUILD_SHA=final-validation DIAGNOSTICS_ENABLED=true docker compose up --no-build -d --wait
cat scripts/smoke.mjs | BUILD_SHA=final-validation DIAGNOSTICS_ENABLED=true \
  docker compose exec -T \
  -e BASE_URL=http://127.0.0.1:8080 \
  -e EXPECTED_SHA=final-validation \
  -e SMOKE_WRITE=1 -e SMOKE_DIAGNOSTICS=1 \
  app node --input-type=module -
BUILD_SHA=final-validation DIAGNOSTICS_ENABLED=true docker compose down
```

Kết quả mong đợi: working tree chỉ có file local đã biết; app/policy tests xanh;
Terraform fmt/validate xanh; container smoke trả `result=pass`,
`storage=mysql`; container được dừng sau test. Nếu Docker bridge bị WARP reset,
smoke nội bộ như trên vẫn kiểm tra đúng app; không tắt WARP để làm xanh test.
Không chụp nội dung `.env`.

## 2. Runtime read-only

Mở production và kiểm tra:

```text
GET /health  -> HTTP 200, database=mysql
GET /version -> buildSha=42d24aa22897aa0067d2c8fbaf703840d76e3652
```

Trên UI, chạy một tìm kiếm địa điểm và một route xe máy/ô tô. Chụp toàn màn hình
có bản đồ, geometry bám đường, provider attribution và danh sách phương án.

## 3. Ảnh GitHub

1. PR #29: tab Checks hiển thị toàn bộ required checks xanh.
2. CI run 37722671154: job `terraform-plan` xanh và artifact plan.
3. PR #30: `source-security-gate` đỏ, merge bị block, PR Closed.
4. PR #31: `app-check`/policy gate đỏ, merge bị block, PR Closed.
5. Azure CD run 37723130114: các bước build/scan/push, migration, staging,
   production swap, evidence và cleanup đều xanh.
6. Artifact release hoặc summary cho thấy 30 mẫu, `non200=0`, SHA A → B.
7. Repository ruleset `protect-main`: required PR/checks, strict mode, không
   bypass/force-push.

## 4. Ảnh Azure theo M

- **M1/M4:** ACR Admin user disabled; App Service Identity; container registry
  authentication bằng UAMI; role `AcrPull` và `Key Vault Secrets User`; app
  settings chỉ hiện trạng thái Key Vault reference.
- **M3:** MySQL Networking có đúng `appservice-01..04`; Server parameters cho
  secure transport/TLS; terminal CRUD đã redaction.
- **M5:** Key Vault reference resolved sau recovery và log
  revoke/fail/restore/recover trong `evidence/M5.md`.
- **M6:** Access Restrictions của production và staging: hai allow rule WARP,
  default Deny, SCM dùng cùng restrictions; dùng transcript ACI 403 đã lưu thay
  vì tạo ACI mới.
- **M7:** App Service Plan tier S1, autoscale min 1/max 2 và hai rule CPU; MySQL
  B1ms; Cost Analysis Actual cost; ba biện pháp tiết kiệm trong cost report.
- **M8:** Storage Account Shared Key disabled, state container/backend; dùng
  transcript rebuild/lock thay vì destroy app hiện tại.
- **M10:** Deployment slot và production `/version` SHA mới; không bật lại cờ
  production swap.
- **M11:** dashboard đủ app/infra tiles; Log Analytics chạy KQL có request ID,
  build SHA, status, duration; ba alert enabled; action group email; Alert History
  có Fired và Resolved.

### M11 live — đường dẫn chụp ảnh

Monitoring live đã được triển khai ngày 08/10/2026. Trong Azure Portal:

1. **Dashboard** → mũi tên cạnh tên dashboard → chọn shared dashboard
   `HanoiTrip operations`. Nếu dropdown chỉ hiện private dashboard, dùng thanh
   tìm kiếm toàn cục của Azure Portal để mở resource
   `dashboard-hanoitrip-bqk` trong `rg-hanoitrip-sandbox`, rồi chọn **Open**.
2. **Log Analytics workspaces** → `log-hanoitrip-bqk` → **Logs** → chạy KQL
   trong `evidence/M11.md`.
3. **Monitor** → **Alerts** → **Alert rules** → lọc resource group
   `rg-hanoitrip-sandbox`; chụp ba rule enabled.
4. **Monitor** → **Alerts** → **Action groups** → `ag-hanoitrip-bqk`; chụp
   trạng thái enabled và receiver nhưng che địa chỉ email.
5. **Monitor** → **Alerts** → trang alert history/list → time range 7 days →
   tìm `hanoitrip-http-5xx`, thời điểm bắt đầu `06/10/2026 07:55:55 UTC` và
   resolved `08:02:54 UTC`. Không chạy lại `/boom` hoặc phá kết nối MySQL.

## 5. Email và redaction

Chụp email HTTP 5xx **Fired** và **Resolved**, nhưng che địa chỉ email, subscription
ID và resource ID đầy đủ. Tất cả ảnh phải tránh token, password, secret value,
connection string và API key. Có thể giữ bốn chữ số cuối của ID để đối chiếu.

## 6. GitLab review thủ công

GitLab không deploy. Khi cần đồng bộ nhánh review, chạy trong terminal cá nhân để
Git hỏi username/password:

```bash
cd ~/tts/HanoiTrip
git fetch gitlab
```

Sau khi fetch thành công, kiểm tra `gitlab/main` rồi tạo worktree/nhánh mới từ
đúng lịch sử GitLab và chuyển patch đã review. Không force-push `main`, không
đưa credential vào remote URL, shell history hoặc file cấu hình. Việc này không
chặn nghiệm thu M1–M11 trên GitHub/Azure.
