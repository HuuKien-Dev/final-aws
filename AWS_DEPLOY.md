# Triển khai trên AWS: Route 53, Auto Scaling, CloudWatch và Bedrock

Hướng dẫn này mở rộng [hướng dẫn Docker](DOCKER_DEPLOY.md) cho môi trường production nhiều máy trên AWS. Cách đóng gói và chạy ứng dụng **không đổi**:

- Vẫn là hai image/container riêng tên `frontend` và `backend`, chạy bằng `compose.frontend.yaml` và `compose.backend.yaml`.
- `migrate` / `seed` vẫn chạy thủ công khi phát hành, bằng container `migration` riêng; không chạy lúc EC2 khởi động và không nằm trong image `backend`.
- Ảnh, logo, audio vẫn do backend đọc từ bucket S3 private.

Phần thêm mới là hạ tầng xung quanh: tên miền (Route 53 + ACM), cân bằng tải, tự co giãn (EC2 Auto Scaling), giám sát (CloudWatch) và gia sư AI qua Amazon Bedrock.

## 1. Kiến trúc

```text
Người dùng ── https://learn.example.com
   │
Route 53 (public zone, bản ghi Alias)          ACM cấp chứng chỉ TLS
   ▼
ALB public :443 ──► target group frontend :3000
                     Auto Scaling Group frontend-asg (EC2, container "frontend")
                        │  BACKEND_URL=http://backend.english-app.internal
                        ▼
                     Route 53 private zone ──► ALB internal :80 ──► target group backend :8000
                     Auto Scaling Group backend-asg (EC2, container "backend")
                        ├──► RDS PostgreSQL :5432
                        ├──► S3 private (Gateway Endpoint)
                        └──► Amazon Bedrock (Converse API, IAM Role)

CloudWatch: log hai container, metric ALB / ASG / RDS / Bedrock, alarm ──► SNS (email)
```

Ứng dụng chạy nhiều instance được mà không cần sticky session, vì phiên đăng nhập và hạn mức AI mỗi ngày đều lưu trong PostgreSQL. Có một ngoại lệ cần biết: giới hạn 10 lần đăng nhập sai/15 phút được đếm **trong bộ nhớ của từng tiến trình backend**, nên với N instance backend giới hạn thực tế là khoảng N × 10. Nếu cần chặt hơn, thêm rate-based rule của AWS WAF trên ALB public cho đường dẫn `/api/auth/login`.

Các giá trị mẫu dùng trong tài liệu — thay bằng giá trị của bạn:

| Ký hiệu | Ý nghĩa |
| --- | --- |
| `ap-southeast-1` | Region triển khai |
| `ACCOUNT_ID` | ID tài khoản AWS (12 chữ số) |
| `learn.example.com` | Tên miền public của ứng dụng |
| `english-app.internal` | Private hosted zone trong VPC |
| `/english-app/prod/...` | Tiền tố Parameter Store và log group |
| `BUCKET_NAME` | Bucket S3 private chứa ảnh/audio |

## 2. Mạng và security group

Dùng một VPC trải trên **hai Availability Zone**:

| Subnet | Số lượng | Chứa gì | Route |
| --- | --- | --- | --- |
| Public | 2 | ALB public, NAT Gateway | Internet Gateway |
| Private app | 2 | EC2 frontend, EC2 backend, ALB internal | NAT Gateway + S3 Gateway Endpoint |
| Private DB | 2 | RDS | Chỉ nội bộ VPC |

EC2 trong subnet private cần đi ra ngoài để kéo image từ ECR, đọc Parameter Store, ghi CloudWatch Logs và gọi Bedrock. Cách đơn giản nhất là một NAT Gateway. Nếu không muốn dùng NAT, phải tạo đủ các Interface Endpoint `ecr.api`, `ecr.dkr`, `ssm`, `ssmmessages`, `ec2messages`, `logs`, `bedrock-runtime`; với hệ thống nhỏ, số endpoint này thường đắt hơn một NAT Gateway. Dù chọn cách nào, vẫn giữ **S3 Gateway Endpoint** (miễn phí) như mô tả trong hướng dẫn Docker.

EC2 kéo layer image của ECR cũng đi qua S3 Gateway Endpoint này. Vì vậy hãy để endpoint policy ở mức *Full access*; nếu áp dụng [endpoint policy mẫu](deploy/s3-gateway-endpoint-policy.json) (chỉ cho bucket của ứng dụng) thì phải thêm `arn:aws:s3:::prod-ap-southeast-1-starport-layer-bucket/*` vào `Resource`, nếu không máy mới không kéo được image.

Security group — mỗi lớp chỉ nhận từ lớp ngay trước nó:

| Security group | Cho phép vào | Từ |
| --- | --- | --- |
| `alb-public-sg` | 80, 443 | `0.0.0.0/0` |
| `frontend-sg` | 3000 | `alb-public-sg` |
| `alb-internal-sg` | 80 | `frontend-sg` |
| `backend-sg` | 8000 | `alb-internal-sg` |
| `rds-sg` | 5432 | `backend-sg` |

Không mở cổng SSH. Truy cập máy bằng **SSM Session Manager** (role ở mục 6 đã có quyền).

## 3. Route 53 và chứng chỉ ACM

1. **Public hosted zone:** tạo hosted zone cho tên miền (ví dụ `example.com`). Nếu tên miền mua ở nơi khác, đổi name server tại nhà đăng ký sang 4 bản ghi NS mà Route 53 cấp.
2. **Chứng chỉ:** vào ACM **ở cùng Region với ALB** (`ap-southeast-1`), yêu cầu chứng chỉ cho `learn.example.com`, chọn *DNS validation* rồi bấm *Create records in Route 53*. Chứng chỉ chuyển sang *Issued* sau vài phút.
3. **Private hosted zone:** tạo zone `english-app.internal`, gắn với VPC. Zone này cho frontend một địa chỉ backend cố định (`backend.english-app.internal`), không phụ thuộc IP của từng EC2.

Các bản ghi Alias trỏ tới load balancer được tạo ở mục 10, sau khi có ALB.

Backend chỉ chấp nhận **đúng một** origin (`APP_ORIGIN`). Nếu muốn có thêm tên khác như `www.example.com`, hãy thêm tên đó vào chứng chỉ và tạo rule trên ALB để **redirect** về tên chính; nếu để cả hai tên cùng phục vụ, mọi thao tác đăng nhập/lưu bài từ tên phụ sẽ bị trả `403 Nguồn yêu cầu không hợp lệ`.

## 4. Database: RDS PostgreSQL

- Engine PostgreSQL 16 (bản dùng trong bài kiểm thử Docker), đặt trong subnet private DB, gắn `rds-sg`, **không** bật Public access.
- Đặt *Initial database name* là `english_app`. Bật Multi-AZ nếu cần chịu lỗi một AZ; bật backup tự động.
- `DATABASE_URL` có dạng `postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/english_app?ssl=require` (URL-encode ký tự đặc biệt trong mật khẩu).

**Số kết nối:** mỗi instance backend mở tối đa 10 kết nối tới database. Chọn cỡ RDS sao cho `max_connections` lớn hơn `10 × số instance backend tối đa` cộng một ít dự phòng cho lệnh migrate. Các cỡ nhỏ nhất (1 GB RAM) chỉ có khoảng 100 kết nối trở xuống; kiểm tra bằng `SHOW max_connections;`.

## 5. Image trên ECR

Auto Scaling tự tạo máy mới nên image phải nằm ở nơi máy nào cũng kéo được. Tạo ba repository **một lần** (hai dịch vụ và image `migration`), rồi build và đẩy image theo mã commit:

```bash
REGION=ap-southeast-1
ACCOUNT_ID=123456789012
REGISTRY=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
TAG=$(git rev-parse --short HEAD)

aws ecr create-repository --region $REGION --repository-name frontend   # chỉ lần đầu
aws ecr create-repository --region $REGION --repository-name backend    # chỉ lần đầu
aws ecr create-repository --region $REGION --repository-name migration  # chỉ lần đầu

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY
docker build -t frontend:latest -f frontend/Dockerfile frontend
docker build -t backend:latest -f backend/Dockerfile .
docker build -t migration:latest -f database/Dockerfile database
for name in frontend backend migration; do
  docker tag $name:latest $REGISTRY/$name:$TAG
  docker push $REGISTRY/$name:$TAG
done
```

Image build trên máy x86_64 chỉ chạy trên EC2 x86_64 (`t3`, `m7i`…). Muốn dùng Graviton (`t4g`…) thì build thêm với `--platform linux/arm64`.

Trên EC2, image được gắn lại tên `frontend:latest` / `backend:latest` nên hai file Compose dùng nguyên trạng. Image `migration` không chạy trên máy của Auto Scaling; nó chỉ được kéo về khi bạn chạy migration (mục 9 và 14).

## 6. IAM role cho EC2

Tạo hai role (kèm instance profile) cho EC2:

| Role | Policy |
| --- | --- |
| `frontend-role` | `AmazonSSMManagedInstanceCore`, `AmazonEC2ContainerRegistryReadOnly`, policy cấu hình + log bên dưới (tier `frontend`) |
| `backend-role` | Như trên (tier `backend`) + [`deploy/iam-backend-s3-read.json`](deploy/iam-backend-s3-read.json) + [`deploy/iam-backend-bedrock-invoke.json`](deploy/iam-backend-bedrock-invoke.json) |

Policy đọc cấu hình và ghi log (đổi `backend` thành `frontend` cho role còn lại):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadTierConfig",
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:ap-southeast-1:ACCOUNT_ID:parameter/english-app/prod/backend/*"
    },
    {
      "Sid": "WriteContainerLogs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:ap-southeast-1:ACCOUNT_ID:log-group:/english-app/prod/backend:*"
    }
  ]
}
```

Frontend không có quyền đọc cấu hình backend, nên không thấy mật khẩu database. Nếu mã hóa tham số bằng KMS key tự quản (không phải `aws/ssm` mặc định), thêm `kms:Decrypt` cho key đó.

## 7. Cấu hình trong Parameter Store và log group

Máy mới tự lấy cấu hình lúc khởi động, nên file Compose, file `.env` và tag image được lưu trong SSM Parameter Store. Repo vẫn là nguồn gốc duy nhất của hai file Compose.

Chuẩn bị `.env.backend` và `.env.frontend` từ file mẫu như hướng dẫn Docker, với giá trị production:

```env
# .env.backend
APP_ORIGIN=https://learn.example.com
COOKIE_SECURE=true
DATABASE_URL=postgresql://USER:PASSWORD@RDS_ENDPOINT:5432/english_app?ssl=require
ASSET_STORAGE=s3
S3_ASSET_BUCKET=BUCKET_NAME
S3_IMAGE_PREFIX=media
S3_AUDIO_PREFIX=audio
AWS_REGION=ap-southeast-1
AI_PROVIDER=bedrock
AI_MODEL=<model hoặc inference profile ID>
BEDROCK_REGION=ap-southeast-1
AI_API_KEY=
AI_MAX_TOKENS=16000
AI_DAILY_LIMIT=30
AI_AUDIO_ENABLED=false
```

```env
# .env.frontend
BACKEND_URL=http://backend.english-app.internal
```

Đẩy lên Parameter Store (file `.env` là `SecureString` vì chứa mật khẩu):

```bash
for tier in frontend backend; do
  aws ssm put-parameter --region $REGION --overwrite --type String \
    --name /english-app/prod/$tier/compose --value file://compose.$tier.yaml
  aws ssm put-parameter --region $REGION --overwrite --type SecureString \
    --name /english-app/prod/$tier/env --value file://.env.$tier
  aws ssm put-parameter --region $REGION --overwrite --type String \
    --name /english-app/prod/$tier/image-tag --value "$TAG"
done
```

Tạo sẵn hai log group — container **không khởi động được** nếu log group chưa tồn tại:

```bash
for tier in frontend backend; do
  aws logs create-log-group --region $REGION --log-group-name /english-app/prod/$tier
  aws logs put-retention-policy --region $REGION --log-group-name /english-app/prod/$tier --retention-in-days 30
done
```

## 8. AMI và launch template

### AMI nền

Cài sẵn Docker và Compose vào một AMI để máy mới khởi động nhanh và không phụ thuộc Internet lúc scale-out. Bật một EC2 Amazon Linux 2023 tạm (AWS CLI và SSM Agent có sẵn), chạy:

```bash
sudo dnf install -y docker
sudo systemctl enable docker
COMPOSE_VERSION=v5.6.1   # bản đã chạy thử với hai file Compose của repo
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
  "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$(uname -m)"
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
sudo docker compose version
```

Sau đó tạo AMI từ máy này (*Actions → Image and templates → Create image*) và xóa máy tạm.

### Launch template

Tạo hai launch template `frontend-lt` và `backend-lt`:

| Thiết lập | Giá trị |
| --- | --- |
| AMI | AMI nền ở trên |
| Instance type | `t3.small` là điểm khởi đầu hợp lý cho mỗi tier |
| Key pair | Không cần (dùng Session Manager) |
| Public IP | Tắt |
| Security group | `frontend-sg` hoặc `backend-sg` |
| IAM instance profile | `frontend-role` hoặc `backend-role` |
| Metadata | IMDSv2 = Required, **hop limit = 2** |
| User data | Script bên dưới |

Hop limit phải là 2: backend chạy trong container nên cần thêm một bước mạng mới tới được metadata service để lấy thông tin xác thực của IAM role. Để hop limit 1 thì S3 và Bedrock đều báo thiếu thông tin xác thực.

User data dùng chung cho cả hai template, chỉ khác dòng `TIER`:

```bash
#!/bin/bash
set -euo pipefail

TIER=backend                # launch template frontend: TIER=frontend
REGION=ap-southeast-1
ACCOUNT_ID=123456789012
PREFIX=/english-app/prod/$TIER
APP_DIR=/opt/english-app
REGISTRY=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

param() {
  aws ssm get-parameter --region "$REGION" --name "$PREFIX/$1" \
    --with-decryption --query Parameter.Value --output text
}

# Log container đi thẳng lên CloudWatch Logs, mỗi instance một log stream.
TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')
INSTANCE_ID=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id)
cat >/etc/docker/daemon.json <<JSON
{
  "log-driver": "awslogs",
  "log-opts": {
    "awslogs-region": "$REGION",
    "awslogs-group": "/english-app/prod/$TIER",
    "tag": "$INSTANCE_ID/{{.Name}}",
    "mode": "non-blocking"
  }
}
JSON
systemctl restart docker

# Cấu hình và image của bản phát hành hiện tại.
install -d -m 700 "$APP_DIR"
param compose >"$APP_DIR/compose.$TIER.yaml"
(umask 077; param env >"$APP_DIR/.env.$TIER")
TAG=$(param image-tag)

aws ecr get-login-password --region "$REGION" |
  docker login --username AWS --password-stdin "$REGISTRY"
docker pull "$REGISTRY/$TIER:$TAG"
docker tag "$REGISTRY/$TIER:$TAG" "$TIER:latest"

cd "$APP_DIR"
docker compose --env-file ".env.$TIER" -f "compose.$TIER.yaml" up -d --no-build
```

Script không chạy migrate hay seed. Nếu máy không lên, xem `/var/log/cloud-init-output.log` qua Session Manager.

## 9. Khởi tạo database lần đầu

Backend báo `/health` 503 cho tới khi database có đủ migration và dữ liệu bài học. Vì vậy phải migrate và seed **trước khi** tạo Auto Scaling Group backend; nếu không, ASG sẽ liên tục thay máy "không khỏe".

1. Bật **một** EC2 tạm từ launch template `backend-lt` (*Launch instance from template*), trong subnet private app.
2. Mở Session Manager vào máy đó và chạy container `migration`. Nó dùng `DATABASE_URL` trong file env mà máy đã lấy về lúc khởi động:

```bash
REGION=ap-southeast-1
REGISTRY=123456789012.dkr.ecr.$REGION.amazonaws.com
TAG=$(aws ssm get-parameter --region $REGION --name /english-app/prod/backend/image-tag \
  --query Parameter.Value --output text)
aws ecr get-login-password --region $REGION | sudo docker login --username AWS --password-stdin $REGISTRY
sudo docker run --rm --name migration --env-file /opt/english-app/.env.backend \
  $REGISTRY/migration:$TAG migrate
sudo docker run --rm --name migration --env-file /opt/english-app/.env.backend \
  $REGISTRY/migration:$TAG seed
curl -s http://127.0.0.1:8000/health     # mong đợi {"status":"ok"}
```

`docker run --env-file` đọc nguyên văn từng dòng `TÊN=giá trị`, nên không đặt giá trị trong dấu nháy ở `.env.backend`.

3. Tải tài nguyên lên S3 nếu chưa làm: `bash scripts/upload-assets-s3.sh BUCKET_NAME ap-southeast-1` (chạy từ máy có source và quyền ghi bucket).
4. Xóa máy tạm.

## 10. Load balancer và bản ghi DNS

### Target group

| Target group | Giao thức / cổng | Health check | Ghi chú |
| --- | --- | --- | --- |
| `frontend-tg` | HTTP 3000 | `GET /health`, mã 200 | Deregistration delay 120 giây |
| `backend-tg` | HTTP 8000 | `GET /health`, mã 200, interval 30 giây, unhealthy threshold 5 | Deregistration delay 120 giây |

`/health` của backend có truy vấn database. Đặt unhealthy threshold cao (5 × 30 giây) để một lần RDS failover ngắn không làm ASG thay toàn bộ máy backend.

### Hai ALB

| ALB | Vị trí | Listener |
| --- | --- | --- |
| `public-alb` (internet-facing) | 2 subnet public, `alb-public-sg` | `80` → redirect sang HTTPS 443; `443` (chứng chỉ ACM) → forward `frontend-tg` |
| `internal-alb` (internal) | 2 subnet private app, `alb-internal-sg` | `80` → forward `backend-tg` |

**Đặt idle timeout của cả hai ALB là 120 giây** (mặc định 60). Một yêu cầu gia sư AI có thể chạy tới 80 giây ở backend và frontend chờ tối đa 90 giây; để 60 giây thì ALB cắt kết nối trước và người học thấy lỗi 504 dù Bedrock vẫn đang trả lời.

### Bản ghi Route 53

| Zone | Tên | Loại | Trỏ tới |
| --- | --- | --- | --- |
| Public `example.com` | `learn.example.com` | A – Alias | ALB `public-alb` (bật *Evaluate target health*) |
| Private `english-app.internal` | `backend.english-app.internal` | A – Alias | ALB `internal-alb` |

Bản ghi Alias miễn phí truy vấn và tự theo IP của ALB. `BACKEND_URL` không có `/api` và không cần cổng vì ALB internal nghe cổng 80.

## 11. Auto Scaling

Tạo hai Auto Scaling Group trên hai subnet private app, gắn với target group tương ứng:

```bash
aws autoscaling create-auto-scaling-group --region $REGION \
  --auto-scaling-group-name backend-asg \
  --launch-template 'LaunchTemplateName=backend-lt,Version=$Latest' \
  --min-size 2 --desired-capacity 2 --max-size 4 \
  --vpc-zone-identifier "subnet-APP_A,subnet-APP_B" \
  --target-group-arns BACKEND_TARGET_GROUP_ARN \
  --health-check-type ELB --health-check-grace-period 180 \
  --default-instance-warmup 120
```

Lặp lại cho `frontend-asg` với launch template và target group của frontend.

- **Min 2** để mỗi AZ có một máy và phát hành không gián đoạn. Dùng min 1 nếu ưu tiên chi phí, chấp nhận gián đoạn ngắn khi máy hỏng.
- **Health check type ELB** để ASG thay máy khi container không trả lời `/health`, không chỉ khi EC2 chết.
- **Grace period 180 giây** cho máy đủ thời gian kéo image và khởi động.
- **Max của backend** bị chặn bởi số kết nối RDS (mục 4).

Chính sách co giãn theo CPU (target tracking) cho cả hai nhóm:

```bash
for group in frontend-asg backend-asg; do
  aws autoscaling put-scaling-policy --region $REGION \
    --auto-scaling-group-name $group --policy-name cpu-50 \
    --policy-type TargetTrackingScaling \
    --target-tracking-configuration \
    '{"PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},"TargetValue":50}'
done
```

Target tracking tự tạo và quản lý các alarm CloudWatch của nó; không sửa tay các alarm tên `TargetTracking-...`.

**CPU không phản ánh tải AI.** Khi chờ Bedrock, backend gần như không tốn CPU, và mỗi instance chỉ xử lý đồng thời khoảng `số vCPU + 4` lời gọi Bedrock qua IAM role (6 trên máy 2 vCPU); yêu cầu vượt mức đó phải xếp hàng. Nếu gia sư AI được dùng nhiều, thêm cho backend một policy thứ hai theo số request mỗi máy và theo dõi alarm thời gian phản hồi ở mục 13:

```bash
aws autoscaling put-scaling-policy --region $REGION \
  --auto-scaling-group-name backend-asg --policy-name requests-per-target \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/internal-alb/ALB_ID/targetgroup/backend-tg/TG_ID"
    },
    "TargetValue": 600
  }'
```

`TargetValue` là số request **mỗi phút trên mỗi máy**; 600 chỉ là giá trị khởi đầu, hãy chỉnh theo số đo thực tế. Khi có nhiều policy, ASG lấy mức cần nhiều máy nhất. Tăng số máy backend **không** tăng hạn mức của Bedrock (mục 12).

## 12. Gia sư AI qua Amazon Bedrock

Phần cấu hình cơ bản đã có trong [hướng dẫn Docker](DOCKER_DEPLOY.md#gia-sư-ai-qua-amazon-bedrock). Với kiến trúc này:

1. **Chọn model:** dùng model hỗ trợ Converse API và ghi lại model ID hoặc inference profile ID (dạng `apac.…` / `global.…`) khả dụng ở Region của bạn. Kiểm tra trong Bedrock console rằng tài khoản đã dùng được model đó (model Anthropic yêu cầu khai báo mục đích sử dụng ở lần đầu).
2. **Xác thực bằng IAM role:** role `backend-role` đã gắn `deploy/iam-backend-bedrock-invoke.json`. Để trống `AI_API_KEY`; không đặt access key trong `.env.backend`. Nên thu hẹp `Resource` trong policy về đúng model/inference profile đang dùng.
3. **Biến môi trường:** `AI_PROVIDER=bedrock`, `AI_MODEL`, `BEDROCK_REGION`, `AI_MAX_TOKENS=16000` như mẫu ở mục 7. Giữ `AI_AUDIO_ENABLED=false` vì Bedrock không hỗ trợ ghi âm/đọc mẫu của gia sư.
4. **Đường mạng:** qua NAT Gateway thì không cần cấu hình gì thêm. Không có NAT thì tạo Interface Endpoint `com.amazonaws.ap-southeast-1.bedrock-runtime` và bật Private DNS.

Kiểm tra từ một máy backend (Session Manager). Lệnh này gọi thẳng Bedrock bằng IAM role, tốn một lượt gọi rất nhỏ và không trừ hạn mức của người học:

```bash
sudo docker exec backend python -c "
import boto3, os
client = boto3.client('bedrock-runtime', region_name=os.getenv('BEDROCK_REGION') or os.getenv('AWS_REGION'))
result = client.converse(modelId=os.environ['AI_MODEL'],
    messages=[{'role': 'user', 'content': [{'text': 'Say hello in five words.'}]}],
    inferenceConfig={'maxTokens': 2000})
print(result['stopReason'], result['usage'])"
```

**Hạn mức và chi phí:**

- Bedrock giới hạn số request và token mỗi phút theo từng model trong tài khoản (xem Service Quotas). Khi vượt, người học nhận thông báo "Bedrock đang giới hạn lượt dùng"; thêm máy backend không giải quyết được, phải xin tăng quota hoặc đổi model/inference profile.
- `AI_DAILY_LIMIT` (mặc định 30 lượt/người/ngày, đếm trong database nên đúng trên mọi instance) là chốt chặn chi phí chính. Chi phí tối đa mỗi ngày ≈ số người dùng × `AI_DAILY_LIMIT` × chi phí một lượt.
- Tạo một AWS Budget cho dịch vụ Bedrock với cảnh báo qua email.

## 13. CloudWatch

### Log

Log của hai container đã vào log group `/english-app/prod/frontend` và `/english-app/prod/backend`, mỗi máy một stream tên `INSTANCE_ID/backend` (hoặc `/frontend`). `docker logs` trên máy vẫn dùng được.

Truy vấn Logs Insights tìm lỗi 5xx của backend:

```text
fields @timestamp, @logStream, @message
| filter @message like /" 5\d\d/
| sort @timestamp desc
| limit 50
```

Bật thêm *access log* của ALB (ghi vào S3) nếu cần tra từng request. Bedrock *model invocation logging* ghi lại toàn bộ nội dung bài làm của người học; chỉ bật khi thật sự cần và đã có chính sách lưu trữ phù hợp.

### Alarm

Tạo một SNS topic `english-app-alerts`, đăng ký email, rồi tạo các alarm sau:

| Alarm | Namespace / metric | Ngưỡng gợi ý | Ý nghĩa |
| --- | --- | --- | --- |
| Không còn máy khỏe | `AWS/ApplicationELB` `HealthyHostCount` (từng target group) | Minimum < 1 trong 2 phút | Tier ngừng phục vụ |
| Lỗi từ ứng dụng | `AWS/ApplicationELB` `HTTPCode_Target_5XX_Count` | Sum ≥ 10 trong 3/5 phút | Backend/frontend lỗi |
| Lỗi từ ALB | `AWS/ApplicationELB` `HTTPCode_ELB_5XX_Count` | Sum ≥ 10 trong 3/5 phút | Hết máy hoặc timeout |
| Phản hồi chậm | `AWS/ApplicationELB` `TargetResponseTime` (ALB internal) | p95 > 5 giây trong 10 phút | Backend quá tải, AI xếp hàng |
| ASG chạm trần | `AWS/AutoScaling` `GroupInServiceInstances` | ≥ max trong 15 phút | Cần nâng max hoặc cỡ máy |
| CPU database | `AWS/RDS` `CPUUtilization` | > 80% trong 10 phút | |
| Kết nối database | `AWS/RDS` `DatabaseConnections` | > 80% `max_connections` | Sắp hết kết nối |
| Dung lượng database | `AWS/RDS` `FreeStorageSpace` | < 20% dung lượng | |
| Bedrock bị giới hạn | `AWS/Bedrock` `InvocationThrottles` (theo `ModelId`) | Sum ≥ 5 trong 5 phút | Chạm quota |
| Bedrock lỗi | `AWS/Bedrock` `InvocationServerErrors`, `InvocationClientErrors` | Sum ≥ 5 trong 5 phút | Lỗi dịch vụ / sai quyền, sai model |

Metric nhóm của ASG (`GroupInServiceInstances`…) phải bật *Group metrics collection* trong tab Monitoring của ASG. Metric của Bedrock chỉ xuất hiện sau lời gọi đầu tiên.

Ví dụ tạo alarm lỗi từ ứng dụng:

```bash
aws cloudwatch put-metric-alarm --region $REGION \
  --alarm-name public-alb-target-5xx \
  --namespace AWS/ApplicationELB --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=LoadBalancer,Value=app/public-alb/ALB_ID \
  --statistic Sum --period 60 --evaluation-periods 5 --datapoints-to-alarm 3 \
  --threshold 10 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:$REGION:$ACCOUNT_ID:english-app-alerts
```

### Kiểm tra từ bên ngoài bằng Route 53 health check

Các alarm trên nhìn từ bên trong AWS. Thêm một Route 53 health check để biết người dùng thật có vào được trang hay không. Đường dẫn `/api/topics` đi qua cả frontend, backend và database:

```bash
aws route53 create-health-check --caller-reference english-app-$(date +%s) \
  --health-check-config '{
    "Type": "HTTPS",
    "FullyQualifiedDomainName": "learn.example.com",
    "Port": 443,
    "ResourcePath": "/api/topics",
    "RequestInterval": 30,
    "FailureThreshold": 3,
    "EnableSNI": true
  }'
```

Metric của Route 53 health check **chỉ có ở Region `us-east-1`**. Tạo alarm ở đó (`AWS/Route53` `HealthCheckStatus`, Minimum < 1, dimension `HealthCheckId`) cùng một SNS topic riêng ở `us-east-1`, vì alarm chỉ gửi được tới topic cùng Region.

### Dashboard

Tạo một dashboard gồm: số request và mã 5xx của ALB public, `TargetResponseTime` p95 của hai ALB, số máy InService của hai ASG, CPU trung bình từng ASG, CPU và số kết nối RDS, `Invocations` / `InvocationLatency` / `InputTokenCount` / `OutputTokenCount` của Bedrock.

EC2 mặc định không gửi metric RAM và ổ đĩa. Nếu cần, cài CloudWatch Agent vào AMI nền và thêm policy `CloudWatchAgentServerPolicy` cho hai role.

## 14. Phát hành phiên bản mới

1. Build và đẩy image với tag mới (mục 5). **Chưa** đổi tham số `image-tag`, để máy do ASG tự thêm trong lúc này vẫn chạy bản cũ.
2. Nếu bản mới có migration: mở Session Manager vào một máy backend đang chạy (hoặc một máy tạm từ `backend-lt`) và chạy container `migration` của bản mới. Container `backend` đang chạy và image `backend:latest` trên máy không bị đụng tới.

```bash
REGION=ap-southeast-1
REGISTRY=123456789012.dkr.ecr.$REGION.amazonaws.com
TAG=abc1234   # tag của bản mới vừa đẩy lên ECR
aws ecr get-login-password --region $REGION | sudo docker login --username AWS --password-stdin $REGISTRY
sudo docker run --rm --name migration --env-file /opt/english-app/.env.backend \
  $REGISTRY/migration:$TAG migrate
```

3. Cập nhật tag (và `env`/`compose` nếu có thay đổi) trong Parameter Store:

```bash
for tier in frontend backend; do
  aws ssm put-parameter --region $REGION --overwrite --type String \
    --name /english-app/prod/$tier/image-tag --value "$TAG"
done
```

4. Thay máy lần lượt, backend trước rồi frontend. Máy mới được thêm và phải khỏe rồi máy cũ mới bị gỡ:

```bash
aws autoscaling start-instance-refresh --region $REGION \
  --auto-scaling-group-name backend-asg \
  --preferences '{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":120}'
aws autoscaling describe-instance-refreshes --region $REGION \
  --auto-scaling-group-name backend-asg --max-records 1
```

Migration phải tương thích với bản cũ (chỉ thêm bảng/cột/index, như các migration hiện có), vì trong lúc thay máy cả hai bản cùng chạy trên một database.

**Quay lại bản trước:** đặt `image-tag` về tag cũ rồi chạy lại instance refresh. Không cần hoàn tác migration dạng "chỉ thêm".

## 15. Kiểm tra sau triển khai

```bash
curl -s https://learn.example.com/health          # {"status":"ok"} từ frontend
curl -s https://learn.example.com/api/topics      # danh sách chủ đề: frontend → backend → database
curl -sI http://learn.example.com | head -n 1     # 301 chuyển sang HTTPS
```

Sau đó kiểm tra trên trình duyệt: đăng ký, đăng nhập, mở một bài có ảnh và audio (S3), gửi một câu hỏi cho gia sư AI (Bedrock). Cuối cùng thử khả năng tự phục hồi: xóa tay một EC2 backend và xác nhận trang vẫn hoạt động, ASG tự tạo máy thay thế.

## 16. Lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp |
| --- | --- |
| Đăng nhập/lưu bài trả `403 Nguồn yêu cầu không hợp lệ` | `APP_ORIGIN` không khớp chính xác địa chỉ người dùng mở (`http` thay vì `https`, có `www`, có dấu `/` cuối) |
| Target backend *unhealthy*, `/health` trả 503 | Chưa migrate/seed; `rds-sg` chưa cho `backend-sg`; sai `DATABASE_URL` |
| ASG thay máy liên tục | User data lỗi (xem `/var/log/cloud-init-output.log`); grace period quá ngắn; database chưa sẵn sàng |
| Container không khởi động, lỗi `awslogs` | Chưa tạo log group; role thiếu quyền ghi log; subnet không có đường ra CloudWatch Logs |
| `exec format error` khi chạy container | Kiến trúc image khác kiến trúc EC2 (x86_64 và arm64) |
| Gia sư AI báo "Backend chưa có IAM Role/thông tin xác thực AWS" | Metadata hop limit = 1; launch template chưa gắn instance profile |
| Gia sư AI báo "Backend chưa có quyền gọi model Bedrock" | Role thiếu policy Bedrock; tài khoản chưa dùng được model; sai Region |
| Gia sư AI lỗi 504 sau đúng 60 giây | Idle timeout của ALB còn ở mặc định 60 giây |
| Gia sư AI báo "Bedrock đang giới hạn lượt dùng" | Chạm quota Bedrock của model; xin tăng quota hoặc đổi inference profile |
| Ảnh/audio không tải | Route table subnet app chưa gắn S3 Gateway Endpoint; endpoint policy hoặc IAM chưa đúng bucket |
| Frontend trả "Máy chủ học tập tạm thời chưa sẵn sàng" | `BACKEND_URL` sai; private zone chưa gắn VPC; `alb-internal-sg` chưa cho `frontend-sg` |
