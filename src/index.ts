import { Kaze, Player, Round, Tile, kazes } from './round'
import { Pai, comparePai, shimocha } from './utils'

export type Buttons = 'chi' | 'pon' | 'kan' | 'riichi' | 'ryuukyoku' | 'riichi' | 'tsumo' | 'ron'

// TODO: 流局
export class MahjongContext {
  buttons = new Set<Buttons>()
  chiTiles?:    Tile[][]
  ponTiles?:    Tile[][]
  minkanTiles?: Tile[][]
  ankanTiles?:  Tile[][]
  chakanTiles?: Tile[]
  tempai?: [Pai, Pai[]][]

  round: Round

  constructor(
    public mahjong: Mahjong,
    public index: number,
    public player: Player,
    public callback: (ctxs: MahjongContext[]) => void,
  ) {
    this.round = mahjong.round
  }

  dahai(tile: Tile) {
    this.round.dahai(tile)
    if (this.tempai) {
      this.player.tempai = this.tempai.find(([tempai]) => tile.equals(tempai))?.[1]
    } else {
      this.player.tempai = null
    }
    this.naki()
  }

  // 吃、杠会摸牌，则不需要再调用 mopai
  chi(tiles: Tile[]) {
    this.round.chi(tiles)
    this.next()
  }

  // 碰完必须再调用打牌
  pon(tiles: Tile[]) {
    this.round.pon(this.player.kaze, tiles)
  }

  minkan(tiles: Tile[]) {
    this.round.minkan(this.player.kaze, tiles)
    this.check()
  }

  ankan(tiles: Tile[]) {
    // TODO: 国士无双
    this.round.ankan(tiles)
    this.check()
  }

  chakan(tile: Tile) {
    this.round.chakan(tile)
    this.check()
  }

  // 取消吃、碰、杠
  cancel() {
    // TODO: 抢杠取消的时候应该另外处理
    this.round.mopai()
    this.next()
  }

  private clear() {
    this.buttons = new Set()
    this.chiTiles = null
    this.ponTiles = null
    this.minkanTiles = null
    this.ankanTiles = null
    this.chakanTiles = null
    this.tempai = null
  }

  // 其他家的按钮
  private naki() {
    const { mahjong, round, callback } = this
    const ctxs: Record<Kaze, MahjongContext> = {
      ton: new MahjongContext(mahjong, mahjong.index('ton'), round['ton'], callback),
      nan: new MahjongContext(mahjong, mahjong.index('nan'), round['nan'], callback),
      sha: new MahjongContext(mahjong, mahjong.index('sha'), round['sha'], callback),
      pei: new MahjongContext(mahjong, mahjong.index('pei'), round['pei'], callback),
    }
    for (const kaze of ['ton', 'nan', 'sha', 'pei'] satisfies Kaze[]) {
      if (kaze === round.kiru.from.kaze) continue
      const pon = round[kaze].ponTiles
      if (pon.length !== 0) {
        ctxs[kaze].buttons.add('pon')
        ctxs[kaze].ponTiles = pon
      }
      const minkan = round[kaze].minkanTiles
      if (minkan.length !== 0) {
        ctxs[kaze].buttons.add('kan')
        ctxs[kaze].minkanTiles = minkan
      }
      const tempai = round[kaze].tempai
      if (tempai && tempai.find(pai => round.kiru.equals(pai))) {
        // TODO: 检查役
        ctxs[kaze].buttons.add('ron')
      }
    }
    const chiKaze = shimocha(round.kaze)
    const chi = round[chiKaze].chiTiles
    if (chi.length !== 0) {
      ctxs[chiKaze].buttons.add('chi')
      ctxs[chiKaze].chiTiles = chi
    }
    const filtered = Object.values(ctxs).filter(ctx => ctx.buttons.size > 0)
    if (filtered.length === 0) {
      this.round.mopai()
      this.next()
    } else {
      this.callback(filtered)
    }
  }

  // 计算上家是否听牌
  // 检查摸到的牌并调用回调
  private next() {
    const { mahjong, round, callback } = this
    const ctx = new MahjongContext(mahjong, mahjong.index(round.kaze), round.player, callback)
    ctx.check()
    this.callback([ctx])
  }

  check() {
    this.clear()
    const ankan = this.player.ankanTiles
    if (ankan.length !== 0) {
      this.buttons.add('kan')
      this.ankanTiles = ankan
    }
    const chakan = this.player.chakanTiles
    if (chakan.length !== 0) {
      this.buttons.add('kan')
      this.chakanTiles = chakan
    }
    const shanten = this.player.calcShanten14()
    const tempai = shanten.filter(([, shanten]) => shanten === 0)
    if (tempai.length !== 0) {
      this.tempai = tempai.map(tempai => [tempai[0], tempai[2]])
      if (this.player.naki === 0) this.buttons.add('riichi')
      // TODO: 副露自摸？
      for (const [kiru, , tp] of tempai) {
        if (tp.find(pai => comparePai(kiru, pai) === 0)) {
          this.buttons.add('tsumo')
          break
        }
      }
    }
  }
}

export class Mahjong {
  round: Round
  kaze: Kaze = 'ton'
  num = 0

  constructor(
    public callback: (ctxs: MahjongContext[]) => void
  ) {
    this.createRound()
    const ctx = new MahjongContext(this, this.index(this.kaze), this.round.player, callback)
    ctx.check()
    callback([ctx])
  }

  createRound() {
    this.nextKaze()
    this.round = new Round(this.kaze)
    return this.round
  }

  nextKaze() {
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