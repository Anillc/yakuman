import { TileType } from './round'
import {
  Counts, DecomposedSet, NumberDecomposedSet, Pai, addCounts,
  cartesian, cloneCounts, comparePai, createEmptyCounts, sortBlocks, uniqPai,
} from './utils'

export interface Shanten {
  type: 'chitoitsu' | 'kokushimusou' | 'normal'
}

export function shanten(counts: Counts, naki: number): [number, Pai[]] {
  const shanten: [number, Pai[]][] = []
  if (naki === 0) {
    shanten.push(chitoitsuShanten(counts))
    shanten.push(kokushimusouShanten(counts))
  }
  const normal = normalShanten(counts, naki)
  shanten.push([normal[0], normal[1].map(x => x[0])])
  const result = shanten.reduce((acc, x) => {
    if (acc[0] < x[0]) return acc
    if (acc[0] > x[0]) return x
    return [x[0], [...acc[1], ...x[1]]]
  })
  return [result[0], uniqPai(result[1])]
}

// 七对子
export function chitoitsuShanten(counts: Counts): [shanten: number, shantenPai: Pai[]] {
  const [gt0, ge1, ge2] = Object.values(counts).flat().reduce(([gt0, ge1, ge2], x) => {
    if (x > 0) gt0++
    if (x >= 1) ge1++
    if (x >= 2) ge2++
    return [gt0, ge1, ge2]
  }, [0, 0, 0])
  const shanten = 6 - ge2 + (7 - Math.min(7, ge1))
  const shantenPai: Pai[] = []
  for (const [type, tiles] of Object.entries(counts)) {
    for (let i = 0; i < tiles.length; i++) {
      if ((gt0 < 7 && tiles[i] <= 1) || (gt0 >= 7 && tiles[i] === 1)) {
        shantenPai.push({
          type: type as TileType,
          num: i + 1,
        })
      }
    }
  }
  return [shanten, uniqPai(shantenPai)]
}

// 国士无双
export function kokushimusouShanten(counts: Counts): [shanten: number, shantenPai: Pai[]] {
  // 幺九牌
  const yaochu = [
    counts['man'][0], counts['man'][8],
    counts['so'][0], counts['so'][8],
    counts['pin'][0], counts['pin'][8],
    ...counts['kaze'], ...counts['sangen'],
  ]
  const toitsu = yaochu.some(tail => tail >= 2)
  const shanten = 13 - yaochu.filter(tail => tail > 0).length - (toitsu ? 1 : 0)
  const tempi: Pai[] = []
  for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
    if (toitsu) {
      if (counts[type][0] === 0) tempi.push({ type, num: 1 })
      if (counts[type][8] === 0) tempi.push({ type, num: 9 })
    } else {
      tempi.push({ type, num: 1 })
      tempi.push({ type, num: 9 })
    }
  }
  for (const type of ['kaze', 'sangen'] satisfies TileType[]) {
    for (let i = 0; i < counts[type].length; i++) {
      if (toitsu) {
        if (counts[type][i] === 0) tempi.push({ type, num: i + 1 })
      } else {
        tempi.push({ type, num: i + 1 })
      }
    }
  }
  return [shanten, uniqPai(tempi)]
}

export function normalShanten(counts: Counts, naki: number): [shanten: number, tempai: [Pai, Decomposed[]][]] {
  const result: [Pai, Decomposed[]][] = []
  const [shanten, decomposed] = minShanten(decompose(counts), naki)
  for (const dec of decomposed) {
    function add(pai: Pai) {
      const element = result.find(element => comparePai(element[0], pai) === 0)
      if (!element) {
        result.push([pai, [dec]])
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
      add({ type: rm.tileType, num: rm.tiles[0] - 1 })
      add({ type: rm.tileType, num: rm.tiles[1] + 1 })
    }
    for (const pc of penchan) {
      const num = pc.tiles[0] === 1 ? pc.tiles[1] + 1 : pc.tiles[0] - 1
      add({ type: pc.tileType, num })
    }
    for (const kc of kanchan) {
      add({ type: kc.tileType, num: kc.tiles[0] + 1 })
    }
    // 分没有对子、一个对子和多个对子三种情况
    function makeTatsu() {
      for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
        for (let i = 0; i < dec.rest[type].length; i++) {
          if (dec.rest[type][i] === 0) continue
          if (i - 2 < 0 || i + 2 > 8) continue
          for (const tile of [i - 2, i - 1, i, i + 1, i + 2]) {
            add({ type: type as TileType, num: tile + 1 })
          }
        }
      }
      for (const type of ['kaze', 'sangen'] satisfies TileType[]) {
        for (let i = 0; i < dec.rest[type].length; i++) {
          if (dec.rest[type][i] === 0) continue
          add({ type: type as TileType, num: i + 1 })
        }
      }
    }
    if (toitsu.length === 0) {
      if (mentsuLength + naki + tatsuLength < 4)  {
        makeTatsu()
      } else {
        // 将单张做成对子
        for (const [type, tiles] of Object.entries(dec.rest)) {
          for (let i = 0; i < tiles.length; i++) {
            if (tiles[i] === 0) continue
            add({ type: type as TileType, num: i + 1 })
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
          type: tt.tileType,
          num: tt.tiles[0],
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
  tileType: TileType
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
  for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
    const tiles = counts[type]
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
            tileType: type,
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
            tileType: type,
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
          isolated[type][i]++
        }
      }
    }
  }
  for (const type of ['kaze', 'sangen'] satisfies TileType[]) {
    const tiles = counts[type]
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] >= 3) {
        tiles[i] -= 3
        blocks.push({
          type: 'kotsu',
          tileType: type,
          tiles: [i + 1, i + 1, i + 1],
        })
      }
      if (tiles[i] === 1) {
        tiles[i]--
        isolated[type][i]++
      }
    }
  }
  return [blocks, isolated, counts]
}

// 计算面子与雀头
function jantou(counts: Counts) {
  counts = cloneCounts(counts)
  const results = new DecomposedSet()
  for (const [type, tiles] of Object.entries(counts)) {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] < 2) continue
      const cloned = cloneCounts(counts)
      cloned[type][i] -= 2
      for (const { blocks, rest } of mentsu(cloned).values()) {
        results.add(new Decomposed(
          blocks.concat({
            type: 'toitsu',
            tileType: type as TileType,
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
  for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
    const result = new NumberDecomposedSet()
    const tiles = counts[type]
    for (const { blocks: b1, rest } of [...kotsu(tiles, type).values(), ...shuntsu(tiles, type).values()]) {
      for (const { blocks: b2, rest: r2 } of tatsu(rest, type, Math.max(0, 4 - b1.length)).values()) {
        result.add(new NumberDecomposed([...b1, ...b2], r2))
      }
    }
    results.push(result)
  }
  const mps = cartesian(...results.map(result => result.values()))

  // 字牌
  const tsuhai: Block[] = []
  for (const type of ['kaze', 'sangen'] satisfies TileType[]) {
    const tiles = counts[type]
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] >= 2) {
        tiles[i] -= 2
        tsuhai.push({
          type: 'toitsu',
          tileType: type,
          tiles: [i + 1, i + 1],
        })
      }
    }
  }

  const result = new DecomposedSet()
  mps.forEach(mps => {
    result.add(new Decomposed(
      [...mps[0].blocks, ...mps[1].blocks, ...mps[2].blocks, ...tsuhai],
      {
        'man': mps[0].rest,
        'so': mps[1].rest,
        'pin': mps[2].rest,
        'kaze': counts['kaze'],
        'sangen': counts['sangen'],
      },
    ))
  })
  return result
}

function kotsu(tiles: number[], type: TileType): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] < 3) continue
    empty = false
    const cloned = [...tiles]
    cloned[i] -= 3
    for (const { blocks, rest } of [...kotsu(cloned, type).values(), ...shuntsu(cloned, type).values()]) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'kotsu',
          tileType: type,
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

function shuntsu(tiles: number[], type: TileType): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (i + 2 > 8 || tiles[i] < 1 || tiles[i + 1] < 1 || tiles[i + 2] < 1) continue
    empty = false
    const cloned = [...tiles]
    cloned[i]--
    cloned[i + 1]--
    cloned[i + 2]--
    for (const { blocks, rest } of [...kotsu(cloned, type).values(), ...shuntsu(cloned, type).values()]) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'shuntsu',
          tileType: type,
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

function tatsu(tiles: number[], type: TileType, resurse: number): NumberDecomposedSet {
  const set = new NumberDecomposedSet()
  set.addSet(toitsu(tiles, type, resurse))
  set.addSet(ryammen(tiles, type, resurse))
  set.addSet(kanchan(tiles, type, resurse))
  return set
}

function toitsu(tiles: number[], type: TileType, resurse: number): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  if (resurse === 0) {
    results.add(new NumberDecomposed([], tiles))
    return results
  }
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] < 2) continue
    empty = false
    const cloned = [...tiles]
    cloned[i] -= 2
    for (const { blocks, rest } of tatsu(cloned, type, resurse - 1).values()) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'toitsu',
          tileType: type,
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
function ryammen(tiles: number[], type: TileType, resurse: number): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  if (resurse === 0) {
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
    for (const { blocks, rest } of tatsu(cloned, type, resurse - 1).values()) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: i === 0 || i === 7 ? 'penchan' : 'ryammen',
          tileType: type,
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

function kanchan(tiles: number[], type: TileType, resurse: number): NumberDecomposedSet {
  const results = new NumberDecomposedSet()
  if (resurse === 0) {
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
    for (const { blocks, rest } of tatsu(cloned, type, resurse - 1).values()) {
      results.add(new NumberDecomposed(
        blocks.concat({
          type: 'kanchan',
          tileType: type,
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
    let tatsu = mentsu + tatsuBlocks > 4 ? 4 - mentsu : tatsuBlocks
    let hasToitsu = (mentsu + tatsuBlocks) > 4 && count.toitsu > 0
    let shanten = 8 - mentsu * 2 - tatsu - (hasToitsu ? 1 : 0)
    if (shanten < min) {
      return [shanten, [x]]
    } else if (shanten === min) {
      return [min, list.concat(x)]
    } else {
      return [min, list]
    }
  }, [Infinity, []] as [number, Decomposed[]])
}
