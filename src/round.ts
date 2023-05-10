import { Decomposed, decompose, shanten } from './tempai'
import { Counts, Pai, comparePai, createEmptyCounts, group, shimocha, shuffle, toPaiArray, uniqPai } from './utils'
import { canHora, yaku } from './yaku'

export type Kaze = 'ton' | 'nan' | 'sha' | 'pei'
export const kazes: Kaze[] = ['ton', 'nan', 'sha', 'pei']

export type Sangen = 'white' | 'green' | 'red'
export const sangens: Sangen[] = ['white', 'green', 'red']

export type TileType = 'pin' | 'so' | 'man' | 'kaze' | 'sangen'

export class Tile implements Pai {
  riichi = false
  from: {
    // 巡
    jun?: number
    kaze?: Kaze
  } = {}

  constructor(
    public type: TileType,
    public num: number,
    public red: boolean,
  ) {}

  equals(tile: Tile | Pai): boolean
  equals(type: TileType, num: number): boolean
  equals(...[arg1, arg2]: any[]) {
    if (typeof arg1 === 'string') {
      return this.type === arg1 && this.num === arg2
    } else {
      if (this === arg1) return true
      return arg1.type === this.type && arg1.num === this.num
    }
  }
}

export type ActionType = 
  | 'chi' | 'pon' | 'kan' | 'riichi' | 'ryuukyoku'
  | 'tsumo' | 'ron' | 'dapai' | 'cancel'
export interface Action {
  types: Set<ActionType>
  chiTiles?:    Tile[][]
  ponTiles?:    Tile[][]
  minkanTiles?: Tile[][]
  ankanTiles?:  Tile[][]
  chakanTiles?: Tile[]
}

export class Round {
  kanCount: number = 0
  haiyama: Tile[]

  ton: Player
  nan: Player
  sha: Player
  pei: Player
  kaze: Kaze = 'ton'

  // 巡
  jun: number = 0
  // 上一张被切的牌
  kiru: Tile = null

  chihoRyuukyokuDoubleRiichiSufurenda = true

  constructor (
    // 场风
    public bakaze: Kaze,
  ) {
    const tiles: Tile[] = []
    for (const type of ['man', 'so', 'pin'] satisfies TileType[]) {
      for (let i = 0; i < 9; i++) {
        if (i + 1 === 5) {
          tiles.push(new Tile(type, i + 1, true))
        } else {
          tiles.push(new Tile(type, i + 1, false))
        }
        for (let j = 0; j < 3; j++) {
          tiles.push(new Tile(type, i + 1, false))
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
    function setKaze(tiles: Tile[], kaze: Kaze) {
      for (const tile of tiles) {
        tile.from.kaze = kaze
      }
      return tiles
    }
    this.ton = new Player(this, 'ton', setKaze(tiles.splice(0, 14), 'ton'))
    this.nan = new Player(this, 'nan', setKaze(tiles.splice(0, 13), 'nan'))
    this.sha = new Player(this, 'sha', setKaze(tiles.splice(0, 13), 'sha'))
    this.pei = new Player(this, 'pei', setKaze(tiles.splice(0, 13), 'pei'))
    this.haiyama = tiles
  }

  get player(): Player {
    return this[this.kaze]
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
  mopai(keepJun?: boolean, kaze?: Kaze): boolean {
    kaze ||= shimocha(this.kaze)
    const tile = this.haiyama.shift()
    tile.from.kaze = kaze
    this[kaze].tiles.push(tile)
    this.kaze = kaze
    // 只有摸到并打出去才能算下一巡
    // 碰里面没有摸牌，故不会增加巡数
    if (!keepJun && kaze === 'ton') {
      this.jun++
      // 亲家一巡不会摸牌，故将会在第二巡破坏状态
      this.removeIppatsuChihoRyokyokuDoubleRiichiSufurenda()
    }
    const shanten = this.player.calcShanten14()
    const tempai = shanten.filter(([, shanten]) => shanten === 0)
    if (tempai.length !== 0) {
      this.player.tempai14 = tempai.map(tempai => [tempai[0], tempai[2]])
      return true
    }
    return false
  }

  // 打牌
  // TODO: 四风连打
  dahai(tile: Tile, riichi: boolean) {
    this.player.tiles.splice(this.player.tiles.indexOf(tile), 1)
    tile.from.jun = this.jun
    this.kiru = tile
    this.player.ho.push(tile)
    this.player.kiru[tile.type][tile.num - 1]++
    if (this.player.riichi) {
      this.player.riichi.iipatsu = false
    }
    if (this.player.dojunfuriten) {
      this.player.dojunfuriten = false
    }
    if (this.player.tempai14) {
      this.player.tempai13 = this.player.tempai14.find(([tempai]) => tile.equals(tempai))?.[1]
      if (riichi) {
        if (!this.player.tempai13 || this.player.naki !== 0) {
          throw new Error('unreachable')
        }
        tile.riichi = true
        this.player.riichi = {
          double: this.chihoRyuukyokuDoubleRiichiSufurenda,
          iipatsu: true,
          decomposed: decompose(group(this.player.tiles)),
        }
      }
    } else {
      this.player.tempai13 = null
    }
    this.player.tempai14 = null
  }

  // 吃、碰、明杠的 kaze 为上一次打牌的玩家
  // 暗杠、加杠的 kaze 为当前摸牌玩家

  chi(tiles: Tile[]) {
    tiles = [...tiles]
    const kaze = shimocha(this.kaze)
    const player = this[kaze]
    for (const tile of tiles) {
      tile.from.jun = this.jun
      const index = player.tiles.indexOf(tile)
      player.tiles.splice(index, 1)
    }
    this.player.ho.pop()
    tiles.push(this.kiru)
    player.chi.push(tiles)
    this.kaze = kaze
    this.removeIppatsuChihoRyokyokuDoubleRiichiSufurenda()
  }

  pon(kaze: Kaze, tiles: Tile[]) {
    tiles = [...tiles]
    const player = this[kaze]
    for (const tile of tiles) {
      tile.from.jun = this.jun
      const index = player.tiles.indexOf(tile)
      player.tiles.splice(index, 1)
    }
    this.player.ho.pop()
    tiles.push(this.kiru)
    player.pon.push({
      tiles,
      chakan: false,
    })
    this.kaze = kaze
    this.removeIppatsuChihoRyokyokuDoubleRiichiSufurenda()
  }

  minkan(kaze: Kaze, tiles: Tile[]) {
    tiles = [...tiles]
    const player = this[kaze]
    for (const tile of tiles) {
      tile.from.jun = this.jun
      const index = player.tiles.indexOf(tile)
      player.tiles.splice(index, 1)
    }
    this.player.ho.pop()
    tiles.push(this.kiru)
    player.minkan.push(tiles)

    this.mopai(true, kaze)
    this.kanCount++
    this.removeIppatsuChihoRyokyokuDoubleRiichiSufurenda()
  }

  ankan(tiles: Tile[]) {
    tiles = [...tiles]
    for (const tile of tiles) {
      tile.from.jun = this.jun
      const index = this.player.tiles.indexOf(tile)
      this.player.tiles.splice(index, 1)
    }
    this.player.ankan.push(tiles)

    this.mopai(true, this.kaze)
    this.kanCount++
    this.removeIppatsuChihoRyokyokuDoubleRiichiSufurenda()
  }

  chakan(tile: Tile) {
    tile.from.jun = this.jun
    for (const pon of this.player.pon) {
      if (pon.tiles[0].equals(tile)) {
        pon.tiles.push(tile)
        pon.chakan = true
      }
    }

    this.mopai(true, this.kaze)
    this.kanCount++
    this.removeIppatsuChihoRyokyokuDoubleRiichiSufurenda()
  }

  // 见逃
  minogashi(kaze: Kaze) {
    const player = this[kaze]
    player.dojunfuriten = true
  }

  removeIppatsuChihoRyokyokuDoubleRiichiSufurenda() {
    this.chihoRyuukyokuDoubleRiichiSufurenda = false
    for (const kaze of kazes) {
      if (this[kaze].riichi) {
        this[kaze].riichi.iipatsu = false
      }
    }
  }

  tileRest(kaze: Kaze, type: TileType, num: number) {
    let rest = 4
    const players = [this.ton, this.nan, this.sha, this.pei]
    for (const player of players) {
      const tiles = [
        ...player.ho,
        ...player.chi.flat(),
        ...player.pon.flatMap(pon => pon.tiles),
        ...player.minkan.flat(),
        ...player.ankan.flat(),
      ]
      for (const tile of tiles) {
        if (tile.equals(type, num)) rest--
      }
    }
    for (const tile of this[kaze].tiles) {
      if (tile.equals(type, num)) rest--
    }
    const [dorahyoji] = this.dorahyoji
    for (const tile of dorahyoji) {
      if (tile.equals(type, num)) rest--
    }
    return rest
  }

  // this.kiru.from.kaze === this.kaze => 自家刚打完牌
  // this.kiru.from.kaze !== this.kaze => 等待自家打牌
  // 返回 null 则为不需要操作
  action(kaze: Kaze): Action {
    // 是否已经摸牌
    // TODO: 九种九牌
    const mopai = this.kiru.from.kaze !== this.kaze
    if (mopai) {
      if (kaze !== this.kaze) return null
      const action: Action = { types: new Set() }
      // 最后一张牌的时候没有杠
      if (this.rest !== 0) {
        const ankan = this.player.ankanTiles
        if (ankan.length !== 0) {
          action.types.add('kan')
          action.ankanTiles = ankan
        }
        const chakan = this.player.chakanTiles
        if (chakan.length !== 0) {
          action.types.add('kan')
          action.chakanTiles = chakan
        }
      }
      if (this.player.tempai14.length !== 0) {
        if (this.player.naki === 0 && this.rest >= 4){
          action.types.add('riichi')
        }
        for (const [kiru, tp] of this.player.tempai14) {
          const pai = tp.find(pai => comparePai(kiru, pai) === 0)
          if (pai) {
            const yk = yaku(this, this.player, pai, true, false)
            if (canHora(yk[0])) {
              action.types.add('tsumo')
              break
            }
          }
        }
      }
      action.types.add('dapai')
      return action
    } else {
      // 刚打出牌
      if (kaze === this.kaze) return null
      const action: Action = { types: new Set() }
      const tempai = this[kaze].tempai13
      let pai: Pai
      if (tempai && (pai = tempai.find(pai => this.kiru.equals(pai)))) {
        const yk = yaku(this, this.player, pai, true, false)
        if (canHora(yk[0]) && !this[kaze].furiten) {
          action.types.add('ron')
        } else {
          // 和不了，振听
          this.minogashi(kaze)
        }
      }
      if (this.rest !== 0) {
        const pon = this[kaze].ponTiles
        if (pon.length !== 0) {
          action.types.add('pon')
          action.ponTiles = pon
        }
        const minkan = this[kaze].minkanTiles
        if (minkan.length !== 0) {
          action.types.add('kan')
          action.minkanTiles = minkan
        }
        if (kaze === shimocha(this.kaze)) {
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
  ho: Tile[] = []
  riichi: Riichi

  // 打牌时设置
  tempai13: Pai[]
  // 摸牌时设置，打牌时清除
  tempai14: [Pai, Pai[]][]

  dojunfuriten = false
  // 已切的牌，用于计算舍张振听
  kiru = createEmptyCounts()

  constructor(
    public round: Round,
    public kaze: Kaze,
    public tiles: Tile[],
  ) {}

  calcShanten13(tiles?: Tile[]): [number, Pai[]] {
    tiles ||= this.tiles
    const counts = group(tiles)
    const naki = this.naki + this.ankan.length
    return shanten(counts, naki)
  }

  calcShanten14(): [Pai, number, Pai[]][] {
    const pai = uniqPai(toPaiArray(this.tiles))
    return pai.map(pai => {
      const tiles = [...this.tiles]
      tiles.splice(tiles.findIndex(tile => tile.equals(pai)), 1)
      return [pai, ...this.calcShanten13(tiles)]
    })
  }

  // 鸣牌数量
  get naki() {
    return this.chi.length + this.pon.length + this.minkan.length
  }

  get chiTiles() {
    const current = this.round.kiru
    if (['sangen', 'kaze'].includes(current.type)) {
      return []
    }
    const chizai: Tile[][] = []
    // 45<6>
    if (current.num - 2 >= 1) {
      const first = this.tiles.filter((tile) => tile.equals(current.type, current.num - 2))
      const second = this.tiles.filter((tile) => tile.equals(current.type, current.num - 1))
      first.forEach((first) => second.forEach((second) => chizai.push([first, second])))
    }
    // 4<5>6
    if (current.num - 1 >=1 && current.num + 1 <= 9) {
      const first = this.tiles.filter((tile) => tile.equals(current.type, current.num - 1))
      const third = this.tiles.filter((tile) => tile.equals(current.type, current.num + 1))
      first.forEach((first) => third.forEach((third) => chizai.push([first, third])))
    }
    // <4>56
    if (current.num + 2 >= 1) {
      const second = this.tiles.filter((tile) => tile.equals(current.type, current.num + 1))
      const third = this.tiles.filter((tile) => tile.equals(current.type, current.num + 2))
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
    if (!this.tempai13) return false
    return this.tempai13.some(tempai => this.kiru[tempai.type][tempai.num - 1] > 0)
  }
}
