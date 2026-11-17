export type StreakInfo={streak:number;best_streak:number;studied_today:boolean;week:{date:string;active:boolean}[]}
const weekday=new Intl.DateTimeFormat('vi-VN',{weekday:'short',timeZone:'UTC'})

export function StreakBadge({streak,studiedToday,onClick}:{streak?:number;studiedToday?:boolean;onClick:()=>void}) {
 const label=streak===undefined?'Đang tải chuỗi ngày học':`${streak} ngày học liên tục. ${studiedToday?'Hôm nay đã học.':'Học hôm nay để giữ chuỗi.'}`
 return <button type="button" className={'header-streak'+(studiedToday?' studied':'')} onClick={onClick} aria-label={label} title={label}>
  <span className="header-streak-flame" aria-hidden="true">🔥</span><strong>{streak??'—'}</strong><span className="streak-unit">ngày</span>
 </button>
}

export default function StudyStreak({info,accuracy}:{info:StreakInfo;accuracy?:number|null}) {
 return <section className="streak-card" aria-label="Chuỗi ngày học">
  <div className="streak-main"><span className="streak-flame" aria-hidden="true">{info.streak>0?'🔥':'🌱'}</span><div><strong>{info.streak} ngày liên tiếp</strong><span>{info.studied_today?'Hôm nay bạn đã học. Tuyệt vời!':info.streak>0?'Học một chút hôm nay để giữ chuỗi nhé.':'Bắt đầu chuỗi ngày học từ hôm nay.'}</span></div></div>
  <ol className="streak-week" aria-label="7 ngày gần nhất">{info.week.map(day=><li key={day.date} className={day.active?'active':''} title={day.date}><span aria-hidden="true">{day.active?'✓':''}</span><small>{weekday.format(new Date(day.date+'T00:00:00Z'))}</small><span className="sr-only">{day.date}: {day.active?'đã học':'chưa học'}</span></li>)}</ol>
  <dl className="streak-meta"><div><dt>Kỷ lục</dt><dd>{info.best_streak} ngày</dd></div>{accuracy!=null&&<div><dt>Tỉ lệ đúng quiz</dt><dd>{accuracy}%</dd></div>}</dl>
 </section>
}
