import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readLearningRoute, learningRouteSearch} from '../frontend/app/learning-route.ts'

test('unknown view falls back to the home page', () => {
  assert.equal(readLearningRoute('?view=not-a-page').tab, 'home')
  assert.equal(readLearningRoute('?view=javascript%3Aalert(1)').tab, 'home')
})

test('reload restores topic, page and review filters', () => {
  const route = {tab:'flashcards', topic:'food', favorites:true, mistakes:true}
  assert.deepEqual(readLearningRoute(learningRouteSearch(route)), route)
})

test('only explicit filter values enable review and favorites', () => {
  const route = readLearningRoute('?view=phrases&mistakes=false&favorites=true')
  assert.equal(route.mistakes, false)
  assert.equal(route.favorites, false)
})

test('navigation URLs retain no account, answer or session data', () => {
  assert.equal(learningRouteSearch({tab:'home',topic:'',favorites:false,mistakes:false}), '')
  const route = readLearningRoute('?view=quiz&email=private@example.com&token=secret&answer=x')
  assert.equal(learningRouteSearch(route), '?view=quiz')
})

test('topic identifiers are safely URL-encoded and bounded', () => {
  const route = {tab:'phrases',topic:'chào hỏi & đi lại',favorites:false,mistakes:false}
  assert.deepEqual(readLearningRoute(learningRouteSearch(route)), route)
  assert.equal(readLearningRoute('?topic='+'x'.repeat(1000)).topic.length,100)
})


test('lesson pages can be opened directly and restored after reload', () => {
  assert.deepEqual(readLearningRoute('?view=lessons&topic=travel'), {
    tab:'lessons',topic:'travel',favorites:false,mistakes:false
  })
})

test('new learning areas are safe to restore directly', () => {
  for (const tab of ['ielts','specialist','vocabulary','tutor','placement','why','feedback','pictures']) {
    const route = {tab,topic:'',favorites:false,mistakes:false}
    assert.deepEqual(readLearningRoute(learningRouteSearch(route)),route)
  }
})
