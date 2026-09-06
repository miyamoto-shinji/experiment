import './style.css';
import { allLetters, hiragana } from './curriculum';
import type { Letter } from './curriculum';
import { answer, advance, createRound } from './game';
import type { Round } from './game';
import { ProgressStore } from './storage';
import { Voice } from './speech';
import type { Forest } from './forest';

type Screen = 'home' | 'groups' | 'practice' | 'quiz' | 'reward' | 'dictionary' | 'parents';
const course = hiragana;
const letters = allLetters(course);
const store = new ProgressStore();
const app = document.querySelector<HTMLElement>('#app')!;
const header = document.querySelector<HTMLElement>('#header')!;
const footer = document.querySelector<HTMLElement>('#footer')!;
let screen: Screen = 'home';
let selectedGroup = course.groups[0].id;
let sampleIndex = 0;
let round: Round | undefined;
let feedback = '';
let lastWrong = '';
let dictionaryActive = '';
let resetPrompt = false;
let forest: Forest | undefined;
let forestFailed = false;
let voice: Voice;
let lastChoiceAt = 0;

const paths: Record<string, string> = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m0-6-6 6"/>',
  book: '<path d="M12 6C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/>',
  leaf: '<path d="M20 3C8 2 2 7 5 15c8 5 15-1 15-12ZM3 21l11-12"/>',
  home: '<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3V10Z"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 4 12 8 15 4-3 13-10 8-15Z"/>',
  replay: '<path d="M3 10a9 9 0 1 1 1 7M3 3v7h7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.leaf}</svg>`;
const flower = (cls = '') => `<svg class="flower ${cls}" viewBox="0 0 60 60" aria-hidden="true"><g fill="currentColor"><ellipse cx="30" cy="17" rx="9" ry="13"/><ellipse cx="42" cy="26" rx="13" ry="9" transform="rotate(-18 42 26)"/><ellipse cx="37" cy="41" rx="9" ry="13" transform="rotate(-30 37 41)"/><ellipse cx="22" cy="40" rx="9" ry="13" transform="rotate(30 22 40)"/><ellipse cx="17" cy="25" rx="13" ry="9" transform="rotate(18 17 25)"/></g><circle cx="30" cy="29" r="8" fill="#ebbd64"/></svg>`;
const bearFace = () => `<svg class="bear-face" viewBox="0 0 80 75" aria-hidden="true"><g fill="#bf8d5e"><circle cx="16" cy="17" r="13"/><circle cx="64" cy="17" r="13"/><ellipse cx="40" cy="39" rx="34" ry="31"/></g><g fill="#e8c79d"><circle cx="16" cy="17" r="7"/><circle cx="64" cy="17" r="7"/><ellipse cx="40" cy="48" rx="15" ry="11"/></g><g fill="#493b2c"><circle cx="27" cy="35" r="2.7"/><circle cx="53" cy="35" r="2.7"/><ellipse cx="40" cy="43" rx="5" ry="3.5"/></g><path d="M35 51q5 6 10 0" fill="none" stroke="#493b2c" stroke-width="2" stroke-linecap="round"/></svg>`;
const action = (name: string, label: string, cls = 'button secondary', attrs = '') => `<button type="button" class="${cls}" data-action="${name}" ${attrs}>${label}</button>`;
const group = () => course.groups.find(item => item.id === selectedGroup)!;
const progress = () => store.course(course.id);
const playedCount = () => progress().played.filter(id => letters.some(letter => letter.id === id)).length;
const reduced = () => store.data.settings.reduceMotion;
const isVisual = () => !voice?.audible;
const stage = (size = '') => `<div class="scene-slot ${size}" role="img" aria-label="森で待っているくまのモクとうさぎ"><div class="scene-halo"></div><div class="forest-fallback"><div class="fallback-tree tree-left">${icon('leaf')}</div><div class="fallback-tree tree-right">${icon('leaf')}</div><div class="fallback-bear">${bearFace()}</div><div class="fallback-grass"></div></div></div>`;
const breadcrumb = (label: string, backScreen = 'home') => `<div class="breadcrumb">${action(`go-${backScreen}`, `${icon('back')}<span>もどる</span>`, 'text-button')}<span>${label}</span><span class="trail-leaf">${icon('leaf')}</span></div>`;
const visualNote = () => isVisual() ? '<p class="visual-note">おてほんを みて、いっしょに あそぼう</p>' : '';

function homeView() {
  return `<section class="home-page">
    <div class="home-hero">
      <div class="home-copy">
        <div class="eyebrow"><span></span> はじめての ひらがなあそび</div>
        <h1 class="home-title kana">もじの<span class="title-bottom">もり${icon('leaf', 'title-leaf')}</span></h1>
        <p class="home-description kana">きいて、みつけて、できた！<br><span>もりの ともだちと、</span><span>もじを あつめよう。</span></p>
        ${action('go-groups', `<span class="play-triangle"></span>あそぶ${icon('arrow')}`, 'button primary play-button kana')}
        <p class="home-small">1かい 5もん ・ じかんは たっぷり</p>
      </div>
      <div class="hero-forest">${stage('home-stage')}<div class="hello-bubble kana">ぼくは モク。<br>いっしょに あそぼう！<span>くまの モク</span></div><div class="forest-caption"><span class="tiny-spark">✧</span> もじを みつけると、もりに はなが さくよ</div></div>
    </div>
    <div class="home-bottom">
      <div class="discovery"><div class="discovery-icon">${flower()}</div><div><span class="section-kicker">きみの もりのきろく</span><p class="kana">であった もじ <strong>${playedCount()}</strong><span> / 46</span></p></div><div class="discovery-track" aria-hidden="true"><span style="width:${playedCount() / 46 * 100}%"></span></div></div>
      ${action('go-dictionary', `<span class="book-mark">${icon('book')}</span><span><strong class="kana">もじずかん</strong><small>タッチして、きいてみよう</small></span>${icon('arrow')}`, 'dictionary-link')}
    </div>
    <div class="home-values"><span>${icon('sound')} おとで おぼえる</span><i></i><span>${icon('heart')} まちがえても だいじょうぶ</span><i></i><span>${icon('leaf')} じぶんの ペースで</span></div>
  </section>`;
}

function groupsView() {
  return `<section class="page groups-page">${breadcrumb('あそぶ もじを えらぼう')}
    <div class="page-heading"><span class="section-kicker">ちいさな いっぽから</span><h1 class="kana">どの もじで あそぶ？</h1><p>すきな もじを えらんでね。</p></div>
    <div class="group-grid" role="group" aria-label="あそぶ行">${course.groups.map((row, index) => `<button class="group-card ${row.id === selectedGroup ? 'selected' : ''}" data-action="select-group" data-id="${row.id}" aria-pressed="${row.id === selectedGroup}"><span class="group-number">${String(index + 1).padStart(2, '0')}</span><span class="kana">${row.label}</span><span class="group-check">${row.id === selectedGroup ? icon('check') : icon('leaf')}</span></button>`).join('')}</div>
    <div class="selection-footer"><span>${bearFace()}<span class="kana">すこしずつで だいじょうぶ。</span></span>${action('start-practice', `はじめる${icon('arrow')}`, 'button primary kana')}</div>
  </section>`;
}

function practiceView() {
  const letter = group().letters[sampleIndex];
  return `<section class="page learning-page">${breadcrumb('まずは きいてみよう', 'groups')}
    <div class="lesson-layout"><div class="lesson-world">${stage('lesson-stage')}<div class="mok-caption">${bearFace()}<p class="kana">もじを タッチすると<br>こえが きこえるよ。</p></div></div>
    <div class="lesson-content"><span class="section-kicker">おてほん ・ ${group().label}</span><h1 class="kana">こんな おとだよ</h1>
      <button class="sample-card kana" data-action="hear-sample" aria-label="${letter.glyph}をきく"><span>${letter.glyph}</span>${icon('sound')}</button>
      ${letter.showModel ? '<p class="wo-note">くっつきの「を」だよ</p>' : ''}
      <div class="sample-options" role="group" aria-label="おてほんの文字">${group().letters.map((item, index) => `<button class="mini-letter kana ${index === sampleIndex ? 'active' : ''}" data-action="select-sample" data-index="${index}" aria-label="${item.glyph}のおてほん" aria-pressed="${index === sampleIndex}">${item.glyph}</button>`).join('')}</div>
      ${visualNote()}<p class="practice-help">みつける じゅんびは できたかな？</p>
      ${action('start-quiz', `もじを さがす${icon('arrow')}`, 'button primary kana')}
    </div></div></section>`;
}

function quizView() {
  if (!round) return '';
  const question = round.questions[round.index];
  const showModel = round.showHint || question.target.showModel || isVisual();
  const done = round.index + (round.solved ? 1 : 0);
  return `<section class="page quiz-page">${breadcrumb(group().label, 'groups')}
    <div class="round-progress"><div class="flower-steps" aria-label="5もんのうち ${done}もんできた">${Array.from({ length: 5 }, (_, index) => `<span class="${index < done ? 'earned' : index === round!.index ? 'current' : ''}">${flower()}</span>`).join('')}</div><span>${round.index + 1}<small> / 5 もん</small></span></div>
    <div class="quiz-world">${stage('quiz-stage')}<div class="question-bubble"><span class="section-kicker">${round.solved ? 'みつけたね！' : 'よーく きいてね'}</span><h1 class="kana">${round.solved ? 'その もじだよ！' : isVisual() ? 'おなじ もじは どれ？' : 'どの もじ かな？'}</h1>${showModel || round.solved ? `<div class="question-model kana" aria-label="おてほん ${question.target.glyph}">${question.target.glyph}</div>${question.target.showModel ? '<small>くっつきの「を」</small>' : ''}` : '<div class="listening-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>'}</div></div>
    <div class="choice-grid" role="group" aria-label="こたえの文字">${question.choices.map((letter, index) => `<button class="letter-choice kana choice-${index} ${round!.solved && letter.id === question.target.id ? 'correct' : ''} ${round!.mistakes >= 2 && letter.id === question.target.id ? 'hinted' : ''} ${lastWrong === letter.id ? 'try-again' : ''}" data-action="answer" data-id="${letter.id}" aria-label="${letter.glyph}" ${round!.solved ? 'disabled' : ''}>${letter.glyph}${round!.solved && letter.id === question.target.id ? `<span class="correct-badge">${icon('check')}</span>` : ''}</button>`).join('')}</div>
    <div class="feedback-area" role="status"><p class="kana">${feedback || 'あわてなくて だいじょうぶ。'}</p></div>
    <div class="quiz-actions">${round.solved ? action('next', `${round.index === 4 ? 'ごほうびを みる' : 'つぎの もじへ'}${icon('arrow')}`, 'button primary kana next-button') : `${action('replay', `${icon('sound')}もういちど きく`, 'button secondary kana', isVisual() ? 'disabled' : '')}${action('hint', `${icon('book')}おてほん`, 'button quiet kana')}`}</div>
    ${visualNote()}
  </section>`;
}

function rewardView() {
  return `<section class="page reward-page"><div class="reward-heading"><span class="section-kicker">5もん あそべたね</span><h1 class="kana">きみの はなが さいたよ！</h1><p class="kana">モクも うれしそう。また いっしょに あそぼうね。</p></div>
    <div class="reward-world">${stage('reward-stage')}<div class="stamp-medal">${flower()}<span class="kana">できた！</span></div><span class="reward-spark spark-one">✧</span><span class="reward-spark spark-two">✦</span></div>
    <div class="reward-summary">${flower()}<span>あつめた はな <strong>${progress().stamps}</strong> こ</span></div>
    <div class="reward-actions">${action('again', `${icon('replay')}もういちど`, 'button primary kana')}${action('go-home', `${icon('home')}おしまい`, 'button secondary kana')}</div>
  </section>`;
}

function dictionaryView() {
  return `<section class="page dictionary-page">${breadcrumb('もじずかん')}<div class="page-heading"><span class="section-kicker">きいて みよう、46の おと</span><h1 class="kana">もじずかん</h1><p>すきな もじを タッチしてね。</p></div>
    <div class="dictionary-meta"><span>${icon('leaf')} であった もじ <strong>${playedCount()} / 46</strong></span><span><i></i> あそんだ しるし</span></div>
    <div class="letter-dictionary">${course.groups.map(row => `<div class="dictionary-row">${row.letters.map(letter => `<button class="dictionary-letter kana ${progress().played.includes(letter.id) ? 'visited' : ''} ${dictionaryActive === letter.id ? 'active' : ''}" data-action="dictionary-letter" data-id="${letter.id}" aria-label="${letter.glyph}をきく">${letter.glyph}<span class="visited-dot" aria-hidden="true"></span></button>`).join('')}</div>`).join('')}</div>
    <p class="dictionary-spoken kana" role="status">${dictionaryActive ? `${letters.find(letter => letter.id === dictionaryActive)?.showModel ? 'くっつきの「を」だよ' : `「${letters.find(letter => letter.id === dictionaryActive)?.glyph}」だよ`}` : 'どんな おとが するかな？'}</p>${visualNote()}
  </section>`;
}

function parentsView() {
  return `<section class="page parents-page">${breadcrumb('おうちのひとへ')}<div class="page-heading"><span class="section-kicker">ちいさな「できた」を、いっしょに。</span><h1>おうちのひとへ</h1><p>お子さまのペースで、ひらがなに親しむ時間に。</p></div>
    <div class="parent-card"><h2>${icon('sound')}音声と動き</h2><label class="setting-row"><span><strong>読み上げ音声</strong><small>端末の日本語音声で読み上げます。</small></span><input type="checkbox" id="sound-setting" ${store.data.settings.sound ? 'checked' : ''} role="switch" aria-label="読み上げ音声" /></label>
    <label class="setting-row"><span><strong>読む速さ</strong><small>聞き取りやすい速さを選んでください。</small></span><select id="rate-setting" aria-label="読む速さ"><option value="0.7" ${store.data.settings.rate === 0.7 ? 'selected' : ''}>ゆっくり</option><option value="0.85" ${store.data.settings.rate === 0.85 ? 'selected' : ''}>ふつう</option><option value="1" ${store.data.settings.rate === 1 ? 'selected' : ''}>はやめ</option></select></label>
    <label class="setting-row"><span><strong>動きをひかえめにする</strong><small>キャラクターの動きを減らします。</small></span><input type="checkbox" id="motion-setting" ${store.data.settings.reduceMotion ? 'checked' : ''} role="switch" aria-label="動きをひかえめにする" /></label>
    <div class="voice-check"><p role="status">${voice.status === 'ready' ? '日本語の読み上げ音声が使えます。' : voice.status === 'loading' ? '日本語の音声を確認しています。' : '日本語の音声が利用できません。お手本を見て選ぶ遊びに切り替えています。端末の音声設定や、日本語音声のダウンロードをご確認ください。'}</p>${action('test-voice', `${icon('sound')}音声を確認する`, 'button secondary', !store.data.settings.sound ? 'disabled' : '')}</div>
    <p class="parent-note">声や発音は端末により異なります。聞こえない場合は、音量・消音設定もご確認ください。「を」は「くっつきの を」として、お手本と一緒に紹介します。</p></div>
    <div class="parent-card"><h2>${icon('leaf')}このブラウザの記録</h2><div class="parent-stats"><span>であった文字<strong>${playedCount()}<small> / 46</small></strong></span><span>集めた花<strong>${progress().stamps}<small> こ</small></strong></span></div><p class="parent-note">文字につく印は「遊んだ記録」です。習得を判定するものではありません。記録はこの端末の同じブラウザに保存されます。サイトのデータを消すと記録も消えます。</p>${!store.available ? '<p class="storage-notice" role="status">このブラウザでは記録を保存できません。今開いている間は、そのまま遊べます。</p>' : ''}${action('request-reset', '遊んだ記録をリセット', 'text-button danger')}</div>
    <div class="parent-card about-card"><h2>${icon('heart')}遊びのヒント</h2><p>最初は「あいうえお」から。音を聞いたら、いっしょに声に出してみてください。迷ったときは「おてほん」を押せば大丈夫。5問ごとに一区切りなので、いつでもおしまいにできます。</p><p>ひらがな46文字を収録しています。濁音・半濁音・小さい文字、かたかな、アルファベットは今後の拡張対象です。</p><p class="parent-note">もじのもり v1.0 · フォント：Klee One / Fontworks（SIL OFL 1.1）<br>3D描画：Three.js（MIT）。素材・フォントは同梱しています。</p></div>
    ${resetPrompt ? `<dialog id="reset-dialog" aria-labelledby="reset-title"><div class="dialog-flower">${flower()}</div><h2 id="reset-title">遊んだ記録を消しますか？</h2><p>であった文字と集めた花が、最初に戻ります。音声・動きの設定は残ります。</p><div class="dialog-actions">${action('cancel-reset', 'やめる', 'button secondary')}${action('confirm-reset', '記録を消す', 'button danger-button')}</div></dialog>` : ''}
  </section>`;
}

function render(focus?: string) {
  document.body.dataset.screen = screen;
  document.body.classList.toggle('reduced-motion', reduced());
  header.innerHTML = `<button class="brand" data-action="go-home" aria-label="もじのもり ホーム"><span class="brand-flower">${flower()}</span><span class="kana">もじのもり</span></button><div class="header-actions"><span class="course-pill"><i></i>ひらがな <span>46もじ</span></span>${action('toggle-sound', icon(store.data.settings.sound ? 'sound' : 'mute'), 'icon-button sound-toggle', `aria-label="${store.data.settings.sound ? 'おとを けす' : 'おとを だす'}" aria-pressed="${store.data.settings.sound}"`)}${action('go-parents', `${icon('heart')}<span>おうちのひとへ</span>`, 'parent-link', 'aria-label="おうちのひとへ"')}</div>`;
  const views: Record<Screen, () => string> = { home: homeView, groups: groupsView, practice: practiceView, quiz: quizView, reward: rewardView, dictionary: dictionaryView, parents: parentsView };
  app.innerHTML = views[screen]();
  footer.innerHTML = `<span>MOJI NO MORI</span><span>あそびの なかに、まなびの め。</span>${screen !== 'home' ? action('go-home', `${icon('home')}ホーム`, 'footer-home') : '<span class="footer-dots">● ● ●</span>'}`;
  const slot = app.querySelector<HTMLElement>('.scene-slot');
  if (slot && forest && !forestFailed) {
    slot.classList.add('has-3d');
    forest.mount(slot, screen === 'home' ? 'home' : screen === 'reward' ? 'reward' : 'play', screen === 'reward' ? 5 : screen === 'quiz' && round ? round.index + Number(round.solved) : 0, reduced());
  }
  if (resetPrompt && screen === 'parents') {
    const dialog = document.querySelector<HTMLDialogElement>('#reset-dialog')!;
    dialog.showModal();
    dialog.addEventListener('cancel', () => { resetPrompt = false; });
    dialog.querySelector<HTMLElement>('[data-action="cancel-reset"]')?.focus();
  }
  if (focus) app.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
}

function navigate(next: Screen) {
  voice.cancel(); feedback = ''; lastWrong = ''; resetPrompt = false;
  screen = next; render(); window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = app.querySelector<HTMLElement>('h1');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
function hear(letter: Letter) {
  store.recordLetter(course.id, letter.id);
  voice.speak(letter.showModel ? 'くっつきの、お、だよ。' : `「${letter.spokenName}」。`);
}
function startPractice() { sampleIndex = 0; navigate('practice'); hear(group().letters[0]); }
function startQuiz() {
  round = createRound(course, selectedGroup); lastChoiceAt = 0;
  navigate('quiz'); voice.speak(round.questions[0].target.prompt);
}

document.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  const name = button.dataset.action!;
  if (name.startsWith('go-')) { navigate(name.slice(3) as Screen); return; }
  switch (name) {
    case 'toggle-sound':
      store.data.settings.sound = !store.data.settings.sound; store.save(); voice.cancel(); render(); break;
    case 'select-group':
      selectedGroup = button.dataset.id!; render(`[data-id="${selectedGroup}"]`); break;
    case 'start-practice': startPractice(); break;
    case 'select-sample':
      sampleIndex = Number(button.dataset.index); hear(group().letters[sampleIndex]); render(`[data-index="${sampleIndex}"]`); break;
    case 'hear-sample': hear(group().letters[sampleIndex]); break;
    case 'start-quiz': startQuiz(); break;
    case 'answer': {
      if (!round || screen !== 'quiz' || performance.now() - lastChoiceAt < 350) return;
      lastChoiceAt = performance.now();
      const result = answer(round, button.dataset.id!);
      if (result === 'correct') {
        const target = round.questions[round.index].target;
        store.recordLetter(course.id, target.id); lastWrong = '';
        feedback = 'できた！ はなが さいたよ。';
        render('.next-button'); forest?.celebrate();
        voice.speak(`みつけたね。${target.spokenName}、だよ。`);
      } else if (result === 'retry') {
        lastWrong = button.dataset.id!;
        feedback = round.mistakes >= 2 ? 'ひかっている もじを みてみよう。' : 'もういちど やってみよう。';
        render(`[data-id="${lastWrong}"]`); voice.speak(round.mistakes >= 2 ? 'おてほんを みてみよう。' : 'もういちど、やってみよう。');
      }
      break;
    }
    case 'hint':
      if (round) { round.showHint = true; render('[data-action="hint"]'); voice.speak(round.questions[round.index].target.prompt); } break;
    case 'replay': if (round) voice.speak(round.questions[round.index].target.prompt); break;
    case 'next': {
      if (!round || screen !== 'quiz') return;
      const result = advance(round);
      if (result === 'finished') { store.awardStamp(course.id); navigate('reward'); forest?.celebrate(); voice.speak('ごもん、あそべたね。きみの はなが さいたよ。'); }
      else if (result === 'next') { feedback = ''; lastWrong = ''; lastChoiceAt = performance.now(); render(); voice.speak(round.questions[round.index].target.prompt); }
      break;
    }
    case 'again': startPractice(); break;
    case 'dictionary-letter': {
      const letter = letters.find(letter => letter.id === button.dataset.id)!;
      dictionaryActive = letter.id; hear(letter); render(`[data-id="${letter.id}"]`); break;
    }
    case 'test-voice': voice.retry(); break;
    case 'request-reset': resetPrompt = true; render(); break;
    case 'cancel-reset': resetPrompt = false; render('[data-action="request-reset"]'); break;
    case 'confirm-reset': store.reset(); resetPrompt = false; dictionaryActive = ''; round = undefined; render('[data-action="request-reset"]'); break;
  }
});
document.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'sound-setting') store.data.settings.sound = target.checked;
  else if (target.id === 'motion-setting') store.data.settings.reduceMotion = target.checked;
  else if (target.id === 'rate-setting') store.data.settings.rate = Number(target.value);
  else return;
  voice.cancel(); store.save(); render(`#${target.id}`);
});

voice = new Voice(() => store.data.settings, () => queueMicrotask(() => render()));
render();
async function loadForest() {
  try {
    const [{ Forest }] = await Promise.all([import('./forest'), document.fonts.load('600 64px "Klee One"', 'あいう')]);
    forest = new Forest(() => { forestFailed = true; render(); }); render();
  } catch { forestFailed = true; render(); }
}
void loadForest();
window.addEventListener('pagehide', () => voice.cancel());
