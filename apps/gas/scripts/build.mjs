// TypeScript を GAS V8 で実行可能な単一ファイルにバンドルする。
// GAS はトップレベルの function 宣言のみをエントリーポイントとして認識するため、footer で公開する。
import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'

const ENTRYPOINTS = ['doGet', 'doPost', 'setupSheets', 'runSelfTest', 'seedStagingDemoData']

mkdirSync('dist', { recursive: true })
await build({
  entryPoints: ['src/entrypoints/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: '__app',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['import', 'default'],
  target: 'es2019',
  minifyWhitespace: true,
  minifySyntax: true,
  charset: 'utf8',
  legalComments: 'inline',
  outfile: 'dist/Code.js',
  footer: {
    js: ENTRYPOINTS.map((name) => `function ${name}(e) { return __app.${name}(e) }`).join('\n'),
  },
  logLevel: 'info',
})
copyFileSync('appsscript.json', 'dist/appsscript.json')
