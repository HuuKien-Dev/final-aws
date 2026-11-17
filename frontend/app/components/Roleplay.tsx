'use client'
import {useEffect,useRef,useState} from 'react'
import {api} from '../lib/api'
import {listenOnce,recognitionErrors,recognitionSupported,speak,speechSupported,stopSpeaking} from '../lib/speech'
import SpeakButton from './SpeakButton'
import type {AIStatus} from './AIPractice'

type Scenario={id:string;icon:string;title:string;level:string;summary:string;learner_role:string;partner:string;goals:string[];opening:string;opening_vi:string;starters:string[]}
type Fix={original:string;improved:string;reason:string}
type Message={role:'user'|'assistant';content:string}
type Line=Message&{vi?:string;fixes?:Fix[]}
type Turn={reply:string;reply_vi:string;fixes:Fix[];suggestions:string[];goals_done:number[];finished:boolean}
type Report={summary:string;score:number|null;estimated_level:string;goals_done:number[];strengths:string[];fixes:Fix[];useful_phrases:{english:string;vietnamese:string}[];next_steps:string[];limitations:string}
export type SavedRoleplay={id?:string;report:Report;scenario:{id:string;title:string;goals:string[]};messages:Message[]}
type History={id:string;result:SavedRoleplay;created_at:string}
type Deck={id:string;name:string}
const levels=['A1','A2','B1','B2']
/** Learner lines in one conversation; the server allows a few more. */
const TURN_LIMIT=15
const NEW_DECK='new'

function Goals({goals,done}:{goals:string[];done:number[]}) {
 if(!goals.length)return null
 return <ul className="chat-goals" aria-label="Mục tiêu hội thoại">{goals.map((goal,index)=><li key={index} className={done.includes(index)?'done':''}><span aria-hidden="true">{done.includes(index)?'✓':'○'}</span><span>{goal}<span className="sr-only">{done.includes(index)?' (đã đạt)':' (chưa đạt)'}</span></span></li>)}</ul>
}

function Fixes({fixes}:{fixes:Fix[]}) {
 return <>{fixes.map((fix,index)=><p key={index}><span className="fix-old" lang="en">{fix.original}</span> <span aria-hidden="true">→</span> <strong lang="en">{fix.improved}</strong>{fix.reason&&<span className="fix-why">{fix.reason}</span>}</p>)}</>
}

export function RoleplayReportView({saved}:{saved:SavedRoleplay}) {
 const report=saved.report
 return <section className="ai-result" aria-label="Nhận xét hội thoại">
  <div className="eyebrow">NHẬN XÉT THAM KHẢO · {saved.scenario.title}</div>
  <h2>{report.score===null?'Nhận xét cho bạn':`${report.score} / 100 điểm luyện tập`}</h2>
  {report.estimated_level&&<p>Trình độ ước lượng: <strong>{report.estimated_level}</strong></p>}
  <p>{report.summary}</p>
  <Goals goals={saved.scenario.goals} done={report.goals_done}/>
  {report.strengths.length>0&&<><h3>Điểm bạn làm tốt</h3><ul>{report.strengths.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
  {report.fixes.length>0&&<><h3>Câu nên sửa</h3><div className="chat-fix report-fix"><Fixes fixes={report.fixes}/></div></>}
  {report.useful_phrases.length>0&&<><h3>Cụm từ nên nhớ</h3><ul className="phrase-notes">{report.useful_phrases.map((phrase,index)=><li key={index}><span><strong lang="en">{phrase.english}</strong><SpeakButton text={phrase.english}/></span><span>{phrase.vietnamese}</span></li>)}</ul></>}
  {report.next_steps.length>0&&<><h3>Bước luyện tập tiếp theo</h3><ol>{report.next_steps.map((item,index)=><li key={index}>{item}</li>)}</ol></>}
  <details><summary>Xem lại cuộc hội thoại ({saved.messages.length} câu)</summary>{saved.messages.map((message,index)=><p key={index}><strong>{message.role==='user'?'Bạn':'AI'}:</strong> <span lang="en">{message.content}</span></p>)}</details>
  <p className="muted">{report.limitations}</p>
 </section>
}

export default function Roleplay({onDirty}:{onDirty:(value:boolean)=>void}) {
 const [scenarios,setScenarios]=useState<Scenario[]>([]),[status,setStatus]=useState<AIStatus|null>(null),[history,setHistory]=useState<History[]>([])
 const [scenario,setScenario]=useState<Scenario|null>(null),[custom,setCustom]=useState(''),[level,setLevel]=useState('A2')
 const [lines,setLines]=useState<Line[]>([]),[suggestions,setSuggestions]=useState<string[]>([]),[goals,setGoals]=useState<number[]>([]),[finished,setFinished]=useState(false)
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<SavedRoleplay|null>(null)
 const [showHints,setShowHints]=useState(false),[autoSpeak,setAutoSpeak]=useState(true),[hideText,setHideText]=useState(false),[revealed,setRevealed]=useState<number[]>([]),[translated,setTranslated]=useState<number[]>([])
 const [canSpeak,setCanSpeak]=useState(false),[canListen,setCanListen]=useState(false),[listening,setListening]=useState(false)
 const [decks,setDecks]=useState<Deck[]|null>(null),[deck,setDeck]=useState(NEW_DECK),[stored,setStored]=useState(''),[notice,setNotice]=useState('')
 const alive=useRef(true),cancel=useRef<(()=>void)|null>(null),log=useRef<HTMLDivElement>(null),callback=useRef(onDirty)
 callback.current=onDirty
 const turns=lines.filter(line=>line.role==='user').length
 const ended=finished||turns>=TURN_LIMIT

 useEffect(()=>{
  alive.current=true
  setCanSpeak(speechSupported());setCanListen(recognitionSupported())
  try{setAutoSpeak(window.localStorage.getItem('roleplay-voice')!=='off')}catch{}
  api<AIStatus>('/ai/status').then(value=>{if(alive.current)setStatus(value)}).catch(e=>{if(alive.current)setError(e.message)})
  api<Scenario[]>('/ai/scenarios').then(value=>{if(alive.current)setScenarios(value)}).catch(e=>{if(alive.current)setError(e.message)})
  api<History[]>('/ai/history?action=roleplay').then(value=>{if(alive.current)setHistory(value)}).catch(()=>{})
  return()=>{alive.current=false;cancel.current?.();stopSpeaking();callback.current(false)}
 },[])
 // Keep the newest line in view inside the conversation box only.
 useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight},[lines.length,busy])
 useEffect(()=>{
  if(!saved||decks)return
  api<Deck[]>('/decks').then(value=>{if(alive.current)setDecks(value)}).catch(()=>{if(alive.current)setDecks([])})
 },[saved,decks])

 function stopListening(){cancel.current?.();cancel.current=null;setListening(false)}
 function voice(value:boolean){setAutoSpeak(value);if(!value)stopSpeaking();try{window.localStorage.setItem('roleplay-voice',value?'on':'off')}catch{}}
 function reset(){stopListening();stopSpeaking();setScenario(null);setSaved(null);setLines([]);setSuggestions([]);setGoals([]);setFinished(false);setText('');setError('');setNotice('');setShowHints(false);setRevealed([]);setTranslated([]);setStored('');onDirty(false)}
 function begin(next:Scenario){
  reset();setScenario(next);setSuggestions(next.starters)
  if(next.opening){setLines([{role:'assistant',content:next.opening,vi:next.opening_vi}]);if(autoSpeak)speak(next.opening)}
 }
 function leave(){if(busy||turns>0&&!window.confirm('Cuộc hội thoại chưa được nhận xét sẽ bị bỏ. Bạn vẫn muốn đổi tình huống?'))return;reset()}
 const request=(next:Scenario,messages:Line[])=>({scenario_id:next.id,custom:next.id==='custom'?next.title:'',level:next.level,messages:messages.map(({role,content})=>({role,content}))})

 async function send(){
  const said=text.trim()
  if(!said||busy||!scenario||ended)return
  stopListening();setBusy(true);setError('')
  const before=lines
  setLines([...before,{role:'user',content:said}]);setText('');setShowHints(false);onDirty(true)
  try{
   const turn=await api<Turn>('/ai/roleplay','POST',{...request(scenario,before),text:said})
   if(!alive.current)return
   setLines([...before,{role:'user',content:said,fixes:turn.fixes},{role:'assistant',content:turn.reply,vi:turn.reply_vi}])
   setSuggestions(turn.suggestions);setFinished(turn.finished)
   setGoals(old=>[...new Set([...old,...turn.goals_done])].sort((a,b)=>a-b))
   setStatus(old=>old?{...old,used:old.used+1}:old)
   if(autoSpeak)speak(turn.reply)
  }catch(e){
   if(!alive.current)return
   // The unsent line returns to the box so the learner can retry.
   setLines(before);setText(said);setError(e instanceof Error?e.message:'Chưa nhận được phản hồi AI.')
  }finally{if(alive.current)setBusy(false)}
 }
 async function finish(){
  if(busy||!scenario||turns<2)return
  stopListening();stopSpeaking();setBusy(true);setError('')
  try{
   const value=await api<SavedRoleplay>('/ai/roleplay/report','POST',request(scenario,lines))
   if(!alive.current)return
   setSaved(value);onDirty(false)
   setStatus(old=>old?{...old,used:old.used+1}:old)
   if(value.id)setHistory(old=>[{id:value.id!,result:value,created_at:new Date().toISOString()},...old].slice(0,30))
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa nhận được nhận xét.')}
  finally{if(alive.current)setBusy(false)}
 }
 function listen(){
  if(listening){stopListening();return}
  stopSpeaking();setError('');setListening(true)
  try{
   cancel.current=listenOnce(heard=>setText(old=>(old.trim()?old.trimEnd()+' ':'')+heard),code=>{if(code!=='aborted')setError(recognitionErrors[code]??'Chưa nhận diện được. Hãy thử lại.')},()=>{cancel.current=null;setListening(false)})
  }catch{setListening(false);setError('Trình duyệt chưa bắt đầu được nhận diện giọng nói.')}
 }
 async function keepPhrases(){
  if(!saved||busy)return
  setBusy(true);setError('')
  try{
   let target=decks?.find(item=>item.id===deck)
   if(!target){
    target=await api<Deck>('/decks','POST',{name:('Hội thoại: '+saved.scenario.title).slice(0,100)})
    if(!alive.current)return
    setDecks(old=>[...(old??[]),target!]);setDeck(target.id)
   }
   await api('/decks/'+target.id+'/cards/bulk','POST',{cards:saved.report.useful_phrases.map(phrase=>({english:phrase.english,vietnamese:phrase.vietnamese,example:'',mastered:false}))})
   if(!alive.current)return
   setStored(target.id);setNotice(`Đã lưu ${saved.report.useful_phrases.length} cụm từ vào bộ “${target.name}”. Mở Flashcard của tôi để ôn.`)
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa lưu được cụm từ.')}
  finally{if(alive.current)setBusy(false)}
 }
 const toggle=(list:number[],index:number)=>list.includes(index)?list.filter(item=>item!==index):[...list,index]
 const ready=!!status?.configured

 return <section className="roleplay ai-practice">
  <p className="muted">{status?`AI: ${status.provider} · ${status.used}/${status.daily_limit} lượt hôm nay. Mỗi câu bạn gửi và bản nhận xét cuối buổi tính 1 lượt.`:'Đang kiểm tra AI…'}</p>
  {status&&!ready&&<p className="notice">AI chưa được cấu hình. Quản trị viên cần cấu hình API ở backend để bật nhập vai hội thoại.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {notice&&<p className="notice" role="status">{notice}</p>}

  {!scenario&&!saved&&<>
   <p>Chọn một tình huống, trò chuyện bằng tiếng Anh với AI và nhận góp ý cho từng câu. Bạn có thể gõ hoặc nói.</p>
   <div className="scenario-grid">{scenarios.map(item=><button className="scenario-card" key={item.id} disabled={!ready} onClick={()=>begin(item)}>
    <span className="scenario-icon" aria-hidden="true">{item.icon}</span>
    <span className="eyebrow">{item.level} · {item.learner_role}</span>
    <strong>{item.title}</strong>
    <span>{item.summary}</span>
   </button>)}</div>
   <form className="card-editor scenario-custom" onSubmit={event=>{event.preventDefault();if(custom.trim().length>=5)begin({id:'custom',icon:'✎',title:custom.trim(),level,summary:'',learner_role:'',partner:'Người đối thoại',goals:[],opening:'',opening_vi:'',starters:[]})}}>
    <h3>Hoặc tự chọn tình huống</h3>
    <div className="editor-grid">
     <label>Mô tả tình huống<input maxLength={200} value={custom} onChange={event=>setCustom(event.target.value)} placeholder="Ví dụ: gọi điện đặt bàn nhà hàng cho 4 người tối thứ Bảy"/></label>
     <label>Trình độ<select value={level} onChange={event=>setLevel(event.target.value)}>{levels.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <button className="primary" disabled={!ready||custom.trim().length<5}>Bắt đầu, tôi mở lời trước →</button>
   </form>
   {history.length>0&&<details className="ai-history"><summary>Hội thoại đã lưu ({history.length} gần nhất)</summary>{history.map(item=><button key={item.id} className="history-item" onClick={()=>{setSaved(item.result);setStored('');setNotice('')}}><span>{new Date(item.created_at).toLocaleString('vi-VN')}</span><strong>{item.result.scenario.title}</strong><span>{item.result.report.score===null?'Xem nhận xét →':item.result.report.score+' điểm →'}</span></button>)}</details>}
  </>}

  {scenario&&!saved&&<div className="chat-panel">
   <div className="section-heading">
    <div><div className="eyebrow">NHẬP VAI · {scenario.level}</div><h2>{scenario.icon} {scenario.title}</h2><p>{scenario.id==='custom'?'Tình huống do bạn tự chọn. AI sẽ đóng vai người đối thoại phù hợp.':<>Bạn là <strong>{scenario.learner_role}</strong>, AI đóng vai <strong>{scenario.partner}</strong>.</>}</p></div>
    <button className="small-button" disabled={busy} onClick={leave}>← Đổi tình huống</button>
   </div>
   <Goals goals={scenario.goals} done={goals}/>
   {canSpeak&&<div className="chat-options" role="group" aria-label="Tùy chọn nghe">
    <label className="check"><input type="checkbox" checked={autoSpeak} onChange={event=>voice(event.target.checked)}/> Tự đọc câu trả lời của AI</label>
    <label className="check"><input type="checkbox" checked={hideText} onChange={event=>{setHideText(event.target.checked);setRevealed([])}}/> Luyện nghe: ẩn chữ câu của AI</label>
   </div>}
   <div className="chat-log" ref={log} role="log" aria-label="Cuộc hội thoại" tabIndex={0}>
    {!lines.length&&<p className="muted">Hãy mở lời bằng một câu tiếng Anh phù hợp với tình huống của bạn.</p>}
    {lines.map((line,index)=>line.role==='assistant'?<div className="chat-row ai" key={index}>
     <div className="chat-bubble">
      <span className="chat-name">{scenario.partner}</span>
      {hideText&&canSpeak&&!revealed.includes(index)?<button type="button" className="text-button" onClick={()=>setRevealed(old=>[...old,index])}>Đang ẩn chữ. Nghe 🔊 rồi bấm để hiện câu.</button>:<p lang="en">{line.content}</p>}
      {translated.includes(index)&&line.vi&&<p className="chat-vi">{line.vi}</p>}
      <div className="chat-tools"><SpeakButton text={line.content}/><SpeakButton text={line.content} slow/>{line.vi&&<button type="button" className="text-button" aria-expanded={translated.includes(index)} onClick={()=>setTranslated(old=>toggle(old,index))}>{translated.includes(index)?'Ẩn nghĩa':'Xem nghĩa'}</button>}</div>
     </div>
    </div>:<div className="chat-row me" key={index}>
     <div className="chat-bubble"><span className="chat-name">Bạn</span><p lang="en">{line.content}</p></div>
     {line.fixes&&(line.fixes.length?<div className="chat-fix"><span className="chat-name">Gợi ý sửa</span><Fixes fixes={line.fixes}/></div>:<p className="chat-ok">✓ Không có lỗi đáng kể</p>)}
    </div>)}
    {busy&&<p className="chat-wait" role="status"><span className="spinner"/>AI đang xử lý…</p>}
   </div>
   {finished&&<p className="notice" role="status">Tình huống đã đi đến hồi kết. Bấm “Kết thúc & nhận nhận xét” để xem đánh giá cả buổi.</p>}
   {!finished&&turns>=TURN_LIMIT&&<p className="notice" role="status">Bạn đã trò chuyện {TURN_LIMIT} lượt. Hãy kết thúc để nhận nhận xét cho cả buổi.</p>}
   {showHints&&suggestions.length>0&&<div className="chat-suggestions" role="group" aria-label="Gợi ý trả lời">{suggestions.map(item=><button type="button" key={item} className="filter-pill" lang="en" onClick={()=>{setText(item);setShowHints(false)}}>{item}</button>)}</div>}
   <form className="chat-compose" onSubmit={event=>{event.preventDefault();void send()}}>
    <label htmlFor="roleplay-input">Câu trả lời tiếng Anh của bạn</label>
    <textarea id="roleplay-input" rows={2} maxLength={600} lang="en" value={text} disabled={busy||ended} placeholder={ended?'Cuộc hội thoại đã kết thúc.':'Nhập hoặc nói câu trả lời…'} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send()}}}/>
    <div className="button-row">
     {canListen&&<button type="button" className={listening?'danger-button':'small-button'} aria-pressed={listening} disabled={busy||ended} onClick={listen}>{listening?'■ Dừng nghe':'🎤 Nói'}</button>}
     <button type="button" className="small-button" aria-expanded={showHints} disabled={busy||ended||!suggestions.length} onClick={()=>setShowHints(value=>!value)}>💡 Gợi ý trả lời</button>
     <button className="primary" disabled={busy||ended||!text.trim()}>Gửi →</button>
     <button type="button" className="small-button" disabled={busy||turns<2} onClick={()=>void finish()}>Kết thúc & nhận nhận xét</button>
    </div>
    <p className="muted">Lượt {turns}/{TURN_LIMIT} · Enter để gửi, Shift+Enter để xuống dòng. Cần ít nhất 2 lượt để nhận nhận xét.{listening&&' Đang nghe… hãy nói câu tiếng Anh.'}</p>
   </form>
  </div>}

  {saved&&<>
   <RoleplayReportView saved={saved}/>
   {saved.report.useful_phrases.length>0&&<div className="picture-deck-controls">
    <label>Lưu cụm từ vào bộ thẻ<select value={deck} disabled={busy} onChange={event=>setDeck(event.target.value)}><option value={NEW_DECK}>＋ Bộ mới: Hội thoại</option>{(decks??[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <button className="small-button" disabled={busy||!decks||stored===deck} onClick={()=>void keepPhrases()}>{stored===deck?'Đã lưu ✓':`+ Lưu ${saved.report.useful_phrases.length} cụm từ`}</button>
   </div>}
   <div className="button-row">
    {scenario&&<button className="primary" disabled={busy} onClick={()=>begin(scenario)}>Luyện lại tình huống này ↻</button>}
    <button className="small-button" disabled={busy} onClick={reset}>Chọn tình huống khác</button>
   </div>
  </>}
 </section>
}
