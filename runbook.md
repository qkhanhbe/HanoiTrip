# Runbook — production HTTP 5xx tăng cao

## Triệu chứng và mức độ

Alert `hanoitrip-http-5xx` báo hơn 5 response 5xx trong 5 phút. Xử lý như sự cố nghiêm trọng nếu `/health` không còn 200 hoặc người dùng không tìm/lưu hành trình được.

## 1. Xác nhận

1. Ghi thời gian alert, production build SHA và request ID mẫu; không chép secret/body vào ticket.
2. Gọi `/health` và `/version` từ IP được allowlist.
3. Kiểm tra App Service metrics (5xx, response time, CPU, queue) và MySQL connections/CPU/storage.
4. Truy vấn Log Analytics theo cùng `buildSha` và khoảng thời gian; nhóm theo `statusCode`, route và request ID.
5. Kiểm tra release GitHub gần nhất và staging slot. Phân biệt lỗi app mới, DB, provider route, hay access restriction.

Ví dụ KQL khởi điểm (tên bảng/field phải điều chỉnh theo diagnostic schema thực tế):

```kusto
AppServiceConsoleLogs
| where TimeGenerated > ago(30m)
| extend log = parse_json(ResultDescription)
| where toint(log.statusCode) >= 500
| summarize failures=count() by tostring(log.buildSha), tostring(log.route), bin(TimeGenerated, 5m)
```

## 2. Giảm tác động

- Nếu lỗi xuất hiện ngay sau swap và SHA mới chiếm đa số: reverse swap về slot chứa SHA cũ, rồi poll `/version` để xác nhận phục hồi.
- Nếu DB quá tải: dừng load test, kiểm tra connection pool/query; không tăng tier mù quáng.
- Nếu Google Routes lỗi: giữ lỗi 502/504 rõ ràng; không âm thầm trả route demo cho production.
- Không xóa dữ liệu, rotate secret hoặc mở firewall rộng khi chưa xác định nguyên nhân.

## 3. Kiểm chứng phục hồi

Trong ít nhất 5 phút: `/health` luôn 200, `/version` là SHA mong đợi, 5xx về ngưỡng bình thường, MySQL connections ổn định và thao tác `GET|POST /items` hoạt động. Lưu raw poll/log đã redacted vào evidence.

## 4. Escalate

Escalate cho mentor/owner Azure nếu không phục hồi trong 15 phút, thiếu quyền rollback, DB/storage gần giới hạn, hoặc nghi ngờ credential/security incident. Gửi timeline, SHA, request IDs, metric/log query và thao tác đã làm; không gửi secret.

## 5. Sau sự cố

Ghi nguyên nhân, thời lượng, phạm vi ảnh hưởng, rollback SHA và action item. Nếu alert do `/boom`, đánh dấu rõ đây là test có kiểm soát và tắt diagnostics sau khi lấy evidence.
