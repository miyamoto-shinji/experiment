import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function mockVoice(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    Object.assign(window, { __spoken: spoken });
    class Utterance { text: string; onstart?: () => void; constructor(text: string) { this.text = text; } }
    const synth = new EventTarget();
    Object.assign(synth, {
      getVoices: () => [{ name: 'Test Japanese', lang: 'ja-JP', localService: true }],
      cancel: () => {}, speak: (utterance: Utterance) => { spoken.push(utterance.text); utterance.onstart?.(); },
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
  });
}

async function start(page: Page) {
  await page.getByRole('button', { name: 'あそぶ', exact: true }).click();
  await expect(page.getByRole('button', { name: /01.*あいうえお/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'はじめる', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'こんな おとだよ' })).toBeVisible();
  await page.getByRole('button', { name: 'もじを さがす', exact: true }).click();
}

test('3Dホームと縦横の画面が収まり、各ボタンを操作できる', async ({ page }, info) => {
  await mockVoice(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.has-3d canvas')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `test-results/${info.project.name}-home.png`, fullPage: true });
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await start(page);
  await page.getByRole('button', { name: 'おてほん', exact: true }).click();
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const boxes = await page.locator('.letter-choice').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    expect(boxes).toHaveLength(3);
    expect(boxes.every(box => box.width >= 80 && box.height >= 80 && box.x >= 0 && box.right <= size.width)).toBe(true);
    expect(boxes[0].right).toBeLessThan(boxes[1].x);
    expect(boxes[1].right).toBeLessThan(boxes[2].x);
  }
  await page.screenshot({ path: `test-results/${info.project.name}-quiz.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('お手本、誤答ヒント、5問完了、記録復元とリセット', async ({ page }, info) => {
  // This covers an entire five-question session plus reloads; software WebGL is slower.
  test.setTimeout(120000);
  await mockVoice(page);
  await page.goto('/');
  await start(page);
  await expect(page.locator('.question-model')).toHaveCount(0);
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.at(-1)!);
  const target = spoken.match(/「(.)」/)![1];
  const wrong = page.locator('.letter-choice').filter({ hasNotText: target }).first();
  await wrong.click();
  await expect(page.getByRole('status')).toContainText('もういちど');
  await expect(page.locator('.question-model')).toHaveCount(0);
  await page.waitForTimeout(380);
  await wrong.click();
  await expect(page.locator('.question-model')).toHaveText(target);
  await expect(page.locator('.hinted')).toHaveCount(1);
  for (let index = 0; index < 5; index++) {
    await page.waitForTimeout(380);
    if (index > 0) await page.getByRole('button', { name: 'おてほん', exact: true }).click();
    const letter = await page.locator('.question-model').innerText();
    await page.getByRole('button', { name: letter, exact: true }).click();
    await expect(page.locator('.letter-choice.correct')).toHaveCount(1);
    await expect(page.locator('.flower-steps .earned')).toHaveCount(index + 1);
    await expect(page.locator('.letter-choice:disabled')).toHaveCount(3);
    await page.getByRole('button', { name: index === 4 ? 'ごほうびを みる' : 'つぎの もじへ', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'きみの はなが さいたよ！' })).toBeVisible();
  await expect(page.locator('.reward-summary')).toContainText('1');
  await page.screenshot({ path: `test-results/${info.project.name}-reward.png`, fullPage: true });
  await page.getByRole('button', { name: 'もういちど', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'こんな おとだよ' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.discovery strong')).toHaveText('5');
  await page.getByRole('button', { name: /おうちのひとへ/ }).click();
  await page.getByRole('switch', { name: '読み上げ音声', exact: true }).uncheck();
  await page.getByRole('button', { name: '遊んだ記録をリセット', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'やめる', exact: true }).click();
  await expect(page.locator('.parent-stats')).toContainText('5');
  await page.getByRole('button', { name: '遊んだ記録をリセット', exact: true }).click();
  await page.getByRole('button', { name: '記録を消す', exact: true }).click();
  await expect(page.locator('.parent-stats strong').first()).toHaveText('0 / 46');
  await expect(page.getByRole('switch', { name: '読み上げ音声', exact: true })).not.toBeChecked();
  await page.reload();
  await expect(page.locator('.discovery strong')).toHaveText('0');
});

test('46文字の図鑑、音声再生、をの説明', async ({ page }) => {
  await mockVoice(page); await page.goto('/');
  await page.getByRole('button', { name: /もじずかん/ }).click();
  await expect(page.locator('.dictionary-letter')).toHaveCount(46);
  await page.getByRole('button', { name: 'ををきく', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('くっつきの「を」だよ');
  await expect(page.locator('.dictionary-letter.visited')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.at(-1))).toContain('くっつき');
  await page.getByRole('button', { name: 'もじのもり ホーム', exact: true }).click();
  await page.getByRole('button', { name: 'あそぶ', exact: true }).click();
  await page.getByRole('button', { name: /10.*わをん/ }).click();
  await page.getByRole('button', { name: 'はじめる', exact: true }).click();
  await page.getByRole('button', { name: 'をのおてほん', exact: true }).click();
  await expect(page.locator('.wo-note')).toHaveText('くっつきの「を」だよ');
});

test('音声・WebGL・保存が使えなくても遊べる', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage denied'); } });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (String(args[0]).includes('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('.forest-fallback')).toBeVisible();
  await start(page);
  await expect(page.locator('.question-model')).toBeVisible();
  await expect(page.getByRole('button', { name: 'もういちど きく', exact: true })).toBeDisabled();
  const target = await page.locator('.question-model').innerText();
  await page.getByRole('button', { name: target, exact: true }).click();
  await expect(page.locator('.letter-choice.correct')).toBeVisible();
  await page.getByRole('button', { name: /おうちのひとへ/ }).click();
  await expect(page.locator('.storage-notice')).toBeVisible();
  await expect(page.locator('.voice-check')).toContainText('日本語の音声が利用できません');
});

test('公開ファイルがサブフォルダでも読み込める', async ({ page }) => {
  await mockVoice(page);
  const failed: string[] = [];
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto('/nested/game/');
  await expect(page.locator('.has-3d canvas')).toBeVisible({ timeout: 20000 });
  await start(page);
  await page.getByRole('button', { name: 'おてほん', exact: true }).click();
  const target = await page.locator('.question-model').innerText();
  await page.getByRole('button', { name: target, exact: true }).click();
  await expect(page.locator('.letter-choice.correct')).toBeVisible();
  expect(failed).toEqual([]);
});
