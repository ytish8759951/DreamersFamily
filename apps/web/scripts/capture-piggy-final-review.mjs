import { spawn } from 'node:child_process';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9344;
const profile = path.resolve('.chrome-piggy-final-review');
const outputDir = path.resolve('../../screenshots/piggy-final-review');
const pageUrl = 'http://127.0.0.1:4173/child/dreams';
const referencePath = path.resolve('public/design-assets/P.jpg');
const currentPath = path.join(outputDir, 'piggy-100.png');
const zoomPath = path.join(outputDir, 'piggy-60.png');
const comparePath = path.join(outputDir, 'piggy-side-by-side.png');
const compareHtmlPath = path.join(outputDir, 'piggy-side-by-side.html');

await mkdir(outputDir, { recursive: true });
await rm(profile, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--disable-background-networking',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

async function openTarget(url) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT'
  });
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

async function setViewport(client, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height
  });
}

async function capturePage(client, file, zoom = 1) {
  await setViewport(client, 1440, 1024);
  await client.send('Page.navigate', { url: pageUrl });
  await sleep(1800);
  await client.send('Runtime.evaluate', {
    expression: "document.documentElement.style.zoom = '1'; document.body.style.zoom = '1';",
    returnByValue: true
  });
  if (zoom !== 1) {
    await client.send('Runtime.evaluate', {
      expression: `document.documentElement.style.zoom = '${zoom}'; document.body.style.zoom = '${zoom}';`,
      returnByValue: true
    });
    await sleep(400);
  }
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 1440, height: 1024, scale: 1 }
  });
  await writeFile(file, Buffer.from(data, 'base64'));
}

async function captureComparison(client) {
  const reference = (await readFile(referencePath)).toString('base64');
  const current = (await readFile(currentPath)).toString('base64');
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; background: #f6efe3; font-family: Arial, sans-serif; }
          .wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 18px; box-sizing: border-box; width: 2880px; height: 1080px; }
          figure { margin: 0; min-width: 0; }
          figcaption { height: 34px; color: #49382a; font-size: 22px; font-weight: 700; line-height: 34px; }
          img { display: block; width: 100%; height: 1000px; object-fit: contain; background: #fff7ed; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <figure><figcaption>P.jpg Reference</figcaption><img src="data:image/jpeg;base64,${reference}" /></figure>
          <figure><figcaption>Current /child/dreams</figcaption><img src="data:image/png;base64,${current}" /></figure>
        </div>
      </body>
    </html>`;
  await writeFile(compareHtmlPath, html);
  const fileUrl = `file:///${compareHtmlPath.replaceAll('\\', '/')}`;
  await setViewport(client, 2880, 1080);
  await client.send('Page.navigate', { url: fileUrl });
  await sleep(600);
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    clip: { x: 0, y: 0, width: 2880, height: 1080, scale: 1 }
  });
  await writeFile(comparePath, Buffer.from(data, 'base64'));
}

try {
  await waitForDebugger();
  const target = await openTarget(pageUrl);
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');

  await capturePage(client, currentPath, 1);
  await capturePage(client, zoomPath, 0.6);
  await captureComparison(client);

  client.close();
} finally {
  chrome.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true });
}
