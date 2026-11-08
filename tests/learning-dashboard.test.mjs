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
