import asyncio, hashlib, json, os, secrets, uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import asyncpg
from fastapi import FastAPI, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from .learning import (DUMMY_PASSWORD_HASH, hash_password, verify_password,
                       build_questions, public_questions, validate_answers, grade_answers, quiz_view, replay_submission, latest_mistake_ids)

COOKIE = "english_session"
SECURE = os.getenv("COOKIE_SECURE", "true").lower() == "true"
ORIGIN = os.getenv("APP_ORIGIN", "http://localhost:3000").rstrip("/")

@asynccontextmanager
async def lifespan(app):
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("Thiếu DATABASE_URL. Nạp backend/.env trước khi chạy FastAPI.")
    app.state.pool = await asyncpg.create_pool(dsn, min_size=1,max_size=10,command_timeout=15)
    try:
        yield
    finally:
        await app.state.pool.close()

app = FastAPI(title="Tiếng Anh mỗi ngày", lifespan=lifespan)

@app.middleware("http")
async def protect(request: Request, call_next):
    if request.method in {"POST","PUT","DELETE","PATCH"}:
        if request.headers.get("origin") != ORIGIN:
            return Response(content='{"detail":"Nguồn yêu cầu không hợp lệ"}',status_code=403,media_type="application/json")
        if "application/json" not in request.headers.get("content-type", ""):
            return Response(status_code=415)
    if request.method in {"POST","PUT","PATCH"}:
        chunks=[];size=0
        async for chunk in request.stream():
            size+=len(chunk)
            if size>6*1024*1024:
                return Response(content='{"detail":"Yêu cầu quá lớn; giới hạn 6 MB"}',status_code=413,media_type="application/json")
            chunks.append(chunk)
        request._body=b"".join(chunks)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response

async def db(request: Request):
    try:
        async with request.app.state.pool.acquire(timeout=5) as connection:
            yield connection
    except (asyncpg.PostgresConnectionError, asyncpg.CannotConnectNowError,
            asyncpg.TooManyConnectionsError, OSError, TimeoutError):
        raise HTTPException(503,"Kết nối dữ liệu tạm gián đoạn. Vui lòng thử lại.")

async def user(request: Request, connection=Depends(db)):
    token = request.cookies.get(COOKIE, "")
    row = await connection.fetchrow("SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()",hashlib.sha256(token.encode()).hexdigest())
    if not row: raise HTTPException(401,"Bạn cần đăng nhập")
    return dict(row)

class Credentials(BaseModel):
    email: str = Field(min_length=5,max_length=254)
    password: str = Field(min_length=10,max_length=128)

async def issue_session(connection,response,uid):
    token=secrets.token_urlsafe(32)
    await connection.execute("DELETE FROM sessions WHERE expires_at<now()")
    await connection.execute("INSERT INTO sessions VALUES($1,$2,$3)",hashlib.sha256(token.encode()).hexdigest(),uid,datetime.now(timezone.utc)+timedelta(days=7))
    response.set_cookie(COOKIE,token,max_age=604800,httponly=True,secure=SECURE,samesite="lax",path="/")

@app.get("/health")
async def health(connection=Depends(db)):
    try:
        # Validate the schema expected by this release, as well as seeded content.
        await connection.execute("SELECT topic_id FROM quizzes LIMIT 0")
        await connection.execute("SELECT lesson_id FROM course_work LIMIT 0")
        await connection.execute("SELECT id FROM vocabulary_decks LIMIT 0")
        ready=await connection.fetchval("SELECT EXISTS(SELECT 1 FROM phrases)")
    except asyncpg.PostgresError:
        raise HTTPException(503,"Database chưa sẵn sàng; kiểm tra migration.")
    if not ready:
        raise HTTPException(503,"Chưa có dữ liệu bài học; chạy seed riêng trước.")
    return {"status":"ok"}

@app.post("/api/auth/register")
async def register(body: Credentials,response: Response,connection=Depends(db)):
    email=body.email.strip().lower()
    if "@" not in email or "." not in email.rsplit("@",1)[-1]: raise HTTPException(422,"Email không hợp lệ")
    uid=uuid.uuid4(); password_hash=await asyncio.to_thread(hash_password,body.password)
    try:
        async with connection.transaction():
            await connection.execute("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",uid,email,password_hash)
            await issue_session(connection,response,uid)
    except asyncpg.UniqueViolationError: raise HTTPException(409,"Email đã được đăng ký")
    return {"email":email}

@app.post("/api/auth/login")
async def login(body: Credentials,response: Response,connection=Depends(db)):
    row=await connection.fetchrow("SELECT * FROM users WHERE email=$1",body.email.strip().lower())
    # Equal scrypt work for unknown accounts.
    encoded=row["password_hash"] if row else DUMMY_PASSWORD_HASH
    valid=await asyncio.to_thread(verify_password,body.password,encoded)
    if not row or not valid: raise HTTPException(401,"Email hoặc mật khẩu không đúng")
    await issue_session(connection,response,row["id"])
    return {"email":row["email"]}

@app.get("/api/auth/me")
async def me(current=Depends(user)): return {"email":current["email"]}

@app.post("/api/auth/logout")
async def logout(request: Request,response: Response,connection=Depends(db)):
    await connection.execute("DELETE FROM sessions WHERE token_hash=$1",hashlib.sha256(request.cookies.get(COOKIE,"").encode()).hexdigest())
    response.delete_cookie(COOKIE,path="/",secure=SECURE,httponly=True,samesite="lax")
    return {"ok":True}

@app.get("/api/topics")
async def topics(connection=Depends(db)):
    return [dict(r) for r in await connection.fetch("SELECT t.*,count(p.id)::int AS count FROM topics t LEFT JOIN phrases p ON p.topic_id=t.id GROUP BY t.id ORDER BY t.id")]

@app.get("/api/lessons")
async def lessons(current=Depends(user),connection=Depends(db)):
    rows=await connection.fetch("""SELECT t.*,count(p.id)::int AS total,
      count(p.id) FILTER(WHERE f.mastered)::int AS mastered
      FROM topics t LEFT JOIN phrases p ON p.topic_id=t.id
      LEFT JOIN flashcards f ON f.phrase_id=p.id AND f.user_id=$1
      GROUP BY t.id ORDER BY t.id""",current["id"])
    return [dict(row) for row in rows]

@app.get("/api/lessons/{topic_id}")
async def lesson(topic_id: str,offset: int=0,current=Depends(user),connection=Depends(db)):
    if offset<0 or offset>2147483647: raise HTTPException(422,"Phân trang không hợp lệ")
    topic=await connection.fetchrow("SELECT * FROM topics WHERE id=$1",topic_id)
    if not topic: raise HTTPException(404,"Không tìm thấy bài học")
    summary=await connection.fetchrow("""SELECT count(p.id)::int AS total,
      count(p.id) FILTER(WHERE f.mastered)::int AS mastered
      FROM phrases p LEFT JOIN flashcards f ON f.phrase_id=p.id AND f.user_id=$1
      WHERE p.topic_id=$2""",current["id"],topic_id)
    rows=await connection.fetch("""SELECT p.*,coalesce(f.mastered,false) AS mastered,
      (v.phrase_id IS NOT NULL) AS favorite
      FROM phrases p LEFT JOIN flashcards f ON f.phrase_id=p.id AND f.user_id=$1
      LEFT JOIN favorites v ON v.phrase_id=p.id AND v.user_id=$1
      WHERE p.topic_id=$2 ORDER BY p.english,p.id LIMIT 20 OFFSET $3""",current["id"],topic_id,offset)
    return {**dict(topic),**dict(summary),"phrases":[dict(row) for row in rows],
            "offset":offset,"has_more":offset+len(rows)<summary["total"]}

@app.get("/api/phrases")
async def phrases(q: str="",topic: str="",favorites: bool=False,mistakes: bool=False,limit: int=200,offset: int=0,current=Depends(user),connection=Depends(db)):
    if limit < 1 or limit > 200 or offset < 0:
        raise HTTPException(422,"Phân trang không hợp lệ")
    if len(q)>200: raise HTTPException(422,"Từ khóa quá dài")
    mistake_ids=[]
    if mistakes:
        attempts=await connection.fetch("SELECT questions,answers FROM quizzes WHERE user_id=$1 AND submitted_at IS NOT NULL ORDER BY submitted_at DESC,id DESC LIMIT 100",current["id"])
        mistake_ids=latest_mistake_ids([{"questions":json.loads(r["questions"]),"answers":json.loads(r["answers"])} for r in attempts])
    rows=await connection.fetch("""SELECT p.*, (f.phrase_id IS NOT NULL) AS favorite, coalesce(c.mastered,false) AS mastered
      FROM phrases p LEFT JOIN favorites f ON f.phrase_id=p.id AND f.user_id=$1
      LEFT JOIN flashcards c ON c.phrase_id=p.id AND c.user_id=$1
      WHERE ($2='' OR p.topic_id=$2) AND (strpos(lower(p.english),lower($3))>0 OR strpos(lower(p.vietnamese),lower($3))>0)
      AND (NOT $4::boolean OR f.phrase_id IS NOT NULL)
      AND (NOT $7::boolean OR p.id=ANY($8::text[])) ORDER BY p.topic_id,p.english LIMIT $5 OFFSET $6""",current["id"],topic,q,favorites,limit,offset,mistakes,mistake_ids)
    return [dict(r) for r in rows]

class Flag(BaseModel): value: bool

@app.put("/api/favorites/{pid}")
async def favorite(pid: str,body: Flag,current=Depends(user),connection=Depends(db)):
    if not await connection.fetchval("SELECT 1 FROM phrases WHERE id=$1",pid): raise HTTPException(404,"Không tìm thấy câu")
    if body.value: await connection.execute("INSERT INTO favorites VALUES($1,$2) ON CONFLICT DO NOTHING",current["id"],pid)
    else: await connection.execute("DELETE FROM favorites WHERE user_id=$1 AND phrase_id=$2",current["id"],pid)
    return {"ok":True}

@app.put("/api/flashcards/{pid}")
async def flashcard(pid: str,body: Flag,current=Depends(user),connection=Depends(db)):
    if not await connection.fetchval("SELECT 1 FROM phrases WHERE id=$1",pid): raise HTTPException(404,"Không tìm thấy câu")
    await connection.execute("INSERT INTO flashcards VALUES($1,$2,$3,now()) ON CONFLICT(user_id,phrase_id) DO UPDATE SET mastered=excluded.mastered,updated_at=now()",current["id"],pid,body.value)
    return {"ok":True}

class QuizStart(BaseModel): topic: str=""
class Submission(BaseModel): answers: list[str] = Field(max_length=10)

@app.post("/api/quizzes")
async def start_quiz(body: QuizStart,current=Depends(user),connection=Depends(db)):
    rows=await connection.fetch("SELECT * FROM phrases WHERE ($1='' OR topic_id=$1) ORDER BY random() LIMIT 5",body.topic)
    all_rows=await connection.fetch("SELECT DISTINCT vietnamese FROM phrases")
    try:
        questions=build_questions(rows,[r["vietnamese"] for r in all_rows])
    except ValueError as exc:
        raise HTTPException(409,str(exc))
    qid=uuid.uuid4()
    await connection.execute("INSERT INTO quizzes(id,user_id,questions,topic_id) VALUES($1,$2,$3,$4)",qid,current["id"],json.dumps(questions),body.topic or None)
    return {"id":str(qid),"questions":public_questions(questions),"answers":[""]*len(questions)}

@app.get("/api/quizzes/active")
async def active_quiz(topic: str="",current=Depends(user),connection=Depends(db)):
    row=await connection.fetchrow("""SELECT q.* FROM quizzes q
      WHERE q.user_id=$1 AND q.submitted_at IS NULL
      AND ($2='' OR q.topic_id=$2)
      ORDER BY q.created_at DESC LIMIT 1""",current["id"],topic)
    if not row: return None
    questions=json.loads(row["questions"])
    answers=json.loads(row["answers"]) if row["answers"] else [""]*len(questions)
    return {"id":str(row["id"]),"questions":public_questions(questions),"answers":answers}

@app.get("/api/quizzes/{qid}")
async def get_quiz(qid: uuid.UUID,current=Depends(user),connection=Depends(db)):
    row=await connection.fetchrow("SELECT * FROM quizzes WHERE id=$1 AND user_id=$2",qid,current["id"])
    if not row: raise HTTPException(404,"Không tìm thấy bài")
    return quiz_view(row["id"],json.loads(row["questions"]),
                     json.loads(row["answers"]) if row["answers"] else None,
                     row["score"],row["submitted_at"])

@app.put("/api/quizzes/{qid}/draft")
async def save_draft(qid: uuid.UUID,body: Submission,current=Depends(user),connection=Depends(db)):
    async with connection.transaction():
        row=await connection.fetchrow("SELECT * FROM quizzes WHERE id=$1 AND user_id=$2 FOR UPDATE",qid,current["id"])
        if not row: raise HTTPException(404,"Không tìm thấy bài")
        if row["submitted_at"]: raise HTTPException(409,"Bài đã được nộp")
        try:
            validate_answers(json.loads(row["questions"]),body.answers,draft=True)
        except ValueError as exc:
            raise HTTPException(422,str(exc))
        await connection.execute("UPDATE quizzes SET answers=$2 WHERE id=$1",qid,json.dumps(body.answers))
    return {"ok":True}

@app.post("/api/quizzes/{qid}/submit")
async def submit(qid: uuid.UUID,body: Submission,current=Depends(user),connection=Depends(db)):
    async with connection.transaction():
        row=await connection.fetchrow("SELECT * FROM quizzes WHERE id=$1 AND user_id=$2 FOR UPDATE",qid,current["id"])
        if not row: raise HTTPException(404,"Không tìm thấy bài")
        questions=json.loads(row["questions"])
        if row["submitted_at"]:
            try:
                return replay_submission(questions,json.loads(row["answers"]),body.answers,row["score"])
            except ValueError as exc:
                raise HTTPException(409,str(exc))
        try:
            result=grade_answers(questions,body.answers)
        except ValueError as exc:
            raise HTTPException(422,str(exc))
        score=result["score"]
        await connection.execute("UPDATE quizzes SET answers=$2,score=$3,submitted_at=now() WHERE id=$1",qid,json.dumps(body.answers),score)
    return result

@app.get("/api/progress")
async def progress(current=Depends(user),connection=Depends(db)):
    uid=current["id"]
    history=await connection.fetch("SELECT id,score,jsonb_array_length(questions) AS total,submitted_at FROM quizzes WHERE user_id=$1 AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 30",uid)
    topic_progress=await connection.fetch("""SELECT t.id,t.name,count(p.id)::int AS total,
      count(p.id) FILTER(WHERE c.mastered)::int AS mastered,
      count(f.phrase_id)::int AS favorites
      FROM topics t LEFT JOIN phrases p ON p.topic_id=t.id
      LEFT JOIN flashcards c ON c.phrase_id=p.id AND c.user_id=$1
      LEFT JOIN favorites f ON f.phrase_id=p.id AND f.user_id=$1
      GROUP BY t.id ORDER BY t.id""",uid)
    quiz_count=await connection.fetchval("SELECT count(*) FROM quizzes WHERE user_id=$1 AND submitted_at IS NOT NULL",uid)
    return {"quiz_count":quiz_count,"topics":[dict(r) for r in topic_progress],
     "mastered":await connection.fetchval("SELECT count(*) FROM flashcards WHERE user_id=$1 AND mastered",uid),
     "favorites":await connection.fetchval("SELECT count(*) FROM favorites WHERE user_id=$1",uid),
     "total":await connection.fetchval("SELECT count(*) FROM phrases"),"history":[dict(r) for r in history]}

# Additional learning features share the existing authentication and CSRF checks.
from .expansion import install as install_expansion
install_expansion(app,user,db)
from .oauth import install as install_oauth
install_oauth(app,db,issue_session,ORIGIN,SECURE)
from .picture_assets import install as install_picture_assets
install_picture_assets(app)
