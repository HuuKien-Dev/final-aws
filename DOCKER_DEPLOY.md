# Triển khai frontend và backend bằng Docker

Ứng dụng có hai image dịch vụ độc lập:

- `frontend` (tên image và container): Next.js, cổng `3000`. Container này nhận `BACKEND_URL` và chuyển tiếp các yêu cầu `/api/*` sang backend.
- `backend` (tên image và container): FastAPI, cổng `8000`. Container này nhận `DATABASE_URL` để kết nối PostgreSQL.

Image thứ ba, `migration`, không phải dịch vụ chạy thường trực: container này chạy một lệnh (`migrate` hoặc `seed`) trên PostgreSQL rồi thoát. Image `backend` không chứa công cụ migration.

Trình duyệt chỉ gọi frontend. Vì vậy `BACKEND_URL` có thể là IP private, DNS nội bộ hoặc tên service mà container frontend truy cập được; không cần công khai địa chỉ database cho frontend.

Hạ tầng AWS nhiều máy (Route 53, load balancer, Auto Scaling, CloudWatch, Bedrock) được mô tả trong [hướng dẫn triển khai AWS](AWS_DEPLOY.md).

## Build các image riêng

Chạy tại thư mục gốc dự án:

```bash
docker build -t frontend:latest -f frontend/Dockerfile frontend
docker build -t backend:latest -f backend/Dockerfile .
docker build -t migration:latest -f database/Dockerfile database
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
docker compose --env-file .env.backend -f compose.migration.yaml build
```

Khởi tạo database trước lần chạy đầu tiên bằng container `migration`. Container này chỉ cần `DATABASE_URL`, nên dùng luôn `.env.backend` (hoặc một file env riêng chỉ có biến đó):

```bash
docker compose --env-file .env.backend -f compose.migration.yaml run --rm migration migrate
docker compose --env-file .env.backend -f compose.migration.yaml run --rm migration seed
```

Không có Compose thì chạy trực tiếp: `docker run --rm --name migration -e DATABASE_URL=... migration:latest migrate`.

**Khi cập nhật phiên bản:** build image `migration` và `backend` mới rồi chạy lại lệnh `migrate` ở trên **trước khi** khởi động container backend mới. Lệnh chỉ áp dụng các file migration còn thiếu và không xóa dữ liệu; chạy lại khi không có file mới thì không thay đổi gì. Backend mới báo `/health` lỗi 503 cho tới khi database có đủ migration của bản đó.

Khởi động backend và frontend độc lập:

```bash
docker compose --env-file .env.backend -f compose.backend.yaml up -d
docker compose --env-file .env.frontend -f compose.frontend.yaml up -d
```

Khi triển khai trên hai máy, chỉ cần chép source/image và file tương ứng sang từng máy:

- Máy backend: `compose.backend.yaml` và `.env.backend`.
- Máy chạy migration (thường chính là máy backend, vì cần tới được PostgreSQL): `compose.migration.yaml` và file env có `DATABASE_URL`.
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
docker run -d --name backend --restart unless-stopped \
  -p 8000:8000 \
  -e 'DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/DB_NAME?ssl=require' \
  -e 'APP_ORIGIN=https://learn.example.com' \
  -e COOKIE_SECURE=true \
  backend:latest
```

Frontend gọi backend qua IP private hoặc DNS nội bộ:

```bash
docker run -d --name frontend --restart unless-stopped \
  -p 3000:3000 \
  -e BACKEND_URL=http://10.0.2.15:8000 \
  frontend:latest
```

Nếu backend có HTTPS và domain riêng, dùng `BACKEND_URL=https://api.example.com`. Không thêm `/api` ở cuối vì frontend tự nối đường dẫn này.

`APP_ORIGIN` phải khớp chính xác địa chỉ public của frontend, gồm giao thức và cổng nếu có. Ví dụ người dùng mở `https://learn.example.com` thì backend phải có `APP_ORIGIN=https://learn.example.com`. Khi dùng HTTPS, đặt `COOKIE_SECURE=true`.

Nếu dùng model hoặc endpoint AI tùy chỉnh, đặt `AI_MODEL` và `AI_BASE_URL` trong `.env.backend`. Để trống hai biến này thì backend dùng cấu hình mặc định của nhà cung cấp.

### Gia sư AI qua Amazon Bedrock

Backend gọi Bedrock bằng Converse API, nên dùng được mọi model hỗ trợ Converse (Claude, Amazon Nova, Llama, Mistral…). Không cần đổi image hay cách chạy container.

1. Trong Bedrock console, bật quyền truy cập model và ghi lại **model ID** hoặc **inference profile ID** (ví dụ dạng `apac.…` / `global.…`).
2. Chọn một trong hai cách xác thực:
   - **IAM Role (khuyến nghị):** gắn policy [`deploy/iam-backend-bedrock-invoke.json`](deploy/iam-backend-bedrock-invoke.json) (thay `ACCOUNT_ID`, có thể giới hạn ARN model) vào instance profile EC2 hoặc task role ECS của backend. Để trống `AI_API_KEY`.
   - **Bedrock API key:** đặt `AI_API_KEY=<Bedrock API key>`; backend gửi key dạng bearer token tới `bedrock-runtime`.
3. Cấu hình `.env.backend`:

```env
AI_PROVIDER=bedrock
AI_MODEL=<model hoặc inference profile ID>
BEDROCK_REGION=ap-southeast-1
AI_API_KEY=
# Claude 5.x tự suy luận trước khi trả lời; phần này tính vào giới hạn token.
AI_MAX_TOKENS=16000
```

Backend trong subnet private không có NAT cần VPC **Interface Endpoint** `com.amazonaws.<region>.bedrock-runtime` (bật Private DNS). Khi dùng endpoint DNS riêng, đặt `AI_BASE_URL=https://<endpoint>`. Bedrock không hỗ trợ ghi âm/đọc mẫu của gia sư AI; nút 🔊 trong bài học dùng giọng đọc của trình duyệt nên vẫn hoạt động.

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
- Chỉ cho phép backend truy cập PostgreSQL cổng `5432`. Container `migration` cũng kết nối PostgreSQL, nên chạy nó trên máy backend hoặc máy có cùng quyền mạng.
- Không mở PostgreSQL cho frontend hoặc Internet công cộng.

Kiểm tra trạng thái:

```bash
curl http://FRONTEND_HOST:3000/health
curl http://BACKEND_HOST:8000/health
```

Health check backend chỉ trả thành công khi kết nối được database, migration đã áp dụng và dữ liệu bài học đã được seed.

## Build và kiểm tra Docker tự động

Lệnh sau tạo PostgreSQL tạm, build lại ba image, chạy migration/seed bằng container `migration` và kiểm tra toàn bộ luồng frontend → backend → database:

```bash
bash scripts/test-docker.sh
```

Database và container thử nghiệm được xóa sau khi kiểm tra; các image đã build được giữ lại. Frontend thử nghiệm dùng cổng `33000`, backend dùng cổng `38000` để tránh trùng với dịch vụ local thông thường.
