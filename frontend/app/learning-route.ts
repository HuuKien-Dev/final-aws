export const learningTabs = ['home', 'lessons', 'phrases', 'flashcards', 'quiz', 'progress', 'ielts', 'specialist', 'vocabulary', 'tutor', 'placement', 'why', 'feedback', 'pictures'] as const
export type LearningTab = typeof learningTabs[number]
export type LearningRoute = {tab: LearningTab; topic: string; favorites: boolean; mistakes: boolean}

export function readLearningRoute(search: string): LearningRoute {
  const params = new URLSearchParams(search)
  const requested = params.get('view')
  const tab = learningTabs.includes(requested as LearningTab) ? requested as LearningTab : 'home'
  const topic = (params.get('topic') || '').slice(0, 100)
  return {tab, topic, favorites: params.get('favorites') === '1', mistakes: params.get('mistakes') === '1'}
}

export function learningRouteSearch(route: LearningRoute): string {
  const params = new URLSearchParams()
  if (route.tab !== 'home') params.set('view', route.tab)
  if (route.topic) params.set('topic', route.topic)
  if (route.favorites) params.set('favorites', '1')
  if (route.mistakes) params.set('mistakes', '1')
  const search = params.toString()
  return search ? '?' + search : ''
}
