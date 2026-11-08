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
