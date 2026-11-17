"""Run with Python alone: python3 -m unittest discover -s tests -p test_offline.py -v."""
import hashlib
import importlib.util
import json
import random
import tempfile
import http.cookiejar
import stat
import urllib.request
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.learning import (build_questions, grade_answers, hash_password,
                          public_questions, validate_answers, verify_password, quiz_view, replay_submission, latest_mistake_ids)

spec = importlib.util.spec_from_file_location("manage", ROOT / "database/manage.py")
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)
http_spec = importlib.util.spec_from_file_location("e2e_http", ROOT / "tests/e2e_http.py")
http_checks = importlib.util.module_from_spec(http_spec)
http_spec.loader.exec_module(http_checks)


class OfflineLearningTests(unittest.TestCase):
    def setUp(self):
        self.topics = manage.normalize(json.loads((ROOT / "database/sample.vi-en.json").read_text()))
        self.phrases = [dict(p, id=f"{t['id']}-{i}") for t in self.topics for i, p in enumerate(t["phrases"])]
        self.meanings = [p["vietnamese"] for p in self.phrases]
        self.questions = build_questions(self.phrases[:5], self.meanings, random.Random(9))

    def test_sample_has_twenty_topics_with_twenty_bilingual_phrases_each(self):
        self.assertEqual(len(self.topics), 20)
        self.assertEqual(len(self.phrases), 400)
        self.assertTrue(all(len(topic["phrases"]) == 20 for topic in self.topics))

    def test_questions_have_unique_options_and_one_correct_answer(self):
        for q in self.questions:
            self.assertEqual(len(set(q["options"])), 4)
            self.assertEqual(q["options"].count(q["correct"]), 1)

    def test_public_questions_never_reveal_answer(self):
        for q in public_questions(self.questions):
            self.assertEqual(set(q), {"phrase_id", "english", "options"})

    def test_full_score_and_review(self):
        result = grade_answers(self.questions, [q["correct"] for q in self.questions])
        self.assertEqual(result["score"], 5)
        self.assertEqual(result["total"], 5)
        self.assertEqual(len(result["review"]), 5)

    def test_wrong_answers_are_graded_server_side(self):
        answers = [next(v for v in q["options"] if v != q["correct"]) for q in self.questions]
        self.assertEqual(grade_answers(self.questions, answers)["score"], 0)

    def test_draft_allows_unanswered_questions(self):
        self.assertIsNone(validate_answers(self.questions, [""] * 5, draft=True))
        with self.assertRaises(ValueError):
            grade_answers(self.questions, [""] * 5)

    def test_draft_rejects_injected_answers_or_wrong_length(self):
        for answers in (["injected"] * 5, [], [""] * 6):
            with self.assertRaises(ValueError):
                validate_answers(self.questions, answers, draft=True)

    def test_insufficient_content_is_not_silently_replaced(self):
        with self.assertRaises(ValueError):
            build_questions([], self.meanings)
        with self.assertRaises(ValueError):
            build_questions(self.phrases[:1], [self.phrases[0]["vietnamese"]])

    def test_hashes_use_independent_salts_and_verify_password(self):
        first = hash_password("my-secret-password")
        self.assertNotEqual(first, hash_password("my-secret-password"))
        self.assertTrue(verify_password("my-secret-password", first))
        self.assertFalse(verify_password("incorrect", first))
        for malformed in ("bad", "scrypt$not-hex$bad", first.replace("scrypt", "unknown")):
            self.assertFalse(verify_password("my-secret-password", malformed))

    def test_importer_requires_real_vietnamese_translation(self):
        original = {"schema_version": 1, "languages": {"en-GB": [{"id": "greeting", "situation": "Greeting", "phrases": [{"text": "Hello", "context": "A greeting"}]}]}}
        with self.assertRaisesRegex(ValueError, "Vietnamese"):
            manage.normalize(original)
        original["languages"]["en-GB"][0]["phrases"][0]["translations"] = {"vi": "Xin chào"}
        self.assertEqual(manage.normalize(original)[0]["phrases"][0]["vietnamese"], "Xin chào")

    def test_duplicate_content_is_rejected(self):
        payload = json.loads((ROOT / "database/sample.vi-en.json").read_text())
        payload["topics"][0]["phrases"].append(payload["topics"][0]["phrases"][0])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            manage.normalize(payload)

    def test_quiz_detail_exposes_review_only_after_submission(self):
        answers = [q["correct"] for q in self.questions]
        draft = quiz_view("quiz-id", self.questions, answers)
        self.assertIsNone(draft["result"])
        self.assertTrue(all("correct" not in q for q in draft["questions"]))
        completed = quiz_view("quiz-id", self.questions, answers, 5, "2026-11-08")
        self.assertEqual(completed["result"]["score"], 5)
        self.assertEqual(len(completed["result"]["review"]), 5)

    def test_submission_retry_recovers_original_result(self):
        answers = [q["correct"] for q in self.questions]
        result = replay_submission(self.questions, answers, list(answers), 5)
        self.assertEqual(result, grade_answers(self.questions, answers))

    def test_submission_retry_cannot_change_saved_answers(self):
        answers = [q["correct"] for q in self.questions]
        with self.assertRaisesRegex(ValueError, "đã nộp"):
            replay_submission(self.questions, answers, [""] * 5, 5)

    def test_latest_correct_answer_clears_previous_mistake(self):
        q=self.questions[0]
        wrong=next(value for value in q["options"] if value!=q["correct"])
        attempts=[{"questions":[q],"answers":[q["correct"]]},
                  {"questions":[q],"answers":[wrong]}]
        self.assertEqual(latest_mistake_ids(attempts),[])

    def test_latest_wrong_answer_overrides_old_correct_answer(self):
        q=self.questions[0]
        wrong=next(value for value in q["options"] if value!=q["correct"])
        attempts=[{"questions":[q],"answers":[wrong]},
                  {"questions":[q],"answers":[q["correct"]]}]
        self.assertEqual(latest_mistake_ids(attempts),[q["phrase_id"]])

    def test_mistake_review_deduplicates_and_handles_empty_history(self):
        self.assertEqual(latest_mistake_ids([]),[])
        q=self.questions[0]
        wrong=next(value for value in q["options"] if value!=q["correct"])
        attempt={"questions":[q],"answers":[wrong]}
        self.assertEqual(latest_mistake_ids([attempt,attempt]),[q["phrase_id"]])

    def test_http_runner_rejects_credentials_or_non_origin_urls(self):
        for value in ("file:///tmp/state", "https://user:secret@example.test", "https://example.test/subpath", "https://example.test?token=secret"):
            with self.assertRaises(ValueError):
                http_checks.Client(value)

    def test_http_runner_preserves_cookie_attributes_across_restart(self):
        first = http_checks.Client("https://example.test")
        first.jar.set_cookie(http.cookiejar.Cookie(
            version=0,name="english_session",value="test-only-session",port=None,port_specified=False,
            domain="example.test",domain_specified=False,domain_initial_dot=False,
            path="/",path_specified=True,secure=True,expires=2100000000,discard=False,
            comment=None,comment_url=None,rest={"HttpOnly":None,"SameSite":"Lax"},rfc2109=False))
        second = http_checks.Client("https://example.test")
        second.restore_cookies(json.loads(json.dumps(first.export_cookies())))
        self.assertEqual(first.export_cookies(),second.export_cookies())

    def test_http_runner_writes_private_state(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"state.json"
            path.write_text("old-state")
            path.chmod(0o644)
            http_checks.write_state(path,{"cookies":["test-only"]})
            self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
            self.assertEqual(json.loads(path.read_text()),{"cookies":["test-only"]})

    def test_http_runner_refuses_cross_origin_redirects(self):
        handler=http_checks.SameOriginRedirect()
        request=urllib.request.Request("https://example.test/start")
        for target in ("https://other.test/next","http://example.test/next"):
            with self.assertRaises(ValueError):
                handler.redirect_request(request,None,302,"Found",{},target)
        same=handler.redirect_request(request,None,302,"Found",{},"https://example.test/next")
        self.assertEqual(same.full_url,"https://example.test/next")

    def test_http_state_cannot_be_written_into_public_source(self):
        with self.assertRaises(ValueError):
            http_checks.write_state(ROOT/"frontend/public/private-session.json",{"cookies":[]})
        self.assertFalse((ROOT/"frontend/public/private-session.json").exists())

    def test_local_images_match_manifest_without_old_repository(self):
        manifest = json.loads((ROOT / "frontend/public/freelingo-assets/asset-manifest.json").read_text())
        self.assertEqual(len(manifest), 3)
        for asset in manifest:
            path = ROOT / asset["local_path"]
            self.assertFalse(path.is_symlink())
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), asset["sha256"])


if __name__ == "__main__":
    unittest.main()


def test_study_streak_counts_consecutive_days_and_keeps_yesterday():
    from datetime import date
    from app.learning import study_streak
    today=date(2026,11,14)
    days=[date(2026,11,13),date(2026,11,12),date(2026,11,11),date(2026,11,5),date(2026,11,4)]
    result=study_streak(days,today)
    assert result["streak"]==3 and result["best_streak"]==3 and result["studied_today"] is False
    assert len(result["week"])==7 and result["week"][-1]=={"date":"2026-11-14","active":False}
    assert study_streak(days+[today],today)["streak"]==4
    assert study_streak([date(2026,11,10)],today)["streak"]==0
    assert study_streak([],today)=={"streak":0,"best_streak":0,"studied_today":False,"week":study_streak([],today)["week"]}


def test_login_failures_are_limited_per_account_and_expire():
    from app import main
    main._login_failures.clear()
    for i in range(main.LOGIN_MAX_FAILURES):
        assert not main.login_blocked("a@example.com",now=100.0+i)
        main.record_login_failure("a@example.com",now=100.0+i)
    assert main.login_blocked("a@example.com",now=120.0)
    assert not main.login_blocked("b@example.com",now=120.0)
    assert not main.login_blocked("a@example.com",now=100.0+main.LOGIN_WINDOW+20)
    main._login_failures.clear()


def test_media_is_cacheable_but_api_errors_are_not():
    from fastapi.testclient import TestClient
    from app.main import app
    client=TestClient(app)
    assert client.get("/api/media/logo.png").headers["cache-control"]=="public, max-age=86400"
    assert client.get("/api/media/not-allowlisted.png").headers["cache-control"]=="no-store"


def test_media_revalidates_with_etag_and_reuses_small_objects(monkeypatch):
    from fastapi.testclient import TestClient
    from app import picture_assets
    from app.main import app
    monkeypatch.setenv("ASSET_STORAGE","local")
    picture_assets._cache.clear()
    reads=[]
    original=picture_assets.read_object
    def counting(kind,filename,range_header=None):
        reads.append(filename);return original(kind,filename,range_header)
    monkeypatch.setattr(picture_assets,"read_object",counting)
    client=TestClient(app)
    first=client.get("/api/media/logo.png")
    etag=first.headers["etag"]
    assert first.status_code==200 and etag.startswith('"')
    again=client.get("/api/media/logo.png")
    assert again.content==first.content and reads==["logo.png"]  # served from memory
    cached=client.get("/api/media/logo.png",headers={"If-None-Match":etag})
    assert cached.status_code==304 and cached.content==b"" and cached.headers["cache-control"]=="public, max-age=86400"
    assert client.get("/api/media/logo.png",headers={"If-None-Match":'"other"'}).status_code==200
    # Originals above the per-item limit keep only an ETag: no bytes held, 304 still free.
    big=client.get("/api/picture-assets/forest.jpg")
    assert big.status_code==200 and len(big.content)>picture_assets.CACHE_ITEM_MAX
    assert client.get("/api/picture-assets/forest.jpg",headers={"If-None-Match":big.headers["etag"]}).status_code==304
    assert reads==["logo.png","forest.jpg"]
    assert client.get("/api/audio/ielts-listening.wav",headers={"Range":"bytes=0-9"}).status_code==206
    assert client.get("/api/media/../main.py").status_code in (404,405)
    picture_assets._cache.clear()


def test_search_folding_matches_vietnamese_without_diacritics():
    from app.learning import FOLD_FROM, FOLD_TO, fold_text
    assert fold_text("Cảm ơn bạn Đức") == "cam on ban duc"
    assert fold_text("thank YOU") == "thank you"
    assert len(FOLD_FROM) == len(FOLD_TO) and "đ" in FOLD_FROM and "ệ" in FOLD_FROM
    table = str.maketrans(FOLD_FROM, FOLD_TO)
    sample = "xin chào, rất vui được gặp bạn — tôi muốn đặt bàn lúc bảy giờ tối; ưu tiên chỗ yên tĩnh"
    assert sample.translate(table) == fold_text(sample)


PRACTICE=[{"kind":"choice","prompt":"She ___ to work.","options":["go","goes","going","gone"],"correct":"goes","accept":[],"hint":"","explanation":"She + V-s."},
          {"kind":"gap","prompt":"I ___ like tea.","options":[],"correct":"don't","accept":["don't","do not"],"hint":"Tôi không thích trà.","explanation":"I + do not."}]


def test_typed_answers_ignore_case_spacing_quotes_and_edge_punctuation():
    from app.learning import answer_key, exercise_correct
    assert answer_key("  Don’t   Worry! ") == "don't worry"
    assert answer_key("“Go”.") == "go" and answer_key("o'clock") == "o'clock"
    for answer in ["don't", "Don’t", " DO  NOT. ", "don`t"]:
        assert exercise_correct(PRACTICE[1], answer)
    for answer in ["dont", "do", "does not"]:
        assert not exercise_correct(PRACTICE[1], answer)
    # A choice must match its option exactly; near matches are not silently accepted.
    assert exercise_correct(PRACTICE[0], "goes") and not exercise_correct(PRACTICE[0], "Goes ")


def test_practice_sets_are_graded_on_the_server_and_hide_the_key_until_submitted():
    import pytest
    from app.learning import exercise_view, grade_exercises, public_exercises
    assert all(set(question) == {"kind", "prompt", "options", "hint"} for question in public_exercises(PRACTICE))
    draft = exercise_view("id-1", "Bài tập", PRACTICE)
    assert draft["result"] is None and "explanation" not in str(draft) and "accept" not in str(draft)
    result = grade_exercises(PRACTICE, ["go", "Do not"])
    assert result["score"] == 1 and result["total"] == 2
    assert [row["is_correct"] for row in result["review"]] == [False, True]
    assert result["review"][0]["correct"] == "goes" and result["review"][1]["explanation"] == "I + do not."
    for answers in (["goes"], ["goes", ""], ["went", "do not"], ["goes", "x" * 201], ["goes", "do not", "extra"]):
        with pytest.raises(ValueError):
            grade_exercises(PRACTICE, answers)
    done = exercise_view("id-1", "Bài tập", PRACTICE, ["goes", "do not"], 2, "2026-11-14T00:00:00Z")
    assert done["result"]["score"] == 2 and done["result"]["review"][1]["answer"] == "do not"


def test_quiz_insights_rank_topics_and_only_keep_unresolved_mistakes():
    from app.learning import quiz_insights
    def attempt(*rows):
        return {"questions": [{"phrase_id": pid, "english": pid.upper(), "correct": "đúng"} for pid, _ in rows],
                "answers": ["đúng" if right else "sai" for _, right in rows]}
    topics = {"a": "food", "b": "food", "c": "travel", "d": "travel"}
    # Newest first: "a" was wrong twice and is still wrong, "b" is fixed, "c" is newly wrong, "z" has no topic.
    stats = quiz_insights([attempt(("a", False), ("b", True), ("c", False), ("z", False)),
                           attempt(("a", False), ("b", False), ("d", True)),
                           attempt(("a", True))], topics)
    assert stats["topics"] == {"food": {"answered": 5, "correct": 2}, "travel": {"answered": 2, "correct": 1}}
    assert (stats["answered"], stats["correct"]) == (7, 3)
    assert [(row["phrase_id"], row["wrong"], row["topic_id"]) for row in stats["missed"]] == [("a", 2, "food"), ("c", 1, "travel"), ("z", 1, "")]
    assert stats["missed"][0]["english"] == "A" and stats["missed"][0]["vietnamese"] == "đúng"
    assert quiz_insights([], {}) == {"topics": {}, "answered": 0, "correct": 0, "missed": []}
