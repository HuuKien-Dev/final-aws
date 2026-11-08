"""API boundaries and provider contracts without network, credentials or a running DB."""
import asyncio,base64,copy,json,os,sys,uuid,wave
from pathlib import Path
from unittest.mock import patch
import httpx,pytest
from fastapi import HTTPException

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.main import app,user,db
from app import ai_service
from app.courses import CATALOG,LESSONS,public_lesson,review
from app.expansion import CardBody,DeckBody,Suggestion
class ASGIClient:
    """Same-loop ASGI requests avoid sandbox cross-thread socket wakeups."""
    def __init__(self,app,**kwargs): self.app=app
    def request(self,method,path,**kwargs):
        async def perform():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url='http://localhost:3000') as client:
                return await client.request(method,path,**kwargs)
        return asyncio.run(perform())
    def get(self,path,**kwargs):return self.request('GET',path,**kwargs)
    def post(self,path,**kwargs):return self.request('POST',path,**kwargs)

def dependency(value):
    async def provide():return value
    return provide

UID=uuid.uuid4()
VALID={'reply':'What would you like to practise next?','summary':'Một bài luyện tốt.','score':70,'estimated_level':'A2 (ước lượng)','strengths':['Ý chính rõ.'],'improvements':[{'original':'I goes','improved':'I go','reason':'Chủ ngữ I dùng go.'}],'improved_version':'I go to work.','next_steps':['Viết ba câu với I go.'],'criteria':[{'name':'Ngữ pháp','score':70,'comment':'Kiểm tra hòa hợp chủ ngữ.'}],'roadmap':[],'limitations':'Chưa đánh giá phát âm.'}

@pytest.fixture(autouse=True)
def clean_overrides():
    old=dict(app.dependency_overrides)
    yield
    app.dependency_overrides.clear();app.dependency_overrides.update(old)

def test_curriculum_has_all_skills_answer_keys_and_real_audio():
    assert len(CATALOG)==6 and len(LESSONS)==25
    for course in CATALOG:
        assert {l['skill'] for l in course['lessons']}=={'reading','listening','speaking','writing'}
        for lesson in course['lessons']:
            public=public_lesson(lesson)
            for q in public['questions']:assert 'correct' not in q and 'explanation' not in q
            if lesson['skill']=='listening':
                assert 'text' not in public
                with wave.open(str(ROOT/'frontend/public/audio'/(lesson['id']+'.wav'))) as audio:
                    assert audio.getnframes()/audio.getframerate()>15
            if lesson['questions']:
                correct=[q['correct'] for q in lesson['questions']]
                assert review(lesson,correct)['score']==len(correct)
                assert review(lesson,[-1]*len(correct))['score']==0
                with pytest.raises(HTTPException):review(lesson,[999]*len(correct))
                with pytest.raises(HTTPException):review(lesson,[])

def test_blank_or_oversized_personal_content_is_rejected():
    for factory,payload in [(DeckBody,{'name':' '}),(CardBody,{'english':' ','vietnamese':'x'}),(CardBody,{'english':'hello','vietnamese':' '}),(Suggestion,{'category':'bug','message':' '*20}),(Suggestion,{'category':'admin','message':'a useful message'})]:
        with pytest.raises(ValueError):factory(**payload)

@pytest.mark.parametrize('route',['/api/decks','/api/decks/'+str(uuid.uuid4())+'/cards','/api/courses','/api/feedback','/api/ai/history','/api/ai/status'])
def test_private_routes_require_session(route):
    async def denied():raise HTTPException(401,'Bạn cần đăng nhập')
    app.dependency_overrides[user]=denied
    # Avoid acquiring a database even when FastAPI resolves another dependency first.
    app.dependency_overrides[db]=dependency(None)
    client=ASGIClient(app,raise_server_exceptions=False)
    assert client.get(route).status_code==401

def test_deck_owner_guard_prevents_cross_account_reads_and_mutations():
    calls=[]
    class Connection:
        async def fetchrow(self,query,*args):calls.append((query,args));return None
        async def execute(self,*args):pytest.fail('Unauthorized mutation reached database')
        async def fetch(self,*args):pytest.fail('Unauthorized card read reached database')
    app.dependency_overrides[user]=dependency({'id':UID,'email':'one@example.com'})
    app.dependency_overrides[db]=dependency(Connection())
    did=uuid.uuid4();cid=uuid.uuid4()
    client=ASGIClient(app)
    headers={'Origin':'http://localhost:3000'}
    for method,path,body in [('GET',f'/api/decks/{did}/cards',None),('PUT',f'/api/decks/{did}',{'name':'Stolen'}),('DELETE',f'/api/decks/{did}',{}),('PUT',f'/api/decks/{did}/cards/{cid}',{'english':'hi','vietnamese':'chào'}),('DELETE',f'/api/decks/{did}/cards/{cid}',{})]:
        result=client.request(method,path,headers=headers,json=body)
        assert result.status_code==404
    assert all(args==(did,UID) and 'user_id=$2' in query for query,args in calls)

def test_feedback_reads_are_scoped_to_session_account():
    class Connection:
        async def fetch(self,query,*args):assert args==(UID,) and 'WHERE user_id=$1' in query;return []
    app.dependency_overrides[user]=dependency({'id':UID})
    app.dependency_overrides[db]=dependency(Connection())
    assert ASGIClient(app).get('/api/feedback').json()==[]

def test_csrf_and_body_limit_are_enforced_before_ai_or_storage():
    client=ASGIClient(app)
    assert client.post('/api/ai',json={'action':'tutor','text':'hi'}).status_code==403
    result=client.post('/api/ai',headers={'Origin':'http://localhost:3000','Content-Type':'application/json'},content=b'x'*(6*1024*1024+1))
    assert result.status_code==413

@pytest.mark.parametrize('route',[
    '/api/auth/providers',
    '/api/auth/oauth/google/start',
    '/api/auth/oauth/facebook/start',
    '/api/auth/oauth/google/callback',
    '/api/auth/oauth/facebook/callback',
])
def test_social_login_endpoints_are_removed(route):
    assert ASGIClient(app).get(route).status_code==404

def test_audio_validation_and_single_provider_capability(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER','deepseek');monkeypatch.setenv('AI_API_KEY','test-key');monkeypatch.setenv('AI_AUDIO_ENABLED','true')
    assert ai_service.capabilities()['audio'] is False
    for encoded,mime in [('not-base64','audio/webm'),(base64.b64encode(b'a').decode(),'text/html'),('','audio/wav')]:
        with pytest.raises(HTTPException):ai_service.decode_audio(encoded,mime)

@pytest.mark.parametrize('provider',['openai','deepseek','compatible','colab','gemini','anthropic'])
def test_provider_adapters_use_only_the_selected_endpoint_and_validate_output(monkeypatch,provider):
    calls=[]
    monkeypatch.setenv('AI_PROVIDER',provider);monkeypatch.setenv('AI_API_KEY','test-secret');monkeypatch.setenv('AI_BASE_URL','https://selected-provider.example/v1');monkeypatch.setenv('AI_MODEL','selected-model')
    def handler(request):
        assert request.url.host=='selected-provider.example'
        body=json.loads(request.content);calls.append((request,body))
        if provider=='openai':return httpx.Response(200,json={'status':'completed','output':[{'content':[{'type':'output_text','text':json.dumps(VALID)}]}]})
        if provider=='gemini':return httpx.Response(200,json={'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(VALID)}]}}]})
        if provider=='anthropic':
            sent=json.dumps(body['output_config']['format']['schema'])
            assert '"minimum"' not in sent and '"maximum"' not in sent
            return httpx.Response(200,json={'stop_reason':'end_turn','content':[{'type':'text','text':json.dumps(VALID)}]})
        return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(VALID)}}]})
    real=httpx.AsyncClient
    with patch.object(ai_service.httpx,'AsyncClient',side_effect=lambda **kwargs:real(transport=httpx.MockTransport(handler),**kwargs)):
        result=asyncio.run(ai_service.run(ai_service.AIRequest(action='writing',text='I goes to work.'),{}))
    assert len(calls)==1 and result['feedback']['improved_version']=='I go to work.' and result['provider']==provider
    assert 'test-secret' not in json.dumps(result)

def test_bad_provider_json_never_becomes_a_fake_grade(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER','deepseek');monkeypatch.setenv('AI_API_KEY','test');monkeypatch.delenv('AI_BASE_URL',raising=False)
    real=httpx.AsyncClient
    def handler(request):return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'{"score":100}'}}]})
    with patch.object(ai_service.httpx,'AsyncClient',side_effect=lambda **kwargs:real(transport=httpx.MockTransport(handler),**kwargs)):
        with pytest.raises(HTTPException) as err:asyncio.run(ai_service.run(ai_service.AIRequest(action='writing',text='test essay'),{}))
    assert err.value.status_code==502

def test_quota_is_atomic_and_stops_before_provider_call(monkeypatch):
    monkeypatch.setenv('AI_API_KEY','test')
    seen=[]
    class Connection:
        async def fetchval(self,query,*args):seen.append(query);return None
    app.dependency_overrides[user]=dependency({'id':UID})
    app.dependency_overrides[db]=dependency(Connection())
    async def forbidden(*args):pytest.fail('Over-quota call reached provider')
    monkeypatch.setattr(ai_service,'run',forbidden)
    response=ASGIClient(app).post('/api/ai',headers={'Origin':'http://localhost:3000'},json={'action':'tutor','text':'Hello'})
    assert response.status_code==429
    assert len(seen)==1 and 'ON CONFLICT' in seen[0] and 'ai_usage.calls<$2' in seen[0]

def test_s3_images_use_only_configured_private_bucket_and_key(monkeypatch):
    import io
    from app import picture_assets
    monkeypatch.setenv('PICTURE_ASSET_STORAGE','s3');monkeypatch.setenv('S3_IMAGE_BUCKET','private-images');monkeypatch.setenv('S3_IMAGE_PREFIX','media/release-one')
    calls=[];stream=io.BytesIO(b'image-data')
    class Client:
        def get_object(self,**kwargs):calls.append(kwargs);return {'ContentLength':10,'Body':stream}
    monkeypatch.setattr(picture_assets,'s3_client',lambda:Client())
    assert picture_assets.read_asset('leaf.jpg')==b'image-data'
    assert calls==[{'Bucket':'private-images','Key':'media/release-one/leaf.jpg'}]
    assert stream.closed
    with pytest.raises(HTTPException) as err:picture_assets.read_asset('../backend.env')
    assert err.value.status_code==404 and len(calls)==1

def test_s3_mode_never_silently_uses_local_images(monkeypatch):
    from app import picture_assets
    monkeypatch.setenv('PICTURE_ASSET_STORAGE','s3');monkeypatch.delenv('S3_IMAGE_BUCKET',raising=False)
    with pytest.raises(HTTPException) as err:picture_assets.read_asset('logo.png')
    assert err.value.status_code==503

def test_all_logos_read_through_backend_in_local_mode(monkeypatch):
    from app import picture_assets
    monkeypatch.setenv('PICTURE_ASSET_STORAGE','local')
    for name in ['logo.png','docs-logo.png','logo_large.png','green-mascot.png']:
        assert picture_assets.read_asset(name).startswith(b'\x89PNG')
