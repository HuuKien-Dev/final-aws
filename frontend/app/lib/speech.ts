/** Browser text-to-speech; no network, no API key. */
export function speechSupported():boolean {
 return typeof window!=='undefined'&&'speechSynthesis' in window&&typeof SpeechSynthesisUtterance!=='undefined'
}

function englishVoice():SpeechSynthesisVoice|undefined {
 const voices=window.speechSynthesis.getVoices()
 return voices.find(v=>v.lang==='en-US'&&v.localService)??voices.find(v=>v.lang==='en-US')??voices.find(v=>v.lang.startsWith('en'))
}

export function speak(text:string,rate=0.9):boolean {
 if(!speechSupported()||!text.trim())return false
 const synth=window.speechSynthesis
 synth.cancel()
 const utterance=new SpeechSynthesisUtterance(text)
 utterance.lang='en-US'
 utterance.rate=rate
 const voice=englishVoice()
 if(voice)utterance.voice=voice
 synth.speak(utterance)
 return true
}

export function stopSpeaking() {
 if(speechSupported())window.speechSynthesis.cancel()
}

export function speechWords(text:string):string[] {
 return text.toLowerCase().replace(/[’`]/g,"'").replace(/[^a-z0-9'\s]/g,' ').split(/\s+/).filter(Boolean)
}

export type SpeechMatch={words:{text:string;matched:boolean}[];score:number;heard:string}

/** Which words of the target sentence were recognised, in order (longest common subsequence). */
export function compareSpeech(target:string,heard:string):SpeechMatch {
 const display=target.split(/\s+/).filter(Boolean)
 const want=display.map(word=>speechWords(word).join(''))
 const got=speechWords(heard).map(word=>word.replace(/'/g,''))
 const keys=want.map(word=>word.replace(/'/g,''))
 const rows=keys.length,columns=got.length
 const table=Array.from({length:rows+1},()=>new Array<number>(columns+1).fill(0))
 for(let i=rows-1;i>=0;i--)for(let j=columns-1;j>=0;j--)table[i][j]=keys[i]&&keys[i]===got[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1])
 const flags=new Array<boolean>(rows).fill(false)
 for(let i=0,j=0;i<rows&&j<columns;){
  if(keys[i]&&keys[i]===got[j]){flags[i]=true;i++;j++}
  else if(table[i+1][j]>=table[i][j+1])i++
  else j++
 }
 const countable=keys.filter(Boolean).length
 const hits=flags.filter(Boolean).length
 return {words:display.map((text,index)=>({text,matched:flags[index]||!keys[index]})),score:countable?Math.round(100*hits/countable):0,heard:heard.trim()}
}

type Recognition={lang:string;interimResults:boolean;maxAlternatives:number;start():void;abort():void;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null}

export const recognitionErrors:Record<string,string>={
 'not-allowed':'Trình duyệt chưa được phép dùng micro. Hãy cấp quyền rồi thử lại.',
 'service-not-allowed':'Trình duyệt chưa được phép dùng micro. Hãy cấp quyền rồi thử lại.',
 'no-speech':'Chưa nghe thấy giọng nói. Hãy nói rõ và gần micro hơn.',
 'audio-capture':'Không tìm thấy micro trên thiết bị.',
 'network':'Dịch vụ nhận diện giọng nói của trình duyệt chưa sẵn sàng.',
}

export function recognitionSupported():boolean {
 if(typeof window==='undefined')return false
 const scope=window as unknown as Record<string,unknown>
 return typeof (scope.SpeechRecognition??scope.webkitSpeechRecognition)==='function'
}

/** Starts one English recognition; returns a function that cancels it. */
export function listenOnce(onText:(text:string)=>void,onError:(code:string)=>void,onEnd:()=>void):()=>void {
 const scope=window as unknown as Record<string,new()=>Recognition>
 const recognition=new (scope.SpeechRecognition??scope.webkitSpeechRecognition)()
 recognition.lang='en-US';recognition.interimResults=false;recognition.maxAlternatives=1
 recognition.onresult=event=>onText(Array.from(event.results).map(result=>result[0].transcript).join(' '))
 recognition.onerror=event=>onError(event.error)
 recognition.onend=onEnd
 recognition.start()
 return()=>{recognition.onresult=null;recognition.onerror=null;recognition.onend=null;recognition.abort()}
}
