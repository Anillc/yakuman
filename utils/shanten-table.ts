import { Suit } from '../src/round.js'

// 向听表：单花色形状 → 读法前沿
//
// 读法 = 把这组牌切成若干互不相交的块之后的读数 (m, t, p)：
//   m = 面子数，t = 搭子块数（对子、两面、嵌张、边张），p = 有没有对子块
//
// 支配关系：x 支配 y ⟺ (2m+t, m, m+p) 逐分量 ≥（至少一个严格）。
// 整手牌的值是 min(2M+T, M+4+P)，被支配的读法在任何手牌里都不会更好，可以丢。

export type Reading = [m: number, t: number, p: number]

/** 万/索/筒规则相同，共用同一张表 */
export const NUMBER_SUITS = ['man', 'so', 'pin'] satisfies Suit[]

export const POW5 = [1, 5, 25, 125, 625, 3125, 15625, 78125, 390625]
export const SHAPE_COUNT = 5 ** 9

/** 14 张手牌全是同一个花色 */
export const MAX_SHAPE_TILES = 14

export function encodeShape(tiles: number[]): number {
  let code = 0
  for (let i = 0; i < tiles.length; i++) code += tiles[i] * POW5[i]
  return code
}

// 形状不合法说明调用方出错（比如给已经 4 张的牌再加一张去试听牌），必须显式报错
export function assertShape(tiles: number[]): void {
  if (tiles.length !== 9) throw new Error(`花色形状必须是 9 个位置，收到 ${tiles.length} 个`)
  let sum = 0
  for (const n of tiles) {
    if (!Number.isInteger(n) || n < 0 || n > 4) throw new Error(`每格必须是 0~4 的整数，收到 ${n}`)
    sum += n
  }
  if (sum > MAX_SHAPE_TILES) throw new Error(`单个花色最多 ${MAX_SHAPE_TILES} 张，收到 ${sum} 张`)
}

export function dominates(x: Reading, y: Reading): boolean {
  const ax = 2 * x[0] + x[1]
  const ay = 2 * y[0] + y[1]
  const bx = x[0] + x[2]
  const by = y[0] + y[2]
  return ax >= ay && x[0] >= y[0] && bx >= by
    && (ax > ay || x[0] > y[0] || bx > by)
}

export function frontier(points: Reading[]): Reading[] {
  const uniq = new Map<string, Reading>()
  for (const point of points) uniq.set(point.join(','), point)
  const all = [...uniq.values()]
  return all.filter(a => !all.some(b => dominates(b, a)))
}

const readingCache = new Map<number, Reading[]>()

/**
 * 一个花色形状的读法前沿（懒加载 + 记忆化）。
 * 每个分支都是真的放下一个块再回溯，所以搜出来的读法一定用的是真实存在的牌、互不重叠。
 */
export function suitReadings(tiles: number[]): Reading[] {
  assertShape(tiles)
  return search([...tiles], 0)   // 搜索会临时改张数，复制一份
}

function search(tiles: number[], i: number): Reading[] {
  while (i < 9 && tiles[i] === 0) i++
  if (i === 9) return [[0, 0, 0]]
  const key = encodeShape(tiles) * 10 + i
  const hit = readingCache.get(key)
  if (hit) return hit

  const out: Reading[] = []
  const branch = (can: boolean, take: () => void, put: () => void, delta: Reading) => {
    if (!can) return
    take()
    for (const x of search(tiles, i)) {
      out.push([x[0] + delta[0], x[1] + delta[1], x[2] | delta[2]])
    }
    put()
  }
  branch(tiles[i] >= 3, () => tiles[i] -= 3, () => tiles[i] += 3, [1, 0, 0])
  branch(i + 2 < 9 && tiles[i] >= 1 && tiles[i + 1] >= 1 && tiles[i + 2] >= 1,
    () => { tiles[i]--; tiles[i + 1]--; tiles[i + 2]-- },
    () => { tiles[i]++; tiles[i + 1]++; tiles[i + 2]++ }, [1, 0, 0])
  branch(tiles[i] >= 2, () => tiles[i] -= 2, () => tiles[i] += 2, [0, 1, 1])
  branch(i + 1 < 9 && tiles[i] >= 1 && tiles[i + 1] >= 1,
    () => { tiles[i]--; tiles[i + 1]-- }, () => { tiles[i]++; tiles[i + 1]++ }, [0, 1, 0])
  branch(i + 2 < 9 && tiles[i] >= 1 && tiles[i + 2] >= 1,
    () => { tiles[i]--; tiles[i + 2]-- }, () => { tiles[i]++; tiles[i + 2]++ }, [0, 1, 0])

  // 从 i+1 开始的块只会用到 i+1、i+2、i+3，所以位置 i 剩下的牌永远没用了：
  // 丢掉整个 rank 就行，不能写成"一张张丢"（那会让搜索爆炸）
  const saved = tiles[i]
  tiles[i] = 0
  out.push(...search(tiles, i + 1))
  tiles[i] = saved

  const result = frontier(out)
  readingCache.set(key, result)
  return result
}

/** 字牌不能连顺，三张算面子、两张算对子 */
export function honorsReadings(kaze: number[], sangen: number[]): Reading[] {
  let m = 0
  let p = 0
  for (const tiles of [kaze, sangen]) {
    for (const n of tiles) {
      if (n >= 3) m++
      else if (n === 2) p++
    }
  }
  return [[m, p, p > 0 ? 1 : 0]]
}

/** 总张数 ≤ 14 的单花色形状共 405,350 个 */
export function* reachableShapes(maxTiles = MAX_SHAPE_TILES): Generator<number[]> {
  const tiles = new Array(9).fill(0)
  function* walk(i: number, rest: number): Generator<number[]> {
    if (i === 9) {
      yield [...tiles]
      return
    }
    for (let n = 0; n <= Math.min(4, rest); n++) {
      tiles[i] = n
      yield* walk(i + 1, rest - n)
    }
  }
  yield* walk(0, maxTiles)
}

export interface ShantenTable {
  /** 形状码 → frontiers 下标；一字节一格所以前沿不能超过 256 种，没填过的格子是 0 */
  index: Uint8Array
  frontiers: Reading[][]
  get(tiles: number[]): Reading[]
}

/** 实测 405,350 个形状约 1.3 秒 */
export function buildTable(maxTiles = MAX_SHAPE_TILES): ShantenTable {
  const index = new Uint8Array(SHAPE_COUNT)
  const seen = new Map<string, number>()
  const frontiers: Reading[][] = []
  const idOf = (f: Reading[]) => {
    const key = f.map(x => x.join(',')).join(';')
    let id = seen.get(key)
    if (id === undefined) {
      id = frontiers.length
      seen.set(key, id)
      frontiers.push(f)
    }
    return id
  }
  // 下标 0 留给空形状：没填过的死格子读出来是 (0,0,0)
  idOf([[0, 0, 0]])
  for (const tiles of reachableShapes(maxTiles)) {
    index[encodeShape(tiles)] = idOf(suitReadings(tiles))
  }
  if (frontiers.length > 256) throw new Error(`前沿超过 256 种（${frontiers.length}），一字节索引装不下`)
  return {
    index,
    frontiers,
    get(tiles: number[]) {
      assertShape(tiles)
      return frontiers[index[encodeShape(tiles)]]
    },
  }
}

/** JSON.stringify 要普通数组，Uint8Array 直接 stringify 会变成对象 */
export function tableJson(table: ShantenTable): { frontiers: Reading[][], index: number[] } {
  return { frontiers: table.frontiers, index: Array.from(table.index) }
}
