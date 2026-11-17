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
const AuthDialog=require('../frontend/app/components/AuthDialog.tsx').default
const {WhyEnglish}=require('../frontend/app/components/Community.tsx')
const {ResultView}=require('../frontend/app/components/AIPractice.tsx')
test('first render offers a short introduction and account choices',()=>{
 const html=renderToStaticMarkup(React.createElement(Home))
 assert.match(html,/Học tiếng Anh/)
 assert.match(html,/Đăng ký tài khoản/)
 assert.match(html,/green-mascot\.png/)
 assert.doesNotMatch(html,/Google|Facebook|social-login/)
 assert.doesNotMatch(html,/class="welcome"/)
 assert.doesNotMatch(html,/Khóa API/)
})
for(const mode of ['login','register'])test(mode+' dialog shows the green companion and email/password form',()=>{
 const noop=()=>{}
 const html=renderToStaticMarkup(React.createElement(AuthDialog,{mode,email:'',password:'',error:'',busy:false,onClose:noop,onSwitch:noop,onEmailChange:noop,onPasswordChange:noop,onSubmit:noop}))
 assert.match(html,/role="dialog"/)
 assert.match(html,/aria-labelledby="auth-title"/)
 assert.match(html,/green-mascot\.png/)
 assert.match(html,/type="email"/)
 assert.match(html,/type="password"/)
 assert.match(html,new RegExp('autoComplete="'+(mode==='login'?'current-password':'new-password')+'"','i'))
 assert.doesNotMatch(html,/Google|Facebook|oauth|social-login/)
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
test('study streak shows seven days, the record and quiz accuracy',()=>{
 const StudyStreak=require('../frontend/app/components/StudyStreak.tsx').default
 const week=Array.from({length:7},(_,i)=>({date:`2026-11-${String(8+i).padStart(2,'0')}`,active:i>3}))
 const html=renderToStaticMarkup(React.createElement(StudyStreak,{info:{streak:3,best_streak:5,studied_today:true,week},accuracy:80}))
 assert.match(html,/3 ngày liên tiếp/)
 assert.equal((html.match(/<li /g)||[]).length,7)
 assert.match(html,/5 ngày/)
 assert.match(html,/80%/)
})
test('header streak distinguishes zero days from loading and links to progress',()=>{
 const {StreakBadge}=require('../frontend/app/components/StudyStreak.tsx')
 const render=props=>renderToStaticMarkup(React.createElement(StreakBadge,{onClick(){},...props}))
 assert.match(render({streak:0}),/aria-label="0 ngày học liên tục/)
 assert.match(render({streak:0}),/<strong>0<\/strong>/)
 assert.match(render({streak:7,studiedToday:true}),/7 ngày học liên tục\. Hôm nay đã học/)
 assert.match(render({}),/Đang tải chuỗi ngày học/)
 assert.match(render({}),/<strong>—<\/strong>/)
})
test('speech button renders nothing on the server and shuffle keeps every card',()=>{
 const SpeakButton=require('../frontend/app/components/SpeakButton.tsx').default
 assert.equal(renderToStaticMarkup(React.createElement(SpeakButton,{text:'Hello'})),'')
 const {shuffled}=require('../frontend/app/lib/learning.ts')
 const items=[1,2,3,4,5]
 const result=shuffled(items,()=>0)
 assert.deepEqual([...result].sort(),items)
 assert.deepEqual(items,[1,2,3,4,5])
})
test('password dialog asks for current, new and confirmed password',()=>{
 const PasswordDialog=require('../frontend/app/components/PasswordDialog.tsx').default
 const html=renderToStaticMarkup(React.createElement(PasswordDialog,{onClose:()=>{},onDone:()=>{}}))
 assert.match(html,/role="dialog"/)
 assert.equal((html.match(/type="password"/g)||[]).length,3)
 assert.match(html,/autoComplete="current-password"/i)
})
test('dashboard offers due reviews only when some phrases are due',()=>{
 const Dashboard=require('../frontend/app/components/Dashboard.tsx').default
 const base={topics:[],loading:false,topicsError:'',onReload(){},progressError:'',onRetryProgress(){},onTopic(){},onNavigate(){},onReview(){}}
 const progress={mastered:3,total:400,quiz_count:1,topics:[],due:4}
 assert.match(renderToStaticMarkup(React.createElement(Dashboard,{...base,progress})),/4 câu đến hạn ôn hôm nay/)
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(Dashboard,{...base,progress:{...progress,due:0}})),/đến hạn ôn/)
})
test('speaking practice stays hidden until the browser supports recognition',()=>{
 const SpeakingCheck=require('../frontend/app/components/SpeakingCheck.tsx').default
 assert.equal(renderToStaticMarkup(React.createElement(SpeakingCheck,{text:'Hello'})),'')
})

test('AI-written explanations, plans and reports render as escaped text',()=>{
 const {ExplanationView}=require('../frontend/app/components/ExplainPhrase.tsx')
 const {PlanView}=require('../frontend/app/components/AICoach.tsx')
 const {RoleplayReportView}=require('../frontend/app/components/Roleplay.tsx')
 const {ExerciseReview}=require('../frontend/app/components/AIExercises.tsx')
 const attack='<img src=x onerror=alert(1)>'
 const explained=renderToStaticMarkup(React.createElement(ExplanationView,{value:{meaning:attack,parts:[{text:attack,meaning:'nghĩa',note:''}],grammar:'',usage:'Khi chào hỏi.',formality:'formal',pronunciation:'',alternatives:[],mistakes:[],dialogue:[]}}))
 assert.match(explained,/Sắc thái: Trang trọng/)
 assert.doesNotMatch(explained,/<img/)
 assert.doesNotMatch(explained,/Cấu trúc|Mẹo phát âm|Cách nói khác|Hội thoại mẫu/,'empty sections stay hidden')
 const plan={summary:attack,strengths:[],weaknesses:[],focus_topics:['food','deleted-topic'],plan:[{day:1,focus:'Ôn',tasks:[attack],minutes:15}],encouragement:''}
 const planned=renderToStaticMarkup(React.createElement(PlanView,{plan,topics:[{id:'food',name:'Ăn uống'}],onOpenTopic(){}}))
 assert.equal((planned.match(/class="small-button"/g)||[]).length,1,'a plan links only to topics that exist')
 assert.doesNotMatch(planned,/<img/)
 const report={summary:'Ổn.',score:null,estimated_level:'',goals_done:[],strengths:[],fixes:[{original:attack,improved:'I want',reason:'x'}],useful_phrases:[],next_steps:[],limitations:'Chưa đánh giá phát âm.'}
 const reviewed=renderToStaticMarkup(React.createElement(RoleplayReportView,{saved:{report,scenario:{id:'custom',title:attack,goals:[]},messages:[{role:'user',content:attack}]}}))
 assert.match(reviewed,/Nhận xét cho bạn/)
 assert.doesNotMatch(reviewed,/điểm luyện tập|<img|chat-goals/)
 const graded=renderToStaticMarkup(React.createElement(ExerciseReview,{result:{score:0,total:1,review:[{kind:'gap',prompt:'I ___ tea.',options:[],hint:'',answer:attack,correct:'like',is_correct:false,explanation:'I + like.'}]}}))
 assert.match(graded,/0 \/ 1 câu đúng/)
 assert.match(graded,/class="gap-blank"/)
 assert.doesNotMatch(graded,/<img|___/)
})
