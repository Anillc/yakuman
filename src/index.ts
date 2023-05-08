import { Action, ActionType, Kaze, Player, Round, Tile, kazes } from './round'
import { shimocha } from './utils'


// TODO: 流局
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
    this.round.dahai(tile, riichi)
    this.mahjong.naki()
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
    // TODO: 国士无双
    this.round.ankan(tiles)
    this.mahjong.next()
  }

  chakan(tile: Tile) {
    this.round.chakan(tile)
    this.mahjong.next()
  }

  // 取消吃、碰、杠
  // 几家都取消后才调用 cancel
  cancel() {
    this.mahjong.mopai()
  }
}

export class Mahjong {
  round: Round
  kaze: Kaze = 'ton'
  num = 0

  constructor(
    public callback: (ctxs: { [k in Kaze]?: MahjongContext }) => void
  ) {
    this.createRound()
    this.next()
  }

  mopai() {
    if (this.round.rest === 0) {
      // TODO: 荒牌流局
      return
    }
    this.round.mopai()
    this.next()
  }

  // 摸牌后调用此函数
  next() {
    const kaze = this.round.kaze
    const action = this.round.action(kaze)
    if (!action) throw new Error('unreachable')
    this.callback({
      [kaze]: new MahjongContext(this, this.index(kaze), this.round.player, action),
    })
  }

  // 打出牌后调用此函数检查别的几家有没有按钮
  // 检查荒牌流局
  naki() {
    const kaze = kazes.filter(kaze => kaze !== this.round.kaze)
    const ctxs: { [k in Kaze]?: MahjongContext } = {}
    for (const k of kaze) {
      const action = this.round.action(k)
      if (!action) continue
      ctxs[k] = new MahjongContext(this, this.index(k), this.round[k], action)
    }
    if (Object.values(ctxs).length === 0) {
      this.mopai()
    } else {
      this.callback(ctxs)
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
}