'use client'
import {useEffect,useRef,useState} from 'react'
import {api} from '../lib/api'
export type AIStatus={provider:string;configured:boolean;audio:boolean;used:number;daily_limit:number}
type Feedback={reply:string;summary:string;score:number|null;estimated_level:string;strengths:string[];improvements:{original:string;improved:string;reason:string}[];improved_version:string;next_steps:string[];criteria:{name:string;score:number;comment:string}[];roadmap:{week:number;focus:string;activities:string[]}[];limitations:string}
type AIResult={id?:string;feedback:Feedback;submission?:string;transcript:string;provider:string;model:string}
type History={id:string;action:string;lesson_id:string;result:AIResult;created_at:string}
type Mode='tutor'|'writing'|'speaking'|'roadmap'
export function ResultView({result}:{result:AIResult}){
 const f=result.feedback
 return <section className="ai-result" aria-label="Nhận xét của AI"><div className="eyebrow">NHẬN XÉT THAM KHẢO · {result.provider}</div><h2>{f.score===null?'Gợi ý cho bạn':`${f.score} / 100 điểm luyện tập`}</h2>{f.estimated_level&&<p>Trình độ ước lượng: <strong>{f.estimated_level}</strong></p>}<p>{f.summary}</p>{result.submission&&!result.transcript&&<details><summary>Bài gốc của bạn</summary><p className="preserve-lines" lang="en">{result.submission}</p></details>}{result.transcript&&<details open><summary>Bản chép lời của bạn</summary><p className="preserve-lines" lang="en">{result.transcript}</p></details>}{f.reply&&<div className="coach-reply"><strong>Gia sư AI</strong><p className="preserve-lines">{f.reply}</p></div>}{f.criteria.length>0&&<div className="criteria-grid">{f.criteria.map((c,i)=><article key={i}><strong>{c.name} · {c.score}/100</strong><p>{c.comment}</p></article>)}</div>}{f.strengths.length>0&&<><h3>Điểm bạn làm tốt</h3><ul>{f.strengths.map((v,i)=><li key={i}>{v}</li>)}</ul></>}{f.improvements.length>0&&<><h3>Sửa ngay trong bài của bạn</h3>{f.improvements.map((v,i)=><article className="correction" key={i}><p><strong>Câu của bạn:</strong> <span lang="en">{v.original}</span></p><p><strong>Gợi ý sửa:</strong> <span lang="en">{v.improved}</span></p><p>{v.reason}</p></article>)}</>}{f.improved_version&&<details open><summary>Toàn đoạn sau khi cải thiện</summary><p className="preserve-lines" lang="en">{f.improved_version}</p></details>}{f.next_steps.length>0&&<><h3>Bước luyện tập tiếp theo</h3><ol>{f.next_steps.map((v,i)=><li key={i}>{v}</li>)}</ol></>}{f.roadmap.map((w,i)=><article className="plan-week" key={i}><h3>Tuần {w.week}: {w.focus}</h3><ul>{w.activities.map((a,j)=><li key={j}>{a}</li>)}</ul></article>)}<p className="muted">{f.limitations||'Đánh giá AI mang tính tham khảo; không phải điểm thi hoặc chứng chỉ chính thức.'}</p></section>
}
export function Recorder({onAudio,onRecording}:{onAudio:(audio:{data:string;mime:string}|null)=>void;onRecording?:(active:boolean)=>void}){
 const [recording,setRecording]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState(''),[seconds,setSeconds]=useState(0)
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),mounted=useRef(true),urlRef=useRef('')
 const callbacks=useRef({onAudio,onRecording});callbacks.current={onAudio,onRecording}
 function stop(){if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());if(timer.current)clearInterval(timer.current);timer.current=null;if(mounted.current){setRecording(false);callbacks.current.onRecording?.(false)}}
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());if(timer.current)clearInterval(timer.current);if(urlRef.current)URL.revokeObjectURL(urlRef.current)}},[])
 async function accept(blob:Blob){
  if(!mounted.current)return
  setError('')
  if(!blob.size||blob.size>4*1024*1024){setError('Bản ghi cần có âm thanh và không quá 4 MB. Hãy ghi đoạn ngắn hơn.');return}
  if(urlRef.current)URL.revokeObjectURL(urlRef.current)
  const next=URL.createObjectURL(blob);urlRef.current=next;setUrl(next)
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)})
  if(mounted.current)callbacks.current.onAudio({data,mime:blob.type||'audio/webm'})
 }
 async function start(){
  setError('')
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Ghi âm cần trình duyệt hỗ trợ và HTTPS hoặc localhost. Bạn vẫn có thể tải tệp ghi âm hoặc nhập bản chép lời.')
   const next=await navigator.mediaDevices.getUserMedia({audio:true})
   if(!mounted.current){next.getTracks().forEach(t=>t.stop());return}
   stream.current=next
   const mime=['audio/webm','audio/mp4','audio/ogg'].find(m=>MediaRecorder.isTypeSupported(m))
   const instance=new MediaRecorder(next,mime?{mimeType:mime}:undefined),chunks:Blob[]=[]
   instance.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
   instance.onstop=()=>{if(mounted.current)void accept(new Blob(chunks,{type:instance.mimeType})).catch(()=>setError('Không đọc được bản ghi. Hãy thử lại.'))}
   instance.onerror=()=>{stop();if(mounted.current)setError('Ghi âm bị gián đoạn. Vui lòng thử lại.')}
   recorder.current=instance;instance.start();setSeconds(0);setRecording(true);callbacks.current.onAudio(null);callbacks.current.onRecording?.(true)
   let elapsed=0;timer.current=setInterval(()=>{elapsed++;setSeconds(elapsed);if(elapsed>=90)stop()},1000)
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());setError(e instanceof Error?e.message:'Không truy cập được micro.')}
 }
 return <div className="recorder"><div className="button-row"><button type="button" className={recording?'danger-button':'small-button'} onClick={()=>recording?stop():void start()}>{recording?`Dừng ghi · ${seconds}s`:'● Ghi âm bài nói'}</button><label className="file-label">Hoặc tải bản ghi<input type="file" accept="audio/webm,audio/mp4,audio/ogg,audio/wav,audio/mpeg" disabled={recording} onChange={e=>{const file=e.target.files?.[0];if(file)void accept(file).catch(()=>setError('Không đọc được tệp.'));e.target.value=''}}/></label></div><p className="muted">Tối đa 90 giây khi ghi trực tiếp, tệp tối đa 4 MB. Bản ghi chỉ được gửi tới API khi bạn bấm gửi.</p>{url&&<><audio controls src={url}/><a className="text-button" href={url} download="bai-noi">Tải bản ghi về máy</a><button type="button" className="text-button" onClick={()=>{URL.revokeObjectURL(urlRef.current);urlRef.current='';setUrl('');callbacks.current.onAudio(null)}}>Bỏ bản ghi</button></>}{error&&<p className="error" role="alert">{error}</p>}</div>
}
export default function AIPractice({mode='tutor',lessonId='',prompt='',text:externalText,onText,onDirty,beforeSend}:{mode?:Mode;lessonId?:string;prompt?:string;text?:string;onText?:(text:string)=>void;onDirty?:(dirty:boolean)=>void;beforeSend?:()=>Promise<void>}){
 const [localText,setLocalText]=useState(''),[status,setStatus]=useState<AIStatus|null>(null),[result,setResult]=useState<AIResult|null>(null),[history,setHistory]=useState<History[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[audio,setAudio]=useState<{data:string;mime:string}|null>(null),[recording,setRecording]=useState(false),[speechUrl,setSpeechUrl]=useState('')
 const [messages,setMessages]=useState<{role:'user'|'assistant';content:string}[]>([])
 const active=useRef(true),speechRef=useRef(''),beforeUnloadDirty=useRef(false),unsavedText=useRef(false)
 const dirtyCallback=useRef(onDirty);dirtyCallback.current=onDirty
 const text=externalText??localText
 useEffect(()=>{active.current=true;api<AIStatus>('/ai/status').then(v=>{if(active.current)setStatus(v)}).catch(e=>{if(active.current)setError(e.message)});api<History[]>('/ai/history').then(v=>{if(active.current)setHistory(v)}).catch(()=>{});return()=>{active.current=false;if(speechRef.current)URL.revokeObjectURL(speechRef.current);dirtyCallback.current?.(false)}},[])
 function edit(value:string){if(onText)onText(value);else setLocalText(value);unsavedText.current=true;beforeUnloadDirty.current=true;onDirty?.(true)}
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(beforeUnloadDirty.current||recording||busy){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[recording,busy])
 async function send(){
  if(busy||recording)return
  setBusy(true);setError('');onDirty?.(true)
  try{
   await beforeSend?.()
   if(!active.current)return
   onDirty?.(true)
   const value=await api<AIResult>('/ai','POST',{action:mode,lesson_id:lessonId,text,audio_base64:status?.audio?audio?.data||'':'',mime:audio?.mime||'audio/webm',messages:messages.slice(-10)})
   if(!active.current)return
   setResult(value);setAudio(null);unsavedText.current=false;beforeUnloadDirty.current=false;onDirty?.(false)
   if(value.transcript){if(onText)onText(value.transcript);else setLocalText(value.transcript)}
   setMessages(old=>[...old,{role:'user' as const,content:(value.transcript||text).slice(0,4000)},{role:'assistant' as const,content:value.feedback.reply.slice(0,4000)}].slice(-12))
   if(value.id)setHistory(old=>[{id:value.id!,action:mode,lesson_id:lessonId,result:value,created_at:new Date().toISOString()},...old].slice(0,30))
   setStatus(old=>old?{...old,used:old.used+1}:old)
  }catch(e){if(active.current)setError(e instanceof Error?e.message:'Chưa nhận được phản hồi AI.')}
  finally{if(active.current)setBusy(false)}
 }
 async function hear(){
  if(!result||busy)return
  setBusy(true);setError('')
  try{const value=await api<{audio_base64:string;mime:string}>('/ai','POST',{action:'speech',text:result.feedback.reply.slice(0,2000)});if(!active.current)return;const bytes=Uint8Array.from(atob(value.audio_base64),c=>c.charCodeAt(0));if(speechRef.current)URL.revokeObjectURL(speechRef.current);speechRef.current=URL.createObjectURL(new Blob([bytes],{type:value.mime}));setSpeechUrl(speechRef.current);setStatus(old=>old?{...old,used:old.used+1}:old)}catch(e){if(active.current)setError(e instanceof Error?e.message:'Không tải được giọng đọc.')}
  finally{if(active.current)setBusy(false)}
 }
 const labels={tutor:'Hỏi gia sư AI',writing:'Chấm và cải thiện bài viết',speaking:'Gửi bài nói / Tiếp tục hội thoại',roadmap:'Đánh giá và lập lộ trình'}
 const matching=history.filter(h=>h.action===mode&&h.lesson_id===lessonId)
 return <div className="ai-practice">{prompt&&<p className="task-prompt preserve-lines">{prompt}</p>}<p className="muted">{status?`AI: ${status.provider} · ${status.used}/${status.daily_limit} lượt hôm nay`:'Đang kiểm tra AI…'}</p>{status&&!status.configured&&<p className="notice">AI chưa được cấu hình. Bạn vẫn có thể xem bài và lưu bài làm; quản trị viên cần cấu hình API ở backend để bật gia sư.</p>}{mode==='speaking'&&!busy&&<Recorder onAudio={value=>{setAudio(value);beforeUnloadDirty.current=unsavedText.current||!!value;onDirty?.(unsavedText.current||!!value)}} onRecording={value=>{setRecording(value);onDirty?.(value||!!audio||unsavedText.current)}}/>}{mode==='speaking'&&!status?.audio&&<p className="muted">API hiện tại chưa bật nhận diện giọng nói. Bạn có thể tự nghe bản ghi, nhập bản chép lời bên dưới và nhờ AI sửa nội dung.</p>}<label>{mode==='roadmap'?'Mục tiêu, thời gian học mỗi ngày và bài viết đầu vào':mode==='speaking'?'Bản chép lời / câu trả lời tiếng Anh':mode==='writing'?'Bài viết của bạn':'Bạn muốn học gì hôm nay?'}<textarea rows={mode==='writing'?12:6} maxLength={16000} value={text} disabled={busy||recording} onChange={e=>edit(e.target.value)} placeholder={mode==='roadmap'?'Ví dụ: Tôi muốn giao tiếp công việc, học 30 phút/ngày. Viết thêm 100–150 từ tiếng Anh giới thiệu công việc và mục tiêu của bạn để AI có cơ sở đánh giá.':'Nhập nội dung ở đây…'}/></label><p className="muted">{text.trim()?text.trim().split(/\s+/).length:0} từ · Nội dung bạn gửi sẽ được xử lý bởi {status?.provider||'nhà cung cấp AI đã chọn'}. Nhận xét nói dựa trên bản chép lời, chưa chấm phát âm.</p>{audio&&<p className="notice">Đã chọn bản ghi. {status?.audio?'Bấm gửi để AI nhận diện và nhận xét.':'Hãy nhập bản chép lời; bản ghi sẽ không gửi tới API này.'}</p>}{error&&<p className="error" role="alert">{error}</p>}<button type="button" className="primary" disabled={busy||recording||!status?.configured||(!text.trim()&&!(audio&&status.audio))} onClick={()=>{if(audio&&!status?.audio)setAudio(null);void send()}}>{busy?'AI đang xử lý…':labels[mode]}</button>{result&&<><ResultView result={result}/>{status?.audio&&result.feedback.reply&&<><button className="small-button" disabled={busy} onClick={()=>void hear()}>Nghe phản hồi AI</button><p className="muted">Giọng đọc do AI tạo.</p>{speechUrl&&<audio controls autoPlay src={speechUrl}/>}</>}</>}{matching.length>0&&<details className="ai-history"><summary>Nhận xét đã lưu ({matching.length} gần nhất)</summary>{matching.map(h=><button key={h.id} className="history-item" disabled={busy} onClick={()=>{setResult(h.result);setSpeechUrl('')}}><span>{new Date(h.created_at).toLocaleString('vi-VN')}</span><span>{h.result.feedback.summary.slice(0,100)}</span></button>)}</details>}</div>
}
