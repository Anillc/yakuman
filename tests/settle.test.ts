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
    assert.equal(hora.pao, 3, '责任者是 3 号')
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
