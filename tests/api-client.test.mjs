import {test} from 'node:test'
import assert from 'node:assert/strict'
import {api} from '../frontend/app/lib/api.ts'

test('cancelled phrase searches abort fetch while retaining timeout and request defaults',async context=>{
  let signal
  context.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'/api/phrases?q=hello')
    assert.equal(options.cache,'no-store')
    assert.equal(options.credentials,'same-origin')
    signal=options.signal
    return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
  })
  const controller=new AbortController()
  const request=api('/phrases?q=hello','GET',undefined,controller.signal)
  controller.abort()
  await assert.rejects(request,{name:'AbortError'})
  assert.ok(signal.aborted)
})

test('completed AI exercises and saved course work refresh the header streak',async context=>{
 const events=[]
 const original=Object.getOwnPropertyDescriptor(globalThis,'window')
 Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:event=>events.push(event.type)}})
 context.after(()=>{if(original)Object.defineProperty(globalThis,'window',original);else delete globalThis.window})
 context.mock.method(globalThis,'fetch',async()=>({ok:true,status:200,json:async()=>({ok:true})}))
 await api('/ai/exercises/example/submit','POST',{answers:['tea']})
 await api('/courses/lessons/ielts-writing/work','PUT',{completed:true})
 await api('/ai/status')
 assert.deepEqual(events,['study-progress','study-progress'])
 context.mock.method(globalThis,'fetch',async()=>({ok:false,status:422,json:async()=>({detail:'Invalid answers'})}))
 await assert.rejects(api('/ai/exercises/example/submit','POST',{}),/Invalid answers/)
 assert.equal(events.length,2)
})
