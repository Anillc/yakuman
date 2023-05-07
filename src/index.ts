import { chitoitsuShanten, kokushimusoShanten, normalShanten } from './tempai'
import { Pai, group, shuffle, toPaiArray, uniqPai } from './utils'

export type Kaze = 'ton' | 'nan' | 'sha' | 'pei'

export type TileType = 'pin' | 'so' | 'man' | 'kaze' | 'sangen'

export class Tile {
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

export class Mahjong {
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
    const uraDora: Tile[] = []
    for (let i = wanpai.length - 1; i > 0; i--) {
      if ((14 - i) % 2 !== 0) {
        dora.push(wanpai[i])
      } else {
        uraDora.push(wanpai[i])
      }
    }
    return [dora, uraDora]
  }

  // 打牌
  // 牌山没牌的时候返回 false
  dahai(tile: Tile): boolean {
    if (this.kaze === 'ton') this.jun++
    this.player.tiles.splice(this.player.tiles.indexOf(tile), 1)
    tile.from.jun = this.jun
    this.kiru = tile
    this.player.ho.push(tile)
    if (this.rest === 0) return false
    const kaze = shimocha(this.kaze)
    this[kaze].tiles.push(this.haiyama.shift())
    this.kaze = kaze
    return true
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
    player.tiles.push(this.haiyama.shift())
    this.kaze = kaze
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
    player.tiles.push(this.haiyama.shift())
    this.kaze = kaze
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
    player.tiles.push(this.haiyama.pop())
    this.kaze = kaze
    this.kanCount++
  }

  ankan(tiles: Tile[]) {
    tiles = [...tiles]
    for (const tile of tiles) {
      tile.from.jun = this.jun
      const index = this.player.tiles.indexOf(tile)
      this.player.tiles.splice(index, 1)
    }
    this.player.ankan.push(tiles)
    this.player.tiles.push(this.haiyama.pop())
    this.kanCount++
  }

  chakan(tile: Tile) {
    tile.from.jun = this.jun
    for (const pon of this.player.pon) {
      if (pon.tiles[0].equals(tile)) {
        pon.tiles.push(tile)
        pon.chakan = true
      }
    }
    this.player.tiles.push(this.haiyama.pop())
    this.kanCount++
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
}

interface Pon {
  tiles: Tile[]
  // 加杠
  chakan: boolean
}

export class Player {
  chi: Tile[][]    = []
  pon: Pon[]       = []
  minkan: Tile[][] = []
  ankan: Tile[][]  = []
  // 牌河
  ho: Tile[] = []
  riichi: boolean = false

  constructor(
    public mahjong: Mahjong,
    public kaze: Kaze,
    public tiles: Tile[],
  ) {}

  calcShanten13(tiles?: Tile[]): [number, Pai[]] {
    tiles ||= this.tiles
    const counts = group(tiles)
    const shanten: [number, Pai[]][] = []
    const naki = this.naki + this.ankan.length
    if (naki === 0) {
      shanten.push(chitoitsuShanten(counts))
      shanten.push(kokushimusoShanten(counts))
    }
    shanten.push(normalShanten(counts, naki))
    const result = shanten.reduce((acc, x) => {
      if (acc[0] < x[0]) return acc
      if (acc[0] > x[0]) return x
      return [x[0], [...acc[1], ...x[1]]]
    })
    return [result[0], uniqPai(result[1])]
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

  get chii() {
    const current = this.mahjong.kiru
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
  get ponzai() {
    const current = this.mahjong.kiru
    const ponzai: Tile[][] = []
    const same = this.tiles.filter((tile) => tile.equals(current))
    if (same.length === 2) {
      ponzai.push(same)
    } else if (same.length === 3) {
      ponzai.push([same[0], same[1]], [same[0], same[2]], [same[1], same[2]])
    }
    return ponzai
  }
  // 杠材
  get kanzai() {
    const current = this.mahjong.kiru
    const same = this.tiles.filter((tile) => tile.equals(current))
    return same.length === 3 ? [same] : []
  }
}

// 下家
function shimocha(kaze: Kaze): Kaze {
  switch (kaze) {
    case 'ton':
      return 'nan'
    case 'nan':
      return 'sha'
    case 'sha':
      return 'pei'
    case 'pei':
      return 'ton'
  }
}
