# Kiểm thử ứng dụng

Các bài kiểm thử tập trung vào nghiệp vụ học tập, xác thực và lưu dữ liệu. Tài liệu này không chứa hướng dẫn cài đặt hay triển khai.

## Phạm vi

- `tests/test_offline.py`: dữ liệu câu học, sinh/chấm quiz, mật khẩu, cookie/state của runner và tính toàn vẹn tài nguyên.
- `tests/test_app.py`: API và lưu dữ liệu PostgreSQL, phiên, quyền người dùng, quiz và tiến độ.
- `tests/test_expansion.py`: flashcard cá nhân, nội dung mở rộng, AI với phản hồi mô phỏng và xác nhận endpoint đăng nhập mạng xã hội đã được gỡ.
- `tests/test_picture_assets.py`: đọc ảnh local/S3, allowlist, giới hạn tệp và xử lý lỗi.
- Các test Node: định tuyến giao diện, render trang, CSS và CSP.
- `tests/smoke_frontend.py`, `tests/e2e_http.py`: kiểm tra HTTP trên ứng dụng đang chạy.
- [Checklist trình duyệt](tests/browser-checklist.md): thao tác học thực tế, responsive, ảnh/audio, AI và dữ liệu sau restart.

## Giới hạn kết quả

Unit test hoặc mock S3/AI không xác nhận kết nối AWS hay nhà cung cấp thật. Kiểm thử PostgreSQL cần database test riêng; kiểm tra HTTP/trình duyệt cần ứng dụng đang hoạt động. Kết quả test tĩnh không chứng minh giao diện không tràn hoặc hạ tầng đã cấu hình đúng.

Ghi rõ ngày, phiên bản mã, môi trường, số test đạt/bỏ qua và phần chưa kiểm chứng khi lập biên bản.

## Rà soát ngày 09/11/2026

Sau khi gỡ công cụ cài đặt, bộ unittest offline còn lại đạt **23/23**. Kiểm tra liên kết Markdown nội bộ không có liên kết hỏng; `git diff --check` đạt. Không chạy kiểm thử AWS hoặc thay đổi tài nguyên AWS trong lần rà soát này.

## Màn đăng nhập với nhân vật mầm xanh — 09/11/2026

Đã bỏ Google/Facebook, endpoint OAuth và cấu hình mẫu tương ứng; email/mật khẩu tiếp tục sử dụng luồng xác thực hiện có. Nhân vật xanh mới được backend phục vụ qua API ảnh, xuất hiện trên trang chào, đăng nhập và đăng ký. Các migration đã áp dụng được giữ nguyên để không đổi checksum hoặc xóa dữ liệu cũ.

Kiểm tra sau thay đổi: **59 test Python đạt, 1 bỏ qua** do chưa có database test riêng; **38 test Node đạt**; TypeScript và production build đạt. Test render xác nhận cả hai form có nhân vật, trường email/mật khẩu và không có nút mạng xã hội. Các đường dẫn đăng nhập OAuth cũ trả 404 trong test ASGI. SHA256 ảnh và liên kết tài liệu hợp lệ. Chưa xác minh bố cục/focus bằng trình duyệt thật hoặc gọi AWS trong lần kiểm tra này.
