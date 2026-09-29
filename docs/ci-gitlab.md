# Phạm vi GitLab

GitHub là nguồn phát hành chính và nơi chạy CI/CD lên Azure cá nhân. GitLab công ty
là kênh review/source scan bổ sung, không deploy ra Azure cá nhân. Cấu hình pipeline
và tài liệu review nội bộ được giữ ở workspace/remote công ty, không chuyển sang
nhánh GitHub này. Image scan GitLab còn chờ nguồn artifact/build phù hợp được cấp.

Hai lịch sử hiện không có tổ tiên chung: tạo nhánh review từ main của từng remote,
chuyển patch nội dung đã chọn giữa hai bên; không force-push, mirror hoặc merge
unrelated histories. Góp ý từ GitLab được áp dụng lên PR GitHub và CI chạy lại.
Không coi approval GitLab là required check tự động trên GitHub.

Hướng dẫn phát hành và giới hạn hiện tại: [CI/CD GitHub](ci-github.md).
