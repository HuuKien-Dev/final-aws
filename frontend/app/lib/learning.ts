export function searchText(value:string):string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi').trim()
}

export function shuffled<T>(items:T[],random=Math.random):T[] {
  const copy=[...items]
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}
  return copy
}

export type DraftCard = {english:string;vietnamese:string;example:string;mastered:boolean}

/** One card per line: English, Vietnamese and an optional example, split by tab, " | ", ";" or " - ". */
export function parseCards(text:string):{cards:DraftCard[];invalid:number[]} {
  const cards:DraftCard[]=[],invalid:number[]=[]
  text.split(/\r?\n/).forEach((raw,index)=>{
    const line=raw.trim()
    if(!line)return
    const separator=[/\t/,/\s*\|\s*/,/\s*;\s*/,/\s+[-–—]\s+/].find(pattern=>pattern.test(line))
    const parts=separator?line.split(separator).map(part=>part.trim()):[line]
    const [english='',vietnamese='',...rest]=parts
    const example=rest.join(' ').trim()
    if(!english||!vietnamese||english.length>300||vietnamese.length>500||example.length>1000)invalid.push(index+1)
    else cards.push({english,vietnamese,example,mastered:false})
  })
  return {cards,invalid}
}

export function cardsToCsv(cards:{english:string;vietnamese:string;example:string;mastered:boolean}[]):string {
  // Leading apostrophe neutralises spreadsheet formulas in learner-entered text.
  const cell=(value:string)=>'"'+(/^[=+\-@\t\r]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"'
  return '\ufeff'+['english,vietnamese,example,mastered',...cards.map(card=>[cell(card.english),cell(card.vietnamese),cell(card.example),card.mastered?'1':'0'].join(','))].join('\r\n')+'\r\n'
}

export type Topic = {id:string;name:string;description:string;count:number}
export type TopicProgress = {id:string;mastered:number;total:number}
export type TopicFilter = 'all'|'started'|'new'|'completed'

export function studyTopics(topics:Topic[], progress:TopicProgress[]) {
  const byId=new Map(progress.map(item=>[item.id,item]))
  return topics.map(topic=>{
    const total=byId.get(topic.id)?.total??topic.count
    const mastered=Math.max(0,Math.min(total,byId.get(topic.id)?.mastered??0))
    return {...topic,total,mastered}
  })
}

export function recommendTopic(topics:ReturnType<typeof studyTopics>) {
  const started=topics.filter(topic=>topic.mastered>0&&topic.mastered<topic.total)
  // Finish a partly learned topic before introducing another one.
  return started.sort((a,b)=>b.mastered/b.total-a.mastered/a.total)[0]
    ??topics.find(topic=>topic.total>0&&topic.mastered===0)
    ??null
}

export function filterTopics(topics:ReturnType<typeof studyTopics>,query:string,filter:TopicFilter) {
  const term=searchText(query)
  return topics.filter(topic=>searchText(topic.name+' '+topic.description).includes(term)
    &&(filter==='all'||filter==='started'&&topic.mastered>0&&topic.mastered<topic.total
    ||filter==='new'&&topic.mastered===0||filter==='completed'&&topic.total>0&&topic.mastered===topic.total))
}
