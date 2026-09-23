import { Decomposed, decompose, shanten } from './tenpai'
import { TileKind, compareTileKind, createEmptyCounts, group, shimocha, shuffle, toTileKinds, uniqTileKinds } from './utils'
import { Yaku, canHora, yaku } from './yaku'

export type Kaze = 'ton' | 'nan' | 'sha' | 'pei'
export const kazes: Kaze[] = ['ton', 'nan', 'sha', 'pei']

export type Sangen = 'white' | 'green' | 'red'
export const sangens: Sangen[] = ['white', 'green', 'red']

export type Suit = 'pin' | 'so' | 'man' | 'kaze' | 'sangen'
export const suits: Suit[] = ['pin', 'so', 'man', 'kaze', 'sangen']

export class Tile implements TileKind {
  riichi = false
  from: {
    // 巡
    turn?: number
    seat?: Kaze
  } = {}

  constructor(
    public suit: Suit,
    public rank: number,
    public red: boolean,
  ) {}

  equals(tile: Tile | TileKind): boolean
  equals(suit: Suit, rank: number): boolean
  equals(...[arg1, arg2]: any[]) {
    if (typeof arg1 === 'string') {
      return this.suit === arg1 && this.rank === arg2
    } else {
      if (this === arg1) return true
      return arg1.suit === this.suit && arg1.rank === this.rank
    }
  }
}

export type ActionType = 
  | 'chi' | 'pon' | 'kan' | 'riichi' | 'ryuukyoku'
  | 'tsumo' | 'ron' | 'dahai' | 'cancel'
export interface Action {
  types: Set<ActionType>
  chiTiles?:    Tile[][]
  ponTiles?:    Tile[][]
  minkanTiles?: Tile[][]
  ankanTiles?:  Tile[][]
  chakanTiles?: Tile[]
  hora?:        { yaku: Yaku, points: number }
}

export class Round {
  kanCount: number = 0
  haiyama: Tile[]

  ton: Player
  nan: Player
  sha: Player
  pei: Player
  currentSeat: Kaze = 'ton'

  // 巡
  turn: number = 0
  // 上一张被切的牌
  kiru: Tile = null

  firstTurnIntact = true
  // null -> 还没有打牌
  // TileKind -> 已经被打的风牌
  // false -> 没有四风连打
  // true -> 四风连打
  sufurenda: TileKind | boolean = null

  constructor (
    // 场风
    public bakaze: Kaze,
    tiles?: Tile[],
  ) {
    if (!tiles) {
      tiles = []
      for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
        for (let i = 0; i < 9; i++) {
          if (i + 1 === 5) {
            tiles.push(new Tile(suit, i + 1, true))
          } else {
            tiles.push(new Tile(suit, i + 1, false))
          }
          for (let j = 0; j < 3; j++) {
            tiles.push(new Tile(suit, i + 1, false))
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          tiles.push(new Tile('kaze', i + 1, false))
        }
      }
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          tiles.push(new Tile('sangen', i + 1, false))
        }
      }
      shuffle(tiles)
    }
    function setKaze(tiles: Tile[], kaze: Kaze) {
      for (const tile of tiles) {
        tile.from.seat = kaze
      }
      return tiles
    }
    this.ton = new Player(this, 'ton', setKaze(tiles.splice(0, 13), 'ton'))
    this.nan = new Player(this, 'nan', setKaze(tiles.splice(0, 13), 'nan'))
    this.sha = new Player(this, 'sha', setKaze(tiles.splice(0, 13), 'sha'))
    this.pei = new Player(this, 'pei', setKaze(tiles.splice(0, 13), 'pei'))
    this.haiyama = tiles
    this.mopai(true, 'ton')
  }

  get player(): Player {
    return this[this.currentSeat]
  }

  get rest() {
    return this.haiyama.length - 14
  }

  // 宝牌、里宝牌指示牌
  get dorahyoji(): [Tile[], Tile[]] {
    // 王牌
    const wanpai = this.haiyama.slice(this.haiyama.length - 14)
    for (let i = 0; i < 4 - this.kanCount; i++) wanpai.pop()
    const dora: Tile[] = []
    const uradora: Tile[] = []
    for (let i = wanpai.length - 1; i > 0; i--) {
      if ((14 - i) % 2 !== 0) {
        dora.push(wanpai[i])
      } else {
        uradora.push(wanpai[i])
      }
    }
    return [dora, uradora]
  }

  // 如果没有提供 kaze 参数，则切换到下家并摸牌
  // 返回 true 则为听牌
  mopai(keepTurn?: boolean, kaze?: Kaze): boolean {
    kaze ||= shimocha(this.currentSeat)
    const tile = this.haiyama.shift()
    tile.from.seat = kaze
    this[kaze].tiles.push(tile)
    this.currentSeat = kaze
    // 只有摸到并打出去才能算下一巡
    // 碰里面没有摸牌，故不会增加巡数
    if (!keepTurn && kaze === 'ton') {
      this.turn++
      // 第一次摸牌时 keepTurn 为 true
      this.breakFirstTurnFlags()
    }
    const options = this.player.calcShantenPerDiscard()
    const tenpaiOptions = options.filter(([, shanten]) => shanten === 0)
    if (tenpaiOptions.length !== 0) {
      this.player.discardTenpai = tenpaiOptions.map(([dahai, , waits]) => {
        const tiles = [...this.player.tiles]
        const index = tiles.findIndex(tile => tile.equals(dahai))
        if (index === -1) throw new Error('unreachable')
        tiles.splice(index, 1)
        const horaFlags = waits.map(wait =>
          canHora(yaku(this, this.player, wait, false, false, tiles)[0]))
        return [dahai, waits, horaFlags]
      })
      return true
    }
    return false
  }

  // 打牌
  dahai(tile: Tile, riichi: boolean) {
    this.player.tiles.splice(this.player.tiles.indexOf(tile), 1)
    tile.from.turn = this.turn
    this.kiru = tile
    this.player.discards.push(tile)
    this.player.discardCounts[tile.suit][tile.rank - 1]++
    if (this.player.riichi) {
      this.player.riichi.iipatsu = false
    }
    if (this.player.dojunfuriten) {
      this.player.dojunfuriten = false
    }
    const isTerminal = ['man', 'so', 'pin'].includes(tile.suit) && (tile.rank === 1 || tile.rank === 9)
    const isHonor = ['kaze', 'sangen'].includes(tile.suit)
    if (!isTerminal && !isHonor) {
      this.removeRyuukyokuMangan(this.currentSeat)
    }
    if (this.firstTurnIntact) {
      if (this.sufurenda === null) {
        if (tile.suit === 'kaze') {
          this.sufurenda = tile
        } else {
          this.sufurenda = false
        }
      } else if (typeof this.sufurenda !== 'boolean') {
        if (compareTileKind(this.sufurenda, tile) !== 0) {
          this.sufurenda = false
        }
      }
      if (this.sufurenda && this.currentSeat === 'pei') {
        this.sufurenda = true
      }
    }
    if (this.player.discardTenpai) {
      this.player.waits = this.player.discardTenpai.find(([discard]) => tile.equals(discard))?.[1]
      if (riichi) {
        if (!this.player.waits || this.player.naki !== 0) {
          throw new Error('unreachable')
        }
        tile.riichi = true
        this.player.riichi = {
          double: this.firstTurnIntact,
          iipatsu: true,
          decomposed: decompose(group(this.player.tiles)),
        }
      }
    } else {
      this.player.waits = null
      if (riichi) throw new Error('unreachable')
    }
    this.player.discardTenpai = null
  }

  // 吃、碰、明杠的 kaze 为上一次打牌的玩家
  // 暗杠、加杠的 kaze 为当前摸牌玩家

  chi(tiles: Tile[]) {
    tiles = [...tiles]
    const kaze = shimocha(this.currentSeat)
    const player = this[kaze]
    for (const tile of tiles) {
      tile.from.turn = this.turn
      const index = player.tiles.indexOf(tile)
      player.tiles.splice(index, 1)
    }
    this.player.discards.pop()
    tiles.push(this.kiru)
    player.chi.push(tiles)
    this.currentSeat = kaze
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(this.kiru.from.seat)
  }

  pon(kaze: Kaze, tiles: Tile[]) {
    tiles = [...tiles]
    const player = this[kaze]
    for (const tile of tiles) {
      tile.from.turn = this.turn
      const index = player.tiles.indexOf(tile)
      player.tiles.splice(index, 1)
    }
    this.player.discards.pop()
    tiles.push(this.kiru)
    player.pon.push({
      tiles,
      chakan: false,
    })
    this.currentSeat = kaze
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(this.kiru.from.seat)
  }

  minkan(kaze: Kaze, tiles: Tile[]) {
    tiles = [...tiles]
    const player = this[kaze]
    for (const tile of tiles) {
      tile.from.turn = this.turn
      const index = player.tiles.indexOf(tile)
      player.tiles.splice(index, 1)
    }
    this.player.discards.pop()
    tiles.push(this.kiru)
    player.minkan.push(tiles)

    this.mopai(true, kaze)
    this.kanCount++
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(this.kiru.from.seat)
  }

  // 暗杠与加杠的摸牌在 Mahjong 类里，因为如果被荣和则杠不成立
  ankan(tiles: Tile[]) {
    tiles = [...tiles]
    for (const tile of tiles) {
      tile.from.turn = this.turn
      const index = this.player.tiles.indexOf(tile)
      this.player.tiles.splice(index, 1)
    }
    this.player.ankan.push(tiles)
    this.kiru = tiles[0]
    this.kanCount++
    this.breakFirstTurnFlags()
  }

  chakan(tile: Tile) {
    tile.from.turn = this.turn
    for (const pon of this.player.pon) {
      if (pon.tiles[0].equals(tile)) {
        pon.tiles.push(tile)
        pon.chakan = true
      }
    }
    this.kiru = tile
    this.kanCount++
    this.breakFirstTurnFlags()
  }

  // 见逃
  minogashi(kaze: Kaze) {
    const player = this[kaze]
    player.dojunfuriten = true
  }

  // 鸣牌会破坏一发、地和、九种九牌、双立直、四风连打
  breakFirstTurnFlags() {
    this.firstTurnIntact = false
    this.sufurenda = false
    for (const kaze of kazes) {
      if (this[kaze].riichi) {
        this[kaze].riichi.iipatsu = false
      }
    }
  }

  removeRyuukyokuMangan(kaze: Kaze) {
    this[kaze].ryuukyokuMangan = false
  }

  tileRest(kaze: Kaze, suit: Suit, rank: number) {
    let rest = 4
    const players = [this.ton, this.nan, this.sha, this.pei]
    for (const player of players) {
      const tiles = [
        ...player.discards,
        ...player.chi.flat(),
        ...player.pon.flatMap(pon => pon.tiles),
        ...player.minkan.flat(),
        ...player.ankan.flat(),
      ]
      for (const tile of tiles) {
        if (tile.equals(suit, rank)) rest--
      }
    }
    for (const tile of this[kaze].tiles) {
      if (tile.equals(suit, rank)) rest--
    }
    const [dorahyoji] = this.dorahyoji
    for (const tile of dorahyoji) {
      if (tile.equals(suit, rank)) rest--
    }
    return rest
  }

  // this.kiru.from.seat === this.currentSeat => 自家刚打完牌
  // this.kiru.from.seat !== this.currentSeat => 等待自家打牌
  // 返回 null 则为不需要操作
  action(kaze: Kaze, isChankan?: boolean, isAnkanChankan?: boolean): Action {
    // 是否已经摸牌
    const mopai = !this.kiru || this.kiru.from.seat !== this.currentSeat
    if (mopai) {
      if (kaze !== this.currentSeat) return null
      const action: Action = { types: new Set() }
      if (this.firstTurnIntact) {
        const counts = group(this[kaze].tiles)
        const yaochu = [
          counts['man'][0], counts['man'][8],
          counts['so'][0], counts['so'][8],
          counts['pin'][0], counts['pin'][8],
          ...counts['kaze'], ...counts['sangen'],
        ].filter(tile => tile >= 1)
        if (yaochu.length >= 9) {
          action.types.add('ryuukyoku')
        }
      }
      // 最后一张牌的时候没有杠
      if (this.rest !== 0 && this.kanCount < 4) {
        const ankan = this.player.ankanTiles
        if (this[kaze].riichi) {
          const riichiAnkan = ankan.filter(ankan => {
            return this[kaze].riichi.decomposed.every(dec => {
              return dec.blocks.find(block => block.type === 'kotsu'
                && ankan[0].equals(block.suit, block.tiles[0]))
            })
          })
          if (riichiAnkan.length !== 0) {
            action.types.add('kan')
            action.ankanTiles = riichiAnkan
          }
        } else {
          if (ankan.length !== 0) {
            action.types.add('kan')
            action.ankanTiles = ankan
          }
        }
        const chakan = this.player.chakanTiles
        if (chakan.length !== 0) {
          if (this[kaze].riichi) throw new Error('unreachable')
          action.types.add('kan')
          action.chakanTiles = chakan
        }
      }
      if (this.player.discardTenpai && this.player.discardTenpai.length !== 0) {
        if (!this.player.riichi && this.player.naki === 0 && this.rest >= 4){
          action.types.add('riichi')
        }
        for (const [kiru, tp] of this.player.discardTenpai) {
          const canWin = tp.some(tileKind => compareTileKind(kiru, tileKind) === 0)
          if (canWin) {
            const [yakuResult, points] = yaku(this, this[kaze], null, true, false)
            if (canHora(yakuResult)) {
              action.hora = { yaku: yakuResult, points }
              action.types.add('tsumo')
              break
            }
          }
        }
      }
      action.types.add('dahai')
      return action
    } else {
      // 刚打出牌
      if (kaze === this.currentSeat) return null
      const action: Action = { types: new Set() }
      const waits = this[kaze].waits
      let tileKind: TileKind
      if (waits && (tileKind = waits.find(wait => this.kiru.equals(wait)))) {
        const [yakuResult, points] = yaku(this, this[kaze], this.kiru, false, isChankan)
        if (canHora(yakuResult) && !this[kaze].furiten && !this[kaze].dojunfuriten) {
          if (isChankan) {
            // 抢杠和国士无双抢暗杠
            if (!isAnkanChankan || (isAnkanChankan && (yakuResult.kokushiMusou || yakuResult.kokushiMusou13))) {
              action.hora = { yaku: yakuResult, points }
              action.types.add('ron')
            }
          } else {
            action.hora = { yaku: yakuResult, points }
            action.types.add('ron')
          }
        } else {
          // 和不了，振听
          this.minogashi(kaze)
        }
      }
      if (this.rest !== 0 && !this[kaze].riichi) {
        const pon = this[kaze].ponTiles
        if (pon.length !== 0) {
          action.types.add('pon')
          action.ponTiles = pon
        }
        const minkan = this[kaze].minkanTiles
        if (minkan.length !== 0 && this.kanCount < 4) {
          action.types.add('kan')
          action.minkanTiles = minkan
        }
        if (kaze === shimocha(this.currentSeat)) {
          const chi = this[kaze].chiTiles
          if (chi.length !== 0) {
            action.types.add('chi')
            action.chiTiles = chi
          }
        }
      }
      if (action.types.size === 0) {
        return null
      } else {
        action.types.add('cancel')
        return action
      }
    }
  }
}

interface Pon {
  tiles: Tile[]
  // 加杠
  chakan: boolean
}

export interface Riichi {
  double: boolean
  iipatsu: boolean
  decomposed: Decomposed[]
}

export class Player {
  chi: Tile[][]    = []
  pon: Pon[]       = []
  minkan: Tile[][] = []
  ankan: Tile[][]  = []
  // 牌河
  discards: Tile[] = []
  riichi: Riichi

  // 打牌时设置
  waits: TileKind[]
  // 摸牌时设置，打牌时清除
  discardTenpai: [dahai: TileKind, waits: TileKind[], canHora: boolean[]][]

  dojunfuriten = false
  // 已切的牌，用于计算舍张振听
  discardCounts = createEmptyCounts()

  ryuukyokuMangan = true

  constructor(
    public round: Round,
    public kaze: Kaze,
    public tiles: Tile[],
  ) {}

  calcShantenAndWaits(tiles?: Tile[]): [number, TileKind[]] {
    tiles ||= this.tiles
    const counts = group(tiles)
    const naki = this.naki + this.ankan.length
    return shanten(counts, naki)
  }

  calcShantenPerDiscard(): [TileKind, number, TileKind[]][] {
    const tileKind = uniqTileKinds(toTileKinds(this.tiles))
    return tileKind.map(tileKind => {
      const tiles = [...this.tiles]
      tiles.splice(tiles.findIndex(tile => tile.equals(tileKind)), 1)
      return [tileKind, ...this.calcShantenAndWaits(tiles)]
    })
  }

  // 鸣牌数量
  get naki() {
    return this.chi.length + this.pon.length + this.minkan.length
  }

  get chiTiles() {
    const current = this.round.kiru
    if (['sangen', 'kaze'].includes(current.suit)) {
      return []
    }
    const chizai: Tile[][] = []
    // 45<6>
    if (current.rank - 2 >= 1) {
      const first = this.tiles.filter((tile) => tile.equals(current.suit, current.rank - 2))
      const second = this.tiles.filter((tile) => tile.equals(current.suit, current.rank - 1))
      first.forEach((first) => second.forEach((second) => chizai.push([first, second])))
    }
    // 4<5>6
    if (current.rank - 1 >=1 && current.rank + 1 <= 9) {
      const first = this.tiles.filter((tile) => tile.equals(current.suit, current.rank - 1))
      const third = this.tiles.filter((tile) => tile.equals(current.suit, current.rank + 1))
      first.forEach((first) => third.forEach((third) => chizai.push([first, third])))
    }
    // <4>56
    if (current.rank + 2 >= 1) {
      const second = this.tiles.filter((tile) => tile.equals(current.suit, current.rank + 1))
      const third = this.tiles.filter((tile) => tile.equals(current.suit, current.rank + 2))
      second.forEach((second) => third.forEach((third) => chizai.push([second, third])))
    }
    return chizai
  }
  // 碰材
  get ponTiles() {
    const current = this.round.kiru
    const ponzai: Tile[][] = []
    const same = this.tiles.filter((tile) => tile.equals(current))
    if (same.length === 2) {
      ponzai.push(same)
    } else if (same.length === 3) {
      ponzai.push([same[0], same[1]], [same[0], same[2]], [same[1], same[2]])
    }
    return ponzai
  }
  // 明杠
  get minkanTiles() {
    const current = this.round.kiru
    const same = this.tiles.filter((tile) => tile.equals(current))
    return same.length === 3 ? [same] : []
  }
  // 暗杠
  get ankanTiles() {
    const tiles = [...this.tiles]
    const group: Tile[][] = []
    while (tiles.length !== 0) {
      const same: Tile[] = [tiles.shift()]
      let found: Tile
      do {
        const index = tiles.findIndex(tile => tile.equals(same[0]))
        found = index !== -1 ? tiles.splice(index, 1)[0] : null
        if (found) same.push(found)
      } while (found)
      group.push(same)
    }
    return group.filter(same => same.length === 4)
  }
  // 加杠
  get chakanTiles() {
    const result: Tile[] = []
    for (const pon of this.pon) {
      const tile = this.tiles.find(tile => tile.equals(pon.tiles[0]))
      if (tile) result.push(tile)
    }
    return result
  }
  // 舍张振听/立直振听
  get furiten() {
    if (!this.waits) return false
    return this.waits.some(wait => this.discardCounts[wait.suit][wait.rank - 1] > 0)
  }
}
