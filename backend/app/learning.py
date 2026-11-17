"""Offline learning rules; no framework, database or network dependencies."""
import hashlib
from datetime import date, timedelta
import hmac
import re
import unicodedata
import secrets


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
    ).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt, digest = encoded.split("$")
        if algorithm != "scrypt" or len(salt) != 32 or len(digest) != 128:
            return False
        return hmac.compare_digest(hash_password(password, salt), encoded)
    except (ValueError, TypeError):
        return False


DUMMY_PASSWORD_HASH = hash_password("unused-dummy-password", "00" * 16)


def build_questions(phrases, meanings, rng=None):
    """Store the correct answer server-side; send only public_question to clients."""
    if not phrases:
        raise ValueError("Chưa có câu hỏi trong chủ đề này")
    rng = rng or secrets.SystemRandom()
    meanings = sorted(set(meanings))
    questions = []
    for phrase in phrases:
        distractors = [value for value in meanings if value != phrase["vietnamese"]]
        if len(distractors) < 3:
            raise ValueError("Cần ít nhất 4 nghĩa khác nhau để tạo bài quiz")
        options = rng.sample(distractors, 3) + [phrase["vietnamese"]]
        rng.shuffle(options)
        questions.append({
            "phrase_id": phrase["id"], "english": phrase["english"],
            "options": options, "correct": phrase["vietnamese"],
        })
    return questions


def public_questions(questions):
    return [{key: question[key] for key in ("phrase_id", "english", "options")}
            for question in questions]


def validate_answers(questions, answers, *, draft=False):
    if len(questions) != len(answers):
        raise ValueError("Số câu trả lời không khớp với bài quiz")
    for question, answer in zip(questions, answers):
        if draft and answer == "":
            continue
        if answer not in question["options"]:
            raise ValueError("Vui lòng chọn đáp án hợp lệ cho từng câu hỏi")


def grade_answers(questions, answers):
    validate_answers(questions, answers)
    return {
        "score": sum(answer == question["correct"] for question, answer in zip(questions, answers)),
        "total": len(questions),
        "review": [{"english": question["english"], "correct": question["correct"], "answer": answer}
                   for question, answer in zip(questions, answers)],
    }


def quiz_view(quiz_id, questions, answers=None, score=None, submitted_at=None):
    """A draft never exposes the server's correct answers."""
    answers = answers if answers is not None else [""] * len(questions)
    view = {"id": str(quiz_id), "questions": public_questions(questions),
            "answers": answers, "submitted_at": submitted_at, "result": None}
    if submitted_at is not None:
        result = grade_answers(questions, answers)
        result["score"] = score
        view["result"] = result
    return view


def replay_submission(questions, saved_answers, requested_answers, score):
    """Retry the same submission safely without creating a second result."""
    if saved_answers != requested_answers:
        raise ValueError("Bài đã nộp không thể thay đổi đáp án")
    result = grade_answers(questions, saved_answers)
    result["score"] = score
    return result


def latest_mistake_ids(attempts):
    """Attempts must be newest first. A later correct answer clears an older mistake."""
    seen, mistakes = set(), []
    for attempt in attempts:
        for question, answer in zip(attempt["questions"], attempt["answers"]):
            phrase_id = question["phrase_id"]
            if phrase_id in seen:
                continue
            seen.add(phrase_id)
            if answer != question["correct"]:
                mistakes.append(phrase_id)
    return mistakes


def fold_text(value: str) -> str:
    """Lower-case text without Vietnamese diacritics, so "cam on" finds "Cảm ơn"."""
    stripped = "".join(c for c in unicodedata.normalize("NFD", value.lower()) if not unicodedata.combining(c))
    return unicodedata.normalize("NFC", stripped.replace("đ", "d"))


def _fold_table():
    accented, plain = [], []
    for code in [*range(0x00C0, 0x0250), *range(0x1E00, 0x1F00)]:
        char = chr(code)
        if char != char.lower():
            continue
        folded = fold_text(char)
        if folded != char and len(folded) == 1 and folded.isascii():
            accented.append(char)
            plain.append(folded)
    return "".join(accented), "".join(plain)


# Arguments for SQL translate(): the same folding done inside PostgreSQL, no extension needed.
FOLD_FROM, FOLD_TO = _fold_table()


# Days until a mastered phrase is due again; index = completed reviews.
REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60]


def next_review_days(reviews: int) -> int:
    return REVIEW_INTERVALS[max(0, min(reviews, len(REVIEW_INTERVALS) - 1))]


def study_streak(days, today: date):
    """Consecutive active days ending today (or yesterday, so the streak survives until tonight)."""
    active = set(days)
    start = today if today in active else today - timedelta(days=1)
    streak = 0
    while start - timedelta(days=streak) in active:
        streak += 1
    best = run = 0
    previous = None
    for day in sorted(active):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        best, previous = max(best, run), day
    week = [{"date": (today - timedelta(days=offset)).isoformat(),
             "active": today - timedelta(days=offset) in active} for offset in range(6, -1, -1)]
    return {"streak": streak, "best_streak": best, "studied_today": today in active, "week": week}


# --- AI practice sets: the answer key stays on the server, like quizzes. ---------------

def answer_key(value: str) -> str:
    """Comparable form of a typed answer: case, spacing, quote style and edge punctuation are ignored."""
    text = unicodedata.normalize("NFKC", value).lower()
    for mark in "\u2018\u2019`\u00b4":
        text = text.replace(mark, "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", text).strip(" .,!?;:\"")


def public_exercises(questions):
    return [{key: question[key] for key in ("kind", "prompt", "options", "hint")}
            for question in questions]


def validate_exercise_answers(questions, answers):
    if len(questions) != len(answers):
        raise ValueError("Số câu trả lời không khớp với bài tập")
    for question, answer in zip(questions, answers):
        if question["kind"] == "choice":
            if answer not in question["options"]:
                raise ValueError("Vui lòng chọn đáp án hợp lệ cho từng câu hỏi")
        elif not answer.strip() or len(answer) > 200:
            raise ValueError("Hãy điền từ còn thiếu cho từng câu (tối đa 200 ký tự)")


def exercise_correct(question, answer) -> bool:
    if question["kind"] == "choice":
        return answer == question["correct"]
    return answer_key(answer) in {answer_key(value) for value in question["accept"]}


def grade_exercises(questions, answers):
    validate_exercise_answers(questions, answers)
    review = [{**public, "answer": answer, "correct": question["correct"],
               "is_correct": exercise_correct(question, answer), "explanation": question["explanation"]}
              for public, question, answer in zip(public_exercises(questions), questions, answers)]
    return {"score": sum(row["is_correct"] for row in review), "total": len(questions), "review": review}


def exercise_view(exercise_id, title, questions, answers=None, score=None, submitted_at=None):
    """An unsubmitted set never exposes answers or explanations."""
    view = {"id": str(exercise_id), "title": title, "questions": public_exercises(questions),
            "submitted_at": submitted_at, "result": None}
    if submitted_at is not None:
        result = grade_exercises(questions, answers)
        result["score"] = score
        view["result"] = result
    return view


def quiz_insights(attempts, phrase_topics):
    """Attempts must be newest first. Accuracy per topic and the phrases whose latest answer is still wrong."""
    topics, wrong, latest, texts = {}, {}, {}, {}
    for attempt in attempts:
        for question, answer in zip(attempt["questions"], attempt["answers"]):
            phrase_id, right = question["phrase_id"], answer == question["correct"]
            latest.setdefault(phrase_id, right)
            texts.setdefault(phrase_id, (question["english"], question["correct"]))
            if not right:
                wrong[phrase_id] = wrong.get(phrase_id, 0) + 1
            topic = phrase_topics.get(phrase_id)
            if topic:
                stats = topics.setdefault(topic, {"answered": 0, "correct": 0})
                stats["answered"] += 1
                stats["correct"] += right
    # dict order = first seen = most recent, so ties keep the newest mistakes first.
    missed = sorted((phrase_id for phrase_id, right in latest.items() if not right),
                    key=lambda phrase_id: -wrong[phrase_id])
    return {"topics": topics,
            "answered": sum(stats["answered"] for stats in topics.values()),
            "correct": sum(stats["correct"] for stats in topics.values()),
            "missed": [{"phrase_id": phrase_id, "english": texts[phrase_id][0], "vietnamese": texts[phrase_id][1],
                        "wrong": wrong[phrase_id], "topic_id": phrase_topics.get(phrase_id, "")}
                       for phrase_id in missed]}
