import { Player, Round, Tile, TileType, kazes, sangens } from './round'
import { Block, Decomposed, chitoitsuShanten, decompose, kokushimusouShanten, minShanten, normalShanten } from './tempai'
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

type HoraType = 'chitoitsu' | 'kokushimusou' | 'kokushimusou13' | 'normal'

function checkType(round: Round, player: Player, horaTile: Tile): HoraType {
  const counts = group(horaTile ? player.tiles.concat(horaTile) : player.tiles)
  const [shanten] = minShanten(decompose(counts), player.naki + player.ankan.length)
  const chitoi = chitoitsuShanten(counts)
  const kokushi = kokushimusouShanten(counts)
  if (chitoi[0] === -1) {
    return 'chitoitsu'
  }
  if (kokushi[0] === -1) {
    if (kokushi[1].length !== 1) {
      return 'kokushimusou13'
    } else {
      return 'kokushimusou'
    }
  }
  if (shanten === -1) {
    return 'normal'
  }
}


export function yaku(round: Round, player: Player, horaTile: Tile, chankan: boolean) {
  const yaku: Yaku = {}
  let type = checkType(round, player, horaTile)
  let fu = 20

  if (!horaTile) {
    fu += 2
  } else if (horaTile && player.naki === 0) {
    // 门前清自摸
    yaku.tsumo = 1
    fu += 10
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
      // 河底
      yaku.hotei = 1
    } else {
      // 海底
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

  // 混老头
  let honroto = true
  // 清老头
  let chinroto = true
  for (const tile of all) {
    if (['man', 'so', 'pin'].includes(tile.type)) {
      if (tile.num !== 1 && tile.num !== 9) {
        honroto = false
        chinroto = false
        break
      }
    } else {
      chinroto = false
    }
  }
  if (chinroto) {
    yaku.chinroto = 13
  } else if (honroto) {
    yaku.honroto = 2
  }

  // 与牌型相关的役
  if (type === 'chitoitsu') {
    // 七对子
    yaku.chitoitsu = 2
    fu = 25
  }
  if (type === 'kokushimusou') {
    // 国士无双
    yaku.kokushimusou = 13
  }
  if (type === 'kokushimusou13') {
    // 国士无双十三面
    yaku.kokushimusou13 = 26
  }
  if (type === 'normal') {
    const last = horaTile || player.tiles.at(-1)
    const tempai = horaTile ? player.tiles : player.tiles.slice(0, -1)
    const [, decomposed] = normalShanten(group(tempai), player.naki + player.ankan.length)

    for (const [pai, dec] of decomposed) {
      if (!last.equals(pai)) continue
      // TODO:
    }

  }
}

export function normalYaku(
  round: Round, player: Player, yaku: Yaku,
  decomposed: Decomposed, last: Tile, tsumo: boolean,
) {
  // 立直
  if (player.riichi) {
    if (player.naki !== 0) throw new Error('unreachable')
    if (player.riichi.double) {
      yaku.doubleriichi = 2
    } else {
      yaku.riichi = 1
    }
    // 一发
    if (player.riichi.iipatsu) {
      yaku.ippatsu = 1
    }
  }

  const mentsu: Block[] = []
  const toitsu: Block[] = []

  let anko = 0
  let tanki = false
  let ryammen = false

  for (const block of decomposed.blocks) {
    if (block.type === 'shuntsu' || block.type === 'kotsu') {
      mentsu.push(block)
    }
    if (block.type === 'toitsu') {
      toitsu.push(block)
      anko++
    }
    if (block.type === 'kanchan') {
      mentsu.push({
        type: 'shuntsu',
        tileType: block.tileType,
        tiles: [block.tiles[0], last.num, block.tiles[1]],
      })
    }
    if (block.type === 'penchan') {
      mentsu.push({
        type: 'shuntsu',
        tileType: block.tileType,
        tiles: block.tiles[0] - 1 === last.num
          ? [last.num, ...block.tiles]
          : [...block.tiles, last.num],
      })
    }
    if (block.type === 'ryammen') {
      ryammen = true
      mentsu.push({
        type: 'shuntsu',
        tileType: block.tileType,
        tiles: block.tiles[0] - 1 === last.num
          ? [last.num, ...block.tiles]
          : [...block.tiles, last.num],
      })
    }
  }

  if (mentsu.length === 3 && toitsu.length === 2) {
    const kotsuIndex = toitsu.findIndex(toitsu => last.equals(toitsu.tileType, toitsu.tiles[0]))
    if (kotsuIndex === -1) throw new Error('unreachable')
    const kotsu = toitsu.splice(kotsuIndex, 1)[0]
    mentsu.push({
      type: 'kotsu',
      tileType: kotsu.tileType,
      tiles: kotsu.tiles.concat(last.num)
    })
    if (tsumo) anko++
  } else if (mentsu.length === 4) {
    tanki = true
    // TODO: check this
    toitsu.push({
      type: 'toitsu',
      tileType: last.type,
      tiles: [last.num, last.num],
    })
  }

  for (const chi of player.chi) {
    mentsu.push({
      type: 'shuntsu',
      tileType: chi[0].type,
      tiles: chi.map(tile => tile.num),
    })
  }
  for (const pon of player.pon) {
    mentsu.push({
      type: 'kotsu',
      tileType: pon[0].type,
      tiles: pon.tiles.map(tile => tile.num),
    })
  }
  for (const kan of [...player.chi, ...player.minkan, ...player.ankan]) {
    mentsu.push({
      type: 'kotsu',
      tileType: kan[0].type,
      tiles: kan.map(tile => tile.num),
    })
  }

  const kotsu = mentsu.filter(mentsu => mentsu.type === 'kotsu')
  const shuntsu = mentsu.filter(mentsu => mentsu.type === 'shuntsu')

  for (const block of kotsu) {
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

  // 平和
  if (player.naki === 0) {
    const hasYakuhai = toitsu.some(toitsu => {
      if (toitsu.tileType === 'sangen') {
        return true
      }
      if (toitsu.tileType === 'kaze') {
        const kaze = kazes[toitsu.tiles[0] - 1]
        return kaze === round.bakaze || kaze === player.kaze
      }
    })
    if (kotsu.length === 0 && toitsu.length === 1 && !hasYakuhai && ryammen) {
      yaku.pinfu = 1
    }
  }

  // 一杯口/两杯口
  if (player.naki === 0) {
    let count = 0
    const shuntsu1 = [...shuntsu]
    let block: Block
    while (block = shuntsu1.shift()) {
      const index = shuntsu1.findIndex(shuntsu =>
        shuntsu.tileType === block.tileType && arrayEquals(shuntsu.tiles, block.tiles))
      if (index !== -1) {
        shuntsu1.splice(index, 1)
        count++
      }
    }
    if (count === 1) {
      yaku.iipeko = 1
    } else {
      yaku.ryampeko = 3
    }
  }

  // 三色同刻
  const kotsu1 = [...kotsu]
  if (kotsu1.length >= 3) {
    let block: Block
    while (block = kotsu1.shift()) {
      let same = 1
      for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
        if (block.tileType === type) continue
        const index = kotsu1.findIndex(kotsu => arrayEquals(block.tiles, kotsu.tiles))
        if (index !== -1) {
          kotsu1.splice(index, 1)
          same++
        }
      }
      if (same === 3) {
        yaku.sanshokudoko = 2
        break
      }
    }
  }

  // 三杠子
  if (player.minkan.length + player.ankan.length === 3) {
    yaku.sankantsu = 2
  }

  // 对对和
  if (kotsu.length === 4) {
    yaku.toitoi = 2
  }

  // 三暗刻
  if (anko === 3) {
    yaku.sananko = 2
  }

  if (anko === 4) {
    if (tanki) {
      // 四暗刻单骑
      yaku.suankotanki = 26
    } else {
      // 四暗刻
      yaku.suanko = 13
    }
  }

  const sangenMentsu = mentsu.filter(mentsu => mentsu.tileType === 'sangen')
  const sangenToitsu = mentsu.filter(mentsu => mentsu.tileType === 'sangen')

  // 小三元
  if (sangenMentsu.length === 2 && sangenToitsu.length === 1) {
    yaku.shosangen = 2
  }

  // 大三元
  if (sangenMentsu.length === 3) {
    yaku.daisangen = 13
  }

  if (!(yaku.honroto || yaku.chinroto)) {
    // 混全带幺九
    let chanta = true
    // 纯全带幺九
    let junchan = true
    for (const mt of mentsu) {
      if (['man', 'so', 'pin'].includes(mt.tileType)) {
        if (!(mt.tiles.includes(1) || mt.tiles.includes(9))) {
          chanta = false
          junchan = false
          break
        }
      } else {
        junchan = false
      }
    }
    if (player.naki === 0) {
      if (junchan) {
        yaku.junchan = 3
      } else if (chanta) {
        yaku.chanta = 2
      }
    } else {
      if (junchan) {
        yaku.junchan = 2
      } else if (chanta) {
        yaku.chanta = 1
      }
    }
  }

  // 一气通贯
  for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
    const st = shuntsu.filter(shuntsu => shuntsu.tileType === type)
    const a = st.find(shuntsu => shuntsu.tiles[0] === 1)
    const b = st.find(shuntsu => shuntsu.tiles[0] === 4)
    const c = st.find(shuntsu => shuntsu.tiles[0] === 7)
    if (a && b && c) {
      if (player.naki === 0) {
        yaku.ittsu = 2
      } else {
        yaku.ittsu = 1
      }
      break
    }
  }

  // 三色同顺
  const shuntsu1 = [...shuntsu]
  if (shuntsu1.length >= 3) {
    let block: Block
    while (block = shuntsu1.shift()) {
      let same = 1
      for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
        if (block.tileType === type) continue
        const index = shuntsu1.findIndex(shuntsu => arrayEquals(block.tiles, shuntsu.tiles))
        if (index !== -1) {
          shuntsu1.splice(index, 1)
          same++
        }
      }
      if (same === 3) {
        if (player.naki === 0) {
          yaku.sanshokudojun = 2
        } else {
          yaku.sanshokudojun = 1
        }
        break
      }
    }
  }
}
