// 一局的状态机（牌山、手牌、副露、动作候选）。下面注释里的「第N章第M条」都出自
// M.League 公式戦ルール：https://m-league.jp/about （页面里的 rule 段，第1〜9章）
// 规则开关与整套规则档见 profile.ts
import { shanten, waits } from './tenpai.js'
import { Counts, MahjongError, TileKind, cloneCounts, compareTileKind, createEmptyCounts, group, nextId, shuffle, toMPSZ, toTileKinds, uniqTileKinds } from './utils.js'
import { HoraResult, canHora, yaku } from './yaku.js'
import { RuleProfile, defaultProfile } from './profile.js'

export type Kaze = 'ton' | 'nan' | 'sha' | 'pei'
export const kazes: Kaze[] = ['ton', 'nan', 'sha', 'pei']

// 玩家编号（0-3）：玩家本身用 id 识别；自风随庄家轮换，见 seatWind()
export type PlayerId = 0 | 1 | 2 | 3
export const playerIds: PlayerId[] = [0, 1, 2, 3]

export type Sangen = 'white' | 'green' | 'red'
export const sangens: Sangen[] = ['white', 'green', 'red']

// 包（責任払い）的对象役满：大三元 / 大四喜 / 四槓子
export type PaoYaku = 'daisangen' | 'daisuushii' | 'suukantsu'

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
  // 食い替え：这几张现在不能打出去（刚吃/碰进来的那张，以及吃的时候同筋的另一端）
  kuikae?:      TileKind[]
  hora?:        HoraResult
}

export class Round {
  kanCount: number = 0
  // 正在"预备"的暗杠/加杠（等抢杠窗口走完才算成立，见 establishKan）
  private pendingKan?: { type: 'ankan' | 'chakan', playerId: PlayerId, tiles: Tile[] }
  // 活牌山（摸牌顺序）。王牌不在这里，见 wanpai
  haiyama: Tile[]
  // 王牌（末尾 14 张，不会摸到，只用来当岭上牌和宝牌指示牌）。
  // 从牌尾数每两张一幢：第 1・2 幢（下标 13〜10）是岭上牌，
  // 第 3 幢上段（[9]）是本宝牌指示牌，第 4〜7 幢上段（[7][5][3][1]）是杠宝牌指示牌，下段是各自的里宝牌
  wanpai: Tile[]

  // 四家（下标就是玩家编号）
  players: Player[]
  currentId: PlayerId = 0

  turn: number = 0
  // 上一张被切/被鸣的牌（摸牌后清空）。没牌 = 现在是摸牌状态，所以是问号；
  // 谁切的记在这张牌的 playerId 上（打牌时不改，被鸣牌时就是喂牌的那家）
  kiru?: Tile

  // 刚被切/被鸣的那张牌。"刚有人打过牌"的状态下才有 —— 判定用 this.kiru，取值用这个
  get discarded(): Tile {
    if (!this.kiru) throw new MahjongError('unreachable', '现在没有弃牌')
    return this.kiru
  }

  // 切这张牌（或喂这张牌）的人
  get discarder(): PlayerId {
    const playerId = this.discarded.playerId
    if (playerId === undefined) throw new MahjongError('unreachable', '这张弃牌没记是谁打的')
    return playerId
  }

  // 这一张是杠后的补牌（岭上开花用），打牌后清空
  rinshan = false

  firstTurnIntact = true

  // 四风连打：第一巡里四家都打出同一张风牌。只看牌河就能算出来，不用另外记状态
  get sufurenda(): boolean {
    if (!this.firstTurnIntact) return false
    const [first, ...rest] = this.players.map(player => player.discards[0])
    if (!first || first.suit !== 'kaze') return false
    return rest.every(tile => tile?.equals(first))
  }

  // 规则档（一局之内不变）。直接 new Round 时默认 mLeague，走 Mahjong 的话由 profile / 选项决定
  readonly profile: RuleProfile

  constructor (
    // 场风
    public bakaze: Kaze,
    public dealer: PlayerId,
    tiles?: Tile[],
    profile: RuleProfile = defaultProfile,
  ) {
    this.profile = profile
    if (!tiles) {
      tiles = []
      for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
        for (let i = 0; i < 9; i++) {
          // 赤牌枚数：3 = 万/索/筒各一张（默认），4 = 再加一张赤 5m
          const red = i + 1 !== 5 ? 0 : suit === 'man' && profile.redFives === 4 ? 2 : profile.redFives === 0 ? 0 : 1
          for (let j = 0; j < red; j++) tiles.push(new Tile(suit, i + 1, true))
          for (let j = 0; j < 4 - red; j++) tiles.push(new Tile(suit, i + 1, false))
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
    // 到这儿一定已经有牌山了（没传的话上面刚生成），固定成 const 好让下面的回调里类型不丢
    const wall: Tile[] = tiles
    this.players = playerIds.map(id => new Player(this, id, setPlayerId(wall.splice(0, 13), id)))
    // 末尾 14 张是王牌（岭上牌 + 宝牌指示牌），先切出来单独放
    this.wanpai = wall.splice(-14)
    this.haiyama = wall
    this.mopai(true, this.dealer)
    // 配牌就听牌的人也要能荣和第一张弃牌，所以非庄家的听牌张先算出来。
    // （庄家这时手里是 14 张，"打完之后听什么"要等他打牌时才知道，dahai 里会算）
    for (const player of this.players) {
      if (player.id === this.dealer) continue
      const [shanten, waits] = player.calcShantenAndWaits()
      player.waits = shanten === 0 ? waits : undefined
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
    return this.haiyama.length
  }

  // 宝牌、里宝牌指示牌
  get dorahyoji(): [Tile[], Tile[]] {
    // M.League 第2章第6条：本宝牌指示牌在王牌第 3 幢上段，一个杠翻第 4 幢、四个杠翻到第 7 幢
    const dora = [9, 7, 5, 3, 1].map(index => this.wanpai[index])
    const uradora = [8, 6, 4, 2, 0].map(index => this.wanpai[index])
    // 开局的宝牌/里宝牌各 1 张，每杠多翻 1 张
    const revealed = 1 + this.kanCount
    return [dora.slice(0, revealed), uradora.slice(0, revealed)]
  }

  // 如果没有提供 id，则轮到下家并摸牌
  mopai(keepTurn?: boolean, id?: PlayerId, isRinshan?: boolean) {
    id ??= nextId(this.currentId)
    // 岭上牌从王牌最尾幢上段起按顺序取（M.League 第2章第5条），所以从 wanpai 末尾拿
    const tile = isRinshan ? this.wanpai.pop() : this.haiyama.shift()
    if (!tile) throw new MahjongError('unreachable', '摸牌: 牌山已经空了')
    tile.playerId = id
    this.players[id].tiles.push(tile)
    // 摸牌后上一张打出的牌就作废了（否则杠后补牌会被当成"刚打过牌"）
    this.kiru = undefined
    this.rinshan = !!isRinshan
    this.currentId = id
    // 巡目以庄家为起点：庄家摸第二次就算进入下一巡；吃碰不摸牌，所以不会推进巡目
    if (!keepTurn && id === this.dealer) {
      this.turn++
      // 第一巡的第一次摸牌 keepTurn 为 true，所以不会在这里破坏初巡役
      this.breakFirstTurnFlags()
    }
  }

  dahai(tile: Tile, riichi = false) {
    const index = this.player.tiles.indexOf(tile)
    if (index === -1) throw new MahjongError('tile-not-in-hand', '打牌: 这张牌不在手牌里')
    if (this.player.kuikae.some(kind => tile.equals(kind))) {
      const list = this.player.kuikae.map(kind => toMPSZ([kind])).join('/')
      throw new MahjongError('kuikae', `食い替え: 刚鸣进来的牌不能马上打出去（${list}）`)
    }
    // 打完之后听什么，要在把这张牌从手里拿掉之前算（waitsAfterDiscard 看的是"打掉它之后的 13 张"）。
    // 不听牌是 undefined（判断用真值），0 张可抽的听牌是空数组、照样算听牌
    const waits = this.player.waitsAfterDiscard(tile)
    this.player.kuikae = []
    // 摸切 = 打出的就是刚摸到的那张（吃碰之后的打牌算手切）
    tile.tsumogiri = !this.kiru && index === this.player.tiles.length - 1
    this.player.tiles.splice(index, 1)
    tile.playerId = this.currentId            // 打出去之后，"这张牌来自谁"就是打牌的那一家
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
    this.player.waits = waits
    if (riichi) {
      // 0 张可抽的听牌在不算听牌的档里同样不能立直（第3章第11条）
      if (!waits || this.player.naki !== 0 || (waits.length === 0 && !this.profile.zeroWaitTenpai)) {
        throw new MahjongError('unreachable', '立直: 打这张之后不听牌（应该由调用方先检查）')
      }
      tile.riichi = true
      this.player.riichi = {
        double: this.firstTurnIntact,
        iipatsu: true,
      }
    }
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
    const called = this.discarded
    const discarder = this.discarder
    tiles.push(called)
    // 顺子按升序存放：三色同顺/一气通贯靠比较 tiles 数组判断
    player.chi.push(tiles.sort(compareTileKind))
    player.kuikae = chiKuikae(called, player.chi[player.chi.length - 1])
    this.currentId = id
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(discarder)
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
    const called = this.discarded
    const discarder = this.discarder
    tiles.push(called)
    player.pon.push({
      tiles,
      chakan: false,
    })
    player.kuikae = [{ suit: called.suit, rank: called.rank }]
    this.registerPao(player, discarder, { suit: called.suit, kan: false })
    this.currentId = id
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(discarder)
  }

  // drawRinshan = false 时只做鸣杠本身，岭上牌由调用方补（要先判四槓散了，见 Mahjong.kan）
  minkan(id: PlayerId, tiles: Tile[], drawRinshan = true) {
    tiles = [...tiles]
    const player = this.players[id]
    for (const tile of tiles) {
      const index = player.tiles.indexOf(tile)
      if (index === -1) throw new MahjongError('tile-not-in-hand', '明杠: 这张牌不在手牌里')
      player.tiles.splice(index, 1)
    }
    this.player.discards.pop()
    tiles.push(this.discarded)
    player.minkan.push(tiles)

    // 摸牌会把 kiru 清空，先记住放铳者是谁
    const discarder = this.discarder
    if (drawRinshan) this.mopai(true, id, true)
    this.kanCount++
    this.registerPao(player, discarder, { suit: tiles[0].suit, kan: true })
    this.breakFirstTurnFlags()
    this.removeRyuukyokuMangan(discarder)
  }

  // 包（責任払い）：大三元 / 大四喜 / 四槓子 被鸣确定的那一刻，记下喂牌的责任者。
  // M.League 第8章第1条把「三種類目の三元牌」「四種類目の風牌」「四つ目の槓」都写成「ポン（大明槓）」，
  // 所以碰和明槓都要判（暗杠、加杠没人喂牌，不算包）。
  // melded 是"刚鸣进来的这一组"：只有它正好补成第三种三元牌 / 第四种风牌 / 第四槓 才算确定，
  // 不然之后随便再碰一张都会把已经成形的役满重新记一次包
  private registerPao(player: Player, discarder: PlayerId, melded: { suit: Suit, kan: boolean }) {
    const kotsu = (suit: Suit) => player.pon.filter(pon => pon.tiles[0].suit === suit).length
      + player.minkan.filter(tiles => tiles[0].suit === suit).length
      + player.ankan.filter(tiles => tiles[0].suit === suit).length
    if (melded.suit === 'sangen' && kotsu('sangen') === 3) {
      player.pao.push({ yaku: 'daisangen', playerId: discarder })
    }
    if (melded.suit === 'kaze' && kotsu('kaze') === 4) {
      player.pao.push({ yaku: 'daisuushii', playerId: discarder })
    }
    // 四槓子看这一家自己的槓数（加杠记在 pon 里，player.kanCount 会算上），不是全场第 4 个槓
    if (melded.kan && player.kanCount === 4) {
      player.pao.push({ yaku: 'suukantsu', playerId: discarder })
    }
  }

  // 暗杠与加杠都先"预备"，等一圈没人抢杠才算成立（establishKan），所以这里不加杠计数、
  // 不翻杠宝牌、也不破坏一発 —— M.League 第4章第5条「搶槓により槓が成立しない時、槓ドラは表示されない」
  // 暗杠与加杠的摸牌在 Mahjong 类里，因为如果被荣和则杠不成立
  ankan(tiles: Tile[]) {
    tiles = [...tiles]
    for (const tile of tiles) {
      if (!this.player.tiles.includes(tile)) throw new MahjongError('tile-not-in-hand', '暗杠: 这张牌不在手牌里')
    }
    // 杠牌和被鸣的牌一样都挂在 kiru 上：抢杠窗口问的就是这一张
    this.kiru = tiles[0]
    this.pendingKan = { type: 'ankan', playerId: this.currentId, tiles }
  }

  chakan(tile: Tile) {
    const pon = this.player.pon.find(pon => pon.tiles[0].equals(tile))
    if (!pon) throw new MahjongError('not-candidate', '加杠: 这张牌没有对应的碰')
    if (!this.player.tiles.includes(tile)) throw new MahjongError('tile-not-in-hand', '加杠: 这张牌不在手牌里')
    if (pon.chakan) throw new MahjongError('not-candidate', '加杠: 这组碰已经加杠过了')
    this.kiru = tile
    this.pendingKan = { type: 'chakan', playerId: this.currentId, tiles: [tile] }
  }

  // 没人抢杠 → 这一杠就此成立：这时候才动牌、加杠计数、翻杠宝牌、破一発
  establishKan() {
    const kan = this.pendingKan
    this.pendingKan = undefined
    if (!kan) return
    const player = this.players[kan.playerId]
    if (kan.type === 'ankan') {
      for (const tile of kan.tiles) player.tiles.splice(player.tiles.indexOf(tile), 1)
      player.ankan.push(kan.tiles)
    } else {
      const [tile] = kan.tiles
      player.tiles.splice(player.tiles.indexOf(tile), 1)
      const pon = player.pon.find(pon => pon.tiles[0].equals(tile))
      if (!pon) throw new MahjongError('unreachable', '加杠: 找不到对应的碰')
      pon.tiles.push(tile)
      pon.chakan = true
    }
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
    for (const player of this.players) {
      if (player.riichi) player.riichi.iipatsu = false
    }
  }

  removeRyuukyokuMangan(id: PlayerId) {
    this.players[id].ryuukyokuMangan = false
  }

  // kiru.playerId === currentSeat：这一家就是最后打牌的人，已经打过牌了，在等别人响应
  // 否则：这一家还没打牌（刚摸完牌，或刚吃/碰完），由他们打牌
  // 返回 null 则为不需要操作
  action(id: PlayerId, isChankan?: boolean, isAnkanChankan?: boolean): Action | null {
    const beforeDiscard = !this.kiru || this.kiru.playerId !== this.currentId
    if (beforeDiscard) {
      if (id !== this.currentId) return null
      const action: Action = { types: new Set() }
      // 九種九牌是途中流局，M.League 没有（abortiveDraws 关掉时不给这个选项）
      if (this.firstTurnIntact && this.profile.abortiveDraws) {
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
      // 最后一张牌的时候没有杠；吃/碰之后也不能杠（要先打一张，kiru 为空才是真的摸牌）
      if (!this.kiru && this.rest !== 0 && this.kanCount < 4) {
        const ankan = this.player.ankanTiles
        if (this.players[id].riichi) {
          // 立直中只能暗杠不改变听牌的那几组：杠前/杠后的听牌张必须一样
          // （杠后暗牌少 4 张，那 4 张算一副暗杠）
          const waitsBefore = this.players[id].waits ?? []
          const riichiAnkan = ankan.filter(tiles => {
            const counts = group(this.players[id].tiles)
            counts[tiles[0].suit][tiles[0].rank - 1] -= 4
            // 杠前杠后要用同一套「自己手牌 + 副露」的表算听牌张，不然被副露用掉的那张牌在
            // 前后会判得不一致，合法的立直中暗杠会被误拦
            const waitsAfter = waits(counts, this.players[id].heldCounts(counts))
            return waitsBefore.length === waitsAfter.length
              && waitsBefore.every(wait => waitsAfter.some(other => compareTileKind(wait, other) === 0))
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
      if (this.player.kuikae.length !== 0) {
        action.kuikae = this.player.kuikae
      }
      // kiru 为空说明这一手是真的摸牌（吃、碰后不是），只有摸牌才能立直/自摸
      const justDrew = !this.kiru
      if (justDrew) {
        // 现算"打哪张能听牌"：用来判立直，以及看这一手有没有和牌张（自摸）
        const tenpaiDiscards = this.player.tenpaiDiscards()
        // 立直的牌山条件：默认按 M.League（只要不是刚摸到海底牌就能立），打开开关则要剩 ≥4 张
        const wallOk = this.profile.riichiNeedsFourTiles ? this.rest >= 4 : this.rest !== 0
        // 0 张可抽的听牌算不算听牌：不算的档（M.League 第3章第11条）里也不能拿它立直
        const tenpaiOk = tenpaiDiscards.some(option => this.profile.zeroWaitTenpai || option.waits.length !== 0)
        if (!this.player.riichi && this.player.naki === 0 && wallOk && tenpaiOk) {
          action.types.add('riichi')
        }
        for (const option of tenpaiDiscards) {
          const canWin = option.waits.some(wait => compareTileKind(option.discard, wait) === 0)
          if (canWin) {
            const hora = yaku(this, this.players[id], true)
            if (canHora(hora.yaku)) {
              action.hora = hora
              action.types.add('tsumo')
              break
            }
          }
        }
      }
      // 打牌：吃过/碰过之后没有刚摸的牌，只能手切；立直中只能摸切
      if (!justDrew || !this.player.riichi) action.types.add('tedashi')
      if (justDrew) action.types.add('tsumogiri')
      return action
    } else {
      if (id === this.currentId) return null
      const action: Action = { types: new Set() }
      const waits = this.players[id].waits
      // 这张弃牌正好是这一家能和的牌 → 再看有没有役、有没有振听
      if (waits?.some(wait => this.discarded.equals(wait))) {
        const hora = yaku(this, this.players[id], this.discarded, false, isChankan)
        if (canHora(hora.yaku) && !this.players[id].furiten && !this.players[id].dojunfuriten) {
          if (isChankan) {
            // 抢杠（加杠）。暗杠原则上谁都不能抢，只有开了 kokushiAnkanChankan 才放行国士无双
            const kokushi = !!hora.yaku.kokushiMusou || !!hora.yaku.kokushiMusou13
            if (!isAnkanChankan || (this.profile.kokushiAnkanChankan && kokushi)) {
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

// 吃的食い替え：刚鸣的那张 + 手牌两张能凑出的另一端（同筋）
// 例：2m3m 吃 4m → 4m/1m 都不能马上打；2m4m（嵌张）吃 3m → 只有 3m 不能打
function chiKuikae(called: TileKind, meld: TileKind[]): TileKind[] {
  const kinds: TileKind[] = [{ suit: called.suit, rank: called.rank }]
  const [lowest] = meld
  if (called.rank === lowest.rank) {
    // 鸣的是最小的一张 → 手牌是 (x+1, x+2)，它们和 x+3 也能成顺子
    if (lowest.rank + 3 <= 9) kinds.push({ suit: lowest.suit, rank: lowest.rank + 3 })
  } else if (called.rank === lowest.rank + 2) {
    // 鸣的是最大的一张 → 手牌是 (x, x+1)，它们和 x-1 也能成顺子
    if (lowest.rank - 1 >= 1) kinds.push({ suit: lowest.suit, rank: lowest.rank - 1 })
  }
  return kinds
}

export interface Riichi {
  double: boolean
  iipatsu: boolean
}

export class Player {
  chi: Tile[][]    = []
  pon: Pon[]       = []
  minkan: Tile[][] = []
  ankan: Tile[][]  = []
  discards: Tile[] = []
  riichi?: Riichi

  // 听牌张。undefined（或任何假值）= 不听牌；空数组 = 听牌但没有能抽到的和牌张（等的那张自己攥着 4 张）
  // 判断听牌用真值 `if (player.waits)`：空数组是真值，所以"听牌但 0 张可抽"也算听牌；不要用长度判断
  waits?: TileKind[]

  // 食い替え：刚吃/碰进来的那张（以及同筋的另一端）不能马上打出去，打完之后清空
  kuikae: TileKind[] = []
  // 包（責任払い）：大三元 / 大四喜 / 四槓子 被鸣确定时，记下是谁"喂"的
  pao: { yaku: PaoYaku, playerId: PlayerId }[] = []

  dojunfuriten = false
  // 已切的牌，用于计算舍张振听
  discardCounts = createEmptyCounts()

  ryuukyokuMangan = true

  constructor(
    public round: Round,
    public id: PlayerId,
    public tiles: Tile[],
  ) {}

  // 手里最后一张牌。轮到自己、摸完牌之后（kiru 为空）它就是刚摸到的那张
  get drawn(): Tile {
    return this.tiles[this.tiles.length - 1]
  }

  calcShantenAndWaits(tiles?: Tile[]): [number, TileKind[]] {
    tiles ||= this.tiles
    const counts = group(tiles)
    const naki = this.naki + this.ankan.length
    return shanten(counts, naki, this.heldCounts(counts))
  }

  // 自己这边还剩几张：手牌 counts + 副露（吃 / 碰 / 明槓）+ 暗槓的牌（第3章第11条说的是「手牌・副露牌」）。
  // isAgari 只看手牌形状，不知道副露和暗槓里有哪些牌，不补上就会报幽灵听牌
  // （例：暗槓 5m + 手牌 34m 会说还在等 5m，其实第 5 张根本不存在）。
  // 暗槓不是副露（第4章第6条「暗槓は副露の対象とはならない」），但它同样是自己的牌，一样要算
  heldCounts(hand: Counts): Counts {
    const held = cloneCounts(hand)
    const melds = [...this.chi, ...this.pon.map(pon => pon.tiles), ...this.minkan, ...this.ankan]
    for (const tiles of melds) {
      for (const tile of tiles) held[tile.suit][tile.rank - 1]++
    }
    return held
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

  // 打哪张能听牌。听牌张可能是空数组（等的那张全在自己手里），那也算听牌；有没有役另外查
  tenpaiDiscards(): { discard: TileKind, waits: TileKind[] }[] {
    return this.shantenPerDiscard()
      .filter(option => option.shanten === 0)
      .map(({ discard, waits }) => ({ discard, waits }))
  }

  // undefined = 不听牌，返回数组（可能是空的）= 听牌；判断用真值，别用 length
  waitsAfterDiscard(tileKind: TileKind): TileKind[] | undefined {
    return this.tenpaiDiscards()
      .find(option => compareTileKind(option.discard, tileKind) === 0)?.waits
  }

  // 鸣牌数量（暗杠不算，算向听/和牌时要另外加 player.ankan.length）
  get naki() {
    return this.chi.length + this.pon.length + this.minkan.length
  }

  // 这一家自己的槓数（暗杠 / 明杠 / 加杠）。加杠存在 pon 里（chakan = true），
  // 算三槓子 / 四槓子 / 四槓散了 时必须带上，否则会漏役满、或者把四槓子误判成四槓散了
  get kanCount() {
    return this.ankan.length + this.minkan.length + this.pon.filter(pon => pon.chakan).length
  }

  // 本局的自风（随庄家轮换）
  get seatWind(): Kaze {
    return this.round.seatWind(this.id)
  }

  get isDealer(): boolean {
    return this.round.dealer === this.id
  }

  get chiTiles() {
    const current = this.round.discarded
    if (['sangen', 'kaze'].includes(current.suit)) {
      return []
    }
    const chizai: Tile[][] = []
    // 手里有多张同样的牌时，用来吃的那两张会有多种拿法，但拿哪张都一样：
    // 按"用掉的牌"（同种同红算同一种）去重，免得列出一堆一模一样的"吃"
    const seen = new Set<string>()
    const push = (first: Tile, second: Tile) => {
      const key = [first, second]
        .map(tile => `${tile.suit}${tile.rank}${tile.red ? 'r' : ''}`)
        .sort()
        .join(',')
      if (seen.has(key)) return
      seen.add(key)
      chizai.push([first, second])
    }
    // 45<6>
    if (current.rank - 2 >= 1) {
      const first = this.tiles.filter((tile) => tile.equals(current.suit, current.rank - 2))
      const second = this.tiles.filter((tile) => tile.equals(current.suit, current.rank - 1))
      first.forEach((first) => second.forEach((second) => push(first, second)))
    }
    // 4<5>6
    if (current.rank - 1 >=1 && current.rank + 1 <= 9) {
      const first = this.tiles.filter((tile) => tile.equals(current.suit, current.rank - 1))
      const third = this.tiles.filter((tile) => tile.equals(current.suit, current.rank + 1))
      first.forEach((first) => third.forEach((third) => push(first, third)))
    }
    // <4>56
    if (current.rank + 2 <= 9) {
      const second = this.tiles.filter((tile) => tile.equals(current.suit, current.rank + 1))
      const third = this.tiles.filter((tile) => tile.equals(current.suit, current.rank + 2))
      second.forEach((second) => third.forEach((third) => push(second, third)))
    }
    return chizai
  }
  get ponTiles() {
    const current = this.round.discarded
    const same = this.tiles.filter((tile) => tile.equals(current))
    const ponzai: Tile[][] = []
    // 手里 3 张同牌时 C(3,2) 种拿法只差"留下哪张"：留牌同种同红的算同一个选择
    // （三张一模一样的字牌就只剩一种），否则会列出一堆看起来完全一样的"碰"
    const seen = new Set<string>()
    for (let i = 0; i < same.length; i++) {
      for (let j = i + 1; j < same.length; j++) {
        const kept = same.filter((_, k) => k !== i && k !== j)
        const key = kept.map((tile) => tile.red ? 'r' : '-').join('')
        if (seen.has(key)) continue
        seen.add(key)
        ponzai.push([same[i], same[j]])
      }
    }
    return ponzai
  }
  // （以下是三种杠各自的原始候选；ctx 会把它们合成 ctx.kans）
  get minkanTiles() {
    const current = this.round.discarded
    const same = this.tiles.filter((tile) => tile.equals(current))
    return same.length === 3 ? [same] : []
  }
  get ankanTiles() {
    // 按"同一种牌"分组（红 5 和普通 5 算同一种），四张一组的才是暗杠候选
    const groups = new Map<string, Tile[]>()
    for (const tile of this.tiles) {
      const key = `${tile.suit}${tile.rank}`
      const group = groups.get(key) ?? []
      group.push(tile)
      groups.set(key, group)
    }
    return [...groups.values()].filter(group => group.length === 4)
  }
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
