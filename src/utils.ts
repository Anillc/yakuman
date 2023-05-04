import type { Tile, TileType } from '.'

export function group(tiles: Tile[]) {
  return tiles.reduce((acc, x) => {
    acc[x.type][x.num - 1].push(x)
    return acc
  }, {
    'man': [...Array(9)].map(_ => []),
    'pin': [...Array(9)].map(_ => []),
    'so': [...Array(9)].map(_ => []),
    'kaze': [...Array(4)].map(_ => []),
    'sangen': [...Array(3)].map(_ => []),
  } as Record<TileType, Tile[][]>)
}