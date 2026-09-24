// 振听：舍张振听（自己牌河里有听牌张）、同巡振听（见逃之后同一巡不能再和）、
// 立直振听（立直中见逃就整局不能再和）
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { roundOf, tiles } from './helpers.js'

// 1 号听 5m（単騎 5m，另有场风东的刻子当役）。0 号打出 5m。
// selfDiscarded = true 时改成"1 号自己的牌河里已经有 5m"（舍张振听）
const table = (selfDiscarded = false) => {
  const round = roundOf()
  const player = round.players[1]
  player.tiles = tiles('234m678m234p111z5m')
  const [shanten, waits] = player.calcShantenAndWaits()
  player.waits = shanten === 0 ? waits : undefined
  // 牌山留几张（rest !== 0，吃碰杠的候选才和平时一样），但里面别放 5m
  round.haiyama = [tiles('9m')[0], tiles('9m')[0], tiles('9m')[0]]
  const five = tiles('5m')[0]
  five.playerId = selfDiscarded ? 1 : 0
  if (selfDiscarded) {
    player.discards.push(five)
    player.discardCounts.man[4]++        // 舍张振听看的是自己打过的牌
  } else {
    round.players[0].discards.push(five)
  }
  round.currentId = 0
  round.kiru = five
  return { round, player }
}

// 让 1 号自己摸一张（9m）再打出去：闲家的同巡振听在这时解除，立直中不解除
const playOwnTurn = (round: ReturnType<typeof table>['round']) => {
  round.currentId = 0
  round.haiyama = [tiles('9m')[0]]
  round.mopai()
  round.dahai(round.player.drawn)
  return round
}

// 再摆一次"0 号打出 5m"（上一张已经被处理掉了）
const discardFiveAgain = (round: ReturnType<typeof table>['round']) => {
  const five = tiles('5m')[0]
  five.playerId = 0
  round.players[0].discards.push(five)
  round.currentId = 0
  round.kiru = five
  return round
}

describe('振听', () => {
  const canRon = (round: ReturnType<typeof table>['round']) => round.action(1)?.types.has('ron') ?? false

  it('没振听时该荣和就给荣和', () => {
    const { round } = table()
    assert.equal(canRon(round), true)
  })

  it('舍张振听：自己的牌河里已经有这张听牌张 → 不能荣和', () => {
    const { round, player } = table(true)
    assert.equal(player.furiten, true)
    assert.equal(canRon(round), false)
  })

  it('同巡振听：见逃之后同一巡不能再荣和，自己打过牌才解除', () => {
    const { round, player } = table()
    assert.equal(canRon(round), true, '先确认能荣和')
    round.minogashi(1)                    // 见逃
    assert.equal(canRon(round), false, '同一巡里不能再荣和')
    playOwnTurn(round)
    assert.equal(player.dojunfuriten, false, '闲家自己打过牌就解除')
    discardFiveAgain(round)
    assert.equal(canRon(round), true, '解除之后又能荣和')
  })

  it('立直振听：立直中见逃之后整局都不能再荣和', () => {
    const { round, player } = table()
    player.riichi = { double: false, iipatsu: false }
    assert.equal(canRon(round), true, '立直中也能荣和')
    round.minogashi(1)
    assert.equal(canRon(round), false)
    playOwnTurn(round)
    assert.equal(player.dojunfuriten, true, '立直振听不会因为自己打牌而解除')
    assert.equal(player.furiten, false, '来源是见逃，不是舍张振听')
    discardFiveAgain(round)
    assert.equal(canRon(round), false, '立直振听中不能再荣和')
  })
})
