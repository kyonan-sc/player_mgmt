# Google 環境セットアップ手順書（Phase 0 技術検証を含む）

本書は、チーム管理用 Google アカウントでバックエンド環境を構築し、技術検証（実装計画書 Phase 0）を行う手順です。
staging と production は **GAS プロジェクトとスプレッドシートを分けて** 同じ手順で作成します。

## 1. 事前準備

| 項目                           | 備考                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| チーム管理用 Google アカウント | 2段階認証・復旧用連絡先を設定。パスワードは全コーチで共有しない |
| GitHub Organization            | `kyonan-sc`（候補）。オーナーは2名以上を推奨                    |
| Node.js 22 以上 / pnpm 11      | clasp によるデプロイを行う管理者の PC                           |

## 2. Google Drive・スプレッドシート

1. 管理用アカウントの Google Drive に `境南SC 選手評価管理` フォルダを作成します。
2. フォルダ内に `player-assessment-staging`（本番は `-production`）スプレッドシートを作成します。
3. 共有設定が「制限付き」であり、**リンクを知っている全員に公開されていない** ことを確認します。
4. URL の `/d/<ID>/edit` の `<ID>` を控えます（`SPREADSHEET_ID`）。

## 3. Google Cloud プロジェクト・OAuth クライアント

1. [Google Cloud Console](https://console.cloud.google.com/) で `kyonan-sc-player-assessment` プロジェクトを作成します。
2. 「Google Auth Platform」→「ブランディング」でアプリ名・サポートメールを設定し、対象を「外部」にします。
   - 取得するのは `openid` `email` `profile` のみ（機密性の高いスコープは不要）。
3. 「クライアント」→「クライアントを作成」→ 種類「ウェブ アプリケーション」。
4. 「承認済みの JavaScript 生成元」に以下を登録します（リダイレクト URI は不要）。
   - `https://kyonan-sc.github.io`
   - `http://localhost:5173`（開発・接続診断用。不要になったら削除）
5. 発行された **クライアント ID** を控えます（`GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`）。クライアントシークレットは使用しません。

## 4. GAS プロジェクト

```bash
pnpm --filter @kyonan/gas exec clasp login           # 管理用アカウントで認証（~/.clasprc.json はコミットしない）
cd apps/gas
pnpm exec clasp create --type standalone --title "player-assessment-staging" --rootDir dist
# 生成された .clasp.json は Git 管理外（.gitignore 済み）
pnpm build && pnpm exec clasp push -f
```

スクリプトエディタ（`pnpm exec clasp open-script`）で「プロジェクトの設定」→「スクリプト プロパティ」に以下を設定します。

| プロパティ              | 値                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_ENV`               | `staging` / `production`                                                                                                                                                                                     |
| `SPREADSHEET_ID`        | 手順2で控えた ID                                                                                                                                                                                             |
| `GOOGLE_CLIENT_ID`      | 手順3で控えたクライアント ID                                                                                                                                                                                 |
| `BOOTSTRAP_ADMIN_EMAIL` | 最初の管理者の Google アカウント（有効な管理者が0名のときのみ使用）                                                                                                                                          |
| GUEST_VIEWER_PASSWORD   | **staging のみ（任意）**。設定すると、ログインなしでパスワードだけで「閲覧専用」に入れる。8文字以上の十分に長い値にする。**production には設定しない**（APP_ENV が production のときは設定しても動作しない） |

## 5. シート初期化とセルフテスト（P0-05）

1. エディタで `setupSheets` を実行します（初回は権限承認が必要）。全テーブルのシートと初期評価基準が作成されます。再実行しても既存データは変更されません。
2. `runSelfTest` を実行し、実行ログで以下がすべて ✅ であることを確認します。

| チェック                                           | 確認内容                                           |
| -------------------------------------------------- | -------------------------------------------------- |
| jsrsasign: 正しい署名のトークンを受理              | GAS V8 上で RSA 署名検証が動作する                 |
| jsrsasign: 改ざんされたトークンを拒否              | 署名改ざんを検出できる                             |
| クレーム検証                                       | aud 不一致・期限切れ・email 未検証を拒否           |
| Google 公開鍵の取得と鍵オブジェクト生成            | UrlFetchApp で JWKS を取得・解釈できる             |
| Zod / CacheService / LockService                   | 依存ライブラリ・サービスが動作する                 |
| Sheets: 数式インジェクション防止・日付文字列の保持 | `=1+1` が数式にならず、`2026-06-01` が文字列のまま |

❌ がある場合は本番運用に進まず、結果を実装計画書 §6 に記録して対応を検討します。

## 6. Web App のデプロイ

1. エディタの「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」。
   - 次のユーザーとして実行：**自分（管理用アカウント）**
   - アクセスできるユーザー：**全員**
2. 発行された URL（`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`）を控えます（`VITE_API_URL`）。
3. 以後の更新は、URL を維持するため **既存デプロイを新しいバージョンで更新** します。

```bash
cd apps/gas
pnpm build && pnpm exec clasp push -f
pnpm exec clasp redeploy <DEPLOYMENT_ID> -d "v0.x.x"   # 既存デプロイを新バージョンで更新（URL維持）
```

> エンドポイントは公開されますが、`health.check` 以外の全 API は ID Token の検証とコーチマスタの照合に成功しない限り拒否されます。

## 7. 接続診断（P0-03 / P0-06）

1. `apps/web/.env.staging.local` を作成します（Git 管理外）。

   ```
   VITE_APP_ENV=staging
   VITE_USE_MOCK=false
   VITE_API_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
   VITE_GOOGLE_CLIENT_ID=<クライアントID>.apps.googleusercontent.com
   ```

2. `pnpm --filter @kyonan/web exec vite --mode staging` で起動し、`http://localhost:5173/player-assessment/#/dev/connectivity` を開きます。
3. 手順1〜4を順に実行します（4 は管理者アカウントのみ）。GitHub Pages へのデプロイ後は、本番 URL の `#/dev/connectivity` でも実施します。
4. Chrome（PC）、Safari（macOS）、iOS Safari の各環境で実施し、結果を [実装計画書 §6](03_実装計画.md) に記録します。

| 確認項目                             | 診断の手順 |
| ------------------------------------ | ---------- |
| CORS・Content Service のリダイレクト | 1          |
| Google ログイン                      | 2          |
| ID Token 検証・認証済み API 呼び出し | 3          |
| スプレッドシートの読み書き           | 3・4       |

通信が成立しない場合、セキュリティを緩和して回避してはいけません（技術仕様 8.5）。API 中継層の追加または GAS HTML Service への変更を設計変更として検討します。

## 8. GitHub の設定

1. Organization に `player-assessment`（Public）リポジトリを作成し、コードを push します。
2. Settings → Pages → Source を「GitHub Actions」にします。
3. Settings → Secrets and variables → Actions → **Variables** に以下を登録します（公開情報のため Secret でなくてよい）。
   - `VITE_API_URL`（production の GAS URL）
   - `VITE_GOOGLE_CLIENT_ID`
   - VITE_APP_ENV（任意）。未設定は production。ステージング用に公開し、パスワード入場の入力欄を出したい場合のみ staging を設定する（接続先の GAS の APP_ENV も staging であること）
4. `main` への push で `Deploy to GitHub Pages` ワークフローが実行されます。

## 9. 初期データの登録

1. `BOOTSTRAP_ADMIN_EMAIL` のアカウントでログインすると、管理者として自動登録されます。
2. 「システム設定」で所属学年グループを作成します。
3. 「コーチ管理」でコーチを登録します（メールアドレス・ロール・担当学年）。
4. 「選手」で選手を登録します。不要な個人情報（住所・電話番号・生年月日など）は登録しません。

## 10. パスワード入場（検証環境のみ・閲覧専用）

ステージングでは、Google ログインなしで、パスワードを入力するだけで「閲覧専用」のゲストとして入れます。関係者に画面を見てもらうときなどに使います。

1. GAS のスクリプトプロパティ `GUEST_VIEWER_PASSWORD` に、推測されにくいパスワード（8文字以上）を設定します。`APP_ENV` が `staging` であることも確認します。
2. コードを反映します（`pnpm build && pnpm exec clasp push -f`、続けて `pnpm exec clasp redeploy <DEPLOYMENT_ID>`）。
3. ステージング用フロントエンド（`VITE_APP_ENV=staging`）のログイン画面に、パスワード入力欄が表示されます。

| 項目             | 内容                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| できること       | ダッシュボード・選手一覧と詳細・確定済みの評価結果・チーム編成の閲覧 |
| できないこと     | 評価の入力、選手・コーチ・設定の変更、コーチコメントや操作履歴の閲覧 |
| 有効期間         | 4時間（以降は再入力）                                                |
| 失敗が続いた場合 | 10回失敗すると10分間、正しいパスワードでも受け付けません             |
| 無効にするには   | `GUEST_VIEWER_PASSWORD` を削除する（既存のトークンも即時無効）       |

パスワードの照合は GAS 側で行います。フロントエンドのコードは公開されるため、画面の表示有無はセキュリティ対策ではありません。**本番環境（`APP_ENV=production`）では、パスワードが設定されていても動作しません。**
