"""HTTP checks of deployed Next.js; does not claim browser visual verification."""
import hashlib,json,sys,urllib.request
from pathlib import Path
base=sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:3000"
root=Path(__file__).resolve().parents[1]
def get(path):
    with urllib.request.urlopen(base+path,timeout=15) as r:
        assert r.status==200
        return r.read(),r.headers.get("Content-Type", "")
html,_=get("/"); assert "Học tiếng Anh".encode() in html
assert json.loads(get("/health")[0])["status"]=="ok"
topics=json.loads(get("/api/topics")[0])
assert isinstance(topics,list) and topics, "Backend chưa có chủ đề hoặc proxy không hoạt động"
assert all(isinstance(t.get("count"),int) and t["count"]>0 for t in topics)
print("OK /api/topics: frontend → backend → PostgreSQL,",len(topics),"topics")
for asset in json.loads((root/"frontend/public/freelingo-assets/asset-manifest.json").read_text()):
    data,ctype=get(asset["public_url"])
    assert ctype.startswith("image/")
    assert hashlib.sha256(data).hexdigest()==asset["sha256"]
    print("OK",asset["public_url"],len(data),ctype)
assert b"/api/media/logo.png" in html
print("PASS: homepage, health, API proxy/topics, all 3 local image URLs and bundled manifest SHA256 comparison")
