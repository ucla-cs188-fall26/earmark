/**
 * App shell. Owner: Person 4.
 *
 * Routes (hash-based, no router dependency):
 *   #            the lesson
 *   #playground  engine test page: pick any graph, play it, see the notes
 */
import { useScreenFocus } from './accessibility/useScreenFocus.ts'
import { useEffect, useState } from 'react'
import { Lesson } from './components/Lesson.tsx'
import { Playground } from './components/Playground.tsx'

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const playground = hash === '#playground'
  const testMode = hash === '#test'
  useScreenFocus(hash, playground ? '.stage h2' : '.intro > h2')
  useEffect(() => { document.title = `${playground ? 'Playground' : testMode ? 'Test' : 'Tutorial'} — Earmark` }, [playground, testMode])

  return (
    <main className="app">
      <header>
        <h1>Earmark</h1>
        <nav className="nav" aria-label="Activity">
          <a href="#test" aria-current={testMode ? 'page' : undefined}>
            Test
          </a>
          <a href="#" aria-current={!playground && !testMode ? 'page' : undefined}>
            Tutorial
          </a>
          <a href="#playground" aria-current={playground ? 'page' : undefined}>
            Playground
          </a>
        </nav>
      </header>
      {playground ? <Playground /> : <Lesson key={testMode ? 'test' : 'tutorial'} mode={testMode ? 'test' : 'tutorial'} />}
    </main>
  )
}
