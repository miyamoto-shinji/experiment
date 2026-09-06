export interface Letter {
  id: string;
  glyph: string;
  spokenName: string;
  prompt: string;
  groupId: string;
  showModel?: boolean;
  confusableWith?: string[];
}
export interface LetterGroup { id: string; label: string; letters: Letter[] }
export interface Course { id: string; label: string; language: string; groups: LetterGroup[] }

const rows = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'やゆよ', 'らりるれろ', 'わをん'];
export const hiragana: Course = {
  id: 'hiragana', label: 'ひらがな', language: 'ja-JP',
  groups: rows.map((row, i) => ({
    id: `row-${i}`, label: row,
    letters: [...row].map(glyph => ({
      id: `hiragana-${glyph.codePointAt(0)!.toString(16)}`, glyph, groupId: `row-${i}`,
      spokenName: glyph === 'を' ? 'くっつきの、お' : glyph,
      prompt: glyph === 'を' ? 'くっつきの、お。おてほんと、おなじ もじを さがしてね。' : `「${glyph}」を、さがしてね。`,
      showModel: glyph === 'を',
      confusableWith: glyph === 'お' ? ['を'] : glyph === 'を' ? ['お'] : [],
    })),
  })),
};
export const allLetters = (course: Course) => course.groups.flatMap(group => group.letters);
