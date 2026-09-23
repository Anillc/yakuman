import { Player, Round, Tile, Suit, kazes, sangens } from './round.js'
import { Block, Decomposed, chiitoitsuShanten, decompose, kokushiMusouShanten, minShanten, normalShanten } from './tenpai.js'
import { MahjongError, TileKind, arrayEquals, compareTileKind, group } from './utils.js'

// 和牌判定的结果：役（含符与番）与基本点
// 基本点还没乘庄家/闲家倍数、也没算供托，收多少分请见 MahjongEnd
export interface HoraResult {
  yaku: Yaku
  points: number
}

export interface Yaku {
  fu: number
  fan: number

  // 立直 (门前清)
  riichi?: 1
  tanyao?: 1
  // 门前清自摸 (门前清)
  tsumo?: 1
  bakaze?: 1
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
  iipeikou?: 1
  chankan?: 1
  // 岭上
  rinshan?: 1
  haitei?: 1
  hotei?: 1
  ippatsu?: 1
  dora?: number
  reddora?: number
  uradora?: number
  // 双立直 (门前清)
  doubleRiichi?: 2
  sanshokuDoukou?: 2
  sankantsu?: 2
  toitoi?: 2
  sanankou?: 2
  shousangen?: 2
  honroutou?: 2
  // 七对子 (门前清)
  chiitoitsu?: 2
  // 混全带幺九 (副露减一番)
  chanta?: 1 | 2
  // 一气通贯 (副露减一番)
  ittsuu?: 1 | 2
  // 三色同顺 (副露减一番)
  sanshokuDoujun?: 1 | 2


  // 两杯口 (门前清)
  ryanpeikou?: 3
  // 纯全带幺九 (副露减一番)
  junchan?: 2 | 3
  // 混一色 (副露减一番)
  honitsu?: 2 | 3


  // 清一色 (副露减一番)
  chinitsu?: 5 | 6


  // 役满
  // 天和 (庄家限定)
  tenhou?: 13
  // 地和 (子家限定)
  chiihou?: 13
  daisangen?: 13
  // 四暗刻 (门前清)
  suuankou?: 13
  // 字一色
  tsuuiisou?: 13
  // 绿一色
  ryuuiisou?: 13
  chinroutou?: 13
  // 国士无双 (门前清)
  kokushiMusou?: 13
  shousuushii?: 13
  suukantsu?: 13
  // 九莲宝灯 (门前清)
  chuurenPoutou?: 13

  // 两倍役满
  // 四暗刻单骑 (门前清)
  suuankouTanki?: 26
  // 国士无双十三面 (门前清)
  kokushiMusou13?: 26
  // 纯正九莲宝灯 (门前清)
  junseiChuurenPoutou?: 26
  daisuushii?: 26
}

export const yakuman = ['tenhou', 'chiihou', 'daisangen', 'suuankou', 'tsuuiisou', 'ryuuiisou', 'chinroutou', 'kokushiMusou', 'shousuushii', 'suukantsu', 'chuurenPoutou']
export const doubleyakuman = ['suuankouTanki', 'kokushiMusou13', 'junseiChuurenPoutou', 'daisuushii']

type HoraType = 'chiitoitsu' | 'kokushiMusou' | 'kokushiMusou13' | 'normal'

function horaType(player: Player, tiles: TileKind[]): HoraType {
  const counts = group(tiles)
  const [shanten] = minShanten(decompose(counts), player.naki + player.ankan.length)
  const chiitoitsu = chiitoitsuShanten(counts)
  const kokushiMusou = kokushiMusouShanten(counts)
  if (chiitoitsu[0] === -1) {
    return 'chiitoitsu'
  }
  if (kokushiMusou[0] === -1) {
    if (kokushiMusou[1].length !== 1) {
      return 'kokushiMusou13'
    } else {
      return 'kokushiMusou'
    }
  }
  if (shanten === -1) {
    return 'normal'
  }
}

export function yaku(round: Round, player: Player, horaTile: TileKind, isTsumo: boolean, isChankan: boolean, handOverride?: TileKind[]): HoraResult {
  const yaku: Yaku = { fu: 20, fan: 0 }
  const handTiles: TileKind[] = handOverride ? [...handOverride] : [...player.tiles]
  if (!horaTile) {
    horaTile = handTiles.pop()
  }
  let handType = horaType(player, handTiles.concat(horaTile))

  // 门清荣和才有 10 符加成
  if (!isTsumo && player.naki === 0) {
    yaku.fu += 10
  } else if (isTsumo && player.naki === 0) {
    yaku.tsumo = 1
    yaku.fu += 2
    if (round.firstTurnIntact) {
      // 天和：庄家第一巡自摸；其余为地和
      if (player.isDealer) {
        yaku.tenhou = 13
      } else {
        yaku.chiihou = 13
      }
    }
  }

  const allTiles: TileKind[] = [
    handTiles, player.chi, player.pon.map(pon => pon.tiles),
    player.minkan, player.ankan, horaTile,
  ].flat(2)
  if (player.riichi) {
    if (player.naki !== 0) throw new MahjongError('unreachable', '立直: 有副露的人不能立直')
    if (player.riichi.double) {
      yaku.doubleRiichi = 2
    } else {
      yaku.riichi = 1
    }
    if (player.riichi.iipatsu) {
      yaku.ippatsu = 1
    }
  }
  let isTanyao = true
  for (const tile of allTiles) {
    if (['man', 'so', 'pin'].includes(tile.suit)) {
      if (tile.rank === 1 || tile.rank === 9) {
        isTanyao = false
        break
      }
    }
    if (['kaze', 'sangen'].includes(tile.suit)) {
      isTanyao = false
      break
    }
  }
  if (isTanyao) {
    yaku.tanyao = 1
  }
  if (isChankan) {
    yaku.chankan = 1
  }
  if (isTsumo && round.rinshan) {
    yaku.rinshan = 1
  }

  if (round.rest === 0) {
    if (isTsumo) {
      // 岭上补的不是牌山最后一张，所以不叠加海底
      if (!round.rinshan) {
        yaku.haitei = 1
      }
    } else {
      yaku.hotei = 1
    }
  }
  const dorahyoji = round.dorahyoji
  const dora: TileKind[] = dorahyoji[0].map(({ suit, rank }) => {
    if (['man', 'so', 'pin'].includes(suit)) {
      return { suit, rank: (rank + 1) % 9 }
    } else if (suit === 'kaze') {
      return { suit, rank: rank % 4 + 1 }
    } else {
      return { suit, rank: rank % 3 + 1 }
    }
  })
  yaku.dora = 0
  for (const d of dora) {
    for (const tile of allTiles) {
      if (compareTileKind(tile, d) === 0) yaku.dora++
    }
  }
  if (player.riichi) {
    const uradora: TileKind[] = dorahyoji[1].map(({ suit, rank }) => {
      if (['man', 'so', 'pin'].includes(suit)) {
        return { suit, rank: (rank + 1) % 9 }
      } else if (suit === 'kaze') {
        return { suit, rank: rank % 4 + 1 }
      } else {
        return { suit, rank: rank % 3 + 1 }
      }
    })
    yaku.uradora = 0
    for (const d of uradora) {
      for (const tile of allTiles) {
        if (compareTileKind(tile, d) === 0) yaku.uradora++
      }
    }
  }
  for (const tile of allTiles) {
    if (tile instanceof Tile && tile.red) {
      yaku.reddora ||= 0
      yaku.reddora++
    }
  }
  let isHonroto = true
  let isChinroto = true
  let hasSuitTiles = false
  for (const tile of allTiles) {
    if (['man', 'so', 'pin'].includes(tile.suit)) {
      hasSuitTiles = true
      if (tile.rank !== 1 && tile.rank !== 9) {
        isHonroto = false
        isChinroto = false
        break
      }
    } else {
      isChinroto = false
    }
  }
  if (hasSuitTiles) {
    if (isChinroto) {
      yaku.chinroutou = 13
    } else if (isHonroto) {
      yaku.honroutou = 2
    }
  }
  let isHonitsu = true
  let isChinitsu = true
  let flushSuit: Suit
  for (const tile of allTiles) {
    if (['man', 'so', 'pin'].includes(tile.suit)) {
      if (!flushSuit) {
        flushSuit = tile.suit
      } else {
        if (tile.suit !== flushSuit) {
          isHonitsu = false
          isChinitsu = false
          break
        }
      }
    } else {
      isChinitsu = false
    }
  }
  if (flushSuit) {
    if (player.naki === 0) {
      if (isChinitsu) {
        yaku.chinitsu = 6
      } else if (isHonitsu) {
        yaku.honitsu = 3
      }
    } else {
      if (isChinitsu) {
        yaku.chinitsu = 5
      } else if (isHonitsu) {
        yaku.honitsu = 2
      }
    }
    if (isChinitsu && player.naki === 0) {
      const counts = group(allTiles)[flushSuit]
      const counts13 = group(handTiles)[flushSuit]
      if (counts.every((tile, rank) => {
        if (rank === 0 || rank === 8) return tile >= 3
        return rank >= 1
      })) {
        if (counts13.every((tile, rank) => {
          if (rank === 0 || rank === 8) return tile === 3
          return tile === 1
        })) {
          yaku.junseiChuurenPoutou = 26
        } else {
          yaku.chuurenPoutou = 13
        }
      }
    }
  }

  const isTsuiso = allTiles.every(tile => ['kaze', 'sangen'].includes(tile.suit))
  if (isTsuiso) {
    yaku.tsuuiisou = 13
  }

  const isRyuiso = allTiles.every(tile => {
    if (tile.suit !== 'so' && tile.suit !== 'sangen') return false
    if (tile.suit === 'so' && ![2, 3, 4, 6, 8].includes(tile.rank)) return false
    if (tile.suit === 'sangen' && tile.rank !== 2) return false
    return true
  })
  if (isRyuiso) {
    yaku.ryuuiisou = 13
  }

  // 与牌型相关的役
  if (handType === 'chiitoitsu') {
    yaku.chiitoitsu = 2
    yaku.fu = 25
  }
  if (handType === 'kokushiMusou') {
    yaku.kokushiMusou = 13
    yaku.fu = 25
  }
  if (handType === 'kokushiMusou13') {
    yaku.kokushiMusou13 = 26
    yaku.fu = 25
  }
  if (handType === 'normal') {
    const [, waitDecompositions] = normalShanten(group(handTiles), player.naki + player.ankan.length)

    const yakus: Yaku[] = []
    for (const [wait, decs] of waitDecompositions) {
      if (compareTileKind(horaTile, wait) !== 0) continue
      for (const dec of decs) {
        const candidate = { ...yaku }
        yakus.push(candidate)
        normalYaku(round, player, candidate, dec, horaTile, isTsumo)
      }
    }
    const results = yakus.map(candidate => finalize(candidate))
    if (results.length === 0) throw new MahjongError('unreachable', 'yaku: 这手牌没有可用的分解')
    // 待ち与分解都有多个时取基本点最高的那个
    return results.reduce((acc, x) => x.points > acc.points ? x : acc)
  } else {
    return finalize(yaku, handType === 'chiitoitsu')
  }
}

function normalYaku(
  round: Round, player: Player, result: Yaku,
  decomposition: Decomposed, horaTile: TileKind, isTsumo: boolean,
) {
  const mentsu: Block[] = []
  const toitsu: Block[] = []

  // 分解里本来就有的面子数（不含用和牌张补出来的那个）
  let closedMentsu = 0
  // 副露（含暗杠）的面子数：算总面子数时要加回来
  const meldedCount = player.chi.length + player.pon.length + player.minkan.length + player.ankan.length

  let anko = 0
  let tanki = false
  let ryammen = false
  let penchan = false
  let kanchan = false

  for (const block of decomposition.blocks) {
    if (block.type === 'shuntsu') {
      mentsu.push(block)
      closedMentsu++
    }
    if (block.type === 'kotsu') {
      mentsu.push(block)
      closedMentsu++
      if (['man', 'so', 'pin'].includes(block.suit)) {
        if ([1, 9].includes(block.tiles[0])) {
          result.fu += 8
        } else {
          result.fu += 4
        }
      } else {
        result.fu += 8
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
        suit: block.suit,
        tiles: [block.tiles[0], horaTile.rank, block.tiles[1]],
      })
    }
    if (block.type === 'penchan') {
      penchan = true
      mentsu.push({
        type: 'shuntsu',
        suit: block.suit,
        tiles: block.tiles[0] - 1 === horaTile.rank
          ? [horaTile.rank, ...block.tiles]
          : [...block.tiles, horaTile.rank],
      })
    }
    if (block.type === 'ryammen') {
      ryammen = true
      mentsu.push({
        type: 'shuntsu',
        suit: block.suit,
        tiles: block.tiles[0] - 1 === horaTile.rank
          ? [horaTile.rank, ...block.tiles]
          : [...block.tiles, horaTile.rank],
      })
    }
  }

  // 双碰：分解里有 2 个对子，和牌张把其中一个补成刻子
  if (closedMentsu + meldedCount === 3 && toitsu.length === 2) {
    const kotsuIndex = toitsu.findIndex(toitsu => compareTileKind(horaTile, { suit: toitsu.suit, rank: toitsu.tiles[0] }) === 0)
    if (kotsuIndex === -1) throw new MahjongError('unreachable', 'yaku: 双碰的和牌张不在对子里')
    const kotsu = toitsu.splice(kotsuIndex, 1)[0]
    mentsu.push({
      type: 'kotsu',
      suit: kotsu.suit,
      tiles: kotsu.tiles.concat(horaTile.rank)
    })
    if (isTsumo) {
      if (['man', 'so', 'pin'].includes(kotsu.suit)) {
        if ([1, 9].includes(kotsu.tiles[0])) {
          result.fu += 8
        } else {
          result.fu += 4
        }
      } else {
        result.fu += 8
      }
      anko++
    } else {
      // 荣和补成的刻子算明刻：中张 2 符、幺九/字牌 4 符
      if (['man', 'so', 'pin'].includes(kotsu.suit)) {
        result.fu += [1, 9].includes(kotsu.tiles[0]) ? 4 : 2
      } else {
        result.fu += 4
      }
    }
  } else if (closedMentsu + meldedCount === 4) {
    // 单骑：分解里的面子已经够 4 个，和牌张补的是雀头
    tanki = true
    toitsu.push({
      type: 'toitsu',
      suit: horaTile.suit,
      tiles: [horaTile.rank, horaTile.rank],
    })
  }

  if (tanki || penchan || kanchan) {
    result.fu += 2
  }

  for (const chi of player.chi) {
    mentsu.push({
      type: 'shuntsu',
      suit: chi[0].suit,
      tiles: chi.map(tile => tile.rank),
    })
  }
  for (const pon of player.pon) {
    mentsu.push({
      type: 'kotsu',
      suit: pon.tiles[0].suit,
      tiles: pon.tiles.map(tile => tile.rank),
    })
    if (['man', 'so', 'pin'].includes(pon.tiles[0].suit)) {
      if ([1, 9].includes(pon.tiles[0].rank)) {
        result.fu += pon.chakan ? 16 : 4
      } else {
        result.fu += pon.chakan ? 8 : 2
      }
    } else {
      result.fu += pon.chakan ? 16 : 4
    }
  }
  for (const kan of player.minkan) {
    mentsu.push({
      type: 'kotsu',
      suit: kan[0].suit,
      tiles: kan.map(tile => tile.rank),
    })
    if (['man', 'so', 'pin'].includes(kan[0].suit)) {
      if ([1, 9].includes(kan[0].rank)) {
        result.fu += 16
      } else {
        result.fu += 8
      }
    } else {
      result.fu += 16
    }
  }
  for (const kan of player.ankan) {
    mentsu.push({
      type: 'kotsu',
      suit: kan[0].suit,
      tiles: kan.map(tile => tile.rank),
    })
    if (['man', 'so', 'pin'].includes(kan[0].suit)) {
      if ([1, 9].includes(kan[0].rank)) {
        result.fu += 32
      } else {
        result.fu += 16
      }
    } else {
      result.fu += 32
    }
  }

  const kotsu = mentsu.filter(mentsu => mentsu.type === 'kotsu')
  const shuntsu = mentsu.filter(mentsu => mentsu.type === 'shuntsu')

  for (const block of kotsu) {
    if (block.suit === 'kaze' && kazes[block.tiles[0] - 1] === round.bakaze) {
      result.bakaze = 1
    }
    // 自风（庄家为东，随庄家轮转）
    if (block.suit === 'kaze' && kazes[block.tiles[0] - 1] === player.seatWind) {
      result.jikaze = 1
    }
    if (block.suit === 'sangen') {
      result[sangens[block.tiles[0] - 1]] = 1
    }
  }
  let yakuhaiPair = false
  if (toitsu[0].suit === 'sangen') {
    yakuhaiPair = true
    result.fu += 2
  } else if (toitsu[0].suit === 'kaze') {
    const kaze = kazes[toitsu[0].tiles[0] - 1]
    if (kaze === round.bakaze) {
      yakuhaiPair = true
      result.fu += 2
    }
    if (kaze === player.seatWind) {
      yakuhaiPair = true
      result.fu += 2
    }
  }
  if (kotsu.length === 0 && !yakuhaiPair && ryammen) {
    if (player.naki === 0) {
      result.pinfu = 1
      if (isTsumo) {
        // 平和自摸不算自摸的两符
        result.fu -= 2
      }
    } else {
      // 副露平和底符为 30
      result.fu += 10
    }
  }
  if (player.naki === 0) {
    let count = 0
    const restShuntsu = [...shuntsu]
    let block: Block
    while (block = restShuntsu.shift()) {
      const index = restShuntsu.findIndex(shuntsu =>
        shuntsu.suit === block.suit && arrayEquals(shuntsu.tiles, block.tiles))
      if (index !== -1) {
        restShuntsu.splice(index, 1)
        count++
      }
    }
    if (count === 1) {
      result.iipeikou = 1
    } else if (count === 2) {
      result.ryanpeikou = 3
    }
  }
  const restKotsu = [...kotsu]
  if (restKotsu.length >= 3) {
    let block: Block
    while (block = restKotsu.shift()) {
      let same = 1
      for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
        if (block.suit === suit) continue
        const index = restKotsu.findIndex(kotsu => arrayEquals(block.tiles, kotsu.tiles))
        if (index !== -1) {
          restKotsu.splice(index, 1)
          same++
        }
      }
      if (same === 3) {
        result.sanshokuDoukou = 2
        break
      }
    }
  }
  if (player.minkan.length + player.ankan.length === 3) {
    result.sankantsu = 2
  }
  if (player.minkan.length + player.ankan.length === 4) {
    result.suukantsu = 13
  }
  if (kotsu.length === 4) {
    result.toitoi = 2
  }
  if (anko === 3) {
    result.sanankou = 2
  }

  if (anko === 4) {
    if (tanki) {
      result.suuankouTanki = 26
    } else {
      result.suuankou = 13
    }
  }

  const sangenMentsu = mentsu.filter(mentsu => mentsu.suit === 'sangen')
  const sangenToitsu = toitsu.filter(toitsu => toitsu.suit === 'sangen')
  if (sangenMentsu.length === 2 && sangenToitsu.length === 1) {
    result.shousangen = 2
  }
  if (sangenMentsu.length === 3) {
    result.daisangen = 13
  }

  if (!(result.honroutou || result.chinroutou)) {
    let chanta = true
    let junchan = true
    let hasSuitMentsu = false
    for (const mt of mentsu) {
      if (['man', 'so', 'pin'].includes(mt.suit)) {
        hasSuitMentsu = true
        if (!(mt.tiles.includes(1) || mt.tiles.includes(9))) {
          chanta = false
          junchan = false
          break
        }
      } else {
        junchan = false
      }
    }
    if (hasSuitMentsu) {
      if (player.naki === 0) {
        if (junchan) {
          result.junchan = 3
        } else if (chanta) {
          result.chanta = 2
        }
      } else {
        if (junchan) {
          result.junchan = 2
        } else if (chanta) {
          result.chanta = 1
        }
      }
    }
  }
  for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
    const suitShuntsu = shuntsu.filter(shuntsu => shuntsu.suit === suit)
    const low = suitShuntsu.find(shuntsu => shuntsu.tiles[0] === 1)
    const mid = suitShuntsu.find(shuntsu => shuntsu.tiles[0] === 4)
    const high = suitShuntsu.find(shuntsu => shuntsu.tiles[0] === 7)
    if (low && mid && high) {
      if (player.naki === 0) {
        result.ittsuu = 2
      } else {
        result.ittsuu = 1
      }
      break
    }
  }
  const restShuntsu = [...shuntsu]
  if (restShuntsu.length >= 3) {
    let block: Block
    while (block = restShuntsu.shift()) {
      let same = 1
      for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
        if (block.suit === suit) continue
        const index = restShuntsu.findIndex(shuntsu => arrayEquals(block.tiles, shuntsu.tiles))
        if (index !== -1) {
          restShuntsu.splice(index, 1)
          same++
        }
      }
      if (same === 3) {
        if (player.naki === 0) {
          result.sanshokuDoujun = 2
        } else {
          result.sanshokuDoujun = 1
        }
        break
      }
    }
  }

  const kazeKotsu = kotsu.filter(kotsu => kotsu.suit === 'kaze')
  const kazeToitsu = toitsu[0].suit === 'kaze'
  if (kazeKotsu.length === 3 && kazeToitsu) {
    result.shousuushii = 13
  }
  if (kazeKotsu.length === 4) {
    result.daisuushii = 26
  }
}

function finalize(result: Yaku, isChiitoitsu?: boolean): HoraResult {
  // 七对子与国士无双按约定的固定 25 符，其余按 10 符进位
  const fixedFu = isChiitoitsu || !!result.kokushiMusou || !!result.kokushiMusou13
  const fu = fixedFu ? result.fu : Math.ceil(result.fu / 10) * 10
  const newYaku: Yaku = { fu, fan: 0 }
  for (const ykm of yakuman) {
    if (ykm in result) {
      newYaku[ykm] = 13
      newYaku.fan += 13
    }
  }
  for (const ykm of doubleyakuman) {
    if (ykm in result) {
      newYaku[ykm] = 26
      newYaku.fan += 26
    }
  }
  if (newYaku.fan >= 13) return { yaku: newYaku, points: basicPoints(newYaku.fan, fu) }
  for (const [name, fan] of Object.entries(result)) {
    if (['fu', 'fan'].includes(name)) continue
    newYaku[name] = fan
    newYaku.fan += fan
  }
  return { yaku: newYaku, points: basicPoints(newYaku.fan, fu) }
}

function basicPoints(fan: number, fu: number) {
  if (fan <= 4) {
    const points = fu * (2 ** (fan + 2))
    return points >= 2000 ? 2000 : points
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
      // 13 番以上就是役满，双倍役满（26 番）要翻倍
      return Math.floor(fan / 13) * 8000
  }
}

export function canHora(result: Yaku) {
  const dora = result.dora || 0
  const reddora = result.reddora || 0
  const uradora = result.uradora || 0
  return result.fan - dora - reddora - uradora > 0
}
