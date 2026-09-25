# Cost report — bản chờ số liệu Azure

Thiết kế dùng một Linux App Service Plan S1 cho production và staging slot, ACR Basic, MySQL Flexible Server B1ms, Key Vault Standard và Log Analytics 30 ngày. S1 được chọn vì cần deployment slot và autoscale; autoscale giới hạn 1–2 instance.

Ba biện pháp đang áp dụng trong cấu hình:

1. Frontend và API dùng chung một container/App Service Plan; staging là slot, không dựng thêm app độc lập.
2. ACR Basic, MySQL burstable nhỏ, Log Analytics retention 30 ngày; test load ngắn và teardown app stack sau khi lấy evidence.
3. Autoscale tối đa 2 instance, scale-in chậm hơn scale-out để tránh dao động.

Chi phí thực từ Azure Cost Analysis chưa có vì hạ tầng chưa được apply. Sau khi deploy, bổ sung screenshot/export theo resource group, khoảng thời gian, currency, tổng chi phí và phần đóng góp của từng resource; không ước lượng rồi ghi như số tiền thật.
