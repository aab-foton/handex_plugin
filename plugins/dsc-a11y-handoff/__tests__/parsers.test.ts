/**
 * Testes dos parsers de migração de handoff antigo.
 *
 * SYNC: As funções abaixo são cópias de code.ts.
 * Ao alterar a lógica de parsing em code.ts, atualize aqui também.
 * Linhas de referência indicadas em cada bloco.
 */

import { describe, it, expect } from 'vitest'
import { frame, text, instance, component, type MockNode } from './figma-mock.ts'

// ── SYNC: code.ts:3471 ───────────────────────────────────────────
type TouchArea = { nome: string; width: number; height: number; preset: string; relX: number; relY: number }
type TouchVariacao = { nome: string; propriedades: Record<string, string>; areas: TouchArea[] }

// ── SYNC: code.ts:3474 ───────────────────────────────────────────
function toTouchPreset(h: number, w: number): string {
  if (h === 44 && w === 44) return '44x44'
  if (h === 44) return '44x100'
  if (h === 24 && w === 24) return '24x24'
  if (h === 24) return '24x100'
  return 'livre'
}

// ── SYNC: code.ts:39 (simplificado — sem getMainComponentAsync) ──
async function resolveDataNode(node: MockNode): Promise<MockNode | null> {
  if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') return node
  return null
}

// ── SYNC: code.ts:3482 ───────────────────────────────────────────
async function parseOldTouchAreas(handoff: MockNode): Promise<{ variacoes: TouchVariacao[] }> {
  const variacoes: TouchVariacao[] = []

  const targetAreaFrame = handoff.findOne(n => n.name === 'target area')

  if (targetAreaFrame) {
    const specsFrame = (targetAreaFrame.children ?? []).find(n => n.name === 'specs')
    const imageFrame = (targetAreaFrame.children ?? []).find(n => n.name === 'image')

    const instances = imageFrame
      ? (imageFrame.children ?? [])
          .filter(n => n.type === 'INSTANCE' && !n.name.startsWith('[dsc-h]') && n.name !== 'tag')
          .sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
      : []

    const elements = specsFrame
      ? (specsFrame.children ?? []).filter(n => n.name === 'element' && n.visible !== false)
      : []

    for (let idx = 0; idx < elements.length; idx++) {
      const elem = elements[idx]

      const nameInst = (elem.children ?? []).find(n => n.name === 'Element name')
      const nameTexts = nameInst ? nameInst.findAll(n => n.type === 'TEXT') : []
      const nameText = nameTexts.find(t =>
        !/^\d+$/.test((t.characters ?? '').trim()) &&
        (t.characters ?? '').trim().length > 1 &&
        (t.characters ?? '').trim().length < 60
      )
      const nome = nameText?.characters?.trim().replace(/^\d+\s+/, '') || `Área ${idx + 1}`

      const codes = (elem.children ?? []).filter(n => n.name === 'code')
      const getCodeText = (code: MockNode): string => {
        const valueInst = code.findOne(n => n.name === 'value')
        const t = valueInst ? valueInst.findOne(n => n.type === 'TEXT') : null
        return t?.characters?.trim() || ''
      }
      const hStr = codes[0] ? getCodeText(codes[0]) : ''
      const wStr = codes[1] ? getCodeText(codes[1]) : ''
      const h = parseInt(hStr)
      const w = /^\d+px$/i.test(wStr) ? parseInt(wStr) : 0
      if (isNaN(h) || h === 0) continue

      const inst = instances[idx]
      const propriedades: Record<string, string> = {}
      if (inst?.componentProperties) {
        for (const [key, val] of Object.entries(inst.componentProperties)) {
          propriedades[key.replace(/#[\w:]+$/, '').trim()] = String((val as any)?.value ?? '')
        }
      }

      let relX = 0, relY = 0, overlayWidth = w
      if (inst && imageFrame) {
        const overlayFrames = (imageFrame.children ?? []).filter(n =>
          n.name !== 'tag' && n.name !== '[dsc-h] Item Number' &&
          !instances.includes(n) &&
          n.height != null && Math.round(n.height ?? 0) === h
        )
        const bestOverlay = overlayFrames.sort((a, b) =>
          Math.abs((a.x ?? 0) - (inst.x ?? 0)) - Math.abs((b.x ?? 0) - (inst.x ?? 0))
        )[0]
        if (bestOverlay) {
          relX = (bestOverlay.x ?? 0) - (inst.x ?? 0)
          relY = (bestOverlay.y ?? 0) - (inst.y ?? 0)
          overlayWidth = Math.round(bestOverlay.width ?? 0) === Math.round(inst.width ?? 0) ? 0 : (bestOverlay.width ?? 0)
        }
      }
      const finalW = overlayWidth > 0 ? overlayWidth : w

      const nomeVar = idx === 0 ? 'Default' : (inst?.name || `Variação ${idx + 1}`)
      variacoes.push({ nome: nomeVar, propriedades, areas: [{ nome, width: finalW, height: h, preset: toTouchPreset(h, finalW), relX, relY }] })
    }

    if (variacoes.length > 0) return { variacoes }
  }

  // Fallback: labels "height:" no corpo do handoff
  const areas: TouchArea[] = []
  const allTextNodes = handoff.findAll(n => n.type === 'TEXT')
  const heightLabels = allTextNodes.filter(n => /^height\s*:?\s*$/i.test((n.characters ?? '').trim()))

  for (const hlabel of heightLabels) {
    let areaContainer: MockNode | null = hlabel.parent ?? null
    let containerTexts: MockNode[] = []

    for (let depth = 0; depth < 5 && areaContainer; depth++) {
      if (areaContainer.findAll) {
        const texts = areaContainer.findAll(n => n.type === 'TEXT')
        const hasWidth = texts.some(n => /^width\s*:?\s*$/i.test((n.characters ?? '').trim()))
        const hasPxVal = texts.some(n => /^\d+\s*px$/i.test((n.characters ?? '').trim()))
        if (hasWidth && hasPxVal) { containerTexts = texts; break }
      }
      areaContainer = (areaContainer.parent as MockNode | undefined) ?? null
    }
    if (!containerTexts.length) continue

    const widthLabel = containerTexts.find(n => /^width\s*:?\s*$/i.test((n.characters ?? '').trim()))
    if (!widthLabel) continue

    const pxValues = containerTexts.filter(n => /^\d+\s*px$/i.test((n.characters ?? '').trim()))
    if (pxValues.length < 1) continue

    const hAbsY = hlabel.y ?? 0
    const hValue = pxValues.reduce((best, node) =>
      Math.abs((node.y ?? 0) - hAbsY) < Math.abs((best.y ?? 0) - hAbsY) ? node : best
    )
    const h = parseInt(hValue.characters ?? '')
    if (isNaN(h)) continue

    const wAbsY = widthLabel.y ?? 0
    const remainingPx = pxValues.filter(n => n !== hValue)
    let w = 0
    if (remainingPx.length > 0) {
      const wValue = remainingPx.reduce((best, node) =>
        Math.abs((node.y ?? 0) - wAbsY) < Math.abs((best.y ?? 0) - wAbsY) ? node : best
      )
      w = parseInt(wValue.characters ?? '') || 0
    }

    const nameNode = containerTexts.find(n => {
      const t = (n.characters ?? '').trim()
      return !/^(height|width)\s*:?\s*$/i.test(t) && !/^\d+\s*px$/i.test(t) && !/^\d+$/.test(t) && t.length > 1 && t.length < 50
    })
    const rawName = nameNode?.characters?.trim() || `Área ${areas.length + 1}`
    const nome = rawName.replace(/^\d+\s+/, '').trim() || rawName

    if (!areas.find(a => a.nome === nome && a.width === w && a.height === h)) {
      areas.push({ nome, width: w, height: h, preset: toTouchPreset(h, w), relX: 0, relY: 0 })
    }
  }

  if (areas.length > 0) variacoes.push({ nome: 'Default', propriedades: {}, areas })
  return { variacoes }
}

// ── SYNC: code.ts:3665 ───────────────────────────────────────────
async function parseOldGeralData(handoff: MockNode, comp: MockNode | null): Promise<{
  visualPairs: { mapeamento: string; descricao: string }[]
  pluginDataKeys: string[]
  pluginDataMapeamentos: { mapeamento: string; utilizacao: string }[]
  pluginDataPlataformas: string[]
  pluginDataZoom: string[]
}> {
  const visualPairs: { mapeamento: string; descricao: string }[] = []
  const skipMapeamento = ['teclado', 'ação', 'mapeamento', 'gesto', 'descrição', '']

  const kbContainer = handoff.findOne(n => n.name === 'keyboard maping' || n.name === 'keyboard mapping')
  const extractPairsFromContainer = (container: MockNode) => {
    const tableChild = (container.children ?? []).find(n => n.name === 'table')
    const source = tableChild ?? container
    const rows = (source.children ?? []).filter(n => n.type !== 'TEXT')
    for (const row of rows) {
      const textos = row.findAll(n => n.type === 'TEXT')
      if (textos.length >= 1) {
        const mapeamento = (textos[0].characters ?? '').trim()
        const descricao = (textos[1]?.characters ?? '').trim()
        if (!skipMapeamento.includes(mapeamento.toLowerCase())) visualPairs.push({ mapeamento, descricao })
      }
    }
  }
  if (kbContainer) extractPairsFromContainer(kbContainer)

  const gestureContainer = handoff.findOne(n =>
    n.name === 'gesto maping' || n.name === 'gesture maping' || n.name === 'gesture mapping' || n.name === 'gestures'
  )
  if (gestureContainer) extractPairsFromContainer(gestureContainer)

  const visualZoom: string[] = []
  const allTexts = handoff.findAll(n => n.type === 'TEXT')
  const hasRedimensionamento = allTexts.some(n => (n.characters ?? '').toLowerCase().includes('redimensionamento'))
  const hasRefluxo = allTexts.some(n => (n.characters ?? '').toLowerCase().includes('refluxo'))
  if (hasRedimensionamento) visualZoom.push('200% Texto (reflow)')
  if (hasRefluxo) visualZoom.push('400% Componente (scaling)')

  const pluginDataKeys: string[] = []
  const pluginDataMapeamentos: { mapeamento: string; utilizacao: string }[] = []
  const pluginDataPlataformas: string[] = []
  const pluginDataZoom: string[] = []
  let savedData: any = null

  if (comp) {
    const dataNode = await resolveDataNode(comp)
    if (dataNode) {
      try {
        pluginDataKeys.push(...dataNode.getPluginDataKeys())
        const raw = dataNode.getPluginData('a11y-component-data')
        if (raw) savedData = JSON.parse(raw)
      } catch (_e) {}
    }
  }
  const dbScan = handoff.findOne(n => n.name === '[dsc-h] Plugin Data A11y')
  if (dbScan) {
    try { const raw = dbScan.getPluginData('a11y-component-data'); if (raw) savedData = JSON.parse(raw) } catch (_e) {}
  }
  try { const raw = handoff.getPluginData('a11y-component-data'); if (raw) savedData = JSON.parse(raw) } catch (_e) {}

  if (savedData) {
    if (Array.isArray(savedData.mapeamentos)) {
      for (const m of savedData.mapeamentos) {
        if (m.mapeamento) pluginDataMapeamentos.push({ mapeamento: m.mapeamento, utilizacao: m.utilizacao || '' })
      }
    }
    if (Array.isArray(savedData.plataformas)) pluginDataPlataformas.push(...savedData.plataformas)
    if (Array.isArray(savedData.zoom)) pluginDataZoom.push(...savedData.zoom)
  }

  const zoomFinal = [...new Set([...visualZoom, ...pluginDataZoom])]
  return { visualPairs, pluginDataKeys, pluginDataMapeamentos, pluginDataPlataformas, pluginDataZoom: zoomFinal }
}

// ── Helpers de mock ────────────────────────────────────────────

function makeKbRow(mapeamento: string, descricao: string) {
  return frame('row', [text(mapeamento), text(descricao)])
}

function makeOldHandoffGeral(kbRows: MockNode[], gestRows: MockNode[] = [], extraTexts: MockNode[] = []) {
  const children: MockNode[] = [
    frame('keyboard maping', [frame('table', kbRows)]),
    ...extraTexts,
  ]
  if (gestRows.length) children.push(frame('gesto maping', [frame('table', gestRows)]))
  return frame('[dsc] A11Y Handoff: Button', children)
}

function makeTouchElement(nome: string, hStr: string, wStr: string) {
  return frame('element', [
    instance('Element name', [text(nome)]),
    frame('code', [frame('value', [text(hStr)])]),
    frame('code', [frame('value', [text(wStr)])]),
  ])
}

function makeOldHandoffToque(elements: MockNode[], imageChildren: MockNode[] = []) {
  return frame('[dsc] A11Y Handoff: Button', [
    frame('target area', [
      frame('specs', elements),
      frame('image', imageChildren),
    ]),
  ])
}

function makeFallbackHandoff(areaName: string, hStr: string, wStr?: string) {
  const children: MockNode[] = [text('height:'), text(hStr), text('width:'), text(areaName)]
  if (wStr) children.push(text(wStr))
  return frame('[dsc] A11Y Handoff: Button', [frame('specContainer', children)])
}

// ─────────────────────────────────────────────────────────────────

describe('parseOldGeralData', () => {
  it('extrai pares mapeamento+descrição de "keyboard maping"', async () => {
    const handoff = makeOldHandoffGeral([
      makeKbRow('Tab', 'Avança o foco'),
      makeKbRow('Enter', 'Ativa o botão'),
    ])
    const result = await parseOldGeralData(handoff, null)
    expect(result.visualPairs).toEqual([
      { mapeamento: 'Tab', descricao: 'Avança o foco' },
      { mapeamento: 'Enter', descricao: 'Ativa o botão' },
    ])
  })

  it('ignora linhas de cabeçalho (teclado, ação, mapeamento, gesto, descrição)', async () => {
    const handoff = makeOldHandoffGeral([
      makeKbRow('Teclado', 'Ação'),
      makeKbRow('mapeamento', 'descrição'),
      makeKbRow('Tab', 'Avança o foco'),
    ])
    const result = await parseOldGeralData(handoff, null)
    expect(result.visualPairs).toHaveLength(1)
    expect(result.visualPairs[0].mapeamento).toBe('Tab')
  })

  it('extrai pares de "gesto maping"', async () => {
    const handoff = makeOldHandoffGeral([], [makeKbRow('Swipe direita', 'Próximo elemento')])
    const result = await parseOldGeralData(handoff, null)
    expect(result.visualPairs).toEqual([{ mapeamento: 'Swipe direita', descricao: 'Próximo elemento' }])
  })

  it('"redimensionamento" no texto → "200% Texto (reflow)"', async () => {
    const handoff = makeOldHandoffGeral([], [], [text('Suporte a redimensionamento de texto')])
    const result = await parseOldGeralData(handoff, null)
    expect(result.pluginDataZoom).toContain('200% Texto (reflow)')
  })

  it('"refluxo" no texto → "400% Componente (scaling)"', async () => {
    const handoff = makeOldHandoffGeral([], [], [text('Suporte a refluxo de layout')])
    const result = await parseOldGeralData(handoff, null)
    expect(result.pluginDataZoom).toContain('400% Componente (scaling)')
  })

  it('retorna arrays vazios quando não há seção de teclado', async () => {
    const handoff = frame('[dsc] A11Y Handoff: Button', [])
    const result = await parseOldGeralData(handoff, null)
    expect(result.visualPairs).toEqual([])
    expect(result.pluginDataMapeamentos).toEqual([])
    expect(result.pluginDataPlataformas).toEqual([])
    expect(result.pluginDataZoom).toEqual([])
  })

  it('lê pluginData do componente quando comp é COMPONENT', async () => {
    const savedData = { mapeamentos: [{ mapeamento: 'Tab', utilizacao: 'teclado' }], plataformas: ['iOS'], zoom: [] }
    const comp = component('Button', [], { pluginData: { 'a11y-component-data': JSON.stringify(savedData) } })
    const handoff = frame('[dsc] A11Y Handoff: Button', [])
    const result = await parseOldGeralData(handoff, comp)
    expect(result.pluginDataMapeamentos).toEqual([{ mapeamento: 'Tab', utilizacao: 'teclado' }])
    expect(result.pluginDataPlataformas).toEqual(['iOS'])
  })

  it('pluginData do handoff tem prioridade sobre o do componente', async () => {
    const compData = { mapeamentos: [{ mapeamento: 'Tab', utilizacao: 'teclado' }], plataformas: [], zoom: [] }
    const handoffData = { mapeamentos: [{ mapeamento: 'Enter', utilizacao: 'teclado' }], plataformas: ['Android'], zoom: [] }
    const comp = component('Button', [], { pluginData: { 'a11y-component-data': JSON.stringify(compData) } })
    const handoff = frame('[dsc] A11Y Handoff: Button', [], { pluginData: { 'a11y-component-data': JSON.stringify(handoffData) } })
    const result = await parseOldGeralData(handoff, comp)
    expect(result.pluginDataMapeamentos[0].mapeamento).toBe('Enter')
    expect(result.pluginDataPlataformas).toEqual(['Android'])
  })
})

describe('parseOldTouchAreas', () => {
  it('extrai área 44×44 → preset "44x44"', async () => {
    const handoff = makeOldHandoffToque([makeTouchElement('Botão', '44px', '44px')])
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes).toHaveLength(1)
    expect(variacoes[0].areas[0]).toMatchObject({ height: 44, width: 44, preset: '44x44' })
  })

  it('extrai área 44px full-width → preset "44x100"', async () => {
    const handoff = makeOldHandoffToque([makeTouchElement('Botão', '44px', 'Ocupa 100%')])
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes[0].areas[0]).toMatchObject({ height: 44, width: 0, preset: '44x100' })
  })

  it('extrai nome da área de "Element name"', async () => {
    const handoff = makeOldHandoffToque([makeTouchElement('Ícone fechar', '44px', '44px')])
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes[0].areas[0].nome).toBe('Ícone fechar')
  })

  it('o primeiro elemento recebe nome de variação "Default"', async () => {
    const handoff = makeOldHandoffToque([makeTouchElement('Botão', '44px', '44px')])
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes[0].nome).toBe('Default')
  })

  it('ignora elementos com height inválido ou 0', async () => {
    const handoff = makeOldHandoffToque([
      makeTouchElement('Sem altura', '', '44px'),
      makeTouchElement('Altura zero', '0px', '44px'),
      makeTouchElement('Válido', '44px', '44px'),
    ])
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes).toHaveLength(1)
    expect(variacoes[0].areas[0].nome).toBe('Válido')
  })

  it('múltiplos elementos geram múltiplas variações', async () => {
    const comp1 = instance('Variante A', [], { x: 0 })
    const comp2 = instance('Variante B', [], { x: 100 })
    const handoff = makeOldHandoffToque(
      [makeTouchElement('Área 1', '44px', '44px'), makeTouchElement('Área 2', '24px', '24px')],
      [comp1, comp2]
    )
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes).toHaveLength(2)
    expect(variacoes[0].nome).toBe('Default')
    expect(variacoes[1].nome).toBe('Variante B')
  })

  it('fallback por labels "height:" quando não há target area', async () => {
    const handoff = makeFallbackHandoff('Botão', '44px')
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes).toHaveLength(1)
    expect(variacoes[0].areas[0]).toMatchObject({ height: 44, width: 0, preset: '44x100', nome: 'Botão' })
  })

  it('retorna variacoes vazias quando não há dados de toque', async () => {
    const handoff = frame('[dsc] A11Y Handoff: Button', [])
    const { variacoes } = await parseOldTouchAreas(handoff)
    expect(variacoes).toEqual([])
  })
})
