/**
 * Testes das funções puras de code.ts.
 *
 * As funções são copiadas aqui porque code.ts é um script global sem exports.
 * Mantenha em sincronia com code.ts — indicado com "SYNC:" abaixo.
 */

import { describe, it, expect } from 'vitest'

// ── SYNC: code.ts — getTouchDimensions (linha ~66) ───────────────
function getTouchDimensions(preset: string): { hStr: string; wStr: string } {
  if (preset === '44x100') return { hStr: '44px', wStr: 'Ocupa 100% da largura do componente' }
  if (preset === '44x44')  return { hStr: '44px', wStr: '44px' }
  if (preset === '24x24')  return { hStr: '24px', wStr: '24px' }
  if (preset === '24x100') return { hStr: '24px', wStr: 'Ocupa 100% da largura do componente' }
  return { hStr: '—', wStr: '—' }
}

// ── SYNC: code.ts — toTouchPreset (linha ~3474) ──────────────────
function toTouchPreset(h: number, w: number): string {
  if (h === 44 && w === 44) return '44x44'
  if (h === 44) return '44x100'
  if (h === 24 && w === 24) return '24x24'
  if (h === 24) return '24x100'
  return 'livre'
}

// ── SYNC: code.ts — computeLetrasTS (linha ~149) ─────────────────
function computeLetrasTS(conectores: { tipo: string; [k: string]: unknown }[]): string[] {
  const letras: string[] = []
  let decCounter = 0
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const typeCounters: Record<string, number> = {}
  for (const item of conectores) {
    if (item.tipo === 'decorativo') {
      letras.push('✦' + (decCounter > 0 ? String(decCounter + 1) : ''))
      decCounter++
    } else {
      const tipo = item.tipo || ''
      if (typeCounters[tipo] === undefined) typeCounters[tipo] = 0
      letras.push(ALPHA[typeCounters[tipo] % 26])
      typeCounters[tipo]++
    }
  }
  return letras
}

// ── SYNC: code.ts — applyWcagBackground (math interno, linha ~92) ─
const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}
function wcagContrast(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker  = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ─────────────────────────────────────────────────────────────────

describe('getTouchDimensions', () => {
  it('44x100 → 44px full-width', () => {
    expect(getTouchDimensions('44x100')).toEqual({ hStr: '44px', wStr: 'Ocupa 100% da largura do componente' })
  })
  it('44x44 → 44px quadrado', () => {
    expect(getTouchDimensions('44x44')).toEqual({ hStr: '44px', wStr: '44px' })
  })
  it('24x24 → 24px quadrado', () => {
    expect(getTouchDimensions('24x24')).toEqual({ hStr: '24px', wStr: '24px' })
  })
  it('24x100 → 24px full-width', () => {
    expect(getTouchDimensions('24x100')).toEqual({ hStr: '24px', wStr: 'Ocupa 100% da largura do componente' })
  })
  it('preset desconhecido → dashes', () => {
    expect(getTouchDimensions('livre')).toEqual({ hStr: '—', wStr: '—' })
    expect(getTouchDimensions('')).toEqual({ hStr: '—', wStr: '—' })
  })
})

describe('toTouchPreset', () => {
  it('44×44 → "44x44"', () => expect(toTouchPreset(44, 44)).toBe('44x44'))
  it('44×outro → "44x100" (full-width)', () => expect(toTouchPreset(44, 0)).toBe('44x100'))
  it('24×24 → "24x24"', () => expect(toTouchPreset(24, 24)).toBe('24x24'))
  it('24×outro → "24x100"', () => expect(toTouchPreset(24, 0)).toBe('24x100'))
  it('dimensões livres → "livre"', () => expect(toTouchPreset(32, 32)).toBe('livre'))

  it('roundtrip: getTouchDimensions(toTouchPreset()) não retorna dash para presets conhecidos', () => {
    const casos: [number, number][] = [[44, 44], [44, 0], [24, 24], [24, 0]]
    for (const [h, w] of casos) {
      const { hStr } = getTouchDimensions(toTouchPreset(h, w))
      expect(hStr).not.toBe('—')
    }
  })
})

describe('computeLetrasTS', () => {
  it('lista vazia → []', () => {
    expect(computeLetrasTS([])).toEqual([])
  })
  it('um item não-decorativo → ["A"]', () => {
    expect(computeLetrasTS([{ tipo: 'funcional' }])).toEqual(['A'])
  })
  it('dois itens do mesmo tipo → A, B', () => {
    expect(computeLetrasTS([{ tipo: 'funcional' }, { tipo: 'funcional' }])).toEqual(['A', 'B'])
  })
  it('tipos diferentes têm contadores independentes', () => {
    const result = computeLetrasTS([
      { tipo: 'funcional' },
      { tipo: 'informativo' },
      { tipo: 'funcional' },
    ])
    expect(result).toEqual(['A', 'A', 'B'])
  })
  it('decorativo → "✦"', () => {
    expect(computeLetrasTS([{ tipo: 'decorativo' }])).toEqual(['✦'])
  })
  it('dois decorativos → "✦", "✦2"', () => {
    expect(computeLetrasTS([{ tipo: 'decorativo' }, { tipo: 'decorativo' }])).toEqual(['✦', '✦2'])
  })
  it('mistura decorativo + funcional', () => {
    const result = computeLetrasTS([
      { tipo: 'funcional' },
      { tipo: 'decorativo' },
      { tipo: 'funcional' },
    ])
    expect(result).toEqual(['A', '✦', 'B'])
  })
  it('tipo vazio conta como tipo ""', () => {
    const result = computeLetrasTS([{ tipo: '' }, { tipo: '' }])
    expect(result).toEqual(['A', 'B'])
  })
})

describe('WCAG contrast math', () => {
  it('branco sobre preto → contraste ~21:1', () => {
    const lW = relativeLuminance(1, 1, 1)
    const lB = relativeLuminance(0, 0, 0)
    expect(wcagContrast(lW, lB)).toBeCloseTo(21, 0)
  })
  it('branco sobre branco → contraste 1:1', () => {
    const l = relativeLuminance(1, 1, 1)
    expect(wcagContrast(l, l)).toBeCloseTo(1, 5)
  })
  it('ordem dos argumentos é simétrica', () => {
    const lG = relativeLuminance(0.5, 0.5, 0.5)
    const lW = relativeLuminance(1, 1, 1)
    expect(wcagContrast(lG, lW)).toBeCloseTo(wcagContrast(lW, lG), 10)
  })
  it('branco sobre branco tem contraste < 3 (precisa trocar fundo)', () => {
    const l = relativeLuminance(1, 1, 1)
    expect(wcagContrast(l, l)).toBeLessThan(3)
  })
  it('preto sobre branco tem contraste > 4.5 (passa AA)', () => {
    const lW = relativeLuminance(1, 1, 1)
    const lB = relativeLuminance(0, 0, 0)
    expect(wcagContrast(lW, lB)).toBeGreaterThan(4.5)
  })
})
