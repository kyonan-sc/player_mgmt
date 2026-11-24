import { expect, test, type Page } from '@playwright/test'

const USERS = {
  admin: '山本 監督',
  coach: '田中 コーチ',
  viewer: '鈴木（閲覧）',
} as const

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto('#/login')
  await page.getByRole('button', { name: new RegExp(USERS[who]) }).click()
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
}

async function expectNoHorizontalScroll(page: Page) {
  const [client, scroll] = await page.evaluate(() => [
    document.documentElement.clientWidth,
    document.documentElement.scrollWidth,
  ])
  expect(scroll).toBeLessThanOrEqual(client)
}

test('未ログインではログイン画面へ遷移し、モック環境であることが明示される', async ({ page }) => {
  await page.goto('#/players')
  await expect(page).toHaveURL(/#\/login/)
  await expect(page.getByRole('note')).toContainText('モック環境')
})

test('コーチが選手を評価して提出できる', async ({ page }) => {
  await login(page, 'coach')
  await page.goto('#/assessments/cycle-7/players/player-22')
  await expect(page.getByRole('radiogroup').first()).toBeVisible()
  const playerName = await page.getByRole('heading', { level: 1 }).innerText()
  await expect(page.getByRole('button', { name: /^提出$/ })).toBeDisabled()

  for (const group of await page.getByRole('radiogroup').all()) {
    await group.getByRole('radio', { name: /^4点/ }).click()
  }
  await expect(page.getByText('80.0', { exact: true })).toBeVisible()
  await page.getByLabel('強み').fill('ボールを受ける前の首振りが増えた')
  await page.getByRole('button', { name: /^提出$/ }).click()
  await expect(page.getByText('評価を提出しました')).toBeVisible()

  await page.getByRole('link', { name: '評価期間に戻る' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: playerName })).toContainText('提出済み')
})

test('未保存の入力がある状態で移動すると確認が表示される', async ({ page }) => {
  await login(page, 'coach')
  await page.goto('#/assessments/cycle-7/players/player-23')
  await page.getByRole('radiogroup').first().getByRole('radio', { name: /^2点/ }).click()
  await page.getByRole('link', { name: '評価期間に戻る' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('保存されていない変更があります')
  await page.getByRole('button', { name: '入力に戻る' }).click()
  await expect(
    page.getByRole('radiogroup').first().getByRole('radio', { name: /^2点/ }),
  ).toHaveAttribute('aria-checked', 'true')
})

test('管理者が評価を確定すると結果一覧と推奨チームが表示される', async ({ page }) => {
  await login(page, 'admin')
  await page.goto('#/assessments/cycle-7')
  await page.getByRole('button', { name: '評価を確定' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('未判定')
  await page.getByRole('button', { name: '未判定を含めて確定する' }).click()
  await expect(page.getByText('評価を確定しました')).toBeVisible()

  await page.getByRole('link', { name: '評価結果' }).click()
  await expect(page.getByRole('heading', { name: '評価結果' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'CSV出力' })).toBeVisible()
  await expect(page.getByText('確定済み').first()).toBeVisible()
})

test('推奨と異なるチームへの変更には理由が必須', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PC のボード表示で確認する')
  await login(page, 'admin')
  await page.goto('#/teams')
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: '鈴木 陽太' }) })
  const current = await card.getByRole('combobox').innerText()
  await card.getByRole('combobox').click()
  const target = current.includes('C') ? 'Aチーム' : 'Cチーム'
  await page.getByRole('option', { name: target }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '変更を保存' }).click()
  await expect(dialog.getByText('理由を入力してください')).toBeVisible()
  await dialog.getByLabel(/理由/).fill('E2E: ポジションバランスを考慮')
  await dialog.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByText('チーム編成を変更しました')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'E2E: ポジションバランスを考慮' })).toBeVisible()
})

test('閲覧者は管理画面・評価入力にアクセスできない', async ({ page, isMobile }) => {
  await login(page, 'viewer')
  if (!isMobile) await expect(page.getByRole('link', { name: 'システム設定' })).toHaveCount(0)
  await page.goto('#/settings')
  await expect(page.getByText('この画面を表示する権限がありません')).toBeVisible()
  await page.goto('#/assessments/cycle-7/players/player-01')
  await expect(page.getByText('この画面を表示する権限がありません')).toBeVisible()
  await page.goto('#/players/player-01')
  await expect(page.getByText('コーチコメント')).toHaveCount(0)
})

test('パスワードでコーチとして入れ、評価を入力できる（管理画面は拒否される）', async ({
  page,
  isMobile,
}) => {
  await page.goto('#/login')
  await page.getByPlaceholder('パスワード').fill('guest-demo')
  await page.getByRole('button', { name: '入る' }).click()
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
  if (!isMobile) await expect(page.getByRole('link', { name: 'システム設定' })).toHaveCount(0)

  // 管理者の操作は表示されず、画面に直接アクセスしても拒否される
  await page.goto('#/players')
  await expect(page.getByRole('link', { name: '選手を登録' })).toHaveCount(0)
  await page.goto('#/settings')
  await expect(page.getByText('この画面を表示する権限がありません')).toBeVisible()
  await page.goto('#/settings/coaches')
  await expect(page.getByText('この画面を表示する権限がありません')).toBeVisible()

  // コーチ権限で評価を入力・提出できる
  await page.goto('#/assessments/cycle-7/players/player-21')
  await expect(page.getByRole('radiogroup').first()).toBeVisible()
  for (const group of await page.getByRole('radiogroup').all()) {
    await group.getByRole('radio', { name: /^3点/ }).click()
  }
  await page.getByRole('button', { name: /^提出$/ }).click()
  await expect(page.getByText('評価を提出しました')).toBeVisible()
})

test('成長グラフ・レーダーチャートを表示できる', async ({ page }) => {
  await login(page, 'coach')
  await page.goto('#/players/player-02')
  await expect(page.getByRole('heading', { name: '成長の推移' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '能力バランス' })).toBeVisible()
  await expect(page.locator('.recharts-radar').first()).toBeVisible()
  await expect(page.locator('.recharts-line').first()).toBeVisible()
})

test('スマートフォン幅で主要画面に横スクロールが発生しない', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'スマートフォンのみ')
  await login(page, 'admin')
  for (const path of [
    '#/',
    '#/players',
    '#/players/player-05',
    '#/assessments',
    '#/assessments/cycle-7',
    '#/assessments/cycle-7/players/player-20',
    '#/results/cycle-6',
    '#/teams',
    '#/settings',
  ]) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expectNoHorizontalScroll(page)
  }
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible()
})
