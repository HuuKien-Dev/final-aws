# Tài nguyên hình ảnh

- `picture-vocabulary/`: 6 ảnh Ubuntu Wallpapers, manifest, giấy phép, ghi công và ZIP; giữ giấy phép CC BY-SA 4.0 riêng.
- `branding/`: logo FreeLingo có nguồn/giấy phép riêng và nhân vật mầm xanh mới dùng trên trang chào, đăng nhập/đăng ký. Prompt của nhân vật nằm trong `branding/green-mascot.prompt.md`.
- `audio/`: sáu tệp WAV cho bài luyện nghe, được backend đọc local hoặc từ S3 private.

Frontend yêu cầu ảnh, logo và audio qua API cùng origin. Backend đọc bản gốc local hoặc S3 tùy môi trường; các tệp không nằm trong thư mục public của frontend. Manifest backend ghi allowlist và SHA256. Xem [ASSETS.md](../ASSETS.md) để biết nguồn và ghi công.
