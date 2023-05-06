import type { Tile, TileType } from './index'
import { group } from './utils'

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
export function chitoitsu(tiles: Tile[]): Tempai[] {
  tiles = [...tiles]
  const single: Tile[] = []
  const double: Tile[][] = []
  while (tiles.length !== 0) {
    const first = tiles.shift()
    let second: Tile
    for (let i = 0; i < tiles.length;) {
      if (tiles[i].equals(first)) {
        second = tiles[i]
        tiles.splice(i, 1)
        break
      }
      i++
    }
    if (second) {
      double.push([first, second])
    } else {
      single.push(first)
    }
  }
  if (single.length !== 2) return null
  return [{
    dapai: single[0],
    tempai: [{
      type: single[1].type,
      num: single[1].num,
    }],
  }, {
    dapai: single[1],
    tempai: [{
      type: single[0].type,
      num: single[0].num,
    }],
  }]
}

// 国士无双 (门前清)
export function kokushimuso(tiles: Tile[]): Tempai[] {
  const map = group(tiles)
  // 幺九牌
  const yaochu = [
    map['man'][0],
    map['man'][8],
    map['pin'][0],
    map['pin'][8],
    map['so'][0],
    map['so'][8],
    map['kaze'][0],
    map['kaze'][1],
    map['kaze'][2],
    map['kaze'][3],
    map['sangen'][0],
    map['sangen'][1],
    map['sangen'][2],
  ]
  const flat = yaochu.flat()
  const rest = tiles.filter((tile) => !flat.includes(tile))
  if (rest.length > 1) return null
  let dapai = rest.length === 1 ? rest[0] : null
  let tempai: TempaiType = null
  // 十三面
  if (yaochu.every((tiles) => tiles.length === 1)) {
    return flat.map((tile) => ({
      dapai: rest[0],
      tempai: [{
        type: tile.type,
        num: tile.num,
      }],
    }))
  }
  for (const [i, same] of Object.entries(yaochu)) {
    if (same.length === 0) {
      if (tempai) {
        return null
      } else {
        // tempai = {
          
        // }
      }
    }
  }
}
