import { defineConfig } from 'vitest/config';

// The same test suite runs against SQLite and PostgreSQL (`--project sqlite|pg`).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'sqlite',
          include: ['test/**/*.test.ts'],
          env: { TEST_DB: 'sqlite' },
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'pg',
          include: ['test/**/*.test.ts'],
          env: { TEST_DB: 'pg' },
          testTimeout: 30_000,
        },
      },
    ],
  },
});
