import type { ApiError } from '@kyonan/shared'

export class AppError extends Error {
  constructor(
    public readonly code: ApiError['code'],
    message: string,
    public readonly details?: ApiError['details'],
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const forbidden = (message = 'この操作を行う権限がありません') =>
  new AppError('FORBIDDEN', message)
export const notFound = (what = 'データ') => new AppError('NOT_FOUND', `${what}が見つかりません`)
export const conflict = (message: string) => new AppError('CONFLICT', message)
export const invalid = (message: string, details?: ApiError['details']) =>
  new AppError('VALIDATION_ERROR', message, details)
