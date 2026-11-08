export function searchText(value:string):string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi').trim()
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
