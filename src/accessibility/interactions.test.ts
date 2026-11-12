/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ProgressBar } from '../components/ProgressBar.tsx'
import { QuestionCard } from '../components/QuestionCard.tsx'
import { QUESTIONS } from '../data/questions.ts'

const luminance=(hex:string)=>{
 const c=hex.match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4)
 return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722
}
describe('accessible interactions',()=>{
 it('describes question position rather than claiming completed listening',()=>{
  const html=renderToStaticMarkup(createElement(ProgressBar,{current:2,total:10}))
  expect(html).toContain('aria-label="Question progress"');expect(html).toContain('aria-valuetext="Question 2 of 10"')
 })
 it('exposes both chosen and correct answers in text after submission',()=>{
  const html=renderToStaticMarkup(createElement(QuestionCard,{question:QUESTIONS[0],chosenIndex:1,onAnswer:vi.fn()}))
  expect(html).toContain(`Your answer: ${QUESTIONS[0].choices[1]}`);expect(html).toContain(`Correct answer: ${QUESTIONS[0].choices[0]}`)
 })
 it('does not expose correct-answer feedback before submission',()=>{
  const html=renderToStaticMarkup(createElement(QuestionCard,{question:QUESTIONS[0],chosenIndex:null,disabled:true,onAnswer:vi.fn()}))
  expect(html).not.toContain('Correct answer:');expect(html).toContain('disabled')
 })
 it('has AA normal-text contrast for success text in both themes',()=>{
  const css=readFileSync('src/styles.css','utf8')
  const colors=[...css.matchAll(/--success:\s*#([a-f0-9]{6})/g)].map(m=>m[1])
  expect(colors).toHaveLength(2)
  for(const [i,bg] of ['fcfcfb','1a1a19'].entries()){
   const a=luminance(colors[i]),b=luminance(bg)
   expect((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toBeGreaterThanOrEqual(4.5)
  }
 })
})
