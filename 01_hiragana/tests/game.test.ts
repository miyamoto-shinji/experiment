import { describe, expect, it } from 'vitest';
import { allLetters, hiragana } from '../src/curriculum';
import { advance, answer, createRound } from '../src/game';

function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
describe('ひらがな教材と出題', () => {
  it('46文字を五十音順で一度ずつ収録する', () => {
    const letters = allLetters(hiragana);
    expect(letters.map(letter => letter.glyph).join('')).toBe('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん');
    expect(letters).toHaveLength(46);
    expect(new Set(letters.map(letter => letter.id)).size).toBe(46);
  });
  it('どの行でも5問、3択、正解は1つ、同音の「お／を」は同居しない', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const group of hiragana.groups) {
        const round = createRound(hiragana, group.id, seeded(seed));
        expect(round.questions).toHaveLength(5);
        round.questions.forEach((question, index) => {
          expect(new Set(question.choices.map(letter => letter.id)).size).toBe(3);
          expect(question.choices.filter(letter => letter.id === question.target.id)).toHaveLength(1);
          expect(question.choices.every(letter => letter.groupId === group.id)).toBe(true);
          const glyphs = question.choices.map(letter => letter.glyph);
          expect(glyphs.includes('お') && glyphs.includes('を')).toBe(false);
          if (index) expect(question.target.id).not.toBe(round.questions[index - 1].target.id);
        });
        expect(new Set(round.questions.map(question => question.target.id)).size).toBe(group.letters.length);
      }
    }
  });
  it('正解の位置を変える', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed < 15; seed++) {
      for (const question of createRound(hiragana, 'row-0', seeded(seed)).questions) positions.add(question.choices.findIndex(letter => letter.id === question.target.id));
    }
    expect(positions.size).toBe(3);
  });
  it('「を」は読み方の説明と見本を必須にする', () => {
    const wo = allLetters(hiragana).find(letter => letter.glyph === 'を')!;
    expect(wo.showModel).toBe(true);
    expect(wo.prompt).toContain('くっつき');
  });
  it('不明な教材グループでは開始しない', () => { expect(() => createRound(hiragana, 'missing')).toThrow(); });
});
describe('ゲームの状態遷移', () => {
  it('間違えても同じ問題を続け、2回でヒントを出す', () => {
    const round = createRound(hiragana, 'row-0', seeded(4));
    const wrong = round.questions[0].choices.find(letter => letter.id !== round.questions[0].target.id)!;
    expect(answer(round, wrong.id)).toBe('retry');
    expect(round.showHint).toBe(false);
    expect(advance(round)).toBe('ignored');
    expect(answer(round, wrong.id)).toBe('retry');
    expect(round.showHint).toBe(true);
    expect(round.index).toBe(0);
  });
  it('連打しても二重採点せず、5問完了は一度だけ', () => {
    const round = createRound(hiragana, 'row-9', seeded(3));
    for (let index = 0; index < 5; index++) {
      const question = round.questions[index];
      expect(answer(round, 'not-a-choice')).toBe('ignored');
      expect(answer(round, question.target.id)).toBe('correct');
      expect(answer(round, question.target.id)).toBe('ignored');
      expect(advance(round)).toBe(index === 4 ? 'finished' : 'next');
      expect(advance(round)).toBe('ignored');
    }
    expect(round.completed).toBe(true);
    expect(answer(round, round.questions[4].target.id)).toBe('ignored');
  });
});
