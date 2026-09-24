// 对外契约：Prompt 回答的守卫（错误码）、立直的点数条件、规则档
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  Mahjong, MahjongContext, Tile, defaultProfile, mLeague, majsoul, mergeProfile, playerIds, ruleKeys,
} from '../src/index.js'
import { MahjongErrorCode } from '../src/utils.js'
import { drive, roundOf, seededWall, simpleBot, tiles } from './helpers.js'

const expectThrow = (code: MahjongErrorCode, action: () => void) => {
  try {
    action()
  } catch (error) {
    assert.equal((error as { code?: string }).code, code, `错误码应为 ${code}：${(error as Error).message}`)
    return
  }
  assert.fail(`应该抛 ${code}`)
}

describe('Prompt 的守卫', () => {
  it('乱答会抛带 code 的 MahjongError，且不会改坏牌局', async () => {
    const mahjong = new Mahjong({ createTiles: () => seededWall(1) })
    for await (const step of mahjong.steps()) {
      if (step.type !== 'prompt') continue
      const slot = step.current!
      const before = mahjong.round.players.flatMap(player => player.tiles).length

      // 别人的 ctx → out-of-order
      const other = new MahjongContext(mahjong.round.players[(slot.ctx.player.id + 1) % 4], slot.ctx)
      expectThrow('out-of-order', () => step.apply(other, { action: 'pass' }))
      // 现在不能做的动作 → action-not-allowed（起手第一格不能吃）
      expectThrow('action-not-allowed', () => step.apply(slot.ctx, { action: 'chi', candidate: [] }))
      if (slot.ctx.types.has('tedashi')) {
        // 手里没有的牌 → tile-not-in-hand
        const ghost = new Tile("so", 1, false)
        expectThrow('tile-not-in-hand', () => step.apply(slot.ctx, { action: 'tedashi', tile: ghost }))
      }
      // 答了一格之后，同一格再答 → prompt-done 或者顺序错
      const decision = slot.ctx.types.has('tsumogiri') ? { action: 'tsumogiri' as const } : { action: 'pass' as const }
      step.apply(slot.ctx, decision)
      assert.equal(mahjong.round.players.flatMap(player => player.tiles).length, before,
        '被守卫挡下的乱答不该动牌')
      break
    }
  })

  it('这一圈答完之后再答 → prompt-done', async () => {
    const mahjong = new Mahjong({ createTiles: () => seededWall(2) })
    for await (const step of mahjong.steps()) {
      if (step.type !== 'prompt') continue
      const slot = step.current!
      step.apply(slot.ctx, { action: 'tsumogiri' })
      expectThrow('prompt-done', () => step.apply(slot.ctx, { action: 'tsumogiri' }))
      break
    }
  })

  it('食い替え：刚碰进来的那张不能马上打', () => {
    const round = roundOf()
    const player = round.players[0]
    player.tiles = tiles('234m567m88p123s5s')
    round.currentId = 0
    player.kuikae = [{ suit: 'man', rank: 2 }]
    expectThrow('kuikae', () => round.dahai(player.tiles.find(tile => tile.suit === 'man' && tile.rank === 2)!))
  })

  it('立直要 1000 点以上', () => {
    const mahjong = new Mahjong({ createTiles: () => seededWall(3) })
    const round = mahjong.round
    const player = round.players[0]
    round.currentId = 0
    round.kiru = undefined
    player.tiles = tiles('123456789m1234p')   // 刚摸完、打 4p 就听
    player.riichi = undefined
    player.waits = undefined
    assert.ok(round.action(0)!.types.has('riichi'), '手牌层面可以立直')
    mahjong.score[0] = 500
    ;(mahjong as unknown as { next(): void }).next()
    const slot = (mahjong as unknown as { pending: { current: { ctx: MahjongContext } } }).pending.current
    assert.ok(!slot.ctx.types.has('riichi'), '点数不够时不该给立直选项')
  })
})

describe('规则档（profile）', () => {
  it('默认就是 mLeague 那一档', () => {
    assert.equal(defaultProfile, mLeague)
    assert.deepEqual({ ...new Mahjong().profile }, { ...mLeague })
  })

  it('majsoul 档整套生效、单独传的开关覆盖它', () => {
    const ms = new Mahjong({ profile: majsoul }).profile
    assert.ok(ms.multipleRon && ms.doubleYakuman && ms.kazoeYakuman && ms.abortiveDraws && ms.bustEndsGame)
    assert.ok(ms.zeroWaitTenpai && ms.riichiNeedsFourTiles && ms.kokushiAnkanChankan)
    assert.ok(ms.pao && ms.kuidashiTanyao && ms.kiriageMangan && ms.redFives === 3, '和 M.League 相同的项不变')
    const mixed = new Mahjong({ profile: majsoul, kiriageMangan: false, redFives: 0 }).profile
    assert.equal(mixed.kiriageMangan, false)
    assert.equal(mixed.redFives, 0)
    assert.equal(mixed.multipleRon, true, '档里其余项仍然生效')
  })

  it('mergeProfile：后面的覆盖前面的，undefined 不算数', () => {
    assert.equal(mergeProfile(mLeague, { kazoeYakuman: true }).kazoeYakuman, true)
    assert.equal(mergeProfile(majsoul, { kazoeYakuman: false }).kazoeYakuman, false)
    assert.equal(mergeProfile().pao, mLeague.pao)
    assert.ok(ruleKeys.every(key => key in mLeague && key in majsoul), '两档都要有全部开关')
  })
})

describe('一局的收尾', () => {
  it('打完之前 lastEnd 是 undefined，打完之后有结果', async () => {
    const mahjong = new Mahjong({ createTiles: () => seededWall(4) })
    assert.equal(mahjong.lastEnd, undefined)
    const end = await drive(mahjong, simpleBot(mahjong, 4))
    assert.equal(mahjong.lastEnd, end)
    assert.ok(end.type === 'hora' || end.type === 'ryuukyoku')
  })

  it('被飞默认不结束半庄（M.League 打到最终局）', () => {
    const mahjong = new Mahjong()
    assert.equal(mahjong.profile.bustEndsGame, false)
    assert.equal(new Mahjong({ profile: majsoul }).profile.bustEndsGame, true)
  })
})

