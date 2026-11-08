"""Server-side OAuth code flow. No implicit linking to password accounts by email."""
import base64,hashlib,hmac,json,os,secrets,time,uuid
from urllib.parse import urlencode
import asyncpg,httpx
from fastapi import Depends,HTTPException,Request
from fastapi.responses import RedirectResponse
from .learning import hash_password
import asyncio

PROVIDERS={'google','facebook'}
COOKIE='english_oauth_state'
def config(provider):
    if provider not in PROVIDERS:raise HTTPException(404,'Nhà cung cấp không hợp lệ')
    prefix=provider.upper()
    cid=os.getenv(prefix+'_CLIENT_ID','');secret=os.getenv(prefix+'_CLIENT_SECRET','')
    signing=os.getenv('OAUTH_STATE_SECRET','')
    if not cid or not secret or len(signing)<32:raise HTTPException(503,'Đăng nhập '+provider+' chưa được cấu hình')
    version=os.getenv('FACEBOOK_API_VERSION','v23.0')
    if provider=='facebook' and not __import__('re').fullmatch(r'v\d+\.\d+',version):raise HTTPException(503,'FACEBOOK_API_VERSION không hợp lệ')
    return cid,secret,signing,version

def sign(payload,secret):
    raw=base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    return raw+'.'+hmac.new(secret.encode(),raw.encode(),hashlib.sha256).hexdigest()

def verify(value,secret,provider,state):
    try:
        raw,signature=value.split('.')
        expected=hmac.new(secret.encode(),raw.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature,expected):raise ValueError()
        payload=json.loads(base64.urlsafe_b64decode(raw+'='*(-len(raw)%4)))
        if payload['provider']!=provider or not state or not secrets.compare_digest(payload['state'],state) or not 0<=time.time()-payload['time']<=600:raise ValueError()
        return payload
    except (ValueError,KeyError,TypeError):raise HTTPException(400,'Phiên đăng nhập mạng xã hội đã hết hạn hoặc không hợp lệ')

def install(app,db,issue_session,origin,secure):
    @app.get('/api/auth/providers')
    async def providers():
        result={}
        for provider in sorted(PROVIDERS):
            try:config(provider);result[provider]=True
            except HTTPException:result[provider]=False
        return result

    @app.get('/api/auth/oauth/{provider}/start')
    async def start(provider:str):
        cid,secret,signing,version=config(provider)
        state=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48)
        callback=origin+'/api/auth/oauth/'+provider+'/callback'
        params={'client_id':cid,'redirect_uri':callback,'response_type':'code','state':state}
        if provider=='google':
            params.update(scope='openid email profile',code_challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('='),code_challenge_method='S256')
            url='https://accounts.google.com/o/oauth2/v2/auth'
        else:
            params.update(scope='email,public_profile');url='https://www.facebook.com/'+version+'/dialog/oauth'
        response=RedirectResponse(url+'?'+urlencode(params),status_code=302)
        response.set_cookie(COOKIE,sign({'provider':provider,'state':state,'verifier':verifier,'time':int(time.time())},signing),max_age=600,httponly=True,secure=secure,samesite='lax',path='/api/auth/oauth')
        return response

    @app.get('/api/auth/oauth/{provider}/callback')
    async def callback(provider:str,request:Request,connection=Depends(db)):
        response=RedirectResponse(origin+'/',status_code=303)
        response.delete_cookie(COOKIE,path='/api/auth/oauth',secure=secure,httponly=True,samesite='lax')
        try:
            cid,secret,signing,version=config(provider)
            state=verify(request.cookies.get(COOKIE,''),signing,provider,request.query_params.get('state',''))
            if request.query_params.get('error'):raise HTTPException(400,'oauth_cancelled')
            code=request.query_params.get('code','')
            if not code:raise HTTPException(400,'oauth_failed')
            redirect=origin+'/api/auth/oauth/'+provider+'/callback'
            async with httpx.AsyncClient(timeout=15,follow_redirects=False) as client:
                if provider=='google':
                    token=await client.post('https://oauth2.googleapis.com/token',data={'client_id':cid,'client_secret':secret,'code':code,'code_verifier':state['verifier'],'grant_type':'authorization_code','redirect_uri':redirect})
                    token.raise_for_status();access=token.json()['access_token']
                    info=await client.get('https://openidconnect.googleapis.com/v1/userinfo',headers={'Authorization':'Bearer '+access})
                    info.raise_for_status();profile=info.json()
                    if profile.get('email_verified') is not True:raise HTTPException(400,'oauth_unverified')
                    subject=profile['sub'];email=profile['email'].strip().lower()
                else:
                    token=await client.post('https://graph.facebook.com/'+version+'/oauth/access_token',data={'client_id':cid,'client_secret':secret,'code':code,'redirect_uri':redirect})
                    token.raise_for_status();access=token.json()['access_token']
                    proof=hmac.new(secret.encode(),access.encode(),hashlib.sha256).hexdigest()
                    info=await client.get('https://graph.facebook.com/'+version+'/me',headers={'Authorization':'Bearer '+access},params={'fields':'id,email','appsecret_proof':proof})
                    info.raise_for_status();profile=info.json();subject=profile['id']
                    # Facebook may not grant email. Identity is always the stable provider ID.
                    email=profile.get('email') or ('facebook-'+hashlib.sha256(subject.encode()).hexdigest()[:24]+'@social.invalid')
                    email=email.strip().lower()
            if not isinstance(subject,str) or not subject or len(email)>254:raise HTTPException(400,'oauth_failed')
            uid=await connection.fetchval('SELECT user_id FROM oauth_identities WHERE provider=$1 AND subject=$2',provider,subject)
            if not uid:
                password=await asyncio.to_thread(hash_password,secrets.token_urlsafe(48))
                async with connection.transaction():
                    # Avoid racing first-time callbacks from two browser sessions.
                    await connection.execute('SELECT pg_advisory_xact_lock($1)',int.from_bytes(hashlib.sha256((provider+subject).encode()).digest()[:8],'big',signed=True))
                    uid=await connection.fetchval('SELECT user_id FROM oauth_identities WHERE provider=$1 AND subject=$2',provider,subject)
                    if not uid:
                        if await connection.fetchval('SELECT id FROM users WHERE email=$1',email):raise HTTPException(409,'oauth_email_exists')
                        uid=uuid.uuid4()
                        await connection.execute('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',uid,email,password)
                        await connection.execute('INSERT INTO oauth_identities(provider,subject,user_id) VALUES($1,$2,$3)',provider,subject,uid)
            await issue_session(connection,response,uid)
        except (HTTPException,httpx.HTTPError,ValueError,KeyError,TypeError,AttributeError,asyncpg.UniqueViolationError) as exc:
            detail=exc.detail if isinstance(exc,HTTPException) else 'oauth_failed'
            allowed={'oauth_cancelled','oauth_unverified','oauth_email_exists'}
            response.headers['location']=origin+'/?auth_error='+(detail if detail in allowed else 'oauth_failed')
        return response
