import { describe, expect, it } from 'vitest'
import { fourierNoise, generate, rng, toBank } from './generate.ts'
import { sonify } from '../audio/sonification.ts'
import { validateQuestion } from '../quiz/quiz.ts'

describe('generator', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(generate(7, 'medium')).toEqual(generate(7, 'medium'))
    expect(generate(7, 'medium')).not.toEqual(generate(8, 'medium'))
  })

  it.each(['easy', 'medium', 'hard'] as const)('produces 10 valid, answerable %s items', (level) => {
    const items = generate(42, level)
    expect(items).toHaveLength(10)
    for (const { graph, question } of items) {
      expect(() => validateQuestion(question)).not.toThrow()
      expect(question.graphId).toBe(graph.id)
      expect(graph.xLabels).toHaveLength(graph.points.length)
      expect(graph.title).not.toContain('undefined')
      expect(sonify(graph).notes.length).toBeGreaterThan(0)
    }
    const bank = toBank(items)
    expect(Object.keys(bank.graphs)).toHaveLength(10)
  })

  it('answers "where" questions with the real extreme', () => {
    for (const { graph, question } of generate(3, 'hard')) {
      if (!question.prompt.startsWith('Which')) continue
      if (!question.prompt.includes('highest') && !question.prompt.includes('spike') && !question.prompt.includes('lowest')) continue
      const ys = graph.points.map((p) => p.y)
      const want = question.prompt.includes('lowest') ? Math.min(...ys) : Math.max(...ys)
      expect(ys[graph.xLabels!.indexOf(question.choices[question.correctIndex])]).toBe(want)
    }
  })

  it('fourier noise is bounded and seeded', () => {
    const a = fourierNoise(16, 5, rng(1)), b = fourierNoise(16, 5, rng(1))
    expect(a).toEqual(b)
    expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(1)
    expect(fourierNoise(8, 0, rng(1))).toEqual(Array(8).fill(0))
  })
})
