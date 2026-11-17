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

## Bedrock, chuỗi ngày học và tối ưu — 14/11/2026

- **Amazon Bedrock:** `AI_PROVIDER=bedrock` gọi Converse API; không có `AI_API_KEY` thì dùng IAM Role (boto3), có key thì gọi bearer token qua HTTPS. Test mô phỏng cả hai đường, ánh xạ lỗi AWS (không lộ chi tiết lỗi gốc) và phản hồi bị cắt. Chưa gọi Bedrock thật.
- **Tối ưu:** `/api/progress` gộp 4 truy vấn đếm thành 1; migration `004_progress_indexes.sql` thêm index cho lịch sử/tiến độ; ảnh, logo, audio trả `Cache-Control: public, max-age=86400` qua cả backend và proxy Next (API vẫn `no-store`).
- **Tính năng:** chuỗi ngày học (múi giờ Asia/Ho_Chi_Minh), tỉ lệ đúng quiz, đổi mật khẩu, giới hạn đăng nhập sai, nút nghe phát âm, trộn flashcard.

Kiểm chứng: **72 test Python đạt, 1 bỏ qua** khi không có database; chạy riêng `tests/test_app.py` với PostgreSQL 16 tạm (Docker): **5/5 đạt**, gồm migration 001–004, streak/accuracy và đổi mật khẩu. **45 test Node đạt**; TypeScript và production build đạt. Smoke HTTP qua frontend production + backend thật: header cache ảnh, đăng ký, `/api/progress`, lần đăng nhập sai thứ 11 trả 429. Chưa kiểm tra bố cục mới bằng trình duyệt thật khi đã đăng nhập.

## Tính năng nâng cao và kiểm thử giao diện — 14/11/2026

- **Tính năng:** ôn tập ngắt quãng (migration `005_spaced_review.sql`, chu kỳ 1/3/7/14/30/60 ngày), quiz 5/10 câu và chế độ nghe, luyện nói so khớp từ bằng nhận diện giọng nói của trình duyệt, nhập nhiều thẻ/xuất CSV/trò "Nghe và gõ", tạo thẻ bằng AI, tìm câu không dấu.
- **Tối ưu:** bỏ 114 quy tắc CSS không còn dùng (72 KB → 66 KB trước khi thêm tính năng mới), ảnh có ETag/304 và cache ngắn trong bộ nhớ backend, nút không còn bị khóa chờ tải lại tiến độ.
- **Sửa trải nghiệm tìm được khi test bằng trình duyệt:** menu trái vừa màn hình 1366×768 (trước đó 4 mục cuối bị khuất), bộ lọc gọn một hàng, trên điện thoại thẻ flashcard hiện sớm hơn (~1370px → ~820px), header điện thoại một dòng và có nút đổi mật khẩu, thông báo tự ẩn và luôn nhìn thấy khi cuộn, sau đăng nhập trang về đầu, quiz báo "Đã chọn x/n câu", tổng quan/tiến độ tải lại số liệu khi mở, phụ đề riêng cho từng mục.

Kiểm chứng tự động: **77 test Python đạt, 1 bỏ qua** khi không có database; `tests/test_app.py` với PostgreSQL 16 tạm: **5/5 đạt** (migration 001–005, chu kỳ ôn 1→3→7 ngày, quiz 10 câu, nhập hàng loạt giữ thứ tự, đổi mật khẩu). Đường nâng cấp 004 → 005 trên database có sẵn dữ liệu: câu đã thuộc được gán hạn ôn. **51 test Node đạt**; TypeScript và production build đạt.

Kiểm thử giao diện bằng Firefox thật (WebDriver, headless) trên **hai container riêng** build từ `frontend/Dockerfile` và `backend/Dockerfile` (`compose.yaml` + `compose.test.yaml`, PostgreSQL tạm): 15 luồng người học ở cả 1366×768 và 390×844 — đăng ký, tìm chủ đề không dấu, bài học, câu giao tiếp, flashcard và phím tắt, ôn đến hạn, quiz 10 câu có lưu nháp và tải lại trang, tiến độ, flashcard cá nhân (thêm/sửa/xóa, nhập hàng loạt, CSV, ba trò chơi, bộ mẫu), từ qua ảnh, IELTS, gia sư AI khi chưa cấu hình, góp ý, đổi mật khẩu, liên kết trực tiếp. **15/15 đạt ở cả hai kích thước, không có lỗi JavaScript**; không tràn ngang, không có ảnh hỏng hay ô nhập thiếu nhãn. Container, database và volume thử nghiệm đã được xóa sau khi kiểm tra.

Chưa kiểm chứng: gọi AI thật (Bedrock và các nhà cung cấp khác, kể cả tạo thẻ bằng AI) — chỉ có test với phản hồi mô phỏng; luyện nói bằng micro thật (Firefox không có nhận diện giọng nói nên phần này chỉ được kiểm tra bằng unit test của thuật toán so khớp); âm thanh phát ra từ nút nghe; trình duyệt Chrome/Safari; triển khai AWS.
