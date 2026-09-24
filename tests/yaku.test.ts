// 役・符・点数：给手牌 + 和牌张，断言算出来的役、翻、符、基本点
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canHora, yaku } from '../src/yaku.js'
import { horaOf, roundOf, tiles } from './helpers.js'

describe('符', () => {
  it('门清荣和 +10 符，副露荣和没有', () => {
    // 234m 567m 234p 88p + 46s 嵌张 5s：门清 20+10+2 = 32 → 40、副露 20+2 = 22 → 30
    const closed = horaOf(roundOf(), '234m567m234p88p46s', '5s')
    const open = horaOf(roundOf(), '234p88p46s', '5s', { melds: ['234m', '567m'] })
    assert.equal(closed.yaku.fu, 40, `门清：${closed.yaku.fu} 符`)
    assert.equal(open.yaku.fu, 30, `副露：${open.yaku.fu} 符`)
  })

  it('平和自摸 20 符（不算自摸符）', () => {
    const result = horaOf(roundOf(), '234m567m234p55s78s', '6s', { tsumo: true })
    assert.equal(result.yaku.pinfu, 1)
    assert.equal(result.yaku.fu, 20)
    // 雀头是役牌 → 不算平和，自摸符照样加：20 + 2 = 22 → 30
    const tsumo = horaOf(roundOf(), '234m567m234p11z78s', '6s', { tsumo: true })
    assert.equal(tsumo.yaku.pinfu, undefined)
    assert.equal(tsumo.yaku.fu, 30)
  })

  it('食い平和（副露的平和形）也是 30 符', () => {
    const ron = horaOf(roundOf(), '567m234p88p45s', '6s', { melds: ['999m'] })
    const tsumo = horaOf(roundOf(), '567m234p88p45s', '6s', { melds: ['999m'], tsumo: true })
    assert.equal(ron.yaku.fu, 30, '食い平和荣和：20 + 10')
    assert.equal(tsumo.yaku.fu, 30, '食い平和自摸：20 + 自摸 2')
  })

  it('连风牌（场风 = 自风）的雀头也只算 2 符', () => {
    // 東雀头 + 5m 暗刻 + 2s4s 嵌张，门清自摸：20 + 2 + 4 + 2 + 2 = 30
    const east = horaOf(roundOf(0), '11z555m24s234p678p', '3s', { tsumo: true }, 0)
    const south = horaOf(roundOf(0), '11z555m24s234p678p', '3s', { tsumo: true }, 1)
    assert.equal(east.yaku.fu, 30, '东场东家的東雀头')
    assert.equal(south.yaku.fu, 30, '东场南家的東雀头（只算场风）')
  })

  it('副露手自摸也有自摸符（20 + 自摸2 + 明槓8 + 嵌张2 = 32 → 40）', () => {
    const tsumo = horaOf(roundOf(), '234p567p99s24s', '3s', { minkan: ['5555m'], tsumo: true })
    const ron = horaOf(roundOf(), '234p567p99s24s', '3s', { minkan: ['5555m'] })
    assert.equal(tsumo.yaku.fu, 40)
    assert.equal(ron.yaku.fu, 30)
  })
})

describe('门清的役', () => {
  const cases: { hand: string, win: string, tsumo?: boolean, melds?: string[], want: Record<string, number> }[] = [
    { hand: '234m567m234p55s78s', win: '6s', tsumo: true, want: { pinfu: 1, tsumo: 1, tanyao: 1 } },
    { hand: '234m234m567m46p55p', win: '5p', tsumo: true, want: { iipeikou: 1, tanyao: 1 } },
    { hand: '223344m223344s5p', win: '5p', want: { ryanpeikou: 3, tanyao: 1 } },
    { hand: '123m123s123p456m7s', win: '7s', want: { sanshokuDoujun: 2 } },
    { hand: '123456789m123p5s', win: '5s', want: { ittsuu: 2 } },
    { hand: '123m789m123p789s1z', win: '1z', want: { chanta: 2 } },
    { hand: '123m789m123p789s9s', win: '9s', want: { junchan: 3, pinfu: 1 } },
    { hand: '123m456m789m55p11z', win: '5p', want: { ittsuu: 2 } },
    { hand: '11234567m111z88m', win: '1m', want: { honitsu: 3, bakaze: 1, jikaze: 1 } },
    { hand: '123456789m2345m', win: '5m', want: { chinitsu: 6, ittsuu: 2 } },
    { hand: '555z666z77z111m22p', win: '2p', want: { shousangen: 2, white: 1, green: 1 } },
    { hand: '111m222m333m11z22z', win: '1z', want: { toitoi: 2, sanankou: 2, bakaze: 1, jikaze: 1 } },
    // 混老頭（副露里是 999s，免得四暗刻把普通役盖掉）
    { hand: '111m999m11z22z', win: '1z', melds: ['999s'], want: { honroutou: 2, toitoi: 2 } },
    { hand: '111z222z333z44z56m', win: '7m', want: { shousuushii: 13 } },
    { hand: '111m222m333m44m5s5s', win: '4m', tsumo: true, want: { suuankou: 13 } },
    { hand: '111222333444m5m', win: '5m', tsumo: true, want: { suuankouTanki: 13 } },
    { hand: '1m1m1p1p', win: '1m', melds: ['555z', '666z', '777z'], want: { daisangen: 13 } },
    { hand: '222333444666s8s', win: '8s', want: { ryuuiisou: 13 } },
    { hand: '111999m111999p1s', win: '1s', want: { chinroutou: 13 } },
    { hand: '1112223334445z', win: '5z', want: { daisuushii: 13, tsuuiisou: 13 } },
  ]
  for (const { hand, win, tsumo, melds, want } of cases) {
    it(`${hand} + ${win}${tsumo ? '（自摸）' : ''}`, () => {
      const result = horaOf(roundOf(), hand, win, { tsumo, melds })
      for (const [name, fan] of Object.entries(want)) {
        assert.equal((result.yaku as unknown as Record<string, number>)[name], fan, `${name} 应为 ${fan} 番`)
      }
      assert.ok(canHora(result.yaku), '应该有役')
    })
  }

  it('国士无双 / 国士十三面', () => {
    // 缺一种、另一种成对 → 单骑（和牌张在整手里只出现一次）
    const tanki = horaOf(roundOf(), '19m19s19p1123456z', '7z')
    assert.equal(tanki.yaku.kokushiMusou, 13)
    assert.equal(tanki.yaku.kokushiMusou13, undefined)
    // 十三种都齐了 → 十三面（和牌张会出现两次）
    assert.equal(horaOf(roundOf(), '19m19s19p1234567z', '1z').yaku.kokushiMusou13, 13)
  })

  it('九莲宝灯（含纯正）', () => {
    assert.equal(horaOf(roundOf(), '1112345678999m', '1m').yaku.junseiChuurenPoutou, 13)
    // 缺 5 的九莲形：普通九莲
    assert.equal(horaOf(roundOf(), '1111234678999m', '5m').yaku.chuurenPoutou, 13)
  })

  it('七对子（25 符）', () => {
    const result = horaOf(roundOf(), '1133557799m112p', '2p')
    assert.equal(result.yaku.chiitoitsu, 2)
    assert.equal(result.yaku.fu, 25)
  })

  it('役满手只列役满，普通役不进结果', () => {
    // 这手同时是 四暗刻単騎 和 混老頭 / 対々和，但役满成立时只列役满
    const result = horaOf(roundOf(), '111m999m111p999p1z', '1z')
    assert.equal(result.yaku.suuankouTanki, 13)
    assert.equal(result.yaku.honroutou, undefined)
    assert.equal(result.yaku.toitoi, undefined)
  })
})

describe('三色同顺 / 三色同刻 要看花色', () => {
  it('只有两个花色的同形顺子不算三色', () => {
    // 223344m 223344s：是二盃口，但没有第三个花色 → 不该有三色同顺
    const result = horaOf(roundOf(), '223344m223344s5p', '5p')
    assert.equal(result.yaku.ryanpeikou, 3)
    assert.equal(result.yaku.sanshokuDoujun, undefined)
  })
  it('刻子里混了字牌不算三色同刻', () => {
    // 111z 111m 999m 111p + 99s：数字刻子只有 111m / 111p 两个花色
    const result = horaOf(roundOf(), '111z111m999m11p99s', '1p')
    assert.equal(result.yaku.sanshokuDoukou, undefined)
  })
  it('三个花色齐了才算', () => {
    assert.equal(horaOf(roundOf(), '234m234s234p11z45s', '6s').yaku.sanshokuDoujun, 2)
    // 111m 111s 111p + 234m + 77z：三个花色齐了
    assert.equal(horaOf(roundOf(), '2m3m77z', '4m', { melds: ['111m', '111s', '111p'] }).yaku.sanshokuDoukou, 2)
    // 数字刻子只有两个花色（111m / 111p / 111z）→ 不算
    assert.equal(horaOf(roundOf(), '2m3m77z', '4m', { melds: ['111m', '111p', '111z'] }).yaku.sanshokuDoukou, undefined)
  })
})

describe('食断 / 混全 / 纯全', () => {
  it('食断开关：副露的断幺九', () => {
    const on = horaOf(roundOf(0, { kuidashiTanyao: true }), '345m55s678p34s', '5s', { melds: ['222m'] })
    const off = horaOf(roundOf(0, { kuidashiTanyao: false }), '345m55s678p34s', '5s', { melds: ['222m'] })
    assert.equal(on.yaku.tanyao, 1)
    assert.equal(off.yaku.tanyao, undefined)
    assert.ok(canHora(on.yaku))
    assert.ok(!canHora(off.yaku), '没有食断就不成役')
  })

  it('混全带 / 纯全带要看雀头', () => {
    assert.equal(horaOf(roundOf(), '123m789m123p789s1z', '1z').yaku.chanta, 2)
    assert.equal(horaOf(roundOf(), '123m789m123p789s5s', '5s').yaku.chanta, undefined)
  })
})

describe('数え役满 / 切上满贯 / 双倍役满 的开关', () => {
  it('切上满贯：4 番 30 符', () => {
    // 立直 + 一盃口 + 断幺九 + 自摸 = 4 番 30 符
    const on = horaOf(roundOf(0, { kiriageMangan: true }), '234m234m567m46p55p', '5p', { tsumo: true, riichi: true })
    const off = horaOf(roundOf(0, { kiriageMangan: false }), '234m234m567m46p55p', '5p', { tsumo: true, riichi: true })
    assert.equal(on.yaku.fan, 4)
    assert.equal(on.yaku.fu, 30)
    assert.equal(off.points, 1920, '切上关：1920')
    assert.equal(on.points, 2000, '切上开：按满贯')
  })

  it('数え役满：13 番的普通役', () => {
    // 22334455667788m：二盃口3 + 清一色6 + 断幺1 + 平和1 + 立直1 + 自摸1 = 13 番
    const setup = (kazoeYakuman: boolean) => {
      const round = roundOf(0, { kazoeYakuman })
      const player = round.players[0]
      player.tiles = tiles('2233445566778m')
      player.riichi = { double: false, iipatsu: false }
      return yaku(round, player, tiles('8m')[0], true)
    }
    assert.equal(setup(false).points, 6000, '关：封顶三倍满')
    assert.equal(setup(true).points, 8000, '开：按役满')
  })

  it('双倍役满：四暗刻单骑 / 纯正九莲', () => {
    const tanki = (doubleYakuman: boolean) =>
      horaOf(roundOf(0, { doubleYakuman }), '111222333444m5m', '5m', { tsumo: true })
    assert.equal(tanki(false).yaku.suuankouTanki, 13)
    assert.equal(tanki(true).yaku.suuankouTanki, 26)
    assert.equal(tanki(true).points, 16000)
    const chuuren = (doubleYakuman: boolean) =>
      horaOf(roundOf(0, { doubleYakuman }), '1112345678999m', '1m')
    assert.equal(chuuren(false).yaku.junseiChuurenPoutou, 13)
    assert.equal(chuuren(true).yaku.junseiChuurenPoutou, 26)
  })

  it('役满复合（大三元 + 字一色 = 26 番 → 基本点 16000）', () => {
    const result = horaOf(roundOf(), '11z22z', '2z', { melds: ['555z', '666z', '777z'], tsumo: true })
    assert.equal(result.yaku.daisangen, 13)
    assert.equal(result.yaku.tsuuiisou, 13)
    assert.equal(result.points, 16000)
  })
})

describe('宝牌 / 赤宝牌 / 里宝牌', () => {
  it('指示牌的下一张（8 的下一张是 9）', () => {
    const cases: [string, string][] = [
      ['1m', '2m'], ['7m', '8m'], ['8m', '9m'], ['9m', '1m'],
      ['8s', '9s'], ['8p', '9p'], ['1z', '2z'], ['4z', '1z'], ['5z', '6z'], ['7z', '5z'],
    ]
    for (const [indicator, dora] of cases) {
      const round = roundOf()
      round.wanpai[9] = tiles(indicator)[0]
      const player = round.players[0]
      player.tiles = tiles(`${dora}${dora}234p567p234s88s`)
      const result = yaku(round, player, tiles(dora)[0], false)
      assert.ok((result.yaku.dora ?? 0) >= 1, `指示牌 ${indicator} → 宝牌 ${dora}（实际 ${result.yaku.dora ?? 0}）`)
    }
  })

  it('赤宝牌，以及只有立直才有里宝牌', () => {
    const round = roundOf()
    round.wanpai[9] = tiles('1z')[0]          // 宝牌是 2z，手里没有
    round.wanpai[8] = tiles('3p')[0]          // 里宝牌指示牌 → 4p
    const player = round.players[0]
    player.tiles = tiles('0m67m234p234s88p78s') // 赤 5m 在 567m 里
    const ron = yaku(round, player, tiles('9s')[0], false)
    assert.equal(ron.yaku.reddora, 1, '赤宝牌')
    assert.equal(ron.yaku.uradora, undefined, '没立直就没有里宝牌')
    player.riichi = { double: false, iipatsu: false }
    assert.equal(yaku(round, player, tiles('9s')[0], false).yaku.uradora, 1, '立直 + 里宝牌指示牌 3p → 4p')
  })
})

describe('海底 / 河底 / 岭上', () => {
  it('海底摸月只有自摸算，河底撈魚只有荣和算；岭上补牌不叠海底', () => {
    const last = (tsumo: boolean, rinshan = false) => {
      const round = roundOf()
      round.haiyama = []
      round.rinshan = rinshan
      const player = round.players[0]
      player.tiles = tiles('234m567m234p88p78s')
      return yaku(round, player, tiles('9s')[0], tsumo)
    }
    assert.equal(last(true).yaku.haitei, 1)
    assert.equal(last(false).yaku.hotei, 1)
    assert.equal(last(true, true).yaku.haitei, undefined, '岭上开花的补牌不是海底牌')
    assert.equal(last(true, true).yaku.rinshan, 1)
  })
})

describe('一发', () => {
  it('活到立直者自己下一次打牌：巡目推进（庄家摸牌）不会清掉一发', () => {
    // 123m 456m 789m 11s 23s（听 1s / 4s），摸到 5s 后摸切宣言立直
    const round = roundOf()
    const player = round.players[1]
    player.tiles = tiles('123m456m789m11s23s5s')
    round.currentId = 1
    round.kiru = undefined
    round.dahai(player.tiles.find(tile => tile.suit === 'so' && tile.rank === 5)!, true)
    assert.equal(player.riichi?.iipatsu, true, '宣言之后一发是活的')
    // 2 号、3 号各摸打一次，然后轮到庄家摸牌 —— 这里只是巡目推进，不是鸣牌
    round.mopai(); round.dahai(round.player.drawn)
    round.mopai(); round.dahai(round.player.drawn)
    round.mopai()
    assert.equal(player.riichi?.iipatsu, true, '庄家摸牌不该清掉别人的一发')
    round.dahai(round.player.drawn)
    // 自己摸到 4s：立直一発ツモ
    round.haiyama.unshift(tiles('4s')[0])
    round.mopai()
    const hora = yaku(round, player, true)
    assert.equal(hora.yaku.riichi, 1)
    assert.equal(hora.yaku.ippatsu, 1, '立直一発ツモ')
  })
})

describe('天和 / 地和 / ダブル立直', () => {
  // roundOf 会把初巡标记关掉，这里显式开回来
  const firstTurnRound = () => {
    const round = roundOf()
    round.firstTurnIntact = true
    return round
  }
  const winning = '234m567m234p88p78s'   // 和 9s 成 234m 567m 234p 88p 789s

  it('天和：庄家第一巡自摸；过了第一巡就不算', () => {
    const round = firstTurnRound()
    const dealer = round.players[0]
    dealer.tiles = tiles(winning)
    assert.equal(yaku(round, dealer, tiles('9s')[0], true).yaku.tenhou, 13)
    round.firstTurnIntact = false
    assert.equal(yaku(round, dealer, tiles('9s')[0], true).yaku.tenhou, undefined)
  })

  it('地和：子家第一巡自摸（不算天和）', () => {
    const round = firstTurnRound()
    const child = round.players[1]
    child.tiles = tiles(winning)
    const hora = yaku(round, child, tiles('9s')[0], true)
    assert.equal(hora.yaku.chiihou, 13)
    assert.equal(hora.yaku.tenhou, undefined)
  })

  it('ダブル立直：第一巡宣言是 2 番，还能叠一发', () => {
    // 摸到 5s 后摸切宣言：手牌是 123m 456m 789m 11s 23s（听 1s / 4s）
    const round = firstTurnRound()
    const player = round.players[1]
    player.tiles = tiles('123m456m789m11s23s5s')
    round.currentId = 1
    round.kiru = undefined
    round.dahai(player.tiles.find(tile => tile.suit === 'so' && tile.rank === 5)!, true)
    assert.equal(player.riichi?.double, true, '第一巡宣言 → 双立直')
    // 巡目走一圈（2 号、3 号、庄家各摸打一次），再到自己摸牌 —— 这样不是第一巡，
    // 不会被地和（役满）盖掉，正好能看清双立直 + 一发
    round.mopai(); round.dahai(round.player.drawn)
    round.mopai(); round.dahai(round.player.drawn)
    round.mopai(); round.dahai(round.player.drawn)
    round.haiyama.unshift(tiles('4s')[0])
    round.mopai()
    const hora = yaku(round, player, true)
    assert.equal(hora.yaku.doubleRiichi, 2)
    assert.equal(hora.yaku.riichi, undefined)
    assert.equal(hora.yaku.ippatsu, 1)
    assert.equal(hora.yaku.chiihou, undefined, '已经不是第一巡')
  })
})
