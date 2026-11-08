/* Static render checks using the app's existing React/TypeScript dependencies. */
const {createRequire}=require('node:module')
const fs=require('node:fs')
const path=require('node:path')
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fromFrontend=createRequire(path.resolve(__dirname,'../frontend/package.json'))
const ts=fromFrontend('typescript')
const React=fromFrontend('react')
const {renderToStaticMarkup}=fromFrontend('react-dom/server')
for(const ext of ['.tsx','.ts'])require.extensions[ext]=(module,filename)=>{
 const source=fs.readFileSync(filename,'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 module._compile(output,filename)
}
const Home=require('../frontend/app/page.tsx').default
const {WhyEnglish}=require('../frontend/app/components/Community.tsx')
const {ResultView}=require('../frontend/app/components/AIPractice.tsx')
test('first render offers a short introduction and account choices',()=>{
 const html=renderToStaticMarkup(React.createElement(Home))
 assert.match(html,/Học tiếng Anh/)
 assert.match(html,/Đăng ký tài khoản/)
 assert.match(html,/Tiếp tục với Google/)
 assert.match(html,/Tiếp tục với Facebook/)
 assert.doesNotMatch(html,/class="welcome"/)
 assert.doesNotMatch(html,/Khóa API/)
})
test('public motivation page contains exactly twenty reasons',()=>{
 const html=renderToStaticMarkup(React.createElement(WhyEnglish))
 assert.equal((html.match(/class="reason-card"/g)||[]).length,20)
})
test('AI corrections render original, improved sentence and full rewrite as escaped text',()=>{
 const feedback={reply:'Try again.',summary:'Feedback',score:70,estimated_level:'A2',strengths:[],improvements:[{original:'<script>alert(1)</script>',improved:'I go to work.',reason:'Subject agreement'}],improved_version:'I go to work every day.',next_steps:[],criteria:[],roadmap:[],limitations:'Practice score only.'}
 const html=renderToStaticMarkup(React.createElement(ResultView,{result:{feedback,transcript:'',submission:'I goes to work.',provider:'selected-provider',model:'test'}}))
 assert.match(html,/Câu của bạn/)
 assert.match(html,/Toàn đoạn sau khi cải thiện/)
 assert.match(html,/I go to work every day/)
 assert.match(html,/Bài gốc của bạn/)
 assert.doesNotMatch(html,/<script>/)
 assert.match(html,/&lt;script&gt;/)
})
