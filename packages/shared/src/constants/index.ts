import type { AppSettings, Rubric, Team } from '../types/entities'

export const ROLES = ['admin', 'coach', 'viewer'] as const
export const TEAMS = ['A', 'B', 'C'] as const satisfies readonly Team[]

export const SCORE_LEVELS = [1, 2, 3, 4, 5] as const
export const SCORE_MIN = 1
export const SCORE_MAX = 5

export const SCORE_LEVEL_DEFINITIONS: Record<(typeof SCORE_LEVELS)[number], string> = {
  1: '基本的な実行がまだ難しい',
  2: '補助や指示があれば実行できる',
  3: '基本的な状況で自力で実行できる',
  4: '試合中でも多くの場面で実行できる',
  5: '試合中に安定して実行し、状況に応じて応用できる',
}

/** 同一項目の最大評価と最小評価の差がこの値以上で「ばらつき大」 */
export const SPREAD_WARNING_THRESHOLD = 2
export const DEFAULT_MIN_EVALUATOR_COUNT = 2
export const DEFAULT_THRESHOLD_A = 80
export const DEFAULT_THRESHOLD_B = 60
export const TOTAL_WEIGHT = 100

export const DEFAULT_APP_SETTINGS: AppSettings = {
  teamName: '境南SC',
  defaultMinEvaluatorCount: DEFAULT_MIN_EVALUATOR_COUNT,
  defaultCriteriaVersionId: null,
  progressWarningRate: 0.8,
}

export interface CriteriaTemplateItem {
  itemKey: string
  name: string
  description: string
  rubric: Rubric
}

export interface CriteriaTemplateCategory {
  categoryKey: string
  name: string
  weight: number
  items: CriteriaTemplateItem[]
}

export const INITIAL_CRITERIA: CriteriaTemplateCategory[] = [
  {
    categoryKey: 'TEC',
    name: '技術力',
    weight: 30,
    items: [
      {
        itemKey: 'TEC-01',
        name: 'トラップ',
        description: 'ボールを意図した位置にコントロールできるか',
        rubric: {
          '1': 'ボールを止めることが難しい',
          '3': '基本的なパスを止められる',
          '5': '次のプレーを意識したコントロールができる',
        },
      },
      {
        itemKey: 'TEC-02',
        name: 'ドリブル',
        description: 'ボールを保持しながら移動・方向転換できるか',
        rubric: {
          '1': 'ボールを頻繁に失う',
          '3': '基本的な移動や方向転換ができる',
          '5': '相手やスペースに応じて速度と方向を変えられる',
        },
      },
      {
        itemKey: 'TEC-03',
        name: 'パス',
        description: '味方に適切な強さ・方向でパスを出せるか',
        rubric: {
          '1': '味方へのパスが安定しない',
          '3': '近距離の味方にパスを出せる',
          '5': '状況に応じて方向、強さ、タイミングを調整できる',
        },
      },
    ],
  },
  {
    categoryKey: 'DEC',
    name: '判断力',
    weight: 25,
    items: [
      {
        itemKey: 'DEC-01',
        name: '状況認識',
        description: '味方、相手、スペースを認識しているか',
        rubric: {
          '1': '主にボールだけを見ている',
          '3': '周囲を確認する場面がある',
          '5': '受ける前から周囲を確認し続けている',
        },
      },
      {
        itemKey: 'DEC-02',
        name: 'プレー選択',
        description: '状況に応じた適切な行動を選択できるか',
        rubric: {
          '1': '状況に関係なく同じ行動をする',
          '3': '基本的な状況で適切な選択ができる',
          '5': '複数の選択肢から状況に応じて判断できる',
        },
      },
    ],
  },
  {
    categoryKey: 'DUE',
    name: '対人能力',
    weight: 25,
    items: [
      {
        itemKey: 'DUE-01',
        name: '攻撃1対1',
        description: '相手を突破する、またはボールを保持できるか',
        rubric: {
          '1': '相手に対応できず失うことが多い',
          '3': '相手をかわす、または保持することがある',
          '5': '相手の動きを見て突破や保持を選択できる',
        },
      },
      {
        itemKey: 'DUE-02',
        name: '守備1対1',
        description: '相手の突破を防ぎ、ボールを奪う行動ができるか',
        rubric: {
          '1': '相手への対応が難しい',
          '3': '相手に寄せて突破を妨げられる',
          '5': '距離や方向を制御し、適切な機会に奪える',
        },
      },
    ],
  },
  {
    categoryKey: 'INV',
    name: '試合関与',
    weight: 20,
    items: [
      {
        itemKey: 'INV-01',
        name: '攻撃参加',
        description: 'ボールを持っていない場面でも攻撃に関与するか',
        rubric: {
          '1': 'ボールを持たない場面で動きが少ない',
          '3': 'パスを受ける動きができる',
          '5': 'スペースを作る、サポートする等の動きが継続する',
        },
      },
      {
        itemKey: 'INV-02',
        name: '守備参加',
        description: 'ボールを失った際に守備へ切り替えられるか',
        rubric: {
          '1': 'ボールを失った後の反応が少ない',
          '3': '守備へ切り替えられる',
          '5': '素早く切り替え、味方と連携して守備できる',
        },
      },
    ],
  },
]

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
