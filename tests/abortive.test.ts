// 和牌优先的途中流局：四家立直 / 四風連打 / 四槓散了 都要等这一打的吃碰杠和都没人要才成立
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HoraEnd, Mahjong, MahjongEnd, PromptSlot, Round, defaultProfile } from '../src/index.js'
import { canonicalWall, drive, hand, take, tiles } from './helpers.js'

const profile = { ...defaultProfile, abortiveDraws: true }

// checkKan 是内部方法（外面只能通过"打满 4 个槓"走到），这里直接调它验证标记
const invokeCheckKan = (mahjong: Mahjong) =>
  (mahjong as unknown as { checkKan(): void }).checkKan()

// 0 号（庄）摸到 1p 后打出去；1 号单骑听 1p，能和（一気通貫）
const discardTable = () => {
  const wall = canonicalWall()
  const hands = [
    hand('123456789m123s1p', wall),
    hand('123m456m789m111s1p', wall),
    hand('234m567m234p8899s', wall),
    hand('2233445566778p', wall),
  ]
  const draw = take('1p', wall)
  const mahjong = new Mahjong({ profile, createTiles: () => [...hands.flat(), ...draw, ...wall] })
  return mahjong
}

// 同上，但三家已经在立直：0 号这一打就是第 4 家立直宣言牌
const riichiDeclareTable = () => {
  const mahjong = discardTable()
  for (const player of mahjong.round.players) {
    player.riichi = { double: false, iipatsu: false }
  }
  return mahjong
}

// ron = 1 号要不要荣和；declare = 0 号这一打要不要宣言立直（只有四家立直那个场景需要）
const decide = (ron: boolean, declare: boolean, onRon?: () => void) => (slot: PromptSlot) => {
  if (slot.ctx.player.id === 1 && slot.phase === 'ron') {
    onRon?.()
    return ron ? { action: 'ron' as const } : { action: 'pass' as const }
  }
  if (slot.ctx.player.id === 0 && slot.ctx.types.has('tsumogiri')) {
    return declare && slot.ctx.types.has('riichi')
      ? { action: 'tsumogiri' as const, riichi: true }
      : { action: 'tsumogiri' as const }
  }
  return { action: 'pass' as const }
}

describe('四家立直', () => {
  it('第 4 家的立直宣言牌可以被荣和（和牌优先）', async () => {
    let sawRon = false
    const end = await drive(riichiDeclareTable(), decide(true, true, () => { sawRon = true }))
    assert.equal(sawRon, true, '1 号应该拿到荣和的机会')
    assert.equal(end.type, 'hora')
    assert.equal((end as HoraEnd).hora[0].id, 1)
  })

  it('没人荣和才流局', async () => {
    let sawRon = false
    const end = await drive(riichiDeclareTable(), decide(false, true, () => { sawRon = true }))
    assert.equal(sawRon, true, '荣和的机会给过，只是 1 号见逃了')
    assert.deepEqual(end, { type: 'ryuukyoku', ryuukyoku: { type: 'suuchaRiichi' } })
  })
})

describe('四槓散了', () => {
  // 相当于"第 4 个槓刚成立、岭上牌刚补完"：真打满 4 个槓的用例在最下面
  const fourKanTable = () => {
    const mahjong = discardTable()
    mahjong.round.kanCount = 4
    mahjong.round.suukansanra = true
    return mahjong
  }

  it('第 4 个槓之后的打牌先判和牌：点炮成立，不流局', async () => {
    const end = await drive(fourKanTable(), decide(true, false))
    assert.equal(end.type, 'hora')
    assert.equal((end as HoraEnd).hora[0].id, 1)
  })

  it('这一打没人要，才流局', async () => {
    const end = await drive(fourKanTable(), decide(false, false))
    assert.deepEqual(end, { type: 'ryuukyoku', ryuukyoku: { type: 'suukansanra' } })
  })

  it('真打满 4 个槓：第 4 个槓之后照样补岭上牌、照样能打一张', async () => {
    const wall = canonicalWall()
    const hands = [
      hand('123456789m123s5p', wall),
      hand('1111z2222z3333z5m', wall),   // 一家三个暗槓
      hand('4444z234p567p112m', wall),   // 第四个槓在另一家
      hand('2233445566778p', wall),
    ]
    const mahjong = new Mahjong({ profile, createTiles: () => [...hands.flat(), ...wall] })
    let discardedAfterFourKans = false
    const end = await drive(mahjong, slot => {
      const ctx = slot.ctx
      const ankan = ctx.types.has('kan') ? ctx.kans!.find(kan => kan.type === 'ankan') : undefined
      if (ankan) return { action: 'kan', kan: ankan }
      if (ctx.types.has('tedashi') || ctx.types.has('tsumogiri')) {
        if (mahjong.round.kanCount === 4) discardedAfterFourKans = true
        return { action: 'tsumogiri' as const }
      }
      return { action: 'pass' as const }
    })
    assert.equal(mahjong.round.kanCount, 4)
    assert.equal(discardedAfterFourKans, true,
      '第 4 个槓之后开杠的那家还要打一张（先留出岭上开花 / 点炮的机会，再判流局）')
    assert.deepEqual(end, { type: 'ryuukyoku', ryuukyoku: { type: 'suukansanra' } })
  })

  it('同一家自己四槓是四槓子，不流局', () => {
    const mahjong = discardTable()
    mahjong.round.kanCount = 4
    mahjong.round.players[0].ankan = ['1111m', '2222m', '3333m', '4444m'].map(kan => tiles(kan))
    invokeCheckKan(mahjong)
    assert.equal(mahjong.round.suukansanra, false)
  })

  it('没开途中流局的档（M.League）根本不判四槓散了', () => {
    const mahjong = new Mahjong({ profile: defaultProfile })
    mahjong.round.kanCount = 4
    invokeCheckKan(mahjong)
    assert.equal(mahjong.round.suukansanra, false)
  })
})

describe('九種九牌', () => {
  // 庄家配牌里放几种幺九牌：>= 9 种才能宣告（abortiveDraws 打开时）
  const table = (dealerHand: string, abortiveDraws = true) => {
    const wall = canonicalWall()
    const hands = [
      hand(dealerHand, wall),
      hand('1122334455667p', wall),
      hand('2233445566778p', wall),
      hand('111999m111999s1p', wall),
    ]
    return new Mahjong({
      profile: { ...defaultProfile, abortiveDraws },
      createTiles: () => [...hands.flat(), ...wall],
    })
  }
  const actionOf = (dealerHand: string, abortiveDraws = true) => {
    const round = new Round('ton', 0, undefined, { ...defaultProfile, abortiveDraws })
    round.firstTurnIntact = true
    round.players[0].tiles = tiles(dealerHand)
    round.currentId = 0
    round.kiru = undefined
    return round.action(0)!
  }

  it('种类不够或没开途中流局就不给宣告', () => {
    assert.equal(actionOf('19m19p19s1234567z2p').types.has('ryuukyoku'), true, '13 种')
    assert.equal(actionOf('111m19p19s112233z2p').types.has('ryuukyoku'), false, '只有 8 种')
    assert.equal(actionOf('19m19p19s1234567z2p', false).types.has('ryuukyoku'), false, 'M.League 档没有途中流局')
  })

  it('第一巡宣告 → 中途流局（亲续投、本场 +1）', async () => {
    const mahjong = table('19m19p19s1234567z')
    let declared = false
    let end: MahjongEnd | undefined
    let nextRoundDealer: number | undefined
    for await (const step of mahjong.steps()) {
      if (step.type === 'roundEnd') {
        if (end) break
        end = step.end
        continue                                   // 再取一个 step = 打下一局
      }
      if (end) { nextRoundDealer = mahjong.dealer; break }
      for (let slot = step.current; slot !== null; slot = step.current) {
        const ctx = slot.ctx
        const decision = ctx.player.id === 0 && ctx.types.has('ryuukyoku')
          ? (declared = true, { action: 'ryuukyoku' as const })
          : ctx.types.has('tsumogiri') ? { action: 'tsumogiri' as const } : { action: 'pass' as const }
        if (step.apply(ctx, decision)) break
      }
    }
    assert.equal(declared, true, '第一巡应该给出宣告九種九牌的选项')
    assert.deepEqual(end, { type: 'ryuukyoku', ryuukyoku: { type: 'kyuushu', id: 0 } })
    assert.equal(mahjong.homba, 1, '中途流局也算一本场')
    assert.equal(nextRoundDealer, 0, '亲续投：下一局还是 0 号当庄')
  })
})

describe('四風連打', () => {
  it('第一巡四家都打同一张风牌 → 流局', async () => {
    const wall = canonicalWall()
    const hands = [
      hand('1z234m567m234p888s', wall),
      hand('1z234m567m234p777s', wall),
      hand('1z234m567m234p666s', wall),
      hand('1z234m567m234p555s', wall),
    ]
    const mahjong = new Mahjong({
      profile: { ...defaultProfile, abortiveDraws: true },
      createTiles: () => [...hands.flat(), ...wall],
    })
    const order: number[] = []
    const end = await drive(mahjong, slot => {
      const ctx = slot.ctx
      const kaze = ctx.player.tiles.find(tile => tile.suit === 'kaze' && tile.rank === 1)
      if (kaze && ctx.types.has('tedashi')) {
        order.push(ctx.player.id)
        return { action: 'tedashi', tile: kaze }
      }
      if (ctx.types.has('tsumogiri')) return { action: 'tsumogiri' }
      return { action: 'pass' }
    })
    assert.deepEqual(order, [0, 1, 2, 3], '四家按顺序各打一张東')
    assert.deepEqual(end, { type: 'ryuukyoku', ryuukyoku: { type: 'sufurenda' } })
  })
})
