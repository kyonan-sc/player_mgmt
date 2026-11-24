/**
 * 使い方・紹介動画（約1分、縦型 1080x1920）を生成する。
 *
 *   node tools/promo-video/build.mjs
 *
 * 1. 日本語ナレーションを生成（Windows 標準の音声合成 / PowerShell）
 * 2. モックモードのアプリをスマートフォン幅で操作して実画面を録画（Playwright）
 * 3. 字幕・ナレーションを ffmpeg で合成し docs/media/ に出力
 *
 * 画面はすべて架空のダミーデータ。前提：Windows、ffmpeg / ffprobe、Playwright の Chromium。
 */
import { chromium } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = join(ROOT, 'apps/web')
const OUT = join(ROOT, 'docs/media/kyonan-sc-assessment-intro.mp4')
const PORT = 5199
const BASE = `http://localhost:${PORT}/player-assessment/`
const W = 1080
const H = 1920
const GREEN = '0x214E48'
const PHONE_H = 1500
const PHONE_Y = 320
const VIDEO = { width: 780, height: 1688 }
const PHONE_W = Math.round((PHONE_H * VIDEO.width) / VIDEO.height / 2) * 2

// ---------- シナリオ ----------
// narration：読み上げ文 / head：見出し（改行は \n）/ sub：補足
const SCENES = {
  title: {
    narration: '境南エスシーの、選手評価アプリです。見たプレーを記録して、成長を見える形に。',
    head: '境南SC\n選手評価アプリ',
    sub: '見たプレーを記録して、\n成長を見える形に',
  },
  dashboard: {
    narration: 'ダッシュボードで、チームの様子が、ひと目でわかります。',
    head: 'ひと目でわかる\nチームの様子',
    sub: '自分の入力待ちも確認',
  },
  rate: {
    narration:
      '練習のあと、スマホから入力。各項目を、五段階で選ぶだけです。迷ったら、基準もすぐ見られます。',
    head: 'スマホで入力\n1〜5の5段階',
    sub: '評価基準もその場で確認',
  },
  note: {
    narration: '見えたプレーは、できた場面を、短く残します。',
    head: '見たプレーを\n短く残す',
    sub: 'できた場面と、次に試すこと',
  },
  submit: {
    narration: 'そろったら提出。合計も、その場でわかります。',
    head: 'その場で提出',
    sub: '合計得点もすぐ確認',
  },
  player: {
    narration: '選手ごとに、能力のバランスと、成長の推移が見えます。',
    head: '能力バランスと\n成長の推移',
    sub: '選手ごとに見える化',
  },
  growth: {
    narration: '前よりできたことを、コーチ同士で共有して、本人にも、具体的に伝えられます。',
    head: '「前よりできた」\nを見つける',
    sub: '共有して、本人にも具体的に伝える',
  },
  teams: {
    narration: 'エー、ビー、シーは、育成のための編成です。定期的に見直します。',
    head: 'A・B・Cは\n育成のための編成',
    sub: '定期的に見直します',
  },
  end: {
    narration: '記録して、目標を決めて、練習して、また見る。一人ひとりの成長を支えます。',
    head: '記録 → 目標\n練習 → 振り返り',
    sub: '一人ひとりの成長を支えます',
  },
}
const PHONE_SCENES = ['dashboard', 'rate', 'note', 'submit', 'player', 'growth', 'teams']
const PAD = 0.5

// ---------- ユーティリティ ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${r.stderr || r.stdout}`)
  return r.stdout
}
const duration = (file) =>
  Number(
    run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file,
    ]).trim(),
  )

async function startDevServer() {
  const vite = join(WEB, 'node_modules/vite/bin/vite.js')
  const child = spawn(
    process.execPath,
    [vite, '--mode', 'mock', '--port', String(PORT), '--strictPort'],
    {
      cwd: WEB,
      stdio: 'ignore',
    },
  )
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return child
    } catch {
      /* 起動待ち */
    }
    await sleep(500)
  }
  child.kill()
  throw new Error('開発サーバーが起動しませんでした')
}

// ---------- 1. ナレーション ----------
function makeNarration(work) {
  const inDir = join(work, 'narration-txt')
  mkdirSync(inDir)
  for (const [id, s] of Object.entries(SCENES))
    writeFileSync(join(inDir, `${id}.txt`), s.narration, 'utf8')
  run('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    join(ROOT, 'tools/promo-video/tts.ps1'),
    '-InDir',
    inDir,
    '-OutDir',
    work,
  ])
  const durations = {}
  for (const id of Object.keys(SCENES)) durations[id] = duration(join(work, `${id}.wav`))
  return durations
}

// ---------- 2. 画面録画 ----------
async function record(work, narr) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  })
  const page = await context.newPage()
  const now = () => Date.now() / 1000

  // 画面キャプチャ（CDP）。端末の物理ピクセルのまま保存するため、Playwright 標準の録画より鮮明になる。
  const framesDir = join(work, 'frames')
  mkdirSync(framesDir)
  const frames = []
  const cdp = await context.newCDPSession(page)
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `frames/f${String(frames.length).padStart(6, '0')}.jpg`
    writeFileSync(join(work, file), Buffer.from(data, 'base64'))
    frames.push({ file, ts: metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: VIDEO.width,
    maxHeight: VIDEO.height,
    everyNthFrame: 1,
  })

  await page.addInitScript(() => {
    // 画面上の操作がわかるよう、タップ位置に波紋を表示する。モック環境の帯は動画では隠す。
    addEventListener(
      'pointerdown',
      (e) => {
        const d = document.createElement('div')
        d.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(33,78,72,.28);border:2px solid rgba(33,78,72,.75);z-index:99999;pointer-events:none;transition:transform .5s ease-out,opacity .5s ease-out`
        document.documentElement.appendChild(d)
        requestAnimationFrame(() => {
          d.style.transform = 'scale(1.9)'
          d.style.opacity = '0'
        })
        setTimeout(() => d.remove(), 600)
      },
      true,
    )
    const style = document.createElement('style')
    style.textContent =
      '[role="note"]{display:none!important}header span.uppercase{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  })

  const scrollTo = async (y, ms = 900) => {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y)
    await sleep(ms)
  }
  const offsetOf = (loc) =>
    loc.evaluate((el) => Math.max(0, el.getBoundingClientRect().top + window.scrollY - 150))
  const goto = (hash) => page.evaluate((h) => (location.hash = h), hash)

  // ログイン（この部分は後で切り落とす）
  await page.goto(`${BASE}#/login`)
  await page.getByRole('button', { name: /田中 コーチ/ }).click()
  await page.getByRole('heading', { name: 'ダッシュボード' }).waitFor()
  await sleep(1200)

  const times = {}
  const scene = async (id, fn) => {
    const start = now()
    const minEnd = start + narr[id] + PAD
    await fn()
    const rest = (minEnd - now()) * 1000
    if (rest > 0) await sleep(rest)
    times[id] = { start, end: now() }
  }

  await scene('dashboard', async () => {
    await sleep(1000)
    await scrollTo(380, 1400)
    await scrollTo(1100, 1400)
  })

  await scene('rate', async () => {
    await goto('#/assessments/cycle-7/players/player-20')
    await page.getByRole('radiogroup').first().waitFor()
    await sleep(500)
    await page
      .getByRole('button', { name: /基準を表示/ })
      .first()
      .click()
    await sleep(1600)
    await page.keyboard.press('Escape')
    await sleep(300)
    const scores = [3, 4, 3, 4, 3, 3, 4, 3, 4]
    const groups = page.getByRole('radiogroup')
    for (let i = 0; i < scores.length; i++) {
      const g = groups.nth(i)
      await scrollTo(await offsetOf(g), 350)
      await g.getByRole('radio', { name: new RegExp(`^${scores[i]}点`) }).click()
      await sleep(250)
    }
  })

  await scene('note', async () => {
    const strengths = page.getByLabel('強み')
    await scrollTo(await offsetOf(strengths), 700)
    await strengths.click()
    await strengths.pressSequentially('味方が顔を上げたとき、横へ動いてパスを受けた', { delay: 70 })
    await sleep(500)
    const improve = page.getByLabel('改善点')
    await improve.click()
    await improve.pressSequentially('次は、受ける前に進める方向を見る', { delay: 70 })
    await sleep(400)
  })

  await scene('submit', async () => {
    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
    )
    await scrollTo(await offsetOf(page.getByRole('heading', { name: 'プレビュー' })), 1200)
    await page.getByRole('button', { name: /^提出$/ }).click()
    await sleep(1200)
  })

  await scene('player', async () => {
    await goto('#/players/player-02')
    await page.getByRole('heading', { name: '能力バランス' }).waitFor()
    await sleep(1400)
    await scrollTo(await offsetOf(page.getByRole('heading', { name: '能力バランス' })), 1500)
    await page.getByText('初回', { exact: true }).first().click()
    await sleep(1200)
  })

  await scene('growth', async () => {
    await scrollTo(await offsetOf(page.getByRole('heading', { name: '成長の推移' })), 1600)
    await page.getByRole('tab', { name: 'カテゴリ別' }).click()
    await sleep(1500)
    await scrollTo(await offsetOf(page.getByRole('heading', { name: '評価項目の詳細' })), 1500)
  })

  await scene('teams', async () => {
    await goto('#/teams')
    await page.getByRole('tab', { name: /^A/ }).waitFor()
    await sleep(1400)
    await page.getByRole('tab', { name: /^B/ }).click()
    await sleep(1400)
  })

  await sleep(600)
  await cdp.send('Page.stopScreencast')
  await browser.close()
  return { frames, times }
}

// ---------- 3. 合成 ----------
function textFile(work, name, text) {
  writeFileSync(join(work, name), text, 'utf8')
  return name
}

function drawText({ file, size, y, enable, color = 'white' }) {
  const parts = [
    'fontfile=font.ttc',
    `textfile=${file}`,
    `fontcolor=${color}`,
    `fontsize=${size}`,
    `line_spacing=${Math.round(size * 0.1)}`,
    'x=(w-text_w)/2',
    `y=${y}`,
  ]
  if (enable) parts.push(`enable='between(t,${enable[0].toFixed(2)},${enable[1].toFixed(2)})'`)
  return `drawtext=${parts.join(':')}`
}

function ffmpeg(work, args) {
  run('ffmpeg', ['-y', '-loglevel', 'error', ...args], { cwd: work })
}

function makeCard(work, id, dur, withMark) {
  const s = SCENES[id]
  const head = textFile(work, `${id}-head.txt`, s.head)
  const sub = textFile(work, `${id}-sub.txt`, s.sub)
  const filters = [
    ...(withMark
      ? [
          'drawbox=x=(iw-190)/2:y=330:w=190:h=190:color=0x527D74:t=fill',
          'drawtext=fontfile=font.ttc:text=KSC:fontcolor=white:fontsize=74:x=(w-text_w)/2:y=380',
        ]
      : []),
    drawText({ file: head, size: id === 'end' ? 82 : 104, y: withMark ? 640 : 700 }),
    drawText({ file: sub, size: 52, y: withMark ? 1050 : 1060, color: 'white@0.85' }),
  ]
  ffmpeg(work, [
    '-f',
    'lavfi',
    '-i',
    `color=c=${GREEN}:s=${W}x${H}:r=30:d=${dur.toFixed(2)}`,
    '-vf',
    filters.join(','),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '18',
    `${id}.mp4`,
  ])
}

function makeMain(work, rec, origin, dur) {
  const px = (W - PHONE_W) / 2
  // 保存したフレームを、撮影時刻どおりの間隔で動画にする（変化がない間は同じ画面を保持）
  const t0 = rec.frames[0].ts
  const list = rec.frames.map((f, i) => {
    const next = rec.frames[i + 1]?.ts ?? f.ts + 0.2
    return `file '${f.file}'\nduration ${Math.max(0.001, next - f.ts).toFixed(4)}`
  })
  list.push(`file '${rec.frames.at(-1).file}'`)
  writeFileSync(join(work, 'frames.txt'), list.join('\n'))
  const start = origin - t0

  const filters = [
    `[0:v]fps=30,trim=start=${start.toFixed(3)}:duration=${dur.toFixed(3)},setpts=PTS-STARTPTS,scale=${PHONE_W}:${PHONE_H}[ph]`,
    `color=c=${GREEN}:s=${W}x${H}:r=30:d=${dur.toFixed(3)},drawbox=x=${px - 8}:y=${PHONE_Y - 8}:w=${PHONE_W + 16}:h=${PHONE_H + 16}:color=white@0.95:t=fill[bg0]`,
  ]
  const texts = []
  for (const id of PHONE_SCENES) {
    const t = rec.times[id]
    const win = [t.start - origin, t.end - origin]
    texts.push(
      drawText({
        file: textFile(work, `${id}-head.txt`, SCENES[id].head),
        size: 68,
        y: 40,
        enable: win,
      }),
    )
    texts.push(
      drawText({
        file: textFile(work, `${id}-sub.txt`, SCENES[id].sub),
        size: 38,
        y: 248,
        enable: win,
        color: 'white@0.85',
      }),
    )
  }
  texts.push(
    `drawtext=fontfile=font.ttc:text=※画面は架空のダミーデータです:fontcolor=white@0.7:fontsize=28:x=(w-text_w)/2:y=${PHONE_Y + PHONE_H + 30}`,
  )
  const chain = `[bg0][ph]overlay=${px}:${PHONE_Y},${texts.join(',')}[out]`
  ffmpeg(work, [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    'frames.txt',
    '-filter_complex',
    [...filters, chain].join(';'),
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '18',
    '-r',
    '30',
    'main.mp4',
  ])
}

function makeAudio(work, order, total) {
  const inputs = []
  const delays = []
  order.forEach((o, i) => {
    inputs.push('-i', join(work, `${o.id}.wav`))
    const ms = Math.round(o.at * 1000)
    delays.push(`[${i}:a]aresample=44100,adelay=${ms}|${ms}[a${i}]`)
  })
  const mix = `${order.map((_, i) => `[a${i}]`).join('')}amix=inputs=${order.length}:normalize=0,apad=whole_dur=${total.toFixed(3)}[aout]`
  ffmpeg(work, [
    ...inputs,
    '-filter_complex',
    [...delays, mix].join(';'),
    '-map',
    '[aout]',
    '-t',
    total.toFixed(3),
    'audio.wav',
  ])
}

// ---------- 実行 ----------
const work = mkdtempSync(join(tmpdir(), 'ksc-promo-'))
let server
try {
  console.log('1/3 ナレーションを生成')
  const narr = makeNarration(work)
  copyFileSync('C:/Windows/Fonts/meiryob.ttc', join(work, 'font.ttc'))

  console.log('2/3 実画面を録画')
  server = await startDevServer()
  const rec = await record(work, narr)

  console.log('3/3 字幕・音声を合成')
  const titleDur = narr.title + PAD + 0.2
  const endDur = narr.end + PAD + 0.9
  const origin = rec.times[PHONE_SCENES[0]].start
  const mainDur = rec.times[PHONE_SCENES.at(-1)].end - origin
  makeCard(work, 'title', titleDur, true)
  makeMain(work, rec, origin, mainDur)
  makeCard(work, 'end', endDur, false)

  writeFileSync(
    join(work, 'list.txt'),
    ['title.mp4', 'main.mp4', 'end.mp4'].map((f) => `file '${f}'`).join('\n'),
  )
  ffmpeg(work, ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'video.mp4'])

  const total = titleDur + mainDur + endDur
  makeAudio(
    work,
    [
      { id: 'title', at: 0.2 },
      ...PHONE_SCENES.map((id) => ({ id, at: titleDur + rec.times[id].start - origin })),
      { id: 'end', at: titleDur + mainDur + 0.2 },
    ],
    total,
  )

  mkdirSync(dirname(OUT), { recursive: true })
  ffmpeg(work, [
    '-i',
    'video.mp4',
    '-i',
    'audio.wav',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-shortest',
    OUT,
  ])
  console.log(`完了: ${OUT}（${total.toFixed(1)}秒）`)
  console.log(JSON.stringify({ narr, times: rec.times }))
} finally {
  server?.kill()
  if (process.env.KEEP_WORK) console.log('作業フォルダ:', work)
  else rmSync(work, { recursive: true, force: true })
}
