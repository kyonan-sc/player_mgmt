import {
  buildInitialCriteria,
  type ApiAction,
  type ApiPayloadInput,
  type ApiResponse,
  type ApiResult,
} from '@kyonan/shared'
import { createMockApi, encodeRow, TABLES, type AppConfig, type Row } from './core'

export const GROUP = 'g-u9'
export const OTHER_GROUP = 'g-u10'
export const EMAILS = {
  admin: 'admin@example.com',
  coach: 'coach@example.com',
  coach2: 'coach2@example.com',
  viewer: 'viewer@example.com',
  outsider: 'other-group@example.com',
  inactive: 'inactive@example.com',
}

const T = '2026-01-01T00:00:00.000Z'

/** テスト用の最小データセット */
export function buildFixture(): Record<string, Row[]> {
  const criteria = buildInitialCriteria('cv1', T)
  const coach = (id: string, email: string, role: string, status = 'active') =>
    encodeRow(TABLES.coaches, {
      id,
      googleSub: null,
      email,
      displayName: id,
      role,
      status,
      createdAt: T,
      updatedAt: T,
    } as never)
  const player = (id: string, n: number, groupId = GROUP) =>
    encodeRow(TABLES.players, {
      id,
      displayName: `選手${n}`,
      jerseyNumber: n,
      enrollmentGrade: 3,
      enrollmentYear: 2026,
      groupId,
      joinedDate: null,
      status: 'active',
      createdAt: T,
      updatedAt: T,
    })
  return {
    groups: [
      encodeRow(TABLES.groups, { id: GROUP, name: 'U-9', cohortYear: 2018, status: 'active' }),
      encodeRow(TABLES.groups, {
        id: OTHER_GROUP,
        name: 'U-10',
        cohortYear: 2017,
        status: 'active',
      }),
    ],
    coaches: [
      coach('c-admin', EMAILS.admin, 'admin'),
      coach('c-coach', EMAILS.coach, 'coach'),
      coach('c-coach2', EMAILS.coach2, 'coach'),
      coach('c-viewer', EMAILS.viewer, 'viewer'),
      coach('c-out', EMAILS.outsider, 'coach'),
      coach('c-inactive', EMAILS.inactive, 'coach', 'inactive'),
    ],
    coach_groups: [
      { id: 'cg1', coachId: 'c-coach', groupId: GROUP },
      { id: 'cg2', coachId: 'c-coach2', groupId: GROUP },
      { id: 'cg3', coachId: 'c-viewer', groupId: GROUP },
      { id: 'cg4', coachId: 'c-out', groupId: OTHER_GROUP },
    ],
    players: [player('p1', 1), player('p2', 2), player('p3', 3, OTHER_GROUP)],
    criteria_versions: [encodeRow(TABLES.criteriaVersions, criteria.version)],
    criteria_categories: criteria.categories.map(({ items: _items, ...c }) =>
      encodeRow(TABLES.criteriaCategories, c),
    ),
    criteria_items: criteria.categories.flatMap((c) =>
      c.items.map((i) => encodeRow(TABLES.criteriaItems, i)),
    ),
  }
}

export const ITEM_KEYS = [
  'TEC-01',
  'TEC-02',
  'TEC-03',
  'DEC-01',
  'DEC-02',
  'DUE-01',
  'DUE-02',
  'INV-01',
  'INV-02',
]
export const scoresOf = (v: number | null) => Object.fromEntries(ITEM_KEYS.map((k) => [k, v]))

export function createTestApi(
  options: {
    bootstrapAdminEmail?: string
    fixture?: Record<string, Row[]>
    config?: Partial<AppConfig>
  } = {},
) {
  let counter = 0
  let clock = Date.parse('2026-06-01T00:00:00.000Z')
  const api = createMockApi(options.fixture ?? buildFixture(), {
    now: () => new Date(clock),
    uuid: () => `u${++counter}`,
    config: { bootstrapAdminEmail: options.bootstrapAdminEmail ?? null, ...options.config },
  })
  let reqCounter = 0
  function call<A extends ApiAction>(
    as: string | null,
    action: A,
    payload?: ApiPayloadInput<A>,
    requestId = `req-${++reqCounter}-xxxx`,
  ): ApiResponse<ApiResult<A>> {
    clock += 1000
    // as が "guest." で始まる場合はゲストトークンをそのまま送る
    const idToken = as === null ? null : as.startsWith('guest.') ? as : `mock:${as}`
    return api.handle(JSON.stringify({ action, requestId, idToken, payload })) as ApiResponse<
      ApiResult<A>
    >
  }
  function ok<A extends ApiAction>(
    as: string,
    action: A,
    payload?: ApiPayloadInput<A>,
  ): ApiResult<A> {
    const res = call(as, action, payload)
    if (!res.success) throw new Error(`${action} failed: ${res.error.code} ${res.error.message}`)
    return res.data
  }
  return {
    api,
    call,
    ok,
    /** テスト用の時計を進める */
    advance: (ms: number) => {
      clock += ms
    },
  }
}
