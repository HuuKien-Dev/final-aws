export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api'+path,{signal:AbortSignal.timeout(path==='/ai'?95000:20000),method,credentials:'same-origin',cache:'no-store',headers:body!==undefined?{'Content-Type':'application/json'}:undefined,body:body!==undefined?JSON.stringify(body):undefined})
 const data=await response.json().catch(()=>({}))
 if(response.status===401&&!path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'))
 if(!response.ok) throw new Error(typeof data.detail==='string'?data.detail:'Vui lòng kiểm tra thông tin và thử lại.')
 return data
}
