import { Tile } from './round'
import { decompose, minShanten } from './tempai'
import { group } from './utils'


export function yaku(tiles: Tile[], naki: number) {
  const [] = minShanten(decompose(group(tiles)), naki)
}