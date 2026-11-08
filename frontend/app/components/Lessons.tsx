'use client'
import {useEffect,useRef,useState} from 'react'
import {api} from '../lib/api'

type Summary = {id:string; name:string; description:string; total:number; mastered:number}
type Sentence = {id:string; english:string; vietnamese:string; mastered:boolean; favorite:boolean}
type Lesson = Summary & {phrases:Sentence[]; offset:number; has_more:boolean}
type Props = {topic:string; onSelect:(id:string)=>void; onPractice:()=>void; onProgress:()=>Promise<void>}

export default function Lessons({topic,onSelect,onPractice,onProgress}:Props) {
  const [lessons,setLessons]=useState<Summary[]>([])
  const [lesson,setLesson]=useState<Lesson|null>(null)
  const [reload,setReload]=useState(0)
  const startIndex=useRef(0)
  const [offset,setOffset]=useState(0)
  const [index,setIndex]=useState(0)
  const [showMeaning,setShowMeaning]=useState(false)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const requestId=useRef(0)
  const active=useRef(true)
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
  useEffect(()=>{startIndex.current=0;setOffset(0);setIndex(0)},[topic])
  useEffect(()=>{
    const id=++requestId.current
    let current=true
    setLoading(true);setError('');setLesson(null)
    const load=topic
      ? api<Lesson>('/lessons/'+encodeURIComponent(topic)+'?offset='+offset).then(value=>{if(current&&requestId.current===id){setLesson(value);setIndex(Math.min(startIndex.current,Math.max(0,value.phrases.length-1)));startIndex.current=0;setShowMeaning(false)}})
      : api<Summary[]>('/lessons').then(value=>{if(current&&requestId.current===id)setLessons(value)})
    load.catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setLoading(false)})
    return()=>{current=false}
  },[topic,offset,reload])

  async function change(sentence:Sentence,kind:'flashcards'|'favorites') {
    if(saving)return
    const value=!(kind==='flashcards'?sentence.mastered:sentence.favorite)
    const request=requestId.current
    setSaving(true);setError('')
    try {
      await api('/'+kind+'/'+sentence.id,'PUT',{value})
      if(active.current&&request===requestId.current) {
        setLesson(old=>old?{...old,
          mastered:old.mastered+(kind==='flashcards'?(value?1:-1):0),
          phrases:old.phrases.map(p=>p.id===sentence.id?{...p,[kind==='flashcards'?'mastered':'favorite']:value}:p)
        }:old)
      }
      await onProgress()
    } catch(e) {
      if(active.current&&request===requestId.current)setError(e instanceof Error?e.message:'Không lưu được câu học. Thử lại nhé.')
    } finally {if(active.current)setSaving(false)}
  }

  if(loading)return <div className="loading-panel" role="status"><span className="spinner"/>Đang tải bài học…</div>
  if(error&&!lesson)return <div className="error" role="alert">{error}<button onClick={()=>setReload(reload+1)}>Thử lại</button></div>
  if(!topic)return <section aria-label="Danh sách bài học"><p>Chọn chủ đề, đọc câu tiếng Anh, thử nhớ nghĩa rồi tự đánh dấu những câu đã thuộc.</p><div className="lesson-grid">{lessons.map(item=><button className="lesson-card" key={item.id} onClick={()=>onSelect(item.id)}><div className="eyebrow">{item.mastered===item.total&&item.total>0?'ĐÃ THUỘC ✓':'BÀI HỌC ANH – VIỆT'}</div><h2>{item.name}</h2><p>{item.description}</p><progress value={item.mastered} max={Math.max(1,item.total)} aria-label={'Tiến độ '+item.name}/><div className="lesson-card-foot"><span>{item.mastered}/{item.total} câu đã thuộc</span><strong>Vào học →</strong></div></button>)}</div>{!lessons.length&&<p className="empty">Chưa có dữ liệu bài học.</p>}</section>
  if(!lesson)return null
  const sentence=lesson.phrases[index]
  return <section aria-label={'Bài học '+lesson.name}>
    <div className="lesson-heading"><button className="text-button" disabled={saving} onClick={()=>onSelect('')}>← Tất cả bài học</button><span className="muted">{lesson.mastered}/{lesson.total} câu đã thuộc</span></div>
    <h2>{lesson.name}</h2><p>{lesson.description}</p>
    <progress value={lesson.mastered} max={Math.max(1,lesson.total)} aria-label="Tiến độ bài học"/>
    {error&&<p className="error" role="alert">{error}</p>}
    {sentence?<article className="lesson-reader">
      <div className="lesson-heading"><span className="eyebrow">CÂU {offset+index+1} / {lesson.total}</span><button className={sentence.favorite?'favorite selected':'favorite'} disabled={saving} onClick={()=>change(sentence,'favorites')} aria-label={sentence.favorite?'Bỏ yêu thích':'Lưu yêu thích'}>{sentence.favorite?'♥':'♡'}</button></div>
      <h3 lang="en">{sentence.english}</h3>
      <p>Thử nhớ nghĩa tiếng Việt trước khi mở đáp án nhé.</p>
      <button className="small-button" aria-expanded={showMeaning} onClick={()=>setShowMeaning(!showMeaning)}>{showMeaning?'Ẩn nghĩa tiếng Việt':'Xem nghĩa tiếng Việt'}</button>
      {showMeaning&&<p className="lesson-meaning" role="status">{sentence.vietnamese}</p>}
      <div className="lesson-reader-controls"><button className="primary" disabled={saving} onClick={()=>change(sentence,'flashcards')}>{sentence.mastered?'Đã thuộc ✓ · Đánh dấu cần ôn':'Tôi đã thuộc câu này ✓'}</button><span className="muted">Trạng thái được lưu vào tài khoản của bạn.</span></div>
      <div className="pagination"><button className="small-button" disabled={saving||(index===0&&offset===0)} onClick={()=>{setShowMeaning(false);if(index>0)setIndex(index-1);else {startIndex.current=19;setOffset(Math.max(0,offset-20))}}}>← Câu trước</button><span>{offset+index+1} / {lesson.total}</span><button className="small-button" disabled={saving||(index===lesson.phrases.length-1&&!lesson.has_more)} onClick={()=>{setShowMeaning(false);if(index<lesson.phrases.length-1)setIndex(index+1);else setOffset(offset+20)}}>Câu tiếp →</button></div>
    </article>:<p className="empty">Bài học chưa có câu giao tiếp. <button className="text-button" onClick={()=>onSelect('')}>Chọn bài khác</button></p>}
    <div className="practice-banner"><div><h3>{lesson.mastered===lesson.total&&lesson.total>0?'Bạn đã thuộc hết các câu trong chủ đề này!':'Củng cố những câu vừa học'}</h3><p>Làm bài trắc nghiệm ngắn. Backend sẽ chấm và lưu kết quả.</p></div><button className="primary" disabled={saving||lesson.total===0} onClick={onPractice}>Luyện tập chủ đề này →</button></div>
  </section>
}
