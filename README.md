# 境南SC 選手評価管理システム（player-assessment）

少年サッカーチームの選手評価・成長履歴・チーム編成を支援する Web アプリケーションです。

- 要求仕様：[技術仕様書](docs/01_技術仕様書.md) / [アプリ要件仕様書](docs/02_アプリ要件仕様書.md)
- 実装計画・仕様補完の記録：[実装計画書](docs/03_実装計画.md)
- Google 環境の構築・技術検証：[Google環境セットアップ手順書](docs/04_Google環境セットアップ手順書.md)

## 構成

| パス              | 内容                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `apps/web`        | フロントエンド（React + Vite + TypeScript、GitHub Pages で配信）        |
| `apps/gas`        | バックエンド（Google Apps Script V8、esbuild で単一ファイルにバンドル） |
| `packages/shared` | 共通の型・Zod スキーマ・定数（初期評価基準）・評価計算（純粋関数）      |
| `tests/e2e`       | Playwright によるモック環境の E2E テスト                                |

```
GitHub Pages (React) ──POST text/plain + ID Token──▶ GAS Web App ──▶ Google Sheets
        │
        └─(モックモード) MSW ──▶ GAS の services/api 層をインメモリで実行
```

モックモードでは、GAS バックエンドと**同じ** API 処理（認証後の認可・評価計算・状態遷移）をブラウザ内で実行します。

## 開発

前提：Node.js 22 以上、pnpm 11

```bash
pnpm install
pnpm dev            # モックモードで起動（バックエンド不要） http://localhost:5173/player-assessment/
```

モックモードではログイン画面でモックユーザー（管理者・コーチ2名・閲覧者）を選択できます。データは架空で、再読み込みで初期状態に戻ります。

| コマンド                          | 内容                                                      |
| --------------------------------- | --------------------------------------------------------- |
| `pnpm lint`                       | ESLint                                                    |
| `pnpm format`                     | Prettier で整形                                           |
| `pnpm typecheck`                  | 全パッケージの型チェック                                  |
| `pnpm test`                       | 単体・結合・コンポーネントテスト（Vitest）                |
| `pnpm test:e2e`                   | E2E テスト（Playwright、モック環境、PC とスマートフォン） |
| `pnpm --filter @kyonan/gas build` | GAS 用バンドルを `apps/gas/dist` に出力                   |

初回の E2E 実行前に `pnpm --filter @kyonan/web exec playwright install chromium` を実行してください。

## 環境変数

`apps/web/.env.example` を参照してください。`VITE_` で始まる値はビルド成果物に含まれる**公開情報**です。

| 変数                    | 内容                              |
| ----------------------- | --------------------------------- |
| `VITE_APP_ENV`          | `mock` / `staging` / `production` |
| `VITE_USE_MOCK`         | `true` でモックモード             |
| `VITE_API_URL`          | GAS Web App の URL（`.../exec`）  |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth クライアント ID      |

GAS 側の設定値（`SPREADSHEET_ID` 等）は Script Properties で管理します。認証情報・選手データはリポジトリに含めないでください（Public リポジトリ）。

## デプロイ

- フロントエンド：`main` へのマージで GitHub Actions が GitHub Pages にデプロイします（Repository Variables に `VITE_API_URL` と `VITE_GOOGLE_CLIENT_ID` を設定）。
- バックエンド：管理者が clasp で手動デプロイします。手順は [Google環境セットアップ手順書](docs/04_Google環境セットアップ手順書.md) を参照してください。

> [!IMPORTANT]
> 本番運用（実データ投入）の開始前に、[実装計画書 §5](docs/03_実装計画.md) のセキュリティ判定基準をすべて満たしていることを確認してください。
