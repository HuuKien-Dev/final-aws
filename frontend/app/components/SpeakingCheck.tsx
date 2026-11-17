'use client'
import {useEffect,useRef,useState} from 'react'
import {compareSpeech,listenOnce,recognitionErrors as errors,recognitionSupported,stopSpeaking,type SpeechMatch} from '../lib/speech'

/** Read the sentence aloud; the browser's recogniser shows which words it heard. */
export default function SpeakingCheck({text}:{text:string}) {
 const [ready,setReady]=useState(false),[listening,setListening]=useState(false),[result,setResult]=useState<SpeechMatch|null>(null),[error,setError]=useState('')
 const cancel=useRef<(()=>void)|null>(null)
 useEffect(()=>{setReady(recognitionSupported());return()=>cancel.current?.()},[])
 useEffect(()=>{cancel.current?.();cancel.current=null;setListening(false);setResult(null);setError('')},[text])
 if(!ready)return null
 function start() {
  if(listening){cancel.current?.();cancel.current=null;setListening(false);return}
  stopSpeaking();setError('');setResult(null);setListening(true)
  try{
   cancel.current=listenOnce(heard=>setResult(compareSpeech(text,heard)),code=>{if(code!=='aborted')setError(errors[code]??'Chưa nhận diện được. Hãy thử lại.')},()=>{cancel.current=null;setListening(false)})
  }catch{setListening(false);setError('Trình duyệt chưa bắt đầu được nhận diện giọng nói.')}
 }
 return <div className="speaking-check">
  <button type="button" className={listening?'danger-button':'small-button'} aria-pressed={listening} onClick={start}>{listening?'■ Dừng nghe':'🎤 Luyện nói câu này'}</button>
  {listening&&<span className="muted" role="status">Đang nghe… hãy đọc to câu tiếng Anh.</span>}
  {error&&<p className="error" role="alert">{error}</p>}
  {result&&<div className="speaking-result" role="status">
   <p className="speaking-words" lang="en">{result.words.map((word,index)=><span key={index} className={word.matched?'heard':'missed'}>{word.text} </span>)}</p>
   <p><strong>{result.score}% số từ được nhận ra.</strong> {result.score===100?'Rất rõ ràng!':result.score>=70?'Khá tốt, thử lại những từ màu cam nhé.':'Nghe mẫu 🔊 rồi nói chậm, rõ từng từ.'}</p>
   <p className="muted">Trình duyệt nghe được: “<span lang="en">{result.heard||'…'}</span>”</p>
  </div>}
  <p className="muted speaking-note">Giọng nói do trình duyệt xử lý (một số trình duyệt gửi âm thanh tới dịch vụ nhận diện của hãng). Kết quả là so khớp từ, không chấm ngữ điệu hay trọng âm.</p>
 </div>
}
