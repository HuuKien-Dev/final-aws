'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {api} from './lib/api'
import Lessons from './components/Lessons'
import Courses from './components/Courses'
import Vocabulary from './components/Vocabulary'
import PictureVocabulary from './components/PictureVocabulary'
import Tutor from './components/Tutor'
import {WhyEnglish,Motivation,AppFeedback} from './components/Community'
import {readLearningRoute, learningRouteSearch, type LearningTab as Tab} from './learning-route'
import QuizReview, {type QuizResult as Result} from './components/QuizReview'
type Topic={id:string;name:string;description:string;count:number}
type Phrase={id:string;english:string;vietnamese:string;favorite:boolean;mastered:boolean}
type Progress={mastered:number;favorites:number;total:number;quiz_count:number;topics:{id:string;name:string;total:number;mastered:number;favorites:number}[];history:{id:string;score:number;total:number;submitted_at:string}[]}
type Quiz={id:string;answers:string[];questions:{phrase_id:string;english:string;options:string[]}[]}
const labels:Record<Tab,string>={home:'Tổng quan',lessons:'Bài học',phrases:'Câu giao tiếp',flashcards:'Flashcard',quiz:'Luyện tập',progress:'Tiến độ',ielts:'IELTS',specialist:'Tiếng Anh chuyên ngành',pictures:'Từ vựng qua ảnh',vocabulary:'Flashcard của tôi',tutor:'Học với gia sư AI',placement:'Trình độ & Lộ trình',why:'Vì sao học tiếng Anh?',feedback:'Góp ý cải thiện app'}
const navSymbols:Record<Tab,string>={home:'⌂',lessons:'▤',phrases:'≡',flashcards:'▣',quiz:'✎',progress:'↗',ielts:'I',specialist:'◇',pictures:'▧',vocabulary:'▣',tutor:'✦',placement:'◎',why:'?',feedback:'♡'}
const symbols:Record<string,string>={greetings:'01',food:'02',shopping:'03',transport:'04',travel:'05'}
export default function Home(){
 const [historyReview,setHistoryReview]=useState<{id:string;result:Result;submitted_at:string}|null>(null),[historyLoading,setHistoryLoading]=useState('')
 const [moduleDirty,setModuleDirty]=useState(false)
 const [providers,setProviders]=useState<Record<string,boolean>>({})
 const historyRequest=useRef(0)
 const [mistakesOnly,setMistakesOnly]=useState(false)
 const [hideMeanings,setHideMeanings]=useState(false)
 const phraseRequest=useRef(0)
 const [pendingTab,setPendingTab]=useState<Tab>('home')
 const [loadingPhrases,setLoadingPhrases]=useState(false),[quizLoading,setQuizLoading]=useState(false),[savingId,setSavingId]=useState(''),[notice,setNotice]=useState('')
 const [offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false)
 const [tab,setTab]=useState<Tab>('home'),[topics,setTopics]=useState<Topic[]>([])
 const [email,setEmail]=useState<string|null>(null),[ready,setReady]=useState(false)
 const [auth,setAuth]=useState<'login'|'register'|null>(null),[authEmail,setAuthEmail]=useState(''),[password,setPassword]=useState('')
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[topic,setTopic]=useState(''),[query,setQuery]=useState(''),[onlyFavorites,setOnlyFavorites]=useState(false)
 const [phrases,setPhrases]=useState<Phrase[]>([]),[progress,setProgress]=useState<Progress|null>(null)
 const [index,setIndex]=useState(0),[flipped,setFlipped]=useState(false),[quiz,setQuiz]=useState<Quiz|null>(null),[answers,setAnswers]=useState<string[]>([]),[result,setResult]=useState<Result|null>(null)
 const accountRef=useRef<string|null>(null)
 accountRef.current=email
 const report=(e:unknown)=>setError(e instanceof Error?(e.name==='TimeoutError'?'Máy chủ phản hồi chậm. Vui lòng thử lại.':e.message):'Đã có lỗi xảy ra')
 const refreshProgress=useCallback(async()=>{const owner=accountRef.current;if(!owner)return;try{const data=await api<Progress>('/progress');if(accountRef.current===owner)setProgress(data)}catch(e){if(accountRef.current===owner)report(e)}},[])
 useEffect(()=>{const route=readLearningRoute(window.location.search);setTab(route.tab);setTopic(route.topic);setOnlyFavorites(route.favorites);setMistakesOnly(route.mistakes)},[])
 useEffect(()=>{api<Record<string,boolean>>('/auth/providers').then(setProviders).catch(()=>{});const authError=new URLSearchParams(window.location.search).get('auth_error');if(authError){setAuth('login');setError(authError==='oauth_email_exists'?'Email này đã có tài khoản. Hãy đăng nhập bằng phương thức đã đăng ký; ứng dụng không tự liên kết tài khoản.':authError==='oauth_cancelled'?'Bạn đã hủy đăng nhập mạng xã hội.':'Đăng nhập mạng xã hội chưa thành công. Vui lòng thử lại.')}api<Topic[]>('/topics').then(setTopics).catch(report);api<{email:string}>('/auth/me').then(u=>setEmail(u.email)).catch(()=>{}).finally(()=>setReady(true))},[])
 const dirty=tab==='quiz'&&!!quiz&&!result&&JSON.stringify(answers)!==JSON.stringify(quiz.answers)
 useEffect(()=>{
  if(!ready)return
  if(!email&&!['home','why'].includes(tab)){setPendingTab(tab);setAuth('login');setTab('home');return}
  const search=learningRouteSearch({tab,topic,favorites:onlyFavorites,mistakes:mistakesOnly})
  window.history.replaceState(null,'',window.location.pathname+search)
 },[ready,email,tab,topic,onlyFavorites,mistakesOnly])
 useEffect(()=>{
  if(!dirty&&!moduleDirty)return
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',warn)
  return()=>window.removeEventListener('beforeunload',warn)
 },[dirty,moduleDirty])
 useEffect(()=>{historyRequest.current++;setHistoryReview(null);setHistoryLoading('');if(email) void refreshProgress()},[email,refreshProgress])
 useEffect(()=>{
  const expired=()=>{setEmail(null);setModuleDirty(false);setProgress(null);setPhrases([]);setQuiz(null);setResult(null);setPendingTab(tab);setTab('home');setAuth('login');setNotice('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.')}
  window.addEventListener('session-expired',expired)
  return()=>window.removeEventListener('session-expired',expired)
 },[tab])
 useEffect(()=>{setOffset(0)},[topic,query,onlyFavorites,mistakesOnly,tab])
 useEffect(()=>{
  if(!email||tab!=='quiz')return
  let active=true
  setQuizLoading(true);setQuiz(null);setResult(null)
  api<Quiz|null>('/quizzes/active?'+new URLSearchParams({topic})).then(q=>{
   if(active&&q){setQuiz(q);setAnswers(q.answers);setNotice('Đã khôi phục bài luyện đang làm. Các câu trả lời đã lưu vẫn còn.')}
  }).catch(e=>{if(active)report(e)}).finally(()=>{if(active)setQuizLoading(false)})
  return()=>{active=false}
 },[email,tab,topic])
 useEffect(()=>{
  if(!email||!['phrases','flashcards'].includes(tab))return
  let active=true
  ++phraseRequest.current
  setLoadingPhrases(true);setPhrases([])
  const timer=setTimeout(()=>{api<Phrase[]>('/phrases?'+new URLSearchParams({topic,q:query,favorites:String(onlyFavorites),mistakes:String(mistakesOnly),limit:'51',offset:String(offset)})).then(p=>{if(active){setHasMore(p.length>50);setPhrases(p.slice(0,50));setIndex(0);setFlipped(false)}}).catch(e=>{if(active)report(e)}).finally(()=>{if(active)setLoadingPhrases(false)})},200)
  return()=>{active=false;++phraseRequest.current;clearTimeout(timer)}
 },[tab,email,topic,query,onlyFavorites,mistakesOnly,offset])
 function canLeaveQuiz(){if(busy){setNotice('Đang xử lý yêu cầu. Vui lòng chờ một chút.');return false}return !(dirty||moduleDirty)||window.confirm('Bạn có bài làm hoặc nội dung chưa lưu. Rời mục này sẽ bỏ thay đổi chưa lưu. Bạn vẫn muốn tiếp tục?')}
 function navigate(next:Tab){if(next!==tab&&!canLeaveQuiz())return;setError('');setNotice('');if(!email&&!['home','why'].includes(next)){setPendingTab(next);setAuth('login');return}if(next!==tab)setModuleDirty(false);setTab(next)}
 async function authenticate(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const u=await api<{email:string}>('/auth/'+auth,'POST',{email:authEmail,password});setEmail(u.email);setAuth(null);setPassword('');setTab(pendingTab);setNotice('')}catch(e){report(e)}finally{setBusy(false)}}
 async function toggle(p:Phrase,kind:'favorites'|'flashcards'){
  if(savingId)return
  setSavingId(p.id)
  const request=phraseRequest.current,owner=accountRef.current
  const value=!(kind==='favorites'?p.favorite:p.mastered)
  try{await api('/'+kind+'/'+p.id,'PUT',{value});if(request===phraseRequest.current&&owner===accountRef.current)setPhrases(old=>old.map(x=>x.id===p.id?{...x,[kind==='favorites'?'favorite':'mastered']:value}:x).filter(x=>!onlyFavorites||x.favorite));await refreshProgress()}catch(e){report(e)}finally{setSavingId('')}
 }
 async function startQuiz(){setBusy(true);setError('');try{const q=await api<Quiz>('/quizzes','POST',{topic});setQuiz(q);setAnswers(q.answers);setResult(null);setNotice('')}catch(e){report(e)}finally{setBusy(false)}}
 async function submitQuiz(){if(!quiz)return;setBusy(true);setError('');try{setResult(await api<Result>('/quizzes/'+quiz.id+'/submit','POST',{answers}));setNotice('Đã chấm bài và lưu kết quả vào tiến độ.');await refreshProgress()}catch(e){report(e)}finally{setBusy(false)}}
 async function saveDraft(){if(!quiz)return;setBusy(true);setError('');try{await api('/quizzes/'+quiz.id+'/draft','PUT',{answers});setQuiz(current=>current?.id===quiz.id?{...current,answers:[...answers]}:current);setNotice('Đã lưu bài đang làm. Bạn có thể quay lại từ thiết bị khác.')}catch(e){report(e)}finally{setBusy(false)}}
 async function openHistory(id:string){
  const request=++historyRequest.current,owner=accountRef.current
  setHistoryLoading(id);setHistoryReview(null);setError('')
  try{
   const detail=await api<{result:Result|null;submitted_at:string|null}>('/quizzes/'+id)
   if(historyRequest.current===request&&accountRef.current===owner){
    if(detail.result&&detail.submitted_at)setHistoryReview({id,result:detail.result,submitted_at:detail.submitted_at})
    else setError('Bài này chưa được nộp. Mở Luyện tập để tiếp tục.')
   }
  }catch(e){if(historyRequest.current===request&&accountRef.current===owner)report(e)}
  finally{if(historyRequest.current===request)setHistoryLoading('')}
 }
 useEffect(()=>{setIndex(current=>Math.min(current,Math.max(0,phrases.length-1)))},[phrases.length])
 useEffect(()=>{
  if(tab!=='flashcards'||auth||loadingPhrases||!phrases.length)return
  const onKey=(event:KeyboardEvent)=>{
   if(event.altKey||event.ctrlKey||event.metaKey||event.repeat)return
   const target=event.target
   if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select,button,a,[role="dialog"]')))return
   if(event.key===' '){event.preventDefault();setFlipped(value=>!value)}
   else if(event.key==='ArrowLeft'){event.preventDefault();setIndex(value=>Math.max(0,value-1));setFlipped(false)}
   else if(event.key==='ArrowRight'){event.preventDefault();setIndex(value=>Math.min(phrases.length-1,value+1));setFlipped(false)}
  }
  window.addEventListener('keydown',onKey)
  return()=>window.removeEventListener('keydown',onKey)
 },[tab,auth,loadingPhrases,phrases.length])
 const card=phrases[Math.min(index,Math.max(0,phrases.length-1))]
 return <div className={'shell '+(!email?'guest-shell':'')}>
  <aside className="sidebar"><a className="brand" href="/" onClick={e=>{e.preventDefault();navigate('home')}} aria-label="Trang chủ"><img src="/api/media/logo.png" alt="Logo FreeLingo" width="44" height="44"/><span>mỗi ngày<span className="brand-sub">TIẾNG ANH CHO BẠN</span></span></a>
   <div className="nav-label">GÓC HỌC TẬP</div><nav>{(Object.keys(labels) as Tab[]).map(key=><button key={key} className={tab===key?'nav-item active':'nav-item'} onClick={()=>navigate(key)}><span className="nav-icon">{navSymbols[key]}</span>{labels[key]}{tab===key&&<span className="nav-dot"/>}</button>)}</nav>
   <div className="side-note"><span className="note-star">✳</span><strong>Một chút mỗi ngày,<br/>một bước tiến xa.</strong><p>Chỉ cần 5 phút để học thêm điều mới.</p></div>
   <div className="side-bottom"><span className="status-dot"/> Học chủ động · Nhớ dài lâu</div>
  </aside>
  <main><header>{!email&&<button className="text-button" onClick={()=>navigate('home')}>mỗi ngày · Trang chủ</button>}<span className="breadcrumb">Góc học tập <span>/</span> <strong>{labels[tab]}</strong></span><div className="account">{email?<><span className="email">{email}</span><button className="small-button" onClick={async()=>{if(!canLeaveQuiz())return;try{await api('/auth/logout','POST',{});setEmail(null);setModuleDirty(false);setProgress(null);setPhrases([]);setQuiz(null);setResult(null);setTab('home')}catch(e){report(e)}}}>Đăng xuất</button></>:<button className="small-button" onClick={()=>{setPendingTab(tab);setAuth('login');setError('')}}>Đăng nhập <span>↗</span></button>}</div></header>
  <div className="content">
  {email&&<Motivation key={email} onLearn={()=>navigate('lessons')}/>}
  {notice&&<div className="notice" role="status">{notice}</div>}
  {error&&<div className="error" role="alert">{error}<button aria-label="Đóng thông báo" onClick={()=>setError('')}>×</button></div>}
  {!ready&&tab!=='home'?<div className="loading-panel" role="status">Đang kiểm tra phiên đăng nhập…</div>:tab==='home'&&!email?<section className="entry-intro"><div className="eyebrow">MỖI NGÀY · TIẾNG ANH CHO BẠN</div><h1>Học tiếng Anh,<br/>từng bước mỗi ngày.</h1><p>Luyện giao tiếp, IELTS và tiếng Anh chuyên ngành qua Nghe, Nói, Đọc, Viết. Tự tạo flashcard, chơi để nhớ từ và học cùng gia sư AI.</p><div className="button-row"><button className="primary" onClick={()=>{setPendingTab('home');setAuth('login');setError('')}}>Đăng nhập →</button><button className="small-button" onClick={()=>{setPendingTab('home');setAuth('register');setError('')}}>Đăng ký tài khoản</button></div><div className="social-login">{['google','facebook'].map(provider=><button key={provider} className="small-button" disabled={!providers[provider]} onClick={()=>{window.location.href='/api/auth/oauth/'+provider+'/start'}}>Tiếp tục với {provider==='google'?'Google':'Facebook'}</button>)}</div>{!providers.google&&!providers.facebook&&<p className="muted">Đăng nhập mạng xã hội sẽ khả dụng khi quản trị viên cấu hình kết nối.</p>}<button className="text-button" onClick={()=>navigate('why')}>20 lý do để bắt đầu học tiếng Anh ↗</button></section>:tab==='home'?<>
   <div className="welcome"><div><div className="eyebrow">HỌC ĐIỀU NHỎ. DÙNG MỖI NGÀY.</div><h1>Tiếng Anh gần gũi hơn,<br/>từng ngày một.</h1><p>Bắt đầu từ những câu nói thật đời thường.<br className="desktop"/> Học theo cách của bạn, tiến bộ theo nhịp của bạn.</p><div className="hero-actions"><button className="primary" onClick={()=>navigate('lessons')}>Bắt đầu học <span>→</span></button><button className="text-button" onClick={()=>navigate('quiz')}>Thử một bài quiz ↗</button></div><div className="hero-meta"><span>✓ Anh – Việt rõ nghĩa</span><span>✓ Lưu tiến độ của bạn</span></div></div>
   <div className="hero-art" aria-label="Thẻ câu giao tiếp minh họa"><div className="art-orbit"/><div className="art-caption">A LITTLE EVERY DAY</div><div className="floating-note">✦ Bạn làm được mà!</div><div className="sample-card"><div className="card-top"><span>CÂU HÔM NAY</span><span>EN / VI</span></div><div className="sample-quote">“</div><h2>Nice to<br/>meet you.</h2><div className="sample-rule"/><p>Rất vui được gặp bạn.</p><div className="sample-foot"><span>01 — Chào hỏi</span><span>↗</span></div></div><div className="art-bottom">Từ một câu nói đến một cuộc trò chuyện.</div></div></div>
   <section className="stats" aria-label="Thống kê"><div><span className="stat-icon">▤</span><div><strong>{topics.reduce((n,t)=>n+t.count,0)}</strong><span>Câu giao tiếp</span></div></div><div><span className="stat-icon">✓</span><div><strong>{progress?.mastered??0}</strong><span>Câu đã thuộc</span></div></div><div><span className="stat-icon">✎</span><div><strong>{progress?.quiz_count??0}</strong><span>Bài đã luyện</span></div></div></section>
   <section><div className="section-heading"><div><div className="eyebrow">CHỌN MỘT ĐIỂM BẮT ĐẦU</div><h2>Hôm nay bạn muốn học gì?</h2></div><span className="muted">{topics.length} chủ đề thực tế</span></div><div className="topic-grid">{topics.map(t=><button className={'topic-card topic-'+t.id} key={t.id} onClick={()=>{setTopic(t.id);setQuery('');setOnlyFavorites(false);setMistakesOnly(false);navigate('lessons')}}><div className="topic-top"><span className="topic-number">{symbols[t.id]||'+'}</span><span className="topic-arrow">↗</span></div><h3>{t.name}</h3><p>{t.description}</p><div className="topic-count">{t.count} câu giao tiếp <span>→</span></div></button>)}</div>{!topics.length&&<p className="empty">Chủ đề sẽ xuất hiện sau khi backend sẵn sàng và đã seed dữ liệu.</p>}</section>
   <div className="practice-banner"><div className="banner-symbol">✳</div><div><h3>Biến “biết rồi” thành “nhớ lâu”.</h3><p>Lật thẻ, ôn câu quen và thử sức với một bài trắc nghiệm ngắn.</p></div><button className="small-button" onClick={()=>navigate('flashcards')}>Ôn flashcard →</button></div>
  </>:<>
   <div className="page-title"><div className="eyebrow">MỖI NGÀY MỘT BƯỚC TIẾN</div><h1>{labels[tab]}</h1><p>{tab==='progress'?'Những gì bạn học đều được lưu trong tài khoản.':'Học những câu bạn có thể dùng ngay trong cuộc sống.'}</p></div>
   {tab==='why'&&<WhyEnglish/>}
   {tab==='pictures'&&<PictureVocabulary/>}
   {tab==='feedback'&&<AppFeedback onDirty={setModuleDirty}/>}
   {tab==='vocabulary'&&<Vocabulary onDirty={setModuleDirty}/>}
   {tab==='tutor'&&<Tutor onDirty={setModuleDirty}/>}
   {['ielts','specialist','placement'].includes(tab)&&<Courses key={tab+email} section={tab as 'ielts'|'specialist'|'placement'} onDirty={setModuleDirty}/>}
   {['phrases','flashcards','quiz'].includes(tab)&&<div className="filters"><label>Chủ đề<select value={topic} onChange={e=>{if(!canLeaveQuiz())return;setTopic(e.target.value);setQuiz(null);setResult(null)}}><option value="">Tất cả chủ đề</option>{topics.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{tab!=='quiz'&&<><label className="search">Tìm câu Anh hoặc Việt<input placeholder="Ví dụ: thank you, cảm ơn…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="check"><input type="checkbox" checked={onlyFavorites} onChange={e=>setOnlyFavorites(e.target.checked)}/> Yêu thích</label><label className="check"><input type="checkbox" checked={mistakesOnly} onChange={e=>setMistakesOnly(e.target.checked)}/> Câu từng sai</label></>}</div>}
   {tab==='lessons'&&<Lessons topic={topic} onSelect={setTopic} onProgress={refreshProgress} onPractice={()=>navigate('quiz')}/>}
   {mistakesOnly&&['phrases','flashcards'].includes(tab)&&<p className="muted">Ôn câu sai trong 100 bài gần nhất. Trả lời đúng trong một bài quiz mới để đưa câu ra khỏi bộ ôn.</p>}
   {loadingPhrases&&['phrases','flashcards'].includes(tab)&&<div className="loading-panel" role="status"><span className="spinner"/>Đang tải bài học…</div>}
   {tab==='phrases'&&<label className="check"><input type="checkbox" checked={hideMeanings} onChange={e=>setHideMeanings(e.target.checked)}/> Ẩn nghĩa để tự nhớ</label>}
   {tab==='phrases'&&<div className="phrase-list">{phrases.map(p=><article className="phrase-row" key={p.id}><div><h3 lang="en">{p.english}</h3>{hideMeanings?<details><summary>Xem nghĩa tiếng Việt</summary><p>{p.vietnamese}</p></details>:<p>{p.vietnamese}</p>}</div><button className={p.favorite?'favorite selected':'favorite'} aria-label={(p.favorite?'Bỏ yêu thích: ':'Yêu thích: ')+p.english} disabled={!!savingId} onClick={()=>toggle(p,'favorites')}>{p.favorite?'♥':'♡'}</button></article>)}{!loadingPhrases&&!phrases.length&&<p className="empty">Chưa có câu phù hợp. Thử đổi chủ đề hoặc từ khóa nhé.</p>}</div>}
   {tab==='flashcards'&&!loadingPhrases&&(card?<div className="flashcard-area"><p className="muted">Phím cách: lật thẻ · ← / →: chuyển thẻ (khi không chọn ô nhập hoặc nút).</p><span className="muted">Thẻ {index+1} / {phrases.length} {card.mastered?'· Đã thuộc ✓':''}</span><button className={'flashcard '+(flipped?'flipped':'')} onClick={()=>setFlipped(!flipped)}><span className="eyebrow">{flipped?'NGHĨA TIẾNG VIỆT':'CÂU TIẾNG ANH'}</span><strong lang={flipped?'vi':'en'}>{flipped?card.vietnamese:card.english}</strong><span>Chạm để lật thẻ ↻</span></button><div className="flash-actions"><button className="small-button" disabled={index===0} onClick={()=>{setIndex(index-1);setFlipped(false)}}>← Trước</button><button className="primary" disabled={!!savingId} onClick={()=>toggle(card,'flashcards')}>{card.mastered?'Cần ôn lại':'Đánh dấu đã thuộc ✓'}</button><button className="small-button" disabled={index===phrases.length-1} onClick={()=>{setIndex(index+1);setFlipped(false)}}>Tiếp →</button></div></div>:<p className="empty">Chưa có thẻ phù hợp.</p>)}
   {['phrases','flashcards'].includes(tab)&&!loadingPhrases&&(offset>0||hasMore)&&<div className="pagination"><button className="small-button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>← Trang trước</button><span>Trang {Math.floor(offset/50)+1}</span><button className="small-button" disabled={!hasMore} onClick={()=>setOffset(offset+50)}>Trang tiếp →</button></div>}
   {tab==='quiz'&&<div className="quiz-area">{quizLoading?<div className="loading-panel" role="status"><span className="spinner"/>Đang kiểm tra bài luyện đã lưu…</div>:!quiz?<div className="quiz-intro"><span className="note-star">✎</span><h2>5 câu hỏi. Một bước tiến mới.</h2><p>Chọn nghĩa tiếng Việt đúng. Kết quả được backend chấm và lưu vào tiến độ.</p><button className="primary" disabled={busy} onClick={startQuiz}>Bắt đầu bài trắc nghiệm →</button></div>:result?<div className="quiz-result"><QuizReview result={result}/><button className="primary" onClick={startQuiz} disabled={busy}>Luyện bài mới →</button></div>:<form onSubmit={e=>{e.preventDefault();void submitQuiz()}}>{quiz.questions.map((q,i)=><fieldset key={q.phrase_id} disabled={busy}><legend><span className="eyebrow">CÂU {i+1}</span></legend><p className="quiz-question" lang="en">{q.english}</p><div className="options">{q.options.map(o=><label className={answers[i]===o?'option chosen':'option'} key={o}><input required type="radio" name={'q'+i} value={o} checked={answers[i]===o} onChange={()=>setAnswers(old=>old.map((a,j)=>i===j?o:a))}/>{o}</label>)}</div></fieldset>)}<div className="quiz-controls"><button className="primary" disabled={busy||answers.some(a=>!a)}>Nộp bài và xem kết quả →</button><button type="button" className="small-button" disabled={busy} onClick={saveDraft}>Lưu bài để làm tiếp</button><span className="muted" role="status">{dirty?'Có đáp án chưa lưu':'Bản nháp đã được lưu'}</span></div></form>}</div>}
   {tab==='progress'&&!progress&&<p className="loading-panel" role="status">Đang tải tiến độ…</p>}
   {tab==='progress'&&progress&&<><section className="stats"><div><strong>{progress.mastered}/{progress.total}</strong><span>Câu đã thuộc</span></div><div><strong>{progress.favorites}</strong><span>Câu yêu thích</span></div><div><strong>{progress.quiz_count}</strong><span>Bài đã luyện</span></div></section><section className="topic-progress"><h2>Tiến độ theo chủ đề</h2>{progress.topics.map(t=><div className="progress-row" key={t.id}><div><strong>{t.name}</strong><span>{t.mastered}/{t.total} câu đã thuộc</span></div><progress value={t.mastered} max={Math.max(1,t.total)} aria-label={'Tiến độ '+t.name}/></div>)}</section><div className="section-heading"><h2>Lịch sử luyện tập</h2><button className="small-button" onClick={()=>{setMistakesOnly(true);setOnlyFavorites(false);setQuery('');setTopic('');navigate('flashcards')}}>Ôn câu từng sai →</button></div><p className="muted">Các câu sai trong 100 bài gần nhất sẽ được bỏ khỏi bộ ôn khi bạn trả lời đúng ở lần sau.</p><div className="history">{progress.history.length?progress.history.map(h=><button type="button" key={h.id} className="history-item" onClick={()=>openHistory(h.id)} disabled={historyLoading===h.id} aria-label={'Xem lại bài '+new Date(h.submitted_at).toLocaleString('vi-VN')}><span>{new Date(h.submitted_at).toLocaleString('vi-VN')}</span><strong>{h.score} / {h.total} câu đúng</strong><span>{historyLoading===h.id?'Đang tải…':'Xem lại →'}</span></button>):<p className="empty">Bắt đầu bài quiz đầu tiên để xem kết quả tại đây.</p>}</div>{historyReview&&<section className="quiz-result history-review" aria-label="Chi tiết bài đã luyện"><div className="history-review-heading"><span className="muted">{new Date(historyReview.submitted_at).toLocaleString('vi-VN')}</span><button className="small-button" onClick={()=>{historyRequest.current++;setHistoryReview(null)}}>Đóng chi tiết</button></div><QuizReview result={historyReview.result}/></section>}</>}
  </>}
  <footer><span>mỗi ngày · Tiếng Anh cho người Việt</span><span>Tài nguyên hình ảnh: FreeLingo · <a href="/credits.html">Ghi công & giấy phép</a></span></footer>
  </div></main>
  {auth&&<div className="modal-backdrop" onKeyDown={e=>{if(e.key==='Escape')setAuth(null)}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="close" aria-label="Đóng" onClick={()=>setAuth(null)}>×</button><div className="eyebrow">CHÀO MỪNG BẠN</div><h2 id="auth-title">{auth==='login'?'Tiếp tục hành trình học':'Bắt đầu một thói quen mới'}</h2><p>Lưu bài làm, bộ từ vựng và hành trình học của bạn.</p><div className="social-login">{['google','facebook'].map(provider=><button key={provider} className="small-button" disabled={busy||!providers[provider]} onClick={()=>{window.location.href='/api/auth/oauth/'+provider+'/start'}}>Tiếp tục với {provider==='google'?'Google':'Facebook'}</button>)}</div><p className="muted">Hoặc dùng email và mật khẩu</p>{error&&<p className="error" role="alert">{error}</p>}<form onSubmit={authenticate}><label>Email<input autoFocus type="email" autoComplete="email" required value={authEmail} onChange={e=>setAuthEmail(e.target.value)}/></label><label>Mật khẩu <small>(ít nhất 10 ký tự)</small><input type="password" minLength={10} maxLength={128} required autoComplete={auth==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Đang xử lý…':auth==='login'?'Đăng nhập →':'Tạo tài khoản →'}</button></form><button className="text-button auth-switch" onClick={()=>{setAuth(auth==='login'?'register':'login');setError('')}}>{auth==='login'?'Chưa có tài khoản? Đăng ký':'Đã có tài khoản? Đăng nhập'}</button></section></div>}
  {!ready&&<span className="sr-only">Đang kiểm tra phiên đăng nhập</span>}
 </div>
}
