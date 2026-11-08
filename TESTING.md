# Kiểm thử ứng dụng

Các bài kiểm thử tập trung vào nghiệp vụ học tập, xác thực và lưu dữ liệu. Tài liệu này không chứa hướng dẫn cài đặt hay triển khai.

## Phạm vi

- `tests/test_offline.py`: dữ liệu câu học, sinh/chấm quiz, mật khẩu, cookie/state của runner và tính toàn vẹn tài nguyên.
- `tests/test_app.py`: API và lưu dữ liệu PostgreSQL, phiên, quyền người dùng, quiz và tiến độ.
- `tests/test_expansion.py`: flashcard cá nhân, nội dung mở rộng, AI và OAuth với phản hồi mô phỏng.
- `tests/test_picture_assets.py`: đọc ảnh local/S3, allowlist, giới hạn tệp và xử lý lỗi.
- Các test Node: định tuyến giao diện, render trang, CSS và CSP.
- `tests/smoke_frontend.py`, `tests/e2e_http.py`: kiểm tra HTTP trên ứng dụng đang chạy.
- [Checklist trình duyệt](tests/browser-checklist.md): thao tác học thực tế, responsive, ảnh/audio, AI/OAuth và dữ liệu sau restart.

## Giới hạn kết quả

Unit test hoặc mock S3/AI không xác nhận kết nối AWS hay nhà cung cấp thật. Kiểm thử PostgreSQL cần database test riêng; kiểm tra HTTP/trình duyệt cần ứng dụng đang hoạt động. Kết quả test tĩnh không chứng minh giao diện không tràn hoặc hạ tầng đã cấu hình đúng.

Ghi rõ ngày, phiên bản mã, môi trường, số test đạt/bỏ qua và phần chưa kiểm chứng khi lập biên bản.

## Rà soát ngày 09/11/2026

Sau khi gỡ công cụ cài đặt, bộ unittest offline còn lại đạt **23/23**. Kiểm tra liên kết Markdown nội bộ không có liên kết hỏng; `git diff --check` đạt. Không chạy kiểm thử AWS hoặc thay đổi tài nguyên AWS trong lần rà soát này.
