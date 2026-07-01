import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9336;
const profile = path.resolve('.chrome-share-capture');
const outputDir = path.resolve('../../screenshots/design-system-v1/implementation');
const pageUrl = 'http://127.0.0.1:4173/child/share';

await mkdir(outputDir, { recursive: true });
await rm(profile, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

async function openTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Unable to open page: ${response.status}`);
  return response.json();
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
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    ready,
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
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height
  });
  await client.send('Page.navigate', { url: pageUrl });
  await sleep(1800);
  const { result } = await client.send('Runtime.evaluate', {
    expression: 'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)',
    returnByValue: true
  });
  const fullHeight = Math.ceil(result.value);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height: fullHeight, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: fullHeight
  });
  await sleep(500);
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: fullHeight, scale: 1 }
  });
  await writeFile(path.join(outputDir, file), Buffer.from(data, 'base64'));
}

try {
  await waitForDebugger();
  const target = await openTarget();
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await capture(client, { width: 1440, height: 1024, mobile: false, file: 'share-desktop-1440.png' });
  await capture(client, { width: 1024, height: 1024, mobile: false, file: 'share-tablet-1024.png' });
  await capture(client, { width: 375, height: 812, mobile: true, file: 'share-mobile-375.png' });
  client.close();
} finally {
  chrome.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true });
}
