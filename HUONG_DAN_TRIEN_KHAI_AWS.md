# Hướng dẫn triển khai English Learning App lên AWS

Tài liệu này triển khai **mô hình đang ghi trong README của dự án**: VPC `final-aws` có sẵn, Public ALB, Frontend ASG private, Internal ALB, Backend ASG private, RDS PostgreSQL Single-AZ và Bastion. Không có ảnh sơ đồ/ID AWS cụ thể được cung cấp; mọi ID bên dưới phải thay bằng tài nguyên thật trong tài khoản của bạn. Đây là hướng dẫn thao tác, **chưa tạo hay thay đổi tài nguyên AWS**.

Bản cập nhật có thêm: tất cả ảnh và logo trong S3 private; frontend gọi endpoint backend để lấy ảnh; một nhà cung cấp AI được cấu hình ở backend; OAuth Google/Facebook tùy chọn. Không dùng Redis, Docker, CloudFront hoặc WebSocket cho hội thoại AI hiện tại.

## 1. Sơ đồ và nguyên tắc kết nối

```mermaid
flowchart TD
  Browser[Trình duyệt HTTPS] --> Public[Public ALB :443]
  Public --> Front[Frontend ASG private / Next.js :3000]
  Front -->|Mọi /api request| Internal[Internal ALB :80]
  Internal --> Back[Backend ASG private / FastAPI :8000]
  Back -->|RDS endpoint / TLS :5432| RDS[(RDS PostgreSQL Single-AZ)]
  Back -->|S3 API / IAM Role| Images[(S3 ảnh và logo PRIVATE)]
  Front -->|IAM Role| Releases[(S3 release PRIVATE)]
  Back -->|IAM Role| Releases
  Front --> Secrets[Secrets Manager]
  Back --> Secrets
  Back -->|HTTPS qua NAT khi bật| AI[Một nhà cung cấp AI]
  Back -->|HTTPS qua NAT khi bật| OAuth[Google / Facebook OAuth]
  Admin[Máy quản trị] --> Bastion[Bastion public / SSH]
  Bastion --> Front
  Bastion --> Back
```

- Frontend không truy cập RDS, không giữ API key, không giữ tệp ảnh runtime.
- Ví dụ trình duyệt lấy ảnh: `https://YOUR_DOMAIN/api/picture-assets/leaf.jpg`; lấy logo: `/api/media/logo.png`.
- Next proxy chuyển request vào Internal ALB; backend dùng IAM Role đọc object S3 rồi trả bytes. Bucket ảnh **không public**, không gửi access key hoặc URL bucket cho browser.
- Backend kết nối database bằng RDS DNS endpoint trong DATABASE_URL, cổng 5432 và TLS. RDS endpoint không phải HTTP URL và không phải VPC interface endpoint bắt buộc tạo riêng.
- Bản ảnh nguồn trên máy build nằm trong `assets/`, để upload. Bản EC2 frontend chỉ có mã, metadata và URL endpoint. Bản release không đóng gói thư mục ảnh nguồn `assets/`.
- Session, flashcard, bài làm, góp ý, quota và nhận xét AI nằm trong PostgreSQL. Thay EC2 không làm mất dữ liệu; không bật sticky sessions.

## 2. Chuẩn bị bảng thông tin trước khi làm

Đăng nhập AWS Console bằng tài khoản/role triển khai của bạn. Không gửi access key hoặc DB password vào chat. Các lệnh AWS CLI trong tài liệu chạy trên máy quản trị có AWS CLI v2 và phiên xác thực hợp lệ, hoặc EC2 được gắn IAM Role tương ứng.

| Thông tin | Giá trị cần ghi |
| --- | --- |
| Region | Ví dụ `ap-southeast-1`; chọn đúng region của VPC |
| Account ID | 12 chữ số từ tài khoản của bạn |
| VPC | ID thật của `final-aws` |
| Public subnet A/B | Hai subnet khác AZ, route tới Internet Gateway |
| Private app subnet A/B | Hai subnet khác AZ cho ALB internal và app |
| Private DB subnet A/B | Hai subnet khác AZ cho DB subnet group |
| Bastion | Instance ID và public IP/DNS đang dùng |
| Tên miền app | Ví dụ `english.YOUR_DOMAIN` |
| ACM certificate | ARN certificate ở cùng region với Public ALB |
| Bucket release | Tên mới riêng, ví dụ `english-release-ACCOUNT-REGION` |
| Bucket ảnh | Tên mới riêng, ví dụ `english-images-ACCOUNT-REGION` |
| Image prefix | Ví dụ `media/english-20261108-1` |
| RDS endpoint | DNS lấy sau khi DB Available |
| AMI và architecture | Ubuntu/Python giống máy build; x86_64 hoặc arm64 đồng nhất |

Tên bucket S3 phải duy nhất toàn AWS. Không dùng tên `ACCOUNT`/`REGION` nguyên văn. Không tạo lại VPC/subnet nếu đã có; vào VPC Console kiểm tra ID, AZ và route table của mô hình hiện tại.

Trên máy CLI có thể đặt các biến không bí mật:

```bash
export AWS_DEFAULT_REGION=ap-southeast-1
export IMAGE_BUCKET=REPLACE_UNIQUE_IMAGE_BUCKET
export RELEASE_BUCKET=REPLACE_UNIQUE_RELEASE_BUCKET
export IMAGE_PREFIX=media/english-20261108-1
export RELEASE_ID=english-20261108-1
```

Không tiếp tục các lệnh tạo/upload cho tới khi đã thay mọi `REPLACE_...` bằng giá trị thật.

## 3. Mạng, subnet và đường ra ngoài

Trong **VPC → Your VPCs**, chọn `final-aws` và kiểm tra DNS resolution/DNS hostnames được bật.

Trong **Subnets → Route table**, kiểm tra:

| Loại subnet | Route cần có |
| --- | --- |
| Public | Route local của VPC và `0.0.0.0/0 → Internet Gateway` |
| Private frontend | Route local; truy cập S3/Secrets Manager bằng endpoint hoặc NAT |
| Private backend | Route local; S3/Secrets Manager endpoint; `0.0.0.0/0 → NAT Gateway` nếu dùng AI/OAuth Internet |
| Private database | Route local; không cần Internet Gateway cho RDS |

EC2 frontend/backend không gán public IP. NAT đặt ở public subnet có route Internet Gateway và Elastic IP. Nếu dùng một NAT cho demo thì đường ra ngoài phụ thuộc AZ đó; nếu cần dự phòng theo AZ, dùng NAT phù hợp từng private route table.

Tạo **S3 Gateway Endpoint**: VPC → Endpoints → Create → service `com.amazonaws.REGION.s3` → type Gateway → chọn VPC và các private route table của app/release runner. Gateway endpoint không có Security Group.

Tạo **Secrets Manager Interface Endpoint** khi muốn truy cập private: service `com.amazonaws.REGION.secretsmanager` → chọn private subnets → Enable private DNS → gắn `sg-endpoints` ở phần dưới. Endpoint policy và IAM Role đều phải cho phép đúng secret. [AWS: Secrets Manager VPC endpoint](https://docs.aws.amazon.com/secretsmanager/latest/userguide/vpc-endpoint-overview.html).

S3/Secrets Manager endpoints **không** cung cấp kết nối tới OpenAI, DeepSeek, Google, Facebook hoặc Colab. Backend cần NAT/egress hợp lệ cho những tính năng này. Security Group không hỗ trợ allowlist theo tên miền; nếu dùng SG outbound TCP 443 tới `0.0.0.0/0`, luồng đi qua NAT. Có thể dùng egress proxy được quản trị nếu hạ tầng của bạn đã có.

Không chỉnh NACL sang giới hạn chặt khi chưa có bảng port tương ứng. NACL tùy chỉnh phải cho phép cả chiều request và ephemeral response; SG là stateful.

## 4. Tạo Security Group

EC2 → Security Groups → Create security group. Tất cả SG thuộc cùng VPC. Với quy tắc tham chiếu SG, chọn **ID SG**, không nhập public IP của EC2 app.

| SG | Inbound | Outbound cần thiết |
| --- | --- | --- |
| `sg-public-alb` | TCP 443 và 80 từ Internet | TCP 3000 tới `sg-frontend` |
| `sg-frontend` | TCP 3000 từ `sg-public-alb`; TCP 22 từ `sg-bastion` | TCP 80 tới `sg-internal-alb`; HTTPS tới S3 prefix list/Secrets Manager endpoint hoặc NAT theo cấu hình |
| `sg-internal-alb` | TCP 80 từ `sg-frontend` | TCP 8000 tới `sg-backend` |
| `sg-backend` | TCP 8000 từ `sg-internal-alb`; TCP 22 từ `sg-bastion` | TCP 5432 tới `sg-rds`; HTTPS tới S3/Secrets Manager; TCP 443 ra NAT nếu AI/OAuth bật |
| `sg-rds` | TCP 5432 từ `sg-backend` và `sg-release-runner` | Theo policy DB hiện có; không cần mở Internet cho app |
| `sg-bastion` | TCP 22 chỉ từ IP quản trị `/32` | TCP 22 tới frontend/backend/release runner |
| `sg-release-runner` | TCP 22 từ Bastion | TCP 5432 tới RDS; HTTPS tới S3/Secrets Manager; Internet lúc chuẩn bị công cụ nếu cần |
| `sg-endpoints` | TCP 443 từ frontend/backend/release runner | Response theo stateful SG |

Không mở 3000, 8000 hoặc 5432 từ `0.0.0.0/0`. Không cho frontend đọc DB chỉ để sửa lỗi kết nối: phải sửa đường frontend → Internal ALB → backend.

## 5. Tạo bucket ảnh mới và lưu toàn bộ ảnh vào S3

### 5.1. Tạo bằng Console

S3 → Create bucket:

1. Chọn **General purpose**, tên bucket ảnh duy nhất, region giống app.
2. Object Ownership: **Bucket owner enforced**; ACL disabled.
3. Giữ **Block all public access** bật.
4. Bật **Bucket Versioning**.
5. Default encryption: **SSE-S3** cho bản hướng dẫn này.
6. Create bucket. Không thêm bucket policy public và không bật static website hosting.

Lặp lại để tạo bucket release riêng. Hai bucket có mục đích/quyền khác nhau.

Có thể dùng CLI thay Console; riêng `us-east-1` không truyền LocationConstraint:

```bash
aws s3api create-bucket \
  --bucket "$IMAGE_BUCKET" \
  --region "$AWS_DEFAULT_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_DEFAULT_REGION"

aws s3api put-public-access-block \
  --bucket "$IMAGE_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-versioning \
  --bucket "$IMAGE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$IMAGE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

Nếu region là `us-east-1`, dùng `aws s3api create-bucket --bucket "$IMAGE_BUCKET" --region us-east-1` cho lệnh đầu. Không chạy cả hai cách tạo cùng bucket.

### 5.2. Upload ảnh từ source trên máy bạn

Thư mục nguồn:

- `assets/picture-vocabulary/`: 6 ảnh học, manifest, giấy phép và ZIP.
- `assets/branding/`: 3 ảnh logo gốc.

Từ thư mục dự án trên máy có quyền upload bucket:

```bash
bash scripts/upload-images-s3.sh "$IMAGE_BUCKET" "$AWS_DEFAULT_REGION" "$IMAGE_PREFIX"
```

Script kiểm tra SHA256 trước upload, upload **9 tệp ảnh** và các tệp metadata/ZIP/ghi công. Không đặt ACL public, không upload `.env` hay khóa. Không dùng `--delete`, không xóa dữ liệu có sẵn trong bucket. Bucket mới cần quyền S3 ListBucket/GetBucketLocation để kiểm tra/sync và PutObject cho người upload; backend runtime chỉ cần đọc object.

Kiểm tra đã có đủ object:

```bash
aws s3 ls "s3://$IMAGE_BUCKET/$IMAGE_PREFIX/" --region "$AWS_DEFAULT_REGION"
```

Dùng prefix có version và không ghi đè ảnh của release cũ để rollback được. Khi thay bộ ảnh, upload prefix mới rồi đổi `S3_IMAGE_PREFIX` trong secret backend. Ảnh vẫn giữ giấy phép riêng trong manifest; không xóa thông tin ghi công.

### 5.3. Endpoint ảnh của app

| Request từ browser | Object S3 với prefix ví dụ |
| --- | --- |
| `/api/media/logo.png` | `media/english-20261108-1/logo.png` |
| `/api/picture-assets/leaf.jpg` | `media/english-20261108-1/leaf.jpg` |
| `/api/picture-assets/stars.jpg` | `media/english-20261108-1/stars.jpg` |
| `/api/picture-assets/vocabulary-images.zip` | `media/english-20261108-1/vocabulary-images.zip` |

Backend chỉ cho đọc tên tệp nằm trong allowlist, không nhận bucket/key tùy ý từ trình duyệt. Endpoint trả bytes, không redirect sang bucket và không cấp AWS key. Bucket trả 403 khi truy cập trực tiếp công khai là bình thường; app dùng IAM Role sẽ đọc được nếu cấu hình đúng.

## 6. Tạo RDS PostgreSQL private

RDS → Subnet groups → Create DB subnet group: chọn VPC hiện tại, thêm hai private DB subnets khác AZ. Single-AZ vẫn cần DB subnet group gồm tối thiểu hai AZ theo cấu hình RDS VPC. [AWS: DB trong VPC](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html).

RDS → Databases → Create database:

1. Standard create → PostgreSQL, phiên bản còn hỗ trợ và phù hợp ngân sách/tài khoản.
2. Chọn **Single DB instance / Single-AZ** đúng mô hình này; không chọn Aurora.
3. DB identifier, ví dụ `english-db`.
4. Master username/password dành riêng cho quản trị; cất trong Secrets Manager hoặc nơi quản lý bí mật của bạn.
5. Chọn instance class và storage phù hợp workload, bật encryption at rest; không đưa giá cố định vì chi phí phụ thuộc region/class.
6. VPC `final-aws`, DB subnet group vừa tạo, **Public access: No**.
7. Gắn `sg-rds`; port 5432.
8. Backup retention ví dụ 7 ngày, maintenance window rõ ràng, deletion protection nếu môi trường cần bảo vệ dữ liệu.
9. Đợi Available rồi sao chép **Endpoint DNS**, không dùng IP.

Single-AZ và ASG desired=1 giữ đúng mô hình demo nhưng không bảo đảm app không gián đoạn khi instance/AZ/DB lỗi.

### Tạo role/database ứng dụng

Dùng release runner trong VPC (bước 10), có psql và `sg-release-runner`, kết nối bằng master để tạo DB một lần:

```bash
psql "host=REPLACE_RDS_ENDPOINT port=5432 dbname=postgres user=REPLACE_DB_ADMIN sslmode=require" -W
```

Trong psql:

```sql
CREATE ROLE english_app LOGIN;
\password english_app
CREATE DATABASE english_app OWNER english_app;
\q
```

`\password` hỏi mật khẩu tương tác, không đặt mật khẩu trong command history. Nếu PostgreSQL yêu cầu quyền SET ROLE khi đặt owner, quản trị DB cấp membership phù hợp cho tài khoản tạo database rồi thực hiện lại; không biến role app thành superuser. Nếu role/DB đã có, kiểm tra và dùng lại, không drop dữ liệu.

App dùng `english_app`, không dùng master. URL password phải percent-encode các ký tự như `@`, `:`, `/`, `%`. Ví dụ secret DB dùng `postgresql://english_app:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/english_app?ssl=require`. Tham số này yêu cầu TLS; nếu cần xác minh CA/hostname chặt hơn, chuẩn bị RDS CA bundle và cấu hình asyncpg tương ứng trước khi đổi chính sách TLS.

## 7. Tạo Target Group và hai ALB

### 7.1. Target groups

EC2 → Target Groups → Create:

| Cấu hình | `tg-english-frontend` | `tg-english-backend` |
| --- | --- | --- |
| Target type | Instances | Instances |
| Protocol / port | HTTP / 3000 | HTTP / 8000 |
| VPC | VPC hiện tại | VPC hiện tại |
| Health check | HTTP GET `/health` | HTTP GET `/health` |
| Health check port | Traffic port | Traffic port |
| Matcher | 200 | 200 |
| Interval / timeout | 30s / 5s | 30s / 5s |
| Healthy / unhealthy threshold | 2 / 2 | 2 / 2 |

Chưa cần đăng ký EC2 thủ công; ASG sẽ đăng ký target. Để stickiness tắt. Có thể đặt deregistration delay 120 giây để có khoảng chờ cho request AI đang xử lý. Target không Healthy thì xem reason code; không đổi health path sang `/` để che lỗi migration/DB. [AWS: ALB health checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html).

### 7.2. Internal ALB

EC2 → Load Balancers → Create Application Load Balancer:

1. Tên `alb-english-internal`, scheme **Internal**, IPv4 theo VPC hiện tại.
2. Chọn hai private app subnets khác AZ.
3. Gắn `sg-internal-alb`.
4. Listener **HTTP:80**, default forward `tg-english-backend`.
5. Create, đợi Active, lưu DNS nội bộ.

### 7.3. ACM, Public ALB và DNS

1. ACM ở **cùng region** với ALB → Request public certificate cho tên miền app → DNS validation → thêm CNAME được ACM cung cấp → đợi Issued.
2. Tạo `alb-english-public`, scheme **Internet-facing**, hai public subnets khác AZ, `sg-public-alb`.
3. Listener HTTPS:443 dùng certificate trên → default forward `tg-english-frontend`.
4. Listener HTTP:80 → redirect HTTPS:443, status 301.
5. Route 53 hosted zone → A/AAAA Alias phù hợp IP mode tới Public ALB; hoặc DNS CNAME subdomain nếu dùng nhà DNS khác.
6. Không tạo rule `/api/*` trên Public ALB chuyển trực tiếp backend. Mọi path vẫn tới frontend, Next mới proxy API.

Không dùng ALB DNS làm APP_ORIGIN nếu certificate chỉ cấp cho domain riêng. Domain HTTPS hợp lệ còn cần cho Secure cookie và quyền micro trong browser.

### 7.4. Timeout cho AI

Trên **cả hai ALB** → Attributes → Edit → **Connection idle timeout = 120 giây**. App giới hạn AI 80 giây, Next proxy 90 giây và browser 95 giây; ALB default 60 giây có thể ngắt request trước khi có nhận xét. Đây là idle timeout, khác HTTP client keepalive duration. [AWS: ALB attributes](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html).

Trong frontend secret đặt `KEEP_ALIVE_TIMEOUT=130000` (mili giây; standalone server của bản này đọc biến này). Backend systemd của bản mới đặt Uvicorn keep-alive 130 giây. Các giá trị này dành cho kết nối HTTP nhàn rỗi, không tăng giới hạn chấm AI lên vô hạn.

## 8. Secrets Manager: tách frontend và backend

Secrets Manager → Store a new secret → Other type of secret → **Plaintext**, không để giao diện lưu dưới dạng JSON key/value. Installer đọc SecretString thành systemd EnvironmentFile.

Để cấu hình theo release có thể rollback, tạo secret tên gắn release, ví dụ `english/20261108-1/frontend` và `/backend`. Installer hiện pin **secret ARN**, đọc AWSCURRENT khi boot; nó không pin VersionId của secret. Giữ secret cũ khi đổi LT.

### Frontend secret

```dotenv
BACKEND_URL=http://REPLACE_INTERNAL_ALB_DNS
KEEP_ALIVE_TIMEOUT=130000
```

Không có DB password, AI key hoặc AWS access key trong secret frontend.

### Backend secret

```dotenv
DATABASE_URL=postgresql://english_app:URL_ENCODED_PASSWORD@REPLACE_RDS_ENDPOINT:5432/english_app?ssl=require
APP_ORIGIN=https://REPLACE_APP_DOMAIN
COOKIE_SECURE=true
PICTURE_ASSET_STORAGE=s3
S3_IMAGE_BUCKET=REPLACE_IMAGE_BUCKET
S3_IMAGE_PREFIX=media/english-20261108-1
AWS_DEFAULT_REGION=ap-southeast-1
AI_PROVIDER=deepseek
AI_API_KEY=REPLACE_SERVER_SIDE_AI_KEY
AI_AUDIO_ENABLED=false
AI_DAILY_LIMIT=30
OAUTH_STATE_SECRET=REPLACE_RANDOM_STRING_AT_LEAST_32_CHARS
GOOGLE_CLIENT_ID=REPLACE_IF_ENABLED
GOOGLE_CLIENT_SECRET=REPLACE_IF_ENABLED
FACEBOOK_CLIENT_ID=REPLACE_IF_ENABLED
FACEBOOK_CLIENT_SECRET=REPLACE_IF_ENABLED
FACEBOOK_API_VERSION=v23.0
```

Các dòng OAuth chưa dùng phải **bỏ đi hoặc để rỗng**, không giữ chuỗi REPLACE_IF_ENABLED vì UI sẽ tưởng đã cấu hình. AI chưa dùng thì để AI_API_KEY rỗng. Không bao giờ dùng `PICTURE_ASSET_STORAGE=local` trên ASG: ảnh nguồn không nằm trong artifact runtime. Không đặt AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY; SDK dùng IAM Role của instance.

Nếu dùng OpenAI và muốn ghi âm → transcript / giọng đọc AI, đổi provider và bật audio theo [docs/AI-SETUP.md](docs/AI-SETUP.md). Một provider tại một thời điểm; không tự gọi API bên thứ hai khi chọn DeepSeek/Colab.

Google/Facebook: đăng ký callbacks `https://APP_DOMAIN/api/auth/oauth/google/callback` và `/facebook/callback` trong dashboard tương ứng. OAUTH_STATE_SECRET phải giống nhau trên mọi backend của cùng môi trường. Xem [docs/SOCIAL-LOGIN.md](docs/SOCIAL-LOGIN.md).

## 9. IAM Roles và instance profiles

IAM → Roles → Create role → Trusted entity AWS service → **EC2**. Tạo riêng:

- `english-frontend-role` / instance profile frontend.
- `english-backend-role` / instance profile backend.
- `english-release-runner-role` cho migration và kiểm tra trước phát hành.

Chọn **instance profile** trong Launch Template; không nhét access key vào user data. Người triển khai cần iam:PassRole phù hợp để gắn profile.

### Policy frontend runtime

Dựa vào `deploy/iam-runtime-example.json`, thay đúng bucket/key release và frontend secret ARN:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect":"Allow","Action":"s3:GetObjectVersion","Resource":"arn:aws:s3:::REPLACE_RELEASE_BUCKET/releases/english-20261108-1.tar.gz"},
    {"Effect":"Allow","Action":"secretsmanager:GetSecretValue","Resource":"REPLACE_FRONTEND_SECRET_ARN"}
  ]
}
```

### Policy backend runtime

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect":"Allow","Action":"s3:GetObjectVersion","Resource":"arn:aws:s3:::REPLACE_RELEASE_BUCKET/releases/english-20261108-1.tar.gz"},
    {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::REPLACE_IMAGE_BUCKET/media/english-20261108-1/*"},
    {"Effect":"Allow","Action":"secretsmanager:GetSecretValue","Resource":"REPLACE_BACKEND_SECRET_ARN"}
  ]
}
```

Backend không cần ListBucket để đọc ảnh bằng key cố định, không cần PutObject/DeleteObject. Frontend không cần quyền bucket ảnh; toàn bộ đọc ảnh diễn ra ở backend. Người upload ảnh và runtime là hai bộ quyền khác nhau.

Nếu chọn SSE-KMS thay SSE-S3, thêm quyền KMS đúng key trong IAM và key policy. Với bucket private/endpoint policies, kiểm tra không có Deny chặn object/role. Release runner cần GetObjectVersion release, GetSecretValue backend và đường mạng tới RDS; không cần dùng role frontend.

## 10. Chuẩn bị AMI và máy build

Dùng Ubuntu builder **cùng architecture, cùng Python minor và nền hệ điều hành tương thích EC2 runtime**. Không build wheel Python 3.14 trên máy Ubuntu hiện tại rồi dùng runtime Python 3.12: script download wheel sẽ không đổi ABI cho bạn.

Ví dụ chọn Ubuntu 24.04 x86_64/Python 3.12 cho cả builder và AMI. Dùng một EC2 builder tạm có Internet. Builder không phải ASG runtime.

1. Chuyển source dự án tới builder bằng cách được quản trị cho phép, gồm `deploy/`, frontend/backend/database và ảnh nguồn nếu máy này sẽ upload.
2. Cài curl, xz-utils, ca-certificates; cài Node bằng `sudo bash deploy/install-node.sh`. Script kiểm checksum, ghi bản Node thực tế vào hồ sơ release.
3. Cài AWS CLI v2 theo [hướng dẫn chính thức](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), xác minh gói theo quy trình quản trị.
4. Chạy:

   ```bash
   sudo bash deploy/prepare-ami.sh
   /usr/local/bin/node --version
   python3 --version
   aws --version
   test -x /usr/local/sbin/english-install-release
   ```

5. Tạo AMI từ máy đã chuẩn bị công cụ bằng EC2 → Actions → Image and templates → Create image. Đợi AMI Available. Dùng AMI ID này trong cả hai LT.
6. Không đóng gói backend/.env, file key SSH, AWS credentials hoặc dữ liệu phiên vào AMI. Nếu builder từng dùng credentials, thực hiện quy trình làm sạch trước khi chụp AMI; tốt hơn là dùng máy chuẩn bị AMI không chứa secret.

## 11. Đóng gói và upload release

Trên builder matching AMI, ở root source:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
export PATH="$PWD/.venv/bin:$PATH"
bash deploy/package-release.sh "$RELEASE_ID"
```

Script tạo frontend production standalone, copy static/public, backend, curriculum/manifest, migrations 001–003, seed và Python wheels; xóa `.env*` thật khỏi artifact, chỉ giữ mẫu. Ảnh runtime được đọc từ S3, không nằm trong public frontend.

Upload bằng bucket release private đã bật versioning:

```bash
aws s3api put-object \
  --bucket "$RELEASE_BUCKET" \
  --key "releases/$RELEASE_ID.tar.gz" \
  --body "releases/$RELEASE_ID.tar.gz" \
  --server-side-encryption AES256 \
  --query VersionId --output text

cat "releases/$RELEASE_ID.tar.gz.sha256"
```

Ghi lại **bucket, key, VersionId, SHA256, AMI ID, secret ARNs, image bucket/prefix** vào hồ sơ release. Không dùng `latest` và không ghi đè key cùng version ứng dụng. VersionId và hash không phải secret.

## 12. Chạy migration và seed trước khi tạo ASG chạy app

Tạo EC2 release runner tạm từ AMI đã chuẩn bị, private subnet có đường tới RDS/S3/Secrets Manager, gắn `sg-release-runner` và role riêng. SSH qua Bastion bằng ProxyJump; không copy private key vào Bastion:

```bash
ssh -J ubuntu@REPLACE_BASTION_PUBLIC_IP ubuntu@REPLACE_RUNNER_PRIVATE_IP
```

Có thể cấu hình IdentityFile trên máy quản trị nếu hai host dùng key khác nhau. Không mở SSH trực tiếp vào private EC2 từ Internet.

Trên runner, điền các biến release không bí mật rồi tải đúng artifact:

```bash
export AWS_DEFAULT_REGION=ap-southeast-1
export RELEASE_BUCKET=REPLACE_RELEASE_BUCKET
export RELEASE_KEY=releases/english-20261108-1.tar.gz
export RELEASE_VERSION=REPLACE_S3_VERSION_ID
export RELEASE_SHA256=REPLACE_64_HEX_SHA256
export BACKEND_SECRET_ARN=REPLACE_BACKEND_SECRET_ARN

set -euo pipefail
set +x
umask 077
migration_dir="$(mktemp -d)"
aws s3api get-object --bucket "$RELEASE_BUCKET" --key "$RELEASE_KEY" \
  --version-id "$RELEASE_VERSION" "$migration_dir/release.tar.gz" >/dev/null
printf '%s  %s\n' "$RELEASE_SHA256" "$migration_dir/release.tar.gz" | sha256sum --check --status
mkdir "$migration_dir/app"
tar -xzf "$migration_dir/release.tar.gz" -C "$migration_dir/app"
python3 -m venv "$migration_dir/venv"
"$migration_dir/venv/bin/pip" install --no-index \
  --find-links="$migration_dir/app/wheels" -r "$migration_dir/app/backend/requirements.txt"
aws secretsmanager get-secret-value --secret-id "$BACKEND_SECRET_ARN" \
  --query SecretString --output text > "$migration_dir/backend.env"
set -a
source "$migration_dir/backend.env"
set +a
"$migration_dir/venv/bin/python" "$migration_dir/app/database/manage.py" migrate
"$migration_dir/venv/bin/python" "$migration_dir/app/database/manage.py" seed
unset DATABASE_URL AI_API_KEY GOOGLE_CLIENT_SECRET FACEBOOK_CLIENT_SECRET OAUTH_STATE_SECRET
rm -rf "$migration_dir"
unset migration_dir
```

Chỉ source EnvironmentFile do chính bạn quản lý với cú pháp shell tương thích; không source file từ nguồn không tin cậy. Không bật shell tracing, không cat backend.env. Nếu một bước lỗi, dừng và xử lý, không tiếp tục tạo ASG với DB chưa có schema. Sau kiểm tra, xóa runner theo quy trình hoặc giữ tắt; không để secret tạm trên máy không dùng.

Migration/seed chỉ chạy ở bước phát hành này. **Không đưa chúng vào systemd, user data hoặc ASG boot.** Backend health đòi schema mới và dữ liệu seed; ASG boot trước migration có thể liên tục thay instance Unhealthy.

## 13. Launch Templates

Sao chép nội dung `deploy/user-data-frontend.sh` và `deploy/user-data-backend.sh`, thay region, bucket/key/VersionId/SHA256 và secret ARN theo hồ sơ release. Không đặt DATABASE_URL, AI key hoặc client secret trong user data.

EC2 → Launch Templates → Create:

| Trường | Frontend LT | Backend LT |
| --- | --- | --- |
| Tên | `lt-english-frontend` | `lt-english-backend` |
| AMI | AMI đã chuẩn bị | AMI đã chuẩn bị |
| Instance type | Cùng architecture AMI, đủ RAM chạy Node | Cùng architecture, đủ RAM chạy Python |
| SG | sg-frontend | sg-backend |
| IAM instance profile | frontend profile | backend profile |
| Public IP | Disable | Disable |
| User data | frontend script đã thay placeholder | backend script đã thay placeholder |
| Metadata | IMDSv2 required | IMDSv2 required |

Để subnet cho ASG chọn; không hardcode một subnet trong LT. Nếu cần SSH, chọn key pair do bạn quản lý. Đặt volume phù hợp artifact, venv và logs. Ghi **LT version cụ thể**; không dùng `$Latest` khi phát hành/rollback.

Installer sẽ: tải đúng S3 object version → kiểm SHA256 → đọc đúng secret của role → tạo venv offline ở backend → cài systemd → start service → kiểm /health. Không chạy npm/pip qua Internet lúc ASG boot.

## 14. Tạo hai Auto Scaling Groups

EC2 → Auto Scaling Groups → Create, tạo lần lượt backend rồi frontend:

| Cấu hình | Backend ASG | Frontend ASG |
| --- | --- | --- |
| LT/version | Backend LT / version đã pin | Frontend LT / version đã pin |
| Subnets | Private app A/B | Private app A/B |
| Min / desired / max | 1 / 1 / 2 | 1 / 1 / 2 |
| Existing target group | tg-english-backend | tg-english-frontend |
| Health checks | EC2 + bật ELB health checks | EC2 + bật ELB health checks |
| Grace period | 300 giây | 300 giây |
| Warmup | 300 giây khởi điểm, điều chỉnh theo đo boot | Tương tự |

Không cần đăng ký target EC2 thủ công. Đợi backend Healthy trước khi kiểm luồng API của frontend. Theo dõi ASG Activity history nếu instance bị thay liên tục. ELB health checks giúp ASG thay target không khỏe; phải bật, không chỉ tạo ALB health check rồi bỏ qua cấu hình ASG. [AWS: ASG health checks](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html).

## 15. Xác minh toàn bộ đường đi

### Trong EC2 frontend/backend qua Bastion

```bash
sudo systemctl status english-frontend --no-pager
# Chạy ở frontend:
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://REPLACE_INTERNAL_ALB_DNS/health

# Chạy ở backend:
sudo systemctl status english-backend --no-pager
curl -fsS http://127.0.0.1:8000/health
curl -f http://127.0.0.1:8000/api/media/logo.png -o /tmp/english-logo-check.png
```

Không chạy lệnh status frontend trên máy backend rồi kết luận lỗi vì unit đó không có; mỗi tier cài unit riêng. Không cat `/etc/english/backend.env` khi chụp lỗi.

### Từ máy quản trị/browser

```bash
aws elbv2 describe-target-health --target-group-arn REPLACE_FRONTEND_TG_ARN
aws elbv2 describe-target-health --target-group-arn REPLACE_BACKEND_TG_ARN
curl -I http://REPLACE_APP_DOMAIN/
curl -I https://REPLACE_APP_DOMAIN/
curl -fsS https://REPLACE_APP_DOMAIN/health
curl -fsS https://REPLACE_APP_DOMAIN/api/topics
curl -f https://REPLACE_APP_DOMAIN/api/media/logo.png -o /tmp/english-logo-public-check.png
curl -f https://REPLACE_APP_DOMAIN/api/picture-assets/leaf.jpg -o /tmp/english-leaf-check.jpg
```

Kết quả mong đợi: cả hai TG Healthy; HTTP redirect HTTPS; HTTPS đúng certificate; /health status ok; /api/topics có 20 chủ đề/120 câu sau seed bản này; các endpoint ảnh trả bytes ảnh thay vì JSON lỗi/HTML.

Sau đó mở app để kiểm tra:

1. Đăng ký/email login, logout/login lại.
2. Học câu, yêu thích, đánh dấu thuộc, tạo/sửa/xóa bộ và thẻ cá nhân.
3. Chơi ghép/gõ từ; làm quiz, lưu bài dở, nộp và xem lịch sử.
4. Mở IELTS/chuyên ngành, nghe audio có sẵn, đáp án/transcript, lưu bài viết.
5. Mở Từ vựng qua ảnh: ảnh và logo tải qua `/api/…`, thử tải ZIP và thêm từ vào bộ.
6. Nếu AI bật: thử nhận xét bài viết, sửa toàn đoạn, hội thoại/bản chép lời và lộ trình. Với provider hỗ trợ audio, thử mic và giọng đọc trên HTTPS.
7. Nếu OAuth bật: login/cancel Google/Facebook và kiểm tra callback public domain.
8. DevTools Network: ảnh và API học cùng domain; không có bucket public URL, RDS DNS hoặc AI key trong browser. OAuth chủ động chuyển sang provider khi bấm login là đúng.

Chạy smoke/E2E HTTP bằng đúng source trên máy test:

```bash
python3 tests/smoke_frontend.py https://REPLACE_APP_DOMAIN
python3 tests/e2e_http.py --url https://REPLACE_APP_DOMAIN --phase prepare
# Thay backend bằng instance refresh rồi chạy:
python3 tests/e2e_http.py --url https://REPLACE_APP_DOMAIN --phase verify
```

Runner tạo tài khoản test và lưu cookie private dưới .tools; không xóa tài khoản/dữ liệu production tự động. Dùng [tests/browser-checklist.md](tests/browser-checklist.md) cho kiểm tra tương tác; file checklist không phải kết quả đã chạy.

## 16. Logs và chẩn đoán theo triệu chứng

| Triệu chứng | Kiểm tra trước |
| --- | --- |
| Public site không mở | DNS, certificate Issued, listener 443, ALB public hai subnet/IGW, SG 443 |
| ALB 502/503 | Target health/reason code; port đúng; service listen 0.0.0.0; SG tham chiếu đúng tier |
| Frontend Healthy nhưng API 503 | BACKEND_URL ở frontend secret; Internal ALB DNS/80; backend TG/8000; backend health |
| Backend health 503 | RDS endpoint/5432; SG-rds; TLS; password encoded; migration 001–003 và seed đã chạy |
| Logo/ảnh không tải | PICTURE_ASSET_STORAGE=s3; bucket/prefix đúng; tất cả ảnh đã upload; backend role GetObject; S3 endpoint policy |
| S3 AccessDenied | Phân biệt GetObject ảnh và GetObjectVersion release; object ARN có prefix; KMS nếu dùng; không sửa bằng cách public bucket |
| ASG thay instance liên tục | Activity history, cloud-init output, secret/plaintext format, artifact checksum, AMI/ABI Python |
| AI ngắt khoảng 60 giây | Idle timeout cả hai ALB phải 120s; kiểm timeout app/proxy/provider |
| AI không kết nối | NAT/egress backend 443, DNS, đúng base URL/key/model/quota; không sửa SG frontend để gọi AI |
| Login 403 Origin | APP_ORIGIN khớp chính xác HTTPS domain, không dấu / cuối; browser dùng domain đó |
| Cookie không giữ | HTTPS + COOKIE_SECURE=true; cùng origin; Next proxy giữ Set-Cookie; không cache API |
| OAuth lỗi callback | URI đăng ký ở provider khớp public domain; secret/callback/state; không dùng IP private |
| File env không đọc | SecretString phải plaintext EnvironmentFile, không phải JSON; systemd permissions 0600 |
| Không cài được wheel offline | Build khác Python minor/architecture với AMI; build lại artifact tương thích |
| Chữ/ảnh bản cũ | Xác nhận LT version/release hash đang chạy; reload browser; không chạy Next dev trên EC2 production |

Lệnh đọc logs trên đúng EC2:

```bash
sudo journalctl -u english-backend -n 100 --no-pager
sudo journalctl -u english-frontend -n 100 --no-pager
sudo tail -n 100 /var/log/cloud-init-output.log
readlink /opt/english/current
```

Không in secret/DB URL/token khi chia sẻ logs. User data hiện không bật set -x; giữ như vậy.

## 17. Phát hành bản mới và rollback

1. Build release ID mới trên builder matching AMI; upload artifact immutable, ghi VersionId/hash.
2. Upload ảnh vào prefix version mới nếu bộ ảnh thay đổi; giữ prefix cũ.
3. Tạo secret ARN theo release mới, gồm endpoint RDS, S3 prefix và AI/OAuth cần dùng.
4. Chạy migration/seed một lần ở runner trước rolling update; migration phải tương thích bản app cũ đang chạy.
5. Tạo LT version mới cho backend/frontend với đúng hash, VersionId, secret ARN.
6. Khởi động **Instance refresh backend**, chọn LT/version mới, rolling, minimum healthy 100%, maximum healthy 200%, warmup 300s theo thời gian boot thực tế. Desired 1, max 2 có khoảng để tạo máy mới trước khi dừng máy cũ. Xác nhận quota/instance capacity cho phép tăng tạm.
7. Đợi backend Healthy, kiểm API/DB/ảnh; sau đó refresh frontend tương tự. Dùng Skip matching tắt khi muốn bảo đảm thay toàn bộ máy theo cấu hình mới.
8. Chạy smoke, E2E verify, kiểm tra lịch sử/flashcard còn giữ sau khi máy cũ mất.

AWS giải thích minimum/maximum healthy và LT desired configuration trong [Instance refresh](https://docs.aws.amazon.com/autoscaling/ec2/userguide/instance-refresh-overview.html). Không scale-in/out để thay cho migration.

Rollback: dừng refresh đang lỗi theo Console, chọn lại **LT version cũ đã pin** và refresh để phục hồi app/config/ảnh cũ. Giữ artifact, AMI, secret ARN và image prefix cũ. Rollback app không tự hoàn tác schema/data. Nếu migration phá tương thích, phải dùng kế hoạch khôi phục DB/snapshot đã chuẩn bị, không tự drop bảng để app cũ chạy.

## 18. Hồ sơ bàn giao sau triển khai

Ghi lại ngoài secret: region/VPC/subnet/SG IDs, hai ALB DNS/ARN, hai TG ARN, ASG names, LT IDs/versions, AMI ID, release bucket/key/VersionId/hash, image bucket/prefix, hai secret ARN, RDS endpoint/identifier, domain/certificate ARN, ngày test và người thực hiện.

Chỉ đánh dấu hoàn tất khi: hai target group Healthy; HTTPS + redirect đúng; app login/quiz/thẻ/lưu bài hoạt động; ảnh/logo thực sự qua S3 backend endpoint; giữ dữ liệu qua thay backend; AI/OAuth đã test nếu bật. Tài liệu này và test offline không thay thế xác minh AWS thật.
