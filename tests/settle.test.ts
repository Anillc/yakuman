// 结算：包（責任払い）、多响、流局与听牌料、流し満貫、本场/连庄、立直棒
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HoraEnd, Mahjong, MahjongContext, MahjongEnd, PlayerId, RuleProfile, Tile, defaultProfile, mLeague, playerIds,
} from '../src/index.js'
import { HoraResult, yaku } from '../src/yaku.js'
import { nextId } from '../src/utils.js'
import { roundOf, tiles } from './helpers.js'

// 摆一个"和了"的 ctx（不走牌局，直接喂给 Mahjong 的结算）
const horaContext = (mahjong: Mahjong, id: PlayerId, points: number) => {
  const hora: HoraResult = { yaku: { fu: 30, fan: 2 }, points }
  return new MahjongContext(mahjong.round.players[id], {
    types: new Set(['ron']),
    hora,
  }) as MahjongContext & { hora: HoraResult }
}

const ronKey = (mahjong: Mahjong, ctxs: MahjongContext[]) =>
  (mahjong as unknown as { ron(ctxs: MahjongContext[]): void }).ron(ctxs)

const setupRon = (rules: Partial<RuleProfile> = {}) => {
  const mahjong = new Mahjong({ profile: { ...defaultProfile, ...rules } })
  const disc = new Tile('man', 1, false)
  disc.playerId = 0
  mahjong.round.kiru = disc
  return mahjong
}

describe('包（責任払い）', () => {
  // 1 号（子）碰了白白白 + 發發發 + 中中中，手上東東南南，荣和/自摸 2z 成 大三元 + 字一色
  const paoSetup = (winBy: 'ron' | 'tsumo') => {
    const mahjong = new Mahjong()
    mahjong.homba = 1
    const round = mahjong.round
    const player = round.players[1]
    player.tiles = tiles('11z22z')
    player.pon = ['555z', '666z', '777z'].map(pon => ({ tiles: tiles(pon), chakan: false }))
    player.pao.push({ yaku: 'daisangen', playerId: 3 })   // 3 号喂的第三种三元牌
    const result = yaku(round, player, tiles('2z')[0], winBy === 'tsumo')
    assert.equal(result.yaku.daisangen, 13)
    assert.equal(result.yaku.tsuuiisou, 13)
    assert.equal(result.points, 16000, '大三元 + 字一色 = 2 倍役满')
    const disc = new Tile('kaze', 2, false)
    disc.playerId = 0            // 荣和时放铳的是 0 号（不是责任者）
    round.kiru = disc
    const ctx = new MahjongContext(player, { types: new Set(['tsumo', 'ron']), hora: result } as never)
    if (winBy === 'tsumo') (mahjong as unknown as { tsumo(ctx: MahjongContext): void }).tsumo(ctx)
    else ronKey(mahjong, [ctx])
    return { mahjong, end: mahjong.lastEnd! }
  }

  it('自摸：责任者只付被鸣确定的那手 + 本场棒，字一色按普通自摸分摊', () => {
    const { mahjong, end } = paoSetup('tsumo')
    assert.equal(end.type, 'hora')
    const hora = (end as HoraEnd).hora[0]
    assert.deepEqual(hora.pao, [3], '责任者是 3 号')
    assert.equal(hora.score, 64300, '和牌者收 64000 + 本场 300')
    assert.equal(mahjong.score[0], 25000 - 16000, '东家付字一色那份 16000')
    assert.equal(mahjong.score[2], 25000 - 8000, '另一家付 8000')
    assert.equal(mahjong.score[3], 25000 - 40300, '责任者付 32000 + 本场 300 + 自己那份 8000')
    assert.equal(mahjong.score.reduce((a, b) => a + b, 0), 100000, '分数守恒')
  })

  it('荣和：责任者付被鸣确定那手的一半 + 本场棒，放铳者付另一半 + 字一色', () => {
    const { mahjong, end } = paoSetup('ron')
    const hora = (end as HoraEnd).hora[0]
    assert.equal(hora.score, 64300)
    assert.equal(mahjong.score[3], 25000 - 16300, '责任者付 16000 + 本场 300')
    assert.equal(mahjong.score[0], 25000 - 48000, '放铳者付 16000 + 32000')
    assert.equal(mahjong.score[2], 25000, '旁观者不用付')
  })

  // 摆一个"0 号打出某张牌、1 号鸣它"的局面（不走牌局，直接调 Round 的鸣牌方法）
  const callSetup = (melds: string[], hand: string, call: string, kans: string[] = []) => {
    const round = roundOf()
    const player = round.players[1]
    player.pon = melds.map(meld => ({ tiles: tiles(meld), chakan: false }))
    player.ankan = kans.map(kan => tiles(kan))
    player.tiles = tiles(hand)
    const tile = tiles(call)[0]
    tile.playerId = 0
    round.players[0].discards.push(tile)
    round.currentId = 0
    round.kiru = tile
    return { round, player }
  }

  it('包由鸣牌产生：碰出来的第三种三元牌记喂牌的人', () => {
    const { round, player } = callSetup(['555z', '666z'], '77z', '7z')
    round.pon(1, [...player.tiles])
    assert.deepEqual(player.pao, [{ yaku: 'daisangen', playerId: 0 }])
  })

  it('包由鸣牌产生：大明槓出来的第三种三元牌 / 第四种风牌一样要记', () => {
    const sangen = callSetup(['555z', '666z'], '777z', '7z')
    sangen.round.minkan(1, [...sangen.player.tiles], false)
    assert.deepEqual(sangen.player.pao, [{ yaku: 'daisangen', playerId: 0 }], '大明槓完成大三元')
    const kaze = callSetup(['111z', '222z', '333z'], '444z', '4z')
    kaze.round.minkan(1, [...kaze.player.tiles], false)
    assert.deepEqual(kaze.player.pao, [{ yaku: 'daisuushii', playerId: 0 }], '大明槓完成大四喜')
  })

  it('包由鸣牌产生：第四个槓是大明槓时记四槓子', () => {
    const { round, player } = callSetup([], '111z', '1z', ['1111m', '2222m', '3333m'])
    assert.equal(player.kanCount, 3, '已经有三槓')
    round.minkan(1, [...player.tiles], false)
    assert.equal(player.kanCount, 4)
    assert.deepEqual(player.pao, [{ yaku: 'suukantsu', playerId: 0 }])
  })

  it('自己暗杠出来的第三种三元牌不算包（没人喂牌）', () => {
    const round = roundOf()
    const player = round.players[1]
    player.pon = ['555z', '666z'].map(meld => ({ tiles: tiles(meld), chakan: false }))
    player.tiles = tiles('7777z')
    round.currentId = 1
    round.ankan([...player.tiles])
    round.establishKan()
    assert.deepEqual(player.pao, [], '暗杠没人喂牌')
  })

  // 1 号（子）暗槓 東南西 + 明槓 北 + 单骑 1m → 大四喜和四槓子两个包同时成立
  const doublePao = (
    pao: { yaku: 'daisuushii' | 'suukantsu', playerId: PlayerId }[],
    rules: Partial<RuleProfile> = {},
    winBy: 'tsumo' | 'ron' = 'tsumo',
  ) => {
    const mahjong = new Mahjong({ profile: { ...defaultProfile, ...rules } })
    const player = mahjong.round.players[1]
    player.ankan = ['1111z', '2222z', '3333z'].map(kan => tiles(kan))
    player.minkan = [tiles('4444z')]
    player.tiles = tiles('1m')
    player.pao = [...pao]
    const result = yaku(mahjong.round, player, tiles('1m')[0], winBy === 'tsumo')
    assert.equal(result.yaku.daisuushii, rules.doubleYakuman ? 26 : 13)
    assert.equal(result.yaku.suukantsu, 13)
    const before = [...mahjong.score]
    const ctx = new MahjongContext(player, { types: new Set([winBy]), hora: result } as never)
    if (winBy === 'tsumo') {
      ;(mahjong as unknown as { tsumo(ctx: MahjongContext): void }).tsumo(ctx)
    } else {
      const disc = new Tile('man', 1, false)
      disc.playerId = 0
      mahjong.round.kiru = disc
      ronKey(mahjong, [ctx])
    }
    return {
      delta: mahjong.score.map((score, id) => score - before[id]),
      hora: (mahjong.lastEnd as HoraEnd).hora[0],
    }
  }

  it('两个包各付各的：M.League 档两门都是 13 番，各自的喂牌者出 32000', () => {
    const { delta, hora } = doublePao([{ yaku: 'daisuushii', playerId: 3 }, { yaku: 'suukantsu', playerId: 2 }])
    assert.deepEqual(hora.pao, [3, 2], '两个责任者都列出来')
    assert.deepEqual(delta, [0, 64000, -32000, -32000], '3 号出大四喜、2 号出四槓子，亲不用付')
  })

  it('两个包各付各的：双倍役满档下大四喜 26 番 / 四槓子 13 番，各按各的金额出', () => {
    const { delta } = doublePao(
      [{ yaku: 'daisuushii', playerId: 3 }, { yaku: 'suukantsu', playerId: 2 }], { doubleYakuman: true })
    assert.deepEqual(delta, [0, 96000, -32000, -64000], '3 号出 64000（大四喜）、2 号出 32000（四槓子）')
  })

  it('两个包是同一个责任者时，他一个人出两门', () => {
    const { delta, hora } = doublePao([{ yaku: 'daisuushii', playerId: 3 }, { yaku: 'suukantsu', playerId: 3 }])
    assert.deepEqual(hora.pao, [3, 3], '两门都是 3 号喂的')
    assert.deepEqual(delta, [0, 64000, 0, -64000])
  })

  it('荣和时每门包都折半：责任者各出一半，另一半加其余部分归放铳者', () => {
    const { delta, hora } = doublePao(
      [{ yaku: 'daisuushii', playerId: 3 }, { yaku: 'suukantsu', playerId: 2 }], { doubleYakuman: true }, 'ron')
    assert.deepEqual(hora.pao, [3, 2])
    assert.deepEqual(delta, [-48000, 96000, -16000, -32000], '3 号 32000、2 号 16000 都是各自那门的折半')
  })
})

describe('多响（多家荣和）', () => {
  it('两家各自收满，场供（本场棒 + 立直棒）按頭ハネ给最近那家', () => {
    const mahjong = setupRon({ multipleRon: true })
    mahjong.homba = 1
    mahjong.riichibo = 1
    mahjong.score[3] -= 1000           // 桌上那根棒原本是 3 号出的
    const before = [...mahjong.score]
    ronKey(mahjong, [horaContext(mahjong, 1, 1000), horaContext(mahjong, 2, 2000)])
    const end = mahjong.lastEnd as HoraEnd
    assert.deepEqual(end.hora.map(hora => hora.score), [5300, 8000], '1 号含场供、2 号只收自己那手')
    assert.deepEqual(mahjong.score.map((score, id) => score - before[id]), [-12300, 5300, 8000, 0])
    assert.equal(mahjong.score.reduce((a, b) => a + b, 0) + mahjong.riichibo * 1000, 100000, '分数守恒（含供托）')
  })

  it('默认頭ハネ：只有离放铳者最近的那家和', () => {
    const mahjong = setupRon()
    ronKey(mahjong, [horaContext(mahjong, 2, 2000), horaContext(mahjong, 1, 1000)])
    const end = mahjong.lastEnd as HoraEnd
    assert.equal(end.hora.length, 1)
    assert.equal(end.hora[0].id, 1, '0 号的下家')
  })
})

describe('荒牌流局 / 流し満貫', () => {
  const draw = (rules: Partial<RuleProfile>, options: {
    tenpai?: PlayerId[], mangan?: PlayerId[], homba?: number, riichi?: PlayerId[],
  } = {}) => {
    const mahjong = new Mahjong({ profile: { ...defaultProfile, ...rules } })
    mahjong.homba = options.homba ?? 0
    mahjong.round.haiyama = []          // rest = 0 → 荒牌流局
    for (const id of playerIds) {
      mahjong.round.players[id].ryuukyokuMangan = options.mangan?.includes(id) ?? false
      mahjong.round.players[id].waits = options.tenpai?.includes(id)
        ? [{ suit: 'man', rank: 1 }]
        : undefined
      mahjong.round.players[id].riichi = options.riichi?.includes(id) ? { double: false, iipatsu: false } : undefined
    }
    const before = [...mahjong.score]
    ;(mahjong as unknown as { mopai(): void }).mopai()
    return {
      delta: mahjong.score.map((score, id) => score - before[id]),
      end: mahjong.lastEnd!,
      riichibo: mahjong.riichibo,
    }
  }

  it('听牌料：一家听 +3000 / 三家 -1000；流局满贯关掉时按听牌料走', () => {
    const { delta, end } = draw({}, { tenpai: [0], mangan: [0] })
    assert.deepEqual(delta, [3000, -1000, -1000, -1000])
    assert.equal(end.type, 'ryuukyoku')
    assert.deepEqual((end as { ryuukyoku: { mangan: PlayerId[] } }).ryuukyoku.mangan, [], '没有流局满贯')
  })

  it('0 张可抽的听牌不算听牌', () => {
    const mahjong = new Mahjong()
    mahjong.round.haiyama = []
    for (const id of playerIds) mahjong.round.players[id].waits = id === 0 ? [] : undefined
    const before = [...mahjong.score]
    ;(mahjong as unknown as { mopai(): void }).mopai()
    assert.deepEqual(mahjong.score.map((score, id) => score - before[id]), [0, 0, 0, 0], '全都不算听牌 → 没有听牌料')
  })

  it('副露把听牌张用光的人也不算听牌（手牌・副露牌都算，第3章第11条）', () => {
    const mahjong = new Mahjong()
    const player = mahjong.round.players[1]
    player.pon = [{ tiles: tiles('555m'), chakan: false }]
    player.tiles = tiles('123m123s123p5m')      // 単騎 5m，但 5m 已经碰掉三张
    player.waits = player.calcShantenAndWaits()[1]
    for (const id of playerIds) mahjong.round.players[id].ryuukyokuMangan = false
    mahjong.round.haiyama = []
    const before = [...mahjong.score]
    ;(mahjong as unknown as { mopai(): void }).mopai()
    assert.deepEqual(mahjong.score.map((score, id) => score - before[id]), [0, 0, 0, 0], '没有听牌料')
    assert.deepEqual((mahjong.lastEnd as { ryuukyoku: { tenpai: PlayerId[] } }).ryuukyoku.tenpai, [])
  })

  it('流し満貫开着时按流局结算（只算基本点、本场棒/立直棒留在桌上）', () => {
    const dealer = draw({ nagashiMangan: true }, { mangan: [0], homba: 2, riichi: [1] })
    assert.deepEqual(dealer.delta, [12000, -5000, -4000, -4000], '庄家流满：+12000 / 各 -4000（1 号还要出立直棒）')
    assert.equal(dealer.riichibo, 1, '立直棒留在桌上')
    assert.deepEqual((dealer.end as { ryuukyoku: { mangan: PlayerId[] } }).ryuukyoku.mangan, [0])
    const child = draw({ nagashiMangan: true }, { mangan: [1] })
    assert.deepEqual(child.delta, [-4000, 8000, -2000, -2000], '闲家流满：+8000 / 庄 -4000 / 闲 -2000')
    assert.equal((child.end as { ryuukyoku: { type: string } }).ryuukyoku.type, 'hoapai', '按流局记')
  })

  it('多家流满共用頭ハネ开关', () => {
    const head = draw({ nagashiMangan: true }, { mangan: [2, 3] })
    assert.deepEqual((head.end as { ryuukyoku: { mangan: PlayerId[] } }).ryuukyoku.mangan, [2], '亲顺位靠前的 2 号')
    const both = draw({ nagashiMangan: true, multipleRon: true }, { mangan: [2, 3] })
    assert.equal((both.end as { ryuukyoku: { mangan: PlayerId[] } }).ryuukyoku.mangan.length, 2)
  })
})

describe('本场与连庄', () => {
  const afterRound = (homba: number, end: MahjongEnd) => {
    const mahjong = new Mahjong()
    mahjong.homba = homba
    const dealerBefore = mahjong.round.dealer
    mahjong.lastEnd = end
    ;(mahjong as unknown as { nextRound(): boolean }).nextRound()
    return { homba: mahjong.homba, dealer: mahjong.round.dealer, dealerBefore }
  }
  const horaEnd = (id: PlayerId): MahjongEnd => ({
    type: 'hora',
    hora: [{ type: 'ron', id, score: 0, points: 1000, yaku: { fu: 30, fan: 1 } }],
  })
  const hoapaiEnd = (tenpai: PlayerId[]): MahjongEnd => ({ type: 'ryuukyoku', ryuukyoku: { type: 'hoapai', tenpai, mangan: [] } })
  const abortive: MahjongEnd = { type: 'ryuukyoku', ryuukyoku: { type: 'sufurenda' } }

  it('亲和了 / 亲听牌流局 → 连庄、本场 +1', () => {
    assert.deepEqual(pick(afterRound(2, horaEnd(0))), [3, 'same'], '亲和了')
    assert.deepEqual(pick(afterRound(2, hoapaiEnd([0]))), [3, 'same'], '亲听牌流局')
  })
  it('子和了 → 轮庄、本场归零', () => {
    assert.deepEqual(pick(afterRound(2, horaEnd(1))), [0, 'next'], '子和了')
  })
  it('亲不聴流局 / 中途流局 → 轮庄或续投，但本场都 +1', () => {
    assert.deepEqual(pick(afterRound(2, hoapaiEnd([1]))), [3, 'next'], '亲不聴（M.League 也 +1）')
    assert.deepEqual(pick(afterRound(2, abortive)), [3, 'same'], '中途流局亲续投')
  })

  function pick({ homba, dealer, dealerBefore }: { homba: number, dealer: PlayerId, dealerBefore: PlayerId }) {
    return [homba, dealer === dealerBefore ? 'same' : dealer === nextId(dealerBefore) ? 'next' : `?${dealer}`]
  }
})

describe('终局条件（南四 / 西入 / 西四）', () => {
  // 指定场风局数、分数、局终结果 → 整场还能不能继续；能继续就顺手推进一局看落在哪
  const after = (
    score: number[], end: MahjongEnd,
    options: { rules?: Partial<RuleProfile>, bakaze?: 'nan' | 'sha', kyoku?: number } = {},
  ) => {
    const mahjong = new Mahjong({ profile: { ...defaultProfile, suddenDeath: true, ...options.rules } })
    mahjong.bakaze = options.bakaze ?? 'nan'
    mahjong.kyoku = options.kyoku ?? 4
    mahjong.score = [...score]
    mahjong.lastEnd = end
    const canContinue = (mahjong as unknown as { canNextRound(): boolean }).canNextRound()
    const advanced = canContinue ? (mahjong as unknown as { nextRound(): boolean }).nextRound() : false
    return { canContinue, advanced, mahjong }
  }
  const dealerWin: MahjongEnd = {
    type: 'hora',
    hora: [{ type: 'tsumo', id: 0, score: 0, points: 2000, yaku: { fu: 30, fan: 3 } }],
  }
  const childWin: MahjongEnd = {
    type: 'hora',
    hora: [{ type: 'ron', id: 1, score: 0, points: 1000, yaku: { fu: 30, fan: 1 } }],
  }
  const dealerTenpaiDraw: MahjongEnd = { type: 'ryuukyoku', ryuukyoku: { type: 'hoapai', tenpai: [0], mangan: [] } }
  const childTenpaiDraw: MahjongEnd = { type: 'ryuukyoku', ryuukyoku: { type: 'hoapai', tenpai: [1], mangan: [] } }

  it('南四：庄家连庄时，庄家第一 + 有人到 30000 才收官（あがりやめ）', () => {
    assert.equal(after([40000, 20000, 20000, 20000], dealerWin).canContinue, false, '亲和了、庄家第一')
    assert.equal(after([31000, 31000, 20000, 18000], dealerTenpaiDraw).canContinue, false, '并列第一也算')
    assert.equal(after([20000, 40000, 20000, 20000], dealerWin).canContinue, true, '庄家不是第一 → 继续连庄')
  })

  it('南四：庄家连庄但没人到 30000 → 继续打南四', () => {
    assert.equal(after([29000, 25000, 25000, 21000], dealerWin).canContinue, true, '庄家第一但没到 30000')
    assert.equal(after([25000, 25000, 25000, 25000], dealerTenpaiDraw).canContinue, true)
  })

  it('南四：庄家连庄结束、有人到 30000 → 终局', () => {
    assert.equal(after([40000, 20000, 20000, 20000], childWin).canContinue, false)
    assert.equal(after([40000, 20000, 20000, 20000], childTenpaiDraw).canContinue, false, '荒牌流局庄家不聴也一样')
  })

  it('南四：庄家连庄结束、没人到 30000 → 西入（不开西入的档直接收官）', () => {
    const west = after([26000, 25000, 25000, 24000], childWin)
    assert.equal(west.canContinue, true)
    assert.equal(west.advanced, true)
    assert.equal(west.mahjong.bakaze, 'sha', '进西场')
    assert.equal(west.mahjong.kyoku, 1, '从西一局开始')
    assert.equal(after([26000, 25000, 25000, 24000], childWin, { rules: { suddenDeath: false } }).canContinue,
      false, 'M.League 不西入')
  })

  it('30000 点整也算到线（以上）', () => {
    assert.equal(after([30000, 25000, 25000, 20000], childWin).canContinue, false, '刚好 30000 → 终局')
    assert.equal(after([29900, 25000, 25000, 20100], childWin).canContinue, true, '29900 → 西入')
  })

  it('西场：有人到 30000 就终局，没人到就继续', () => {
    const west2 = { bakaze: 'sha' as const, kyoku: 2 }
    assert.equal(after([30000, 25000, 25000, 20000], childWin, west2).canContinue, false)
    assert.equal(after([29900, 25000, 25000, 20100], childWin, west2).canContinue, true)
  })

  it('西四：不北入，庄家连庄结束就收官（不管分数）', () => {
    const west4 = { bakaze: 'sha' as const }
    assert.equal(after([25000, 25000, 25000, 25000], childWin, west4).canContinue, false)
    assert.equal(after([25000, 25000, 25000, 25000], childTenpaiDraw, west4).canContinue, false)
  })

  it('西四：庄家连庄时和南四一样（第一 + 有人到 30000 才收官）', () => {
    const west4 = { bakaze: 'sha' as const }
    assert.equal(after([40000, 20000, 20000, 20000], dealerWin, west4).canContinue, false)
    assert.equal(after([29000, 25000, 25000, 21000], dealerWin, west4).canContinue, true, '没人超过 → 继续西四')
  })

  it('被飞（箱割れ）：开关打开才结束半庄，M.League 打到最终局', () => {
    const busted = [26900, -1000, 25000, 24100]
    assert.equal(after(busted, childWin, { rules: { bustEndsGame: true } }).canContinue, false)
    assert.equal(after(busted, childWin, { rules: { bustEndsGame: false } }).canContinue, true)
  })
})

describe('立直棒的账', () => {
  it('和牌者收桌上已有的 + 本局立直者出的', () => {
    const mahjong = setupRon()
    mahjong.riichibo = 2
    mahjong.round.players[2].riichi = { double: false, iipatsu: true }
    const before = [...mahjong.score]
    ronKey(mahjong, [horaContext(mahjong, 1, 1000)])
    assert.equal(mahjong.score[1] - before[1], 4000 + 3000, '和牌 4000 + 立直棒 3 根')
    assert.equal(mahjong.score[2] - before[2], -1000, '立直者自己出那 1000')
    assert.equal(mahjong.score[0] - before[0], -4000, '放铳者只付和牌点')
    assert.equal(mahjong.riichibo, 0, '棒都收走了')
  })

  it('半荘以流局收尾时，桌上的立直棒归 top', () => {
    const mahjong = new Mahjong({ profile: { ...defaultProfile, bustEndsGame: true } })
    mahjong.score = [30000, -500, 26000, 26500]
    mahjong.riichibo = 2
    mahjong.round.haiyama = []
    for (const id of playerIds) mahjong.round.players[id].waits = id === 0 ? [{ suit: 'man', rank: 1 }] : undefined
    ;(mahjong as unknown as { mopai(): void }).mopai()
    assert.equal(mahjong.score[0], 33000 + 2000, 'top 拿到两根棒')
    assert.equal(mahjong.riichibo, 0)
  })

  it('同分时的分法：两人均分、三人 4:3:3、四人再均分', () => {
    const split = (score: number[], riichibo: number) => {
      const mahjong = new Mahjong()
      mahjong.score = score
      mahjong.riichibo = riichibo
      ;(mahjong as unknown as { payRiichiboToTop(): void }).payRiichiboToTop()
      return mahjong.score
    }
    assert.deepEqual(split([25000, 25000, 100, 100], 1), [25500, 25500, 100, 100])
    assert.deepEqual(split([25000, 25000, 25000, 1], 1), [25400, 25300, 25300, 1])
    assert.deepEqual(split([25000, 25000, 25000, 25000], 2), [25500, 25500, 25500, 25500])
  })
})

describe('四风连打', () => {
  it('第一巡四家打出同一张风牌才算（四家各打一张東）', () => {
    const round = roundOf()
    round.players.forEach(player => { player.discards = [] })
    const east = tiles('1z')[0]
    round.players.forEach(player => player.discards.push(east))
    round.firstTurnIntact = true
    assert.equal(round.sufurenda, true)
    assert.equal(true, round.sufurenda)
    round.players[3].discards = []
    assert.equal(round.sufurenda, false, '有一家没打就不算')
    round.players[3].discards.push(east)
    round.players[1].discards[0] = tiles('2z')[0]
    assert.equal(round.sufurenda, false, '风牌不一样不算')
    round.players[1].discards[0] = east
    round.firstTurnIntact = false
    assert.equal(round.sufurenda, false, '第一巡被破坏后不算')
  })
})
