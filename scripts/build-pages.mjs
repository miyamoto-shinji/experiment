import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectPattern = /^\d{2,}_[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

/** Numbered npm projects opt in with a build script and a committed lockfile. */
export function discoverProjects(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && projectPattern.test(entry.name))
    .filter(entry => existsSync(join(root, entry.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map(entry => {
      const directory = join(root, entry.name);
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      if (typeof manifest.scripts?.build !== 'string' || !manifest.scripts.build.trim()) {
        throw new Error(`${entry.name}: package.json に build スクリプトが必要です。`);
      }
      if (!existsSync(join(directory, 'package-lock.json'))) {
        throw new Error(`${entry.name}: package-lock.json を追加してください。`);
      }
      return { name: entry.name, directory };
    });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function indexPage(projects) {
  const entries = projects.map(project => {
    const html = readFileSync(join(project.directory, 'dist/index.html'), 'utf8');
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() || project.name;
    return `<li><a href="./${encodeURIComponent(project.name)}/"><span class="number">${escapeHtml(project.name.split('_')[0])}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(project.name)}/</small></span><span class="arrow" aria-hidden="true">↗</span></a></li>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0c202b">
  <title>Experiment — アプリ一覧</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#0c202b;color:#e9f1ef;font-family:system-ui,sans-serif}
    main{max-width:900px;margin:auto;padding:clamp(48px,10vw,120px) 28px}
    h1{margin:0 0 56px;font-size:clamp(36px,7vw,64px);font-weight:400;letter-spacing:-.04em}
    ul{list-style:none;padding:0;margin:0;border-top:1px solid #45616c}
    li{border-bottom:1px solid #45616c}a{display:grid;grid-template-columns:40px 1fr 24px;gap:20px;align-items:center;padding:32px 12px;color:inherit;text-decoration:none}
    a:hover{background:#183440}a:focus-visible{outline:2px solid #d3e7d6;outline-offset:4px}
    .number,small{font-size:12px;color:#a9c1c8}strong{display:block;font-size:clamp(16px,3vw,22px);font-weight:500;line-height:1.6}
    small{display:block;margin-top:8px;letter-spacing:.06em}.arrow{font-size:24px;color:#d3e7d6}
    @media(max-width:480px){a{grid-template-columns:24px 1fr 20px;gap:12px;padding:26px 0}}
  </style>
</head>
<body><main><h1>Experiment</h1><nav aria-label="アプリ一覧"><ul>${entries}</ul></nav></main></body>
</html>
`;
}

/** Copy built assets only; source, reference images and dependencies stay out of Pages. */
export function assembleSite(projects, output) {
  if (!projects.length) throw new Error('公開する番号付きプロジェクトが見つかりません。');
  for (const project of projects) {
    if (!existsSync(join(project.directory, 'dist/index.html'))) {
      throw new Error(`${project.name}: ビルド結果に dist/index.html がありません。`);
    }
  }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const project of projects) {
    cpSync(join(project.directory, 'dist'), join(output, project.name), { recursive: true });
  }
  writeFileSync(join(output, 'index.html'), indexPage(projects));
  writeFileSync(join(output, '.nojekyll'), '');
}

export function buildPages(root, { install = false } = {}) {
  const projects = discoverProjects(root);
  for (const project of projects) {
    console.log(`\nBuilding ${project.name}`);
    const commands = install ? [['ci'], ['run', 'build']] : [['run', 'build']];
    for (const args of commands) {
      const result = spawnSync('npm', args, { cwd: project.directory, stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`${project.name}: npm ${args.join(' ')} が失敗しました。`);
    }
  }
  const output = join(root, '_site');
  assembleSite(projects, output);
  console.log(`\nPublished files: ${projects.map(project => `${project.name}/`).join(', ')} → _site/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    buildPages(root, { install: process.argv.includes('--install') });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
