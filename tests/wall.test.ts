// 牌山与宝牌：王牌 14 张、岭上取法、指示牌位置、牌数守恒、赤牌枚数
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Mahjong, Round, defaultProfile } from '../src/index.js'
import { toMPSZ } from '../src/utils.js'
import { assertTileCount, seededWall, simpleBot, tiles } from './helpers.js'

// 王牌摆成 14 张能分辨的牌：1z 2z 3z 4z 5z 6z 7z 1m…7m
const markedWanpai = () => tiles('1234z567z1234567m')

describe('王牌', () => {
  it('岭上牌从王牌最尾幢上段开始按顺序拿', () => {
    const round = new Round('ton', 0)
    round.wanpai = markedWanpai()
    const wanpai = [...round.wanpai]
    const drawn = [0, 1, 2, 3].map(() => {
      round.mopai(true, 0, true)
      return toMPSZ([round.players[0].drawn])
    })
    assert.deepEqual(drawn, wanpai.slice(10, 14).reverse().map(tile => toMPSZ([tile])),
      `岭上顺序：${drawn.join(' → ')}`)
    assert.equal(round.wanpai.length, 10, '王牌还剩 10 张（4 张岭上被拿走）')
  })

  it('本宝牌在第 3 幢上段、杠宝牌依次第 4〜7 幢上段，里宝牌是同幢下段', () => {
    const round = new Round('ton', 0)
    round.wanpai = markedWanpai()
    const wanpai = [...round.wanpai]
    for (let kanCount = 0; kanCount <= 4; kanCount++) {
      round.kanCount = kanCount
      const [dora, uradora] = round.dorahyoji
      assert.equal(dora.length, 1 + kanCount, `杠 ${kanCount} 个时的表宝牌张数`)
      assert.deepEqual(dora, [9, 7, 5, 3, 1].slice(0, 1 + kanCount).map(i => wanpai[i]), `杠 ${kanCount} 个时的表宝牌`)
      assert.deepEqual(uradora, [8, 6, 4, 2, 0].slice(0, 1 + kanCount).map(i => wanpai[i]), `杠 ${kanCount} 个时的里宝牌`)
    }
  })
})

describe('牌数守恒', () => {
  it('开局是 136 张，打一整局每一步也都是 136 张', async () => {
    const mahjong = new Mahjong({ createTiles: () => seededWall(7) })
    assert.equal(assertTileCount(mahjong), 136, '开局')
    const bot = simpleBot(mahjong, 7, 0.2)
    let steps = 0
    for await (const step of mahjong.steps()) {
      assert.equal(assertTileCount(mahjong), 136, '每一步的牌数')
      steps++
      if (step.type === 'roundEnd') break
      for (let slot = step.current; slot !== null; slot = step.current) {
        if (step.apply(slot.ctx, bot(slot))) break
      }
    }
    assert.ok(steps > 10, `至少走了十几步（实际 ${steps}）`)
  })
})

describe('赤牌枚数', () => {
  it('0 / 3 / 4 枚', () => {
    const count = (redFives: 0 | 3 | 4) => {
      const round = new Round('ton', 0, undefined, { ...defaultProfile, redFives })
      return [...round.players.flatMap(player => player.tiles), ...round.haiyama, ...round.wanpai].filter(tile => tile.red).length
    }
    assert.equal(count(0), 0)
    assert.equal(count(3), 3)
    assert.equal(count(4), 4)
    const mahjong = new Mahjong()
    const all = [...mahjong.round.players.flatMap(player => player.tiles), ...mahjong.round.haiyama, ...mahjong.round.wanpai]
    assert.equal(all.filter(tile => tile.red).length, 3, '默认 3 枚')
  })
})
