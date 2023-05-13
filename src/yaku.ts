import { Player, Round, Tile, TileType, kazes, sangens } from './round'
import { Block, Decomposed, chitoitsuShanten, decompose, kokushimusouShanten, minShanten, normalShanten } from './tempai'
import { Pai, arrayEquals, comparePai, group } from './utils'

export interface Yaku {
  fu: number
  fan: number

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

export const yakuman = ['tenho', 'chiho', 'daisangen', 'suanko', 'tsuiso', 'ryuiso', 'chinroto', 'kokushimusou', 'shosushi', 'sukantsu', 'kyuurempoto']
export const doubleyakuman = ['suankotanki', 'kokushimusou13', 'junseikyuurempoto', 'daisushi']

type HoraType = 'chitoitsu' | 'kokushimusou' | 'kokushimusou13' | 'normal'

function checkType(player: Player, tiles: Pai[]): HoraType {
  const counts = group(tiles)
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

export function yaku(round: Round, player: Player, last: Pai, tsumo: boolean, chankan: boolean, optionalPai?: Pai[]) {
  const yaku: Yaku = { fu: 20, fan: 0 }
  const tiles: Pai[] = optionalPai ? [...optionalPai] : [...player.tiles]
  if (!last) {
    last = tiles.pop()
  }
  let type = checkType(player, tiles.concat(last))

  if (!tsumo) {
    yaku.fu += 10
  } else if (tsumo && player.naki === 0) {
    // 门前清自摸
    yaku.tsumo = 1
    yaku.fu += 2
    if (round.chihoKyuushukyuuhaiDoubleRiichiSufurenda) {
      if (player.kaze === 'ton') {
        yaku.tenho = 13
      } else {
        yaku.chiho = 13
      }
    }
  }

  const all: Pai[] = [
    tiles, player.chi, player.pon.map(pon => pon.tiles),
    player.minkan, player.ankan, last,
  ].flat(2)

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
    if (tsumo) {
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
      if (comparePai(tile, d) === 0) yaku.dora++
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
        if (comparePai(tile, d) === 0) yaku.dora++
      }
    }
  }
  // 红宝牌
  for (const tile of all) {
    if (tile instanceof Tile && tile.red) {
      yaku.reddora ||= 0
      yaku.reddora++
    }
  }

  // 混老头
  let honroto = true
  // 清老头
  let chinroto = true
  // 至少应该要有数牌
  let rotoValid = false
  for (const tile of all) {
    if (['man', 'so', 'pin'].includes(tile.type)) {
      rotoValid = true
      if (tile.num !== 1 && tile.num !== 9) {
        honroto = false
        chinroto = false
        break
      }
    } else {
      chinroto = false
    }
  }
  if (rotoValid) {
    if (chinroto) {
      yaku.chinroto = 13
    } else if (honroto) {
      yaku.honroto = 2
    }
  }

  // 混一色
  let honitsu = true
  // 清一色
  let chinitsu = true
  let itsuType: TileType
  for (const tile of all) {
    if (['man', 'so', 'pin'].includes(tile.type)) {
      if (!itsuType) {
        itsuType = tile.type
      } else {
        if (tile.type !== itsuType) {
          honitsu = false
          chinitsu = false
          break
        }
      }
    } else {
      chinitsu = false
    }
  }
  // 至少要有数牌
  if (itsuType) {
    if (player.naki === 0) {
      if (chinitsu) {
        yaku.chinitsu = 6
      } else if (honitsu) {
        yaku.honitsu = 3
      }
    } else {
      if (chinitsu) {
        yaku.chinitsu = 5
      } else if (honitsu) {
        yaku.honitsu = 2
      }
    }

    // 九莲宝灯
    // 纯正九莲宝灯
    if (chinitsu && player.naki === 0) {
      const counts = group(all)[itsuType]
      const counts13 = group(tiles)[itsuType]
      if (counts.every((tile, num) => {
        if (num === 0 || num === 8) return tile >= 3
        return num >= 1
      })) {
        if (counts13.every((tile, num) => {
          if (num === 0 || num === 8) return tile === 3
          return tile === 1
        })) {
          yaku.junseikyuurempoto = 26
        } else {
          yaku.kyuurempoto = 13
        }
      }
    }
  }

  const tsuiso = all.every(tile => ['kaze', 'sangen'].includes(tile.type))
  if (tsuiso) {
    yaku.tsuiso = 13
  }

  const ryuiso = all.every(tile => {
    if (tile.type !== 'so' && tile.type !== 'sangen') return false
    if (tile.type === 'so' && ![2, 3, 4, 6, 8].includes(tile.num)) return false
    if (tile.type === 'sangen' && tile.num !== 2) return false
    return true
  })
  if (ryuiso) {
    yaku.ryuiso = 13
  }

  // 与牌型相关的役
  if (type === 'chitoitsu') {
    // 七对子
    yaku.chitoitsu = 2
    yaku.fu = 25
  }
  if (type === 'kokushimusou') {
    // 国士无双
    yaku.kokushimusou = 13
    yaku.fu = 25
  }
  if (type === 'kokushimusou13') {
    // 国士无双十三面
    yaku.kokushimusou13 = 26
    yaku.fu = 25
  }
  if (type === 'normal') {
    const [, decomposed] = normalShanten(group(tiles), player.naki + player.ankan.length)

    const yakus: Yaku[] = []
    for (const [pai, decs] of decomposed) {
      if (comparePai(last, pai) !== 0) continue
      for (const dec of decs) {
        const y = { ...yaku }
        yakus.push(y)
        normalYaku(round, player, yaku, dec, last, tsumo)
      }
    }
    return yakus.map(yaku => final(yaku)).reduce((acc, x) => x[1] > acc[1] ? x : acc, [null, -Infinity])
  } else {
    return final(yaku, type === 'chitoitsu')
  }
}

function normalYaku(
  round: Round, player: Player, yaku: Yaku,
  decomposed: Decomposed, last: Pai, tsumo: boolean,
) {
  const mentsu: Block[] = []
  const toitsu: Block[] = []

  let anko = 0
  let tanki = false
  let ryammen = false
  let penchan = false
  let kanchan = false

  for (const block of decomposed.blocks) {
    if (block.type === 'shuntsu') {
      mentsu.push(block)
    }
    if (block.type === 'kotsu') {
      mentsu.push(block)
      if (['man', 'so', 'pin'].includes(block.tileType)) {
        if ([1, 9].includes(block.tiles[0])) {
          yaku.fu += 8
        } else {
          yaku.fu += 4
        }
      } else {
        yaku.fu += 8
      }
      anko++
    }
    if (block.type === 'toitsu') {
      toitsu.push(block)
    }
    if (block.type === 'kanchan') {
      kanchan = true
      mentsu.push({
        type: 'shuntsu',
        tileType: block.tileType,
        tiles: [block.tiles[0], last.num, block.tiles[1]],
      })
    }
    if (block.type === 'penchan') {
      penchan = true
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
    const kotsuIndex = toitsu.findIndex(toitsu => comparePai(last, { type: toitsu.tileType, num: toitsu.tiles[0] }) === 0)
    if (kotsuIndex === -1) throw new Error('unreachable')
    const kotsu = toitsu.splice(kotsuIndex, 1)[0]
    mentsu.push({
      type: 'kotsu',
      tileType: kotsu.tileType,
      tiles: kotsu.tiles.concat(last.num)
    })
    if (tsumo) {
      if (['man', 'so', 'pin'].includes(kotsu.tileType)) {
        if ([1, 9].includes(kotsu.tiles[0])) {
          yaku.fu += 8
        } else {
          yaku.fu += 4
        }
      } else {
        yaku.fu += 8
      }
      anko++
    }
  } else if (mentsu.length === 4) {
    tanki = true
    toitsu.push({
      type: 'toitsu',
      tileType: last.type,
      tiles: [last.num, last.num],
    })
  }

  if (tanki || penchan || kanchan) {
    yaku.fu += 2
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
      tileType: pon.tiles[0].type,
      tiles: pon.tiles.map(tile => tile.num),
    })
    if (['man', 'so', 'pin'].includes(pon.tiles[0].type)) {
      if ([1, 9].includes(pon.tiles[0].num)) {
        yaku.fu += pon.chakan ? 16 : 4
      } else {
        yaku.fu += pon.chakan ? 8 : 2
      }
    } else {
      yaku.fu += pon.chakan ? 16 : 4
    }
  }
  for (const kan of player.minkan) {
    mentsu.push({
      type: 'kotsu',
      tileType: kan[0].type,
      tiles: kan.map(tile => tile.num),
    })
    if (['man', 'so', 'pin'].includes(kan[0].type)) {
      if ([1, 9].includes(kan[0].num)) {
        yaku.fu += 16
      } else {
        yaku.fu += 8
      }
    } else {
      yaku.fu += 16
    }
  }
  for (const kan of player.ankan) {
    mentsu.push({
      type: 'kotsu',
      tileType: kan[0].type,
      tiles: kan.map(tile => tile.num),
    })
    if (['man', 'so', 'pin'].includes(kan[0].type)) {
      if ([1, 9].includes(kan[0].num)) {
        yaku.fu += 32
      } else {
        yaku.fu += 16
      }
    } else {
      yaku.fu += 32
    }
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
  }

  // 平和
  let yakuhaiToitsu = false
  if (toitsu[0].tileType === 'sangen') {
    yakuhaiToitsu = true
    yaku.fu += 2
  } else if (toitsu[0].tileType === 'kaze') {
    const kaze = kazes[toitsu[0].tiles[0] - 1]
    if (kaze === round.bakaze) {
      yakuhaiToitsu = true
      yaku.fu += 2
    }
    if (kaze === player.kaze) {
      yakuhaiToitsu = true
      yaku.fu += 2
    }
  }
  if (kotsu.length === 0 && !yakuhaiToitsu && ryammen) {
    if (player.naki === 0) {
      yaku.pinfu = 1
      if (tsumo) {
        // 平和自摸不算自摸的两符
        yaku.fu -= 2
      }
    } else {
      // 副露平和底符为 30
      yaku.fu += 10
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
    } else if (count === 2) {
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
  
  // 四杠子
  if (player.minkan.length + player.ankan.length === 4) {
    yaku.sukantsu = 13
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
    // 至少要有数牌
    let valid = false
    for (const mt of mentsu) {
      if (['man', 'so', 'pin'].includes(mt.tileType)) {
        valid = true
        if (!(mt.tiles.includes(1) || mt.tiles.includes(9))) {
          chanta = false
          junchan = false
          break
        }
      } else {
        junchan = false
      }
    }
    if (valid) {
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

  const kazeKotsu = kotsu.filter(kotsu => kotsu.tileType === 'kaze')
  const kazeToitsu = toitsu[0].tileType === 'kaze'

  // 小四喜
  if (kazeKotsu.length === 3 && kazeToitsu) {
    yaku.shosushi = 13
  }

  // 大四喜
  if (kazeKotsu.length === 4) {
    yaku.daisushi = 26
  }
}

function final(yaku: Yaku, chitoitsu?: boolean): [Yaku, number] {
  const fu = chitoitsu ? yaku.fu : Math.ceil(yaku.fu / 10) * 10
  const newYaku: Yaku = { fu, fan: 0 }
  for (const ykm of yakuman) {
    if (ykm in yaku) {
      newYaku[ykm] = 13
      newYaku.fan += 13
    }
  }
  for (const ykm of doubleyakuman) {
    if (ykm in yaku) {
      newYaku[ykm] = 26
      newYaku.fan += 26
    }
  }
  if (newYaku.fan >= 13) return [newYaku, a(newYaku.fan, fu)]
  for (const [name, fan] of Object.entries(yaku)) {
    if (['fu', 'fan'].includes(name)) continue
    newYaku[name] = fan
    newYaku.fan += fan
  }
  return [newYaku, a(newYaku.fan, fu)]
}

function a(fan: number, fu: number) {
  if (fan <= 4) {
    const a = fu * (2 ** (fan + 2))
    return a >= 2000 ? 2000 : a
  }
  switch (fan) {
    case 5:
      return 2000
    case 6:
    case 7:
      return 3000
    case 8:
    case 9:
    case 10:
      return 4000
    case 11:
    case 12:
      return 6000
    default:
      return 8000
  }
}

export function canHora(yaku: Yaku) {
  const dora = yaku.dora || 0
  const reddora = yaku.reddora || 0
  const uradora = yaku.uradora || 0
  return yaku.fan - dora - reddora - uradora > 0
}
