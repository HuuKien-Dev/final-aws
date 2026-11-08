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

## Mở rộng nội dung và tối ưu luồng học — 09/11/2026

- Giao tiếp: **400 câu / 20 chủ đề**, mỗi chủ đề 20 câu. Đã đối chiếu và giữ nguyên toàn bộ 120 câu ban đầu; khóa định danh seed không thay đổi.
- IELTS và 5 chuyên ngành: **180 từ/cụm từ**, 30 mục mỗi khóa, mỗi mục có nghĩa và ví dụ. Có tìm kiếm không dấu và xem thêm theo nhóm 10 từ.
- Từ qua ảnh: **24 từ / 4 nhóm**, 6 từ mỗi nhóm, dùng lại 6 ảnh có giấy phép hiện có.
- Thêm 6 bộ flashcard mẫu. Tạo bộ và thẻ trong cùng transaction; thao tác lặp lại mở bộ cá nhân hiện có, giữ thẻ đã sửa. Áp dụng giới hạn 100 bộ/tài khoản.
- Tổng quan có gợi ý học theo tiến độ, tìm kiếm chủ đề và bộ lọc. Menu thu gọn trên điện thoại, hỗ trợ Escape và liên kết bỏ qua menu; chuyển mục đưa người học về đầu nội dung. Các phần học lớn tải mã khi mở; tìm câu hủy request cũ khi đổi bộ lọc hoặc rời mục.

Kiểm chứng: **62 test Python đạt, 1 test tích hợp ban đầu bỏ qua** khi chưa có database; sau đó chạy riêng `tests/test_app.py` với PostgreSQL 18 tạm, **5/5 đạt**, bao gồm test tích hợp đã bỏ qua. Tổng cộng toàn bộ **63 test Python** được xác minh. Test tích hợp kiểm tra seed lặp lại, tiến độ sau restart, nhập 30 thẻ, mở lại không tạo trùng/ghi đè, và cách ly tài khoản. **6 tệp kiểm thử Node đều đạt** (42 trường hợp); TypeScript và production build đạt.

Firefox thật với bản production trên localhost và database tạm: đăng nhập qua form, tìm `an uong`, menu điện thoại, mở bộ CNTT 30 thẻ, lật thẻ, phân trang từ IELTS và hiển thị 24 từ qua ảnh đều đạt. Kiểm tra không tràn ngang trên desktop và viewport **390px** (WebDriver BiDi); ảnh được lưu ở `.tools/ui-review/`. Các server kiểm thử và trình duyệt đã được dừng sau kiểm tra.

Đây là kết quả trên mã nguồn local và database thử; chưa triển khai lên AWS hoặc cập nhật database đang phục vụ người dùng. File `database/sample.vi-en.json` đã có 400 câu để dùng với lệnh seed hiện có khi cập nhật môi trường thật. Git của workspace báo `bad object HEAD` do object rỗng; không thể dùng Git diff/commit để xác minh. Bản sao các tệp trước thay đổi được lưu ở `/tmp/english-app-before-optimization-20261109`.
