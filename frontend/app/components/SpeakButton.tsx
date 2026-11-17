'use client'
import {useEffect,useState} from 'react'
import {speak,speechSupported,stopSpeaking} from '../lib/speech'

/** Rendered only after mount, so server HTML and browsers without speech stay identical. */
export default function SpeakButton({text,slow=false,className=''}:{text:string;slow?:boolean;className?:string}) {
 const [ready,setReady]=useState(false)
 useEffect(()=>{setReady(speechSupported());return()=>stopSpeaking()},[])
 if(!ready)return null
 return <button type="button" className={'speak-button '+className} aria-label={(slow?'Nghe chậm: ':'Nghe phát âm: ')+text} title={slow?'Nghe chậm':'Nghe phát âm'} onClick={event=>{event.stopPropagation();speak(text,slow?0.65:0.9)}}>{slow?'🐢':'🔊'}</button>
}
