import {useEffect,useRef,type FormEvent,type KeyboardEvent} from 'react'
import AuthMascot from './AuthMascot'

type Props={
 mode:'login'|'register'
 email:string
 password:string
 error:string
 busy:boolean
 onClose:()=>void
 onSwitch:()=>void
 onEmailChange:(value:string)=>void
 onPasswordChange:(value:string)=>void
 onSubmit:(event:FormEvent<HTMLFormElement>)=>void
}

export default function AuthDialog(props:Props) {
 const dialog=useRef<HTMLElement>(null)
 useEffect(()=>{
  const previousFocus=document.activeElement
  const previousOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
  return()=>{
   document.body.style.overflow=previousOverflow
   if(previousFocus instanceof HTMLElement)previousFocus.focus()
  }
 },[])
 function handleKeyDown(event:KeyboardEvent) {
  if(event.key==='Escape'){props.onClose();return}
  if(event.key!=='Tab')return
  const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]')
  if(!controls?.length)return
  const first=controls[0],last=controls[controls.length-1]
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 }
 return <div className="modal-backdrop auth-backdrop" onKeyDown={handleKeyDown}>
  <section ref={dialog} className="modal auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description">
   <button type="button" className="close" aria-label="Đóng" onClick={props.onClose}>×</button>
   <div className="auth-visual">
    <span className="auth-visual-label">MỖI NGÀY MỘT CHÚT</span>
    <AuthMascot/>
    <h3>Một người bạn xanh.<br/>Một hành trình mới.</h3>
    <p>Học từng chút, tự tin thêm mỗi ngày.</p>
   </div>
   <div className="auth-form-panel">
    <div className="eyebrow">GÓC HỌC CỦA BẠN</div>
    <h2 id="auth-title">{props.mode==='login'?'Rất vui gặp lại bạn.':'Bắt đầu cùng nhau nhé.'}</h2>
    <p id="auth-description">{props.mode==='login'?'Đăng nhập để tiếp tục bài học và những điều bạn đang khám phá.':'Tạo tài khoản để lưu bộ từ vựng, bài học và tiến bộ của riêng bạn.'}</p>
    {props.error&&<p className="error" role="alert">{props.error}</p>}
    <form onSubmit={props.onSubmit}>
     <label htmlFor="auth-email">Email</label>
     <input id="auth-email" type="email" autoComplete="email" placeholder="ban@example.com" required value={props.email} onChange={event=>props.onEmailChange(event.target.value)}/>
     <label htmlFor="auth-password">Mật khẩu</label>
     <input id="auth-password" type="password" minLength={10} maxLength={128} required autoComplete={props.mode==='login'?'current-password':'new-password'} aria-describedby="auth-password-hint" value={props.password} onChange={event=>props.onPasswordChange(event.target.value)}/>
     <span id="auth-password-hint" className="auth-password-hint">Ít nhất 10 ký tự.</span>
     <button type="submit" className="primary auth-submit" disabled={props.busy}>{props.busy?'Đang xử lý…':props.mode==='login'?'Đăng nhập →':'Tạo tài khoản →'}</button>
    </form>
    <button type="button" className="text-button auth-switch" onClick={props.onSwitch}>{props.mode==='login'?'Chưa có tài khoản? Đăng ký':'Đã có tài khoản? Đăng nhập'}</button>
   </div>
  </section>
 </div>
}
