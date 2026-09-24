// 和牌优先的途中流局：四家立直 / 四風連打 / 四槓散了 都要等这一打的吃碰杠和都没人要才成立
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HoraEnd, Mahjong, PromptSlot, defaultProfile } from '../src/index.js'
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
