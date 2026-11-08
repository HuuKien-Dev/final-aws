/* Render actual UI components with deterministic hook state. No browser or API calls. */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {createRequire}=require('node:module')
const root=path.resolve(__dirname,'..')
const frontendRequire=createRequire(path.join(root,'frontend/package.json'))
const ts=frontendRequire('typescript'),React=frontendRequire('react')
const {renderToStaticMarkup}=frontendRequire('react-dom/server')
const components=['Home','Courses','Vocabulary','AIPractice','AppFeedback','Lessons','Tutor','PictureVocabulary']
const stateNames={}
for(const ext of ['.tsx','.ts'])require.extensions[ext]=(module,filename)=>{
 const source=fs.readFileSync(filename,'utf8')
 const tree=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true)
 for(const statement of tree.statements){
  if(!ts.isFunctionDeclaration(statement)||!statement.name||!statement.body)continue
  const names=[]
  for(const child of statement.body.statements){
   if(!ts.isVariableStatement(child))continue
   for(const d of child.declarationList.declarations){
    if(ts.isArrayBindingPattern(d.name)&&d.initializer&&ts.isCallExpression(d.initializer)&&d.initializer.expression.getText(tree)==='useState')names.push(d.name.elements[0].getText(tree))
   }
  }
  stateNames[statement.name.text]=names
 }
 module._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)
}
// Discover hook names even when another test already cached a component module.
for(const filename of [path.join(root,'frontend/app/page.tsx'),...fs.readdirSync(path.join(root,'frontend/app/components')).filter(f=>f.endsWith('.tsx')).map(f=>path.join(root,'frontend/app/components',f))]){
 const source=fs.readFileSync(filename,'utf8'),tree=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true)
 for(const statement of tree.statements){
  if(!ts.isFunctionDeclaration(statement)||!statement.name||!statement.body)continue
  const names=[]
  for(const child of statement.body.statements){
   if(!ts.isVariableStatement(child))continue
   for(const d of child.declarationList.declarations)if(ts.isArrayBindingPattern(d.name)&&d.initializer&&ts.isCallExpression(d.initializer)&&d.initializer.expression.getText(tree)==='useState')names.push(d.name.elements[0].getText(tree))
  }
  stateNames[statement.name.text]=names
 }
}
const Home=require('../frontend/app/page.tsx').default
const curriculum=require('../backend/app/curriculum.json')
const topics=require('../database/sample.vi-en.json').topics.map(t=>({...t,count:t.phrases.length}))
const cards=[{id:'one',english:'reliable',vietnamese:'đáng tin cậy',example:'The service is reliable.',mastered:false},{id:'two',english:'appointment',vietnamese:'cuộc hẹn',example:'I have an appointment today.',mastered:true}]
const decks=[{id:'deck-one',name:'Công việc',total:2,mastered:1},{id:'deck-two',name:'Từ mới tuần này',total:0,mastered:0}]
const phraseData=topics[0].phrases.map((p,i)=>({...p,id:String(i),mastered:false,favorite:true}))
const progress={mastered:3,favorites:2,total:120,quiz_count:1,topics:topics.map(t=>({...t,total:6,mastered:0,favorites:0})),history:[{id:'quiz-one',score:4,total:5,submitted_at:'2026-11-08T12:00:00Z'}]}
const feedback={reply:'Try describing your daily routine.',summary:'Bạn đã trình bày được ý chính.',score:70,estimated_level:'A2 (ước lượng)',strengths:['Ý chính rõ ràng.'],improvements:[{original:'I goes to work.',improved:'I go to work.',reason:'Chủ ngữ I dùng động từ go.'}],improved_version:'I go to work every morning.',next_steps:['Viết thêm ba câu về công việc.'],criteria:[{name:'Ngữ pháp',score:70,comment:'Kiểm tra hòa hợp chủ ngữ.'}],roadmap:[{week:1,focus:'Giao tiếp hằng ngày',activities:['Ôn 5 câu mỗi ngày.']}],limitations:'Chưa chấm phát âm; điểm luyện tập tham khảo.'}
const base={
 Home:{email:'demo@example.com',ready:true,topics,phrases:phraseData,progress,quiz:{id:'quiz-one',answers:Array(5).fill(''),questions:phraseData.slice(0,5).map(p=>({phrase_id:p.id,english:p.english,options:[p.vietnamese,'Đáp án khác','Một lựa chọn','Lựa chọn còn lại']}))},answers:Array(5).fill('')},
 Courses:{courses:curriculum,loading:false},Vocabulary:{decks,selected:'deck-one',cards,loading:false},
 Lessons:{loading:false,lessons:topics.map(t=>({...t,total:6,mastered:1}))},
 AIPractice:{status:{configured:true,provider:'deepseek',audio:false,used:2,daily_limit:30},result:{feedback,submission:'I goes to work.',transcript:'',provider:'deepseek',model:'test'}},
 AppFeedback:{entries:[{id:'feedback-one',category:'feature',message:'Tôi muốn có thêm bài luyện nghe.',created_at:'2026-11-08T12:00:00Z'}]},
 PictureVocabulary:{decks,deck:'deck-one'}
}
function render(overrides){
 const counters={},native=React.useState
 React.useState=function(initial){
  const stack=new Error().stack||''
  const name=components.find(n=>stack.includes('at '+n+' ('))
  if(name){const index=counters[name]||0;counters[name]=index+1;const key=stateNames[name]?.[index];const values={...base[name],...overrides[name]};if(Object.hasOwn(values,key))initial=values[key]}
  return native(initial)
 }
 try{return renderToStaticMarkup(React.createElement(Home))}finally{React.useState=native}
}
const output=path.join(root,'.tools/ui-review');fs.mkdirSync(output,{recursive:true})
const css=fs.readFileSync(path.join(root,'frontend/app/globals.css'),'utf8')
const tabs=['home','lessons','phrases','flashcards','quiz','progress','ielts','specialist','vocabulary','tutor','placement','why','feedback','pictures']
for(const tab of tabs)test('UI renders '+tab,()=>{
 const html=render({Home:{tab}})
 assert.match(html,/class="shell /)
 assert.doesNotMatch(html,/class="shell guest-shell"/,'Authenticated fixtures must render the requested learning tab')
 assert.ok(!html.includes('undefined'),'Unexpected missing UI value')
 if(tab==='pictures'){assert.equal((html.match(/class="picture-card"/g)||[]).length,12);assert.match(html,/Tải toàn bộ 6 ảnh/)}
 if(tab==='vocabulary'){assert.match(html,/vocab-meaning/);assert.match(html,/Ex:/)}
 if(tab==='quiz')assert.equal((html.match(/class="quiz-question"/g)||[]).length,5)
 fs.writeFileSync(path.join(output,tab+'.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'</body></html>')
})
for(const skill of ['listening','reading','writing','speaking'])test('UI renders course editor '+skill,()=>{
 const selected='ielts-'+skill
 const lesson=curriculum[0].lessons.find(l=>l.id===selected)
 const html=render({Home:{tab:'ielts'},Courses:{selected,draft:'I goes to work.',answers:lesson.questions.map(()=>-1)}})
 assert.match(html,/course-editor/)
 if(skill==='listening')assert.match(html,/ielts-listening.wav/)
 if(skill==='speaking')assert.match(html,/Ghi âm bài nói/)
 fs.writeFileSync(path.join(output,selected+'.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'</body></html>')
})
for(const mode of ['review','match','type'])test('UI renders vocabulary '+mode,()=>{
 const html=render({Home:{tab:'vocabulary'},Vocabulary:{mode,game:cards,right:[...cards].reverse()}})
 assert.match(html,mode==='review'?/flashcard-area/:/game-panel/)
})
test('CSS parses with the production PostCSS parser',()=>{
 const parser=frontendRequire('next/node_modules/postcss')
 const tree=parser.parse(css)
 assert.ok(tree.nodes.length>0)
})

test('picture vocabulary navigation is immediately before personal flashcards',()=>{
 const html=render({Home:{tab:'home'}})
 const nav=html.slice(html.indexOf('<nav>'),html.indexOf('</nav>'))
 assert.match(nav,/Từ vựng qua ảnh<\/button><button[^>]*><span class="nav-icon">[^<]*<\/span>Flashcard của tôi/)
})

test('large reading layout has no explicitly tiny font sizes',()=>{
 const tree=frontendRequire('next/node_modules/postcss').parse(css)
 tree.walkDecls('font-size',decl=>{
  for(const match of decl.value.matchAll(/([\d.]+)px/g))assert.ok(Number(match[1])>=16,`${decl.parent.selector}: ${decl.value}`)
 })
 assert.match(css,/--sidebar-width:360px/)
 assert.match(css,/body\{font-size:20px/)
})
