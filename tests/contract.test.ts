// 对外契约：Prompt 回答的守卫（错误码）、立直的点数条件、规则档
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  Mahjong, MahjongContext, Tile, defaultProfile, mLeague, majsoul, ruleKeys,
} from '../src/index.js'
import { MahjongErrorCode } from '../src/utils.js'
import { canonicalWall, drive, hand, roundOf, seededWall, simpleBot, tiles } from './helpers.js'

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
      // 答了一格
      const decision = slot.ctx.types.has('tsumogiri') ? { action: 'tsumogiri' as const } : { action: 'pass' as const }
      step.apply(slot.ctx, decision)
      assert.equal(mahjong.round.players.flatMap(player => player.tiles).length, before,
        '被守卫挡下的乱答不该动牌')
      break
    }
  })

  it('这一圈定案之后再提交剩下的格子 → 空操作，返回 true，牌局不变', async () => {
    const mahjong = new Mahjong({ createTiles: () => seededWall(2) })
    for await (const step of mahjong.steps()) {
      if (step.type !== 'prompt') continue
      const slot = step.current!
      const before = mahjong.round.players.flatMap(player => player.tiles).length
      assert.equal(step.apply(slot.ctx, { action: 'tsumogiri' }), true, '这一圈定了')
      assert.equal(step.current, null)
      // 已经定案：同一圈的任何提交都是空操作，照样返回 true
      assert.equal(step.apply(slot.ctx, { action: 'tsumogiri' }), true)
      assert.equal(mahjong.round.players.flatMap(player => player.tiles).length, before, '空操作没有动牌')
      break
    }
  })

  it('同一家有两格（荣和 + 碰）时可以乱序回答，但结算仍按优先级', async () => {
    // 0 号打 9s；1 号手里 99s + 听 9s（单骑），所以既能荣和 9s 也能碰 9s
    const wall = canonicalWall()
    const hands = [
      hand('9s19m19p11234567z', wall),
      hand('99s123m456m222z55p', wall),
      hand('123456789m1234p', wall),
      hand('1122334455667p', wall),
    ]
    const mahjong = new Mahjong({ createTiles: () => [...hands.flat(), ...wall] })
    let discarded = false
    for await (const step of mahjong.steps()) {
      if (step.type === 'roundEnd') break
      const slots = step.slots
      const ron = slots.find(slot => slot.ctx.player.id === 1 && slot.phase === 'ron')
      const claim = slots.find(slot => slot.ctx.player.id === 1 && slot.phase === 'claim')
      if (ron && claim) {
        assert.deepEqual(slots.filter(slot => slot.ctx.player.id === 1).map(slot => slot.phase), ['ron', 'claim'])
        // 故意先答"碰"，再答"荣和"：容和优先，碰应该被丢掉
        step.apply(claim.ctx, { action: 'pon', candidate: claim.ctx.ponTiles![0] })
        step.apply(ron.ctx, { action: 'ron' })
        const end = await (async () => {
          for await (const rest of mahjong.steps()) if (rest.type === 'roundEnd') return rest.end
        })()
        assert.equal(end?.type, 'hora')
        assert.equal((end as { hora: { id: number }[] }).hora[0].id, 1, '荣和的那家')
        assert.equal(mahjong.round.players[1].pon.length, 0, '碰被荣和盖掉，没有生效')
        return
      }
      for (let slot = step.current; slot !== null; slot = step.current) {
        const ctx = slot.ctx
        if (ctx.types.has('tedashi') && ctx.player.id === 0 && !discarded) {
          discarded = true
          const tile = ctx.player.tiles.find(candidate => candidate.suit === 'so' && candidate.rank === 9)!
          if (step.apply(ctx, { action: 'tedashi', tile })) break
          continue
        }
        const decision = ctx.types.has('tsumogiri') ? { action: 'tsumogiri' as const } : { action: 'pass' as const }
        if (step.apply(ctx, decision)) break
      }
    }
    assert.fail('没遇到 1 号既能荣和又能碰的那一圈')
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

  it('majsoul 档整套生效；要改就在 profile 上铺开改', () => {
    const ms = new Mahjong({ profile: majsoul }).profile
    assert.ok(ms.multipleRon && ms.doubleYakuman && ms.kazoeYakuman && ms.abortiveDraws && ms.bustEndsGame && ms.suddenDeath)
    assert.ok(ms.zeroWaitTenpai && ms.riichiNeedsFourTiles && ms.kokushiAnkanChankan)
    assert.ok(ms.pao && ms.kuidashiTanyao && ms.kiriageMangan && ms.redFives === 3, '和 M.League 相同的项不变')
    const mixed = new Mahjong({ profile: { ...majsoul, kiriageMangan: false, redFives: 0 } }).profile
    assert.equal(mixed.kiriageMangan, false)
    assert.equal(mixed.redFives, 0)
    assert.equal(mixed.multipleRon, true, '档里其余项仍然生效')
    assert.equal(mixed.nagashiMangan, majsoul.nagashiMangan, '没动的项保持原样')
  })

  it('两档都是完整的规则清单（14 个开关都在）', () => {
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
