import { Suit } from './round.js'
import rawTables from './table.json'
import {
  Counts, TileKind, cartesian, cloneCounts, createEmptyCounts, sortBlocks, sortTileKinds, uniqTileKinds,
} from './utils.js'

// 两张表由 utils/table.ts 生成，形状 = 单个花色 9 个位置各 0~4 张，编码成 5 进制数；
// 万/索/筒规则相同，共用一张表。

type Reading = [m: number, t: number, p: number]

interface Tables {
  shanten: { frontiers: Reading[][], index: number[] }
  agari: { bits: number[] }
}
const tables = rawTables as unknown as Tables

const POW5 = [1, 5, 25, 125, 625, 3125, 15625, 78125, 390625]

const SUITS = ['man', 'so', 'pin', 'kaze', 'sangen'] satisfies Suit[]

function encodeShape(tiles: number[]): number {
  let code = 0
  for (let i = 0; i < tiles.length; i++) code += tiles[i] * POW5[i]
  return code
}

function readingsOf(tiles: number[]): Reading[] {
  return tables.shanten.frontiers[tables.shanten.index[encodeShape(tiles)]]
}

function splittable(tiles: number[]): boolean {
  const code = encodeShape(tiles)
  return ((tables.agari.bits[code >> 3] >> (code & 7)) & 1) === 1
}

function honorsReading(counts: Counts): Reading {
  let m = 0
  let p = 0
  for (const suit of ['kaze', 'sangen'] satisfies Suit[]) {
    for (const n of counts[suit]) {
      if (n >= 3) m++
      else if (n === 2) p++
    }
  }
  return [m, p, p > 0 ? 1 : 0]
}

/** 合并中间状态：x 支配 y ⟺ (Σα, Σm, P) 逐分量 ≥，被支配的永远不会更优 */
function paretoStates(states: Reading[]): Reading[] {
  const uniq = [...new Map(states.map(s => [s.join(','), s])).values()]
  return uniq.filter(a => !uniq.some(b => b.join(',') !== a.join(',')
    && b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2]))
}

/** 四组读法合并成 (Σα, Σm, P)：shanten = 8 - min(Σα + 2·naki, Σm + naki + 4 + P) */
export function normalShanten(counts: Counts, naki: number): number {
  let states: Reading[] = [[0, 0, 0]]
  const groups: Reading[][] = [
    readingsOf(counts.man), readingsOf(counts.so), readingsOf(counts.pin), [honorsReading(counts)],
  ]
  for (const group of groups) {
    const next: Reading[] = []
    for (const s of states) {
      for (const x of group) {
        next.push([s[0] + 2 * x[0] + x[1], s[1] + x[0], Math.max(s[2], x[2])])
      }
    }
    states = paretoStates(next)
  }
  let best = Infinity
  for (const [alpha, m, p] of states) {
    best = Math.min(best, 8 - Math.min(alpha + 2 * naki, m + naki + 4 + p))
  }
  return best
}

/** 4 面子 + 将：枚举将，剩下的每组查和了表 */
export function isAgari(counts: Counts): boolean {
  for (const suit of SUITS) {
    const tiles = counts[suit]
    for (let r = 0; r < tiles.length; r++) {
      if (tiles[r] < 2) continue
      tiles[r] -= 2
      const ok = splittable(counts.man) && splittable(counts.so) && splittable(counts.pin)
        && [...counts.kaze, ...counts.sangen].every(n => n % 3 === 0)
      tiles[r] += 2
      if (ok) return true
    }
  }
  return false
}

/**
 * 听牌张；不是听牌的手牌返回空数组（"0 张听牌"也是空数组）。
 * held = 自己手牌 + 副露牌（含暗槓）的张数，用来判"这一张自己这里已经没有了"——
 * M.League 第3章第11条「自己の手牌・副露牌でアガリ牌が消去されている場合は認められない」
 * 说的是手牌和副露牌都算，所以不能只看 counts（那是手牌）。
 */
export function waits(counts: Counts, held: Counts = counts): TileKind[] {
  const result: TileKind[] = []
  for (const suit of SUITS) {
    const tiles = counts[suit]
    for (let r = 0; r < tiles.length; r++) {
      if (held[suit][r] >= 4) continue     // 自己这里已经 4 张，不会有第 5 张
      tiles[r]++
      if (isAgari(counts)) result.push({ suit, rank: r + 1 })
      tiles[r]--
    }
  }
  return sortTileKinds(result)
}

export function shanten(counts: Counts, naki: number, held: Counts = counts): [number, TileKind[]] {
  const candidates: [number, TileKind[]][] = []
  if (naki === 0) {
    candidates.push(chiitoitsuShanten(counts))
    candidates.push(kokushiMusouShanten(counts))
  }
  const normal = normalShanten(counts, naki)
  // 非听牌手牌返回空（旧实现返回的是"进张"，语义含糊）
  candidates.push([normal, normal === 0 ? waits(counts, held) : []])
  const result = candidates.reduce((acc, x) => {
    if (acc[0] < x[0]) return acc
    if (acc[0] > x[0]) return x
    return [x[0], [...acc[1], ...x[1]]]
  })
  return [result[0], uniqTileKinds(result[1])]
}

// 七对子
export function chiitoitsuShanten(counts: Counts): [shanten: number, shantenTileKinds: TileKind[]] {
  const [kinds, pairs] = Object.values(counts).flat().reduce(([kinds, pairs], x) => {
    if (x > 0) kinds++
    if (x >= 2) pairs++
    return [kinds, pairs]
  }, [0, 0])
  const shanten = 6 - pairs + (7 - Math.min(7, kinds))
  const shantenTileKinds: TileKind[] = []
  for (const [suit, tiles] of Object.entries(counts)) {
    for (let i = 0; i < tiles.length; i++) {
      if ((kinds < 7 && tiles[i] <= 1) || (kinds >= 7 && tiles[i] === 1)) {
        shantenTileKinds.push({
          suit: suit as Suit,
          rank: i + 1,
        })
      }
    }
  }
  return [shanten, uniqTileKinds(shantenTileKinds)]
}

// 国士无双
export function kokushiMusouShanten(counts: Counts): [shanten: number, shantenTileKinds: TileKind[]] {
  // 幺九牌
  const yaochu = [
    counts['man'][0], counts['man'][8],
    counts['so'][0], counts['so'][8],
    counts['pin'][0], counts['pin'][8],
    ...counts['kaze'], ...counts['sangen'],
  ]
  const toitsu = yaochu.some(tail => tail >= 2)
  const shanten = 13 - yaochu.filter(tail => tail > 0).length - (toitsu ? 1 : 0)
  const shantenTileKinds: TileKind[] = []
  for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
    if (toitsu) {
      if (counts[suit][0] === 0) shantenTileKinds.push({ suit, rank: 1 })
      if (counts[suit][8] === 0) shantenTileKinds.push({ suit, rank: 9 })
    } else {
      shantenTileKinds.push({ suit, rank: 1 })
      shantenTileKinds.push({ suit, rank: 9 })
    }
  }
  for (const suit of ['kaze', 'sangen'] satisfies Suit[]) {
    for (let i = 0; i < counts[suit].length; i++) {
      if (toitsu) {
        if (counts[suit][i] === 0) shantenTileKinds.push({ suit, rank: i + 1 })
      } else {
        shantenTileKinds.push({ suit, rank: i + 1 })
      }
    }
  }
  return [shanten, uniqTileKinds(shantenTileKinds)]
}

/**
 * 每个听牌张 → 能由它补成和牌的拆分（和牌判役/符用）。
 * 拆分是【13 张】的形态：待ち型要靠"和牌张落在哪个块里"才看得出来，所以先还原再交给 yaku。
 */
export function waitSplits(counts: Counts): [TileKind, Decomposed[]][] {
  const result: [TileKind, Decomposed[]][] = []
  for (const wait of waits(counts)) {
    counts[wait.suit][wait.rank - 1]++
    const splits = split(counts)
    counts[wait.suit][wait.rank - 1]--
    const decs = new Map<string, Decomposed>()
    for (const dec of splits) {
      for (const uncompleted of uncomplete(dec, wait)) {
        decs.set(splitKey(uncompleted), uncompleted)
      }
    }
    if (decs.size !== 0) result.push([wait, [...decs.values()]])
  }
  return result
}

/** 同一张牌可能落在多个块里（1111m23m 的 1m），每种都要产出候选 */
function uncomplete(decomposition: Decomposed, wait: TileKind): Decomposed[] {
  const result: Decomposed[] = []
  for (let index = 0; index < decomposition.blocks.length; index++) {
    const block = decomposition.blocks[index]
    if (block.suit !== wait.suit || !block.tiles.includes(wait.rank)) continue
    const blocks = [...decomposition.blocks]
    const rest = cloneCounts(decomposition.rest)
    if (block.type === 'toitsu') {
      blocks.splice(index, 1)
      rest[block.suit][wait.rank - 1] += 1
    } else if (block.type === 'kotsu') {
      blocks[index] = { type: 'toitsu', suit: block.suit, tiles: [wait.rank, wait.rank] }
    } else {
      // 边张只有 (1,2) 和 (8,9) 两种，其余是两面
      const [low, middle] = block.tiles
      const type: BlockType = wait.rank === middle ? 'kanchan'
        : wait.rank === low ? (low === 7 ? 'penchan' : 'ryammen')
          : (low === 1 ? 'penchan' : 'ryammen')
      blocks[index] = {
        type,
        suit: block.suit,
        tiles: block.tiles.filter(rank => rank !== wait.rank),
      }
    }
    result.push(new Decomposed(blocks, rest))
  }
  return result
}

/** 拆分的规范化字符串（去重用） */
function splitKey(decomposition: Decomposed): string {
  const blocks = decomposition.blocks
    .map(block => `${block.type}:${block.suit}${block.tiles.join(',')}`)
    .sort()
    .join(' ')
  const rest = Object.entries(decomposition.rest)
    .map(([suit, tiles]) => `${suit}${tiles.join(',')}`)
    .join('')
  return `${blocks}/${rest}`
}

export type BlockType = 'shuntsu' | 'kotsu' | 'toitsu' | 'ryammen' | 'penchan' | 'kanchan'
export interface Block {
  type: BlockType
  suit: Suit
  tiles: number[]
}

export class Decomposed {
  constructor(
    public blocks: Block[],
    public rest: Counts,
  ) {
    sortBlocks(blocks)
  }
}

function splitMentsu(tiles: number[], suit: Suit, i = 0, acc: Block[] = []): Block[][] {
  while (i < 9 && tiles[i] === 0) i++
  if (i === 9) return [acc]
  const result: Block[][] = []
  if (tiles[i] >= 3) {
    tiles[i] -= 3
    result.push(...splitMentsu(tiles, suit, i, [...acc, { type: 'kotsu', suit, tiles: [i + 1, i + 1, i + 1] }]))
    tiles[i] += 3
  }
  // 刻子和顺子都要试：1111m23m 要拆成 111m + 123m（共用同一张 1m）
  if (i + 2 < 9 && tiles[i] >= 1 && tiles[i + 1] >= 1 && tiles[i + 2] >= 1) {
    tiles[i]--; tiles[i + 1]--; tiles[i + 2]--
    result.push(...splitMentsu(tiles, suit, i, [...acc, { type: 'shuntsu', suit, tiles: [i + 1, i + 2, i + 3] }]))
    tiles[i]++; tiles[i + 1]++; tiles[i + 2]++
  }
  return result
}

function splitHonors(counts: Counts): Block[][] {
  const blocks: Block[] = []
  for (const suit of ['kaze', 'sangen'] satisfies Suit[]) {
    const tiles = counts[suit]
    for (let r = 0; r < tiles.length; r++) {
      if (tiles[r] === 0) continue
      if (tiles[r] !== 3) return []
      blocks.push({ type: 'kotsu', suit, tiles: [r + 1, r + 1, r + 1] })
    }
  }
  return [blocks]
}

/**
 * 和牌拆分（4 面子 + 1 将）：枚举将，剩下的每组先用和了表判能不能整拆，能拆的才展开成块。
 * 不是和牌形的牌返回空数组。
 */
export function split(counts: Counts): Decomposed[] {
  const result = new Map<string, Decomposed>()
  for (const suit of SUITS) {
    const tiles = counts[suit]
    for (let r = 0; r < tiles.length; r++) {
      if (tiles[r] < 2) continue
      tiles[r] -= 2                                       // 拿走这一对当将
      const whole = splittable(counts.man) && splittable(counts.so) && splittable(counts.pin)
        && [...counts.kaze, ...counts.sangen].every(n => n % 3 === 0)
      if (whole) {
        const pair: Block = { type: 'toitsu', suit, tiles: [r + 1, r + 1] }
        for (const combo of cartesian(
          splitMentsu([...counts.man], 'man'),
          splitMentsu([...counts.so], 'so'),
          splitMentsu([...counts.pin], 'pin'),
          splitHonors(counts),
        )) {
          const decomposition = new Decomposed([...combo.flat(), pair], createEmptyCounts())
          result.set(splitKey(decomposition), decomposition)
        }
      }
      tiles[r] += 2
    }
  }
  return [...result.values()]
}
