import { describe, expect, it } from 'vitest'
import { escapeCsvCell, toCsv } from './csv'

describe('CSV 出力', () => {
  it.each(['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)'])(
    '数式として解釈される文字列 %s を無害化する',
    (value) => {
      expect(escapeCsvCell(value).replace(/^"|"$/g, '').startsWith("'")).toBe(true)
    },
  )

  it('数値の負数はそのまま出力する', () => {
    expect(escapeCsvCell(-1.5)).toBe('-1.5')
  })

  it('カンマ・改行・ダブルクォートをエスケープする', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'he said "hi"\nok']])).toBe(
      'a,b\r\n"x,y","he said ""hi""\nok"',
    )
  })
})
