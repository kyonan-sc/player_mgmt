import { defineProject, mergeConfig } from 'vitest/config'
import { createViteConfig } from './vite.config.ts'

export default mergeConfig(
  createViteConfig('test'),
  defineProject({
    test: {
      name: 'web',
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  }),
)
