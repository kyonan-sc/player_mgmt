/** モックモードのログインユーザー（架空） */
export const MOCK_USERS = [
  {
    email: 'kantoku@kyonan-sc.example',
    name: '山本 監督',
    role: 'admin',
    description: '全機能・評価確定・ユーザー管理',
  },
  {
    email: 'tanaka@kyonan-sc.example',
    name: '田中 コーチ',
    role: 'coach',
    description: '3年生担当・評価入力',
  },
  {
    email: 'sato@kyonan-sc.example',
    name: '佐藤 コーチ',
    role: 'coach',
    description: '3年生担当・評価入力',
  },
  {
    email: 'viewer@kyonan-sc.example',
    name: '鈴木（閲覧）',
    role: 'viewer',
    description: '確定結果の閲覧のみ',
  },
] as const
