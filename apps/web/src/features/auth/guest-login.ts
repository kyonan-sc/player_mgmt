import { env } from '@/lib/env'

/**
 * パスワード入場（閲覧者）は検証環境（モック / ステージング）だけの機能。
 * ここで本番ビルドから除外するのは表示上の対応で、実際の可否はバックエンドが APP_ENV で判定する。
 */
export const guestLoginAvailable = env.appEnv === 'mock' || env.appEnv === 'staging'
