
export type Kaze = 'ton' | 'nan' | 'sha' | 'pei'

export type TileType = 'pin' | 'so' | 'man' | 'kaze' | 'sangen'

export class Tile {
  riichi = false
  from: {
    // 巡
    jun?: number
    kaze: Kaze
  }

  constructor(
    public type: TileType,
    public num: number,
    public red: boolean,
    kaze: Kaze,
  ) {
    this.from = { kaze }
  }

  equals(tile: Tile): boolean
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
  // 场风
  bakaze: Kaze
  kanCount: number
  haiyama: Tile[]

  ton: Player
  nan: Player
  sha: Player
  pei: Player
  kaze: Kaze

  // 巡
  jun: number
  // 上一张被切的牌
  kiru: Tile

  constructor () {}

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

  tileRest(tile: Tile) {
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
      for (const hai of tiles) {
        if (hai.equals(tile)) rest--
      }
    }
    const [dorahyoji] = this.dorahyoji
    for (const hai of dorahyoji) {
      if (hai.equals(tile)) rest--
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
  kaze: Kaze
  tiles: Tile[]
  chi: Tile[][]
  pon: Pon[]
  minkan: Tile[][]
  ankan: Tile[][]
  // 牌河
  ho: Tile[]
  riichi: boolean

  mahjong: Mahjong

  get chizai() {
    const current = this.mahjong.kiru
    if (['sangen', 'kaze'].includes(current.type)) {
      return []
    }
    const chizai: Tile[][] = []
    // 45<6>
    if (current.num - 2 >= 1) {
      const first = this.tiles.filter((tile) => tile.num === current.num - 2)
      const second = this.tiles.filter((tile) => tile.num === current.num - 1)
      first.forEach((first) => second.forEach((second) => chizai.push([first, second])))
    }
    // 4<5>6
    if (current.num - 1 >=1 && current.num + 1 <= 9) {
      const first = this.tiles.filter((tile) => tile.num === current.num - 1)
      const third = this.tiles.filter((tile) => tile.num === current.num + 1)
      first.forEach((first) => third.forEach((third) => chizai.push([first, third])))
    }
    // <4>56
    if (current.num + 2 >= 1) {
      const second = this.tiles.filter((tile) => tile.num === current.num + 1)
      const third = this.tiles.filter((tile) => tile.num === current.num + 2)
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
  // // 听牌
  // get tempai(): Record<Tile, Tile[]> {

  // }
}

// 下家
function shimocha(kaze: Kaze): Kaze {
  switch (this.kaze) {
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
