import type { Course, Letter } from './curriculum';

export interface Question { target: Letter; choices: Letter[] }
export interface Round {
  questions: Question[];
  index: number;
  mistakes: number;
  solved: boolean;
  showHint: boolean;
  completed: boolean;
}

export function shuffled<T>(items: T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createRound(course: Course, groupId: string, random = Math.random): Round {
  const group = course.groups.find(group => group.id === groupId);
  if (!group || group.letters.length < 3) throw new Error('A group needs at least three letters.');
  const targets: Letter[] = [];
  while (targets.length < 5) {
    const batch = shuffled(group.letters, random);
    if (targets.at(-1)?.id === batch[0].id) [batch[0], batch[1]] = [batch[1], batch[0]];
    targets.push(...batch);
  }
  const questions = targets.slice(0, 5).map(target => {
    const alternatives = group.letters.filter(letter => letter.id !== target.id && !target.confusableWith?.includes(letter.glyph) && !letter.confusableWith?.includes(target.glyph));
    if (alternatives.length < 2) throw new Error('Not enough unambiguous choices.');
    return { target, choices: shuffled([target, ...shuffled(alternatives, random).slice(0, 2)], random) };
  });
  return { questions, index: 0, mistakes: 0, solved: false, showHint: false, completed: false };
}

export function answer(round: Round, letterId: string): 'correct' | 'retry' | 'ignored' {
  if (round.solved || round.completed) return 'ignored';
  const question = round.questions[round.index];
  if (!question.choices.some(letter => letter.id === letterId)) return 'ignored';
  if (letterId === question.target.id) {
    round.solved = true;
    return 'correct';
  }
  round.mistakes++;
  if (round.mistakes >= 2) round.showHint = true;
  return 'retry';
}

export function advance(round: Round): 'next' | 'finished' | 'ignored' {
  if (!round.solved || round.completed) return 'ignored';
  if (round.index === round.questions.length - 1) {
    round.completed = true;
    return 'finished';
  }
  round.index++;
  round.mistakes = 0;
  round.solved = false;
  round.showHint = false;
  return 'next';
}
