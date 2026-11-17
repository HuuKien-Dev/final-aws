/* Render actual UI components with deterministic hook state. No browser or API calls. */
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {createRequire}=require('node:module')
const root=path.resolve(__dirname,'..')
const frontendRequire=createRequire(path.join(root,'frontend/package.json'))
const ts=frontendRequire('typescript'),React=frontendRequire('react')
const {renderToPipeableStream}=frontendRequire('react-dom/server')
const {PassThrough}=require('node:stream')
const components=['Home','Courses','Vocabulary','AIPractice','AppFeedback','Lessons','Tutor','PictureVocabulary','Roleplay','AIExercises','AICoach','ExplainPhrase']
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
const progress={mastered:3,favorites:2,total:400,quiz_count:1,topics:topics.map(t=>({...t,total:20,mastered:0,favorites:0})),history:[{id:'quiz-one',score:4,total:5,submitted_at:'2026-11-08T12:00:00Z'}]}
const feedback={reply:'Try describing your daily routine.',summary:'Bạn đã trình bày được ý chính.',score:70,estimated_level:'A2 (ước lượng)',strengths:['Ý chính rõ ràng.'],improvements:[{original:'I goes to work.',improved:'I go to work.',reason:'Chủ ngữ I dùng động từ go.'}],improved_version:'I go to work every morning.',next_steps:['Viết thêm ba câu về công việc.'],criteria:[{name:'Ngữ pháp',score:70,comment:'Kiểm tra hòa hợp chủ ngữ.'}],roadmap:[{week:1,focus:'Giao tiếp hằng ngày',activities:['Ôn 5 câu mỗi ngày.']}],limitations:'Chưa chấm phát âm; điểm luyện tập tham khảo.'}
const base={
 Home:{email:'demo@example.com',ready:true,topicsLoading:false,topics,phrases:phraseData,progress,quiz:{id:'quiz-one',answers:Array(5).fill(''),questions:phraseData.slice(0,5).map(p=>({phrase_id:p.id,english:p.english,options:[p.vietnamese,'Đáp án khác','Một lựa chọn','Lựa chọn còn lại']}))},answers:Array(5).fill('')},
 Courses:{courses:curriculum,loading:false},Vocabulary:{decks,selected:'deck-one',cards,loading:false},
 Lessons:{loading:false,lessons:topics.map(t=>({...t,total:20,mastered:1}))},
 AIPractice:{status:{configured:true,provider:'deepseek',audio:false,used:2,daily_limit:30},result:{feedback,submission:'I goes to work.',transcript:'',provider:'deepseek',model:'test'}},
 AppFeedback:{entries:[{id:'feedback-one',category:'feature',message:'Tôi muốn có thêm bài luyện nghe.',created_at:'2026-11-08T12:00:00Z'}]},
 PictureVocabulary:{decks,deck:'deck-one'}
}
async function render(overrides){
 const counters={},native=React.useState
 React.useState=function(initial){
  const stack=new Error().stack||''
  const name=components.find(n=>stack.includes('at '+n+' ('))
  if(name){const index=counters[name]||0;counters[name]=index+1;const key=stateNames[name]?.[index];const values={...base[name],...overrides[name]};if(Object.hasOwn(values,key))initial=values[key]}
  return native(initial)
 }
 try{return await new Promise((resolve,reject)=>{
  const output=new PassThrough();let html=''
  output.on('data',chunk=>{html+=chunk}).on('end',()=>resolve(html)).on('error',reject)
  const stream=renderToPipeableStream(React.createElement(Home),{onAllReady(){stream.pipe(output)},onError:reject})
 })}finally{React.useState=native}
}
const output=path.join(root,'.tools/ui-review');fs.mkdirSync(output,{recursive:true})
const css=fs.readFileSync(path.join(root,'frontend/app/globals.css'),'utf8')
const tabs=['home','lessons','phrases','flashcards','quiz','progress','ielts','specialist','vocabulary','tutor','placement','why','feedback','pictures']
for(const tab of tabs)test('UI renders '+tab,async()=>{
 const html=await render({Home:{tab}})
 assert.match(html,/class="shell /)
 assert.doesNotMatch(html,/class="shell guest-shell"/,'Authenticated fixtures must render the requested learning tab')
 assert.ok(!html.includes('undefined'),'Unexpected missing UI value')
 if(tab==='pictures'){assert.equal((html.match(/class="picture-card"/g)||[]).length,24);assert.match(html,/Tải toàn bộ 6 ảnh/)}
 if(tab==='vocabulary'){assert.match(html,/vocab-meaning/);assert.match(html,/Ex:/)}
 if(tab==='quiz')assert.equal((html.match(/class="quiz-question"/g)||[]).length,5)
 fs.writeFileSync(path.join(output,tab+'.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'</body></html>')
})
for(const skill of ['listening','reading','writing','speaking'])test('UI renders course editor '+skill,async()=>{
 const selected='ielts-'+skill
 const lesson=curriculum[0].lessons.find(l=>l.id===selected)
 const html=await render({Home:{tab:'ielts'},Courses:{selected,draft:'I goes to work.',answers:lesson.questions.map(()=>-1)}})
 assert.match(html,/course-editor/)
 if(skill==='listening')assert.match(html,/ielts-listening.wav/)
 if(skill==='speaking')assert.match(html,/Ghi âm bài nói/)
 fs.writeFileSync(path.join(output,selected+'.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'</body></html>')
})
for(const mode of ['review','match','type'])test('UI renders vocabulary '+mode,async()=>{
 const html=await render({Home:{tab:'vocabulary'},Vocabulary:{mode,game:cards,right:[...cards].reverse()}})
 assert.match(html,mode==='review'?/flashcard-area/:/game-panel/)
})
test('CSS parses with the production PostCSS parser',()=>{
 const parser=frontendRequire('next/node_modules/postcss')
 const tree=parser.parse(css)
 assert.ok(tree.nodes.length>0)
})

test('picture vocabulary navigation is immediately before personal flashcards',async()=>{
 const html=await render({Home:{tab:'home'}})
 const nav=html.slice(html.indexOf('<nav '),html.indexOf('</nav>'))
 assert.match(nav,/Từ vựng qua ảnh<\/button><button[^>]*><span class="nav-icon">[^<]*<\/span>Flashcard của tôi/)
})

test('compact reading layout keeps text at a readable size',()=>{
 const tree=frontendRequire('next/node_modules/postcss').parse(css)
 tree.walkDecls('font-size',decl=>{
  for(const match of decl.value.matchAll(/([\d.]+)px/g))assert.ok(Number(match[1])>=13.68,`${decl.parent.selector}: ${decl.value}`)
 })
 assert.match(css,/--sidebar-width:360px/)
 assert.match(css,/body\{font-size:17\.1px/)
})

// --- Học với AI: nhập vai, bài tập, phân tích, giải thích câu ---
const renderText=async overrides=>(await render(overrides)).replaceAll('<!-- -->','')
const aiStatus={configured:true,provider:'bedrock',audio:false,used:3,daily_limit:30}
const scenario={id:'cafe-order',icon:'☕',title:'Gọi món ở quán cà phê',level:'A2',summary:'Bạn ghé một quán cà phê buổi sáng.',learner_role:'Khách hàng',partner:'Nhân viên pha chế',goals:['Gọi một đồ uống','Hỏi giá','Thanh toán và cảm ơn'],opening:'Hi there! What can I get for you?',opening_vi:'Xin chào! Bạn muốn dùng gì?',starters:['Hi! Can I have a latte, please?']}
const conversation=[{role:'assistant',content:'Hi there! What can I get for you?',vi:'Xin chào! Bạn muốn dùng gì?'},{role:'user',content:'I wants a coffee',fixes:[{original:'I wants',improved:'I want',reason:'Chủ ngữ I dùng want.'}]},{role:'assistant',content:'Sure! What size would you like?',vi:'Được chứ! Bạn muốn cỡ nào?'},{role:'user',content:'A small one, please.',fixes:[]}]
const savedRoleplay={id:'r1',report:{summary:'Bạn gọi món rõ ràng và lịch sự.',score:72,estimated_level:'A2 (ước lượng)',goals_done:[0,2],strengths:['Dùng please tự nhiên.'],fixes:[{original:'I wants',improved:'I want',reason:'Chia động từ theo chủ ngữ I.'}],useful_phrases:[{english:'Can I have a latte, please?',vietnamese:'Cho tôi một ly latte.'},{english:'How much is it?',vietnamese:'Bao nhiêu tiền?'}],next_steps:['Luyện lại tình huống với đồ ăn kèm.'],limitations:'Chưa đánh giá phát âm.'},scenario:{id:'cafe-order',title:'Gọi món ở quán cà phê',goals:scenario.goals},messages:conversation.map(({role,content})=>({role,content}))}
const practice={id:'e1',title:'Hiện tại đơn',questions:[{kind:'choice',prompt:'She ___ to work every day.',options:['go','goes','going','gone'],hint:''},{kind:'gap',prompt:'I ___ a student.',options:[],hint:'Tôi là học sinh.'}],result:null}
const practiceResult={score:1,total:2,review:[{...practice.questions[0],answer:'go',correct:'goes',is_correct:false,explanation:'She + động từ thêm s/es.'},{...practice.questions[1],answer:'am',correct:'am',is_correct:true,explanation:'I đi với am.'}]}
const insights={quizzes:4,answered:20,accuracy:65,mastered:12,total:400,due:3,lessons:1,exercises:{sets:2,accuracy:70},weak_topics:['food'],enough:true,
 topics:[{id:'food',name:'Ăn uống',total:20,mastered:4,answered:10,correct:5,accuracy:50},{id:'travel',name:'Du lịch',total:20,mastered:8,answered:10,correct:8,accuracy:80},{id:'work',name:'Công việc',total:20,mastered:0,answered:0,correct:0,accuracy:null}],
 missed:[{phrase_id:'p2',english:'The bill, please.',vietnamese:'Cho tôi xin hóa đơn.',wrong:2,topic:'Ăn uống'}]}
const studyPlan={summary:'Bạn đúng 50% ở chủ đề Ăn uống.',strengths:['Đã thuộc 12 câu.'],weaknesses:[{area:'Ăn uống',evidence:'5/10 câu đúng',advice:'Ôn câu từng sai rồi làm quiz 5 câu.'}],focus_topics:['food'],plan:Array.from({length:7},(_,i)=>({day:i+1,focus:'Ngày '+(i+1),tasks:['Ôn 5 câu đến hạn','Quiz chủ đề Ăn uống'],minutes:20})),encouragement:'Mỗi ngày một chút là đủ.'}
const explanation={meaning:'Lời chào thân thiện khi gặp ai đó.',parts:[{text:'Nice to',meaning:'Rất vui được',note:'cụm cố định'},{text:'meet you',meaning:'gặp bạn',note:''}],grammar:'Nice to + V: Nice to see you.',usage:'Dùng khi gặp lần đầu.',formality:'neutral',pronunciation:'Nối âm meet-you.',alternatives:[{english:'Pleased to meet you.',vietnamese:'Hân hạnh được gặp bạn.',note:'trang trọng hơn'}],mistakes:['Nice to meet with you.'],dialogue:[{speaker:'A',english:'Nice to meet you.',vietnamese:'Rất vui được gặp bạn.'},{speaker:'B',english:'Nice to meet you too.',vietnamese:'Tôi cũng vậy.'}]}
const count=(html,pattern)=>(html.match(pattern)||[]).length

test('AI hub offers every learning mode and opens the selected one',async()=>{
 const html=await renderText({Home:{tab:'tutor'}})
 assert.equal(count(html,/aria-pressed="(true|false)"/g),5)
 for(const label of ['Hỏi bài &amp; luyện viết','Luyện nói có nhận xét','Nhập vai hội thoại','Bài tập theo điểm yếu','Phân tích &amp; kế hoạch'])assert.ok(html.includes(label),label)
 assert.match(html,/aria-pressed="true"[^>]*>Hỏi bài/)
})
test('UI renders role-play scenarios and disables them until AI is configured',async()=>{
 const ready=await renderText({Home:{tab:'tutor',aiMode:'roleplay'},Roleplay:{status:aiStatus,scenarios:[scenario,{...scenario,id:'two',title:'Phỏng vấn xin việc'}]}})
 assert.equal(count(ready,/class="scenario-card"/g),2)
 assert.doesNotMatch(ready,/class="scenario-card" disabled/)
 assert.match(ready,/tự chọn tình huống/)
 assert.ok(!ready.includes('undefined'))
 const off=await renderText({Home:{tab:'tutor',aiMode:'roleplay'},Roleplay:{status:{...aiStatus,configured:false},scenarios:[scenario]}})
 assert.match(off,/class="scenario-card" disabled/)
 assert.match(off,/AI chưa được cấu hình/)
})
test('UI renders a role-play conversation with corrections, goals and hints',async()=>{
 const html=await renderText({Home:{tab:'tutor',aiMode:'roleplay'},Roleplay:{status:aiStatus,scenarios:[scenario],scenario,lines:conversation,goals:[0],suggestions:['A medium one, please.'],showHints:true}})
 assert.equal(count(html,/class="chat-row ai"/g),2)
 assert.equal(count(html,/class="chat-row me"/g),2)
 assert.match(html,/class="fix-old" lang="en">I wants<\/span>/)
 assert.match(html,/Không có lỗi đáng kể/)
 assert.equal(count(html,/<li class="done">/g),1)
 assert.match(html,/A medium one, please\./)
 assert.match(html,/Lượt 2\/15/)
 assert.match(html,/role="log"/)
 assert.ok(!html.includes('undefined'))
 fs.writeFileSync(path.join(output,'ai-roleplay.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'</body></html>')
})
test('UI renders a saved role-play report with phrases to keep',async()=>{
 const html=await renderText({Home:{tab:'tutor',aiMode:'roleplay'},Roleplay:{status:aiStatus,saved:savedRoleplay,decks:[{id:'d1',name:'Công việc'}]}})
 assert.match(html,/72 \/ 100 điểm luyện tập/)
 assert.equal(count(html,/<li class="done">/g),2)
 assert.match(html,/Lưu 2 cụm từ/)
 assert.match(html,/<option value="d1">Công việc<\/option>/)
 assert.doesNotMatch(html,/class="chat-log"/)
 assert.ok(!html.includes('undefined'))
})
test('UI renders an AI practice set without answers, then its graded review',async()=>{
 const base={status:aiStatus,topics:topics.slice(0,3),missed:2,mastered:5,focus:'mistakes'}
 const open=await renderText({Home:{tab:'tutor',aiMode:'exercises'},AIExercises:{...base,exercise:practice,answers:['goes','']}})
 assert.match(open,/Câu tôi hay sai trong quiz \(2 câu\)/)
 assert.equal(count(open,/class="gap-blank"/g),2)
 assert.match(open,/Điền từ còn thiếu/)
 assert.match(open,/Đã trả lời 1\/2 câu/)
 assert.doesNotMatch(open,/She \+ động từ/)
 assert.ok(!open.includes('___')&&!open.includes('undefined'))
 const graded=await renderText({Home:{tab:'tutor',aiMode:'exercises'},AIExercises:{...base,exercise:{...practice,result:practiceResult},result:practiceResult,answers:['go','am']}})
 assert.match(graded,/1 \/ 2 câu đúng/)
 assert.equal(count(graded,/class="review incorrect"/g),1)
 assert.match(graded,/She \+ động từ thêm s\/es\./)
 assert.doesNotMatch(graded,/exercise-set/)
 fs.writeFileSync(path.join(output,'ai-exercises.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+graded+'</body></html>')
})
test('UI renders study insights and the saved seven-day plan',async()=>{
 const html=await renderText({Home:{tab:'tutor',aiMode:'coach'},AICoach:{loading:false,status:aiStatus,insights,saved:{plan:studyPlan},savedAt:'2026-11-14T03:00:00Z'}})
 assert.match(html,/65%/)
 assert.equal(count(html,/class="progress-row"/g),2,'only practised topics are ranked')
 assert.match(html,/The bill, please\./)
 assert.equal(count(html,/NGÀY \d · 20 PHÚT/g),7)
 assert.match(html,/Ăn uống →/)
 assert.ok(!html.includes('undefined'))
 const thin=await renderText({Home:{tab:'tutor',aiMode:'coach'},AICoach:{loading:false,status:aiStatus,insights:{...insights,enough:false,missed:[],accuracy:null,answered:0}}})
 assert.match(thin,/Chưa đủ dữ liệu để phân tích/)
 assert.doesNotMatch(thin,/Kế hoạch 7 ngày/)
 fs.writeFileSync(path.join(output,'ai-coach.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+html+'</body></html>')
})
test('lessons and flashcards explain a sentence only when AI is configured',async()=>{
 const lesson={id:'greetings',name:'Chào hỏi',description:'Mở đầu cuộc trò chuyện',total:20,mastered:1,phrases:phraseData,offset:0,has_more:false}
 const reader=overrides=>renderText({Home:{tab:'lessons',topic:'greetings',...overrides},Lessons:{loading:false,lesson}})
 assert.doesNotMatch(await reader({}),/Giải thích câu này/)
 assert.match(await reader({aiReady:true}),/✦ Giải thích câu này/)
 assert.doesNotMatch(await renderText({Home:{tab:'flashcards'}}),/Giải thích câu này/)
 const opened=await renderText({Home:{tab:'flashcards',aiReady:true},ExplainPhrase:{open:true,value:explanation,fresh:true}})
 assert.match(opened,/class="explain-panel"/)
 assert.match(opened,/Sắc thái: Trung tính/)
 assert.match(opened,/Ẩn giải thích/)
 assert.match(opened,/Đã dùng 1 lượt AI/)
 assert.equal(count(opened,/<dt lang="en">/g),2)
 assert.ok(!opened.includes('undefined'))
 fs.writeFileSync(path.join(output,'ai-explain.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body>'+opened+'</body></html>')
})
test('progress page links to AI practice only when AI is configured',async()=>{
 assert.doesNotMatch(await renderText({Home:{tab:'progress'}}),/Bài tập AI theo điểm yếu/)
 assert.match(await renderText({Home:{tab:'progress',aiReady:true}}),/Bài tập AI theo điểm yếu/)
})
