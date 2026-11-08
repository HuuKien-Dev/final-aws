"""Explicit release commands; never called by EC2 startup."""
import argparse, asyncio, hashlib, json, os
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def inspect_file(raw):
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("JSON root must be an object")
    print("Top-level keys:", sorted(payload))
    if "languages" in payload:
        print("Languages:", sorted(payload["languages"]))
        categories = payload["languages"].get("en-GB", [])
        if categories:
            print("Category keys:", sorted(categories[0]))
            print("Phrase keys:", sorted(categories[0].get("phrases", [{}])[0]))
    elif "topics" in payload:
        print("Topics:", len(payload["topics"]))
    return payload

def normalize(payload):
    if payload.get("schema_version") != 1:
        raise ValueError("Only schema_version=1 supported")
    if "languages" in payload:
        # Upstream context is NOT a Vietnamese translation. Require explicit translations.
        result = []
        for t in payload["languages"]["en-GB"]:
            phrases = []
            for p in t["phrases"]:
                vi = p.get("vietnamese") or p.get("translations", {}).get("vi")
                if not vi:
                    raise ValueError("Upstream has no Vietnamese translation. Supply reviewed vietnamese or translations.vi; context is not a translation.")
                phrases.append({"english": p["text"], "vietnamese": vi})
            result.append({"id": t["id"], "name": t["situation"], "description": t["situation"], "phrases": phrases})
    else:
        result = payload["topics"]
    if not result:
        raise ValueError("No topics")
    seen_topics, seen_phrases = set(), set()
    for t in result:
        for key in ("id", "name", "description"):
            if not isinstance(t.get(key), str) or not t[key].strip():
                raise ValueError(f"Invalid topic {key}")
        if t["id"] in seen_topics: raise ValueError("Duplicate topic ID")
        seen_topics.add(t["id"])
        if not isinstance(t.get("phrases"), list) or not t["phrases"]:
            raise ValueError("Topic needs phrases")
        for p in t["phrases"]:
            for key in ("english", "vietnamese"):
                if not isinstance(p.get(key), str) or not p[key].strip():
                    raise ValueError(f"Invalid phrase {key}")
            identity = (t["id"], p["english"].strip())
            if identity in seen_phrases: raise ValueError("Duplicate phrase")
            seen_phrases.add(identity)
    return result

async def run(args):
    if args.command == "inspect":
        inspect_file(Path(args.file).read_bytes()); return
    topics = None
    if args.command == "seed":
        if args.s3_bucket:
            import boto3
            raw = boto3.client("s3").get_object(Bucket=args.s3_bucket, Key=args.s3_key)["Body"].read(8*1024*1024+1)
            if len(raw)>8*1024*1024: raise ValueError("Object too large")
        else: raw = Path(args.file).read_bytes()
        topics = normalize(inspect_file(raw))  # Validate everything before any mutation.
    import asyncpg
    db = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        async with db.transaction():
            await db.execute("SELECT pg_advisory_xact_lock(824712)")
            if args.command == "migrate":
                await db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz DEFAULT now())")
                for file in sorted((ROOT/"migrations").glob("*.sql")):
                    sql = file.read_text(); digest = hashlib.sha256(sql.encode()).hexdigest()
                    old = await db.fetchval("SELECT sha256 FROM schema_migrations WHERE version=$1",file.name)
                    if old and old != digest: raise ValueError("Applied migration changed: " + file.name)
                    if not old:
                        await db.execute(sql)
                        await db.execute("INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)",file.name,digest)
                        print("Applied",file.name)
            else:
                for t in topics:
                    await db.execute("INSERT INTO topics VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description",t["id"],t["name"],t["description"])
                    for p in t["phrases"]:
                        english=p["english"].strip(); vietnamese=p["vietnamese"].strip()
                        pid=hashlib.sha256((t["id"]+"\0"+english).encode()).hexdigest()[:32]
                        await db.execute("INSERT INTO phrases VALUES($1,$2,$3,$4) ON CONFLICT(topic_id,english) DO UPDATE SET vietnamese=excluded.vietnamese",pid,t["id"],english,vietnamese)
                print("Seeded",sum(len(t["phrases"]) for t in topics),"phrases; progress preserved")
    finally: await db.close()

if __name__ == "__main__":
    p=argparse.ArgumentParser(); p.add_argument("command",choices=["migrate","seed","inspect"])
    p.add_argument("--file",default=str(ROOT/"sample.vi-en.json"))
    p.add_argument("--s3-bucket"); p.add_argument("--s3-key",default="backend/learning-content/phrasebook-data.json")
    asyncio.run(run(p.parse_args()))
