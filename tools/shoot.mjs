// Headless Chrome screenshots of the show at given scroll positions.
// node tools/shoot.mjs <outDir> <w> <h> <mobile:0|1> t1 t2 ...   (site must be served on PORT)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [outDir, w, h, mob, ...ts] = process.argv.slice(2);
const PORT = process.env.PORT || 18791, DBG = 18000 + Math.floor(Math.random() * 700);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(outDir, { recursive: true });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
const ua = mob === '1' ? ['--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'] : [];
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', `--window-size=${w},${h}`, '--hide-scrollbars', ...ua, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json(); if (tabs.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const wait = new Map(), logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ': ' + d.params.args.map(a => a.value || a.description).join(' ').slice(0, 400));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 500));
  if (d.method === 'Network.loadingFailed' && !d.params.canceled) logs.push('NETFAIL ' + d.params.errorText);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: mob === '1' });
await send('Page.navigate', { url: process.env.BASE || `http://127.0.0.1:${PORT}/index.html` });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result;

for (let i = 0; i < 200; i++) {
  const r = await ev(`window.__show ? JSON.stringify(window.__show.load()) : 'null'`);
  const v = r?.result?.value;
  if (v && v !== 'null') { const l = JSON.parse(v); if (l.total && l.done >= l.total) break; }
  await sleep(200);
}
await sleep(600);
console.log('load', (await ev(`JSON.stringify(window.__show?.load())`))?.result?.value);
for (const t of ts) {
  const r = await ev(`(window.__show.seek(${t}), JSON.stringify(window.__show.info()))`);
  await sleep(450);
  await ev(`window.__show.seek(${t})`);
  await sleep(150);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  fs.writeFileSync(path.join(outDir, `t${String(t).padEnd(5, '0')}.jpg`), Buffer.from(shot.result.data, 'base64'));
  console.log(t, r?.result?.value ?? JSON.stringify(r).slice(0, 300));
}
console.log(logs.slice(0, 14).join('\n') || 'no console errors');
ws.close(); ch.kill(); await sleep(300);
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
