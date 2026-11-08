"""Exercise the public frontend proxy. Uses only Python's standard library.

prepare -> restart backend externally -> verify checks durable state and session.
Creates two disposable app accounts; run against a development/test deployment.
The private state file contains a session cookie and is written with mode 0600.
"""
import argparse
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        old=urllib.parse.urlsplit(request.full_url)
        new=urllib.parse.urlsplit(newurl)
        if (old.scheme,old.netloc)!=(new.scheme,new.netloc):
            raise ValueError("Kiểm thử không cho phép redirect sang origin khác; dùng URL HTTPS chính xác của app.")
        return super().redirect_request(request,response,code,message,headers,newurl)


class Client:
    def __init__(self, base):
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("URL phải là origin của app, ví dụ http://localhost:3000")
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(SameOriginRedirect(),urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, path, method="GET", data=None, expected=200, raw=False):
        headers = {"Origin": self.base}
        body = None
        if data is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(data).encode()
        request = urllib.request.Request(self.base+path, data=body, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=25)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            payload = response.read()
            if response.status != expected:
                raise AssertionError(f"{method} {path}: HTTP {response.status}, cần {expected}. Kiểm tra cấu hình origin/cookie và log server.")
        if raw:
            return payload
        return json.loads(payload)

    def export_cookies(self):
        return [{"name": c.name, "value": c.value, "domain": c.domain,
                 "domain_specified": c.domain_specified, "domain_initial_dot": c.domain_initial_dot,
                 "path": c.path, "secure": c.secure, "expires": c.expires,
                 "rest": c._rest} for c in self.jar]

    def restore_cookies(self, cookies):
        for c in cookies:
            self.jar.set_cookie(http.cookiejar.Cookie(
                version=0, name=c["name"], value=c["value"], port=None, port_specified=False,
                domain=c["domain"], domain_specified=c["domain_specified"], domain_initial_dot=c["domain_initial_dot"],
                path=c["path"], path_specified=True, secure=c["secure"], expires=c["expires"],
                discard=False, comment=None, comment_url=None, rest=c.get("rest", {}), rfc2109=False,
            ))


def prepare(client):
    home = client.call("/", raw=True)
    assert "Học tiếng Anh".encode() in home
    assert client.call("/health")["status"] == "ok"
    manifest = json.loads((ROOT / "frontend/public/freelingo-assets/asset-manifest.json").read_text())
    for item in manifest:
        data = client.call(item["public_url"], raw=True)
        assert hashlib.sha256(data).hexdigest() == item["sha256"]
    email = "http-test-"+secrets.token_hex(8)+"@example.test"
    password = secrets.token_urlsafe(24)
    client.call("/api/auth/register", "POST", {"email": email, "password": password})
    client.call("/api/auth/logout", "POST", {})
    client.call("/api/auth/login", "POST", {"email": email, "password": password})
    assert client.call("/api/auth/me")["email"] == email
    lessons = client.call("/api/lessons")
    chosen = next(t for t in lessons if t["total"] >= 4)
    topic = chosen["id"]
    lesson = client.call("/api/lessons/"+urllib.parse.quote(topic, safe=""))
    sentence = lesson["phrases"][0]
    phrase_id = sentence["id"]
    for query in (sentence["english"], sentence["vietnamese"]):
        matches = client.call("/api/phrases?"+urllib.parse.urlencode({"topic":topic,"q":query}))
        assert any(p["id"] == phrase_id for p in matches)
    client.call("/api/favorites/"+phrase_id, "PUT", {"value": True})
    client.call("/api/flashcards/"+phrase_id, "PUT", {"value": True})
    quiz = client.call("/api/quizzes", "POST", {"topic": topic})
    assert all("correct" not in q for q in quiz["questions"])
    answers = []
    for question in quiz["questions"]:
        candidates = client.call("/api/phrases?"+urllib.parse.urlencode({"topic":topic,"q":question["english"]}))
        correct = next(p["vietnamese"] for p in candidates if p["id"] == question["phrase_id"])
        answers.append(correct)
    url = "/api/quizzes/"+quiz["id"]+"/submit"
    result = client.call(url, "POST", {"answers": answers})
    assert result["score"] == result["total"] == len(answers)
    assert client.call(url, "POST", {"answers": answers}) == result
    assert client.call("/api/progress")["quiz_count"] == 1
    pending = client.call("/api/quizzes", "POST", {"topic": topic})
    partial = [pending["questions"][0]["options"][0]]+[""]*(len(pending["questions"])-1)
    client.call("/api/quizzes/"+pending["id"]+"/draft", "PUT", {"answers":partial})
    other = Client(client.base)
    other.call("/api/auth/register", "POST", {"email":"http-test-"+secrets.token_hex(8)+"@example.test","password":secrets.token_urlsafe(24)})
    assert other.call("/api/progress")["quiz_count"] == 0
    other.call("/api/quizzes/"+quiz["id"], expected=404)
    assert not other.call("/api/phrases?favorites=true")
    other.call("/api/auth/logout", "POST", {})
    return {"base":client.base,"email":email,"cookies":client.export_cookies(),"topic":topic,
            "phrase_id":phrase_id,"quiz_id":quiz["id"],"score":len(answers),
            "pending_id":pending["id"],"partial":partial}


def verify(client, state):
    assert client.base == state["base"], "URL phải khớp với lần prepare"
    client.restore_cookies(state["cookies"])
    assert client.call("/api/auth/me")["email"] == state["email"]
    progress = client.call("/api/progress")
    assert progress["mastered"] == 1 and progress["favorites"] == 1
    assert progress["quiz_count"] == 1
    detail = client.call("/api/quizzes/"+state["quiz_id"])
    assert detail["result"]["score"] == state["score"]
    topic = urllib.parse.quote(state["topic"], safe="")
    lesson = client.call("/api/lessons/"+topic)
    assert lesson["mastered"] == 1
    assert any(p["id"] == state["phrase_id"] and p["mastered"] and p["favorite"] for p in lesson["phrases"])
    pending = client.call("/api/quizzes/active?"+urllib.parse.urlencode({"topic":state["topic"]}))
    assert pending["id"] == state["pending_id"] and pending["answers"] == state["partial"]


def write_state(path, state):
    resolved=path.resolve()
    if resolved.is_relative_to(ROOT) and not resolved.is_relative_to(ROOT/".tools"):
        raise ValueError("Trong repo, chỉ lưu state chứa cookie dưới .tools/ để tránh đóng gói secret.")
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w") as file:
        os.fchmod(file.fileno(), 0o600)
        json.dump(state, file)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--phase", choices=["prepare","verify","full"], default="full")
    parser.add_argument("--state", type=Path, default=ROOT/".tools/e2e-http.json")
    args = parser.parse_args()
    client = Client(args.url)
    if args.phase in {"prepare","full"}:
        state = prepare(client)
        write_state(args.state, state)
        print("PASS prepare: images, register/login, lessons/search, favorite/mastered, scoring, draft and account isolation.")
        print("Private state saved (0600):",args.state)
    else:
        if args.state.stat().st_mode & 0o077:
            raise ValueError("State chứa phiên đăng nhập; cần quyền file 0600")
        state = json.loads(args.state.read_text())
    if args.phase in {"verify","full"}:
        verify(client, state)
        print("PASS verify: session, lesson status, favorites, quiz result and draft persisted.")
    if args.phase == "prepare":
        print("Restart backend, then rerun with --phase verify and the same --url/--state.")
    elif args.phase == "full":
        print("No restart was performed by this run. Use prepare/verify around a real restart to verify durability.")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError, KeyError, StopIteration, OSError, urllib.error.URLError) as error:
        print("FAIL:",str(error) or type(error).__name__,file=sys.stderr)
        sys.exit(1)
