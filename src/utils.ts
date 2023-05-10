import { Kaze, Tile, TileType } from './round'
import { Block, Decomposed, NumberDecomposed } from './tempai'
import uniqWith from 'lodash.uniqwith'

export interface Pai {
  type: TileType
  num: number
}

export type Counts = {
  [key in TileType]: number[]
}

export function createEmptyCounts(): Counts {
  return {
    man:    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    so:     [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pin:    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    kaze:   [0, 0, 0, 0],
    sangen: [0, 0, 0],
  }
}

export function cloneCounts(count: Counts) {
  return structuredClone(count)
}

export function group(tiles: Pai[]) {
  return tiles.reduce((acc, x) => {
    acc[x.type][x.num - 1]++
    return acc
  }, createEmptyCounts())
}

export function addCounts(a: Counts, b: Counts) {
  const c = createEmptyCounts()
  for (const [key, value] of Object.entries(a)) {
    for (let i = 0; i < value.length; i++) {
      c[key][i] = value[i] + b[key][i]
    }
  }
  return c
}

export function mapRecord<V, T>(record: Record<string, V>, fn: (key: string, value: V) => T) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(key, value)]))
}

export function cartesian<T>(...array: T[][]) {
  return array.reduce((acc, x) => {
    return acc.flatMap(a => x.map(b => [...a, b]))
  }, array.shift().map(x => [x]))
}

function compareBlock(a: Block, b: Block) {
  if (a.type !== b.type) return a.type > b.type ? 1 : -1
  if (a.tileType !== b.tileType) return a.tileType > b.tileType ? 1 : -1
  if (a.tiles.length !== b.tiles.length) return a.tiles.length > b.tiles.length ? 1 : -1
  for (let i = 0; i < a.tiles.length; i++) {
    if (a.tiles[i] !== b.tiles[i]) return a.tiles[i] > b.tiles[i] ? 1 : -1
  }
  return 0
}

function compareCounts(a: Counts, b: Counts) {
  const x = a.man.join() + a.so.join() + a.pin.join() + a.kaze.join() + a.sangen.join()
  const y = b.man.join() + b.so.join() + b.pin.join() + b.kaze.join() + b.sangen.join()
  if (x === y) return 0
  return x > y ? 1 : -1
}

export function sortBlocks(blocks: Block[]) {
  return blocks.sort(compareBlock)
}

export function uniqDecomposed(decomposed: Decomposed[]) {
  return uniqWith(decomposed, (a, b) => {
    if (compareCounts(a.rest, b.rest) !== 0) return false
    for (let i = 0; i < a.blocks.length; i++) {
      if (compareBlock(a.blocks[i], b.blocks[i]) !== 0) return false
    }
    return true
  })
}

export function uniqNumberDecomposed(decomposed: NumberDecomposed[]) {
  return uniqWith(decomposed, (a, b) => {
    if (a.rest.join() !== b.rest.join()) return false
    for (let i = 0; i < a.blocks.length; i++) {
      if (compareBlock(a.blocks[i], b.blocks[i]) !== 0) return false
    }
    return true
  })
}

export function comparePai(a: Pai, b: Pai) {
  if (a.type !== b.type) return a.type > b.type ? 1 : -1
  if (a.num !== b.num) return a.num > b.num ? 1 : -1
  return 0
}

export function sortPai(pai: Pai[]) {
  return pai.sort(comparePai)
}

export function uniqPai(pai: Pai[]) {
  return uniqWith(pai, (a, b) => {
    return comparePai(a, b) === 0
  })
}

export function toPai(tile: Tile): Pai {
  return { type: tile.type, num: tile.num }
}

export function toPaiArray(tiles: Tile[]) {
  return tiles.map(toPai)
}

export function random(min: number, max: number) {
  return Math.round(Math.random() * (max - min) + min)
}

export function shuffle(tiles: Tile[]) {
  for (let i = 0; i < tiles.length - 1; i++) {
    const remove = random(0, tiles.length - i - 1)
    tiles.push(tiles.splice(remove, 1)[0])
  }
}

// 下家
export function shimocha(kaze: Kaze): Kaze {
  switch (kaze) {
    case 'ton':
      return 'nan'
    case 'nan':
      return 'sha'
    case 'sha':
      return 'pei'
    case 'pei':
      return 'ton'
  }
}

// 头跳
export function atamahane(kaze: Kaze): Kaze {
  switch (kaze) {
    case 'ton':
      return 'pei'
    case 'nan':
      return 'ton'
    case 'sha':
      return 'nan'
    case 'pei':
      return 'sha'
  }
}

export function arrayEquals<T>(a: T[], b: T[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
