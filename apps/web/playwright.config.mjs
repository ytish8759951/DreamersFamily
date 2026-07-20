export default {
  testDir: './scripts',
  testMatch: '**/*.pw.mjs',
  timeout: 30000,
  reporter: [['list']],
  use: {
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'webkit',
      use: {
        browserName: 'webkit'
      }
    }
  ]
};
