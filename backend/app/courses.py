"""Original starter curriculum; answer keys are returned only by the review endpoint."""
import json
from pathlib import Path
from fastapi import HTTPException
CATALOG=json.loads(Path(__file__).with_name('curriculum.json').read_text())
LESSONS={lesson['id']:{**lesson,'course_id':course['id']} for course in CATALOG for lesson in course['lessons']}

def get_lesson(lesson_id):
    if lesson_id not in LESSONS: raise HTTPException(404,'Không tìm thấy bài học')
    return LESSONS[lesson_id]

def public_lesson(lesson):
    return {k:([{key:value for key,value in q.items() if key not in {'correct','explanation'}} for q in v] if k=='questions' else v)
            for k,v in lesson.items() if not (k=='text' and lesson['skill']=='listening')}

def review(lesson,answers):
    questions=lesson['questions']
    if len(answers)!=len(questions):raise HTTPException(422,'Số câu trả lời không hợp lệ')
    if any(a < -1 or a >= len(q['options']) for a,q in zip(answers,questions)):
        raise HTTPException(422,'Đáp án không hợp lệ')
    rows=[{**q,'answer':a,'is_correct':a==q['correct']} for a,q in zip(answers,questions)]
    return {'score':sum(q['is_correct'] for q in rows),'total':len(rows),'review':rows,'transcript':lesson.get('text','')}
