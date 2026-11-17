'use client'
import {useEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react'
import {api} from '../lib/api'

export default function PasswordDialog({onClose,onDone}:{onClose:()=>void;onDone:(message:string)=>void}) {
 const dialog=useRef<HTMLElement>(null)
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  const previousFocus=document.activeElement
  dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
  return()=>{if(previousFocus instanceof HTMLElement)previousFocus.focus()}
 },[])
 function handleKeyDown(event:KeyboardEvent) {
  if(event.key==='Escape'&&!busy){onClose();return}
  if(event.key!=='Tab')return
  const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')
  if(!controls?.length)return
  const first=controls[0],last=controls[controls.length-1]
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 }
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();setError('')
  if(next!==confirm){setError('Mật khẩu nhập lại chưa khớp.');return}
  setBusy(true)
  try{await api('/auth/password','PUT',{current_password:current,new_password:next});onDone('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.')}
  catch(e){setError(e instanceof Error?e.message:'Chưa đổi được mật khẩu.')}
  finally{setBusy(false)}
 }
 return <div className="modal-backdrop" onKeyDown={handleKeyDown}>
  <section ref={dialog} className="modal password-dialog" role="dialog" aria-modal="true" aria-labelledby="password-title">
   <button type="button" className="close" aria-label="Đóng" disabled={busy} onClick={onClose}>×</button>
   <div className="eyebrow">TÀI KHOẢN</div>
   <h2 id="password-title">Đổi mật khẩu</h2>
   <p>Sau khi đổi, các thiết bị khác sẽ được đăng xuất.</p>
   {error&&<p className="error" role="alert">{error}</p>}
   <form onSubmit={submit}>
    <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></label>
    <label>Mật khẩu mới<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={next} onChange={e=>setNext(e.target.value)}/></label>
    <label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
    <button type="submit" className="primary" disabled={busy}>{busy?'Đang lưu…':'Lưu mật khẩu mới'}</button>
   </form>
  </section>
 </div>
}
