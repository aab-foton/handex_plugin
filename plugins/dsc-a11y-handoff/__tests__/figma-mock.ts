/**
 * Factory de mocks mínimos da Figma API para testes de parsers.
 * Simula a estrutura de nodes que os parsers percorrem.
 */

export type MockNode = {
  type: string
  name: string
  characters?: string
  children?: MockNode[]
  pluginData?: Record<string, string>
  parent?: MockNode
  x?: number
  y?: number
  width?: number
  height?: number
  fills?: unknown[]
  componentProperties?: Record<string, unknown>
  visible?: boolean
  [key: string]: unknown
  getPluginData(key: string): string
  setPluginData(key: string, value: string): void
  getPluginDataKeys(): string[]
  findOne(pred: (n: MockNode) => boolean): MockNode | null
  findAll(pred: (n: MockNode) => boolean): MockNode[]
}

function addTreeMethods(node: Omit<MockNode, 'getPluginData' | 'setPluginData' | 'getPluginDataKeys' | 'findOne' | 'findAll'>): MockNode {
  const n = node as MockNode
  n.pluginData = n.pluginData ?? {}
  n.getPluginData = (key) => n.pluginData![key] ?? ''
  n.setPluginData = (key, val) => { n.pluginData![key] = val }
  n.getPluginDataKeys = () => Object.keys(n.pluginData ?? {})
  n.findOne = (pred) => {
    for (const child of n.children ?? []) {
      if (pred(child)) return child
      const found = child.findOne(pred)
      if (found) return found
    }
    return null
  }
  n.findAll = (pred) => {
    const results: MockNode[] = []
    const recurse = (nodes: MockNode[]) => {
      for (const c of nodes) {
        if (pred(c)) results.push(c)
        recurse(c.children ?? [])
      }
    }
    recurse(n.children ?? [])
    return results
  }
  // Define referência parent em todos os filhos diretos
  for (const child of n.children ?? []) {
    child.parent = n
  }
  return n
}

export function text(characters: string, extra: Partial<MockNode> = {}): MockNode {
  return addTreeMethods({ type: 'TEXT', name: characters.slice(0, 20), characters, y: 0, ...extra })
}

export function frame(name: string, children: MockNode[] = [], extra: Partial<MockNode> = {}): MockNode {
  return addTreeMethods({ type: 'FRAME', name, children, ...extra })
}

export function instance(name: string, children: MockNode[] = [], extra: Partial<MockNode> = {}): MockNode {
  return addTreeMethods({ type: 'INSTANCE', name, children, ...extra })
}

export function component(name: string, children: MockNode[] = [], extra: Partial<MockNode> = {}): MockNode {
  return addTreeMethods({ type: 'COMPONENT', name, children, ...extra })
}
