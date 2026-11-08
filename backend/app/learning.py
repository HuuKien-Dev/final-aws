"""Offline learning rules; no framework, database or network dependencies."""
import hashlib
import hmac
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
