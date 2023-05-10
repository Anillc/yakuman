import { Action, ActionType, Kaze, Player, Round, Tile, kazes } from './round'
import { shimocha } from './utils'
import { Yaku } from './yaku'


export class MahjongContext implements Action {
  types: Set<ActionType>
  chiTiles?: Tile[][]
  ponTiles?: Tile[][]
  minkanTiles?: Tile[][]
  ankanTiles?: Tile[][]
  chakanTiles?: Tile[]

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
    if (tile !== this.player.tiles.at(-1)) {
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
  }
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
  kaze: Kaze = 'ton'
  num = 0

  constructor(
    public callback: (ctxs: { [k in Kaze]?: MahjongContext }, cancel: () => void) => void,
    public end: (end: MahjongEnd) => void,
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

  mopai(keepJun?: boolean, kaze?: Kaze) {
    if (this.round.rest === 0) {
      this.end({
        type: 'ryuukyoku',
        ryuukyoku: {
          type: '荒牌流局',
          tempai: kazes.filter(kaze => this.round[kaze].tempai13),
          mangan: kazes.filter(kaze => this.round[kaze].ryuukyokumangan),
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

  createRound() {
    this.nextKaze()
    this.round = new Round(this.kaze)
    return this.round
  }

  nextKaze() {
    // TODO: 结束、连庄
    if (this.num === 4) {
      this.num = 1
      this.kaze = shimocha(this.kaze)
    } else {
      this.num++
    }
  }

  index(kaze: Kaze) {
    return (kazes.indexOf(kaze) + this.num - 1) % 4
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
}
