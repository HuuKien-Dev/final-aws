import asyncio,hashlib,json,os,uuid
from typing import Literal
from fastapi import Depends,HTTPException,Request
from pydantic import BaseModel,Field,field_validator
from .courses import CATALOG,LESSONS,SCENARIOS,get_lesson,public_lesson,public_scenario,review
from .learning import exercise_view,grade_exercises,latest_mistake_ids,quiz_insights
from . import ai_service

class DeckBody(BaseModel):
    name:str=Field(min_length=1,max_length=100)
    @field_validator('name')
    @classmethod
    def clean(cls,value):
        if not value.strip():raise ValueError('Tên bộ thẻ không được để trống')
        return value.strip()
class CardBody(BaseModel):
    english:str=Field(min_length=1,max_length=300)
    vietnamese:str=Field(min_length=1,max_length=500)
    example:str=Field(default='',max_length=1000)
    mastered:bool=False
    @field_validator('english','vietnamese')
    @classmethod
    def clean(cls,value):
        if not value.strip():raise ValueError('Không được để trống nội dung thẻ')
        return value.strip()
class CardBatch(BaseModel):
    cards:list[CardBody]=Field(min_length=1,max_length=200)
class Answers(BaseModel):
    answers:list[int]=Field(default_factory=list,max_length=100)
class Work(Answers):
    draft:str=Field(default='',max_length=16000)
    completed:bool=False
class Suggestion(BaseModel):
    category:Literal['bug','feature','content','other']
    message:str=Field(min_length=10,max_length=5000)
    @field_validator('message')
    @classmethod
    def clean(cls,value):
        if len(value.strip())<10:raise ValueError('Góp ý cần ít nhất 10 ký tự')
        return value.strip()

class ExerciseBody(BaseModel):
    focus:Literal['mistakes','review','topic','custom']
    topic:str=Field(default='',max_length=100)
    text:str=Field(default='',max_length=200)
    level:Literal['A1','A2','B1','B2']='A2'
    count:Literal[5,8,10]=5
class ExerciseAnswers(BaseModel):
    answers:list[str]=Field(max_length=10)
class CoachBody(BaseModel):
    goal:str=Field(default='',max_length=200)
    minutes:Literal[10,15,20,30,45,60]=20

# Feedback kinds shown by the tutor screens; role-play reports and study plans are requested by name.
FEEDBACK_ACTIONS=['tutor','writing','speaking','roadmap']
STORED_ACTIONS=[*FEEDBACK_ACTIONS,'roleplay','coach']
RECENT_QUIZZES='SELECT questions,answers FROM quizzes WHERE user_id=$1 AND submitted_at IS NOT NULL ORDER BY submitted_at DESC,id DESC LIMIT 100'

def install(app,user,db):
    async def owned_deck(connection,uid,did):
        row=await connection.fetchrow('SELECT * FROM vocabulary_decks WHERE id=$1 AND user_id=$2',did,uid)
        if not row:raise HTTPException(404,'Không tìm thấy bộ thẻ')
        return row

    @app.get('/api/decks')
    async def decks(current=Depends(user),connection=Depends(db)):
        return [dict(r) for r in await connection.fetch('''SELECT d.*,count(c.id)::int AS total,
          count(c.id) FILTER(WHERE c.mastered)::int AS mastered FROM vocabulary_decks d
          LEFT JOIN vocabulary_cards c ON c.deck_id=d.id WHERE d.user_id=$1 GROUP BY d.id ORDER BY d.created_at,d.id''',current['id'])]

    @app.get('/api/decks/templates')
    async def deck_templates(current=Depends(user)):
        return [{'id':c['id'],'name':c['name'],'total':len(c['lexicon'])} for c in CATALOG]

    @app.post('/api/decks/templates/{template_id}')
    async def import_deck(template_id:str,current=Depends(user),connection=Depends(db)):
        course=next((c for c in CATALOG if c['id']==template_id),None)
        if course is None:raise HTTPException(404,'Không tìm thấy bộ từ mẫu')
        # A retry opens the same personal deck, without overwriting edited cards.
        did=uuid.uuid5(uuid.NAMESPACE_URL,f"english-learning:template:{current['id']}:{template_id}")
        async with connection.transaction():
            await connection.execute('SELECT id FROM users WHERE id=$1 FOR UPDATE',current['id'])
            existing=await connection.fetchrow('SELECT id,name FROM vocabulary_decks WHERE id=$1 AND user_id=$2',did,current['id'])
            if existing:return {**dict(existing),'created':False}
            if await connection.fetchval('SELECT count(*) FROM vocabulary_decks WHERE user_id=$1',current['id'])>=100:
                raise HTTPException(422,'Mỗi tài khoản tối đa 100 bộ thẻ')
            await connection.execute('INSERT INTO vocabulary_decks(id,user_id,name) VALUES($1,$2,$3)',did,current['id'],course['name'])
            await connection.executemany('INSERT INTO vocabulary_cards(id,deck_id,english,vietnamese,example,mastered) VALUES($1,$2,$3,$4,$5,$6)',
                [(uuid.uuid4(),did,en,vi,example,False) for en,vi,example in course['lexicon']])
        return {'id':did,'name':course['name'],'created':True}

    @app.post('/api/decks')
    async def create_deck(body:DeckBody,current=Depends(user),connection=Depends(db)):
        did=uuid.uuid4()
        # Serialize per-account limit checks across processes.
        async with connection.transaction():
            await connection.execute('SELECT id FROM users WHERE id=$1 FOR UPDATE',current['id'])
            if await connection.fetchval('SELECT count(*) FROM vocabulary_decks WHERE user_id=$1',current['id'])>=100:raise HTTPException(422,'Mỗi tài khoản tối đa 100 bộ thẻ')
            await connection.execute('INSERT INTO vocabulary_decks(id,user_id,name) VALUES($1,$2,$3)',did,current['id'],body.name)
        return {'id':did,'name':body.name}

    @app.put('/api/decks/{did}')
    async def rename_deck(did:uuid.UUID,body:DeckBody,current=Depends(user),connection=Depends(db)):
        await owned_deck(connection,current['id'],did)
        await connection.execute('UPDATE vocabulary_decks SET name=$1 WHERE id=$2 AND user_id=$3',body.name,did,current['id'])
        return {'ok':True}

    @app.delete('/api/decks/{did}')
    async def delete_deck(did:uuid.UUID,current=Depends(user),connection=Depends(db)):
        await owned_deck(connection,current['id'],did)
        await connection.execute('DELETE FROM vocabulary_decks WHERE id=$1 AND user_id=$2',did,current['id'])
        return {'ok':True}

    @app.get('/api/decks/{did}/cards')
    async def cards(did:uuid.UUID,current=Depends(user),connection=Depends(db)):
        await owned_deck(connection,current['id'],did)
        return [dict(r) for r in await connection.fetch('SELECT * FROM vocabulary_cards WHERE deck_id=$1 ORDER BY created_at,id',did)]

    @app.post('/api/decks/{did}/cards')
    async def create_card(did:uuid.UUID,body:CardBody,current=Depends(user),connection=Depends(db)):
        async with connection.transaction():
            await owned_deck(connection,current['id'],did)
            await connection.execute('SELECT id FROM vocabulary_decks WHERE id=$1 FOR UPDATE',did)
            if await connection.fetchval('SELECT count(*) FROM vocabulary_cards WHERE deck_id=$1',did)>=1000:raise HTTPException(422,'Mỗi bộ tối đa 1000 thẻ')
            cid=uuid.uuid4()
            await connection.execute('INSERT INTO vocabulary_cards(id,deck_id,english,vietnamese,example,mastered) VALUES($1,$2,$3,$4,$5,$6)',cid,did,body.english,body.vietnamese,body.example,body.mastered)
        return {'id':cid}

    @app.post('/api/decks/{did}/cards/bulk')
    async def create_cards(did:uuid.UUID,body:CardBatch,current=Depends(user),connection=Depends(db)):
        # All pasted cards are added together or not at all.
        async with connection.transaction():
            await owned_deck(connection,current['id'],did)
            await connection.execute('SELECT id FROM vocabulary_decks WHERE id=$1 FOR UPDATE',did)
            count=await connection.fetchval('SELECT count(*) FROM vocabulary_cards WHERE deck_id=$1',did)
            if count+len(body.cards)>1000:raise HTTPException(422,f'Mỗi bộ tối đa 1000 thẻ; bộ này còn chỗ cho {max(0,1000-count)} thẻ')
            # Microsecond offsets keep the pasted order (cards sort by created_at).
            await connection.executemany('''INSERT INTO vocabulary_cards(id,deck_id,english,vietnamese,example,mastered,created_at)
              VALUES($1,$2,$3,$4,$5,$6,now()+make_interval(secs=>$7::double precision))''',
                [(uuid.uuid4(),did,c.english,c.vietnamese,c.example,c.mastered,i/1_000_000) for i,c in enumerate(body.cards)])
        return {'added':len(body.cards)}

    @app.put('/api/decks/{did}/cards/{cid}')
    async def update_card(did:uuid.UUID,cid:uuid.UUID,body:CardBody,current=Depends(user),connection=Depends(db)):
        await owned_deck(connection,current['id'],did)
        row=await connection.fetchval('UPDATE vocabulary_cards SET english=$1,vietnamese=$2,example=$3,mastered=$4 WHERE id=$5 AND deck_id=$6 RETURNING id',body.english,body.vietnamese,body.example,body.mastered,cid,did)
        if not row:raise HTTPException(404,'Không tìm thấy thẻ')
        return {'ok':True}

    @app.delete('/api/decks/{did}/cards/{cid}')
    async def delete_card(did:uuid.UUID,cid:uuid.UUID,current=Depends(user),connection=Depends(db)):
        await owned_deck(connection,current['id'],did)
        row=await connection.fetchval('DELETE FROM vocabulary_cards WHERE id=$1 AND deck_id=$2 RETURNING id',cid,did)
        if not row:raise HTTPException(404,'Không tìm thấy thẻ')
        return {'ok':True}

    @app.get('/api/courses')
    async def courses(current=Depends(user),connection=Depends(db)):
        rows=await connection.fetch('SELECT lesson_id,completed FROM course_work WHERE user_id=$1',current['id'])
        completed={r['lesson_id'] for r in rows if r['completed']}
        return [{**c,'lessons':[{**public_lesson(l),'completed':l['id'] in completed} for l in c['lessons']]} for c in CATALOG]

    @app.get('/api/courses/lessons/{lid}/work')
    async def get_work(lid:str,current=Depends(user),connection=Depends(db)):
        get_lesson(lid)
        row=await connection.fetchrow('SELECT draft,answers,completed,updated_at FROM course_work WHERE user_id=$1 AND lesson_id=$2',current['id'],lid)
        if not row:return {'draft':'','answers':[],'completed':False}
        return {**dict(row),'answers':json.loads(row['answers'])}

    @app.put('/api/courses/lessons/{lid}/work')
    async def save_work(lid:str,body:Work,current=Depends(user),connection=Depends(db)):
        lesson=get_lesson(lid)
        if lesson['questions']:
            review(lesson,body.answers)
            if body.completed and any(a<0 for a in body.answers):raise HTTPException(422,'Hãy trả lời đủ câu hỏi trước khi hoàn thành')
        elif body.completed and len(body.draft.strip())<10:
            raise HTTPException(422,'Hãy nhập bài làm hoặc bản chép lời trước khi đánh dấu hoàn thành')
        await connection.execute('''INSERT INTO course_work(user_id,lesson_id,draft,answers,completed) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(user_id,lesson_id) DO UPDATE SET draft=excluded.draft,answers=excluded.answers,completed=excluded.completed,updated_at=now()''',current['id'],lid,body.draft,json.dumps(body.answers),body.completed)
        return {'ok':True}

    @app.post('/api/courses/lessons/{lid}/review')
    async def review_work(lid:str,body:Answers,current=Depends(user)):
        return review(get_lesson(lid),body.answers)

    @app.get('/api/feedback')
    async def feedback(current=Depends(user),connection=Depends(db)):
        return [dict(r) for r in await connection.fetch('SELECT id,category,message,created_at FROM app_feedback WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',current['id'])]

    @app.post('/api/feedback')
    async def send_feedback(body:Suggestion,current=Depends(user),connection=Depends(db)):
        async with connection.transaction():
            await connection.execute('SELECT id FROM users WHERE id=$1 FOR UPDATE',current['id'])
            count=await connection.fetchval("SELECT count(*) FROM app_feedback WHERE user_id=$1 AND created_at>now()-interval '1 day'",current['id'])
            if count>=20:raise HTTPException(429,'Bạn đã gửi 20 góp ý trong 24 giờ. Hãy quay lại sau.')
            fid=uuid.uuid4()
            await connection.execute('INSERT INTO app_feedback(id,user_id,category,message) VALUES($1,$2,$3,$4)',fid,current['id'],body.category,body.message)
        return {'id':fid,'message':'Đã lưu góp ý. Cảm ơn bạn đã giúp cải thiện ứng dụng.'}

    @app.get('/api/ai/status')
    async def ai_status(current=Depends(user),connection=Depends(db)):
        used=await connection.fetchval('SELECT calls FROM ai_usage WHERE user_id=$1 AND day=CURRENT_DATE',current['id']) or 0
        return {**ai_service.capabilities(),'used':used}

    @app.get('/api/ai/history')
    async def ai_history(action:str='',current=Depends(user),connection=Depends(db)):
        if action and action not in STORED_ACTIONS:raise HTTPException(422,'Loại kết quả không hợp lệ')
        rows=await connection.fetch('SELECT id,action,lesson_id,result,created_at FROM ai_results WHERE user_id=$1 AND action=ANY($2::text[]) ORDER BY created_at DESC LIMIT 30',current['id'],[action] if action else FEEDBACK_ACTIONS)
        return [{**dict(r),'result':json.loads(r['result'])} for r in rows]

    async def spend(connection,uid):
        """Count one AI call for today; atomic, so parallel requests cannot pass the daily limit."""
        limit=ai_service.capabilities()['daily_limit']
        used=await connection.fetchval('''INSERT INTO ai_usage(user_id,day,calls) SELECT $1,CURRENT_DATE,1 WHERE $2>0
          ON CONFLICT(user_id,day) DO UPDATE SET calls=ai_usage.calls+1 WHERE ai_usage.calls<$2 RETURNING calls''',uid,limit)
        if used is None:raise HTTPException(429,'Đã hết lượt AI hôm nay. Bạn vẫn có thể học bài và ôn flashcard.')

    async def guarded(task):
        """Hard deadline for one provider call; malformed provider data never reaches the learner."""
        try:
            async with asyncio.timeout(80):return await task
        except TimeoutError:raise HTTPException(504,'AI xử lý quá lâu. Hãy thử lại với đoạn ngắn hơn.')
        except (ValueError,KeyError,TypeError,IndexError):raise HTTPException(502,'Nhà cung cấp AI trả về dữ liệu chưa hợp lệ. Hãy thử lại sau.')

    async def save_result(connection,uid,action,reference,result):
        rid=uuid.uuid4()
        await connection.execute('INSERT INTO ai_results(id,user_id,action,lesson_id,result) VALUES($1,$2,$3,$4,$5)',rid,uid,action,reference,json.dumps(result,ensure_ascii=False))
        result['id']=str(rid)
        return result

    @app.post('/api/ai')
    async def ai(body:ai_service.AIRequest,current=Depends(user),connection=Depends(db)):
        ai_service.settings() # Fail before consuming quota when no key exists.
        if body.action=='speech' and (not body.text.strip() or len(body.text)>2000):raise HTTPException(422,'Nội dung đọc cần từ 1 đến 2000 ký tự')
        if body.audio_base64:
            if body.action!='speaking' or not ai_service.capabilities()['audio']:raise HTTPException(422,'API đang chọn không hỗ trợ ghi âm; hãy nhập bản chép lời.')
            ai_service.decode_audio(body.audio_base64,body.mime)
        elif not body.text.strip():raise HTTPException(422,'Hãy nhập bài làm trước khi gửi')
        if body.action=='cards' and not 2<=len(body.text.strip())<=200:raise HTTPException(422,'Mô tả chủ đề cần từ 2 đến 200 ký tự')
        context={}
        if body.lesson_id:
            lesson=get_lesson(body.lesson_id)
            if body.action in {'writing','speaking'} and body.action!=lesson['skill']:raise HTTPException(422,'Kỹ năng không khớp với bài học')
            context={k:lesson.get(k) for k in ['id','skill','course_id','instructions']}
        if body.action=='roadmap':
            rows=await connection.fetch('SELECT lesson_id,answers,completed FROM course_work WHERE user_id=$1',current['id'])
            context['completed_lessons']=[r['lesson_id'] for r in rows if r['completed']]
            context['objective_results']=[{'lesson_id':r['lesson_id'],**review(LESSONS[r['lesson_id']],json.loads(r['answers']))} for r in rows if r['completed'] and r['lesson_id'] in LESSONS and LESSONS[r['lesson_id']]['questions']]
            context['available_courses']=[{'id':c['id'],'name':c['name'],'lessons':[l['id'] for l in c['lessons']]} for c in CATALOG]
        await spend(connection,current['id'])
        result=await guarded(ai_service.run(body,context))
        # Audio bytes stay in browser/provider memory, never in results or application logs.
        # Generated cards are a draft the learner reviews, then saves into a deck.
        if body.action not in {'speech','cards'}:await save_result(connection,current['id'],body.action,body.lesson_id,result)
        return result

    # --- Role-play: the browser keeps the conversation, the server only trusts scene IDs. ---
    def scene(body):
        """(brief for the model, public summary to store). Library scenes come from the server; a custom one is learner data."""
        if body.scenario_id=='custom':
            note=body.custom.strip()
            if len(note)<5:raise HTTPException(422,'Hãy mô tả tình huống bằng ít nhất 5 ký tự')
            return {'learner_description':note,'level':body.level,'goals':[]},{'id':'custom','title':note,'goals':[]}
        item=SCENARIOS.get(body.scenario_id)
        if not item:raise HTTPException(404,'Không tìm thấy tình huống')
        return {'scene':item['scene'],'level':item['level'],'goals':item['goals_en']},{'id':item['id'],'title':item['title'],'goals':item['goals']}

    @app.get('/api/ai/scenarios')
    async def scenarios(current=Depends(user)):
        return [public_scenario(item) for item in SCENARIOS.values()]

    @app.post('/api/ai/roleplay')
    async def roleplay(body:ai_service.RoleplayBody,current=Depends(user),connection=Depends(db)):
        ai_service.settings()
        said=body.text.strip()
        if not said:raise HTTPException(422,'Hãy nhập hoặc nói câu trả lời trước khi gửi')
        brief,_=scene(body)
        if sum(item.role=='user' for item in body.messages)>=ai_service.MAX_TURNS:
            raise HTTPException(422,'Cuộc hội thoại đã đủ dài. Hãy kết thúc để nhận nhận xét.')
        await spend(connection,current['id'])
        return await guarded(ai_service.roleplay_turn(brief,[item.model_dump() for item in body.messages],said))

    @app.post('/api/ai/roleplay/report')
    async def roleplay_report(body:ai_service.RoleplayBody,current=Depends(user),connection=Depends(db)):
        ai_service.settings()
        brief,summary=scene(body)
        history=[item.model_dump() for item in body.messages]
        if sum(item['role']=='user' for item in history)<2:raise HTTPException(422,'Hãy trò chuyện ít nhất 2 lượt trước khi nhận nhận xét')
        await spend(connection,current['id'])
        result=await guarded(ai_service.roleplay_report(brief,history))
        return await save_result(connection,current['id'],'roleplay',body.scenario_id,{**result,'scenario':summary,'messages':history})

    # --- AI practice sets, graded on the server like quizzes. ---
    @app.post('/api/ai/exercises')
    async def create_exercises(body:ExerciseBody,current=Depends(user),connection=Depends(db)):
        ai_service.settings()
        uid=current['id'];rows=[];request=''
        if body.focus=='custom':
            request=body.text.strip()
            if len(request)<2:raise HTTPException(422,'Mô tả nội dung muốn luyện cần từ 2 đến 200 ký tự')
            focus=request
        elif body.focus=='topic':
            topic=await connection.fetchrow('SELECT id,name FROM topics WHERE id=$1',body.topic)
            if not topic:raise HTTPException(404,'Không tìm thấy chủ đề')
            rows=await connection.fetch('SELECT english,vietnamese FROM phrases WHERE topic_id=$1 ORDER BY random() LIMIT 10',body.topic)
            focus='Chủ đề: '+topic['name']
        elif body.focus=='mistakes':
            attempts=await connection.fetch(RECENT_QUIZZES,uid)
            ids=latest_mistake_ids([{'questions':json.loads(r['questions']),'answers':json.loads(r['answers'])} for r in attempts])[:10]
            if ids:rows=await connection.fetch('SELECT english,vietnamese FROM phrases WHERE id=ANY($1::text[])',ids)
            if not rows:raise HTTPException(422,'Bạn chưa có câu sai nào trong các bài quiz gần đây. Hãy chọn một chủ đề hoặc tự mô tả nội dung muốn luyện.')
            focus='Câu bạn hay sai'
        else:
            rows=await connection.fetch('''SELECT p.english,p.vietnamese FROM flashcards f JOIN phrases p ON p.id=f.phrase_id
              WHERE f.user_id=$1 AND f.mastered ORDER BY coalesce(f.due_at,now()),random() LIMIT 10''',uid)
            if not rows:raise HTTPException(422,'Bạn chưa đánh dấu câu nào là đã thuộc. Hãy chọn một chủ đề hoặc tự mô tả nội dung muốn luyện.')
            focus='Ôn câu đã thuộc'
        await spend(connection,uid)
        made=await guarded(ai_service.make_exercises([dict(r) for r in rows],request,body.level,body.count))
        eid=uuid.uuid4()
        await connection.execute('INSERT INTO ai_exercises(id,user_id,title,focus,level,questions) VALUES($1,$2,$3,$4,$5,$6)',eid,uid,made['title'],focus,body.level,json.dumps(made['questions'],ensure_ascii=False))
        return exercise_view(eid,made['title'],made['questions'])

    @app.get('/api/ai/exercises')
    async def list_exercises(current=Depends(user),connection=Depends(db)):
        return [dict(r) for r in await connection.fetch('''SELECT id,title,focus,level,score,jsonb_array_length(questions) AS total,created_at,submitted_at
          FROM ai_exercises WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20''',current['id'])]

    @app.get('/api/ai/exercises/{eid}')
    async def get_exercises(eid:uuid.UUID,current=Depends(user),connection=Depends(db)):
        row=await connection.fetchrow('SELECT * FROM ai_exercises WHERE id=$1 AND user_id=$2',eid,current['id'])
        if not row:raise HTTPException(404,'Không tìm thấy bài tập')
        return exercise_view(row['id'],row['title'],json.loads(row['questions']),json.loads(row['answers']) if row['answers'] else None,row['score'],row['submitted_at'])

    @app.post('/api/ai/exercises/{eid}/submit')
    async def submit_exercises(eid:uuid.UUID,body:ExerciseAnswers,current=Depends(user),connection=Depends(db)):
        async with connection.transaction():
            row=await connection.fetchrow('SELECT * FROM ai_exercises WHERE id=$1 AND user_id=$2 FOR UPDATE',eid,current['id'])
            if not row:raise HTTPException(404,'Không tìm thấy bài tập')
            questions=json.loads(row['questions'])
            if row['submitted_at']:
                # A repeated click returns the saved result; answers can no longer change.
                if json.loads(row['answers'])!=body.answers:raise HTTPException(409,'Bài đã nộp không thể thay đổi đáp án')
                return grade_exercises(questions,body.answers)
            try:result=grade_exercises(questions,body.answers)
            except ValueError as exc:raise HTTPException(422,str(exc))
            await connection.execute('UPDATE ai_exercises SET answers=$2,score=$3,submitted_at=now() WHERE id=$1',eid,json.dumps(body.answers,ensure_ascii=False),result['score'])
        return result

    # --- One shared explanation per course phrase: generated once, then free for everyone. ---
    @app.post('/api/ai/explain/{pid}')
    async def explain(pid:str,current=Depends(user),connection=Depends(db)):
        row=await connection.fetchrow('SELECT p.english,p.vietnamese,t.name AS topic FROM phrases p JOIN topics t ON t.id=p.topic_id WHERE p.id=$1',pid)
        if not row:raise HTTPException(404,'Không tìm thấy câu')
        digest=hashlib.sha256((row['english']+'\0'+row['vietnamese']).encode()).hexdigest()
        cached=await connection.fetchval('SELECT result FROM ai_explanations WHERE phrase_id=$1 AND source_hash=$2',pid,digest)
        if cached:return {'explanation':json.loads(cached),'cached':True}
        ai_service.settings()
        await spend(connection,current['id'])
        # Only seeded course text reaches the prompt, so a learner cannot shape the shared answer.
        made=await guarded(ai_service.explain_phrase(row['english'],row['vietnamese'],row['topic']))
        await connection.execute('''INSERT INTO ai_explanations(phrase_id,source_hash,result,model) VALUES($1,$2,$3,$4)
          ON CONFLICT(phrase_id) DO UPDATE SET source_hash=excluded.source_hash,result=excluded.result,model=excluded.model,created_at=now()''',pid,digest,json.dumps(made['explanation'],ensure_ascii=False),made['model'])
        return {'explanation':made['explanation'],'cached':False}

    # --- Study insights are computed from the learner's own results; the AI only turns them into a plan. ---
    async def study_insights(connection,uid):
        attempts=[{'questions':json.loads(r['questions']),'answers':json.loads(r['answers'])} for r in await connection.fetch(RECENT_QUIZZES,uid)]
        ids=list({question['phrase_id'] for attempt in attempts for question in attempt['questions']})
        located=await connection.fetch('SELECT id,topic_id FROM phrases WHERE id=ANY($1::text[])',ids) if ids else []
        stats=quiz_insights(attempts,{r['id']:r['topic_id'] for r in located})
        topics=await connection.fetch('''SELECT t.id,t.name,count(p.id)::int AS total,count(p.id) FILTER(WHERE c.mastered)::int AS mastered
          FROM topics t LEFT JOIN phrases p ON p.topic_id=t.id
          LEFT JOIN flashcards c ON c.phrase_id=p.id AND c.user_id=$1 GROUP BY t.id ORDER BY t.id''',uid)
        totals=await connection.fetchrow('''SELECT
          (SELECT count(*) FROM flashcards WHERE user_id=$1 AND mastered AND coalesce(due_at,now())<=now())::int AS due,
          (SELECT count(*) FROM course_work WHERE user_id=$1 AND completed)::int AS lessons,
          (SELECT count(*) FROM ai_exercises WHERE user_id=$1 AND submitted_at IS NOT NULL)::int AS sets,
          (SELECT coalesce(sum(score),0) FROM ai_exercises WHERE user_id=$1 AND submitted_at IS NOT NULL)::int AS correct,
          (SELECT coalesce(sum(jsonb_array_length(questions)),0) FROM ai_exercises WHERE user_id=$1 AND submitted_at IS NOT NULL)::int AS answered''',uid)
        names={r['id']:r['name'] for r in topics}
        percent=lambda correct,answered:round(100*correct/answered) if answered else None
        rows=[{'id':r['id'],'name':r['name'],'total':r['total'],'mastered':r['mastered'],**stats['topics'].get(r['id'],{'answered':0,'correct':0})} for r in topics]
        for row in rows:row['accuracy']=percent(row['correct'],row['answered'])
        # Weakest practised topics first, then the topics without quiz answers yet.
        practised=sorted((row for row in rows if row['answered']),key=lambda row:(row['accuracy'],-row['answered']))
        mastered=sum(row['mastered'] for row in rows)
        return {'quizzes':len(attempts),'answered':stats['answered'],'accuracy':percent(stats['correct'],stats['answered']),
                'mastered':mastered,'total':sum(row['total'] for row in rows),'due':totals['due'],'lessons':totals['lessons'],
                'exercises':{'sets':totals['sets'],'accuracy':percent(totals['correct'],totals['answered'])},
                'topics':practised+[row for row in rows if not row['answered']],'weak_topics':[row['id'] for row in practised if row['answered']>=3 and row['accuracy']<80][:3],
                'missed':[{**item,'topic':names.get(item['topic_id'],'')} for item in stats['missed'][:8]],
                'enough':stats['answered']>=5 or mastered>=5 or totals['lessons']>0 or totals['sets']>0}

    @app.get('/api/ai/insights')
    async def ai_insights(current=Depends(user),connection=Depends(db)):
        return await study_insights(connection,current['id'])

    @app.post('/api/ai/coach')
    async def coach(body:CoachBody,current=Depends(user),connection=Depends(db)):
        ai_service.settings()
        uid=current['id'];data=await study_insights(connection,uid)
        if not data['enough']:raise HTTPException(422,'Chưa đủ dữ liệu học để phân tích. Hãy làm một bài quiz hoặc đánh dấu vài câu đã thuộc trước nhé.')
        practice=await connection.fetch('''SELECT action,coalesce(result->'feedback'->>'score',result->'report'->>'score') AS score FROM ai_results
          WHERE user_id=$1 AND action=ANY($2::text[]) ORDER BY created_at DESC LIMIT 8''',uid,['writing','speaking','roleplay'])
        profile={key:data[key] for key in ('quizzes','answered','accuracy','mastered','total','due','lessons','exercises')}
        profile['topics']=[{key:row[key] for key in ('id','name','answered','accuracy','mastered','total')} for row in data['topics']]
        profile['missed_phrases']=[{key:item[key] for key in ('english','vietnamese','wrong','topic')} for item in data['missed']]
        profile['ai_practice']=[{'type':r['action'],'score':float(r['score'])} for r in practice if r['score'] is not None]
        await spend(connection,uid)
        result=await guarded(ai_service.coach_plan(profile,body.goal.strip(),body.minutes,data['weak_topics']))
        return await save_result(connection,uid,'coach','',{**result,'insights':data})
