// fuzz：跑若干局随机对局，检查不变量，并打出"决策哈希"当行为指纹
// （改了规则/重构之后，这个哈希应该逐位相同；要改动行为就一起改注释里的值）
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { Mahjong, playerIds } from '../src/index.js'
import { assertTileCount, seededWall, simpleBot } from './helpers.js'

const GAMES = Number(process.env.FUZZ_GAMES ?? 60)
// 上次记录：232895592（30 局时；改了规则/重构导致行为变化时这个数会变，属预期）

interface Stats {
  games: number, ron: number, tsumo: number, ryuukyoku: number, kan: number,
  riichi: number, ankanInRiichi: number, decisions: number, hash: number,
}

const aggregate = (stats: Stats, value: number) => { stats.hash = Math.imul(stats.hash, 31) + value | 0 }

it(`${GAMES} 局随机对局：分数/牌数守恒，输出决策哈希`, async () => {
  const stats: Stats = {
    games: 0, ron: 0, tsumo: 0, ryuukyoku: 0, kan: 0, riichi: 0, ankanInRiichi: 0, decisions: 0, hash: 0,
  }
  for (let game = 0; game < GAMES; game++) {
    const seed = 1000 + game * 7919
    const mahjong = new Mahjong({ createTiles: () => seededWall(seed) })
    const bot = simpleBot(mahjong, seed, 0.25)
    let roundNo = 0
    for await (const step of mahjong.steps()) {
      assert.equal(assertTileCount(mahjong), 136, `第 ${game + 1} 场第 ${roundNo} 局的牌数`)
      if (step.type === 'roundEnd') {
        roundNo++
        aggregate(stats, step.end.type === 'hora' ? step.end.hora.length : -1)
        for (const player of mahjong.round.players) {
          if (mahjong.round.players[player.id].riichi) stats.riichi++
        }
        if (step.end.type === 'hora') for (const hora of step.end.hora) stats[hora.type]++
        else stats.ryuukyoku++
        stats.kan += mahjong.round.kanCount
        assert.equal(mahjong.score.reduce((a, b) => a + b, 0) + mahjong.riichibo * 1000, 100000,
          `第 ${game + 1} 场结束要守恒：${mahjong.score.join('/')}`)
        continue
      }
      for (let slot = step.current; slot !== null; slot = step.current) {
        const decision = bot(slot)
        stats.decisions++
        aggregate(stats, slot.ctx.player.id * 16 + decision.action.length)
        if (decision.action === 'kan') {
          aggregate(stats, decision.kan.type.length)
          if (decision.kan.type === 'ankan' && mahjong.round.players[slot.ctx.player.id].riichi) stats.ankanInRiichi++
        }
        if (step.apply(slot.ctx, decision)) break
      }
    }
    stats.games++
    assert.ok(playerIds.every(id => mahjong.score[id] === mahjong.score[id]), '分数不能是 NaN')
  }
  console.log(JSON.stringify({
    games: stats.games, ron: stats.ron, tsumo: stats.tsumo, ryuukyoku: stats.ryuukyoku,
    kan: stats.kan, riichi: stats.riichi, ankanInRiichi: stats.ankanInRiichi, decisions: stats.decisions,
  }))
  console.log(`决策哈希 ${stats.hash}`)
  assert.equal(stats.games, GAMES)
  assert.ok(stats.decisions > GAMES * 50, '决策数应该不少')
})
