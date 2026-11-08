# Mỗi ngày — English learning app

App tiếng Anh cho người Việt, viết mới và độc lập với `/home/huukien/FreeLingo`.
Giao diện Next.js/TypeScript, backend FastAPI, PostgreSQL lưu dữ liệu và tiến độ.
Không có Redis hoặc CDN trong luồng học. Tính năng AI tùy chọn dùng một nhà cung cấp được cấu hình ở backend.
Request học tập của trình duyệt dùng cùng origin. Đăng nhập mạng xã hội chuyển hướng sang Google/Facebook khi người dùng chọn. Tham khảo hình ảnh/nhận diện petroleum-blue
của FreeLingo; không sửa mã nguồn gốc.

## Cấu trúc và luồng

```text
english-learning-app/
  frontend/       Next.js App Router + TypeScript, port 3000
    app/api/      Proxy server-side, chuyển cookie và Origin sang backend
    public/       Ảnh nội bộ, giấy phép, ghi công và mã nguồn tương ứng
  backend/        FastAPI, port 8000
  database/       Migration SQL có version, importer và 120 câu Anh–Việt mẫu
  deploy/         systemd, user data cho hai Launch Template, script phát hành, IAM mẫu
  tests/          Unit, integration PostgreSQL, smoke HTTP và checklist trình duyệt
```

```mermaid
flowchart LR
  U[Trình duyệt] -->|HTTPS 443| P[Public ALB]
  P -->|HTTP 3000| F[Next.js / Frontend ASG]
  F -->|/api qua BACKEND_URL / HTTP 80| I[Internal ALB]
  I -->|HTTP 8000| B[FastAPI / Backend ASG]
  B -->|TLS 5432| D[(RDS PostgreSQL Single-AZ)]
```

App có đăng ký/đăng nhập, màn Bài học theo 20 chủ đề, tìm cả tiếng Anh và Việt (không phân biệt hoa thường,
phân biệt dấu), yêu thích, lật flashcard, đánh dấu đã thuộc, quiz 5 câu và lịch sử gần nhất.
Mật khẩu scrypt + salt ngẫu nhiên. Cookie HttpOnly/SameSite=Lax, Secure trên HTTPS.
PostgreSQL giữ hash token phiên 7 ngày; EC2 không giữ phiên hoặc tiến độ trong RAM/đĩa.
Backend xác thực quyền người dùng trên từng thao tác, sinh quiz và chấm điểm;
không trả đáp án đúng trước lúc nộp, không cho đổi đáp án của bài đã chấm. Gửi lại cùng đáp án trả kết quả cũ, không tạo thêm lịch sử.
Không bật sticky session. Hiện chưa có khôi phục mật khẩu qua email hay xác minh email.


## Các mục học mở rộng

Trang đầu giới thiệu ngắn, có Đăng nhập / Đăng ký và hai nút Google/Facebook khi đã cấu hình OAuth. Sau đăng nhập có câu khích lệ mỗi lần vào khu học tập, 20 chủ đề giao tiếp, mục giải thích 20 lý do học tiếng Anh và mục gửi/xem lại góp ý cá nhân.

- **IELTS**: bài khởi động Nghe, Nói, Đọc, Viết, gồm Writing Task 1 và Task 2; chưa phải bộ đề thi đầy đủ.
- **Tiếng Anh chuyên ngành**: CNTT, Kinh doanh, Du lịch, Nhà hàng–Khách sạn, Y khoa. Mỗi ngành có bốn kỹ năng. Tổng 25 bài ở 6 nhóm học. Y khoa chỉ luyện ngôn ngữ qua tình huống giả lập.
- **Nghe / Đọc**: chọn đáp án, kiểm tra đúng/sai, xem lời giải và bản chép lời. 6 bản nghe WAV giọng tổng hợp phục vụ trực tiếp từ app, không cần AI. Bài làm/đánh dấu hoàn thành lưu trong PostgreSQL.
- **Nói / Viết & Gia sư AI**: ghi âm/nghe lại/tải về, nhập bản chép lời, luyện hội thoại, hỏi bài. AI trích câu gốc, sửa câu, giải thích tiếng Việt, viết lại toàn đoạn, cho điểm luyện tập và gợi ý bài luyện tiếp. Lịch sử nhận xét lưu theo tài khoản. Hiện chấm nội dung bài nói qua bản chép lời, chưa chấm phát âm từ âm thanh.
- **Trình độ & Lộ trình**: làm bài Nghe/Đọc và gửi bài mẫu để nhận trình độ ước lượng, điểm luyện tập, mục tiêu cải thiện và lộ trình 4 tuần. Không phải chứng chỉ CEFR hoặc IELTS band.
- **Từ vựng qua ảnh**: 4 chủ đề/12 từ; toàn bộ ảnh/logo qua endpoint backend, lưu S3 private trên AWS; có nút tải ảnh, ZIP và thêm từ vào bộ.
- **Flashcard của tôi**: tạo nhiều bộ; đổi tên/xóa bộ, thêm/sửa/xóa thẻ và ví dụ; ôn thẻ chưa thuộc, chơi ghép cặp và gõ từ. Xóa bộ yêu cầu xác nhận vì xóa toàn bộ thẻ của bộ đó.
- **Góp ý cải thiện app**: gửi báo lỗi/đề xuất/nội dung, xem 50 góp ý gần nhất của chính mình. Góp ý lưu DB, không tự gửi email hay tạo ticket bên ngoài.

Mọi tính năng AI dùng **một nhà cung cấp tại một thời điểm**, qua một API backend chung và một khóa. Hỗ trợ OpenAI, DeepSeek, Gemini, Claude, OpenAI-compatible và endpoint model tự chạy/Colab. Khả năng âm thanh tùy adapter, không tự gọi bên thứ hai. Xem [cấu hình AI](docs/AI-SETUP.md) và [Google/Facebook OAuth](docs/SOCIAL-LOGIN.md). Không cần khóa AI để học bài có sẵn, ôn thẻ hoặc chơi trò chơi.

Sau khi cập nhật source, cài dependency mới và áp dụng migration/seed bằng các bước riêng:

```bash
.venv/bin/pip install -r backend/requirements.txt
bash scripts/run-local.sh migrate
bash scripts/run-local.sh seed
bash scripts/run-local.sh build
```

Migration `003_learning_expansion.sql` chỉ thêm bảng mới; seed upsert giữ ID câu gốc, tiến độ và tài khoản cũ. Không tự chạy migration/seed lúc app boot. Backend health kiểm tra schema mới; cần chạy migration trước khi khởi động bản mới. AI/OAuth chỉ hoạt động khi bạn cung cấp cấu hình thực tế, chưa có credential kèm source.

## Cài và mở local bằng một lệnh trên Ubuntu

Chạy trong Terminal Ubuntu thật, ngoài sandbox của coding agent:

```bash
cd /home/huukien/aws2/english-learning-app
bash scripts/start-ubuntu.sh
```

Script cần internet và quyền sudo để cài Node 24/Python venv/PostgreSQL. Sau đó tự cài
dependency, tạo role/database local nếu thiếu, kiểm tra kết nối, chạy migration/seed và
khởi động frontend/backend. Giữ Terminal mở, đợi script báo **ĐÃ SẴN SÀNG** sau kiểm tra frontend/backend/API rồi mở
`http://localhost:3000`. Script có thể yêu cầu mật khẩu sudo trong Terminal.

Cấu hình lấy từ backend/.env hiện có; không ghi đè mật khẩu role hay xóa database/tiến độ.
Nếu role đã có mà mật khẩu khác cấu hình, script dừng để người quản trị sửa .env.
Bootstrap tự tạo DB chỉ hỗ trợ localhost/127.0.0.1:5432; với RDS dùng quy trình AWS.
Nếu lỗi, gửi phần cuối Terminal; không chia sẻ .env hoặc mật khẩu.

## Khởi động nhanh bằng script

Các script không phụ thuộc repo FreeLingo cũ. Chẩn đoán môi trường không đọc/in mật khẩu:

```bash
cd /home/huukien/aws2/english-learning-app
bash scripts/run-local.sh doctor
```

Sau khi cài Node, Python/venv và PostgreSQL theo phần dưới:

```bash
bash scripts/run-local.sh setup
# Sửa backend/.env: DATABASE_URL, APP_ORIGIN và COOKIE_SECURE.
bash scripts/run-local.sh migrate
bash scripts/run-local.sh seed
bash scripts/run-local.sh all
# Hoặc chạy riêng trong hai terminal: backend và frontend.
```

`setup` không ghi đè cấu hình đã có và không tự chạy migration hoặc seed.
Nếu Ubuntu thiếu Node, cài bằng `sudo bash deploy/install-node.sh` (cần curl, xz-utils,
ca-certificates và kết nối nodejs.org). Script này kiểm SHA256, chỉ cài công cụ build,
không dùng trong luồng học hoặc lúc ASG boot. Không chạy `setup` trên EC2 runtime;
EC2 dùng artifact đã đóng gói theo hướng dẫn AWS.

### Luồng Bài học

Trang chủ → chọn chủ đề hoặc Bắt đầu học → **Bài học**. Mỗi bài đọc lần lượt câu Anh,
cho phép mở/ẩn nghĩa Việt, lưu yêu thích và tự đánh dấu đã thuộc. Bài dài phân trang 20 câu;
tiến độ lấy theo toàn chủ đề. Nút **Luyện tập chủ đề này** mở quiz đúng chủ đề đang học.
Bài học, Flashcard và Tiến độ dùng chung trạng thái đã thuộc trong PostgreSQL.
Không tự đánh dấu thuộc chỉ vì người dùng mở hoặc đọc câu.

URL ghi nhớ mục, chủ đề và bộ lọc (ví dụ `?view=flashcards&topic=food`). Tải lại trang
sẽ mở lại mục đó sau khi xác thực phiên. URL không chứa email, mật khẩu, token hoặc đáp án.
Tiến độ và đáp án vẫn lấy từ PostgreSQL; không lưu tiến độ trong localStorage.

Khi quiz có thay đổi chưa lưu, app cảnh báo trước khi chuyển mục, đổi chủ đề, đăng xuất
hoặc tải lại/đóng trang. Sau khi bấm lưu thành công, trạng thái trở thành “Bản nháp đã
được lưu”. Cảnh báo khi đóng trang tùy thuộc trình duyệt; luôn chủ động bấm Lưu bài.

Từ Tiến độ, chọn **Ôn câu từng sai** hoặc bật bộ lọc **Câu từng sai** ở Câu giao tiếp/
Flashcard. Backend đọc tối đa 100 bài đã nộp gần nhất của chính tài khoản, dùng lần trả
lời gần nhất của mỗi câu. Trả lời đúng ở bài sau sẽ bỏ câu khỏi bộ ôn; đánh dấu flashcard
đã thuộc không thay thế kết quả quiz. Đây là ôn từ dữ liệu có sẵn, không dùng AI.

Trang Tiến độ có nút **Xem lại** trên từng bài: xem đáp án của bạn và đáp án đúng từ
snapshot đã lưu, không phụ thuộc nội dung seed về sau. Chỉ chủ tài khoản đọc được.
Nếu nộp bài bị mất phản hồi, có thể gửi lại cùng đáp án để lấy lại điểm; không bị chấm
hai lần và không tạo bản ghi lịch sử thứ hai.

Lệnh `all` chạy cả hai dịch vụ và dừng cả hai khi Ctrl+C hoặc khi một dịch vụ lỗi.
Không tự cài package, migration hoặc seed lúc khởi động.

Quiz có nút **Lưu bài để làm tiếp**: lưu đáp án chưa hoàn thành trong PostgreSQL.
Đăng nhập lại cùng tài khoản và mở Luyện tập/chủ đề tương ứng để khôi phục.
Chọn đáp án chưa tự lưu; bấm lưu trước khi rời trang. Bài đã nộp không thể sửa.
Trang Tiến độ hiển thị số đã thuộc theo từng chủ đề, tổng bài luyện đầy đủ và 30 kết quả
mới nhất. Danh sách câu/flashcard phân trang 50 câu để dùng được với bộ dữ liệu lớn hơn.

## 1. Chạy trực tiếp trên Ubuntu

Cần Ubuntu, Node.js 24+ (đã kiểm tra build bằng Node 24.22.1), npm, Python 3.12+
và PostgreSQL 16+. Không cần Docker. Nếu Ubuntu cung cấp Node cũ hơn 22, cài Node 24
LTS từ bản phân phối chính thức trước khi tiếp tục. Node phải có trong PATH.

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv postgresql postgresql-client curl ca-certificates
# Nếu chưa có Node >=22: cài Node 24 từ nodejs.org, kiểm tra SHA256.
# Sau khi cd vào app, chạy:
# sudo apt-get install -y xz-utils
# sudo bash deploy/install-node.sh
node --version
npm --version
python3 --version
sudo systemctl enable --now postgresql
cd /home/huukien/aws2/english-learning-app
```

Tạo database local riêng, không dùng database FreeLingo gốc:

```bash
sudo -u postgres psql -c "CREATE ROLE english_app LOGIN PASSWORD 'change-local-password';"
sudo -u postgres psql -c "CREATE DATABASE english_app OWNER english_app;"
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Sửa `backend/.env` với mật khẩu của bạn. Các lệnh dưới dùng shell Bash để nạp cấu hình;
FastAPI không tự đọc `.env`. Dùng chính xác origin `http://localhost:3000` khi mở trình duyệt.
Nếu dùng `http://127.0.0.1:3000` thay thế, sửa APP_ORIGIN tương ứng. BACKEND_URL vẫn là
`http://127.0.0.1:8000`. Chỉ local HTTP mới dùng COOKIE_SECURE=false.

Chạy migration và seed riêng, có thể chạy lại:

```bash
set -a
source backend/.env
set +a
.venv/bin/python database/manage.py migrate
.venv/bin/python database/manage.py seed
```

Terminal backend:

```bash
cd /home/huukien/aws2/english-learning-app
set -a
source backend/.env
set +a
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Terminal frontend:

```bash
cd /home/huukien/aws2/english-learning-app/frontend
npm ci
npm run build
npm run dev
```

Mở `http://localhost:3000`. Next tự đọc `.env.local`. Để chạy bản production trực tiếp,
dùng standalone giống EC2:

```bash
cd /home/huukien/aws2/english-learning-app/frontend
cp -a public .next/standalone/public
cp -a .next/static .next/standalone/.next/static
BACKEND_URL=http://127.0.0.1:8000 PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

Chỉ chạy một frontend trên port 3000. Backend không tự chạy migration/seed lúc khởi động.

### Cài chạy tự khởi động trên một máy Ubuntu

Dùng khi muốn một Ubuntu chạy cả frontend và backend bằng systemd, PostgreSQL local
hoặc endpoint đã cấu hình. Cài công cụ, tạo database, chạy setup/migration/seed như trên.
Node cần ở `/usr/local/bin/node` (script `deploy/install-node.sh` cài tại đó).

```bash
bash scripts/run-local.sh build
# Dừng hai server dev bằng Ctrl+C trước khi cài dịch vụ.
sudo bash deploy/install-ubuntu.sh
sudo systemctl status english-frontend english-backend
```

Installer sao chép đúng bản build vào `/opt/english/releases/local-...`, tạo venv riêng,
đọc cấu hình từ `backend/.env` và `frontend/.env.local`, lưu bản riêng quyền 0600 ở
`/etc/english/`, bật hai unit systemd. Cần mạng để cài Python dependencies lúc cài đặt;
sau đó luồng học không dùng dịch vụ bên ngoài. Không chạy migration/seed trong installer.
Không dùng symlink trỏ về source trong `/home` vì service có ProtectHome.

Nếu health chưa đạt, xem:

```bash
sudo journalctl -u english-backend -u english-frontend -n 100 --no-pager
```

Đối với **AWS ASG**, tiếp tục dùng `prepare-ami.sh`, artifact và user data riêng ở phần AWS,
không dùng installer một máy này để khởi động ASG.

## Dữ liệu thật và seed

Đã tìm trong repo hiện tại và `/home/huukien/FreeLingo`: không có `phrasebook-data.json`.
Đã đọc loader gốc `backend/app/data/phrasebook.py` và kiểu dữ liệu frontend trước khi
viết importer. Loader tham chiếu object private `backend/learning-content/phrasebook-data.json`,
định dạng `schema_version: 1`, `languages`, mỗi ngôn ngữ có danh sách category gồm
`id`, `level`, `situation`, `icon`, `phrases`; phrase gồm `text`, `context`, `register`,
`unit_ref?`, `romanization?`. Đây là cấu trúc từ mã loader, chưa xác minh trên tệp S3 thật.
`context` không phải bản dịch tiếng Việt. App mới không gọi AI để tạo bản dịch.

`database/sample.vi-en.json` là bộ 120 câu tự soạn thuộc 20 chủ đề: chào hỏi, ăn uống, mua sắm,
đi lại, du lịch, gia đình, bạn bè, công việc, trường học, hỏi đường, khách sạn, sức khỏe,
điện thoại, lịch hẹn, sở thích, thời tiết, nhà ở, dịch vụ, tình huống khẩn cấp và bày tỏ ý kiến. Tái sử dụng ảnh/logo; không tuyên bố bộ mẫu là dữ liệu bài học gốc.
Sau khi tải được tệp thật, kiểm tra cấu trúc trước:

```bash
.venv/bin/python database/manage.py inspect --file /path/to/phrasebook-data.json
.venv/bin/python database/manage.py seed --file /path/to/phrasebook-data.json
```

Importer chấp nhận định dạng Anh–Việt như file mẫu. Với định dạng `languages.en-GB` của
FreeLingo, mỗi phrase cần thêm `vietnamese` hoặc `translations.vi` đã được người kiểm tra.
Nếu không có bản dịch, importer dừng với lỗi rõ ràng; bổ sung bản dịch được duyệt hoặc
chuyển đổi thành file mẫu. Không tự giả định thứ tự phrase giữa hai ngôn ngữ tương ứng.
Importer kiểm tra toàn bộ trước khi ghi và dùng transaction; ID ổn định theo topic + câu Anh.
Seed upsert nội dung, không xóa users, sessions, favorites, flashcards hoặc quizzes.
Không xóa câu cũ khi đổi bộ dữ liệu để bảo toàn tham chiếu/tiến độ. Thay chính câu tiếng Anh
được coi là câu mới; dùng ID topic cũ khi muốn cập nhật bản dịch. Quiz lưu snapshot,
kết quả cũ không thay đổi khi nội dung seed đổi. Migration `002_quiz_topic.sql` bổ sung chủ đề của quiz và index bản nháp, giữ nguyên
đáp án/điểm cũ. Sau cập nhật mã, chạy `migrate` trước khi khởi động backend mới.
Migration lưu SHA256, khóa advisory chống
hai người phát hành đồng thời; không sửa file migration đã áp dụng, thêm migration mới.

Nhập trực tiếp từ S3 là lệnh riêng trên máy quản trị/backend có IAM role:

```bash
.venv/bin/python database/manage.py seed   --s3-bucket YOUR_PRIVATE_BUCKET   --s3-key YOUR_PREFIX/backend/learning-content/phrasebook-data.json
```

Boto3 dùng IAM role của EC2, không ghi access key vào `.env`. Cấp GetObject đúng object
như `deploy/iam-backend-seed.json`, thay bucket/key. Giữ S3 Block Public Access, dùng S3
Gateway Endpoint trên route table private subnet. S3 và endpoint cùng region; endpoint
policy/bucket policy cho phép đúng role/object. Bổ sung kms:Decrypt giới hạn đúng key nếu
object dùng SSE-KMS. Không chạy lệnh seed trong user data. Nếu cần tải để inspect trước:

```bash
aws s3api get-object --bucket YOUR_PRIVATE_BUCKET   --key YOUR_PREFIX/backend/learning-content/phrasebook-data.json /tmp/phrasebook-data.json
.venv/bin/python database/manage.py inspect --file /tmp/phrasebook-data.json
```

## API nội bộ

- `GET /health`: readiness backend; xác nhận schema hiện tại và đã có câu học, trả 503 nếu thiếu migration/seed.
- `POST /api/auth/register`, `/login`, `/logout`; `GET /api/auth/me`.
- `GET /api/topics`: danh sách chủ đề công khai.
- `GET /api/lessons`: danh sách bài học với số đã thuộc của tài khoản.
- `GET /api/lessons/{topic_id}?offset=0`: mô tả chủ đề, tiến độ tổng và tối đa 20 câu mỗi trang.
- `GET /api/phrases?topic=...&q=...&favorites=true&mistakes=true&limit=50&offset=0`: câu giao tiếp, trạng thái riêng người dùng.
- `PUT /api/favorites/{id}`, `/api/flashcards/{id}`: JSON `{"value": true}`.
- `POST /api/quizzes`: JSON `{"topic": "greetings"}` hoặc topic rỗng.
- `POST /api/quizzes/{id}/submit`: JSON `{"answers": ["nghĩa đã chọn", ...]}`.
- `GET /api/quizzes/{id}`: đọc bài của chính tài khoản; đáp án đúng chỉ có sau khi nộp.
- `GET /api/quizzes/active?topic=...`: bài chưa nộp gần nhất của chính tài khoản; không trả đáp án đúng.
- `PUT /api/quizzes/{id}/draft`: `{"answers": ["đáp án đã chọn", "", ...]}`, cho phép để trống câu chưa làm.
- `GET /api/progress`: tổng câu, số đã thuộc/yêu thích, tổng số bài đã nộp, tiến độ từng chủ đề và 30 kết quả gần nhất.

Tất cả chức năng học và thông tin cá nhân yêu cầu cookie phiên, trừ danh sách chủ đề.
Mutation chỉ nhận JSON và Origin đúng APP_ORIGIN để bảo vệ CSRF. Khi dùng curl trực tiếp,
thêm `-H 'Origin: http://localhost:3000' -H 'Content-Type: application/json'` và cookie jar.

## 2. Cấu hình AWS (chỉ hướng dẫn, chưa tạo/sửa tài nguyên)

Hướng dẫn thao tác đầy đủ: [HUONG_DAN_TRIEN_KHAI_AWS.md](HUONG_DAN_TRIEN_KHAI_AWS.md), gồm tạo bucket mới, toàn bộ ảnh/logo S3 private qua endpoint, RDS endpoint, ALB/ASG và rollback.

Không có sơ đồ ảnh/ID hạ tầng trong phiên này. Dùng VPC **final-aws**, subnet và Bastion
đã có. Ghi ID thực vào Launch Template/ASG/ALB trên Console; không tạo VPC mới.

### Kết nối, target group và health check

- Public ALB đặt ở **hai public subnet khác AZ**. ACM certificate cùng region, tên miền
  khớp certificate. Listener HTTPS 443 default forward **TG frontend HTTP:3000**.
  Listener HTTP 80 redirect HTTPS 443. DNS app alias/CNAME tới ALB public.
- TG frontend target type instance, health `GET /health`, port traffic-port 3000,
  matcher 200, interval 30s, timeout 5s, healthy/unhealthy threshold 2.
- Internal ALB scheme internal, **hai private subnet khác AZ**, listener HTTP 80 default
  forward **TG backend HTTP:8000**. Backend health `GET /health`, traffic-port 8000,
  matcher 200, interval 30s, timeout 5s, healthy/unhealthy threshold 2.
- Frontend ASG và backend ASG có Launch Template riêng, AMI đã chuẩn bị, role riêng;
  mỗi ASG `min=1`, `desired=1`, `max=2`, chọn private subnet đúng sơ đồ,
  tắt auto-assign public IP. Gắn TG tương ứng, health type ELB, grace period 300 giây.
  Public ALB không có rule `/api` chuyển trực tiếp backend; Next proxy toàn bộ HTTP học.
- `BACKEND_URL=http://<internal-alb-dns>` chỉ nằm trong môi trường frontend server.
  Không cần WebSocket và không tạo `/ws/*` rule.
- RDS PostgreSQL Single-AZ, không public, endpoint port 5432. DATABASE_URL dùng endpoint
  RDS thật với TLS `?ssl=require`, không dùng IP hoặc localhost. Role DB riêng cho app.
  Có thể tách role migration có DDL và runtime chỉ DML khi vận hành production.
- Min=1 và RDS Single-AZ đúng yêu cầu nhưng không bảo đảm liên tục khi instance/AZ lỗi;
  max=2 cho phép tăng hoặc thay thế instance trong quá trình phát hành.

### Bảng Security Group

| Security Group | Inbound | Outbound cần thiết |
| --- | --- | --- |
| sg-public-alb | TCP 443 internet; 80 internet chỉ redirect | TCP 3000 tới sg-frontend |
| sg-frontend | TCP 3000 từ sg-public-alb; 22 từ sg-bastion | TCP 80 tới sg-internal-alb; 443 S3 prefix list/Secrets Manager endpoint |
| sg-internal-alb | TCP 80 từ sg-frontend | TCP 8000 tới sg-backend |
| sg-backend | TCP 8000 từ sg-internal-alb; 22 từ sg-bastion | TCP 5432 tới sg-rds; 443 S3 prefix list/Secrets Manager endpoint; HTTPS egress tới AI/OAuth khi bật |
| sg-rds | TCP 5432 từ sg-backend; từ sg-release-runner nếu dùng máy release riêng | Theo policy hiện có |
| sg-bastion | TCP 22 chỉ từ CIDR IP quản trị | TCP 22 tới sg-frontend/sg-backend |
| sg-secrets-endpoint | TCP 443 từ sg-frontend và sg-backend | Response stateful |

Không mở 3000/8000/5432 ra internet. SG stateful tự cho phép response; NACL tùy chỉnh phải
cho phép ephemeral response ports. Cho DNS tới resolver VPC theo chính sách hiện có.
Private subnet cần S3 Gateway Endpoint route và Secrets Manager Interface Endpoint
(private DNS, SG TCP 443) **hoặc** NAT tới API Secrets Manager. S3 endpoint không thay thế
Secrets Manager endpoint. Package runtime đầy đủ nên không cần NAT để npm/pip install
khi ASG khởi động. Bastion chỉ quản trị SSH, không thuộc luồng HTTP người học.

### Bản phát hành và tự khởi động

1. Chuẩn bị Ubuntu AMI giống kiến trúc và phiên bản Python của máy build. Cài Node 24+
   tại `/usr/local/bin/node`, AWS CLI v2, Python/venv, curl; chạy
   `sudo bash deploy/prepare-ami.sh` từ bản source. Script đặt installer vào
   `/usr/local/sbin/english-install-release`. Chụp AMI, ghi AMI ID vào cả hai LT.
   Đây là bước chuẩn bị AMI **một lần**, không phải SSH cài từng instance ASG.
2. Trên máy build Ubuntu có internet, từ root app:

   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r backend/requirements.txt
   export PATH="$PWD/.venv/bin:$PATH"
   bash deploy/package-release.sh english-1.0.0
   ```

   Script npm ci/build, đóng gói Next standalone cùng public + .next/static, backend,
   migrations và Python wheels. Loại bỏ `.env*` thật kể cả file Next trace từ máy build; chỉ giữ `.env.example`. Không chứa credential. Máy build và EC2
   phải cùng architecture/Python ABI (ví dụ Ubuntu 24.04 x86_64/Python 3.12).
   Nếu pip không tìm được wheel phù hợp, build dừng; không phát hành gói thiếu dependency.
3. Upload `releases/english-1.0.0.tar.gz` lên bucket release private có versioning.
   Giữ key immutable, lấy VersionId và SHA256 từ file `.sha256`. Pin cả key/version/hash
   trong `deploy/user-data-frontend.sh` và `deploy/user-data-backend.sh`.
   Không dùng `latest`, không build hoặc lấy Git HEAD lúc EC2 boot.
4. Tạo hai secret riêng trong Secrets Manager. SecretString là **plain text EnvironmentFile**,
   không phải JSON; quyền root đọc `/etc/english/*.env` (0600). Ví dụ:

   ```dotenv
   # frontend secret
   BACKEND_URL=http://internal-english-api-REPLACE.ap-southeast-1.elb.amazonaws.com
   ```

   ```dotenv
   # backend secret
   DATABASE_URL=postgresql://english_app:URL_ENCODED_PASSWORD@REPLACE.rds.amazonaws.com:5432/english_app?ssl=require
   APP_ORIGIN=https://english.example.com
   COOKIE_SECURE=true
   ```

   Không đưa DB URL hoặc secret vào user data/NEXT_PUBLIC_. Dùng IAM instance profile
   mỗi LT: GetObjectVersion đúng artifact, GetSecretValue đúng secret (mẫu JSON tại deploy/).
   Nếu SSE-KMS, thêm quyền decrypt đúng KMS key. Role frontend không có quyền đọc DB secret.
5. Trước khi bật ứng dụng, trên máy release có mạng tới RDS và cấu hình đúng bản release,
   nạp DATABASE_URL từ secret vào môi trường mà không in ra log, chạy:

   ```bash
   .venv/bin/python database/manage.py migrate
   .venv/bin/python database/manage.py seed
   ```

   Dùng IAM seed đúng object nếu nhập S3; tài khoản runtime không cần quyền seed.
   Migration và seed chỉ là bước phát hành riêng, không nằm trong systemd/user data.
6. Chọn LT frontend/backend với user data tương ứng. Installer tự tải artifact version
   đúng, kiểm SHA256, đọc secret, tạo venv offline, cài systemd và đợi health check.
   `/opt/english/current` trỏ bản release; journal `journalctl -u english-frontend`
   hoặc `journalctl -u english-backend`. Không cần SSH thủ công để instance mới hoạt động.
7. Khi đổi code/config, tạo artifact/secret version phù hợp, cập nhật LT version và ASG
   instance refresh (giữ min healthy 100%, cho phép tối đa 2 instance khi desired=1).
   Không dùng scale-in/out để chạy migration. Giữ release cũ để rollback LT;
   migration mới nên tương thích bản trước trong thời gian rolling update.

### Xác minh AWS sau triển khai

```bash
aws elbv2 describe-target-health --target-group-arn FRONTEND_TG_ARN
aws elbv2 describe-target-health --target-group-arn BACKEND_TG_ARN
curl -I https://english.example.com/
curl -I http://english.example.com/
curl -fsS https://english.example.com/health
curl -I https://english.example.com/api/media/logo.png
```

Hai TG phải Healthy. HTTPS có certificate hợp lệ, HTTP redirect HTTPS. Từ Bastion/máy
quản trị trong VPC, `curl http://<internal-alb-dns>/health` phải trả ok; không truy cập
Internal ALB trực tiếp từ trình duyệt. Bật DevTools Network, kiểm tra đăng nhập, tải bài,
yêu thích, flashcard, quiz và tiến độ: mọi URL đều cùng domain public, không có DNS nội bộ.
Đổi/thay backend bằng ASG rồi đọc lại tiến độ và cookie phiên. Tiếp tục checklist
`tests/browser-checklist.md`. Chưa có AWS credentials/ID và không có thao tác AWS thực tế.

## Kiểm thử

Bộ logic offline chạy với Python 3.12+ có sẵn, không cần cài dependency, database hoặc mạng:

```bash
bash scripts/run-local.sh test
# Kiểm tra điều hướng bằng Node 24+, không cần cài test framework:
node --test tests/learning-route.test.mjs
```

Bộ kiểm thử API/PostgreSQL cần dependency riêng:

```bash
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/python -m pytest tests/test_app.py -q
python3 tests/smoke_frontend.py http://localhost:3000
```

Để chạy kiểm thử thật migration/seed và tiến độ, tạo **database rỗng dùng một lần**, không
trỏ tới production. Test cố ý từ chối database đã có bảng users:

```bash
sudo -u postgres psql -c "CREATE DATABASE english_app_test OWNER english_app;"
TEST_DATABASE_URL=postgresql://english_app:change-local-password@127.0.0.1:5432/english_app_test   .venv/bin/python -m pytest tests/test_app.py -q
```

Integration test chạy migration hai lần, seed nhiều lần; đăng ký/đăng nhập, tìm kiếm,
yêu thích/đã thuộc, quiz đúng 5/5, gửi lại an toàn, chống sửa bài đã chấm, CSRF, tài khoản khác không thấy dữ liệu.
Đóng/mở lại lifespan và pool backend, dùng lại cookie để kiểm tra mô phỏng khởi động lại/
backend EC2 khác. Đây là kiểm thử DB/API, không thay thế kiểm thử browser.
Kết quả thực tế trong `TESTING.md`; không coi checklist là kết quả đã chạy.

### Kiểm thử HTTP xuyên frontend và kiểm tra sau restart

Runner dùng Python chuẩn, không cần thêm thư viện. Chạy sau khi hai dịch vụ và database
đã sẵn sàng. Runner tạo **hai tài khoản app mới** để kiểm tra phân tách dữ liệu; nên dùng
bản local/test. Không tự xóa tài khoản hoặc tiến độ. URL cần trùng APP_ORIGIN.

```bash
python3 tests/e2e_http.py --url http://localhost:3000 --phase prepare
# Khởi động lại backend: Ctrl+C rồi chạy lại uvicorn, hoặc nếu dùng systemd:
sudo systemctl restart english-backend
python3 tests/e2e_http.py --url http://localhost:3000 --phase verify
```

`prepare` kiểm tra ảnh nội bộ, đăng ký/đăng nhập, bài học/tìm kiếm, yêu thích, đã thuộc,
quiz đúng toàn bộ, gửi lại cùng bài, bản nháp và quyền đọc của tài khoản khác. `verify`
dùng lại cookie trước restart, kiểm tra điểm, tiến độ bài học, yêu thích và bài làm dở.
Runner lưu cookie ở `.tools/e2e-http.json` quyền 0600, không in mật khẩu/token.
Không đưa file này vào source hoặc S3 artifact. Trong repo, `--state` chỉ được trỏ dưới
`.tools/`; có thể trỏ sang một thư mục riêng ngoài repo. Cookie hết hạn sau 7 ngày.

Với AWS test, dùng cùng hai pha với `--url https://<domain-app>` từ máy kiểm thử;
thay backend qua ASG giữa hai pha, rồi xác minh cả hai TG Healthy theo hướng dẫn.
Runner chặn redirect khác origin. Để chạy liên tục **không kiểm tra restart**:

```bash
python3 tests/e2e_http.py --url http://localhost:3000 --phase full
```

Đây là kiểm thử API qua HTTP, **không thay thế kiểm tra giao diện trên trình duyệt**.
Xem `tests/browser-checklist.md` để kiểm tra nút, lật thẻ, responsive và DevTools Network.

## Ảnh, ghi công và mã nguồn

Toàn bộ ảnh và logo trên AWS lưu trong **S3 private**. Frontend không chứa tệp ảnh runtime; nó gọi `/api/media/logo.png` hoặc `/api/picture-assets/leaf.jpg`. Backend dùng EC2 IAM Role đọc object S3 qua endpoint, không cấp AWS key hay bucket public URL cho browser. Backend kết nối RDS PostgreSQL qua DNS endpoint/5432/TLS riêng.

Bản nguồn để upload nằm ngoài frontend: `assets/branding/` (3 logo) và `assets/picture-vocabulary/` (6 ảnh demo, ZIP/credits). Local backend đọc các tệp nguồn này khi chưa bật S3; AWS phải đặt `PICTURE_ASSET_STORAGE=s3`, `S3_IMAGE_BUCKET`, `S3_IMAGE_PREFIX`. Script upload: `bash scripts/upload-images-s3.sh BUCKET REGION PREFIX` sau khi đã tạo bucket private. Chưa upload AWS thật trong phiên này.

Mục **Từ vựng qua ảnh** có demo 4 chủ đề/12 từ, ẩn nghĩa/ví dụ, tự kiểm tra, thêm từ vào bộ cá nhân và tải ảnh/ZIP qua endpoint. Ảnh có sẵn từ Ubuntu Wallpapers, không dùng ảnh AI trong bản demo cuối. Giữ CC BY-SA 4.0 và ghi công riêng; xem `ASSETS.md`, manifest và `/credits.html`.

Logo giữ giấy phép/ghi công nguồn FreeLingo. Mã nguồn app theo AGPL-3.0; bản nguồn tương ứng ở `/source.tar.gz`, tạo lại bằng `python3 deploy/source_archive.py`. Gói mã nguồn loại thư mục ảnh gốc `assets/`; ảnh có giấy phép riêng và được cung cấp qua các endpoint tải ảnh/ZIP. Giữ LICENSE/NOTICE; không có quyền thương mại ngầm định.

Tài liệu tham chiếu: [Next standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[ALB health checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html),
[S3 Gateway Endpoint](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html).
