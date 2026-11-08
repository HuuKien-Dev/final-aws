'use client'
import {useEffect,useRef,useState} from 'react'
import {api} from '../lib/api'
const reasons=[
['Mở rộng cơ hội việc làm','Bạn có thể tiếp cận các vị trí cần giao tiếp và đọc tài liệu tiếng Anh.'],
['Làm việc với đồng nghiệp quốc tế','Trao đổi ý tưởng, cập nhật tiến độ và đặt câu hỏi rõ ràng hơn.'],
['Tự tin khi phỏng vấn','Giới thiệu kinh nghiệm và mục tiêu nghề nghiệp bằng ngôn ngữ của nhà tuyển dụng.'],
['Đọc tài liệu chuyên ngành','Tiếp cận hướng dẫn, sách và tài liệu trong lĩnh vực bạn quan tâm.'],
['Học qua khóa học quốc tế','Theo dõi bài giảng và đặt câu hỏi trong nhiều khóa học trực tuyến.'],
['Chuẩn bị cho du học','Luyện kỹ năng nghe giảng, thảo luận và viết bài học thuật.'],
['Tìm hiểu học bổng','Tự đọc yêu cầu và chuẩn bị hồ sơ phù hợp với từng chương trình.'],
['Du lịch chủ động hơn','Hỏi đường, đặt phòng và trao đổi khi lịch trình thay đổi.'],
['Kết bạn ở nhiều nơi','Bắt đầu những cuộc trò chuyện với người có nền tảng khác bạn.'],
['Hiểu thêm về văn hóa','Khám phá phong tục và cách nhìn qua câu chuyện của người khác.'],
['Thưởng thức phim theo lời thoại','Nghe những cách nói đời thường và hiểu thêm sắc thái câu chuyện.'],
['Đọc sách theo sở thích','Có thêm lựa chọn về truyện, kiến thức và tác giả.'],
['Hiểu lời bài hát','Kết nối âm thanh với ý nghĩa và cách sử dụng từ.'],
['Tra cứu thông tin đa dạng','Dùng thêm từ khóa để tìm và đối chiếu nhiều nguồn tài liệu.'],
['Sử dụng công cụ công nghệ','Hiểu giao diện, thông báo lỗi và hướng dẫn sử dụng phổ biến.'],
['Phục vụ khách hàng tốt hơn','Hỏi rõ nhu cầu và xử lý yêu cầu của khách nói tiếng Anh.'],
['Giới thiệu Việt Nam','Chia sẻ về món ăn, địa điểm và cuộc sống của bạn với bạn bè quốc tế.'],
['Luyện thói quen học đều','Một mục tiêu nhỏ mỗi ngày giúp bạn duy trì việc thực hành.'],
['Diễn đạt suy nghĩ theo cách mới','Thử giải thích một ý bằng nhiều từ và ví dụ khác nhau.'],
['Tạo thêm lựa chọn cho tương lai','Học từng bước hôm nay để sẵn sàng hơn khi cơ hội phù hợp xuất hiện.'],
]
export function WhyEnglish(){return <section><p>Bạn không cần giỏi ngay từ đầu. Hãy chọn một lý do gắn với cuộc sống của mình để bắt đầu.</p><div className="reason-grid">{reasons.map(([title,body],i)=><article className="reason-card" key={title}><span className="eyebrow">{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>}
const encouragements=['Bạn không cần học thật nhiều hôm nay. Chỉ cần bắt đầu với một câu.','Một lỗi sai được sửa là một bước tiến mới. Cứ thử nói nhé!','Mỗi lần ôn lại, bạn đang cho trí nhớ thêm một cơ hội.','Năm phút tập trung hôm nay cũng đáng ghi nhận.','Hôm nay bạn có thể hiểu thêm một câu mà hôm qua chưa biết.','Học theo nhịp của bạn. Sự đều đặn quan trọng hơn vội vàng.','Đừng đợi hoàn hảo mới nói. Hãy bắt đầu từ điều bạn muốn chia sẻ.','Bài học nhỏ hôm nay có thể giúp một cuộc trò chuyện ngày mai.']
export function Motivation({onLearn}:{onLearn:()=>void}){
 const [quote,setQuote]=useState(encouragements[0])
 useEffect(()=>{setQuote(encouragements[Math.floor(Math.random()*encouragements.length)])},[])
 return <aside className="motivation" aria-label="Lời nhắn khích lệ"><div><span className="eyebrow">MỘT CHÚT ĐỘNG LỰC HÔM NAY</span><p>{quote}</p></div><button className="small-button" onClick={onLearn}>Học một bài nhỏ →</button></aside>
}
type Entry={id:string;category:string;message:string;created_at:string}
const categories={bug:'Báo lỗi',feature:'Đề xuất tính năng',content:'Góp ý nội dung',other:'Góp ý khác'}
export function AppFeedback({onDirty}:{onDirty:(value:boolean)=>void}){
 const [entries,setEntries]=useState<Entry[]>([]),[category,setCategory]=useState('feature'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const alive=useRef(true),dirty=useRef(false),callback=useRef(onDirty);callback.current=onDirty
 useEffect(()=>{alive.current=true;api<Entry[]>('/feedback').then(v=>{if(alive.current)setEntries(v)}).catch(e=>{if(alive.current)setError(e.message)});return()=>{alive.current=false;callback.current(false)}},[])
 useEffect(()=>{dirty.current=!!message;onDirty(!!message)},[message,onDirty])
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[])
 async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const result=await api<{id:string;message:string}>('/feedback','POST',{category,message});if(!alive.current)return;setEntries(old=>[{id:result.id,category,message,created_at:new Date().toISOString()},...old].slice(0,50));setMessage('');setNotice(result.message)}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa gửi được góp ý.')}finally{if(alive.current)setBusy(false)}}
 return <section><p>Chia sẻ điều bạn muốn ứng dụng làm tốt hơn. Với lỗi, hãy mô tả thao tác, kết quả mong đợi và điều đang xảy ra. Không gửi mật khẩu hoặc khóa API.</p>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}<form className="card-editor" onSubmit={send}><label>Loại góp ý<select disabled={busy} value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Nội dung<textarea disabled={busy} required minLength={10} maxLength={5000} rows={6} value={message} onChange={e=>setMessage(e.target.value)}/></label><button className="primary" disabled={busy||message.trim().length<10}>{busy?'Đang gửi…':'Gửi góp ý'}</button></form><h2>Góp ý bạn đã gửi</h2><p className="muted">Hiển thị tối đa 50 góp ý gần nhất của tài khoản. Góp ý được lưu trong ứng dụng để người quản trị xem xét.</p>{entries.map(entry=><article className="feedback-entry" key={entry.id}><span className="muted">{categories[entry.category as keyof typeof categories]} · {new Date(entry.created_at).toLocaleString('vi-VN')}</span><p className="preserve-lines">{entry.message}</p></article>)}{!entries.length&&<p>Chưa có góp ý nào.</p>}</section>
}
