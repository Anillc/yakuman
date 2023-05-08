import { Tile } from './round'
import { chitoitsuShanten, decompose, kokushimusouShanten, minShanten } from './tempai'
import { group } from './utils'

export interface Yaku {
  // 一番
  // 立直 (门前清)
  riichi: 1
  // 断幺九
  tanyao: 1
  // 门前清自摸 (门前清)
  tsumo: 1
  // 场风
  bakaze: 1
  // 自风
  jikaze: 1
  // 白
  white: 1
  // 发
  green: 1
  // 中
  red: 1
  // 平和 (门前清)
  pinfu: 1
  // 一杯口 (门前清)
  iipeko: 1
  // 抢杠
  chankan: 1
  // 岭上
  rinshan: 1
  // 海底
  haitei: 1
  // 河底
  hotei: 1
  // 一发
  ippatsu: 1
  // 宝牌
  dora: number
  // 红宝牌
  reddora: number
  // 北宝牌
  // peidora

  // 两番
  // 双立直 (门前清)
  doubleriichi: 2
  // 三色同刻
  sanshokudoko: 2
  // 三杠子
  sankantsu: 2
  // 对对和
  toitoi: 2
  // 三暗刻
  sananko: 2
  // 小三元
  shosangen: 2
  // 混老头
  honroto: 2
  // 七对子 (门前清)
  chitoitsu: 2
  // 混全带幺九 (副露减一番)
  chanta: 1 | 2
  // 一气通贯 (副露减一番)
  ittsu: 1 | 2
  // 三色同顺 (副露减一番)
  sanshokudojun: 1 | 2


  // 三番
  // 两杯口 (门前清)
  ryampeko: 3
  // 纯全带幺九 (副露减一番)
  junchan: 2 | 3
  // 混一色 (副露减一番)
  honitsu: 2 | 3

  // 六番
  // 清一色 (副露减一番)
  chinitsu: 5 | 6

  // 役满
  // 天和 (庄家限定)
  tenho: 13
  // 地和 (子家限定)
  chiho: 13
  // 大三元
  daisangen: 13
  // 四暗刻 (门前清)
  suanko: 13
  // 字一色
  tsuiso: 13
  // 绿一色
  ryuiso: 13
  // 清老头
  chinroto: 13
  // 国士无双 (门前清)
  kokushimusou: 13
  // 小四喜
  shosushi: 13
  // 四杠子
  sukantsu: 13
  // 九莲宝灯 (门前清)
  kyuurempoto: 13

  // 两倍役满
  // 四暗刻单骑 (门前清)
  suankotanki: 26
  // 国士无双十三面 (门前清)
  kokushimusou13: 26
  // 纯正九莲宝灯 (门前清)
  junseikyuurempoto: 26
  // 大四喜
  daisushi: 26
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