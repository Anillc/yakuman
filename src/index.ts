import { Action, ActionType, Kaze, Player, Round, Tile, kazes } from './round'
import { shimocha } from './utils'
import { Yaku } from './yaku'

// TODO: 包牌
export class MahjongContext implements Action {
  types: Set<ActionType>
  chiTiles?: Tile[][]
  ponTiles?: Tile[][]
  minkanTiles?: Tile[][]
  ankanTiles?: Tile[][]
  chakanTiles?: Tile[]
  yaku?: [yaku: Yaku, a: number]

  round: Round

  constructor(
    public mahjong: Mahjong,
    public index: number,
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
    kaze: Kaze
    yaku: Yaku
    score: number
  }[]
  ryuukyoku?: {
    type: '荒牌流局' | '九种九牌' | '四家立直' | '四风连打' | '四杠散了'
    // 荒牌流局
    tempai?: Kaze[]
    // 流局满贯
    mangan?: Kaze[]
    // 九种九牌
    kaze?: Kaze
  }
}

export class Mahjong {
  round: Round
  // 东一局开始
  kaze: Kaze = 'ton'
  num = 1
  score = [25000, 25000, 25000, 25000]
  // 本场棒
  homba = 0
  // 立直棒
  riichibo = 0

  constructor(
    public callback: (ctxs: { [k in Kaze]?: MahjongContext }, cancel: () => void) => void,
    public roundEnd: (end: MahjongEnd) => void,
    public gameEnd: () => void,
    public createTiles?: (kaze: Kaze, num: number, homba: number) => Tile[],
  ) {
    this.createRound()
    this.next()
  }

  // 取消吃、碰、杠、和
  // 几家都取消后才调用 cancel
  cancel(ctxs: { [k in Kaze]?: MahjongContext }) {
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
    let head = this.round.kiru.from.kaze
    while (!ctxs.find(ctx => ctx.player.kaze === head)) {
      head = shimocha(head)
    }
    const furikomi = this.index(this.round.kiru.from.kaze)
    const hora: MahjongEnd['hora'] = []
    for (const ctx of ctxs) {
      const oya = this.round.bakaze === ctx.player.kaze
      let score = Math.ceil((oya ? 6 * ctx.yaku[1] : 4 * ctx.yaku[1]) / 100) * 100
      this.score[furikomi] -= score
      if (head === ctx.player.kaze) {
        // 供托
        const kyotaku = this.homba * 300 + (this.riichibo + kazes.filter(kaze => this.round[kaze].riichi).length) * 1000
        score += kyotaku
        this.score[furikomi] -= kyotaku
      }
      hora.push({
        kaze: ctx.player.kaze,
        yaku: ctx.yaku[0],
        score,
      })
      this.score[this.index(ctx.player.kaze)] += score
    }
    this.end({
      type: 'hora',
      hora,
    })
  }

  tsumo(ctx: MahjongContext) {
    if (!ctx.types.has('tsumo')) throw new Error('unreachable')
    const oya = this.round.bakaze === ctx.player.kaze
    let score = Math.ceil((oya ? 6 * ctx.yaku[1] : 4 * ctx.yaku[1]) / 100) * 100
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
        kaze: ctx.player.kaze,
        yaku: ctx.yaku[0],
        score,
      }],
    })
  }

  mopai(keepJun?: boolean, kaze?: Kaze) {
    if (this.round.rest === 0) {
      const tempai = kazes.filter(kaze => this.round[kaze].tempai13)
      const mangan = kazes.filter(kaze => this.round[kaze].ryuukyokumangan)
      if (mangan.length !== 0) {
        const a = 2000
        for (const kaze of mangan) {
          if (kaze === this.round.bakaze) {
            // 庄家流满
            this.score[this.index(kaze)] += 6 * a
            for (const k of kazes) {
              if (k === kaze) continue
              this.score[this.index(k)] -= 2 * a
            }
          } else {
            // 闲家流满
            this.score[this.index(kaze)] += 4 * a
            for (const k of kazes) {
              if (k === kaze) continue
              if (k === this.round.bakaze) {
                this.score[this.index(k)] -= 2 * a
              } else {
                this.score[this.index(k)] -= a
              }
            }
          }
        }
      } else if (tempai.length !== 0 && tempai.length !== 4) {
        const get = 3000 / tempai.length
        const pay = 3000 / (4 - tempai.length)
        for (const kaze of kazes) {
          if (tempai.includes(kaze)) {
            this.score[this.index(kaze)] += get
          } else {
            this.score[this.index(kaze)] -= pay
          }
        }
      }
      this.end({
        type: 'ryuukyoku',
        ryuukyoku: {
          type: '荒牌流局',
          tempai,
          mangan,
        },
      })
      return
    }
    this.round.mopai(keepJun, kaze)
    this.next()
  }

  // 摸牌后调用此函数
  next() {
    const kaze = this.round.kaze
    const action = this.round.action(kaze)
    if (!action) throw new Error('unreachable')
    const ctxs = {
      [kaze]: new MahjongContext(this, this.index(kaze), this.round.player, action),
    }
    this.callback(ctxs, this.cancel(ctxs))
  }

  // 打出牌后调用此函数检查别的几家有没有按钮
  // 检查荒牌流局
  naki(kan?: boolean, ankan?: boolean) {
    const kaze = kazes.filter(kaze => kaze !== this.round.kaze)
    const ctxs: { [k in Kaze]?: MahjongContext } = {}
    for (const k of kaze) {
      const action = this.round.action(k, kan, ankan)
      if (!action) continue
      ctxs[k] = new MahjongContext(this, this.index(k), this.round[k], action)
    }
    if (Object.values(ctxs).length === 0) {
      if (this.checkKan()) {
        if (kan) {
          this.mopai(true, this.round.kaze)
        } else {
          this.mopai()
        }
      }
    } else {
      this.callback(ctxs, this.cancel(ctxs))
    }
  }

  index(kaze: Kaze) {
    return (kazes.indexOf(kaze) + this.num - 1) % 4
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
    this.roundEnd(end)
    if (!this.nextRound(end)) {
      this.gameEnd()
    }
  }

  nextRound(end: MahjongEnd): boolean {
    // 被飞了
    if (this.score.some(score => score < 0)) {
      return false
    }
    // 西入后只要有人分数超过 30000 则结束
    if (this.kaze === 'sha' && this.score.some(score => score > 30000)) {
      return false
    }
    // 南四局如果庄家是第一则结束
    if (this.kaze === 'nan' && this.num === 4) {
      const index = this.index(this.round.bakaze)
      if (this.score.every((score, i) => i === index || score > this.score[index])) {
        return false
      }
    }
    let oya = false
    if (end.type === 'hora') {
      oya = end.hora.some(hora => hora.kaze === this.round.bakaze)
    } else if (end.type === 'ryuukyoku' && end.ryuukyoku.type === '荒牌流局') {
      oya = end.ryuukyoku.tempai.some(tempai => tempai === this.round.bakaze)
    }
    // 西、南四局如果是闲家和牌则结束
    // (不会北入)
    if (['nan', 'sha'].includes(this.kaze) && this.num === 4) {
      if (!oya) return false
    }
    if (oya) {
      this.homba++
      this.createRound()
    } else if (this.num < 4) {
      this.num++
      this.createRound()
    } else {
      this.num = 1
      this.kaze = shimocha(this.kaze)
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
    this.round = new Round(this.kaze, this.createTiles?.(this.kaze, this.num, this.homba))
  }
}
