// 杠：明杠 / 暗杠 / 加杠的候选与提交、抢杠（杠不成立）、四槓散了、三槓子・四槓子、岭上
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  Decision, Kan, Mahjong, MahjongContext, MahjongEnd, PromptSlot, Suit, Tile, defaultProfile,
} from '../src/index.js'
import { toMPSZ } from '../src/utils.js'
import { yaku } from '../src/yaku.js'
import { canonicalWall, drive, hand, horaOf, roundOf, take, tiles } from './helpers.js'

class Stop extends Error {}

// 跑到 decide 抛 Stop 为止（断言完就收工）
async function runUntil(mahjong: Mahjong, decide: (slot: PromptSlot) => Decision) {
  try {
    await drive(mahjong, decide)
  } catch (error) {
    if (error instanceof Stop) return
    throw error
  }
  throw new Error('牌局结束了也没等到想要的局面')
}

const kanOf = (ctx: MahjongContext, type: Kan['type']) =>
  ctx.types.has('kan') ? ctx.kans!.find(kan => kan.type === type) : undefined
const handTile = (player: { tiles: Tile[] }, suit: Suit, rank: number) =>
  player.tiles.find(tile => tile.suit === suit && tile.rank === rank)!

describe('三种杠的候选与提交', () => {
  it('明杠：别人打出第 4 张', async () => {
    const wall = canonicalWall()
    const hands = [
      hand('9s123m456p789p112z', wall),
      hand('999s123m456m222z5p', wall),
      hand('123456789m1234p', wall),
      hand('1122334455667p', wall),
    ]
    const mahjong = new Mahjong({ createTiles: () => [...hands.flat(), ...wall] })
    let discarded = false
    await runUntil(mahjong, slot => {
      const ctx = slot.ctx
      const player = ctx.player
      if (discarded && player.minkan.length === 1) {
        assert.equal(player.minkan[0].length, 4, `副露 ${toMPSZ(player.minkan[0])}`)
        assert.equal(player.tiles.length, 11, '手牌 11 张')
        assert.equal(mahjong.round.kanCount, 1, '杠数 1')
        assert.equal(mahjong.round.rinshan, true, '刚摸的是岭上牌')
        throw new Stop()
      }
      const minkan = kanOf(ctx, 'minkan')
      if (minkan) return { action: 'kan', kan: minkan }
      if (ctx.types.has('tedashi') || ctx.types.has('tsumogiri')) {
        if (ctx.player.id === 0 && !discarded) {
          discarded = true
          return { action: 'tedashi', tile: handTile(player, 'so', 9) }
        }
        return { action: 'tsumogiri' }
      }
      return { action: 'pass' }
    })
  })

  it('暗杠：手里 4 张', async () => {
    const wall = canonicalWall()
    const hands = [
      hand('19m19s19p1234567z', wall),
      hand('5555m123m678m222z', wall),
      hand('123456789s1234p', wall),
      hand('1122334455667p', wall),
    ]
    const mahjong = new Mahjong({ createTiles: () => [...hands.flat(), ...wall] })
    await runUntil(mahjong, slot => {
      const ctx = slot.ctx
      const player = ctx.player
      if (player.ankan.length === 1) {
        assert.equal(player.ankan[0].length, 4, `暗杠 ${toMPSZ(player.ankan[0])}`)
        assert.equal(player.tiles.length, 11, '手牌 11 张')
        assert.equal(mahjong.round.kanCount, 1)
        throw new Stop()
      }
      const ankan = kanOf(ctx, 'ankan')
      if (ankan) return { action: 'kan', kan: ankan }
      if (ctx.types.has('tedashi') || ctx.types.has('tsumogiri')) return { action: 'tsumogiri' }
      return { action: 'pass' }
    })
  })

  it('加杠：碰过之后摸到第 4 张', async () => {
    const wall = canonicalWall()
    const hands = [
      hand('9s19m19p11234567z', wall),
      hand('99s123m456m222z55p', wall),
      hand('123456789m1234p', wall),
      hand('1122334455667p', wall),
    ]
    const draws = take('1s2s3s4s9s', wall)
    const mahjong = new Mahjong({ createTiles: () => [...hands.flat(), ...draws, ...wall] })
    let discarded = false
    await runUntil(mahjong, slot => {
      const ctx = slot.ctx
      const player = ctx.player
      if (player.pon[0]?.chakan) {
        assert.equal(player.pon[0].tiles.length, 4, `加杠 ${toMPSZ(player.pon[0].tiles)}`)
        assert.equal(player.tiles.length, 11, '手牌 11 张')
        assert.equal(mahjong.round.kanCount, 1)
        throw new Stop()
      }
      const chakan = kanOf(ctx, 'chakan')
      if (chakan) return { action: 'kan', kan: chakan }
      // 1 号配牌就听 9s，先见逃再碰
      if (slot.phase === 'ron') return { action: 'pass' }
      if (ctx.types.has('pon') && player.pon.length === 0) return { action: 'pon', candidate: ctx.ponTiles![0] }
      if (ctx.types.has('tedashi') || ctx.types.has('tsumogiri')) {
        if (ctx.player.id === 0 && !discarded) {
          discarded = true
          return { action: 'tedashi', tile: handTile(player, 'so', 9) }
        }
        if (ctx.player.id === 1 && player.pon.length !== 0) return { action: 'tedashi', tile: handTile(player, 'kaze', 2) }
        return { action: 'tsumogiri' }
      }
      return { action: 'pass' }
    })
  })

  it('暗杠按"同一种牌"分组：赤 5 和普通 5 算同一种', () => {
    const round = roundOf()
    const player = round.players[0]
    player.tiles = tiles('0555m234p567p889s')   // 0 = 赤 5
    round.currentId = 0
    round.kiru = undefined
    const ankan = round.action(0)!.kans?.filter(kan => kan.type === 'ankan') ?? []
    assert.equal(ankan.length, 1, '赤 5 + 三张普通 5 就是一组暗杠')
    assert.equal(ankan[0].tiles.length, 4)
    assert.equal(ankan[0].tiles.filter(tile => tile.red).length, 1, '赤牌也在这一组里')
  })

  it('加杠同样按"同一种牌"：碰了 555m 之后摸到赤 5 也能加杠', () => {
    const round = roundOf()
    const player = round.players[0]
    player.pon = [{ tiles: tiles('555m'), chakan: false }]
    player.tiles = tiles('05m234p567p889s')     // 手牌 10 张（含赤 5）
    round.currentId = 0
    round.kiru = undefined
    const chakan = round.action(0)!.kans?.filter(kan => kan.type === 'chakan') ?? []
    assert.equal(chakan.length, 1)
    assert.equal(chakan[0].tiles[0].red, true, '候选就是手上那张赤 5')
    round.chakan(chakan[0].tiles[0])
    round.establishKan()
    assert.equal(player.pon[0].chakan, true)
    assert.equal(player.pon[0].tiles.length, 4, '碰升级成 4 张')
  })
})

describe('抢杠', () => {
  // 1 号碰 99s 后摸第 4 张加杠，2 号等着 9s 荣和：杠不成立
  it('被抢的加杠不算成立：不翻杠宝牌、碰也不升级', async () => {
    const wall = canonicalWall()
    const hands = [
      hand('9s19m19p11234567z', wall),
      hand('99s123m456m222z55p', wall),
      hand('234m567m234p88p78s', wall),
      hand('123456789m1234p', wall),
    ]
    const draws = take('1s2s3s4s9s', wall)
    // 王牌里摆指示牌：本ドラ = 東（宝牌 南，谁都沾不上）、第 1 个杠ドラ = 4m（宝牌 5m）
    wall[wall.length - 5] = new Tile('kaze', 1, false)
    wall[wall.length - 7] = new Tile('man', 4, false)
    const mahjong = new Mahjong({ createTiles: () => [...hands.flat(), ...draws, ...wall] })
    let discarded = false
    let kanDeclared = false
    let end: MahjongEnd | undefined
    for await (const step of mahjong.steps()) {
      if (step.type === 'roundEnd') { end = step.end; break }
      for (let slot = step.current; slot !== null; slot = step.current) {
        const current = slot
        const ctx = current.ctx
        const decide = (): Decision => {
          // 开杠前那格荣和是 0 号打的 9s，故意见逃
          if (current.phase === 'ron') return { action: kanDeclared ? 'ron' : 'pass' }
          if (ctx.player.id === 1) {
            const chakan = kanOf(ctx, 'chakan')
            if (chakan) {
              kanDeclared = true
              return { action: 'kan', kan: chakan }
            }
            if (ctx.types.has('pon') && ctx.player.pon.length === 0) return { action: 'pon', candidate: ctx.ponTiles![0] }
            if (ctx.types.has('tedashi')) return { action: 'tedashi', tile: handTile(ctx.player, 'kaze', 2) }
          }
          if (ctx.types.has('tedashi') || ctx.types.has('tsumogiri')) {
            if (ctx.player.id === 0 && !discarded) {
              discarded = true
              return { action: 'tedashi', tile: handTile(ctx.player, 'so', 9) }
            }
            return { action: 'tsumogiri' }
          }
          return { action: 'pass' }
        }
        if (step.apply(ctx, decide())) break
      }
    }
    assert.ok(end && end.type === 'hora', '应该和了')
    const hora = end.hora[0]
    const player = mahjong.round.players[1]
    assert.equal(hora.id, 2)
    assert.equal(hora.yaku.chankan, 1, '役里有搶槓')
    assert.equal(hora.yaku.dora ?? 0, 0, '杠没成立 → 不算杠宝牌')
    assert.equal(mahjong.round.kanCount, 0, '杠数还是 0')
    assert.equal(mahjong.round.dorahyoji[0].length, 1, '宝牌指示牌还是 1 张')
    assert.equal(player.pon[0].chakan, false, '碰没升成杠')
    assert.equal(player.pon[0].tiles.length, 3)
  })

  it('暗杠原则上谁都不能抢（国士也要开关）', () => {
    assert.equal(defaultProfile.kokushiAnkanChankan, false)
    // 手牌层面：暗杠只在自己回合出现，且不会给别人抢的机会（引擎里没有这个分支）
    const round = roundOf()
    const player = round.players[0]
    player.tiles = tiles('1111m234p567p88s9s9s')
    round.currentId = 0
    round.kiru = undefined
    const action = round.action(0)!
    assert.ok(action.kans?.some(kan => kan.type === 'ankan'), '自己有暗杠候选')
  })

  it('立直中的暗杠：听牌张不变才给候选', () => {
    // 立直中、摸到第 4 张时，先算杠前杠后的听牌张（M.League 第4章第5条：面子构成不变才允许）
    const riichiDraw = (hand13: string, drawn: string) => {
      const round = roundOf()
      const player = round.players[1]
      player.tiles = tiles(hand13)
      player.waits = player.calcShantenAndWaits()[1]
      player.riichi = { double: false, iipatsu: false }
      round.currentId = 1
      round.kiru = undefined
      player.tiles.push(tiles(drawn)[0])
      return { player, action: round.action(1)! }
    }
    // 234678m 3s 234777p → 摸 7p：杠前杠后都是 単騎 3s
    const same = riichiDraw('234678m3s234777p', '7p')
    assert.deepEqual(same.player.waits, [{ suit: 'so', rank: 3 }], '杠前等 3s')
    assert.deepEqual(same.action.kans?.map(kan => kan.type), ['ankan'], '听牌张不变 → 可以杠')
    // 1155567789m 456s → 摸 5m：杠掉 5m 会把 1m 的听口一起杠掉
    const changed = riichiDraw('1155567789m456s', '5m')
    assert.deepEqual(changed.player.waits, [
      { suit: 'man', rank: 1 }, { suit: 'man', rank: 5 }, { suit: 'man', rank: 8 },
    ], '杠前等 1m / 5m / 8m')
    assert.deepEqual(changed.action.kans ?? [], [], '听牌张会变 → 不给暗杠候选')
  })

  it('立直中的暗杠：真打一遍（补岭上牌、破一发、听牌张不变）', async () => {
    // 1 号手牌 234m 678m 234p 777p + 3s（単騎 3s），第一巡摸切宣言立直；
    // 第二巡摸到第 4 张 7p —— 杠掉 7777p 之后还是等 3s，所以引擎要给暗杠候选
    const wall = canonicalWall()
    const hands = [
      hand('1122334455668p', wall),
      hand('234678m3s234777p', wall),
      hand('1112223334445z', wall),
      hand('1112223334448m', wall),
    ]
    // 1 号是第 2 个摸牌的人，所以他的第二次摸牌在牌山第 6 张（下标 5）：把第 4 张 7p 放那儿
    const sevenP = take('7p', wall)[0]
    wall.splice(5, 0, sevenP)
    const mahjong = new Mahjong({ createTiles: () => [...hands.flat(), ...wall] })
    const player = mahjong.round.players[1]
    await runUntil(mahjong, slot => {
      if (slot.ctx.player.ankan.length === 1) throw new Stop()   // 杠完了，出去断言
      const ctx = slot.ctx
      const ankan = ctx.player.id === 1 && ctx.types.has('kan')
        ? ctx.kans!.find(kan => kan.type === 'ankan')
        : undefined
      if (ankan) return { action: 'kan', kan: ankan }
      if (ctx.types.has('tedashi') || ctx.types.has('tsumogiri')) {
        // 1 号第一巡摸切立直（其余人只是摸切）
        const riichi = ctx.player.id === 1 && !ctx.player.riichi && ctx.types.has('riichi')
          && !!ctx.player.waitsAfterDiscard(ctx.player.drawn)
        return { action: 'tsumogiri', riichi }
      }
      return { action: 'pass' }
    })
    assert.equal(player.ankan.length, 1, '暗杠成立')
    assert.equal(player.ankan[0].length, 4)
    assert.equal(player.tiles.length, 11, '杠掉 4 张 + 补 1 张岭上牌')
    assert.equal(mahjong.round.rinshan, true, '刚摸的是岭上牌')
    assert.equal(player.riichi?.iipatsu, false, '槓会破一发')
    assert.deepEqual(player.waits, [{ suit: 'so', rank: 3 }], '杠前杠后都是単騎 3s')
  })
})

describe('三槓子 / 四槓子 / 岭上开花', () => {
  it('三槓子 2 番、四槓子役满（加杠也算）', () => {
    // 三个杠 + 一副顺子 + 雀头
    const three = horaOf(roundOf(), '234m5m', '5m', { ankan: ['1111m', '2222m'], chakan: ['3333m'], tsumo: true })
    assert.equal(three.yaku.sankantsu, 2)
    // 四个杠 + 雀头
    const four = horaOf(roundOf(), '5m', '5m', { ankan: ['1111m', '2222m', '3333m'], chakan: ['4444m'], tsumo: true })
    assert.equal(four.yaku.suukantsu, 13)
  })

  it('岭上开花是自摸役', () => {
    const round = roundOf()
    round.rinshan = true
    const player = round.players[0]
    player.tiles = tiles('234m567m234p88p78s')
    const result = yaku(round, player, tiles('9s')[0], true)
    assert.equal(result.yaku.rinshan, 1)
  })
})
