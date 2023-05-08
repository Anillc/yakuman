import { Tile } from './round'
import { chitoitsuShanten, decompose, kokushimusouShanten, minShanten } from './tempai'
import { group } from './utils'

export interface Yaku {
  // 一番
  // 立直 (门前清)
  riichi: boolean
  // 断幺九
  tanyao: boolean
  // 门前清自摸 (门前清)
  tsumo: boolean
  // 场风
  'field-wind': boolean
  // 自风
  'seat-wind': boolean
  // 白
  white: boolean
  // 发
  green: boolean
  // 中
  red: boolean
  // 平和 (门前清)
  pinfu: boolean
  // 一杯口 (门前清)
  iipeko: boolean
  // 抢杠
  chankan: boolean
  // 岭上
  rinshan: boolean
  // 海底
  haitei: boolean
  // 河底
  hotei: boolean
  // 一发
  ippatsu: boolean
  // 宝牌
  dora: number
  // 红宝牌
  reddora: number
  // 北宝牌
  // peidora

  // 两番
  // 双立直 (门前清)
  doubleriichi: boolean
  // 三色同刻
  sanshokudoko: boolean
  // 三杠子
  sankantsu: boolean
  // 对对和
  toitoi: boolean
  // 三暗刻
  sananko: boolean
  // 小三元
  shosangen: boolean
  // 混老头
  honroto: boolean
  // 七对子 (门前清)
  chitoitsu: boolean
  // 混全带幺九 (副露减一番)
  chanta: boolean
  // 一气通贯 (副露减一番)
  ittsu: boolean
  // 三色同顺 (副露减一番)
  sanshokudojun: boolean


  // 三番
  // 两杯口 (门前清)
  ryampeko: boolean
  // 纯全带幺九 (副露减一番)
  junchan: boolean
  // 混一色 (副露减一番)
  honitsu: boolean

  // 六番
  // 清一色 (副露减一番)
  chinitsu: boolean

  // 役满
  // 天和 (庄家限定)
  tenho: boolean
  // 地和 (子家限定)
  chiho: boolean
  // 大三元
  daisangen: boolean
  // 四暗刻 (门前清)
  suanko: boolean
  // 字一色
  tsuiso: boolean
  // 绿一色
  ryuiso: boolean
  // 清老头
  chinroto: boolean
  // 国士无双 (门前清)
  kokushimusou: boolean
  // 小四喜
  shosushi: boolean
  // 四杠子
  sukantsu: boolean
  // 九莲宝灯 (门前清)
  kyuurempoto: boolean

  // 两倍役满
  // 四暗刻单骑 (门前清)
  suankotanki: boolean
  // 国士无双十三面 (门前清)
  kokushimusou13: boolean
  // 纯正九莲宝灯 (门前清)
  junseikyuurempoto: boolean
  // 大四喜
  daisushi: boolean
}

export function yaku(tiles: Tile[], naki: number) {
  const counts = group(tiles)
  const [shanten, decomposed] = minShanten(decompose(counts), naki)
  if (shanten === -1) {
    return normal()
  }
  const chitoi = chitoitsuShanten(counts)
  if (chitoi[0] === -1) {
    return chitoitsu()
  }
  const kokushi = kokushimusouShanten(counts)
  if (kokushi[0] === -1) {
    return kokushimusou()
  }
  throw new Error('unreachable')
}

function normal() {}

function chitoitsu() {}

function kokushimusou() {}