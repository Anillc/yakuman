import type { Tile } from '.'
import { Block, Decomposed, NumberDecomposed } from './tempai'
import uniqWith from 'lodash.uniqwith'

export interface Counts {
  man: number[],
  so: number[],
  pin: number[],
  kaze: number[],
  sangen: number[],
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

export function group(tiles: Tile[]) {
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
