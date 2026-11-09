# Ảnh và ghi công

## Lưu trữ và đường đi

Toàn bộ ảnh, logo và audio của bản AWS nằm trong S3 private. Frontend chỉ giữ URL endpoint cùng origin. Ví dụ `/api/media/logo.png`, `/api/picture-assets/leaf.jpg`, `/api/audio/ielts-listening.wav`. Backend đọc S3 bằng IAM Role qua S3 Gateway Endpoint, không trả AWS credentials hoặc redirect public bucket cho browser. Dùng `scripts/upload-assets-s3.sh` để tải tài nguyên lên bucket.

Ảnh nguồn trên máy nằm riêng ở `assets/`, ngoài frontend. Local backend có thể đọc nguồn bằng chế độ local; artifact production không đóng gói nguồn ảnh. Source archive mã ứng dụng không chứa ảnh gốc; ảnh/ZIP và license được tải riêng qua endpoint.

## Logo FreeLingo

Nguồn ban đầu có sẵn: `/home/huukien/FreeLingo`; không sửa repo đó. Ba ảnh giữ nguyên byte:

| Nguồn | Bản nguồn trong dự án | Endpoint |
| --- | --- | --- |
| assets/logo.png | assets/branding/logo.png | /api/media/logo.png |
| assets/logo_large.png | assets/branding/logo_large.png | /api/media/logo_large.png |
| docs/assets/logo.png | assets/branding/docs-logo.png | /api/media/docs-logo.png |

SHA256 và provenance nằm trong `backend/app/branding-manifest.json` và metadata `frontend/public/freelingo-assets/asset-manifest.json`. Đây là metadata, không phải tệp ảnh frontend. Giữ giấy phép AGPL-3.0 nguồn tại `/LICENSE-FreeLingo.txt`, ghi công FreeLingo/HuuKien-Dev ở `/credits.html`, LICENSE và NOTICE. Không coi giấy phép thương mại là quyền đã mua.

## Demo học từ vựng qua ảnh

Sáu ảnh có sẵn từ gói Ubuntu Wallpapers được sao chép nguyên byte từ `/usr/share/backgrounds/` vào `assets/picture-vocabulary/`. Không tải được ảnh Internet vì DNS sandbox bị chặn; không dùng ảnh AI tạo trong bản demo cuối. Upstream: https://launchpad.net/ubuntu-wallpapers. Theo copyright của gói, các tệp chọn có giấy phép **CC BY-SA 4.0**; giữ nguyên license riêng của ảnh, không đổi sang AGPL của mã.

| Chủ đề | Từ học | Tác giả ảnh |
| --- | --- | --- |
| Thiên nhiên | leaf, forest, flower | mendhak |
| Động vật | raccoon, tail | cnusr25 (tranh minh họa) |
| Đồ vật | mug, handle, steam | ezspain (tranh minh họa) |
| Bầu trời & Thời tiết | lightning, cloud, star, sky | Valentino martinez ferreira, Hajime Mizuno |

Nguồn/tên gốc/hash/license đầy đủ ở `assets/picture-vocabulary/manifest.json` và `COPYRIGHT.txt`; bản metadata backend nằm ở `backend/app/picture-assets-manifest.json`. ZIP gồm sáu ảnh gốc và ghi công. Người học tải qua `/api/picture-assets/vocabulary-images.zip`; tải từng ảnh bằng nút trong mục học. Hình hiển thị object-fit:contain để giữ toàn cảnh; không cắt hoặc tạo lại ảnh gốc.

## Nhân vật mầm xanh

`assets/branding/green-mascot.png` là nhân vật mới, được tạo bằng công cụ `imagegen` cho trang chào và hộp thoại đăng nhập/đăng ký. PNG có nền trong suốt; prompt và nguồn tạo nằm trong `assets/branding/green-mascot.prompt.md`, SHA256 nằm trong `backend/app/branding-manifest.json`. Nhân vật này không thuộc bộ logo FreeLingo hoặc ảnh Ubuntu Wallpapers. Frontend lấy ảnh qua `/api/media/green-mascot.png`; backend phục vụ theo cùng cơ chế local/S3 của các ảnh khác.

## Âm thanh bài học

Sáu tệp `assets/audio/*-listening.wav` được tổng hợp cục bộ bằng eSpeak NG từ đoạn tự soạn trong `backend/app/curriculum.json`, giọng en-gb, tốc độ 145 từ/phút. Trên AWS, các tệp nằm dưới prefix `audio/` trong cùng bucket private và được backend phục vụ qua `/api/audio/{filename}`. Trình phát hỗ trợ HTTP Range để nghe và tua mà không công khai S3. Không phải ghi âm người thật hay đề IELTS chính thức. Không phân phối chương trình eSpeak trong app. Có script `scripts/generate-course-audio.py` để tạo lại khi công cụ có sẵn.
