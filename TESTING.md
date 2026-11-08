# Kết quả kiểm thử — bản hoàn thiện 2026-11-08

## Đã chạy trên mã mới

- `bash scripts/run-local.sh test`: **23/23 đạt** bằng Python 3.14 có sẵn, không cần
  FastAPI, PostgreSQL hoặc mạng. Kiểm tra sinh câu hỏi từ dữ liệu mẫu, 4 lựa chọn khác
  nhau, không lộ đáp án trước khi nộp, chấm đúng/sai, bản nháp cho phép để trống,
  từ chối đáp án giả và sai số lượng, scrypt/salt, nhập dữ liệu có bản dịch Việt,
  từ chối nội dung trùng, đọc chi tiết không lộ đáp án của bài chưa nộp, gửi lại bài an toàn,
  từ chối sửa đáp án đã chấm, bộ ôn câu sai dùng lần trả lời gần nhất, loại trùng và SHA256 của cả 3 ảnh nội bộ.
- `tests/learning-route.test.mjs`: **6/6 đạt** bằng Node v24.22.1 đi kèm VS Code.
  Kiểm tra khôi phục mục/chủ đề/bộ lọc, fallback trang không hợp lệ, mã hóa URL,
  giới hạn độ dài topic, mở trực tiếp bài học và URL không lưu thông tin tài khoản/token/đáp án.
  Lệnh thực tế: `ELECTRON_RUN_AS_NODE=1 /snap/code/current/usr/share/code/code tests/learning-route.test.mjs`.
  Node có cảnh báo module-type khi nhập TypeScript; không có test lỗi.
- Kiểm tra TypeScript tích hợp trong build: **đạt** sau khi sửa lỗi JSX ở ô lọc yêu thích.
- Build production Next.js 16.4.3 (webpack, standalone): **đạt** trên mã frontend mới.
  Chạy bằng Node v24.22.1 đi kèm VS Code:

  ```bash
  cd frontend
  ELECTRON_RUN_AS_NODE=1 NEXT_TELEMETRY_DISABLED=1 /snap/code/current/usr/share/code/code node_modules/next/dist/bin/next build --webpack
  ```

  Đây là cách kiểm tra tận dụng công cụ hiện có, không phải cấu hình chạy EC2.
  Khi triển khai, cài Node riêng; không phụ thuộc VS Code hoặc FreeLingo cũ.
- CLI `tests/e2e_http.py --help`: **đạt**. Logic serialize/khôi phục cookie, quyền file state
  0600, chặn redirect sang origin khác và từ chối ghi cookie vào source/public đều có
  unit test đạt. Chưa chạy pha prepare/verify với server thật.
- `python3 database/manage.py inspect`: **đạt**, 5 chủ đề; inspect không cần asyncpg nữa.
- Python compile backend/database/tests/scripts và Bash syntax check deploy/scripts: **đạt**.
- `scripts/run-local.sh doctor` chạy được và phát hiện đúng: thiếu Node/npm/psql trong
  PATH, thư viện Python trong .venv và các file môi trường. Doctor không truy cập DB,
  không in secret, không coi các điều kiện thiếu là thành công.

## Bổ sung khởi động Ubuntu

- Đã thêm `scripts/start-ubuntu.sh` và `scripts/init-local-db.py`: cài công cụ, tạo role/DB
  local còn thiếu, kiểm tra kết nối, migration/seed và mở hai dịch vụ. Không đổi mật khẩu
  role có sẵn, không xóa dữ liệu. Password truyền qua stdin/environment, không qua argv.
- Bash syntax check và Python compile: đạt. Test riêng cấu hình remote, tên role không
  hợp lệ và thiếu mật khẩu bị từ chối trước khi gọi PostgreSQL: đạt, không lộ password.
- Chưa chạy bootstrap cài thật: môi trường thiếu quyền cài hệ thống, DNS bị chặn và
  từ chối mở socket. App chưa chạy trong sandbox. Hai file cấu hình local đã tạo từ mẫu.

## Kiểm tra trước khi báo link sẵn sàng

- Launcher chỉ in `ĐÃ SẴN SÀNG` khi frontend /health, backend /health và proxy /api/topics
  đều trả kết quả hợp lệ, có dữ liệu câu học. start-ubuntu.sh yêu cầu mở browser sau bước này.
- `python3 -m unittest discover -s tests -p test_startup.py -v`: 4 test đạt với phản hồi mô phỏng;
  xác nhận không báo thành công khi chỉ có frontend, chưa seed hoặc proxy lỗi.
- Đây là unit test điều kiện sẵn sàng, không xác nhận app đã chạy thực tế trong sandbox.

## Chưa xác minh thực tế

- Chưa có PostgreSQL/psql và các thư viện FastAPI/asyncpg/pytest trong môi trường hiện tại.
  Tạo venv bị thiếu ensurepip; tải công cụ thất bại do DNS. Chưa áp dụng migration
  `001_initial.sql`, `002_quiz_topic.sql` hoặc seed vào PostgreSQL thật.
- Bộ integration trong `tests/test_app.py` đã mở rộng thêm xem lại bài/cô lập quyền đọc,
  gửi lại cùng đáp án không chấm hai lần, từ chối sửa đáp án đã chấm, bộ ôn câu sai, API Bài học và quyền sở hữu; ngoài ra kiểm tra: phân trang, lưu/khôi phục quiz
  qua restart/pool mới, khóa bài đã nộp, tổng bài và tiến độ chủ đề, cô lập tài khoản.
  **Chưa chạy bộ này trên mã mới**. Cần database rỗng riêng qua TEST_DATABASE_URL.
- Build không xác nhận hành vi trình duyệt hoặc truy vấn SQL thực tế. Đã thử chạy standalone mới ở 127.0.0.1:3000 nhưng
  sandbox từ chối `listen EPERM`; chưa chạy được smoke HTTP và checklist browser. Smoke HTTP nay kiểm thêm `/api/topics` qua proxy
  để xác nhận toàn luồng frontend → backend → PostgreSQL khi chạy trên máy thật.
  HTML build có đúng nội dung tiếng Việt và URL logo nội bộ, nhưng chưa xác nhận render.
- Script `deploy/install-ubuntu.sh` đã qua Bash syntax check, chưa chạy cài systemd thật
  vì cần quyền root và dependencies/database. Không sửa dịch vụ hệ thống trong phiên này.
- Chưa kiểm tra npm ci tải dependency mới, đóng gói toàn bộ Python wheels hoặc installer
  trên AMI. Registry/nodejs.org không truy cập được qua DNS trong shell hiện tại.
- Chưa có xác minh AWS: IAM, secrets, SG/route, migration/seed RDS, TLS, S3 endpoint,
  ASG tạo instance mới, hai target group Healthy, HTTPS ACM và Network chỉ có domain app.
  Không tạo hoặc sửa tài nguyên AWS.

## Cách kiểm tra tiếp

Xem README.md để cài công cụ độc lập. Chạy:

```bash
bash scripts/run-local.sh doctor
bash scripts/run-local.sh setup
# Điền DATABASE_URL trong backend/.env.
bash scripts/run-local.sh migrate
bash scripts/run-local.sh seed
bash scripts/run-local.sh all
# Sau khi hai dịch vụ sẵn sàng:
python3 tests/smoke_frontend.py http://localhost:3000
```

Dùng `tests/browser-checklist.md` kiểm tra UI desktop/mobile, lưu bài dở, đăng nhập,
yêu thích, flashcard, chấm bài và tiến độ sau restart. Lệnh test DB đầy đủ ở README.md.

## Mở rộng học tập và AI — 08/11/2026

Các ghi nhận thiếu công cụ ở phần trên là lịch sử của phiên trước. Kết quả kiểm tra bản mở rộng trong phiên này:

- Next.js production build (`npm run build --prefix frontend`): đạt. TypeScript typecheck đạt.
- Offline logic: **24 unittest đạt**; kiểm tra readiness: **4 unittest đạt**.
- API/unit/provider contracts: `pytest tests/test_expansion.py tests/test_app.py -q`: **26 đạt, 1 bỏ qua** (integration cần TEST_DATABASE_URL). Các test mới chạy ASGI trong cùng event loop và dependency giả lập, không dùng credential hay mạng. Kiểm tra: quyền chủ bộ thẻ; dữ liệu góp ý theo tài khoản; CSRF/body limit; state OAuth ký, thời hạn/provider/browser, Google PKCE; JSON sai không trở thành điểm; quota atomically chặn trước khi gọi provider; adapter chỉ gọi URL đã chọn; kiểm tra audio WAV và đáp án toàn bộ curriculum.
- Node route/static render: `node --test --test-isolation=none tests/frontend-render.cjs tests/learning-route.test.mjs`: **10 đạt**. Kiểm tra trang đầu có giới thiệu/đăng nhập/đăng ký, đúng 20 lý do, hiển thị sửa câu/toàn đoạn và escape nội dung AI, khôi phục URL các mục mới. Static render không xác nhận tương tác trình duyệt.
- PostgreSQL 18.6 đã có trong môi trường: khởi tạo **cluster tạm trong /tmp**, áp dụng cả 3 migration ở chế độ single-user: không có SQL error. Seed 120 câu/20 chủ đề hai lần: đúng số lượng và giữ một flashcard đã thuộc. Kiểm tra xóa bộ kéo theo thẻ và quota UPSERT dừng ở giới hạn: đạt. Không đụng database ứng dụng thật.
- PostgreSQL chạy server qua TCP và Unix socket đều bị sandbox từ chối `Operation not permitted`. Do đó chưa chạy integration DB/API xuyên pool/restart, HTTP smoke hoặc browser thật. Kiểm tra single-user không thay thế các kiểm tra này.
- Bộ integration `test_app.py` đã bổ sung: bộ/thẻ cá nhân CRUD, lưu bài nghe và đáp án, góp ý, bảo toàn qua reseed/restart và cô lập tài khoản. Bộ này **chưa chạy với database server thật** trong phiên này.
- Không gọi API AI tính phí hoặc consent Google/Facebook thật: chưa có credential cấu hình. Contract tests dùng HTTP MockTransport cho OpenAI, DeepSeek, Gemini, Claude, compatible và Colab. Chưa xác nhận chất lượng chấm thực tế, model access, mic, playback tương tác, OAuth qua proxy trên domain thật hay Colab endpoint sống.
- Python compile đạt. Các âm thanh bài học được tạo cục bộ từ nội dung tự soạn, không dùng API; test xác nhận WAV hợp lệ và có thời lượng >15 giây cho mỗi bài nghe.

Chạy migration/seed trên môi trường local được cấu hình theo README, rồi dùng checklist mở rộng trong `tests/browser-checklist.md`. Cấu hình provider/khóa ở `docs/AI-SETUP.md`, OAuth ở `docs/SOCIAL-LOGIN.md`.

## CSP local development — 08/11/2026

Đã tách CSP dev/production: chỉ dev cho phép unsafe-eval và WebSocket hot reload; cả hai cho phép media blob để nghe bản ghi trong trình duyệt. Kiểm tra cấu hình bằng `node --test --test-isolation=none tests/csp-config.cjs` (2 test) và TypeScript typecheck. Cần restart Next dev và tải lại trình duyệt để nhận header mới; chưa kiểm tra browser trực tiếp trong sandbox.

## Rà soát bố cục toàn app và ảnh từ vựng — 08/11/2026

- Đã chuẩn hóa khung nội dung, sidebar 280px trên desktop, menu cuộn ngang trên màn hình <=960px, form/nút tối thiểu 44–46px, chữ nội dung 16–17px. Thẻ từ giữ từ tiếng Anh 28–30px, nghĩa 17px và ví dụ có Ex:. Quiz tách câu hỏi khỏi legend để khung thẳng hàng. Các mục học/AI/thẻ/tiến độ/góp ý và dialog dùng cùng khoảng cách và các breakpoint 1200/960/700/560px.
- `node --test --test-isolation=none tests/ui-pages.cjs`: **22 test đạt**. Render thực tế 14 tab bằng state xác định; 4 màn chỉnh bài Nghe/Đọc/Viết/Nói; 3 chế độ ôn/game flashcard; parse CSS bằng PostCSS. HTML review tạo trong `.tools/ui-review/`. Đây là render tĩnh, không phải test tương tác hoặc đo layout bằng trình duyệt.
- `npm run typecheck --prefix frontend` và `npm run build --prefix frontend`: đạt sau thay đổi giao diện và thêm mục ảnh.
- Đã thử chạy Firefox headless để chụp kiểm tra trực quan nhưng launcher Snap dừng với lỗi snap-confine/AppArmor. Không có ảnh chụp browser thật hay xác nhận không tràn trên từng viewport trong phiên này. Không thay cấu hình sandbox/AppArmor để chạy browser.
- 6 ảnh gốc đã lưu thật tại `frontend/public/vocabulary-images/`; có manifest SHA256/nguồn/giấy phép và ZIP. Đọc UTF-8 checklist thành công, không có U+FFFD. Đã thêm allowedLocales vi/en trong cấu hình VS Code của project và file `.code-workspace` để bỏ cảnh báo Unicode với chữ Việt hợp lệ.

## Ảnh S3 qua backend và bàn giao AWS — 08/11/2026

- Kiến trúc cuối: 9 ảnh/logo nằm ngoài frontend trong `assets/` để upload; AWS đọc S3 private qua `/api/media/{filename}` hoặc `/api/picture-assets/{filename}`. Không còn tệp ảnh trong frontend/public; source archive cũng loại ảnh gốc. Những đường dẫn ảnh frontend public ở ghi nhận cũ phía trên đã được thay thế.
- Thêm backend S3 allowlist, giới hạn 32 MB cho ảnh/ZIP, IAM SDK client có timeout và đóng stream. Test S3 mock xác nhận đúng bucket/key, đóng stream, chặn tên lạ và không fallback local khi chế độ S3 thiếu bucket. Test local xác nhận cả ba logo qua backend.
- Kiểm tra lại toàn bộ bằng `.venv/bin/python -m pytest tests -q`: **61 đạt, 1 bỏ qua** (DB integration cần TEST_DATABASE_URL); Node suites kết hợp: **34 đạt**, gồm 22 kiểm tra UI/CSS. Production build đạt. Không gọi AWS thật hoặc external AI trong các test.
- File `HUONG_DAN_TRIEN_KHAI_AWS.md` mô tả đầy đủ mô hình README, tạo bucket private/versioning, upload, IAM, RDS endpoint, ALB/ASG, secrets, migration, health, rollout/rollback. Có script upload ảnh và policy backend mẫu; chưa tạo bucket hay upload vì chưa có tài khoản/bucket cấu hình trong môi trường.
- Sửa runner dùng đường dẫn Python tuyệt đối để tránh warning sys.prefix khi cd backend. Docs deployment đặt ALB idle 120s, frontend keepalive 130000ms, backend Uvicorn keepalive 130s cho request AI có giới hạn 80s.

## Chữ và khung lớn hơn — 08/11/2026

Tăng chữ toàn app: nội dung 20–21px, nút/menu 19–20px, từ vựng 38px; tăng sidebar desktop 360px, page width 1440px, khung học/AI/quiz tối đa 1100px, input/nút tối thiểu 56–58px. Màn nhỏ dùng một cột cho thẻ/đáp án/form và chuyển menu ngang dưới 1100px. Các nhãn minh họa trang chủ chuyển vào normal flow để tránh chồng chữ sau khi tăng cỡ. Từ vựng qua ảnh nằm ngay trước Flashcard của tôi; icon ánh xạ theo key thay vì index.

Production build/TypeScript đạt. Node render/route/CSP/CSS: 36 kiểm tra đạt, có kiểm tra thứ tự menu và không còn font-size pixel dưới 16px. Đây là kiểm tra cấu trúc/render tĩnh, không phải đo bounding boxes/overflow bằng trình duyệt; browser thật vẫn chưa chạy được do lỗi Snap đã ghi ở trên.
