// Real behaviour test. node tools/smoke.mjs [url]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const URLBASE = process.argv[2] || 'http://127.0.0.1:18791/index.html';
const DBG = 18722, prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json(); if (tabs.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const w = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && w.has(d.id)) { w.get(d.id)(d); w.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push(String(d.params.args[0]?.value).slice(0, 200)); };
const send = (m, p = {}) => new Promise(r => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
const size = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
await send('Runtime.enable');
await send('Page.navigate', { url: URLBASE }); await sleep(4500);

const hits = await ev(`JSON.stringify([[.5,.97],[.5,.93],[.5,.88],[.5,.6]].map(([x,y])=>{const e=document.elementFromPoint(innerWidth*x,innerHeight*y);return e&&(e.closest('a')?'LINK':e.id||e.tagName)}))`);
console.log('hidden links at start (want no LINK):', hits);

const tabs_ = [];
for (let i = 0; i < 6; i++) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  tabs_.push(await ev(`(document.activeElement.textContent||document.activeElement.tagName).trim().slice(0,22)+'@'+Math.round(scrollY)`));
}
console.log('tab order at top (want only the Book pill, scroll 0):', JSON.stringify(tabs_));

for (let i = 0; i < 140; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 600, y: 300, deltaX: 0, deltaY: 120 }); await sleep(20); }
await sleep(3000);
console.log('end:', await ev(`JSON.stringify({cue:document.getElementById('cue-t').textContent,op:document.getElementById('end').style.opacity,inert:document.getElementById('end').inert})`));
console.log('cta link:', await ev(`(()=>{const a=document.querySelector('#end>a').getBoundingClientRect();return document.elementFromPoint(a.left+a.width/2,a.top+a.height/2)?.href})()`));
console.log('credit link:', await ev(`(()=>{const a=document.querySelector('.credit a').getBoundingClientRect();return document.elementFromPoint(a.left+a.width/2,a.top+a.height/2)?.href})()`));

await send('Page.reload'); await sleep(3500);
console.log('reload keeps place:', await ev(`JSON.stringify({y:Math.round(scrollY),cue:document.getElementById('cue-t').textContent})`));

await send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
await size(390, 844, true); await sleep(1200);
const a1 = await ev(`(()=>{const c=document.getElementById('gl');return JSON.stringify({css:[c.clientWidth,c.clientHeight],buffer:[c.width,c.height],ratio:(c.width/c.height).toFixed(3),view:(c.clientWidth/c.clientHeight).toFixed(3)})})()`);
await size(844, 390, true); await sleep(1200);
const a2 = await ev(`(()=>{const c=document.getElementById('gl');return JSON.stringify({ratio:(c.width/c.height).toFixed(3),view:(c.clientWidth/c.clientHeight).toFixed(3)})})()`);
console.log('portrait:', a1); console.log('rotated:', a2);
await size(1280, 720);

await send('Page.navigate', { url: URLBASE + '?plain' }); await sleep(2000);
console.log('no WebGL page:', await ev(`JSON.stringify({cls:document.documentElement.className,h1:getComputedStyle(document.querySelector('h1')).fontSize,book:getComputedStyle(document.querySelector('.book')).display,overflowX:document.documentElement.scrollWidth>innerWidth})`));

const before = errs.filter(e => !/plain mode/.test(e));
await send('Emulation.setScriptExecutionDisabled', { value: true });
await send('Page.navigate', { url: URLBASE }); await sleep(2000);
await send('Emulation.setScriptExecutionDisabled', { value: false });
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
fs.writeFileSync('D:/sowmya-work/nojs.jpg', Buffer.from(shot.result.data, 'base64'));
console.log('errors:', JSON.stringify(before));
ws.close(); ch.kill(); await sleep(200); process.exit(0);
