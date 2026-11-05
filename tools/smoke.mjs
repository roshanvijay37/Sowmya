// Real input test: wheel to the bottom, check progress + CTA; then plain mode; then renderer name.
import { spawn } from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const DBG=18722,prof=fs.mkdtempSync(path.join(os.tmpdir(),'sk-'));
const ch=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${DBG}`,`--user-data-dir=${prof}`,'--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--window-size=1280,720','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let tabs;for(let i=0;i<50;i++){try{tabs=await(await fetch(`http://127.0.0.1:${DBG}/json`)).json();if(tabs.length)break}catch{}await sleep(200)}
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const w=new Map();const errs=[];ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&w.has(d.id)){w.get(d.id)(d);w.delete(d.id)}if(d.method==='Runtime.exceptionThrown')errs.push(d.params.exceptionDetails.exception?.description?.slice(0,200))};
const send=(m,p={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:18791/index.html'});await sleep(5000);
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true})).result?.result?.value;
console.log('renderer',await ev(`(()=>{const g=document.createElement('canvas').getContext('webgl2');const x=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(x.UNMASKED_RENDERER_WEBGL)})()`));
for(let i=0;i<140;i++){await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:600,y:300,deltaX:0,deltaY:120});await sleep(25)}
await sleep(3500);
console.log('after 140 wheel notches',await ev(`JSON.stringify({y:scrollY,max:document.getElementById('scroll').offsetHeight-innerHeight,cue:document.getElementById('cue-t').textContent,endOpacity:document.getElementById('end').style.opacity,endPE:document.getElementById('end').style.pointerEvents,ended:document.body.className})`));
console.log('link',await ev(`document.elementFromPoint(innerWidth/2, document.querySelector('#end a').getBoundingClientRect().top+10)?.href`));
await send('Page.navigate',{url:'http://127.0.0.1:18791/index.html?plain'});await sleep(2500);
console.log('plain',await ev(`JSON.stringify({cls:document.documentElement.className,h1:getComputedStyle(document.querySelector('h1')).fontSize,imgs:document.querySelectorAll('#plain img').length,scrollW:document.documentElement.scrollWidth,inner:innerWidth})`));
const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:70});fs.writeFileSync('D:/sowmya-work/plain.jpg',Buffer.from(shot.result.data,'base64'));
console.log('errors',errs.filter(e=>!/plain mode/.test(e)));ws.close();ch.kill();await sleep(200);process.exit(0)
