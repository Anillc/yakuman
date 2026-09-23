import { Suit } from './round'
import {
  Counts, DecomposedSet, NumberDecomposedSet, TileKind, addCounts,
  cartesian, cloneCounts, compareTileKind, createEmptyCounts, sortBlocks, uniqTileKinds,
} from './utils'

export function shanten(counts: Counts, naki: number): [number, TileKind[]] {
  const candidates: [number, TileKind[]][] = []
  if (naki === 0) {
    candidates.push(chiitoitsuShanten(counts))
    candidates.push(kokushiMusouShanten(counts))
  }
  const normal = normalShanten(counts, naki)
  candidates.push([normal[0], normal[1].map(x => x[0])])
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

export function normalShanten(counts: Counts, naki: number): [shanten: number, waitDecompositions: [TileKind, Decomposed[]][]] {
  const result: [TileKind, Decomposed[]][] = []
  const [shanten, decomposed] = minShanten(decompose(counts), naki)
  for (const dec of decomposed) {
    function add(tileKind: TileKind) {
      const element = result.find(element => compareTileKind(element[0], tileKind) === 0)
      if (!element) {
        result.push([tileKind, [dec]])
      } else {
        element[1].push(dec)
      }
    }

    const {
      shuntsu, kotsu, toitsu,
      ryammen, penchan, kanchan,
    } = dec.blocks.reduce((acc, x) => {
      acc[x.type].push(x)
      return acc
    }, {
      shuntsu: [], kotsu: [], toitsu: [],
      ryammen: [], penchan: [], kanchan: [],
    } as Record<BlockType, Block[]>)
    const mentsuLength = shuntsu.length + kotsu.length
    const tatsuLength = ryammen.length + penchan.length + kanchan.length

    for (const rm of ryammen) {
      add({ suit: rm.suit, rank: rm.tiles[0] - 1 })
      add({ suit: rm.suit, rank: rm.tiles[1] + 1 })
    }
    for (const pc of penchan) {
      const rank = pc.tiles[0] === 1 ? pc.tiles[1] + 1 : pc.tiles[0] - 1
      add({ suit: pc.suit, rank })
    }
    for (const kc of kanchan) {
      add({ suit: kc.suit, rank: kc.tiles[0] + 1 })
    }
    // 分没有对子、一个对子和多个对子三种情况
    function makeTatsu() {
      for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
        for (let i = 0; i < dec.rest[suit].length; i++) {
          if (dec.rest[suit][i] === 0) continue
          if (i - 2 < 0 || i + 2 > 8) continue
          for (const tile of [i - 2, i - 1, i, i + 1, i + 2]) {
            add({ suit, rank: tile + 1 })
          }
        }
      }
      for (const suit of ['kaze', 'sangen'] satisfies Suit[]) {
        for (let i = 0; i < dec.rest[suit].length; i++) {
          if (dec.rest[suit][i] === 0) continue
          add({ suit, rank: i + 1 })
        }
      }
    }
    if (toitsu.length === 0) {
      if (mentsuLength + naki + tatsuLength < 4)  {
        makeTatsu()
      } else {
        // 将单张做成对子
        for (const [suit, tiles] of Object.entries(dec.rest)) {
          for (let i = 0; i < tiles.length; i++) {
            if (tiles[i] === 0) continue
            add({ suit: suit as Suit, rank: i + 1 })
          }
        }
      }
    }
    if ((toitsu.length === 1 && mentsuLength + naki + tatsuLength < 4)
      || (toitsu.length >= 2 && mentsuLength + naki + tatsuLength < 5)) {
      makeTatsu()
      // 将对子做成刻子
      for (const tt of toitsu) {
        add({
          suit: tt.suit,
          rank: tt.tiles[0],
        })
      }
    }
  }
  return [shanten, result]
}

export type BlockType = 'shuntsu' | 'kotsu' | 'toitsu' | 'ryammen' | 'penchan' | 'kanchan'
export const blockTypes: BlockType[] = ['shuntsu', 'kotsu', 'toitsu', 'ryammen', 'penchan', 'kanchan']
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

// 数牌
export class NumberDecomposed {
  constructor(
    public blocks: Block[],
    public rest: number[],
  ) {
    sortBlocks(blocks)
  }
}

export function decompose(counts: Counts): Decomposed[] {
  const [blocks, isolated, rest] = isolate(counts)
  const decomposed = jantou(rest)
  const result = new DecomposedSet()
  for (const dec of decomposed.values()) {
    result.add(new Decomposed(
      [...blocks, ...dec.blocks],
      addCounts(isolated, dec.rest),
    ))
  }
  return result.values()
}

function isolate(counts: Counts): [
  blocks: Block[],
  isolated: Counts,
  rest: Counts,
] {
  counts = cloneCounts(counts)
  const isolated = createEmptyCounts()
  const blocks: Block[] = []
  for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
    const tiles = counts[suit]
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] >= 3) {
        let iso = true
        for (const j of [i - 2, i - 1, i + 1, i + 2]) {
          if (j < 0 || j > 8) continue
          if (tiles[j] > 0) {
            iso = false
            break
          }
        }
        if (iso) {
          tiles[i] -= 3
          blocks.push({
            type: 'kotsu',
            suit,
            tiles: [i + 1, i + 1, i + 1],
          })
        }
      }
      if (tiles[i] === 1 && tiles[i + 1] === 1 && tiles[i + 2] === 1) {
        let iso = true
        for (const j of [i - 2, i - 1, i + 3, i + 4]) {
          if (j < 0 || j > 8) continue
          if (tiles[j] > 0) {
            iso = false
            break
          }
        }
        if (iso) {
          tiles[i]--
          tiles[i + 1]--
          tiles[i + 2]--
          blocks.push({
            type: 'shuntsu',
            suit,
            tiles: [i + 1, i + 2, i + 3],
          })
        }
      }
      if (tiles[i] === 1) {
        let iso = true
        for (const j of [i - 2, i - 1, i + 1, i + 2]) {
          if (j < 0 || j > 8) continue
          if (tiles[j] > 0) {
            iso = false
            break
          }
        }
        if (iso) {
          tiles[i]--
          isolated[suit][i]++
        }
      }
    }
  }
  for (const suit of ['kaze', 'sangen'] satisfies Suit[]) {
    const tiles = counts[suit]
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] >= 3) {
        tiles[i] -= 3
        blocks.push({
          type: 'kotsu',
          suit,
          tiles: [i + 1, i + 1, i + 1],
        })
      }
      if (tiles[i] === 1) {
        tiles[i]--
        isolated[suit][i]++
      }
    }
  }
  return [blocks, isolated, counts]
}

// 计算面子与雀头
function jantou(counts: Counts) {
  counts = cloneCounts(counts)
  const results = new DecomposedSet()
  for (const [suit, tiles] of Object.entries(counts)) {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] < 2) continue
      const cloned = cloneCounts(counts)
      cloned[suit][i] -= 2
      for (const { blocks, rest } of mentsu(cloned).values()) {
        results.add(new Decomposed(
          blocks.concat({
            type: 'toitsu',
            suit: suit as Suit,
            tiles: [i + 1, i + 1],
          }),
          rest,
        ))
      }
    }
  }
  results.addSet(mentsu(counts))
  return results
}

// 计算面子
function mentsu(counts: Counts): DecomposedSet {
  counts = cloneCounts(counts)
  const results: NumberDecomposedSet[] = []
  for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
    const result = new NumberDecomposedSet()
    const tiles = counts[suit]
    for (const { blocks: b1, rest } of [...kotsu(tiles, suit).values(), ...shuntsu(tiles, suit).values()]) {
      for (const { blocks: b2, rest: r2 } of tatsu(rest, suit, Math.max(0, 4 - b1.length)).values()) {
        result.add(new NumberDecomposed([...b1, ...b2], r2))
      }
    }
    results.push(result)
  }
  const suitDecompositions = cartesian(...results.map(result => result.values()))

  // 字牌
  const tsuhai: Block[] = []
  for (const suit of ['kaze', 'sangen'] satisfies Suit[]) {
    const tiles = counts[suit]
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] >= 2) {
        tiles[i] -= 2
        tsuhai.push({
          type: 'toitsu',
          suit,
          tiles: [i + 1, i + 1],
        })
      }
    }
  }

  const result = new DecomposedSet()
  suitDecompositions.forEach(suitDecompositions => {
    result.add(new Decomposed(
      [...suitDecompositions[0].blocks, ...suitDecompositions[1].blocks, ...suitDecompositions[2].blocks, ...tsuhai],
      {
        'man': suitDecompositions[0].rest,
        'so': suitDecompositions[1].rest,
        'pin': suitDecompositions[2].rest,
        'kaze': counts['kaze'],
        'sangen': counts['sangen'],
      },
    ))
  })
  return result
}

function kotsu(tiles: number[], suit: Suit): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] < 3) continue
    empty = false
    const cloned = [...tiles]
    cloned[i] -= 3
    for (const { blocks, rest } of [...kotsu(cloned, suit).values(), ...shuntsu(cloned, suit).values()]) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'kotsu',
          suit,
          tiles: [i + 1, i + 1, i + 1],
        }),
        rest,
      ))
    }
  }
  if (empty) {
    results.add(new NumberDecomposed([], tiles))
  }
  return results
}

function shuntsu(tiles: number[], suit: Suit): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (i + 2 > 8 || tiles[i] < 1 || tiles[i + 1] < 1 || tiles[i + 2] < 1) continue
    empty = false
    const cloned = [...tiles]
    cloned[i]--
    cloned[i + 1]--
    cloned[i + 2]--
    for (const { blocks, rest } of [...kotsu(cloned, suit).values(), ...shuntsu(cloned, suit).values()]) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'shuntsu',
          suit,
          tiles: [i + 1, i + 2, i + 3],
        }),
        rest,
      ))
    }
  }
  if (empty) {
    results.add(new NumberDecomposed([], tiles))
  }
  return results
}

function tatsu(tiles: number[], suit: Suit, slots: number): NumberDecomposedSet {
  const set = new NumberDecomposedSet()
  set.addSet(toitsu(tiles, suit, slots))
  set.addSet(ryammen(tiles, suit, slots))
  set.addSet(kanchan(tiles, suit, slots))
  return set
}

function toitsu(tiles: number[], suit: Suit, slots: number): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  if (slots === 0) {
    results.add(new NumberDecomposed([], tiles))
    return results
  }
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] < 2) continue
    empty = false
    const cloned = [...tiles]
    cloned[i] -= 2
    for (const { blocks, rest } of tatsu(cloned, suit, slots - 1).values()) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'toitsu',
          suit,
          tiles: [i + 1, i + 1],
        }),
        rest,
      ))
    }
  }
  if (empty) {
    results.add(new NumberDecomposed([], tiles))
  }
  return results
}

// 两面和边张
function ryammen(tiles: number[], suit: Suit, slots: number): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  if (slots === 0) {
    results.add(new NumberDecomposed([], tiles))
    return results
  }
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 > 8 || tiles[i] < 1 || tiles[i + 1] < 1) continue
    empty = false
    const cloned = [...tiles]
    cloned[i]--
    cloned[i + 1]--
    for (const { blocks, rest } of tatsu(cloned, suit, slots - 1).values()) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: i === 0 || i === 7 ? 'penchan' : 'ryammen',
          suit,
          tiles: [i + 1, i + 2],
        }),
        rest,
      ))
    }
  }
  if (empty) {
    results.add(new NumberDecomposed([], tiles))
  }
  return results
}

function kanchan(tiles: number[], suit: Suit, slots: number): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  if (slots === 0) {
    results.add(new NumberDecomposed([], tiles))
    return results
  }
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (i + 2 > 8 || tiles[i] < 1 || tiles[i + 2] < 1) continue
    empty = false
    const cloned = [...tiles]
    cloned[i]--
    cloned[i + 2]--
    for (const { blocks, rest } of tatsu(cloned, suit, slots - 1).values()) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'kanchan',
          suit,
          tiles: [i + 1, i + 3],
        }),
        rest,
      ))
    }
  }
  if (empty) {
    results.add(new NumberDecomposed([], tiles))
  }
  return results
}

// naki: 鸣牌
export function minShanten(decomposed: Decomposed[], naki: number): [shanten: number, decomposed: Decomposed[]] {
  return decomposed.reduce(([min, list], x, i) => {
    const count = {
      kotsu: 0,
      shuntsu: 0,
      ryammen: 0,
      penchan: 0,
      kanchan: 0,
      toitsu: 0,
    }
    for (const block of x.blocks) {
      count[block.type]++
    }
    let mentsu = count.kotsu + count.shuntsu + naki
    let tatsuBlocks = count.ryammen + count.penchan + count.kanchan + count.toitsu
    let usableTatsu = mentsu + tatsuBlocks > 4 ? 4 - mentsu : tatsuBlocks
    let hasToitsu = (mentsu + tatsuBlocks) > 4 && count.toitsu > 0
    let shanten = 8 - mentsu * 2 - usableTatsu - (hasToitsu ? 1 : 0)
    if (shanten < min) {
      return [shanten, [x]]
    } else if (shanten === min) {
      return [min, list.concat(x)]
    } else {
      return [min, list]
    }
  }, [Infinity, []] as [number, Decomposed[]])
}
