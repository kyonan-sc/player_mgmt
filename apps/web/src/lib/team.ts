import type { Team } from '@kyonan/shared'

export const TEAM_COLOR_VAR: Record<Team | 'none', string> = {
  A: 'var(--team-a)',
  B: 'var(--team-b)',
  C: 'var(--team-c)',
  none: 'var(--team-none)',
}
