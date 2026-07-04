import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

function getBuildCommit() {
  return (
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  );
}

function buildMetaPlugin(buildId: string): Plugin {
  return {
    name: 'build-meta-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-meta.json',
        source: `${JSON.stringify(
          {
            buildId,
            commit: buildId,
            generatedAt: new Date().toISOString()
          },
          null,
          2
        )}\n`
      });
    }
  };
}

const buildCommit = getBuildCommit();

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit)
  },
  plugins: [
    react(),
    buildMetaPlugin(buildCommit)
  ]
});
