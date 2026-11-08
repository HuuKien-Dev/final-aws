export type QuizResult = {
  score: number
  total: number
  review: {english: string; correct: string; answer: string}[]
}

export default function QuizReview({result}: {result: QuizResult}) {
  return <>
    <div className="eyebrow">KẾT QUẢ ĐÃ LƯU</div>
    <h2>{result.score} / {result.total} câu đúng</h2>
    {result.review.map((item, index) => {
      const correct = item.answer === item.correct
      return <div className={'review ' + (correct ? 'correct' : 'incorrect')} key={index}>
        <strong lang="en">{item.english}</strong>
        <p>{correct ? '✓ ' : '↳ '}{item.correct}</p>
        {!correct && <small>Bạn chọn: {item.answer}</small>}
      </div>
    })}
  </>
}
