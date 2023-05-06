import type { Tile, TileType } from './index'
import { Counts, addCounts, cartesian, cloneCounts, createEmptyCounts, sortBlocks, uniqDecomposed, uniqNumberDecomposed } from './utils'

interface TempaiType {
  type: TileType
  num: number
}

interface Tempai {
  dapai: Tile
  tempai: TempaiType[]
}

// TODO: 天胡/地和

// 七对子 (门前清)
// export function chitoitsu(tiles: Tile[]): Tempai[] {
//   tiles = [...tiles]
//   const single: Tile[] = []
//   const double: Tile[][] = []
//   while (tiles.length !== 0) {
//     const first = tiles.shift()
//     let second: Tile
//     for (let i = 0; i < tiles.length;) {
//       if (tiles[i].equals(first)) {
//         second = tiles[i]
//         tiles.splice(i, 1)
//         break
//       }
//       i++
//     }
//     if (second) {
//       double.push([first, second])
//     } else {
//       single.push(first)
//     }
//   }
//   if (single.length !== 2) return null
//   return [{
//     dapai: single[0],
//     tempai: [{
//       type: single[1].type,
//       num: single[1].num,
//     }],
//   }, {
//     dapai: single[1],
//     tempai: [{
//       type: single[0].type,
//       num: single[0].num,
//     }],
//   }]
// }

// // 国士无双 (门前清)
// export function kokushimuso(tiles: Tile[]): Tempai[] {
//   const map = group(tiles)
//   // 幺九牌
//   const yaochu = [
//     map['man'][0],
//     map['man'][8],
//     map['pin'][0],
//     map['pin'][8],
//     map['so'][0],
//     map['so'][8],
//     map['kaze'][0],
//     map['kaze'][1],
//     map['kaze'][2],
//     map['kaze'][3],
//     map['sangen'][0],
//     map['sangen'][1],
//     map['sangen'][2],
//   ]
//   const flat = yaochu.flat()
//   const rest = tiles.filter((tile) => !flat.includes(tile))
//   if (rest.length > 1) return null
//   let dapai = rest.length === 1 ? rest[0] : null
//   let tempai: TempaiType = null
//   // 十三面
//   if (yaochu.every((tiles) => tiles.length === 1)) {
//     return flat.map((tile) => ({
//       dapai: rest[0],
//       tempai: [{
//         type: tile.type,
//         num: tile.num,
//       }],
//     }))
//   }
//   for (const [i, same] of Object.entries(yaochu)) {
//     if (same.length === 0) {
//       if (tempai) {
//         return null
//       } else {
//         // tempai = {
          
//         // }
//       }
//     }
//   }
// }

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
    let hasToitsu = mentsu + tatsuBlocks > 4 && count.toitsu > 0
    let shanten = 8 - mentsu * 2 - tatsu - (hasToitsu ? 1 : 0)
    if (shanten < min) {
      return [shanten, [x]]
    } else if (shanten === min) {
      return [shanten, list.concat(x)]
    } else {
      return [min, list]
    }
  }, [Infinity, []] as [number, Decomposed[]])
}
