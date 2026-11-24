import { Eye, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function GuestPasswordLogin({
  pending,
  onSubmit,
}: {
  pending: boolean
  onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password) onSubmit(password)
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="パスワードで入場">
      <label
        htmlFor="guest-password"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <Eye className="size-3.5" /> パスワードで入る（検証環境のみ）
      </label>
      <div className="flex gap-2">
        <Input
          id="guest-password"
          type="password"
          autoComplete="off"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />
        <Button type="submit" disabled={pending || password === ''} className="shrink-0">
          {pending && <Loader2 className="animate-spin" />}
          入る
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        コーチ権限で入ります。評価の入力はできますが、選手・評価期間・設定の管理（管理者の操作）はできません。入力した評価は検証用データに保存されます。
      </p>
    </form>
  )
}
