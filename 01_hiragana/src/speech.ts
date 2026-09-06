import type { Preferences } from './storage';
export type VoiceStatus = 'loading' | 'ready' | 'unavailable';

export class Voice {
  status: VoiceStatus = 'loading';
  private voice?: SpeechSynthesisVoice;
  private generation = 0;
  private utterance?: SpeechSynthesisUtterance;
  private timeout?: number;
  private startTimeout?: number;
  private synth?: SpeechSynthesis;
  constructor(private settings: () => Preferences, private onChange: () => void, private language = 'ja-JP') {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window) || !window.speechSynthesis) {
      this.status = 'unavailable';
      return;
    }
    this.synth = window.speechSynthesis;
    this.synth.addEventListener('voiceschanged', this.refresh);
    this.refresh();
    if (this.status === 'loading') this.timeout = window.setTimeout(() => {
      if (this.status === 'loading') this.setStatus('unavailable');
    }, 1500);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
  }
  private setStatus(status: VoiceStatus) {
    if (this.status !== status) { this.status = status; this.onChange(); }
  }
  private refresh = () => {
    try {
      const voices = this.synth?.getVoices() ?? [];
      const match = voices.filter(voice => voice.lang.toLowerCase().split('-')[0] === this.language.split('-')[0]);
      this.voice = match.find(voice => voice.localService) ?? match[0];
      if (this.voice) { window.clearTimeout(this.timeout); this.setStatus('ready'); }
      else if (voices.length) this.setStatus('unavailable');
    } catch { this.setStatus('unavailable'); }
  };
  get audible() { return this.settings().sound && this.status === 'ready'; }
  cancel() {
    this.generation++;
    window.clearTimeout(this.startTimeout);
    try { this.synth?.cancel(); } catch { /* A stopped speech service must not stop play. */ }
    this.utterance = undefined;
  }
  speak(text: string) {
    this.cancel();
    if (!this.audible || !this.synth || !this.voice) return;
    const generation = this.generation;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      this.utterance = utterance;
      utterance.voice = this.voice;
      utterance.lang = this.language;
      utterance.rate = this.settings().rate;
      utterance.pitch = 1.08;
      utterance.onstart = () => { if (generation === this.generation) window.clearTimeout(this.startTimeout); };
      utterance.onend = () => {
        if (generation === this.generation) { window.clearTimeout(this.startTimeout); this.utterance = undefined; }
      };
      utterance.onerror = event => {
        if (generation === this.generation && event.error !== 'interrupted' && event.error !== 'canceled') {
          this.utterance = undefined;
          window.clearTimeout(this.startTimeout);
          this.setStatus('unavailable');
        }
      };
      this.startTimeout = window.setTimeout(() => {
        if (generation === this.generation) { this.cancel(); this.setStatus('unavailable'); }
      }, 4000);
      this.synth.speak(this.utterance);
    } catch { this.setStatus('unavailable'); }
  }
  retry() { this.refresh(); this.speak('こんにちは。くまのモクだよ。いっしょに あそぼう。'); }
}
