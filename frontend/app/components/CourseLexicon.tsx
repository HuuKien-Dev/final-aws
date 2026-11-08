'use client'
import {useMemo, useState} from 'react'
import {searchText} from '../lib/learning'

export default function CourseLexicon({name, words}:{name:string; words:[string,string,string?][]}) {
  const [query,setQuery]=useState('')
  const [limit,setLimit]=useState(10)
  const filtered=useMemo(()=>words.filter(row=>searchText(row.join(' ')).includes(searchText(query))),[words,query])
  return <details className="course-lexicon">
    <summary>Từ vựng nền tảng · {words.length} từ & cụm từ</summary>
    <label>Tìm từ trong {name}<input type="search" placeholder="Từ tiếng Anh hoặc nghĩa tiếng Việt…" value={query} onChange={event=>{setQuery(event.target.value);setLimit(10)}}/></label>
    <p className="muted" role="status">{filtered.length} từ phù hợp · Có câu ví dụ để luyện dùng từ.</p>
    <dl>{filtered.slice(0,limit).map(([en,vi,example])=><div key={en}><dt lang="en">{en}</dt><dd>{vi}{example&&<p lang="en">{example}</p>}</dd></div>)}</dl>
    {!filtered.length&&<p>Chưa tìm thấy từ. Thử một từ khóa khác nhé.</p>}
    {filtered.length>limit&&<button className="small-button" onClick={()=>setLimit(value=>value+10)}>Xem thêm {Math.min(10,filtered.length-limit)} từ ↓</button>}
  </details>
}
