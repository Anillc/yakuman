import { Decomposed, decompose, shanten } from './tenpai'
import { MahjongError, TileKind, compareTileKind, createEmptyCounts, group, nextId, shimocha, shuffle, toTileKinds, uniqTileKinds } from './utils'
import { HoraResult, canHora, yaku } from './yaku'

export type Kaze = 'ton' | 'nan' | 'sha' | 'pei'
export const kazes: Kaze[] = ['ton', 'nan', 'sha', 'pei']

// 玩家编号（0-3）：玩家本身用 id 识别；自风随庄家轮换，见 seatWind()
export type PlayerId = 0 | 1 | 2 | 3
export const playerIds: PlayerId[] = [0, 1, 2, 3]

export type Sangen = 'white' | 'green' | 'red'
export const sangens: Sangen[] = ['white', 'green', 'red']

export type Suit = 'pin' | 'so' | 'man' | 'kaze' | 'sangen'
export const suits: Suit[] = ['pin', 'so', 'man', 'kaze', 'sangen']

export class Tile implements TileKind {
  riichi = false
  // 这张牌是摸切打出去的（false = 手切；吃碰之后的打牌也算手切）
  tsumogiri = false
  // 这张牌是从谁那里来的：摸到的就是摸牌的人，打出去之后就是放铳/被鸣的那一家
  playerId?: PlayerId

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
  | 'tsumo' | 'ron' | 'tedashi' | 'tsumogiri' | 'pass'
export interface Action {
  types: Set<ActionType>
  chiTiles?:    Tile[][]
  ponTiles?:    Tile[][]
  // 可杠的候选（明杠/暗杠/加杠合并在一起，看 type 区分）
  kans?:        Kan[]
  hora?:        HoraResult
}

export class Round {
  kanCount: number = 0
  haiyama: Tile[]

  // 四家（下标就是玩家编号）
  players: Player[]
  currentId: PlayerId = 0

  // 巡
  turn: number = 0
  // 上一张被切/被鸣的牌（摸牌后清空）
  kiru: Tile = null
  // 这一张是杠后的补牌（岭上开花用），打牌后清空
  rinshan = false

  firstTurnIntact = true
  // null -> 还没有打牌
  // TileKind -> 已经被打的风牌
  // false -> 没有四风连打
  // true -> 四风连打
  sufurenda: TileKind | boolean = null

  constructor (
    // 场风
    public bakaze: Kaze,
    // 庄家（本局是谁坐庄，用玩家编号）
    public dealer: PlayerId,
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
    function setPlayerId(tiles: Tile[], id: PlayerId) {
      for (const tile of tiles) {
        tile.playerId = id
      }
      return tiles
    }
    this.players = playerIds.map(id => new Player(this, id, setPlayerId(tiles.splice(0, 13), id)))
    this.haiyama = tiles
    this.mopai(true, this.dealer)
    // 配牌就听牌的人也要能荣和第一张弃牌，所以非庄家的听牌张先算出来。
    // （庄家这时手里是 14 张，"打完之后听什么"要等他打牌时才知道，dahai 里会算）
    for (const player of this.players) {
      if (player.id === this.dealer) continue
      const [shanten, waits] = player.calcShantenAndWaits()
      player.waits = shanten === 0 ? waits : null
    }
  }

  // 自风：庄家为东，庄家的下家为南、再下家为西、对家为北
  seatWind(id: PlayerId): Kaze {
    return kazes[(id - this.dealer + 4) % 4]
  }

  get player(): Player {
    return this.players[this.currentId]
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
    // 开局的宝牌/里宝牌各 1 张，每杠多翻 1 张
    const revealed = 1 + this.kanCount
    return [dora.slice(0, revealed), uradora.slice(0, revealed)]
  }

  // 如果没有提供 id，则轮到下家并摸牌
  // 返回 true 则为听牌
  mopai(keepTurn?: boolean, id?: PlayerId, isRinshan?: boolean): boolean {
    id ??= nextId(this.currentId)
    const tile = this.haiyama.shift()
    tile.playerId = id
    this.players[id].tiles.push(tile)
    // 摸牌后上一张打出的牌就作废了（否则杠后补牌会被当成"刚打过牌"）
    this.kiru = null
    this.rinshan = !!isRinshan
    this.currentId = id
    // 巡目以庄家为起点：庄家摸第二次就算进入下一巡；吃碰不摸牌，所以不会推进巡目
    if (!keepTurn && id === this.dealer) {
      this.turn++
      // 第一巡的第一次摸牌 keepTurn 为 true，所以不会在这里破坏初巡役
      this.breakFirstTurnFlags()
    }
    return this.updateTenpaiCache()
  }

  // 这一家"打哪张能听牌"的缓存：摸牌后、吃碰后重算一次，打牌后清空。
  // 纯性能缓存：一次完整向听分解约 10ms，而一个回合内有三处要用同一份结果
  // （mopai 判断是否听牌、action 的立直/自摸判定、dahai 里算 player.waits）。
  // 正确性不依赖它 —— 对外请用 player.tenpaiDiscards() / player.waitsAfterDiscard()，那两个总是现算。
  // TODO: 以后做性能优化时可以重新评估：要么去掉这个缓存、让三处各自现算（状态更少），
  //       要么把向听计算本身做快（那时缓存就没必要了）。
  private tenpaiCache: { discard: TileKind, waits: TileKind[] }[] = null

  private updateTenpaiCache(): boolean {
    const options = this.player.tenpaiDiscards()
    this.tenpaiCache = options.length === 0 ? null : options
    return options.length !== 0
  }

  // 打牌
  dahai(tile: Tile, riichi: boolean) {
    const index = this.player.tiles.indexOf(tile)
    if (index === -1) throw new MahjongError('tile-not-in-hand', '打牌: 这张牌不在手牌里')
    // 摸切 = 打出的就是刚摸到的那张（吃碰之后的打牌算手切）
    tile.tsumogiri = !this.kiru && index === this.player.tiles.length - 1
    this.player.tiles.splice(index, 1)
    this.kiru = tile
    this.player.discards.push(tile)
    this.player.discardCounts[tile.suit][tile.rank - 1]++
    if (this.player.riichi) {
      this.player.riichi.iipatsu = false
    }
    // 立直后见逃会一直振听（立直振听）；非立直时的同巡振听在自家打牌后解除
    if (this.player.dojunfuriten && !this.player.riichi) {
      this.player.dojunfuriten = false
    }
    const isTerminal = ['man', 'so', 'pin'].includes(tile.suit) && (tile.rank === 1 || tile.rank === 9)
    const isHonor = ['kaze', 'sangen'].includes(tile.suit)
    if (!isTerminal && !isHonor) {
      this.removeRyuukyokuMangan(this.currentId)
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
      // 四风连打：四家都打出同一张风牌（最后一家是 3 号玩家）
      if (this.sufurenda && this.currentId === 3) {
        this.sufurenda = true
      }
    }
    if (this.tenpaiCache) {
      this.player.waits = this.tenpaiCache.find(option => compareTileKind(option.discard, tile) === 0)?.waits
      if (riichi) {
        if (!this.player.waits || this.player.naki !== 0) {
          throw new MahjongError('unreachable', '立直: 打这张之后不听牌（应该由调用方先检查）')
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
      if (riichi) throw new MahjongError('unreachable', '立直: 这一手不能立直（应该由调用方先检查）')
    }
    this.tenpaiCache = null
    // 岭上标记只描述刚摸到的那张牌
    this.rinshan = false
  }

  // chi/pon/minkan 的 id 是鸣牌的那一家（玩家编号）（吃只有下家能吃，chi 内部自己算）
  // ankan/chakan 用当前摸牌玩家，也就是 this.player

  chi(tiles: Tile[]) {
    tiles = [...tiles]
    const id = nextId(this.currentId)
    const player = this.players[id]
    for (const tile of tiles) {
      const index = player.tiles.indexOf(tile)
      if (index === -1) throw new MahjongError('tile-not-in-hand', '吃: 这张牌不在手牌里')
      player.tiles.splice(index, 1)
    }
    this.player.discards.pop()
    tiles.push(this.kiru)
    // 顺子按升序存放：三色同顺/一气通贯靠比较 tiles 数组判断
    player.chi.push(tiles.sort(compareTileKind))
    this.currentId = id
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(this.kiru.playerId)
    // 吃没有摸牌，这里补算切牌后的听牌张
    this.updateTenpaiCache()
  }

  pon(id: PlayerId, tiles: Tile[]) {
    tiles = [...tiles]
    const player = this.players[id]
    for (const tile of tiles) {
      const index = player.tiles.indexOf(tile)
      if (index === -1) throw new MahjongError('tile-not-in-hand', '碰: 这张牌不在手牌里')
      player.tiles.splice(index, 1)
    }
    this.player.discards.pop()
    tiles.push(this.kiru)
    player.pon.push({
      tiles,
      chakan: false,
    })
    this.currentId = id
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(this.kiru.playerId)
    // 碰没有摸牌，这里补算切牌后的听牌张
    this.updateTenpaiCache()
  }

  minkan(id: PlayerId, tiles: Tile[]) {
    tiles = [...tiles]
    const player = this.players[id]
    for (const tile of tiles) {
      const index = player.tiles.indexOf(tile)
      if (index === -1) throw new MahjongError('tile-not-in-hand', '明杠: 这张牌不在手牌里')
      player.tiles.splice(index, 1)
    }
    this.player.discards.pop()
    tiles.push(this.kiru)
    player.minkan.push(tiles)

    // 摸牌会把 kiru 清空，先记住放铳者是谁
    const discarder = this.kiru.playerId
    this.mopai(true, id, true)
    this.kanCount++
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(discarder)
  }

  // 暗杠与加杠的摸牌在 Mahjong 类里，因为如果被荣和则杠不成立
  ankan(tiles: Tile[]) {
    tiles = [...tiles]
    for (const tile of tiles) {
      const index = this.player.tiles.indexOf(tile)
      if (index === -1) throw new MahjongError('tile-not-in-hand', '暗杠: 这张牌不在手牌里')
      this.player.tiles.splice(index, 1)
    }
    this.player.ankan.push(tiles)
    this.kiru = tiles[0]
    this.kanCount++
    this.breakFirstTurnFlags()
  }

  chakan(tile: Tile) {
    const pon = this.player.pon.find(pon => pon.tiles[0].equals(tile))
    if (!pon) throw new MahjongError('not-candidate', '加杠: 这张牌没有对应的碰')
    if (!this.player.tiles.includes(tile)) throw new MahjongError('tile-not-in-hand', '加杠: 这张牌不在手牌里')
    if (pon.chakan) throw new MahjongError('not-candidate', '加杠: 这组碰已经加杠过了')
    this.player.tiles.splice(this.player.tiles.indexOf(tile), 1)
    pon.tiles.push(tile)
    pon.chakan = true
    this.kiru = tile
    this.kanCount++
    this.breakFirstTurnFlags()
  }

  // 见逃
  minogashi(id: PlayerId) {
    const player = this.players[id]
    player.dojunfuriten = true
  }

  // 鸣牌会破坏一发、地和、九种九牌、双立直、四风连打
  breakFirstTurnFlags() {
    this.firstTurnIntact = false
    this.sufurenda = false
    for (const id of playerIds) {
      if (this.players[id].riichi) {
        this.players[id].riichi.iipatsu = false
      }
    }
  }

  removeRyuukyokuMangan(id: PlayerId) {
    this.players[id].ryuukyokuMangan = false
  }

  tileRest(id: PlayerId, suit: Suit, rank: number) {
    let rest = 4
    const players = this.players
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
    for (const tile of this.players[id].tiles) {
      if (tile.equals(suit, rank)) rest--
    }
    const [dorahyoji] = this.dorahyoji
    for (const tile of dorahyoji) {
      if (tile.equals(suit, rank)) rest--
    }
    return rest
  }

  // kiru.playerId === currentSeat：这一家就是最后打牌的人，已经打过牌了，在等别人响应
  // 否则：这一家还没打牌（刚摸完牌，或刚吃/碰完），由他们打牌
  // 返回 null 则为不需要操作
  action(id: PlayerId, isChankan?: boolean, isAnkanChankan?: boolean): Action {
    const beforeDiscard = !this.kiru || this.kiru.playerId !== this.currentId
    if (beforeDiscard) {
      if (id !== this.currentId) return null
      const action: Action = { types: new Set() }
      if (this.firstTurnIntact) {
        const counts = group(this.players[id].tiles)
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
        if (this.players[id].riichi) {
          // 立直中只能暗杠"不会改听牌"的那几组（同巡那张摸到的牌能不能杠由向听/分解判断）
          const riichiAnkan = ankan.filter(tiles => {
            return this.players[id].riichi.decomposed.every(dec => {
              return dec.blocks.find(block => block.type === 'kotsu'
                && tiles[0].equals(block.suit, block.tiles[0]))
            })
          })
          if (riichiAnkan.length !== 0) {
            action.kans = riichiAnkan.map(tiles => ({ type: 'ankan', tiles }))
          }
        } else {
          if (ankan.length !== 0) {
            action.kans = ankan.map(tiles => ({ type: 'ankan', tiles }))
          }
        }
        const chakan = this.player.chakanTiles
        if (chakan.length !== 0) {
          if (this.players[id].riichi) throw new MahjongError('unreachable', '加杠: 立直中不能加杠')
          action.kans = [
            ...action.kans ?? [],
            ...chakan.map((tile): Kan => ({ type: 'chakan', tiles: [tile] })),
          ]
        }
        if (action.kans) {
          action.types.add('kan')
        }
      }
      if (this.tenpaiCache && this.tenpaiCache.length !== 0) {
        // kiru 为空说明这一手是真的摸牌（吃、碰后不是），只有摸牌才能立直/自摸
        const justDrew = !this.kiru
        if (justDrew && !this.player.riichi && this.player.naki === 0 && this.rest >= 4){
          action.types.add('riichi')
        }
        if (justDrew) {
          for (const option of this.tenpaiCache) {
            const canWin = option.waits.some(wait => compareTileKind(option.discard, wait) === 0)
            if (canWin) {
              const hora = yaku(this, this.players[id], null, true, false)
              if (canHora(hora.yaku)) {
                action.hora = hora
                action.types.add('tsumo')
                break
              }
            }
          }
        }
      }
      // 打牌：吃过/碰过之后没有刚摸的牌，只能手切；立直中只能摸切
      const justDrew = !this.kiru
      if (!justDrew || !this.player.riichi) action.types.add('tedashi')
      if (justDrew) action.types.add('tsumogiri')
      return action
    } else {
      // 刚打出牌
      if (id === this.currentId) return null
      const action: Action = { types: new Set() }
      const waits = this.players[id].waits
      let tileKind: TileKind
      if (waits && (tileKind = waits.find(wait => this.kiru.equals(wait)))) {
        const hora = yaku(this, this.players[id], this.kiru, false, isChankan)
        if (canHora(hora.yaku) && !this.players[id].furiten && !this.players[id].dojunfuriten) {
          if (isChankan) {
            // 抢杠和国士无双抢暗杠
            if (!isAnkanChankan || (isAnkanChankan && (hora.yaku.kokushiMusou || hora.yaku.kokushiMusou13))) {
              action.hora = hora
              action.types.add('ron')
            }
          } else {
            action.hora = hora
            action.types.add('ron')
          }
        } else if (canHora(hora.yaku)) {
          // 能和但被振听挡住（或见逃）→ 记同巡振听；无役不算见逃
          this.minogashi(id)
        }
      }
      // 杠（暗杠/加杠）之后只可能被抢杠，不能吃碰：kiru 这时是一张杠牌
      if (!isChankan && this.rest !== 0 && !this.players[id].riichi) {
        const pon = this.players[id].ponTiles
        if (pon.length !== 0) {
          action.types.add('pon')
          action.ponTiles = pon
        }
        const minkan = this.players[id].minkanTiles
        if (minkan.length !== 0 && this.kanCount < 4) {
          action.types.add('kan')
          action.kans = minkan.map(tiles => ({ type: 'minkan', tiles }))
        }
        if (id === nextId(this.currentId)) {
          const chi = this.players[id].chiTiles
          if (chi.length !== 0) {
            action.types.add('chi')
            action.chiTiles = chi
          }
        }
      }
      if (action.types.size === 0) {
        return null
      } else {
        action.types.add('pass')
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

// 可杠的候选：tiles 是"要用掉的手牌"
// - minkan 明杠：手里 3 张 + 别人打出的那张
// - ankan  暗杠：手里 4 张
// - chakan 加杠：手里 1 张，加到已有的碰上
export interface Kan {
  type: 'minkan' | 'ankan' | 'chakan'
  tiles: Tile[]
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

  dojunfuriten = false
  // 已切的牌，用于计算舍张振听
  discardCounts = createEmptyCounts()

  ryuukyokuMangan = true

  constructor(
    public round: Round,
    // 玩家的编号（ton/nan/sha/pei 只是名字，不代表自风；自风请用 round.seatWind(id)）
    public id: PlayerId,
    public tiles: Tile[],
  ) {}

  calcShantenAndWaits(tiles?: Tile[]): [number, TileKind[]] {
    tiles ||= this.tiles
    const counts = group(tiles)
    const naki = this.naki + this.ankan.length
    return shanten(counts, naki)
  }

  // 打每张牌之后的向听（含未听牌的切法），按需计算
  shantenPerDiscard(): { discard: TileKind, shanten: number, waits: TileKind[] }[] {
    const kinds = uniqTileKinds(toTileKinds(this.tiles))
    return kinds.map(discard => {
      const tiles = [...this.tiles]
      tiles.splice(tiles.findIndex(tile => tile.equals(discard)), 1)
      const [shanten, waits] = this.calcShantenAndWaits(tiles)
      return { discard, shanten, waits }
    })
  }

  // 打哪张能听牌（听牌张一栏为空 = 无役听牌也算听牌；"有没有役"请另外查）
  tenpaiDiscards(): { discard: TileKind, waits: TileKind[] }[] {
    return this.shantenPerDiscard()
      .filter(option => option.shanten === 0)
      .map(({ discard, waits }) => ({ discard, waits }))
  }

  // 打这张之后听什么；不听牌则 null
  waitsAfterDiscard(tileKind: TileKind): TileKind[] | null {
    return this.tenpaiDiscards()
      .find(option => compareTileKind(option.discard, tileKind) === 0)?.waits ?? null
  }

  // 鸣牌数量（暗杠不算，算向听/和牌时要另外加 player.ankan.length）
  get naki() {
    return this.chi.length + this.pon.length + this.minkan.length
  }

  // 本局的自风（随庄家轮换）
  get seatWind(): Kaze {
    return this.round.seatWind(this.id)
  }

  // 本局是不是庄家
  get isDealer(): boolean {
    return this.round.dealer === this.id
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
    if (current.rank + 2 <= 9) {
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
  // （以下是三种杠各自的原始候选；ctx 会把它们合成 ctx.kans）
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
  // 舍张振听：自家牌河里已经有了听牌张（立直后见逃的持续振听见 dojunfuriten）
  get furiten() {
    if (!this.waits) return false
    return this.waits.some(wait => this.discardCounts[wait.suit][wait.rank - 1] > 0)
  }
}
