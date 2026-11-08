"""Unit tests run without PostgreSQL; integration requires a disposable TEST_DATABASE_URL."""
import importlib.util, json, os, subprocess, sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"backend"))
os.environ["APP_ORIGIN"]="http://localhost:3000"
os.environ["COOKIE_SECURE"]="false"
from app.main import app,hash_password,verify_password
spec=importlib.util.spec_from_file_location("manage", ROOT/"database/manage.py")
manage=importlib.util.module_from_spec(spec);spec.loader.exec_module(manage)

def test_password_hash():
    a=hash_password("strong-password")
    assert a!=hash_password("strong-password")
    assert verify_password("strong-password",a)
    assert not verify_password("wrong-password",a)

def test_sample():
    payload=json.loads((ROOT/"database/sample.vi-en.json").read_text())
    assert sum(len(t["phrases"]) for t in manage.normalize(payload))==120

def test_upstream_requires_reviewed_vietnamese():
    payload={"schema_version":1,"languages":{"en-GB":[{"id":"hello","situation":"Hello","phrases":[{"text":"Hello","context":"Greeting"}]}]}}
    with pytest.raises(ValueError,match="Vietnamese"): manage.normalize(payload)
    payload["languages"]["en-GB"][0]["phrases"][0]["translations"]={"vi":"Xin chào"}
    assert manage.normalize(payload)[0]["phrases"][0]["vietnamese"]=="Xin chào"

def test_invalid_input_is_rejected_before_seed():
    with pytest.raises(ValueError): manage.normalize({"schema_version":2,"topics":[]})
    with pytest.raises(ValueError): manage.normalize({"schema_version":1,"topics":[{"id":"x","name":"X","description":"X","phrases":[{"english":"Hello","vietnamese":""}]}]})

@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"),reason="No disposable PostgreSQL configured")
def test_real_database_restart_and_account_isolation():
    # Caller must supply a NEW disposable database. Never point at production.
    import asyncio,asyncpg
    dsn=os.environ["TEST_DATABASE_URL"];os.environ["DATABASE_URL"]=dsn
    async def assert_empty():
        c=await asyncpg.connect(dsn)
        try: assert not await c.fetchval("SELECT to_regclass('public.users')"),"Use an empty disposable test DB"
        finally: await c.close()
    asyncio.run(assert_empty())
    env={**os.environ,"DATABASE_URL":dsn}
    for command in ["migrate","migrate","seed","seed"]:
        subprocess.run([sys.executable,str(ROOT/"database/manage.py"),command],env=env,check=True)
    headers={"Origin":"http://localhost:3000"}
    with TestClient(app,headers=headers) as client:
        assert client.get('/health').status_code==200
        assert client.get('/api/phrases').status_code==401
        creds={"email":"first@example.com","password":"strong-password"}
        assert client.post('/api/auth/register',json=creds).status_code==200
        cookies=dict(client.cookies)
        assert client.post('/api/auth/login',json={**creds,"password":"wrong-password"}).status_code==401
        assert client.post('/api/auth/login',json=creds).status_code==200
        cookies=dict(client.cookies)
        assert len(client.get('/api/topics').json())==20
        lesson_list=client.get('/api/lessons').json()
        assert len(lesson_list)==20 and sum(t['total'] for t in lesson_list)==120
        assert all(t['mastered']==0 for t in lesson_list)
        greeting=client.get('/api/lessons/greetings').json()
        assert greeting['total']==6 and len(greeting['phrases'])==6
        assert client.get('/api/lessons/unknown-topic').status_code==404
        assert client.get('/api/lessons/greetings?offset=-1').status_code==422
        assert len(client.get('/api/phrases').json())==120
        first=client.get('/api/phrases',params={"limit":7,"offset":0}).json()
        second=client.get('/api/phrases',params={"limit":7,"offset":7}).json()
        assert len(first)==len(second)==7
        assert not ({p['id'] for p in first}&{p['id'] for p in second})
        assert client.get('/api/phrases',params={"limit":201}).status_code==422
        for q in ["Hello","Xin chào"]:
            assert client.get('/api/phrases',params={"q":q}).json()
        assert not client.get('/api/phrases',params={"q":"%"}).json()
        phrase=client.get('/api/phrases').json()[0]
        pid=phrase['id']
        assert client.put('/api/favorites/'+pid,json={"value":True}).status_code==200
        assert client.put('/api/flashcards/'+pid,json={"value":True}).status_code==200
        quiz=client.post('/api/quizzes',json={"topic":"greetings"}).json()
        assert all('correct' not in q for q in quiz['questions'])
        assert client.get('/api/quizzes/'+quiz['id']).json()['result'] is None
        draft_url='/api/quizzes/'+quiz['id']+'/draft'
        assert client.put(draft_url,json={"answers":['']*5}).status_code==200
        assert client.put(draft_url,json={"answers":['injected']*5}).status_code==422
        lookup={p['english']:p['vietnamese'] for p in client.get('/api/phrases').json()}
        answers=[lookup[q['english']] for q in quiz['questions']]
        url='/api/quizzes/'+quiz['id']+'/submit'
        assert client.post(url,json={"answers":answers}).json()['score']==5
        assert client.post(url,json={"answers":answers}).json()['score']==5
        changed=list(answers)
        changed[0]=next(v for v in quiz['questions'][0]['options'] if v!=answers[0])
        assert client.post(url,json={"answers":changed}).status_code==409
        detail=client.get('/api/quizzes/'+quiz['id']).json()
        assert detail['result']['score']==5 and detail['answers']==answers
        assert client.put(draft_url,json={"answers":answers}).status_code==409
        pending=client.post('/api/quizzes',json={"topic":"food"}).json()
        partial=[pending['questions'][0]['options'][0]]+['']*4
        assert client.put('/api/quizzes/'+pending['id']+'/draft',json={"answers":partial}).status_code==200
        # New personal decks, learning drafts and feedback survive reseeding/restart.
        deck=client.post('/api/decks',json={'name':'My words'}).json()
        deck_path='/api/decks/'+deck['id']
        card=client.post(deck_path+'/cards',json={'english':'reliable','vietnamese':'đáng tin cậy','example':'The service is reliable.'}).json()
        assert client.put(deck_path,json={'name':'Work words'}).status_code==200
        assert client.put(deck_path+'/cards/'+card['id'],json={'english':'reliable','vietnamese':'đáng tin cậy','example':'','mastered':True}).status_code==200
        work_path='/api/courses/lessons/ielts-listening/work'
        assert client.put(work_path,json={'answers':[0,1,2],'completed':True}).status_code==200
        assert client.post('/api/courses/lessons/ielts-listening/review',json={'answers':[0,1,2]}).json()['score']==3
        assert client.post('/api/feedback',json={'category':'feature','message':'Please add more vocabulary games.'}).status_code==200
        assert client.post('/api/auth/logout',json={},headers={"Origin":"https://evil.example"}).status_code==403
    # New lifespan and connection pool simulate backend restart / another EC2.
    subprocess.run([sys.executable,str(ROOT/"database/manage.py"),"seed"],env=env,check=True)
    with TestClient(app,headers=headers,cookies=cookies) as second:
        assert second.get('/api/auth/me').json()['email']==creds['email']
        progress=second.get('/api/progress').json()
        assert progress['favorites']==1 and progress['mastered']==1
        assert sum(t['mastered'] for t in second.get('/api/lessons').json())==1
        assert progress['history'][0]['score']==5 and progress['total']==120
        assert progress['quiz_count']==1
        assert sum(t['mastered'] for t in progress['topics'])==1
        restored=second.get('/api/quizzes/active',params={"topic":"food"}).json()
        assert restored['id']==pending['id'] and restored['answers']==partial
        assert all('correct' not in q for q in restored['questions'])
        wrong_quiz=second.post('/api/quizzes',json={"topic":"greetings"}).json()
        wrong_answers=[lookup[q['english']] for q in wrong_quiz['questions']]
        wrong_answers[0]=next(v for v in wrong_quiz['questions'][0]['options'] if v!=wrong_answers[0])
        assert second.post('/api/quizzes/'+wrong_quiz['id']+'/submit',json={"answers":wrong_answers}).json()['score']==4
        mistakes=second.get('/api/phrases',params={"mistakes":"true"}).json()
        assert [p['id'] for p in mistakes]==[wrong_quiz['questions'][0]['phrase_id']]
        assert second.get('/api/decks').json()[0]['name']=='Work words'
        assert second.get(deck_path+'/cards').json()[0]['mastered'] is True
        assert second.get(work_path).json()['answers']==[0,1,2]
        assert len(second.get('/api/feedback').json())==1
        second.cookies.clear()
        assert second.post('/api/auth/register',json={"email":"second@example.com","password":"strong-password"}).status_code==200
        progress=second.get('/api/progress').json()
        assert progress['favorites']==0 and progress['mastered']==0 and not progress['history']
        assert second.post(url,json={"answers":answers}).status_code==404
        assert second.get('/api/quizzes/'+quiz['id']).status_code==404
        assert second.get('/api/quizzes/active').json() is None
        assert second.get('/api/phrases',params={"mistakes":"true"}).json()==[]
        assert second.put('/api/quizzes/'+pending['id']+'/draft',json={"answers":partial}).status_code==404
        assert second.get('/api/decks').json()==[]
        assert second.get('/api/feedback').json()==[]
        assert second.get(work_path).json()['completed'] is False
        assert second.get(deck_path+'/cards').status_code==404
        assert second.put(deck_path,json={'name':'Stolen'}).status_code==404
        assert second.request('DELETE',deck_path,json={}).status_code==404
        assert second.request('DELETE',deck_path+'/cards/'+card['id'],json={}).status_code==404
        own_deck=second.post('/api/decks',json={'name':'Disposable'}).json()
        own_path='/api/decks/'+own_deck['id']
        own_card=second.post(own_path+'/cards',json={'english':'hello','vietnamese':'xin chào'}).json()
        assert second.request('DELETE',own_path+'/cards/'+own_card['id'],json={}).status_code==200
        assert second.get(own_path+'/cards').json()==[]
        assert second.request('DELETE',own_path,json={}).status_code==200
        assert second.post('/api/auth/logout',json={}).status_code==200
        assert second.get('/api/auth/me').status_code==401
