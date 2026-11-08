# Kiểm tra trình duyệt (local và AWS)

1. Mở web trên desktop và màn hình 390px. Xác nhận logo, chữ và thẻ chủ đề không tràn.
2. Đăng ký email mới (mật khẩu >=10 ký tự), đăng xuất và đăng nhập lại.
3. Chọn Chào hỏi từ trang chủ: màn Bài học mở đúng chủ đề. Mở/ẩn nghĩa, chuyển câu, lưu yêu thích, đánh dấu đã thuộc rồi tải lại. Nút luyện tập phải mở quiz đúng chủ đề.
   Mở mục Câu giao tiếp, tìm Hello và Xin chào. Lưu một câu yêu thích, bật bộ lọc và kiểm tra.
4. Mở Flashcard, lật thẻ, đánh dấu đã thuộc. Tải lại trang, đăng nhập lại nếu cần, xác nhận vẫn đã thuộc.
5. Mở Luyện tập, làm đủ câu và nộp. Xem điểm, đáp án, lịch sử trong Tiến độ. Nhấn Xem lại trên bài cũ và kiểm tra đúng điểm/đáp án.
   Thử gửi lại cùng payload nộp bài trong DevTools: trả cùng kết quả, không thêm lịch sử; sửa đáp án rồi gửi lại phải bị từ chối.
6. Làm dở một quiz, chọn vài đáp án rồi bấm **Lưu bài để làm tiếp**. Tải lại trang, mở lại Luyện tập cùng chủ đề và xác nhận đáp án được khôi phục.
7. Khởi động lại backend bằng systemctl hoặc dừng/chạy uvicorn; tải lại Tiến độ.
   Phiên, yêu thích, đã thuộc và điểm phải còn. Với AWS, kiểm tra request qua hai backend khác nhau.
8. DevTools → Network → Preserve log. Thực hiện toàn bộ thao tác trên.
   Chỉ có tên miền app; API có đường dẫn /api/…, ảnh /freelingo-assets/….
   Không có DNS Internal ALB, API AI, S3 private, CDN hay dịch vụ giọng nói trong request trình duyệt.
9. Thử tài khoản thứ hai: không thấy tiến độ, yêu thích hoặc quiz của tài khoản thứ nhất.
10. Trên AWS, xác nhận cả hai target group Healthy; kiểm tra HTTPS và redirect HTTP sang HTTPS.

Đây là checklist bàn giao, không phải biên bản đã kiểm thử. Xem TESTING.md cho kết quả thực tế.

11. Mở Flashcard chủ đề Ăn uống, tải lại trang: URL và mục học được khôi phục sau đăng nhập.
12. Chọn vài đáp án quiz chưa lưu, chuyển mục hoặc đổi chủ đề: app phải cảnh báo.
    Chọn Hủy để tiếp tục làm. Bấm Lưu bài rồi chuyển mục: không cảnh báo thay đổi chưa lưu.
13. Cố ý trả lời sai một câu, mở Tiến độ → Ôn câu từng sai: thấy đúng câu của tài khoản.
    Sau khi trả lời đúng câu đó trong quiz mới, bộ ôn không còn câu ấy.
    Tài khoản thứ hai không thấy bộ ôn của tài khoản thứ nhất.

14. Chưa đăng nhập: trang đầu có giới thiệu ngắn, nút Đăng nhập/Đăng ký và đường dẫn 20 lý do. Mục 20 lý do có thể xem công khai và quay lại Trang chủ.
15. Đăng nhập: thấy lời khích lệ; kiểm tra menu mở đủ IELTS, chuyên ngành, flashcard cá nhân, gia sư, trình độ và góp ý ở cả 390px/desktop.
16. Flashcard cá nhân: tạo hai bộ, thêm/sửa/xóa thẻ, đổi tên bộ, ôn chưa thuộc. Xóa bộ phải xác nhận và không ảnh hưởng bộ khác. Đăng nhập lại phải thấy dữ liệu còn lưu; tài khoản thứ hai không thấy hoặc sửa được bộ đầu tiên.
17. Ghép cặp cần ít nhất hai cặp khác nhau; ghép sai phải báo và cho thử lại. Gõ từ cần kiểm tra đáp án, điểm tổng và chơi lại. Trò chơi không tự đánh dấu từ đã thuộc.
18. Mở mỗi bản nghe ở IELTS và 5 chuyên ngành, nghe/đổi tốc độ/nghe lại. Làm bài, kiểm tra đúng/sai, mở giải thích và transcript. Mở đáp án khi chưa trả lời vẫn hoạt động và ghi rõ đây là học theo mẫu.
19. Lưu bài Nghe/Đọc/Viết, chuyển mục và tải lại, xác nhận khôi phục. Chỉnh bài chưa lưu rồi chuyển phải có cảnh báo. Phím cách/←/→ flashcard không can thiệp khi đang nhập văn bản hoặc chọn nút.
20. AI chưa có khóa: hiển thị trạng thái chưa cấu hình, nút gửi tắt. Có khóa test: thử gia sư, nói, viết, lộ trình; kiểm tra câu gốc, câu sửa, toàn đoạn cải thiện, nhận xét và lịch sử riêng tài khoản. Tắt quyền model/quota để kiểm tra thông báo lỗi; không hiển thị khóa hoặc điểm giả.
21. Chọn DeepSeek/Gemini/Claude: thao tác văn bản dùng đúng bên đang cấu hình. Không tự gọi OpenAI cho âm thanh. Chọn endpoint compatible/Colab có JSON mode để kiểm tra adapter; endpoint trả JSON sai phải hiện lỗi.
22. Với cùng nhà cung cấp có audio được bật: cấp quyền micro trên HTTPS/localhost, ghi/dừng/nghe lại/tải về, gửi bản ghi và nghe phản hồi AI. Từ chối quyền micro/tệp >4 MB phải báo rõ. Rời mục trong khi ghi phải cảnh báo và dừng micro sau khi rời. Nhận xét phải ghi chưa đánh giá phát âm.
23. Google/Facebook: kiểm thử bằng app OAuth test thật, consent/cancel/state hết hạn và callback qua proxy. Không có credential thì nút tắt. Email đã tồn tại bằng phương thức khác không tự gộp. Logout app xóa phiên app.
24. Góp ý: gửi ba loại, tải lại thấy góp ý của mình, tài khoản khác không thấy. Nội dung trống hoặc <10 ký tự bị từ chối.

Với OAuth, trình duyệt có chuyển hướng chủ động sang Google/Facebook khi người dùng bấm đăng nhập. Với AI, frontend vẫn chỉ gọi /api của app; backend kết nối nhà cung cấp được chọn. Các kiểm tra này chưa thay thế biên bản chạy thực tế.
