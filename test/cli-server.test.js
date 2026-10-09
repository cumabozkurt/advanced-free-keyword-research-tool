import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ['bin/cli.js', ...args], { cwd: root, encoding: 'utf8' });

test('cli --help documents language and country with Turkish defaults', () => {
  const r = cli('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--lang <hl>.*default tr/);
  assert.match(r.stdout, /--country <gl>.*default tr/);
});

test('cli --list-engines shows locale column', () => {
  const r = cli('--list-engines');
  assert.match(r.stdout, /locale/);
  assert.match(r.stdout, /amazon\s+shopping\s+proxy\s+gl/);
});

test('cli rejects invalid locale, numbers and engines', () => {
  assert.match(cli('x', '-c', 'turkey').stderr, /Invalid --country/);
  assert.match(cli('x', '-l', 'tr;rm').stderr, /Invalid --lang/);
  assert.match(cli('x', '--depth', 'abc').stderr, /--depth must be an integer/);
  assert.match(cli('x', '-e', 'constructor').stderr, /Unknown engine/);
  assert.equal(cli('-e', 'google').status, 2); // no seeds (stdin is not a TTY but empty)
});

test('server: static files, traversal, proxy validation, CORS allow-list', async (t) => {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const srv = spawn(process.execPath, ['server/server.js', '--port', String(port)], { cwd: root });
  t.after(() => srv.kill());
  await new Promise((res, rej) => {
    srv.stdout.on('data', (d) => { if (String(d).includes('App:')) res(); });
    srv.on('exit', rej);
    setTimeout(() => rej(new Error('server did not start')), 5000);
  });
  const base = `http://127.0.0.1:${port}`;
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Advanced Free Keyword Research Tool/);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/%E0%A4%A`)).status, 400);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal((await fetch(`${base}/api/suggest?engine=constructor&q=x`)).status, 400);
  assert.equal((await fetch(`${base}/api/suggest?engine=google&q=x&gl=turkey`)).status, 400);
  const evil = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const pages = await fetch(`${base}/api/health`, { headers: { Origin: 'https://cumabozkurt.github.io' } });
  assert.equal(pages.headers.get('access-control-allow-origin'), 'https://cumabozkurt.github.io');
  const pre = await fetch(`${base}/api/suggest`, { method: 'OPTIONS', headers: { Origin: 'https://cumabozkurt.github.io', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
});
