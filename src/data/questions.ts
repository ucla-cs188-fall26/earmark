/**
 * Tutorial questions (shape recognition on simple graphs) and test questions
 * (concrete values on realistic graphs). Each references a graph by id; the
 * listener hears that graph's sonification, answers, then sees the graph.
 * Owner: Person 3.
 */
import type { Question } from '../types.ts'

export const QUESTIONS: Question[] = [
  {
    id: 'q1',
    graphId: 'rising',
    prompt: 'What is the overall trend of this graph?',
    choices: ['Steadily rising', 'Steadily falling', 'Flat', 'Up then down'],
    correctIndex: 0,
    explanation: 'Every note is a step above the previous one, so the value rises steadily.',
  },
  {
    id: 'q2',
    graphId: 'spike',
    prompt: 'Which description best matches what you heard?',
    choices: [
      'Mostly flat with one sudden jump',
      'A smooth rise',
      'A smooth fall',
      'Up and down repeatedly',
    ],
    correctIndex: 0,
    explanation: 'The pitch stays near the trough, jumps to the peak for one note, then returns.',
  },
  {
    id: 'q3',
    graphId: 'falling',
    prompt: 'What is the overall trend of this graph?',
    choices: ['Steadily rising', 'Steadily falling', 'Flat', 'Up then down'],
    correctIndex: 1,
  },
  {
    id: 'q4',
    graphId: 'temperature',
    prompt: 'In which part of the year is the value highest?',
    choices: ['Start', 'Middle', 'End', 'It never changes'],
    correctIndex: 1,
  },
  {
    id: 'q5',
    graphId: 'peak',
    prompt: 'Where is the peak?',
    choices: ['Near the start', 'Near the middle', 'Near the end'],
    correctIndex: 1,
  },
  {
    id: 'q6',
    graphId: 'valley',
    prompt: 'Which description best matches what you heard?',
    choices: ['Dips then recovers', 'Rises then falls', 'Flat', 'Steadily rising'],
    correctIndex: 0,
  },
  {
    id: 'q7',
    graphId: 'plateau',
    prompt: 'What happens in the second half of the graph?',
    choices: ['It keeps rising', 'It levels off', 'It falls', 'It spikes'],
    correctIndex: 1,
  },
  {
    id: 'q8',
    graphId: 'step',
    prompt: 'How many distinct levels did you hear?',
    choices: ['One', 'Two', 'Three', 'Many'],
    correctIndex: 1,
  },
  {
    id: 'q9',
    graphId: 'stock',
    prompt: 'Is the final value higher or lower than the starting value?',
    choices: ['Higher', 'Lower', 'The same'],
    correctIndex: 0,
  },
  {
    id: 'q10',
    graphId: 'sine',
    prompt: 'Which description best matches what you heard?',
    choices: ['One full wave up and down', 'Steadily rising', 'A single spike', 'Flat'],
    correctIndex: 0,
  },
]

/**
 * Test questions ask about actual values and positions, the way a reader of
 * the real chart would be asked. Correct answers are spread across positions.
 */
export const TEST_QUESTIONS: Question[] = [
  {
    id: 't1',
    graphId: 'test-ambiguous-rise',
    prompt: 'Which month had the most active users?',
    choices: ['August', 'October', 'November', 'December'],
    correctIndex: 3,
    explanation: 'Users climb most of the year, dip slightly in Sep and Oct, then finish at the high of 58k in December.',
  },
  {
    id: 't2',
    graphId: 'test-double-oscillation',
    prompt: 'What was the high in the final week?',
    choices: ['57 °F', '67 °F', '72 °F', '77 °F'],
    correctIndex: 3,
    explanation: 'The preamble gives the highest value as 77, and the clip ends on that highest note.',
  },
  {
    id: 't3',
    graphId: 'test-peak-trough',
    prompt: 'On which day was air quality worst (highest AQI)?',
    choices: ['Aug 4', 'Aug 9', 'Aug 12', 'Aug 1'],
    correctIndex: 1,
    explanation: 'There are two rises. The second one goes higher, peaking at 50 on Aug 9.',
  },
  {
    id: 't4',
    graphId: 'test-saw-bias',
    prompt: 'How did consumer confidence end the year compared with January?',
    choices: ['Higher', 'Lower', 'About the same'],
    correctIndex: 1,
    explanation: 'It started at 80, bounced up and down, and finished at 75. The last note is below the first.',
  },
  {
    id: 't5',
    graphId: 'test-recovery-shock',
    prompt: 'In which month was the share price lowest?',
    choices: ['February', 'April', 'June', 'November'],
    correctIndex: 1,
    explanation: 'The price falls for the first four months, bottoms at $76 in April, then recovers.',
  },
  {
    id: 't6',
    graphId: 'test-drift-then-jump',
    prompt: 'Roughly how many visitors per minute were there at 10 am?',
    choices: ['35', '40', '52', '60'],
    correctIndex: 2,
    explanation: 'Traffic drifts up slowly overnight, then jumps between 9 and 10 am to its high of 52.',
  },
  {
    id: 't7',
    graphId: 'test-multi-peak',
    prompt: 'Which quarter had the highest revenue?',
    choices: ['2021 Q4', '2022 Q2', '2023 Q2', '2023 Q4'],
    correctIndex: 2,
    explanation: 'There are several local peaks. The highest, $70M, is in 2023 Q2, three notes from the end.',
  },
  {
    id: 't8',
    graphId: 'test-flat-then-surge',
    prompt: 'In which week did searches start climbing sharply?',
    choices: ['Week 2', 'Week 5', 'Week 8', 'Week 11'],
    correctIndex: 2,
    explanation: 'The first seven weeks hover around 50. From week 8 the notes rise every week to 76.',
  },
  {
    id: 't9',
    graphId: 'test-final-dip',
    prompt: 'What was the humidity at 11 pm?',
    choices: ['60%', '65%', '70%', '75%'],
    correctIndex: 1,
    explanation: 'Humidity peaks at 75% around 5 pm and slides to 65% by 11 pm, the lowest value and the last note.',
  },
  {
    id: 't10',
    graphId: 'test-reverse-wave',
    prompt: 'How many times did the price fall and then recover?',
    choices: ['Once', 'Twice', 'Three times'],
    correctIndex: 1,
    explanation: 'Two troughs: 57k in week 5 and 55k in week 10, each followed by a recovery.',
  },
]
