'use client'
import {useEffect,useRef,useState} from 'react'
import {api} from '../lib/api'
import SpeakButton from './SpeakButton'
import type {AIStatus} from './AIPractice'

type TopicRow={id:string;name:string;total:number;mastered:number;answered:number;correct:number;accuracy:number|null}
export type Insights={quizzes:number;answered:number;accuracy:number|null;mastered:number;total:number;due:number;lessons:number;exercises:{sets:number;accuracy:number|null};topics:TopicRow[];weak_topics:string[];missed:{phrase_id:string;english:string;vietnamese:string;wrong:number;topic:string}[];enough:boolean}
export type StudyPlan={summary:string;strengths:string[];weaknesses:{area:string;evidence:string;advice:string}[];focus_topics:string[];plan:{day:number;focus:string;tasks:string[];minutes:number}[];encouragement:string}
type Saved={id?:string;plan:StudyPlan}
type History={id:string;result:Saved;created_at:string}
type Props={onOpenTopic:(id:string)=>void;onReviewMistakes:()=>void;onExercises:()=>void}

export function PlanView({plan,topics,onOpenTopic}:{plan:StudyPlan;topics:{id:string;name:string}[];onOpenTopic:(id:string)=>void}) {
 const focus=plan.focus_topics.map(id=>topics.find(topic=>topic.id===id)).filter(topic=>!!topic)
 return <section className="ai-result" aria-label="Kế hoạch học 7 ngày">
  <p>{plan.summary}</p>
  {plan.strengths.length>0&&<><h3>Điểm mạnh</h3><ul>{plan.strengths.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
  {plan.weaknesses.length>0&&<><h3>Cần cải thiện</h3><div className="criteria-grid">{plan.weaknesses.map((item,index)=><article key={index}><strong>{item.area}</strong>{item.evidence&&<p>{item.evidence}</p>}<p>→ {item.advice}</p></article>)}</div></>}
  {focus.length>0&&<><h3>Chủ đề nên ưu tiên</h3><div className="button-row">{focus.map(topic=><button key={topic.id} className="small-button" onClick={()=>onOpenTopic(topic.id)}>{topic.name} →</button>)}</div></>}
  <h3>Kế hoạch 7 ngày</h3>
  <ol className="plan-days">{plan.plan.map(day=><li key={day.day}><div><span className="eyebrow">NGÀY {day.day} · {day.minutes} PHÚT</span><strong>{day.focus}</strong></div><ul>{day.tasks.map((task,index)=><li key={index}>{task}</li>)}</ul></li>)}</ol>
  {plan.encouragement&&<p className="coach-reply">{plan.encouragement}</p>}
  <p className="muted">Kế hoạch do AI gợi ý từ kết quả học trong ứng dụng; không phải đánh giá trình độ chính thức.</p>
 </section>
}

export default function AICoach({onOpenTopic,onReviewMistakes,onExercises}:Props) {
 const [insights,setInsights]=useState<Insights|null>(null),[status,setStatus]=useState<AIStatus|null>(null),[saved,setSaved]=useState<Saved|null>(null),[savedAt,setSavedAt]=useState('')
 const [goal,setGoal]=useState(''),[minutes,setMinutes]=useState(20),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 const alive=useRef(true)
 useEffect(()=>{
  alive.current=true
  api<Insights>('/ai/insights').then(value=>{if(alive.current)setInsights(value)}).catch(e=>{if(alive.current)setError(e.message)}).finally(()=>{if(alive.current)setLoading(false)})
  api<AIStatus>('/ai/status').then(value=>{if(alive.current)setStatus(value)}).catch(()=>{})
  api<History[]>('/ai/history?action=coach').then(value=>{if(alive.current&&value[0]){setSaved(value[0].result);setSavedAt(value[0].created_at)}}).catch(()=>{})
  return()=>{alive.current=false}
 },[])
 async function plan(){
  if(busy)return
  setBusy(true);setError('')
  try{
   const value=await api<Saved>('/ai/coach','POST',{goal:goal.trim(),minutes})
   if(!alive.current)return
   setSaved(value);setSavedAt(new Date().toISOString())
   setStatus(old=>old?{...old,used:old.used+1}:old)
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'AI chưa lập được kế hoạch.')}
  finally{if(alive.current)setBusy(false)}
 }
 const practised=insights?.topics.filter(topic=>topic.answered>0).slice(0,6)??[]
 return <section className="ai-coach">
  {error&&<p className="error" role="alert">{error}</p>}
  {loading&&<div className="loading-panel" role="status"><span className="spinner"/>Đang tổng hợp kết quả học của bạn…</div>}
  {insights&&<>
   <p>Số liệu dưới đây lấy từ chính kết quả học của bạn trong ứng dụng (tối đa 100 bài quiz gần nhất).</p>
   <dl className="insight-stats">
    <div><dt>Tỉ lệ đúng quiz</dt><dd>{insights.accuracy===null?'—':insights.accuracy+'%'}</dd><small>{insights.answered} câu đã trả lời</small></div>
    <div><dt>Câu đã thuộc</dt><dd>{insights.mastered}/{insights.total}</dd><small>{insights.due} câu đến hạn ôn</small></div>
    <div><dt>Bài tập AI</dt><dd>{insights.exercises.accuracy===null?'—':insights.exercises.accuracy+'%'}</dd><small>{insights.exercises.sets} bộ đã nộp</small></div>
    <div><dt>Bài IELTS / chuyên ngành</dt><dd>{insights.lessons}</dd><small>bài đã hoàn thành</small></div>
   </dl>
   {practised.length>0&&<section className="topic-progress"><h2>Chủ đề theo tỉ lệ đúng</h2><p className="muted">Chủ đề yếu nhất ở trên cùng.</p>{practised.map(topic=><div className="progress-row" key={topic.id}><div><strong>{topic.name}</strong><span>{topic.accuracy}% đúng · {topic.correct}/{topic.answered} câu<button className="text-button insight-link" onClick={()=>onOpenTopic(topic.id)}>Học lại →</button></span></div><progress value={topic.accuracy??0} max={100} aria-label={'Tỉ lệ đúng '+topic.name}/></div>)}</section>}
   {insights.missed.length>0&&<section className="topic-progress"><h2>Câu bạn vẫn hay sai</h2><ul className="phrase-notes">{insights.missed.map(item=><li key={item.phrase_id}><span><strong lang="en">{item.english}</strong><SpeakButton text={item.english}/></span><span>{item.vietnamese}<small>Sai {item.wrong} lần{item.topic&&' · '+item.topic}</small></span></li>)}</ul><div className="button-row"><button className="small-button" onClick={onReviewMistakes}>Ôn bằng flashcard →</button><button className="small-button" onClick={onExercises}>✦ Tạo bài tập AI từ các câu này →</button></div></section>}
   {!insights.enough&&<p className="notice">Chưa đủ dữ liệu để phân tích. Hãy làm một bài quiz hoặc đánh dấu vài câu đã thuộc, rồi quay lại đây nhé.</p>}
   <form className="card-editor" onSubmit={event=>{event.preventDefault();void plan()}}>
    <h3>Nhờ AI phân tích và lập kế hoạch 7 ngày</h3>
    <p className="muted">{status?`AI: ${status.provider} · ${status.used}/${status.daily_limit} lượt hôm nay. Mỗi lần lập kế hoạch tính 1 lượt.`:'Đang kiểm tra AI…'}</p>
    {status&&!status.configured&&<p className="notice">AI chưa được cấu hình. Phần thống kê ở trên vẫn dùng được.</p>}
    <div className="editor-grid">
     <label>Mục tiêu của bạn (không bắt buộc)<input disabled={busy} maxLength={200} value={goal} onChange={event=>setGoal(event.target.value)} placeholder="Ví dụ: giao tiếp khi đi du lịch tháng sau"/></label>
     <label>Thời gian mỗi ngày<select disabled={busy} value={minutes} onChange={event=>setMinutes(Number(event.target.value))}>{[10,15,20,30,45,60].map(item=><option key={item} value={item}>{item} phút</option>)}</select></label>
    </div>
    <button className="primary" disabled={busy||!status?.configured||!insights.enough}>{busy?'AI đang phân tích…':saved?'Lập kế hoạch mới ✦':'Phân tích và lập kế hoạch ✦'}</button>
   </form>
   {saved&&<>{savedAt&&<p className="muted">Kế hoạch lập lúc {new Date(savedAt).toLocaleString('vi-VN')}.</p>}<PlanView plan={saved.plan} topics={insights.topics} onOpenTopic={onOpenTopic}/></>}
  </>}
 </section>
}
