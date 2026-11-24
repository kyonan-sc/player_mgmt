export interface VerifiedClaims {
  sub: string
  email: string
  emailVerified: boolean
  name?: string
}

/** ID Token の検証器。検証に失敗した場合は AppError('UNAUTHENTICATED') を投げる。 */
export interface IdTokenVerifier {
  verify(idToken: string): VerifiedClaims
}
