import { Kaze, PlayerId, Tile, Suit, suits } from './round'
import { Block, Decomposed, NumberDecomposed, blockTypes } from './tenpai'
import uniqWith from 'lodash.uniqwith'

export interface TileKind {
  suit: Suit
  rank: number
}

export type Counts = {
  [key in Suit]: number[]
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

export function group(tiles: TileKind[]) {
  return tiles.reduce((acc, x) => {
    acc[x.suit][x.rank - 1]++
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

export function cartesian<T>(...array: T[][]) {
  const [first, ...rest] = array
  return rest.reduce((acc, x) => {
    return acc.flatMap(a => x.map(b => [...a, b]))
  }, first.map(x => [x]))
}

function compareBlock(a: Block, b: Block) {
  if (a.type !== b.type) return a.type > b.type ? 1 : -1
  if (a.suit !== b.suit) return a.suit > b.suit ? 1 : -1
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

export function compareTileKind(a: TileKind, b: TileKind) {
  if (a.suit !== b.suit) return a.suit > b.suit ? 1 : -1
  if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1
  return 0
}

export function sortTileKinds(tileKinds: TileKind[]) {
  return tileKinds.sort(compareTileKind)
}

export function uniqTileKinds(tileKinds: TileKind[]) {
  return uniqWith(tileKinds, (a, b) => {
    return compareTileKind(a, b) === 0
  })
}

export function toTileKind(tile: Tile): TileKind {
  return { suit: tile.suit, rank: tile.rank }
}

export function toTileKinds(tiles: Tile[]) {
  return tiles.map(toTileKind)
}

export function random(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
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

// 下一位玩家
export function nextId(id: PlayerId): PlayerId {
  return ((id + 1) % 4) as PlayerId
}

export function arrayEquals<T>(a: T[], b: T[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function toMPSZ(pai: TileKind[]) {
  pai = [...pai]
  sortTileKinds(pai)
  const grouped = pai.reduce((acc, x) => {
    acc[x.suit].push(x)
    return acc
  }, {
    man: [], so: [], pin: [],
    kaze: [], sangen:[],
  } as Record<Suit, TileKind[]>)
  function red(tile: TileKind) {
    if (tile instanceof Tile) {
      return tile.red
    }
    return false
  }
  const man = grouped.man.map(pai => red(pai) ? 0 : pai.rank).join('')
  const so = grouped.so.map(pai => red(pai) ? 0 : pai.rank).join('')
  const pin = grouped.pin.map(pai => red(pai) ? 0 : pai.rank).join('')
  const kaze = grouped.kaze.map(pai => pai.rank).join('')
  const sangen = grouped.sangen.map(pai => pai.rank + 4).join('')
  let result = ''
  if (man !== '') result += man + 'm'
  if (so !== '') result += so + 's'
  if (pin !== '') result += pin + 'p'
  result += kaze + sangen
  if (kaze !== '' || sangen !== '') result += 'z'
  return result
}

export function countsHash(counts: Counts) {
  let hash = 0
  for (const suit of ['man', 'so', 'pin', 'kaze', 'sangen'] satisfies Suit[]) {
    for (let i = 0; i < counts[suit].length; i++) {
      // 每张牌最多 4 张，按 5 进制滚动（原来的移位在 x >= 8 时会按模 32 回绕）
      hash = (hash * 5 + counts[suit][i]) | 0
    }
  }
  return hash
}

export function blockHash(block: Block) {
  const suit = blockTypes.indexOf(block.type)
  const tileType = suits.indexOf(block.suit) << 3
  const tiles = block.tiles.reduce((acc, tile) => acc + tile, 0) << 6
  return suit + tileType + tiles
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
