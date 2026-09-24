// 冒烟：固定种子打一整场（半庄）——每一步牌数守恒、每一局分数守恒
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { Mahjong } from '../src/index.js'
import { assertTileCount, seededWall, simpleBot } from './helpers.js'

it('固定种子打完整场：牌数与分数一直守恒', async () => {
  const mahjong = new Mahjong({ createTiles: () => seededWall(20230514) })
  const bot = simpleBot(mahjong, 20230514, 0.3)
  const rounds: string[] = []
  let decisions = 0
  for await (const step of mahjong.steps()) {
    assert.equal(assertTileCount(mahjong), 136, '每一步的牌数')
    if (step.type === 'roundEnd') {
      const total = mahjong.score.reduce((a, b) => a + b, 0) + mahjong.riichibo * 1000
      assert.equal(total, 100000, `第 ${rounds.length + 1} 局结束后分数守恒：${mahjong.score.join('/')}`)
      rounds.push(`${step.end.type}${step.end.type === 'hora' ? `:${step.end.hora.map(hora => `${hora.id}+${hora.score}`).join(',')}` : ''}`)
      continue
    }
    for (let slot = step.current; slot !== null; slot = step.current) {
      decisions++
      if (step.apply(slot.ctx, bot(slot))) break
    }
  }
  assert.ok(rounds.length >= 4, `至少打了 4 局（实际 ${rounds.length}）`)
  assert.ok(decisions > 100, `决策数 ${decisions}`)
  assert.deepEqual(mahjong.score.reduce((a, b) => a + b, 0) + mahjong.riichibo * 1000, 100000, '整场结束也守恒')
})

it('同一副牌山重打，结果逐字一致（可复现）', async () => {
  const play = async () => {
    const mahjong = new Mahjong({ createTiles: () => seededWall(1234) })
    const bot = simpleBot(mahjong, 1234, 0.2)
    const log: string[] = []
    for await (const step of mahjong.steps()) {
      if (step.type === 'roundEnd') { log.push(`end:${step.end.type}:${mahjong.score.join('/')}`); continue }
      for (let slot = step.current; slot !== null; slot = step.current) {
        const decision = bot(slot)
        log.push(`${slot.ctx.player.id}:${decision.action}`)
        if (step.apply(slot.ctx, decision)) break
      }
    }
    return log.join('|')
  }
  assert.equal(await play(), await play())
})
