'use client'
import {useEffect,useRef,useState} from 'react'
import {api} from '../lib/api'
import type {AIStatus} from './AIPractice'

type Question={kind:'choice'|'gap';prompt:string;options:string[];hint:string}
type Review=Question&{answer:string;correct:string;is_correct:boolean;explanation:string}
export type ExerciseResult={score:number;total:number;review:Review[]}
type Exercise={id:string;title:string;questions:Question[];result:ExerciseResult|null}
type Row={id:string;title:string;focus:string;level:string;score:number|null;total:number;created_at:string;submitted_at:string|null}
type Topic={id:string;name:string}
export type ExerciseFocus='mistakes'|'review'|'topic'|'custom'
const levels=['A1','A2','B1','B2']

/** The blank is stored as ___; show it wide enough to read as a gap. */
function Prompt({text}:{text:string}) {
 const parts=text.split('___')
 return <>{parts.map((part,index)=><span key={index}>{part}{index<parts.length-1&&<span className="gap-blank" aria-label="chỗ trống"/>}</span>)}</>
}

export function ExerciseReview({result}:{result:ExerciseResult}) {
 return <>
  <div className="eyebrow">KẾT QUẢ ĐÃ LƯU</div>
  <h2>{result.score} / {result.total} câu đúng</h2>
  {result.review.map((row,index)=><div className={'review '+(row.is_correct?'correct':'incorrect')} key={index}>
   <strong lang="en">{index+1}. <Prompt text={row.prompt}/></strong>
   <p>{row.is_correct?'✓ ':'↳ Đáp án: '}<span lang="en">{row.correct}</span></p>
   {!row.is_correct&&<small>Bạn trả lời: <span lang="en">{row.answer}</span></small>}
   {row.explanation&&<p>{row.explanation}</p>}
  </div>)}
 </>
}

export default function AIExercises({onDirty,start}:{onDirty:(value:boolean)=>void;start?:ExerciseFocus}) {
 const [status,setStatus]=useState<AIStatus|null>(null),[topics,setTopics]=useState<Topic[]>([]),[rows,setRows]=useState<Row[]>([]),[missed,setMissed]=useState<number|null>(null),[mastered,setMastered]=useState<number|null>(null)
 const [focus,setFocus]=useState<ExerciseFocus>(start??'topic'),[topic,setTopic]=useState(''),[note,setNote]=useState(''),[level,setLevel]=useState('A2'),[count,setCount]=useState(5)
 const [exercise,setExercise]=useState<Exercise|null>(null),[answers,setAnswers]=useState<string[]>([]),[result,setResult]=useState<ExerciseResult|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const alive=useRef(true),chosen=useRef(!!start),callback=useRef(onDirty)
 callback.current=onDirty
 const dirty=!!exercise&&!result&&answers.some(answer=>answer.trim())
 useEffect(()=>{onDirty(dirty)},[dirty,onDirty])
 useEffect(()=>{
  alive.current=true
  api<AIStatus>('/ai/status').then(value=>{if(alive.current)setStatus(value)}).catch(e=>{if(alive.current)setError(e.message)})
  api<Topic[]>('/topics').then(value=>{if(alive.current){setTopics(value);setTopic(old=>old||value[0]?.id||'')}}).catch(()=>{})
  api<Row[]>('/ai/exercises').then(value=>{if(alive.current)setRows(value)}).catch(()=>{})
  api<{missed:unknown[];mastered:number}>('/ai/insights').then(value=>{
   if(!alive.current)return
   setMissed(value.missed.length);setMastered(value.mastered)
   // Start from the learner's own mistakes when there are some.
   if(!chosen.current&&value.missed.length)setFocus('mistakes')
  }).catch(()=>{})
  return()=>{alive.current=false;callback.current(false)}
 },[])

 function pick(value:ExerciseFocus){chosen.current=true;setFocus(value)}
 function leave(){return !dirty||window.confirm('Bài tập đang làm dở chưa được nộp. Bỏ các câu trả lời đã nhập?')}
 async function generate(){
  if(busy||!leave())return
  setBusy(true);setError('')
  try{
   const value=await api<Exercise>('/ai/exercises','POST',{focus,topic:focus==='topic'?topic:'',text:focus==='custom'?note.trim():'',level,count})
   if(!alive.current)return
   setExercise(value);setAnswers(value.questions.map(()=>''));setResult(null)
   setStatus(old=>old?{...old,used:old.used+1}:old)
   setRows(old=>[{id:value.id,title:value.title,focus:'',level,score:null,total:value.questions.length,created_at:new Date().toISOString(),submitted_at:null},...old].slice(0,20))
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'AI chưa tạo được bài tập.')}
  finally{if(alive.current)setBusy(false)}
 }
 async function submit(){
  if(busy||!exercise)return
  setBusy(true);setError('')
  try{
   const value=await api<ExerciseResult>('/ai/exercises/'+exercise.id+'/submit','POST',{answers})
   if(!alive.current)return
   setResult(value)
   setRows(old=>old.map(row=>row.id===exercise.id?{...row,score:value.score,submitted_at:new Date().toISOString()}:row))
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa chấm được bài.')}
  finally{if(alive.current)setBusy(false)}
 }
 async function open(id:string){
  if(busy||!leave())return
  setBusy(true);setError('')
  try{
   const value=await api<Exercise>('/ai/exercises/'+id)
   if(!alive.current)return
   setExercise(value);setResult(value.result);setAnswers(value.result?value.result.review.map(row=>row.answer):value.questions.map(()=>''))
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa mở được bài tập.')}
  finally{if(alive.current)setBusy(false)}
 }
 const answer=(index:number,value:string)=>setAnswers(old=>old.map((item,position)=>position===index?value:item))
 const ready=!!status?.configured
 const blocked=focus==='custom'?note.trim().length<2:focus==='topic'?!topic:focus==='mistakes'?missed===0:mastered===0

 return <section className="ai-exercises">
  <p className="muted">{status?`AI: ${status.provider} · ${status.used}/${status.daily_limit} lượt hôm nay. Mỗi bộ bài tập tính 1 lượt; chấm bài không tốn lượt.`:'Đang kiểm tra AI…'}</p>
  {status&&!ready&&<p className="notice">AI chưa được cấu hình. Quản trị viên cần cấu hình API ở backend để tạo bài tập.</p>}
  {error&&<p className="error" role="alert">{error}</p>}

  <form className="card-editor" onSubmit={event=>{event.preventDefault();void generate()}}>
   <h3>Tạo bài tập riêng cho bạn</h3>
   <fieldset className="focus-options" disabled={busy}>
    <legend>Luyện nội dung nào?</legend>
    <label className={'option '+(focus==='mistakes'?'chosen':'')}><input type="radio" name="exercise-focus" checked={focus==='mistakes'} onChange={()=>pick('mistakes')}/>Câu tôi hay sai trong quiz{missed!==null&&` (${missed} câu)`}</label>
    <label className={'option '+(focus==='review'?'chosen':'')}><input type="radio" name="exercise-focus" checked={focus==='review'} onChange={()=>pick('review')}/>Ôn câu đã thuộc{mastered!==null&&` (${mastered} câu)`}</label>
    <label className={'option '+(focus==='topic'?'chosen':'')}><input type="radio" name="exercise-focus" checked={focus==='topic'} onChange={()=>pick('topic')}/>Theo chủ đề bài học</label>
    <label className={'option '+(focus==='custom'?'chosen':'')}><input type="radio" name="exercise-focus" checked={focus==='custom'} onChange={()=>pick('custom')}/>Tự mô tả (ngữ pháp, từ vựng…)</label>
   </fieldset>
   {focus==='topic'&&<label>Chủ đề<select disabled={busy} value={topic} onChange={event=>setTopic(event.target.value)}>{topics.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
   {focus==='custom'&&<label>Bạn muốn luyện gì?<input disabled={busy} maxLength={200} value={note} onChange={event=>setNote(event.target.value)} placeholder="Ví dụ: thì hiện tại hoàn thành, giới từ chỉ thời gian"/></label>}
   {focus==='mistakes'&&missed===0&&<p className="muted">Bạn chưa có câu sai nào trong các bài quiz gần đây. Hãy chọn chủ đề hoặc tự mô tả nội dung muốn luyện.</p>}
   {focus==='review'&&mastered===0&&<p className="muted">Bạn chưa đánh dấu câu nào là đã thuộc. Hãy chọn chủ đề hoặc tự mô tả nội dung muốn luyện.</p>}
   <div className="editor-grid">
    <label>Trình độ<select disabled={busy} value={level} onChange={event=>setLevel(event.target.value)}>{levels.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    <label>Số câu<select disabled={busy} value={count} onChange={event=>setCount(Number(event.target.value))}>{[5,8,10].map(item=><option key={item} value={item}>{item} câu</option>)}</select></label>
   </div>
   <button className="primary" disabled={busy||!ready||blocked}>{busy&&!exercise?'AI đang soạn bài…':'Tạo bài tập ✦'}</button>
  </form>

  {exercise&&!result&&<form className="quiz-area exercise-set" onSubmit={event=>{event.preventDefault();void submit()}}>
   <h2>{exercise.title}</h2>
   <p className="muted">AI có thể sai. Đáp án và giải thích hiện sau khi bạn nộp bài.</p>
   {exercise.questions.map((question,index)=><fieldset key={index} disabled={busy}>
    <legend><span className="eyebrow">CÂU {index+1} · {question.kind==='gap'?'ĐIỀN TỪ':'CHỌN ĐÁP ÁN'}</span></legend>
    <p className="quiz-question" lang="en"><Prompt text={question.prompt}/></p>
    {question.hint&&<p className="muted">Gợi ý: {question.hint}</p>}
    {question.kind==='choice'?<div className="options">{question.options.map(option=><label className={answers[index]===option?'option chosen':'option'} key={option}><input required type="radio" name={'exercise-'+index} checked={answers[index]===option} onChange={()=>answer(index,option)}/><span lang="en">{option}</span></label>)}</div>
     :<label>Điền từ còn thiếu<input required autoComplete="off" autoCapitalize="off" spellCheck={false} lang="en" maxLength={200} value={answers[index]??''} onChange={event=>answer(index,event.target.value)}/></label>}
   </fieldset>)}
   <div className="quiz-controls"><button className="primary" disabled={busy||answers.some(item=>!item.trim())}>{busy?'Đang chấm…':'Nộp bài và xem giải thích →'}</button><span className="muted" role="status">Đã trả lời {answers.filter(item=>item.trim()).length}/{exercise.questions.length} câu</span></div>
  </form>}

  {exercise&&result&&<section className="quiz-result" aria-label="Kết quả bài tập"><h3>{exercise.title}</h3><ExerciseReview result={result}/><p className="muted">Bài tập và giải thích do AI tạo để tham khảo. Điểm này không phải điểm thi chính thức.</p></section>}

  {rows.length>0&&<details className="ai-history"><summary>Bài tập đã tạo ({rows.length} gần nhất)</summary>{rows.map(row=><button key={row.id} className="history-item" disabled={busy} onClick={()=>void open(row.id)}><span>{new Date(row.created_at).toLocaleString('vi-VN')}</span><strong>{row.title}</strong><span>{row.submitted_at?`${row.score} / ${row.total} câu đúng →`:'Làm tiếp →'}</span></button>)}</details>}
 </section>
}
