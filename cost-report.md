# Cost report — HanoiTrip

- Ngày truy vấn: **06/10/2026**
- Nguồn: Azure Cost Management Query API, `ActualCost`, `MonthToDate`, group theo resource group
- Đơn vị: **USD**

| Resource group | Actual cost tháng hiện tại (USD) |
| --- | ---: |
| `rg-hanoitrip-sandbox` | 15.5441939584 |
| `rg-hanoitrip-dev-bd3nfj` | 0.0559939642 |
| `rg-hanoitrip-dev-jn03ln` | 0.1159749264 |
| `rg-hanoitrip-dev-js4qsu` | 0.1141141284 |
| `rg-hanoitrip-tfstate` | 0.0001252000 |
| **Tổng các resource group HanoiTrip đã xuất hiện** | **15.8304021774** |

Stack test greenfield ngày 06/10 chưa xuất hiện trong phản hồi Cost Management tại thời điểm truy vấn do dữ liệu billing có độ trễ. Vì vậy bảng trên là số liệu thật đã ghi nhận, không phải dự toán, nhưng chưa phải tổng cuối ngày.

Thiết kế dùng một Linux App Service Plan S1 cho production và staging slot, ACR Basic, MySQL Flexible Server B1ms, Key Vault Standard và Log Analytics retention 30 ngày. S1 là tier nhỏ nhất trong thiết kế hiện tại đáp ứng deployment slot và autoscale; autoscale giới hạn 1–2 instance.

Ba biện pháp tiết kiệm đang áp dụng:

1. Frontend và API dùng chung một container/App Service Plan; staging là slot, không dựng thêm web app độc lập.
2. Dùng ACR Basic, MySQL burstable nhỏ và Log Analytics retention 30 ngày.
3. Giới hạn autoscale tối đa hai instance; test load/drill ngắn và teardown app stack sau khi thu evidence.

Nhận xét: chi phí tháng hiện tại tập trung gần như toàn bộ ở sandbox tồn tại lâu. Khi cần giảm chi phí tiếp, ưu tiên kiểm tra và tắt/xóa sandbox cũ ngoài giờ sử dụng; không xóa backend Terraform vì đây là lifecycle riêng và chi phí hiện rất nhỏ.
