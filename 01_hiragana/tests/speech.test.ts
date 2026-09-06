import { afterEach, describe, expect, it, vi } from 'vitest';
import { Voice } from '../src/speech';
import { emptyProgress } from '../src/storage';

class Utterance {
  text: string;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (event: { error: string }) => void;
  constructor(text: string) { this.text = text; }
}
function environment(initialVoices = [{ name: 'Japanese', lang: 'ja-JP', localService: true }]) {
  vi.useFakeTimers();
  let voices = initialVoices;
  const synth = Object.assign(new EventTarget(), { getVoices: () => voices, cancel: vi.fn(), speak: vi.fn() });
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance, setTimeout, clearTimeout });
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  const settings = emptyProgress().settings;
  const changed = vi.fn();
  const voice = new Voice(() => settings, changed);
  return { voice, synth, settings, changed, setVoices: (next: typeof voices) => { voices = next; synth.dispatchEvent(new Event('voiceschanged')); } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('音声サービス', () => {
  it('開始操作前には読み上げず、連続操作では前の音声を止める', () => {
    const { voice, synth } = environment();
    expect(voice.status).toBe('ready'); expect(synth.speak).not.toHaveBeenCalled();
    voice.speak('あ'); const previous = synth.speak.mock.calls[0][0] as Utterance;
    voice.speak('い');
    previous.onerror?.({ error: 'not-allowed' });
    expect(voice.status).toBe('ready'); expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect((synth.speak.mock.calls[1][0] as Utterance).text).toBe('い');
  });
  it('音声一覧の遅延を待ち、後から日本語が利用可能になれば復帰する', () => {
    const { voice, setVoices } = environment([]);
    expect(voice.status).toBe('loading');
    vi.advanceTimersByTime(1501); expect(voice.status).toBe('unavailable');
    setVoices([{ name: 'Japanese', lang: 'ja-JP', localService: true }]);
    expect(voice.status).toBe('ready');
  });
  it('読み上げが開始しない場合にお手本モードへ移る', () => {
    const { voice, synth } = environment();
    voice.speak('あ'); vi.advanceTimersByTime(4001);
    expect(voice.status).toBe('unavailable'); expect(synth.cancel).toHaveBeenCalledTimes(2);
  });
  it('開始済みの長い音声やキャンセル済みのタイマーは失敗としない', () => {
    const { voice, synth } = environment();
    voice.speak('あ'); (synth.speak.mock.calls[0][0] as Utterance).onstart?.();
    vi.advanceTimersByTime(5000); expect(voice.status).toBe('ready');
    voice.speak('い'); voice.cancel(); vi.advanceTimersByTime(5000);
    expect(voice.status).toBe('ready');
  });
  it('消音時は発話せず、実際の音声エラーでは切り替える', () => {
    const { voice, synth, settings } = environment();
    settings.sound = false; voice.speak('あ'); expect(synth.speak).not.toHaveBeenCalled();
    settings.sound = true; voice.speak('い');
    (synth.speak.mock.calls[0][0] as Utterance).onerror?.({ error: 'not-allowed' });
    expect(voice.status).toBe('unavailable');
  });
});
