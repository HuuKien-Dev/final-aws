# Kết nối một nhà cung cấp AI

Mọi tính năng AI đi qua `POST /api/ai` và một cấu hình backend. Không tự chuyển nhà cung cấp khi lỗi; không dùng khóa của bên thứ hai cho âm thanh. Khóa không được đặt trong frontend, NEXT_PUBLIC_ hoặc mã nguồn. Điền trong `backend/.env` hoặc secret backend khi triển khai. Khởi động lại backend sau khi đổi.

| AI_PROVIDER | Giao thức | AI_BASE_URL mặc định | Model |
| --- | --- | --- | --- |
| openai | Responses, JSON Schema | https://api.openai.com/v1 | gpt-4.1-mini |
| deepseek | Chat Completions, JSON mode | https://api.deepseek.com | deepseek-flash |
| gemini | generateContent, JSON mode | https://generativelanguage.googleapis.com/v1beta | gemini-2.5-flash |
| anthropic | Messages, JSON Schema | https://api.anthropic.com/v1 | claude-sonnet-5-5 |
| compatible | Chat Completions, JSON mode | Bắt buộc cấu hình | Bắt buộc cấu hình |
| colab | Chat Completions, JSON mode | Bắt buộc cấu hình | Bắt buộc cấu hình |

Tên model có thể đổi theo nhà cung cấp và quyền tài khoản. Có thể đặt `AI_MODEL` để dùng model tài khoản được cấp. Bỏ hẳn AI_BASE_URL/AI_MODEL nếu muốn lấy mặc định; không đặt chuỗi rỗng. URL phải là HTTPS và chỉ quản trị viên được sửa. URL của giao thức Chat Completions là tiền tố **trước** `/chat/completions` (ví dụ `/v1`), không phải URL trang web chat.

Ví dụ chỉ dùng DeepSeek:

```dotenv
AI_PROVIDER=deepseek
AI_API_KEY=YOUR_SERVER_SIDE_KEY
AI_DAILY_LIMIT=30
AI_AUDIO_ENABLED=false
```

Ví dụ chỉ dùng OpenAI, gồm âm thanh:

```dotenv
AI_PROVIDER=openai
AI_API_KEY=YOUR_SERVER_SIDE_KEY
AI_AUDIO_ENABLED=true
AI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
AI_SPEECH_MODEL=gpt-4o-mini-tts
AI_DAILY_LIMIT=30
```

Có thể bật âm thanh cho `compatible` khi chính endpoint đó cung cấp `/audio/transcriptions` và `/audio/speech`. Các adapter Gemini/Claude/DeepSeek/Colab hiện hỗ trợ văn bản; chúng không tự gửi âm thanh sang OpenAI. Khi âm thanh chưa hỗ trợ, người học vẫn ghi/nghe lại bài nói trên máy và nhập bản chép lời để AI sửa **nội dung**. Bài nghe của khóa học dùng tệp WAV có sẵn, không gọi API.

Một lượt gửi bài nói có thể cần hai lời gọi đến **cùng một bên**: nhận diện ghi âm rồi nhận xét. Nút nghe phản hồi là một lượt tạo giọng đọc riêng. Quota `AI_DAILY_LIMIT` tính theo yêu cầu của app, không phải số request hoặc token của nhà cung cấp; request đã bắt đầu nhưng lỗi vẫn tính để hạn chế gửi lặp. Không tự retry. Nhà cung cấp có thể tính phí theo quy định tài khoản. Âm thanh tối đa 4 MB, ghi trực tiếp tối đa 90 giây; thời gian chờ AI toàn yêu cầu tối đa 80 giây.

## Google Colab / model tự chạy

Colab không có API key suy luận chung cho mọi notebook. Cần một model đang chạy và một endpoint HTTPS tương thích. App hỗ trợ kết nối endpoint đó bằng cấu hình:

```dotenv
AI_PROVIDER=colab
AI_BASE_URL=https://YOUR_INFERENCE_ENDPOINT/v1
AI_MODEL=YOUR_SERVED_MODEL_NAME
AI_API_KEY=YOUR_ENDPOINT_BEARER_KEY
AI_AUDIO_ENABLED=false
```

Endpoint phải nhận `POST /v1/chat/completions`, kiểm tra `Authorization: Bearer ...`, hỗ trợ `messages`, `max_tokens`, `response_format: {"type":"json_object"}` và trả `choices[0].message.content` là chuỗi JSON đúng schema được app gửi trong system prompt, cùng `finish_reason: "stop"`. Model trả thiếu trường hoặc JSON hỏng sẽ hiện lỗi thay vì điểm giả. Có thể dùng máy chủ suy luận OpenAI-compatible đã có; không cần thay backend app.

Runtime Colab có giới hạn thời gian và chính sách sử dụng; xem [Colab FAQ](https://research.google.com/colaboratory/faq.html). Kết nối Colab chỉ phù hợp khi endpoint đó được vận hành hợp lệ và backend truy cập được. Không coi Colab là dịch vụ hosting production luôn chạy. App không tự triển khai notebook hay mở tunnel.

## Lưu dữ liệu và cách chấm

Bài gốc dạng văn bản, bản chép lời và nhận xét được lưu theo tài khoản trong PostgreSQL để xem lại. App không lưu tệp ghi âm vào DB/đĩa server; trình duyệt giữ bản ghi tạm và cho tải về. Khi người học bấm gửi, văn bản hoặc ghi âm sẽ được xử lý bởi nhà cung cấp đang chọn; việc lưu phía nhà cung cấp theo chính sách của bên đó. OpenAI Responses đặt `store: false`.

Điểm AI là điểm luyện tập 0–100, không phải IELTS band hay chứng chỉ CEFR. AI sửa từng câu, giải thích bằng tiếng Việt, viết lại toàn đoạn, nêu điểm mạnh và bài tập tiếp theo. Nhận xét nói chỉ dựa trên bản chép lời, **chưa đánh giá phát âm, ngữ điệu hay độ trôi chảy từ tín hiệu âm thanh**. Lộ trình dùng bài mẫu và kết quả bài luyện đã lưu, nêu rõ kỹ năng chưa được kiểm tra. Bài IELTS hiện là bài khởi động, không phải bộ đề thi hoàn chỉnh.

## Tài liệu giao thức

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI speech to text](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI text to speech](https://developers.openai.com/api/docs/guides/text-to-speech)
- [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

## Mạng khi triển khai AWS

Backend trong private subnet cần đường HTTPS outbound tới endpoint AI đang chọn (và endpoint OAuth nếu bật đăng nhập mạng xã hội), thường qua NAT hoặc một đường egress được quản trị cho phép. S3 Gateway Endpoint/Secrets Manager Interface Endpoint không cung cấp kết nối Internet tới các nhà cung cấp này. Thêm quy tắc outbound TCP 443 phù hợp; frontend không nhận API key và không gọi trực tiếp nhà cung cấp. Nếu không có egress, bài học và flashcard vẫn chạy, còn AI/OAuth sẽ báo không kết nối được. Hai backend ASG dùng chung cấu hình, OAUTH_STATE_SECRET và PostgreSQL để giới hạn lượt dùng/lưu tiến độ nhất quán.
