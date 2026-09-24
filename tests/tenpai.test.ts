// 向听 / 听牌：已知手牌 + 暴力法交叉验证 + 「0 张可抽的听牌」
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Round, Suit, Tile, suits } from '../src/index.js'
import { Counts, TileKind, group, toMPSZ } from '../src/utils.js'
import { roundOf, tiles } from './helpers.js'

// 每个花色的张数（数牌 1〜9、风 1〜4、三元 1〜3）
const rankCount: Record<Suit, number> = { man: 9, so: 9, pin: 9, kaze: 4, sangen: 3 }
const allKinds: TileKind[] = suits.flatMap(suit =>
  Array.from({ length: rankCount[suit] }, (_, i) => ({ suit, rank: i + 1 })))

// 暴力：这 14 张能不能成和（普通形 / 七对子 / 国士）
function isComplete(counts: Counts): boolean {
  let pairs = 0
  let singles = 0
  let other = false
  for (const suit of suits) for (const count of counts[suit]) {
    if (count === 2) pairs++
    else if (count === 1) singles++
    else if (count !== 0) other = true
  }
  if (!other && pairs === 7 && singles === 0) return true
  const yaochu = [
    counts.man[0], counts.man[8], counts.so[0], counts.so[8], counts.pin[0], counts.pin[8],
    ...counts.kaze, ...counts.sangen,
  ]
  if (yaochu.every(count => count >= 1) && yaochu.reduce((a, b) => a + b, 0) === 14) return true

  const mentsu = (work: Counts, need: number): boolean => {
    if (need === 0) return true
    for (const suit of suits) {
      for (let i = 0; i < work[suit].length; i++) {
        if (work[suit][i] < 3) continue
        work[suit][i] -= 3
        const ok = mentsu(work, need - 1)
        work[suit][i] += 3
        if (ok) return true
      }
      if (!['man', 'so', 'pin'].includes(suit)) continue
      for (let i = 0; i + 2 < work[suit].length; i++) {
        if (work[suit][i] < 1 || work[suit][i + 1] < 1 || work[suit][i + 2] < 1) continue
        work[suit][i]--; work[suit][i + 1]--; work[suit][i + 2]--
        const ok = mentsu(work, need - 1)
        work[suit][i]++; work[suit][i + 1]++; work[suit][i + 2]++
        if (ok) return true
      }
    }
    return false
  }
  for (const suit of suits) for (let i = 0; i < counts[suit].length; i++) {
    if (counts[suit][i] < 2) continue
    counts[suit][i] -= 2
    const ok = mentsu(counts, 4)
    counts[suit][i] += 2
    if (ok) return true
  }
  return false
}

// 暴力：13 张有没有能和的牌
function bruteTenpai(hand: TileKind[]): boolean {
  for (const suit of suits) {
    for (let rank = 1; rank <= rankCount[suit]; rank++) {
      const counts = group([...hand, { suit, rank }])
      if (counts[suit][rank - 1] > 4) continue
      if (isComplete(counts)) return true
    }
  }
  return false
}

describe('向听与听牌', () => {
  it('已知手牌', () => {
    const cases: [string, number, string][] = [
      ['123456789m1234p', 0, '4p 听 1p/4p'],
      ['1112345678999m', 0, '九莲'],
      ['19m19s19p1234567z', 0, '国士'],
      ['1133557799m112p', 0, '七对子听牌'],
      ['123456789m12p45s', 1, '一向听'],
      ['13579m13579s1357p', 4, '乱牌'],
    ]
    for (const [mpsz, want, label] of cases) {
      const round = roundOf()
      const player = round.players[0]
      player.tiles = tiles(mpsz)
      const [shanten, waits] = player.calcShantenAndWaits()
      assert.equal(shanten, want, `${label}：向听 ${shanten}（期望 ${want}）`)
      if (want === 0) assert.ok(waits.length > 0, `${label} 应该有听牌张`)
    }
  })

  it('0 张可抽的听牌：中 4 张都在自己手里', () => {
    const round = roundOf()
    const player = round.players[0]
    player.tiles = tiles('3333p44445p7777z')  // 13 张，単騎 7z（中），但 7z 四张都在手里
    const [shanten, waits] = player.calcShantenAndWaits()
    assert.equal(shanten, 0, `听牌形：${toMPSZ(player.tiles)}`)
    assert.equal(waits.length, 0, `可抽的听牌张：${JSON.stringify(waits)}`)
  })

  it('暴力法交叉验证（随机手牌）', () => {
    let state = 20240924
    const rnd = () => (state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
    let mismatch = 0
    for (let round = 0; round < 200; round++) {
      const pool = allKinds.flatMap(kind => [kind, kind, kind, kind])
      const hand: TileKind[] = []
      while (hand.length < 13) hand.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0])
      const engine = new Round('ton', 0, undefined, roundOf().profile)
      const player = engine.players[0]
      player.tiles = hand.map(({ suit, rank }) => new Tile(suit, rank, false))
      const [shanten] = player.calcShantenAndWaits()
      const brute = bruteTenpai(hand)
      if ((shanten === 0) !== brute) {
        mismatch++
        if (mismatch === 1) console.log(`  不一致：${toMPSZ(player.tiles)} 引擎=${shanten} 暴力=${brute}`)
      }
    }
    assert.equal(mismatch, 0, '引擎与暴力法判定不一致的次数')
  })
})
