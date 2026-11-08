# Đăng nhập Google và Facebook

Backend triển khai OAuth authorization-code flow, cookie state ký HMAC hết hạn 10 phút, kiểm tra state/provider và Google PKCE. Khóa app chỉ nằm ở backend. Không tự gộp tài khoản theo email để tránh chiếm tài khoản khi email trùng.

1. Tạo Google OAuth Web Client và/hoặc ứng dụng Meta có Facebook Login.
2. Điền Client ID và Client Secret trong backend/.env. Đặt OAUTH_STATE_SECRET là chuỗi ngẫu nhiên ít nhất 32 ký tự, dùng chung giữa các backend instance.
3. Đăng ký chính xác callback của mỗi bên:
   - `https://YOUR_DOMAIN/api/auth/oauth/google/callback`
   - `https://YOUR_DOMAIN/api/auth/oauth/facebook/callback`
4. APP_ORIGIN phải là origin public thực tế. Local dùng `http://localhost:3000` và callback tương ứng nếu nhà cung cấp cho phép; COOKIE_SECURE=false chỉ cho local HTTP.
5. Chọn FACEBOOK_API_VERSION còn được ứng dụng Meta hỗ trợ (mẫu hiện v23.0), hoàn thành cấu hình quyền email/public_profile và chế độ live/test theo dashboard của Meta.
6. Khởi động lại backend. Hai nút chỉ bật khi có đủ cấu hình; không có credential thì đăng nhập email vẫn dùng được.

Google cần email đã xác minh. Facebook dùng ID ổn định làm danh tính; nếu không cấp email thì app tạo định danh nội bộ `facebook-…@social.invalid`. Nếu email đã có tài khoản bằng phương thức khác, app yêu cầu đăng nhập bằng phương thức cũ, không tự liên kết. Chưa có UI liên kết nhiều nhà cung cấp vào cùng tài khoản.

Sau khi đăng nhập mạng xã hội, cookie phiên và dữ liệu học hoạt động như đăng nhập email. Token Google/Facebook không được lưu vào database hay trả cho frontend. Callback không nhận redirect đích tùy ý. Logout chỉ kết thúc phiên app, không đăng xuất tài khoản Google/Facebook trong trình duyệt.

Xác minh bằng credential của môi trường test trước khi public. Kiểm thử tự động hiện chỉ xác nhận state/PKCE/cookie và ranh giới request; không thay cho Google/Meta consent flow thật.

Tham khảo: [Google web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Facebook login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/).
