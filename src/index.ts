import { Action, ActionType, Kaze, Player, Round, Tile, kazes } from './round'
import { shimocha } from './utils'
import { Yaku } from './yaku'

export * from './round'
export * from './tenpai'
export * from './utils'
export * from './yaku'

// TODO: 包牌 吃碰后不能杠 吃后不能打的牌
export class MahjongContext implements Action {
  types: Set<ActionType>
  chiTiles?: Tile[][]
  ponTiles?: Tile[][]
  minkanTiles?: Tile[][]
  ankanTiles?: Tile[][]
  chakanTiles?: Tile[]
  hora?: { yaku: Yaku, points: number }

  round: Round

  constructor(
    public mahjong: Mahjong,
    public scoreIndex: number,
    public player: Player,
    action: Action,
  ) {
    this.round = mahjong.round
    Object.assign(this, action)
  }

  dahai(tile: Tile, riichi?: boolean) {
    if (this.player.riichi && tile !== this.player.tiles.at(-1)) {
      throw new Error('unreachable')
    }
    this.round.dahai(tile, riichi)
    if (riichi) {
      const ryuukyoku = kazes.every(kaze => this.round[kaze].riichi)
      if (ryuukyoku) {
        this.mahjong.end({
          type: 'ryuukyoku',
          ryuukyoku: {
            type: '四家立直',
          },
        })
      }
      this.mahjong.naki()
    } else if (this.round.sufurenda === true) {
      this.mahjong.end({
        type: 'ryuukyoku',
        ryuukyoku: {
          type: '四风连打',
        },
      })
    } else {
      this.mahjong.naki()
    }
  }

  // 吃、杠会摸牌，则不需要再调用 mopai
  chi(tiles: Tile[]) {
    this.round.chi(tiles)
    this.mahjong.next()
  }

  pon(tiles: Tile[]) {
    this.round.pon(this.player.kaze, tiles)
    this.mahjong.next()
  }

  minkan(tiles: Tile[]) {
    this.round.minkan(this.player.kaze, tiles)
    this.mahjong.next()
  }

  ankan(tiles: Tile[]) {
    this.round.ankan(tiles)
    this.mahjong.naki(true, true)
  }

  chakan(tile: Tile) {
    this.round.chakan(tile)
    this.mahjong.naki(true)
  }

  // 九种九牌
  ryuukyoku() {
    this.mahjong.end({
      type: 'ryuukyoku',
      ryuukyoku: {
        type: '九种九牌',
        kaze: this.player.kaze,
      },
    })
  }
}

export class MahjongEnd {
  type: 'hora' | 'ryuukyoku'
  hora?: {
    type: 'tsumo' | 'ron'
    kaze: Kaze
    yaku: Yaku
    score: number
  }[]
  ryuukyoku?: {
    type: '荒牌流局' | '九种九牌' | '四家立直' | '四风连打' | '四杠散了'
    // 荒牌流局
    tenpai?: Kaze[]
    // 流局满贯
    mangan?: Kaze[]
    // 九种九牌
    kaze?: Kaze
  }
}

export class Mahjong {
  round: Round
  // 东一局开始
  bakaze: Kaze = 'ton'
  kyoku = 1
  score = [25000, 25000, 25000, 25000]
  // 本场棒
  homba = 0
  // 立直棒
  riichibo = 0
  lastEnd: MahjongEnd

  constructor(
    public callback: (ctxs: { [k in Kaze]?: MahjongContext }, cancel: () => void) => void,
    public roundEnd: (end: MahjongEnd) => void,
    public createTiles?: (kaze: Kaze, num: number, homba: number) => Tile[],
  ) {
    this.createRound()
  }

  start() {
    this.next()
  }

  // 取消吃、碰、杠、和
  // 几家都取消后才调用 cancel
  passHandler(ctxs: { [k in Kaze]?: MahjongContext }) {
    return () => {
      // 检查四杠散了
      if (this.checkKan()) {
        const ron = Object.values(ctxs).filter(ctx => ctx.types.has('ron'))
        for (const ctx of ron) {
          this.round.minogashi(ctx.player.kaze)
        }
        this.mopai()
      }
    }
  }

  ron(ctxs: MahjongContext[]) {
    if (!ctxs.every(ctx => ctx.types.has('ron'))) throw new Error('unreachable')
    let closestWinner = this.round.kiru.from.seat
    while (!ctxs.find(ctx => ctx.player.kaze === closestWinner)) {
      closestWinner = shimocha(closestWinner)
    }
    const furikomi = this.index(this.round.kiru.from.seat)
    const horaList: MahjongEnd['hora'] = []
    for (const ctx of ctxs) {
      const oya = this.round.bakaze === ctx.player.kaze
      const hora = ctx.hora!
      let score = Math.ceil((oya ? 6 * hora.points : 4 * hora.points) / 100) * 100
      this.score[furikomi] -= score
      if (closestWinner === ctx.player.kaze) {
        // 供托
        const kyotaku = this.homba * 300 + (this.riichibo + kazes.filter(kaze => this.round[kaze].riichi).length) * 1000
        score += kyotaku
        this.score[furikomi] -= kyotaku
      }
      horaList.push({
        type: 'ron',
        kaze: ctx.player.kaze,
        yaku: hora.yaku,
        score,
      })
      this.score[this.index(ctx.player.kaze)] += score
    }
    this.end({
      type: 'hora',
      hora: horaList,
    })
  }

  tsumo(ctx: MahjongContext) {
    if (!ctx.types.has('tsumo')) throw new Error('unreachable')
    const oya = this.round.bakaze === ctx.player.kaze
    const hora = ctx.hora!
    let score = Math.ceil((oya ? 6 * hora.points : 4 * hora.points) / 100) * 100
    for (const kaze of kazes) {
      if (this.round[kaze].riichi) {
        // 自家的立直棒将会在后面加回来
        this.score[this.index(kaze)] -= 1000
      }
      if (kaze === ctx.player.kaze) continue
      if (kaze === this.round.bakaze) {
        // 自家为庄家，不会进入这里
        if (oya) throw new Error('unreachable')
        // 自家为闲家，庄家支付 2a
        this.score[this.index(kaze)] -= 2 * score / 4 + 100 * this.homba
      } else {
        if (oya) {
          // 自家为庄家，闲家支付 2a
          this.score[this.index(kaze)] -= 2 * score / 4 + 100 * this.homba
        } else {
          // 自家为闲家，闲家支付 a
          this.score[this.index(kaze)] -= score / 4 + 100 * this.homba
        }
      }
    }
    // 供托
    score += this.homba * 300 + (this.riichibo + kazes.filter(kaze => this.round[kaze].riichi).length) * 1000
    this.score[this.index(ctx.player.kaze)] += score
    this.end({
      type: 'hora',
      hora: [{
        type: 'tsumo',
        kaze: ctx.player.kaze,
        yaku: hora.yaku,
        score,
      }],
    })
  }

  mopai(keepTurn?: boolean, kaze?: Kaze) {
    if (this.round.rest === 0) {
      const tenpaiSeats = kazes.filter(kaze => this.round[kaze].waits)
      const mangan = kazes.filter(kaze => this.round[kaze].ryuukyokuMangan)
      if (mangan.length !== 0) {
        const basePoints = 2000
        for (const kaze of mangan) {
          if (kaze === this.round.bakaze) {
            // 庄家流满
            this.score[this.index(kaze)] += 6 * basePoints
            for (const k of kazes) {
              if (k === kaze) continue
              this.score[this.index(k)] -= 2 * basePoints
            }
          } else {
            // 闲家流满
            this.score[this.index(kaze)] += 4 * basePoints
            for (const k of kazes) {
              if (k === kaze) continue
              if (k === this.round.bakaze) {
                this.score[this.index(k)] -= 2 * basePoints
              } else {
                this.score[this.index(k)] -= basePoints
              }
            }
          }
        }
      } else if (tenpaiSeats.length !== 0 && tenpaiSeats.length !== 4) {
        const receive = 3000 / tenpaiSeats.length
        const pay = 3000 / (4 - tenpaiSeats.length)
        for (const kaze of kazes) {
          if (tenpaiSeats.includes(kaze)) {
            this.score[this.index(kaze)] += receive
          } else {
            this.score[this.index(kaze)] -= pay
          }
        }
      }
      this.end({
        type: 'ryuukyoku',
        ryuukyoku: {
          type: '荒牌流局',
          tenpai: tenpaiSeats,
          mangan,
        },
      })
      return
    }
    this.round.mopai(keepTurn, kaze)
    this.next()
  }

  // 摸牌后调用此函数
  next() {
    const kaze = this.round.currentSeat
    const action = this.round.action(kaze)
    if (!action) throw new Error('unreachable')
    const ctxs = {
      [kaze]: new MahjongContext(this, this.index(kaze), this.round.player, action),
    }
    this.callback(ctxs, this.passHandler(ctxs))
  }

  // 打出牌后调用此函数检查别的几家有没有按钮
  // 检查荒牌流局
  naki(isKan?: boolean, isAnkan?: boolean) {
    const others = kazes.filter(k => k !== this.round.currentSeat)
    const ctxs: { [k in Kaze]?: MahjongContext } = {}
    for (const k of others) {
      const action = this.round.action(k, isKan, isAnkan)
      if (!action) continue
      ctxs[k] = new MahjongContext(this, this.index(k), this.round[k], action)
    }
    if (Object.values(ctxs).length === 0) {
      if (this.checkKan()) {
        if (isKan) {
          this.mopai(true, this.round.currentSeat)
        } else {
          this.mopai()
        }
      }
    } else {
      this.callback(ctxs, this.passHandler(ctxs))
    }
  }

  index(kaze: Kaze) {
    return (kazes.indexOf(kaze) + this.kyoku - 1) % 4
  }

  end(end: MahjongEnd) {
    // 和牌点数计算在 ron 和 tsumo 方法中
    if (end.type === 'ryuukyoku') {
      for (const kaze of kazes) {
        if (!this.round[kaze].riichi) continue
        this.score[this.index(kaze)] -= 1000
        this.riichibo++
      }
    } else {
      this.riichibo = 0
    }
    this.lastEnd = end
    this.roundEnd(end)
  }

  nextRound(): boolean {
    const end = this.lastEnd
    // 被飞了
    if (this.score.some(score => score < 0)) {
      return false
    }
    // 西入后只要有人分数超过 30000 则结束
    if (this.bakaze === 'sha' && this.score.some(score => score > 30000)) {
      return false
    }
    // 南四局如果庄家是第一则结束
    if (this.bakaze === 'nan' && this.kyoku === 4) {
      const index = this.index(this.round.bakaze)
      if (this.score.every((score, i) => i === index || score > this.score[index])) {
        return false
      }
    }
    let oya = false
    if (end.type === 'hora') {
      oya = end.hora.some(hora => hora.kaze === this.round.bakaze)
    } else if (end.type === 'ryuukyoku' && end.ryuukyoku.type === '荒牌流局') {
      oya = end.ryuukyoku.tenpai.some(seat => seat === this.round.bakaze)
    }
    // 西、南四局如果是闲家和牌则结束
    // (不会北入)
    if (['nan', 'sha'].includes(this.bakaze) && this.kyoku === 4) {
      if (!oya) return false
    }
    if (oya) {
      this.homba++
      this.createRound()
    } else if (this.kyoku < 4) {
      this.kyoku++
      this.createRound()
    } else {
      this.kyoku = 1
      this.bakaze = shimocha(this.bakaze)
      this.createRound()
    }
    this.next()
    return true
  }

  // 如果没有流局，则返回 true
  private checkKan(): boolean {
    if (this.round.kanCount === 4) {
      // 如果某一家有四杠，那么九不需要流局
      const ryuukyoku = !kazes.some(kaze => {
        const ankan = this.round[kaze].ankan.length
        const minkan = this.round[kaze].minkan.length
        return ankan + minkan === 4
      })
      if (ryuukyoku) {
        this.end({
          type: 'ryuukyoku',
          ryuukyoku: {
            type: '四杠散了',
          },
        })
        return false
      }
    }
    return true
  }
  
  private createRound() {
    this.round = new Round(this.bakaze, this.createTiles?.(this.bakaze, this.kyoku, this.homba))
  }
}
