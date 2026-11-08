const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createRequire}=require('node:module')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const fromFrontend=createRequire(path.resolve(__dirname,'../frontend/package.json'))
const ts=fromFrontend('typescript')
async function policy(phase,environment){
 const source=fs.readFileSync(path.resolve(__dirname,'../frontend/next.config.ts'),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const sandbox={exports:{},require:fromFrontend,process:{env:{NODE_ENV:environment}}}
 vm.runInNewContext(code,sandbox)
 const rows=await sandbox.exports.default(phase).headers()
 return rows[0].headers.find(h=>h.key==='Content-Security-Policy').value
}
test('development CSP supports React debugging and hot reload',async()=>{
 const value=await policy('phase-development-server','production')
 assert.match(value,/script-src [^;]*'unsafe-eval'/)
 assert.match(value,/connect-src 'self' ws: wss:/)
})
test('production CSP keeps eval and websocket scheme exceptions disabled',async()=>{
 for(const environment of ['production',undefined]){
  const value=await policy('phase-production-build',environment)
  assert.doesNotMatch(value,/'unsafe-eval'|ws:|wss:/)
  assert.match(value,/media-src 'self' blob:/)
  assert.match(value,/frame-ancestors 'none'/)
 }
})
