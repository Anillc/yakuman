import { Player, Round, Tile, kazes, sangens } from './round'
import { Block, chitoitsuShanten, decompose, kokushimusouShanten, minShanten } from './tempai'
import { Pai, arrayEquals, group } from './utils'

export interface Yaku {
  // 一番
  // 立直 (门前清)
  riichi?: 1
  // 断幺九
  tanyao?: 1
  // 门前清自摸 (门前清)
  tsumo?: 1
  // 场风
  bakaze?: 1
  // 自风
  jikaze?: 1
  // 白
  white?: 1
  // 发
  green?: 1
  // 中
  red?: 1
  // 平和 (门前清)
  pinfu?: 1
  // 一杯口 (门前清)
  iipeko?: 1
  // 抢杠
  chankan?: 1
  // 岭上
  rinshan?: 1
  // 海底
  haitei?: 1
  // 河底
  hotei?: 1
  // 一发
  ippatsu?: 1
  // 宝牌
  dora?: number
  // 红宝牌
  reddora?: number
  // 里宝牌
  uradora?: number
  // 北宝牌
  // peidora

  // 两番
  // 双立直 (门前清)
  doubleriichi?: 2
  // 三色同刻
  sanshokudoko?: 2
  // 三杠子
  sankantsu?: 2
  // 对对和
  toitoi?: 2
  // 三暗刻
  sananko?: 2
  // 小三元
  shosangen?: 2
  // 混老头
  honroto?: 2
  // 七对子 (门前清)
  chitoitsu?: 2
  // 混全带幺九 (副露减一番)
  chanta?: 1 | 2
  // 一气通贯 (副露减一番)
  ittsu?: 1 | 2
  // 三色同顺 (副露减一番)
  sanshokudojun?: 1 | 2


  // 三番
  // 两杯口 (门前清)
  ryampeko?: 3
  // 纯全带幺九 (副露减一番)
  junchan?: 2 | 3
  // 混一色 (副露减一番)
  honitsu?: 2 | 3

  // 六番
  // 清一色 (副露减一番)
  chinitsu?: 5 | 6

  // 役满
  // 天和 (庄家限定)
  tenho?: 13
  // 地和 (子家限定)
  chiho?: 13
  // 大三元
  daisangen?: 13
  // 四暗刻 (门前清)
  suanko?: 13
  // 字一色
  tsuiso?: 13
  // 绿一色
  ryuiso?: 13
  // 清老头
  chinroto?: 13
  // 国士无双 (门前清)
  kokushimusou?: 13
  // 小四喜
  shosushi?: 13
  // 四杠子
  sukantsu?: 13
  // 九莲宝灯 (门前清)
  kyuurempoto?: 13

  // 两倍役满
  // 四暗刻单骑 (门前清)
  suankotanki?: 26
  // 国士无双十三面 (门前清)
  kokushimusou13?: 26
  // 纯正九莲宝灯 (门前清)
  junseikyuurempoto?: 26
  // 大四喜
  daisushi?: 26
}

export function yaku(round: Round, player: Player, horaTile: Tile, chankan: boolean) {
  const yaku: Yaku = {}
  const tiles = horaTile ? player.tiles.concat(horaTile) : player.tiles
  const counts = group(tiles)
  let type: 'normal' | 'chitoitsu' | 'kokushimusou'
  const [shanten, decomposed] = minShanten(decompose(counts), player.naki + player.ankan.length)
  const chitoi = chitoitsuShanten(counts)
  const kokushi = kokushimusouShanten(counts)
  if (chitoi[0] === -1) {
    type = 'chitoitsu'
  }
  if (kokushi[0] === -1) {
    type = 'kokushimusou'
  }
  if (shanten === -1) {
    // TODO: 可能出现多种分解， 按点数高的计算
    // if (decomposed.length !== 1) throw new Error('unreachable')
    type = 'normal'
  }
  let fu = 20
  if (!horaTile) {
    fu += 2
  } else if (horaTile && player.naki === 0) {
    // 门前清自摸
    yaku.tsumo = 1
    fu += 10
  }
  if (type === 'chitoitsu') {
    // 七对子
    yaku.chitoitsu = 2
    fu = 25
  }
  if (type === 'kokushimusou') {
    if (kokushi[1].length !== 1) {
      // 国士无双十三面
      yaku.kokushimusou13 = 26
    } else {
      // 国士无双
      yaku.kokushimusou = 13
    }
  }
  if (type === 'normal') {
    // 立直
    if (player.riichi) {
      if (player.naki !== 0) throw new Error('unreachable')
      yaku.riichi = 1
      // 一发
      if (player.riichi.iipatsu) {
        yaku.ippatsu = 1
      }
    }

    // TODO: 计算碰、杠
    const blocks = decomposed[0].blocks
    for (const block of blocks) {
      if (block.type === 'kotsu') {
        // 场风
        if (block.tileType === 'kaze' && kazes[block.tiles[0] - 1] === round.bakaze) {
          yaku.bakaze = 1
        }
        // 自风
        if (block.tileType === 'kaze' && kazes[block.tiles[0] - 1] === player.kaze) {
          yaku.jikaze = 1
        }
        // 白发中
        if (block.tileType === 'sangen') {
          yaku[sangens[block.tiles[0] - 1]] = 1
        }
        // TODO: 算符
      }
    }

    // 平和
    if (player.naki === 0) {
      const kotsu = blocks.some(block => block.type === 'kotsu')
      const toitsu = blocks.reduce((acc, x) => {
        if (x.type === 'toitsu') {
          acc.push(x)
          return acc
        } else {
          return acc
        }
      }, [] as Block[])
      const yakuhai = toitsu.some(toitsu => {
        if (toitsu.tileType === 'sangen') {
          return true
        }
        if (toitsu.tileType === 'kaze') {
          const kaze = kazes[toitsu.tiles[0] - 1]
          return kaze === round.bakaze || kaze === player.kaze
        }
      })
      if (!kotsu && toitsu.length === 1 && !yakuhai) {
        const last = horaTile || player.tiles.at(-1)
        const tempai = horaTile ? player.tiles : player.tiles.slice(0, -1)
        const [, decomposed] = minShanten(decompose(group(tempai)), 0)
        let pinfu = false
        out: for (const dec of decomposed) {
          for (const block of dec.blocks) {
            if (block.type === 'ryammen') {
              const left = last.equals(block.tileType, block.tiles[0] - 1)
              const right = last.equals(block.tileType, block.tiles[1] + 1)
              if (left || right) {
                pinfu = true
                break out
              }
            }
          }
        }
      }
    }

    // 一杯口/两杯口
    if (player.naki === 0) {
      let result = 0
      const shuntsu = blocks.filter(block => block.type === 'shuntsu')
      let block: Block
      while (block = shuntsu.shift()) {
        const index = shuntsu.findIndex(shuntsu =>
          shuntsu.tileType === block.tileType && arrayEquals(shuntsu.tiles, block.tiles))
        if (index !== -1) {
          shuntsu.splice(index, 1)
          result++
        }
      }
      if (result === 1) {
        yaku.iipeko = 1
      } else {
        yaku.ryampeko = 3
      }
    }
  }
  const all = [
    player.tiles, player.chi, player.pon.map(pon => pon.tiles),
    player.minkan, player.ankan, horaTile,
  ].flat(2)

  // 断幺九
  let tanyao = true
  for (const tile of all) {
    if (['man', 'so', 'pin'].includes(tile.type)) {
      if (tile.num === 1 || tile.num === 9) {
        tanyao = false
        break
      }
    }
    if (['kaze', 'sangen'].includes(tile.type)) {
      tanyao = false
      break
    }
  }
  if (tanyao) {
    yaku.tanyao = 1
  }

  // 抢杠
  if (chankan) {
    yaku.chankan = 1
  }

  if (round.rest === 0) {
    if (horaTile) {
      yaku.hotei = 1
    } else {
      yaku.haitei = 1
    }
  }

  // 宝牌
  const dorahyoji = round.dorahyoji
  const dora: Pai[] = dorahyoji[0].map(({ type, num }) => {
    if (['man', 'so', 'pin'].includes(type)) {
      return { type, num: (num + 1) % 9 }
    } else if (type === 'kaze') {
      return { type, num: (num + 1) % 4}
    } else {
      return { type, num: (num + 1) % 3}
    }
  })
  yaku.dora = 0
  for (const d of dora) {
    for (const tile of all) {
      if (tile.equals(d)) yaku.dora++
    }
  }
  // 里宝牌
  if (player.riichi) {
    const uradora: Pai[] = dorahyoji[1].map(({ type, num }) => {
      if (['man', 'so', 'pin'].includes(type)) {
        return { type, num: (num + 1) % 9 }
      } else if (type === 'kaze') {
        return { type, num: (num + 1) % 4}
      } else {
        return { type, num: (num + 1) % 3}
      }
    })
    yaku.uradora = 0
    for (const d of uradora) {
      for (const tile of all) {
        if (tile.equals(d)) yaku.dora++
      }
    }
  }
  // 红宝牌
  for (const tile of all) {
    if (tile.red) {
      yaku.reddora ||= 0
      yaku.reddora++
    }
  }
}
