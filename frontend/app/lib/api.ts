export async function api<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
 // AI generation (POST /ai, /ai/roleplay, /ai/exercises…) may take over a minute.
 const timeout=AbortSignal.timeout(method==='POST'&&path.startsWith('/ai')?95000:20000)
 const response=await fetch('/api'+path,{signal:signal?AbortSignal.any([signal,timeout]):timeout,method,credentials:'same-origin',cache:'no-store',headers:body!==undefined?{'Content-Type':'application/json'}:undefined,body:body!==undefined?JSON.stringify(body):undefined})
 const data=await response.json().catch(()=>({}))
 if(response.status===401&&!path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'))
 if(!response.ok) throw new Error(typeof data.detail==='string'?data.detail:'Vui lòng kiểm tra thông tin và thử lại.')
 if((method==='POST'&&/^\/ai\/exercises\/[^/]+\/submit$/.test(path))||(method==='PUT'&&/^\/courses\/lessons\/[^/]+\/work$/.test(path))) window.dispatchEvent(new Event('study-progress'))
 return data
}
