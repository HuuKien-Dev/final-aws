# Tài nguyên hình ảnh

- `picture-vocabulary/`: 6 ảnh Ubuntu Wallpapers, manifest, giấy phép, ghi công và ZIP; giữ giấy phép CC BY-SA 4.0 riêng.
- `branding/`: logo FreeLingo có nguồn/giấy phép riêng và nhân vật mầm xanh mới dùng trên trang chào, đăng nhập/đăng ký. Prompt của nhân vật nằm trong `branding/green-mascot.prompt.md`.

Frontend yêu cầu ảnh qua API cùng origin. Backend đọc bản gốc local hoặc S3 tùy môi trường; ảnh không nằm trong thư mục public của frontend. Manifest backend ghi đường dẫn và SHA256. Xem [ASSETS.md](../ASSETS.md) để biết nguồn và ghi công.
