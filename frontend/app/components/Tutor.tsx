'use client'
import {useState} from 'react'
import AIPractice from './AIPractice'
export default function Tutor({onDirty}:{onDirty:(value:boolean)=>void}){
 const [mode,setMode]=useState<'tutor'|'speaking'>('tutor'),[dirty,setDirty]=useState(false)
 return <section><p>Hỏi bài, nhờ giải thích bằng tiếng Việt, sửa câu hoặc bắt đầu một cuộc hội thoại theo tình huống bạn chọn.</p><div className="button-row">{(['tutor','speaking'] as const).map(value=><button className={value===mode?'primary':'small-button'} key={value} onClick={()=>{if(value===mode||dirty&&!window.confirm('Nội dung chưa gửi sẽ bị bỏ. Chuyển chế độ?'))return;setDirty(false);onDirty(false);setMode(value)}}>{value==='tutor'?'Hỏi bài & luyện viết':'Luyện hội thoại & nói'}</button>)}</div><AIPractice key={mode} mode={mode} prompt={mode==='speaking'?'Chọn tình huống bằng một câu tiếng Anh, ví dụ: Let’s practise a job interview. Sau đó trả lời bằng ghi âm hoặc nhập câu trả lời; gia sư sẽ sửa nội dung và hỏi tiếp.':'Bạn có thể hỏi: Giải thích thì hiện tại hoàn thành, sửa đoạn văn của tôi, hoặc cho tôi một bài tập trình độ A2.'} onDirty={value=>{setDirty(value);onDirty(value)}}/></section>
}
