import type { TileType } from './index'
import {
  Counts, Pai, addCounts, cartesian, cloneCounts, createEmptyCounts,
  sortBlocks, uniqDecomposed, uniqNumberDecomposed, uniqPai
} from './utils'

export interface Shanten {
  type: 'chitoitsu' | 'kokushimuso' | 'normal'
}

export function shanten(counts: Counts) {
  
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
export function kokushimusoShanten(counts: Counts): [shanten: number, shantenPai: Pai[]] {
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

export function normalShanten(counts: Counts, naki: number): [shanten: number, shantenPai: Pai[]] {
  const shantenPai: Pai[] = []
  const [shanten, decomposed] = minShanten(decompose(counts), naki)
  for (const dec of decomposed) {
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
      shantenPai.push({ type: rm.tileType, num: rm.tiles[0] - 1 })
      shantenPai.push({ type: rm.tileType, num: rm.tiles[1] + 1 })
    }
    for (const pc of penchan) {
      const num = pc.tiles[0] === 1 ? pc.tiles[1] + 1 : pc.tiles[0] - 1
      shantenPai.push({ type: pc.tileType, num })
    }
    for (const kc of kanchan) {
      shantenPai.push({ type: kc.tileType, num: kc.tiles[0] + 1 })
    }
    // 分没有对子、一个对子和多个对子三种情况
    function makeTatsu() {
      for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
        for (let i = 0; i < dec.rest[type].length; i++) {
          if (dec.rest[type][i] === 0) continue
          if (i - 2 < 0 || i + 2 > 8) continue
          for (const tile of [i - 2, i - 1, i, i + 1, i + 2]) {
            shantenPai.push({ type: type as TileType, num: tile + 1 })
          }
        }
      }
      for (const type of ['kaze', 'sangen'] satisfies TileType[]) {
        for (let i = 0; i < dec.rest[type].length; i++) {
          if (dec.rest[type][i] === 0) continue
          shantenPai.push({ type: type as TileType, num: i + 1 })
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
            shantenPai.push({ type: type as TileType, num: i + 1 })
          }
        }
      }
    }
    if ((toitsu.length === 1 && mentsuLength + naki + tatsuLength < 4)
      || (toitsu.length >= 2 && mentsuLength + naki + tatsuLength < 5)) {
      makeTatsu()
      // 将对子做成刻子
      for (const tt of toitsu) {
        shantenPai.push({
          type: tt.tileType,
          num: tt.tiles[0],
        })
      }
    }
  }
  return [shanten, uniqPai(shantenPai)]
}

export type BlockType = 'shuntsu' | 'kotsu' | 'toitsu' | 'ryammen' | 'penchan' | 'kanchan'
export interface Block {
  type: BlockType
  tileType: TileType
  tiles: number[]
}

export interface Decomposed {
  blocks: Block[]
  rest: Counts
}

// 数牌
export interface NumberDecomposed {
  blocks: Block[]
  rest: number[]
}

export function decompose(counts: Counts): Decomposed[] {
  const [blocks, isolated, rest] = isolate(counts)
  const decomposed = jantou(rest)
  return uniqDecomposed(decomposed.map(decomposed => ({
    blocks: [...blocks, ...decomposed.blocks],
    rest: addCounts(isolated, decomposed.rest),
  })))
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
  sortBlocks(blocks)
  return [blocks, isolated, counts]
}

// 计算面子与雀头
function jantou(counts: Counts) {
  counts = cloneCounts(counts)
  const results: Decomposed[] = []
  for (const [type, tiles] of Object.entries(counts)) {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] < 2) continue
      const cloned = cloneCounts(counts)
      cloned[type][i] -= 2
      for (const { blocks, rest } of mentsu(cloned)) {
        results.push({
          blocks: blocks.concat({
            type: 'toitsu',
            tileType: type as TileType,
            tiles: [i + 1, i + 1],
          }),
          rest,
        })
      }
    }
  }
  results.forEach(({ blocks }) => sortBlocks(blocks))
  results.push(...mentsu(counts))
  return results
}

// 计算面子
function mentsu(counts: Counts): Decomposed[] {
  counts = cloneCounts(counts)
  const results: NumberDecomposed[][] = []
  for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
    const result: NumberDecomposed[] = []
    const tiles = counts[type]
    for (const { blocks: b1, rest } of [...kotsu(tiles, type), ...shuntsu(tiles, type)]) {
      for (const { blocks: b2, rest: r2 } of tatsu(rest, type, Math.max(0, 4 - b1.length))) {
        result.push({
          blocks: [...b1, ...b2],
          rest: r2,
        })
      }
    }
    results.push(result)
  }
  results.forEach(decomposed => decomposed.forEach(({ blocks }) => sortBlocks(blocks)))
  const mps = cartesian(...results.map(uniqNumberDecomposed))

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

  return mps.map(mps => ({
    blocks: sortBlocks([...mps[0].blocks, ...mps[1].blocks, ...mps[2].blocks, ...tsuhai]),
    rest: {
      'man': mps[0].rest,
      'so': mps[1].rest,
      'pin': mps[2].rest,
      'kaze': counts['kaze'],
      'sangen': counts['sangen'],
    },
  }))
}

function kotsu(tiles: number[], type: TileType): NumberDecomposed[] {
  const results: NumberDecomposed[] = []
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] < 3) continue
    empty = false
    const cloned = [...tiles]
    cloned[i] -= 3
    for (const { blocks, rest } of [...kotsu(cloned, type), ...shuntsu(cloned, type)]) {
      results.push({
        blocks: blocks.concat({
          type: 'kotsu',
          tileType: type,
          tiles: [i + 1, i + 1, i + 1],
        }),
        rest,
      })
    }
  }
  if (empty) {
    results.push({ blocks: [], rest: tiles })
  }
  results.forEach(({ blocks }) => sortBlocks(blocks))
  return results
}

function shuntsu(tiles: number[], type: TileType): NumberDecomposed[] {
  const results: NumberDecomposed[] = []
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (i + 2 > 8 || tiles[i] < 1 || tiles[i + 1] < 1 || tiles[i + 2] < 1) continue
    empty = false
    const cloned = [...tiles]
    cloned[i]--
    cloned[i + 1]--
    cloned[i + 2]--
    for (const { blocks, rest } of [...kotsu(cloned, type), ...shuntsu(cloned, type)]) {
      results.push({
        blocks: blocks.concat({
          type: 'shuntsu',
          tileType: type,
          tiles: [i + 1, i + 2, i + 3],
        }),
        rest,
      })
    }
  }
  if (empty) {
    results.push({
      blocks: [],
      rest: tiles,
    })
  }
  results.forEach(({ blocks }) => sortBlocks(blocks))
  return results
}

function tatsu(tiles: number[], type: TileType, resurse: number): NumberDecomposed[] {
  return [
    ...toitsu(tiles, type, resurse),
    ...ryammen(tiles, type, resurse),
    ...kanchan(tiles, type, resurse),
  ]
}

function toitsu(tiles: number[], type: TileType, resurse: number): NumberDecomposed[] {
  if (resurse === 0) {
    return [{ blocks: [], rest: tiles }]
  }
  const results: NumberDecomposed[] = []
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] < 2) continue
    empty = false
    const cloned = [...tiles]
    cloned[i] -= 2
    for (const { blocks, rest } of tatsu(cloned, type, resurse - 1)) {
      results.push({
        blocks: blocks.concat({
          type: 'toitsu',
          tileType: type,
          tiles: [i + 1, i + 1],
        }),
        rest,
      })
    }
  }
  if (empty) {
    results.push({ blocks: [], rest: tiles })
  }
  results.forEach(({ blocks }) => sortBlocks(blocks))
  return results
}

// 两面和边张
function ryammen(tiles: number[], type: TileType, resurse: number): NumberDecomposed[] {
  if (resurse === 0) {
    return [{ blocks: [], rest: tiles }]
  }
  const results: NumberDecomposed[] = []
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 > 8 || tiles[i] < 1 || tiles[i + 1] < 1) continue
    empty = false
    const cloned = [...tiles]
    cloned[i]--
    cloned[i + 1]--
    for (const { blocks, rest } of tatsu(cloned, type, resurse - 1)) {
      results.push({
        blocks: blocks.concat({
          type: i === 0 || i === 7 ? 'penchan' : 'ryammen',
          tileType: type,
          tiles: [i + 1, i + 2],
        }),
        rest,
      })
    }
  }
  if (empty) {
    results.push({ blocks: [], rest: tiles })
  }
  results.forEach(({ blocks }) => sortBlocks(blocks))
  return results
}

function kanchan(tiles: number[], type: TileType, resurse: number): NumberDecomposed[] {
  if (resurse === 0) {
    return [{ blocks: [], rest: tiles }]
  }
  const results: NumberDecomposed[] = []
  let empty = true
  for (let i = 0; i < tiles.length; i++) {
    if (i + 2 > 8 || tiles[i] < 1 || tiles[i + 2] < 1) continue
    empty = false
    const cloned = [...tiles]
    cloned[i]--
    cloned[i + 2]--
    for (const { blocks, rest } of tatsu(cloned, type, resurse - 1)) {
      results.push({
        blocks: blocks.concat({
          type: 'kanchan',
          tileType: type,
          tiles: [i + 1, i + 3],
        }),
        rest,
      })
    }
  }
  if (empty) {
    results.push({ blocks: [], rest: tiles })
  }
  results.forEach(({ blocks }) => sortBlocks(blocks))
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
