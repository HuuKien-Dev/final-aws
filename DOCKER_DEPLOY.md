# Triển khai frontend và backend bằng Docker

Ứng dụng có hai image độc lập:

- `vuon-xa-frontend`: Next.js, cổng `3000`. Container này nhận `BACKEND_URL` và chuyển tiếp các yêu cầu `/api/*` sang backend.
- `vuon-xa-backend`: FastAPI, cổng `8000`. Container này nhận `DATABASE_URL` để kết nối PostgreSQL.

Trình duyệt chỉ gọi frontend. Vì vậy `BACKEND_URL` có thể là IP private, DNS nội bộ hoặc tên service mà container frontend truy cập được; không cần công khai địa chỉ database cho frontend.

## Build hai image riêng

Chạy tại thư mục gốc dự án:

```bash
docker build -t vuon-xa-frontend:latest -f frontend/Dockerfile frontend
docker build -t vuon-xa-backend:latest -f backend/Dockerfile .
```

## Chạy bằng hai Docker Compose độc lập

Backend và frontend có file Compose và file biến môi trường riêng. Hai project có tên
khác nhau nên có thể khởi động, cập nhật hoặc dừng độc lập, kể cả khi chạy trên cùng
một máy.

Tạo file cấu hình từ mẫu:

```bash
cp .env.backend.example .env.backend
cp .env.frontend.example .env.frontend
```

Sửa `.env.backend` trên máy backend và `.env.frontend` trên máy frontend. Sau đó build:

```bash
docker compose --env-file .env.backend -f compose.backend.yaml build
docker compose --env-file .env.frontend -f compose.frontend.yaml build
```

Khởi tạo database trước lần chạy đầu tiên:

```bash
docker compose --env-file .env.backend -f compose.backend.yaml run --rm backend \
  python /app/database/manage.py migrate
docker compose --env-file .env.backend -f compose.backend.yaml run --rm backend \
  python /app/database/manage.py seed
```

Khởi động backend và frontend độc lập:

```bash
docker compose --env-file .env.backend -f compose.backend.yaml up -d
docker compose --env-file .env.frontend -f compose.frontend.yaml up -d
```

Khi triển khai trên hai máy, chỉ cần chép source/image và file tương ứng sang từng máy:

- Máy backend: `compose.backend.yaml` và `.env.backend`.
- Máy frontend: `compose.frontend.yaml` và `.env.frontend`.

`BACKEND_URL` trong `.env.frontend` phải là địa chỉ mà chính container frontend truy
cập được, ví dụ `http://10.0.2.15:8000` hoặc `https://api.example.com`. Không dùng
`http://backend:8000` khi hai Compose độc lập, trừ khi bạn tự cấu hình Docker network
dùng chung và DNS alias tương ứng.

File `compose.yaml` chung vẫn được giữ cho môi trường phát triển và bài kiểm thử Docker
tự động; triển khai production sử dụng hai file Compose ở trên.

## Chạy riêng trên hai máy hoặc hai dịch vụ cloud

Backend kết nối database cloud:

```bash
docker run -d --name vuon-xa-backend --restart unless-stopped \
  -p 8000:8000 \
  -e 'DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/DB_NAME?ssl=require' \
  -e 'APP_ORIGIN=https://learn.example.com' \
  -e COOKIE_SECURE=true \
  vuon-xa-backend:latest
```

Frontend gọi backend qua IP private hoặc DNS nội bộ:

```bash
docker run -d --name vuon-xa-frontend --restart unless-stopped \
  -p 3000:3000 \
  -e BACKEND_URL=http://10.0.2.15:8000 \
  vuon-xa-frontend:latest
```

Nếu backend có HTTPS và domain riêng, dùng `BACKEND_URL=https://api.example.com`. Không thêm `/api` ở cuối vì frontend tự nối đường dẫn này.

`APP_ORIGIN` phải khớp chính xác địa chỉ public của frontend, gồm giao thức và cổng nếu có. Ví dụ người dùng mở `https://learn.example.com` thì backend phải có `APP_ORIGIN=https://learn.example.com`. Khi dùng HTTPS, đặt `COOKIE_SECURE=true`.

Nếu dùng model hoặc endpoint AI tùy chỉnh, thêm `AI_BASE_URL` và `AI_MODEL` vào phần `environment` của backend. Với các nhà cung cấp mặc định, không khai báo hai biến này để backend sử dụng cấu hình mặc định.

## Ảnh, logo và audio qua S3 Gateway Endpoint

Tải toàn bộ tài nguyên lên một bucket private:

```bash
bash scripts/upload-assets-s3.sh BUCKET_NAME ap-southeast-1
```

Cấu hình container backend:

```env
ASSET_STORAGE=s3
S3_ASSET_BUCKET=BUCKET_NAME
S3_IMAGE_PREFIX=media
S3_AUDIO_PREFIX=audio
AWS_REGION=ap-southeast-1
```

Backend dùng AWS SDK với IAM Role của EC2/ECS. Không khai báo access key trong container và không đặt S3 URL trong frontend. Route table của subnet backend phải gắn với S3 Gateway Endpoint; AWS sẽ route lời gọi S3 chuẩn qua endpoint này. Không đặt URL của Gateway Endpoint vào `BACKEND_URL` hoặc cấu hình SDK.

Gắn quyền mẫu [IAM đọc S3](deploy/iam-backend-s3-read.json) vào role backend và áp dụng [endpoint policy mẫu](deploy/s3-gateway-endpoint-policy.json) cho Gateway Endpoint sau khi thay `BUCKET_NAME`. Bucket giữ Block Public Access; frontend gọi `/api/media/*`, `/api/picture-assets/*` và `/api/audio/*` qua backend.

## Mạng và firewall

- Cho phép người dùng hoặc load balancer truy cập cổng frontend.
- Chỉ cho phép máy/container frontend hoặc load balancer nội bộ truy cập cổng backend.
- Chỉ cho phép backend truy cập PostgreSQL cổng `5432`.
- Không mở PostgreSQL cho frontend hoặc Internet công cộng.

Kiểm tra trạng thái:

```bash
curl http://FRONTEND_HOST:3000/health
curl http://BACKEND_HOST:8000/health
```

Health check backend chỉ trả thành công khi kết nối được database, migration đã áp dụng và dữ liệu bài học đã được seed.

## Build và kiểm tra Docker tự động

Lệnh sau tạo PostgreSQL tạm, build lại hai image, chạy migration/seed và kiểm tra toàn bộ luồng frontend → backend → database:

```bash
bash scripts/test-docker.sh
```

Database và container thử nghiệm được xóa sau khi kiểm tra; hai image đã build được giữ lại. Frontend thử nghiệm dùng cổng `33000`, backend dùng cổng `38000` để tránh trùng với dịch vụ local thông thường.
