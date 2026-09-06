import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const project = process.cwd();
const release = path.join(project, 'release');
const site = path.join(release, 'moji-no-mori');
const { version } = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
const zipName = `moji-no-mori-${version}.zip`;
await mkdir(release, { recursive: true });
await rm(site, { recursive: true, force: true });
await cp(path.join(project, 'dist'), site, { recursive: true });
await writeFile(path.join(release, 'README-ja.txt'), await readFile(path.join(project, '公開手順書.md')));
await rm(path.join(release, zipName), { force: true });
execFileSync('zip', ['-q', '-r', zipName, 'moji-no-mori', 'README-ja.txt'], { cwd: release });
console.log(`Ready: release/${zipName}`);
