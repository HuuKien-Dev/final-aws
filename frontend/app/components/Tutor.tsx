'use client'
import {lazy,useState} from 'react'
import AIPractice from './AIPractice'
import type {ExerciseFocus} from './AIExercises'
const Roleplay=lazy(()=>import('./Roleplay'))
const AIExercises=lazy(()=>import('./AIExercises'))
const AICoach=lazy(()=>import('./AICoach'))
export type TutorMode='tutor'|'speaking'|'roleplay'|'exercises'|'coach'
const modes:{id:TutorMode;label:string;intro:string}[]=[
 {id:'tutor',label:'Hỏi bài & luyện viết',intro:'Hỏi bài, nhờ giải thích bằng tiếng Việt hoặc sửa một đoạn văn của bạn.'},
 {id:'speaking',label:'Luyện nói có nhận xét',intro:'Trả lời bằng ghi âm hoặc bản chép lời; gia sư sửa nội dung và hỏi tiếp.'},
 {id:'roleplay',label:'Nhập vai hội thoại',intro:'Trò chuyện theo tình huống thực tế, được sửa từng câu và nhận xét cuối buổi.'},
 {id:'exercises',label:'Bài tập theo điểm yếu',intro:'AI soạn bài tập từ những câu bạn hay sai hoặc nội dung bạn chọn; bài được chấm ngay.'},
 {id:'coach',label:'Phân tích & kế hoạch',intro:'Xem điểm yếu từ kết quả học của bạn và nhận kế hoạch 7 ngày.'},
]
type Props={onDirty:(value:boolean)=>void;mode?:TutorMode;onMode?:(mode:TutorMode)=>void;onOpenTopic?:(id:string)=>void;onReviewMistakes?:()=>void}
export default function Tutor({onDirty,mode:selected,onMode,onOpenTopic=()=>{},onReviewMistakes=()=>{}}:Props){
 const [local,setLocal]=useState<TutorMode>('tutor'),[dirty,setDirty]=useState(false),[focus,setFocus]=useState<ExerciseFocus|undefined>(undefined)
 const mode=selected??local
 const report=(value:boolean)=>{setDirty(value);onDirty(value)}
 function choose(next:TutorMode,start?:ExerciseFocus){
  if(next===mode||dirty&&!window.confirm('Nội dung đang làm dở sẽ bị bỏ. Chuyển chế độ?'))return
  report(false);setFocus(start);setLocal(next);onMode?.(next)
 }
 return <section className="tutor-workspace">
  <div className="ai-modes" role="group" aria-label="Chế độ học với AI">{modes.map(item=><button className={item.id===mode?'primary':'small-button'} aria-pressed={item.id===mode} key={item.id} onClick={()=>choose(item.id)}>{item.label}</button>)}</div>
  <p className="tutor-mode-intro">{modes.find(item=>item.id===mode)?.intro}</p>
  {mode==='roleplay'?<Roleplay onDirty={report}/>
   :mode==='exercises'?<AIExercises key={focus??'default'} start={focus} onDirty={report}/>
   :mode==='coach'?<AICoach onOpenTopic={onOpenTopic} onReviewMistakes={onReviewMistakes} onExercises={()=>choose('exercises','mistakes')}/>
   :<AIPractice key={mode} mode={mode} prompt={mode==='speaking'?'Chọn tình huống bằng một câu tiếng Anh, ví dụ: Let’s practise a job interview. Sau đó trả lời bằng ghi âm hoặc nhập câu trả lời; gia sư sẽ sửa nội dung và hỏi tiếp.':'Bạn có thể hỏi: Giải thích thì hiện tại hoàn thành, sửa đoạn văn của tôi, hoặc cho tôi một bài tập trình độ A2.'} onDirty={report}/>}
 </section>
}
