import { Kaze, Tile, TileType, tileTypes } from './round'
import { Block, Decomposed, NumberDecomposed, blockTypes } from './tempai'
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

export function arrayEquals<T>(a: T[], b: T[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function toMPSZ(pai: Pai[]) {
  pai = [...pai]
  sortPai(pai)
  const grouped = pai.reduce((acc, x) => {
    acc[x.type].push(x)
    return acc
  }, {
    man: [], so: [], pin: [],
    kaze: [], sangen:[],
  } as Record<TileType, Pai[]>)
  function red(tile: Pai) {
    if (tile instanceof Tile) {
      return tile.red
    }
    return false
  }
  const man = grouped.man.map(pai => red(pai) ? 0 : pai.num).join('')
  const so = grouped.so.map(pai => red(pai) ? 0 : pai.num).join('')
  const pin = grouped.pin.map(pai => red(pai) ? 0 : pai.num).join('')
  const kaze = grouped.kaze.map(pai => pai.num).join('')
  const sangen = grouped.sangen.map(pai => pai.num + 4).join('')
  let result = ''
  if (man !== '') result += man + 'm'
  if (so !== '') result += so + 's'
  if (pin !== '') result += pin + 'p'
  result += kaze + sangen
  if (kaze !== '' || sangen !== '') result += 'z'
  return result
}

export function countsHash(counts: Counts) {
  let x = 0
  let hash = 0
  for (const type of ['man', 'so', 'pin', 'kaze', 'sangen'] satisfies TileType[]) {
    for (let i = 0; i < counts[type].length; i++) {
      hash += counts[type][i] << x * 4
      x++
    }
  }
  return hash
}

export function blockHash(block: Block) {
  const type = blockTypes.indexOf(block.type)
  const tileType = tileTypes.indexOf(block.tileType) << 3
  const tiles = block.tiles.reduce((acc, tile) => acc + tile, 0) << 6
  return type + tileType + tiles
}

export class DecomposedSet {
  map = new Map<number, Decomposed[]>()

  add(decomposed: Decomposed) {
    const hash = this.hash(decomposed)
    const decs = this.map.get(hash)
    if (!decs) {
      this.map.set(hash, [decomposed])
    } else {
      const same = decs.find(dec => {
        if (compareCounts(dec.rest, decomposed.rest) !== 0) return false
        for (let i = 0; i < dec.blocks.length; i++) {
          if (compareBlock(dec.blocks[i], decomposed.blocks[i]) !== 0) return false
        }
        return true
      })
      if (!same) {
        decs.push(decomposed)
      }
    }
  }

  addAll(...decs: Decomposed[]) {
    decs.forEach(this.add.bind(this))
  }

  addSet(set: DecomposedSet) {
    set.values().forEach(this.add.bind(this))
  }

  values() {
    return [...this.map.values()].flat()
  }

  private hash(decomposed: Decomposed) {
    let hash = countsHash(decomposed.rest)
    for (const block of decomposed.blocks) {
      hash += blockHash(block)
    }
    return hash
  }
}

export class NumberDecomposedSet {
  map = new Map<number, NumberDecomposed[]>()

  add(decomposed: NumberDecomposed) {
    const hash = this.hash(decomposed)
    const decs = this.map.get(hash)
    if (!decs) {
      this.map.set(hash, [decomposed])
    } else {
      const same = decs.find(dec => {
        if (dec.rest.join() !== decomposed.rest.join()) return false
        for (let i = 0; i < dec.blocks.length; i++) {
          if (compareBlock(dec.blocks[i], decomposed.blocks[i]) !== 0) return false
        }
        return true
      })
      if (!same) {
        decs.push(decomposed)
      }
    }
  }

  values() {
    return [...this.map.values()].flat()
  }

  addAll(...decs: NumberDecomposed[]) {
    decs.forEach(this.add.bind(this))
  }

  addSet(set: NumberDecomposedSet) {
    set.values().forEach(this.add.bind(this))
  }

  private hash(decomposed: NumberDecomposed) {
    let hash = 0
    for (let i = 0; i < decomposed.rest.length; i++) {
      hash += decomposed.rest[i] << 4 * i
    }
    for (const block of decomposed.blocks) {
      hash += blockHash(block)
    }
    return hash
  }
}
