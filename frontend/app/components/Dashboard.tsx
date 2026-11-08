'use client'
import {useMemo,useState} from 'react'
import {filterTopics,recommendTopic,studyTopics,type Topic,type TopicFilter,type TopicProgress} from '../lib/learning'
import type {LearningTab} from '../learning-route'

type Props={
  topics:Topic[]; loading:boolean; topicsError:string; onReload:()=>void
  progress:{mastered:number;total:number;quiz_count:number;topics:TopicProgress[]}|null
  progressError:string; onRetryProgress:()=>void
  onTopic:(id:string)=>void; onNavigate:(tab:LearningTab)=>void
}
const filters:{id:TopicFilter;label:string}[]=[{id:'all',label:'Tất cả'},{id:'started',label:'Đang học'},{id:'new',label:'Chưa học'},{id:'completed',label:'Đã thuộc'}]

export default function Dashboard({topics,loading,topicsError,onReload,progress,progressError,onRetryProgress,onTopic,onNavigate}:Props){
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState<TopicFilter>('all')
  const rows=useMemo(()=>studyTopics(topics,progress?.topics??[]),[topics,progress])
  const shown=useMemo(()=>filterTopics(rows,query,filter),[rows,query,filter])
  const suggested=progress?recommendTopic(rows):null
  const complete=!!progress&&rows.length>0&&rows.every(topic=>topic.total>0&&topic.mastered===topic.total)
  return <>
    <section className="study-welcome" aria-labelledby="dashboard-title">
      <div><div className="eyebrow">GÓC HỌC CỦA BẠN</div><h1 id="dashboard-title">Một chút hôm nay,<br/>tự tin hơn ngày mai.</h1><p>Chọn một chủ đề gần gũi, học vài câu mới rồi ôn lại theo nhịp của bạn.</p><button className="text-button" onClick={()=>onNavigate('progress')}>Xem tiến độ của tôi ↗</button></div>
      <div className="next-lesson"><span className="eyebrow">{suggested?.mastered?'TIẾP TỤC CHỦ ĐỀ ĐANG HỌC':complete?'BẠN ĐÃ ĐI ĐƯỢC MỘT CHẶNG DÀI':'MỘT ĐIỂM BẮT ĐẦU NHỎ'}</span><h2>{suggested?.name??(complete?'Ôn lại để nhớ lâu':'Sẵn sàng học một bài?')}</h2><p>{suggested?(suggested.mastered?`Bạn đã thuộc ${suggested.mastered}/${suggested.total} câu. Cùng học tiếp nhé.`:suggested.description):complete?'Thử một bài quiz để kiểm tra những câu bạn đã học.':'Khám phá các bài học giao tiếp theo chủ đề.'}</p>{suggested&&<progress value={suggested.mastered} max={Math.max(1,suggested.total)} aria-label={'Tiến độ '+suggested.name}/>}<button className="primary" onClick={()=>suggested?onTopic(suggested.id):onNavigate(complete?'quiz':'lessons')}>{suggested?.mastered?'Học tiếp':complete?'Luyện một bài quiz':'Bắt đầu học'} →</button></div>
    </section>
    <section className="stats" aria-label="Thống kê học tập"><div><strong>{loading||topicsError?'—':topics.reduce((sum,topic)=>sum+topic.count,0)}</strong><span>Câu giao tiếp</span></div><div><strong>{progress?.mastered??'—'}</strong><span>Câu đã thuộc</span></div><div><strong>{progress?.quiz_count??'—'}</strong><span>Bài đã luyện</span></div></section>
    {progressError&&<div className="notice" role="status">{progressError} <button className="text-button" onClick={onRetryProgress}>Tải lại tiến độ</button></div>}
    <section className="study-shortcuts" aria-label="Cách học nhanh">{[
      {tab:'pictures' as const,symbol:'▧',title:'Nhìn hình, nhớ từ',text:'Khám phá từ qua ảnh và ví dụ.'},
      {tab:'vocabulary' as const,symbol:'▣',title:'Kho flashcard của bạn',text:'Bộ từ có sẵn, lật thẻ và ghép cặp.'},
      {tab:'quiz' as const,symbol:'✎',title:'Thử sức với quiz',text:'5 câu hỏi để củng cố kiến thức.'}
    ].map(item=><button className="study-shortcut" key={item.tab} onClick={()=>onNavigate(item.tab)}><span aria-hidden="true">{item.symbol}</span><strong>{item.title}</strong><p>{item.text}</p><span className="shortcut-arrow" aria-hidden="true">↗</span></button>)}</section>
    <section aria-labelledby="topics-title"><div className="section-heading"><div><div className="eyebrow">HỌC TỪ NHỮNG ĐIỀU QUEN THUỘC</div><h2 id="topics-title">Hôm nay bạn muốn học gì?</h2></div></div>
      <div className="topic-tools"><label htmlFor="topic-search">Tìm chủ đề<input id="topic-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ví dụ: du lịch, công việc, ăn uống…"/></label><div className="topic-filters" role="group" aria-label="Lọc theo tiến độ">{filters.map(item=><button key={item.id} disabled={item.id!=='all'&&!progress} className="filter-pill" aria-pressed={filter===item.id} onClick={()=>setFilter(item.id)}>{item.label}</button>)}</div></div>
      {loading?<div className="loading-panel" role="status"><span className="spinner"/>Đang tải chủ đề…</div>:topicsError?<div className="error" role="alert">{topicsError}<button className="small-button" onClick={onReload}>Thử lại</button></div>:<><p className="muted" role="status">{shown.length} / {topics.length} chủ đề</p><div className="topic-grid">{shown.map((topic,index)=><button className="topic-card" key={topic.id} onClick={()=>onTopic(topic.id)}><div className="topic-top"><span className="topic-number">{String(index+1).padStart(2,'0')}</span><span className="topic-arrow" aria-hidden="true">↗</span></div><h3>{topic.name}</h3><p>{topic.description}</p><div className="topic-count">{progress?`${topic.mastered}/${topic.total} câu đã thuộc`:`${topic.count} câu giao tiếp`}{progress&&topic.total>0&&topic.mastered===topic.total&&<span>✓</span>}</div>{progress&&<progress value={topic.mastered} max={Math.max(1,topic.total)} aria-label={'Tiến độ '+topic.name}/>}</button>)}</div>{!shown.length&&<div className="empty"><p>{topics.length?'Chưa có chủ đề phù hợp. Thử đổi từ khóa hoặc bộ lọc nhé.':'Chưa có chủ đề. Bạn có thể thử tải lại sau.'}</p>{topics.length>0?<button className="small-button" onClick={()=>{setQuery('');setFilter('all')}}>Xem tất cả chủ đề</button>:<button className="small-button" onClick={onReload}>Tải lại chủ đề</button>}</div>}</>}
    </section>
  </>
}
