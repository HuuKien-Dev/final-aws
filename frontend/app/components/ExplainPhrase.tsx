'use client'
import {useEffect,useRef,useState} from 'react'
import {api} from '../lib/api'
import SpeakButton from './SpeakButton'

export type Explanation={meaning:string;parts:{text:string;meaning:string;note:string}[];grammar:string;usage:string;formality:'formal'|'neutral'|'informal';pronunciation:string;alternatives:{english:string;vietnamese:string;note:string}[];mistakes:string[];dialogue:{speaker:'A'|'B';english:string;vietnamese:string}[]}
const formality={formal:'Trang trọng',neutral:'Trung tính',informal:'Thân mật'}

export function ExplanationView({value}:{value:Explanation}) {
 return <div className="explain-panel">
  <p className="explain-meaning">{value.meaning}</p>
  <p><span className="explain-tag">Sắc thái: {formality[value.formality]}</span>{value.usage}</p>
  {value.parts.length>0&&<><h4>Từng phần của câu</h4><dl className="explain-parts">{value.parts.map((part,index)=><div key={index}><dt lang="en">{part.text}</dt><dd>{part.meaning}{part.note&&<small>{part.note}</small>}</dd></div>)}</dl></>}
  {value.grammar&&<><h4>Cấu trúc</h4><p className="preserve-lines">{value.grammar}</p></>}
  {value.pronunciation&&<><h4>Mẹo phát âm</h4><p>{value.pronunciation}</p></>}
  {value.alternatives.length>0&&<><h4>Cách nói khác</h4><ul className="phrase-notes">{value.alternatives.map((item,index)=><li key={index}><span><strong lang="en">{item.english}</strong><SpeakButton text={item.english}/></span><span>{item.vietnamese}{item.note&&<small>{item.note}</small>}</span></li>)}</ul></>}
  {value.mistakes.length>0&&<><h4>Lỗi người Việt hay mắc</h4><ul>{value.mistakes.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
  {value.dialogue.length>0&&<><h4>Hội thoại mẫu</h4><div className="explain-dialogue">{value.dialogue.map((row,index)=><p key={index}><strong>{row.speaker}:</strong> <span lang="en">{row.english}</span><SpeakButton text={row.english}/><small>{row.vietnamese}</small></p>)}</div></>}
  <p className="muted explain-note">Giải thích do AI tạo để tham khảo và có thể chưa chính xác.</p>
 </div>
}

/** AI explanation of one course sentence; generated once on the server, then shared and free. */
export default function ExplainPhrase({phraseId}:{phraseId:string}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[value,setValue]=useState<Explanation|null>(null),[fresh,setFresh]=useState(false)
 const request=useRef(0)
 useEffect(()=>{request.current++;setOpen(false);setBusy(false);setError('');setValue(null);setFresh(false);return()=>{request.current++}},[phraseId])
 async function toggle(){
  if(value){setOpen(!open);return}
  const id=++request.current
  setBusy(true);setError('')
  try{
   const result=await api<{explanation:Explanation;cached:boolean}>('/ai/explain/'+encodeURIComponent(phraseId),'POST',{})
   if(request.current===id){setValue(result.explanation);setFresh(!result.cached);setOpen(true)}
  }catch(e){if(request.current===id)setError(e instanceof Error?e.message:'Chưa lấy được giải thích.')}
  finally{if(request.current===id)setBusy(false)}
 }
 return <div className="explain">
  <button type="button" className="small-button" aria-expanded={open} disabled={busy} onClick={()=>void toggle()}>{busy?'AI đang giải thích…':open?'Ẩn giải thích':'✦ Giải thích câu này'}</button>
  {error&&<p className="error" role="alert">{error}</p>}
  {open&&value&&<><ExplanationView value={value}/>{fresh&&<p className="muted explain-note" role="status">Đã dùng 1 lượt AI. Lần sau mở lại câu này sẽ không tốn lượt.</p>}</>}
 </div>
}
