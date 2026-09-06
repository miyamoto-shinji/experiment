import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assembleSite, discoverProjects } from './build-pages.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'experiment-pages-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function file(root, relativePath, contents = '') {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function project(root, name, { build = 'vite build', lock = true, html = '<title>Fixture game</title>' } = {}) {
  const directory = join(root, name);
  file(directory, 'package.json', JSON.stringify({ name, scripts: { build } }));
  if (lock) file(directory, 'package-lock.json', '{}');
  if (html !== null) file(directory, 'dist/index.html', html);
  return directory;
}

test('番号付きアプリと新規03を数値順に検出し、対象外やpackageなしのフォルダは含めない', t => {
  const root = fixture(t);
  for (const name of ['100_future', '03_new_game', '10_next', '02_sakana', '01_hiragana']) {
    project(root, name);
  }
  for (const name of ['misc', '_site', '3_short_number', '04-hyphen', '05_has space']) {
    // Invalid project names must be ignored even when their manifests are incomplete.
    file(root, `${name}/package.json`, '{}');
  }
  mkdirSync(join(root, '06_reference_images'));
  file(root, '07_file', 'A matching name must also be a directory.');

  const projects = discoverProjects(root);
  assert.deepEqual(projects.map(entry => entry.name), [
    '01_hiragana', '02_sakana', '03_new_game', '10_next', '100_future',
  ]);
  for (const entry of projects) assert.equal(entry.directory, join(root, entry.name));
});

test('各distを独立したサブパスへ集約し、開発ファイルを公開せず古い成果物を除去する', t => {
  const root = fixture(t);
  for (const name of ['01_hiragana', '02_sakana', '03_new_game']) {
    const directory = project(root, name, { html: `<title>${name}</title>` });
    file(directory, 'dist/assets/app.js', `console.log('${name}');`);
    file(directory, 'dist/licenses/LICENSE.txt', `${name} license`);
    file(directory, 'src/main.ts', 'private development source');
    file(directory, 'node_modules/dependency/index.js', 'development dependency');
    file(directory, 'reference/example.png', 'reference image');
    file(directory, '.env', 'PRIVATE_FIXTURE=value');
  }
  const output = join(root, '_site');
  file(output, 'removed-project/index.html', 'stale output');

  assembleSite(discoverProjects(root), output);

  assert.deepEqual(readdirSync(output).sort(), [
    '.nojekyll', '01_hiragana', '02_sakana', '03_new_game', 'index.html',
  ]);
  assert.equal(readFileSync(join(output, '.nojekyll'), 'utf8'), '');
  for (const name of ['01_hiragana', '02_sakana', '03_new_game']) {
    assert.deepEqual(readdirSync(join(output, name)).sort(), ['assets', 'index.html', 'licenses']);
    for (const relativePath of ['index.html', 'assets/app.js', 'licenses/LICENSE.txt']) {
      assert.equal(
        readFileSync(join(output, name, relativePath), 'utf8'),
        readFileSync(join(root, name, 'dist', relativePath), 'utf8'),
      );
    }
    for (const excluded of ['src', 'node_modules', 'reference', '.env', 'package.json', 'package-lock.json']) {
      assert.equal(existsSync(join(output, name, excluded)), false, `${name}/${excluded} must not be published`);
    }
  }
});

test('一覧に相対リンクとHTMLエスケープしたタイトルを載せ、タイトルなしはフォルダ名にする', t => {
  const root = fixture(t);
  project(root, '01_hiragana', { html: '<title>  もじのもり  </title>' });
  project(root, '02_sakana', {
    html: '<title>魚 & "海" \'光\' <script>alert(1)</script></title>',
  });
  project(root, '03_深海', { html: '<main>No title</main>' });
  const output = join(root, '_site');

  assembleSite(discoverProjects(root), output);

  const html = readFileSync(join(output, 'index.html'), 'utf8');
  assert.match(html, /href="\.\/01_hiragana\/"/);
  assert.match(html, /href="\.\/02_sakana\/"/);
  assert.ok(html.includes(`href="./${encodeURIComponent('03_深海')}/"`));
  assert.match(html, /<strong>もじのもり<\/strong>/);
  assert.ok(html.includes('<strong>魚 &amp; &quot;海&quot; &#39;光&#39; &lt;script&gt;alert(1)&lt;/script&gt;</strong>'));
  assert.match(html, /<strong>03_深海<\/strong>/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /href="(?:\/|https?:)/);
});

test('番号付きnpmアプリでlockfileがなければ対象名を示して失敗する', t => {
  const root = fixture(t);
  project(root, '01_hiragana', { lock: false });
  assert.throws(() => discoverProjects(root), /01_hiragana:.*package-lock\.json/);
});

test('buildスクリプトが欠落・空・文字列以外なら失敗する', t => {
  for (const build of [null, '', '   ', 42]) {
    const root = fixture(t);
    project(root, '01_hiragana', { build });
    assert.throws(() => discoverProjects(root), /01_hiragana:.*build/);
  }
  const root = fixture(t);
  project(root, '01_hiragana');
  file(root, '01_hiragana/package.json', JSON.stringify({ name: '01_hiragana' }));
  assert.throws(() => discoverProjects(root), /01_hiragana:.*build/);
});

test('後続アプリにdist/index.htmlがなければ、既存の公開成果物を変更せず失敗する', t => {
  const root = fixture(t);
  project(root, '01_hiragana');
  project(root, '02_sakana', { html: null });
  const output = join(root, '_site');
  file(output, 'index.html', 'existing published index');
  file(output, 'previous/assets/app.js', 'existing published script');

  assert.throws(() => assembleSite(discoverProjects(root), output), /02_sakana:.*dist\/index\.html/);
  assert.equal(readFileSync(join(output, 'index.html'), 'utf8'), 'existing published index');
  assert.equal(readFileSync(join(output, 'previous/assets/app.js'), 'utf8'), 'existing published script');
  assert.deepEqual(readdirSync(output).sort(), ['index.html', 'previous']);
});

test('対象アプリがゼロなら空のサイトを公開せず失敗する', t => {
  const root = fixture(t);
  const projects = discoverProjects(root);
  assert.deepEqual(projects, []);
  const output = join(root, '_site');
  assert.throws(() => assembleSite(projects, output), /公開する番号付きプロジェクトが見つかりません/);
  assert.equal(existsSync(output), false);
});
