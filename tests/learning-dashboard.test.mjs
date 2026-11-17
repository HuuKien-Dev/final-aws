import {test} from 'node:test'
import assert from 'node:assert/strict'
import {filterTopics,recommendTopic,studyTopics,searchText} from '../frontend/app/lib/learning.ts'

const topics=[{id:'food',name:'Ăn uống',description:'Gọi món',count:20},{id:'directions',name:'Hỏi đường',description:'Tìm lối đi',count:20},{id:'work',name:'Công việc',description:'Họp và trao đổi',count:20}]
test('topic search accepts Vietnamese without diacritics, including đ',()=>{
  const rows=studyTopics(topics,[])
  assert.equal(searchText('  ĐƯỜNG '),'duong')
  assert.deepEqual(filterTopics(rows,'an uong','all').map(row=>row.id),['food'])
  assert.deepEqual(filterTopics(rows,'duong','all').map(row=>row.id),['directions'])
  assert.deepEqual(filterTopics(rows,'goi mon','all').map(row=>row.id),['food'])
})
test('recommendation prioritises the most complete unfinished topic',()=>{
  const rows=studyTopics(topics,[{id:'food',mastered:20,total:20},{id:'directions',mastered:4,total:20},{id:'work',mastered:12,total:20}])
  assert.equal(recommendTopic(rows).id,'work')
  assert.deepEqual(filterTopics(rows,'','completed').map(row=>row.id),['food'])
  assert.equal(filterTopics(rows,'','started').length,2)
  assert.equal(filterTopics(rows,'','new').length,0)
  assert.equal(rows[0].id,'food','recommendations must not reorder the catalogue')
})
test('recommendation handles new learners, completion and empty catalogues',()=>{
  assert.equal(recommendTopic(studyTopics(topics,[])).id,'food')
  assert.equal(recommendTopic(studyTopics(topics,topics.map(t=>({id:t.id,total:20,mastered:20})))),null)
  assert.equal(recommendTopic([]),null)
  assert.equal(recommendTopic(studyTopics([{...topics[0],count:0}],[])),null)
})

import {parseCards,cardsToCsv,shuffled} from '../frontend/app/lib/learning.ts'
import {compareSpeech,speechWords} from '../frontend/app/lib/speech.ts'

test('pasted lines become cards with several separators and report bad lines',()=>{
  const text='boarding pass - thẻ lên máy bay - Please show your boarding pass.\n\nluggage | hành lý\ncheck-in\tlàm thủ tục\tWhere do I check in?\nwell-known; nổi tiếng\nmissing meaning\n - only meaning'
  const {cards,invalid}=parseCards(text)
  assert.deepEqual(cards.map(c=>c.english),['boarding pass','luggage','check-in','well-known'])
  assert.equal(cards[0].example,'Please show your boarding pass.')
  assert.equal(cards[2].vietnamese,'làm thủ tục')
  assert.deepEqual(invalid,[6,7])
  assert.deepEqual(parseCards('a - '+'x'.repeat(501)).invalid,[1])
})

test('CSV export quotes text and neutralises spreadsheet formulas',()=>{
  const csv=cardsToCsv([{english:'say "hi"',vietnamese:'chào, bạn',example:'=SUM(A1)',mastered:true}])
  assert.ok(csv.startsWith('﻿english,vietnamese,example,mastered\r\n'))
  assert.ok(csv.includes('"say ""hi""","chào, bạn","\'=SUM(A1)",1'))
})

test('shuffle keeps every item and leaves the source untouched',()=>{
  const items=[1,2,3,4,5]
  assert.deepEqual([...shuffled(items,()=>0)].sort(),items)
  assert.deepEqual(items,[1,2,3,4,5])
})

test('speech comparison marks recognised words in order and ignores punctuation',()=>{
  assert.deepEqual(speechWords("Where's the bus-stop, please?"),["where's",'the','bus','stop','please'])
  const full=compareSpeech('Could you help me, please?','could you help me please')
  assert.equal(full.score,100)
  assert.ok(full.words.every(w=>w.matched))
  const partial=compareSpeech("I'd like a cup of coffee.",'id like cup coffee')
  assert.deepEqual(partial.words.map(w=>w.matched),[true,true,false,true,false,true])
  assert.equal(partial.score,67)
  assert.equal(compareSpeech('Thank you','').score,0)
  assert.equal(compareSpeech('Hello there','there hello').score,50)
})
