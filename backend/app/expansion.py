import asyncio,json,os,uuid
from typing import Literal
from fastapi import Depends,HTTPException,Request
from pydantic import BaseModel,Field,field_validator
from .courses import CATALOG,LESSONS,get_lesson,public_lesson,review
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
    async def ai_history(current=Depends(user),connection=Depends(db)):
        return [{**dict(r),'result':json.loads(r['result'])} for r in await connection.fetch('SELECT id,action,lesson_id,result,created_at FROM ai_results WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',current['id'])]

    @app.post('/api/ai')
    async def ai(body:ai_service.AIRequest,current=Depends(user),connection=Depends(db)):
        ai_service.settings() # Fail before consuming quota when no key exists.
        if body.action=='speech' and (not body.text.strip() or len(body.text)>2000):raise HTTPException(422,'Nội dung đọc cần từ 1 đến 2000 ký tự')
        if body.audio_base64:
            if body.action!='speaking' or not ai_service.capabilities()['audio']:raise HTTPException(422,'API đang chọn không hỗ trợ ghi âm; hãy nhập bản chép lời.')
            ai_service.decode_audio(body.audio_base64,body.mime)
        elif not body.text.strip():raise HTTPException(422,'Hãy nhập bài làm trước khi gửi')
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
        limit=ai_service.capabilities()['daily_limit']
        used=await connection.fetchval('''INSERT INTO ai_usage(user_id,day,calls) SELECT $1,CURRENT_DATE,1 WHERE $2>0
          ON CONFLICT(user_id,day) DO UPDATE SET calls=ai_usage.calls+1 WHERE ai_usage.calls<$2 RETURNING calls''',current['id'],limit)
        if used is None:raise HTTPException(429,'Đã hết lượt AI hôm nay. Bạn vẫn có thể học bài và ôn flashcard.')
        try:
            async with asyncio.timeout(80):result=await ai_service.run(body,context)
        except TimeoutError:raise HTTPException(504,'AI xử lý quá lâu. Hãy thử lại với đoạn ngắn hơn.')
        except (ValueError,KeyError,TypeError,IndexError):raise HTTPException(502,'Nhà cung cấp AI trả về dữ liệu chưa hợp lệ. Hãy thử lại sau.')
        # Audio bytes stay in browser/provider memory, never in results or application logs.
        if body.action!='speech':
            rid=uuid.uuid4()
            await connection.execute('INSERT INTO ai_results(id,user_id,action,lesson_id,result) VALUES($1,$2,$3,$4,$5)',rid,current['id'],body.action,body.lesson_id,json.dumps(result,ensure_ascii=False))
            result['id']=str(rid)
        return result
