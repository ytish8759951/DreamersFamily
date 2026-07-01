import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = path.resolve('.chrome-parent-mailbox-design');
const htmlPath = path.resolve('scripts/parent-mailbox-v1-design.html').replaceAll('\\', '/');
const output = path.resolve('../../screenshots/design-system-v1/parent-mailbox-v1-final.png');

await rm(profile, { recursive: true, force: true });
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=2048,1365',
  `--user-data-dir=${profile}`,
  `--screenshot=${output}`,
  `file:///${htmlPath}`
], { stdio: 'inherit' });
await new Promise((resolve, reject) => {
  chrome.on('exit', code => code === 0 ? resolve() : reject(new Error(`Chrome exited with ${code}`)));
  chrome.on('error', reject);
});
await rm(profile, { recursive: true, force: true });
