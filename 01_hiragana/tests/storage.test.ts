import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, parseProgress, ProgressStore } from '../src/storage';
afterEach(() => vi.unstubAllGlobals());
describe('ブラウザ内の記録', () => {
  it('壊れた記録・未知の版は初期状態で開く', () => {
    for (const value of [null, '{', 'null', '[]', '{"version":2}', '{"version":1,"courses":null}']) expect(parseProgress(value)).toEqual(emptyProgress());
  });
  it('既存の記録と設定を復元し、重複した文字を整理する', () => {
    const parsed = parseProgress(JSON.stringify({ version: 1, courses: { hiragana: { played: ['a', 'a', 'i'], stamps: 3 } }, settings: { sound: false, rate: 0.7, reduceMotion: true } }));
    expect(parsed.courses.hiragana).toEqual({ played: ['a', 'i'], stamps: 3 });
    expect(parsed.settings).toEqual({ sound: false, rate: 0.7, reduceMotion: true });
  });
  it('不正な数値や設定を取り込まない', () => {
    const parsed = parseProgress('{"version":1,"courses":{"hiragana":{"played":[],"stamps":-2}},"settings":{"sound":"false","rate":999}}');
    expect(parsed.courses.hiragana.stamps).toBe(0);
    expect(parsed.settings).toEqual(emptyProgress().settings);
  });
  it('保存拒否時も遊んだ記録をメモリに保つ', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('denied'); } });
    const store = new ProgressStore();
    store.recordLetter('hiragana', 'a'); store.recordLetter('hiragana', 'a'); store.awardStamp('hiragana');
    expect(store.available).toBe(false);
    expect(store.course('hiragana')).toEqual({ played: ['a'], stamps: 1 });
    store.data.settings.sound = false; store.reset();
    expect(store.course('hiragana')).toEqual({ played: [], stamps: 0 });
    expect(store.data.settings.sound).toBe(false);
  });
  it('起動後の容量不足でも進行を止めない', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => { throw new Error('quota'); } } });
    const store = new ProgressStore(); expect(store.available).toBe(true);
    store.awardStamp('hiragana');
    expect(store.available).toBe(false); expect(store.course('hiragana').stamps).toBe(1);
  });
});
