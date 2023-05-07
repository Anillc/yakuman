import { Kaze, Player, Round, Tile, kazes } from './round'
import { shimocha } from './utils'

export interface MahjongContext {
  index: number
  player: Player
  round: Round
  buttons: Set<'chi' | 'pon' | 'kan' | 'riichi' | 'ryuukyoku'>
  chi?: Tile[][]
  pon?: Tile[][]
  minkan?: Tile[][]
  ankan?: Tile[][]
  chakan?: Tile[]
}

export class Mahjong {
  _round: Round
  kaze: Kaze = 'ton'
  num = 0

  constructor(
    public callback: (ctxs: MahjongContext[], next: (tile: Tile) => void) => void
  ) {
    const round = this.round()
    const next = (tile: Tile) => {
      if (tile) {
        round.dahai(tile)
        const createCtx = (kaze: Kaze): MahjongContext => {
          return {
            index: this.index(kaze),
            player: round[kaze],
            round,
            buttons: new Set(),
          }
        }
        const ctxs: Record<Kaze, MahjongContext> = {
          ton: createCtx('ton'),
          nan: createCtx('nan'),
          sha: createCtx('sha'),
          pei: createCtx('pei'),
        }
        for (const kaze of ['ton', 'nan', 'sha', 'pei'] satisfies Kaze[]) {
          if (kaze === round.kiru.from.kaze) continue
          const pon = round[kaze].ponTiles
          if (pon.length !== 0) {
            ctxs[kaze].buttons.add('pon')
            ctxs[kaze].pon = pon
          }
          const minkan = round[kaze].minkanTiles
          if (minkan.length !== 0) {
            ctxs[kaze].buttons.add('kan')
            ctxs[kaze].minkan = minkan
          }
        }
        const chiKaze = shimocha(round.kaze)
        const chi = round[chiKaze].chiTiles
        if (chi.length !== 0) {
          ctxs[chiKaze].buttons.add('chi')
          ctxs[chiKaze].chi = chi
        }
        // TODO: 荣和
        const filtered = Object.values(ctxs).filter(ctx => ctx.buttons.size > 0)
        this.callback(filtered, next)
        return
      }
      if(!round.mopai()) {
        // TODO: 流局
      }
      const ctx: MahjongContext = {
        index: this.index(round.kaze),
        player: round.player,
        round,
        buttons: new Set(),
      }
      const ankan = round.player.ankanTiles
      if (ankan.length !== 0) {
        ctx.buttons.add('kan')
        ctx.ankan = ankan
      }
      const chakan = round.player.chakanTiles
      if (chakan.length !== 0) {
        ctx.buttons.add('kan')
        ctx.chakan = chakan
      }
      // TODO: 自摸
      this.callback([ctx], next)
    }
    next(null)
  }

  round() {
    this.nextKaze()
    this._round = new Round(this.kaze)
    return this._round
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