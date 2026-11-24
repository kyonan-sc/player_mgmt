import { AppError } from '../api/errors'
import type { IdTokenVerifier, VerifiedClaims } from './verifier'

export const MOCK_TOKEN_PREFIX = 'mock:'

/**
 * モックモード専用の検証器。トークン `mock:<email>` を受け付ける（S-10）。
 * GAS のエントリーポイントからは import しない（gas-build.test.ts で保証）。
 */
export class MockIdTokenVerifier implements IdTokenVerifier {
  verify(idToken: string): VerifiedClaims {
    if (!idToken.startsWith(MOCK_TOKEN_PREFIX)) {
      throw new AppError('UNAUTHENTICATED', '認証に失敗しました（モックトークン不正）')
    }
    const email = idToken.slice(MOCK_TOKEN_PREFIX.length).toLowerCase()
    if (!email.includes('@')) throw new AppError('UNAUTHENTICATED', '認証に失敗しました')
    return { sub: `mock-sub-${email}`, email, emailVerified: true }
  }
}
