import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

function getBuildCommit() {
  return (
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  );
}

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(getBuildCommit())
  },
  plugins: [
    react()
  ]
});
