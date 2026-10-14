# Thực hành swap thủ công

Chỉ thực hiện sau khi candidate staging được đánh dấu ready. Agent chuẩn bị và quan sát; người dùng bấm Start Swap.

1. Tạm dừng deploy mới; ghi SHA và image digest của hai slot. Dùng hostname Azure trả về, không tự ghép tên hostname.
2. Kiểm tra staging `/health`, `/version`, `/config`, bản đồ thực tế, search/route, thao tác DB tương thích. Production phải đang khỏe và thiết bị quan sát phải nằm trong mạng/IP được phép.
3. Kiểm tra warm-up path `/health`, accepted status `200`. Kiểm tra bảng app settings và sticky settings: `BUILD_SHA` đi cùng image; basemap phải có hành vi promotion mong muốn; cả hai slot cần quyền resolve secrets.
4. Mở App Service chính → Deployment slots → Swap. Chọn source **staging**, target **production**. Đọc Source/Target changes; chưa bấm swap nếu settings khác dự kiến.
5. Bắt đầu observer từ terminal được phép truy cập production:

   ```bash
   node scripts/release/poll-version.mjs \
     --url "$PRODUCTION_URL" --expected "$CANDIDATE_SHA" \
     --timeout 600 --output output/release/manual-swap.jsonl --strict
   ```

   Đặt hai biến từ hostname và SHA đã xác minh. Observer gọi `/version` mỗi khoảng một giây, fail khi gặp non-200/network error và kết thúc sau ba mẫu liên tiếp của SHA mới. Nó không tự swap hay chứng minh mọi request của mọi người dùng đều không lỗi.

6. Người dùng bấm **Start Swap**, đợi Azure hoàn tất; giữ terminal observer chạy.
7. Xác minh production trả SHA mới, đúng basemap, health/API/DB/UI đạt. Xác minh staging giữ SHA/image cũ và ghi evidence trước/sau; nếu cần thời gian theo dõi dài hơn, tiếp tục các probe riêng sau khi observer kết thúc.
8. Nếu verification thất bại: kiểm tra trạng thái swap và hai image hiện tại trước quyết định rollback. Khi xác nhận swap đã hoàn tất và staging vẫn giữ image cũ, swap cùng hai slot để đưa image cũ về production; xác minh lại. Không chạy swap lần hai một cách mù quáng khi thao tác trước chưa rõ kết quả.

Lưu ý: database không rollback cùng slot. Migration phải tương thích cả hai phiên bản; không dùng schema destructive trong cùng buổi thử nghiệm.

Sau swap thành công, staging chứa bản production cũ. Chỉ deploy candidate tiếp theo sau khi hết cửa sổ rollback hoặc đã lưu được image/config phục hồi.

Tham khảo: [Azure slot swap và các settings được swap](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots).
