import type { Tile } from '.'

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

export function mapRecord<V, T>(record: Record<string, V>, fn: (key: string, value: V) => T) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(key, value)]))
}