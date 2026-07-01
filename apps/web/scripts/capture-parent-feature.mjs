import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [slug, route] = process.argv.slice(2);
if (!slug || !route) throw new Error('Usage: node scripts/capture-parent-feature.mjs <slug> <route>');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9350 + Math.floor(Math.random() * 100);
const profile = path.resolve(`.chrome-${slug}-capture`);
const outputDir = path.resolve('../../screenshots/design-system-v1/implementation');
const pageUrl = `http://127.0.0.1:4173${route}`;

await mkdir(outputDir, { recursive: true });
await rm(profile, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function capture(client, { width, height, mobile, file }) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await client.send('Page.navigate', { url: pageUrl });
  await sleep(1000);
  const { result } = await client.send('Runtime.evaluate', {
    expression: 'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)',
    returnByValue: true
  });
  const fullHeight = Math.max(height, Math.ceil(result.value));
  await client.send('Emulation.setDeviceMetricsOverride', { width, height: fullHeight, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: fullHeight });
  await sleep(250);
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: fullHeight, scale: 1 }
  });
  await writeFile(path.join(outputDir, file), Buffer.from(data, 'base64'));
}

try {
  await waitForDebugger();
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
  const target = await response.json();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await capture(client, { width: 1440, height: 1024, mobile: false, file: `${slug}-desktop-1440.png` });
  await capture(client, { width: 1024, height: 1024, mobile: false, file: `${slug}-tablet-1024.png` });
  await capture(client, { width: 375, height: 812, mobile: true, file: `${slug}-mobile-375.png` });
  client.close();
} finally {
  chrome.kill();
  await sleep(250);
  await rm(profile, { recursive: true, force: true });
}
