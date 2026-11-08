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
