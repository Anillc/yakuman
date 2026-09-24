import { Kaze, PlayerId, Tile, Suit } from './round.js'
import { Block } from './tenpai.js'
import uniqWith from 'lodash.uniqwith'

// 库抛出的错误都带一个稳定的 code（ASCII），调用方按 code 判断；message 只给人看。
export type MahjongErrorCode =
  | 'action-not-allowed'
  | 'tile-not-in-hand'
  | 'tedashi-drawn-tile'
  | 'not-candidate'
  | 'riichi-not-tenpai'
  | 'kuikae'
  | 'out-of-order'
  | 'no-round-end'
  | 'unreachable'

export class MahjongError extends Error {
  constructor(public code: MahjongErrorCode, message: string) {
    super(message)
    this.name = 'MahjongError'
  }
}

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
