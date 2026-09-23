import { Action, ActionType, Kaze, Player, PlayerId, Round, Tile, playerIds } from './round'
import { nextId, shimocha } from './utils'
import { Yaku } from './yaku'

export * from './round'
export * from './tenpai'
export * from './utils'
export * from './yaku'

// 尚未实现的规则（TODO）：
// - 食い替え：吃/碰之后不能打回刚鸣的那张（以及同筋的牌）
// - 吃、碰之后不能杠（加杠/暗杠）
// - 包牌（大三元、大四喜、四杠子等的责任支付）
//
// 尚未加的健壮性检查（TODO）：只有 ron/tsumo 校验了 ctx.types，
// dahai/chi/pon/minkan/ankan/chakan/ryuukyoku 都没校验 —— 调用方给了这家当时不该做的动作时
// 不会报错，而是静默改坏状态：
// - chi 不认 ctx.player，按"下家"改牌，误用会改到别人手上（还给出混花色的副露）
// - 牌不在手里时 player.tiles.indexOf 返回 -1，splice(-1, 1) 会删掉最后一张牌
// - minkan/ankan/chakan 还会顺带改 kanCount（宝牌指示牌、四杠散了）与 kiru
// 计划：每个方法先 `if (!this.types.has('chi')) throw ...`，再校验传入的牌确实在候选
// （chiTiles/ponTiles/minkanTiles/ankanTiles/chakanTiles）里。
//
// 注意：轮到谁操作时都要在 callback 里给出一个动作（或者全部跳过时调用 cancel），
// 否则牌局会停在原地 —— 调用方的责任。

// 某一家当前可以做的操作。
// types 里是该家可用的动作，候选（能吃/碰/杠的牌组、和牌的役与基本点）挂在对应字段上。
// 调用方从 ctx 里选一个方法执行：tedashi / tsumogiri / chi / pon / minkan / ankan / chakan / ryuukyoku，
// 和牌则调用 mahjong.ron() 或 mahjong.tsumo()。
export class MahjongContext implements Action {
  types: Set<ActionType>
  chiTiles?: Tile[][]
  ponTiles?: Tile[][]
  minkanTiles?: Tile[][]
  ankanTiles?: Tile[][]
  chakanTiles?: Tile[]
  hora?: { yaku: Yaku, points: number }

  round: Round

  constructor(
    public mahjong: Mahjong,
    public player: Player,
    action: Action,
  ) {
    this.round = mahjong.round
    Object.assign(this, action)
  }

  // 手切：只能打手牌里原有的牌（不收牌值，必须传手牌里那张 Tile 对象，
  // 这样赤 5 与普通 5、以及牌是从哪摸来的等身份信息都不会丢）。
  // 刚摸到的那张不能手切 —— 那是摸切，请改用 tsumogiri()。
  // （这是有意的严格约定：以后写进文档，见 README 的「打牌」一节）
  tedashi(tile: Tile, riichi?: boolean) {
    if (!this.types.has('tedashi')) throw new Error('手切: 现在不能手切（立直中只能摸切，吃碰之后只能手切）')
    if (this.player.riichi) throw new Error('手切: 立直中只能摸切（用 tsumogiri()）')
    if (!this.player.tiles.includes(tile)) throw new Error('手切: 这张牌不在手牌里')
    if (!this.round.kiru && tile === this.player.tiles.at(-1)) {
      throw new Error('手切: 打的是刚摸到的牌，请改用 tsumogiri()')
    }
    this.discard(tile, riichi)
  }

  // 摸切：打刚摸到的那张（吃、碰之后没有刚摸的牌，只能用 tedashi()）
  tsumogiri(riichi?: boolean) {
    if (!this.types.has('tsumogiri')) throw new Error('摸切: 现在不能摸切（吃过、碰过之后请用 tedashi()）')
    this.discard(this.player.tiles.at(-1), riichi)
  }

  private discard(tile: Tile, riichi?: boolean) {
    if (riichi) {
      if (!this.types.has('riichi')) throw new Error('立直: 现在不能立直')
      if (!this.player.waitsAfterDiscard(tile)) {
        throw new Error('立直: 打这张之后不听牌')
      }
    }
    this.round.dahai(tile, riichi)
    // 打完之后问其余三家要不要吃碰杠和，并顺带判定四家立直 / 四风连打
    if (riichi && this.round.players.every(player => player.riichi)) {
      this.mahjong.end({ type: 'ryuukyoku', ryuukyoku: { type: '四家立直' } })
    } else if (this.round.sufurenda === true) {
      this.mahjong.end({ type: 'ryuukyoku', ryuukyoku: { type: '四风连打' } })
    } else {
      this.mahjong.naki()
    }
  }

  // 吃碰杠都直接传候选本身（chiTiles / ponTiles / minkanTiles / ankanTiles / chakanTiles 里的那一项）。
  // 库用同一性校验：不在候选列表里（或拿着过期的候选）就抛错。
  private candidate<T>(list: T[] | undefined, pick: T, what: string): T {
    if (!list?.includes(pick)) throw new Error(`${what}: 这个候选不在候选列表里`)
    return pick
  }

  // 吃、碰都不摸牌：更新牌局状态后直接 next()，由这家自己打一张
  chi(candidate: Tile[]) {
    if (!this.types.has('chi')) throw new Error('吃: 现在不能吃')
    this.round.chi(this.candidate(this.chiTiles, candidate, '吃'))
    this.mahjong.next()
  }

  // 碰也不摸牌（和吃同理）
  pon(candidate: Tile[]) {
    if (!this.types.has('pon')) throw new Error('碰: 现在不能碰')
    this.round.pon(this.player.id, this.candidate(this.ponTiles, candidate, '碰'))
    this.mahjong.next()
  }

  // 明杠的补牌在 Round.minkan 里，所以这里同样不用再调 mopai
  minkan(candidate: Tile[]) {
    if (!this.types.has('kan')) throw new Error('明杠: 现在不能杠')
    this.round.minkan(this.player.id, this.candidate(this.minkanTiles, candidate, '明杠'))
    this.mahjong.next()
  }

  // 暗杠、加杠先问一圈有没有人抢杠（国士无双可抢暗杠），没人抢才补牌
  ankan(candidate: Tile[]) {
    if (!this.types.has('kan')) throw new Error('暗杠: 现在不能杠')
    this.round.ankan(this.candidate(this.ankanTiles, candidate, '暗杠'))
    this.mahjong.naki(true, true)
  }

  chakan(candidate: Tile) {
    if (!this.types.has('kan')) throw new Error('加杠: 现在不能杠')
    this.round.chakan(this.candidate(this.chakanTiles, candidate, '加杠'))
    this.mahjong.naki(true)
  }

  // 宣告九种九牌流局（只能在第一巡、且没有任何人鸣牌时）
  ryuukyoku() {
    this.mahjong.end({
      type: 'ryuukyoku',
      ryuukyoku: {
        type: '九种九牌',
        id: this.player.id,
      },
    })
  }
}

// 一局结束的结果：和牌（可多家，含每个和牌者的役与点数）或流局
export class MahjongEnd {
  type: 'hora' | 'ryuukyoku'
  hora?: {
    type: 'tsumo' | 'ron'
    id: PlayerId
    yaku: Yaku
    score: number
  }[]
  ryuukyoku?: {
    type: '荒牌流局' | '九种九牌' | '四家立直' | '四风连打' | '四杠散了'
    // 荒牌流局
    tenpai?: PlayerId[]
    // 流局满贯
    mangan?: PlayerId[]
    // 九种九牌
    id?: PlayerId
  }
}

// 一家的决策：交给 playDecisions 执行（库负责荣和优先、多家荣和、座位顺序、全跳过才继续摸牌）
export type Decision =
  | { action: 'ron' }
  | { action: 'tsumo' }
  | { action: 'tedashi', tile: Tile, riichi?: boolean }
  | { action: 'tsumogiri', riichi?: boolean }
  | { action: 'chi', candidate: Tile[] }
  | { action: 'pon', candidate: Tile[] }
  | { action: 'minkan', candidate: Tile[] }
  | { action: 'ankan', candidate: Tile[] }
  | { action: 'chakan', candidate: Tile }
  | { action: 'ryuukyoku' }
  | { action: 'pass' }

export class Mahjong {
  round: Round
  // 场风（东场 -> 南场 -> 西场）
  bakaze: Kaze = 'ton'
  // 起家/本局庄家座位，每家轮流坐庄
  dealer: PlayerId = 0
  kyoku = 1
  score = [25000, 25000, 25000, 25000]
  // 本场棒（每本场 +300 点，和牌者收、放铳者/自摸者付）
  homba = 0
  // 桌上已有的立直棒数量（每根 1000 点，和牌者收）
  riichibo = 0
  // 最近一次结束的结果，nextRound() 靠它决定连庄/进局
  lastEnd: MahjongEnd

  constructor(
    // 轮到某一家操作时回调：ctxs 是该家（或其余几家）可做的操作，cancel 在全部跳过之后调用
    public callback: (ctxs: { [id in PlayerId]?: MahjongContext }, cancel: () => void) => void,
    // 每局结束时回调（之后由调用方决定是否 nextRound()）
    public roundEnd: (end: MahjongEnd) => void,
    // 可选：自定义牌山生成（庄家座位、第几局、本场棒），用于测试或复盘
    public createTiles?: (dealerId: PlayerId, kyoku: number, homba: number) => Tile[],
  ) {
    this.createRound()
  }

  start() {
    this.next()
  }

  // 用"每家的决策回调"驱动整局：调用方只回答这一家做什么，其余交给库：
  // 1) 荣和优先（可多家同时荣和）；2) 碰、明杠优先于吃；3) 其余按玩家编号顺序；
  // 4) 全都 pass 才继续摸牌（等价于调用 cancel）。
  // 注意：同一家在一次询问里可能被问两次（先问荣和，再问吃碰杠）。
  playDecisions(choose: (ctx: MahjongContext) => Decision | undefined) {
    this.callback = (ctxs, cancel) => {
      const list = playerIds.map(id => ctxs[id]).filter((ctx): ctx is MahjongContext => ctx !== undefined)
      // 1) 荣和优先，可多家
      const ronners = list.filter(ctx => ctx.types.has('ron') && choose(ctx)?.action === 'ron')
      if (ronners.length !== 0) {
        this.ron(ronners)
        return
      }
      // 2) 碰 / 杠 优先于吃（吃只有下家能吃，已经由 Round.action 保证）；都没有时按座位顺序处理自己的回合
      const strong = list.filter(ctx => ctx.types.has('pon') || ctx.types.has('kan'))
      const weak = list.filter(ctx => ctx.types.has('chi') && !ctx.types.has('pon') && !ctx.types.has('kan'))
      for (const ctx of strong.length + weak.length !== 0 ? [...strong, ...weak] : list) {
        const decision = choose(ctx)
        if (!decision || decision.action === 'pass' || decision.action === 'ron') continue
        switch (decision.action) {
          case 'tsumo': this.tsumo(ctx); return
          case 'tedashi': ctx.tedashi(decision.tile, decision.riichi); return
          case 'tsumogiri': ctx.tsumogiri(decision.riichi); return
          case 'chi': ctx.chi(decision.candidate); return
          case 'pon': ctx.pon(decision.candidate); return
          case 'minkan': ctx.minkan(decision.candidate); return
          case 'ankan': ctx.ankan(decision.candidate); return
          case 'chakan': ctx.chakan(decision.candidate); return
          case 'ryuukyoku': ctx.ryuukyoku(); return
        }
      }
      cancel()
    }
  }

  // 全体跳过（都不吃、碰、杠、和）后的处理：生成传给 callback 的 cancel 回调。
  // 其中"能和却不和"的那几家会在下面记见逃（同巡振听）。
  // 调用方在确认所有 ctx 都放弃后调用它：先检查四杠散了，没散就继续摸牌。
  // drawer 非空表示刚才问的是抢杠（见逃后由这家补一张牌）。
  passHandler(ctxs: { [id in PlayerId]?: MahjongContext }, drawer?: PlayerId) {
    return () => {
      if (this.checkKan()) {
        const ron = Object.values(ctxs).filter(ctx => ctx.types.has('ron'))
        for (const ctx of ron) {
          this.round.minogashi(ctx.player.id)
        }
        if (drawer) {
          this.mopai(true, drawer, true)
        } else {
          this.mopai()
        }
      }
    }
  }

  ron(ctxs: MahjongContext[]) {
    if (!ctxs.every(ctx => ctx.types.has('ron'))) throw new Error('unreachable')
    let closestWinner = this.round.kiru.from.playerId
    while (!ctxs.find(ctx => ctx.player.id === closestWinner)) {
      closestWinner = nextId(closestWinner)
    }
    const furikomi = this.round.kiru.from.playerId
    const horaList: MahjongEnd['hora'] = []
    for (const ctx of ctxs) {
      const oya = this.round.dealer === ctx.player.id
      const hora = ctx.hora!
      let score = Math.ceil((oya ? 6 * hora.points : 4 * hora.points) / 100) * 100
      this.score[furikomi] -= score
      if (closestWinner === ctx.player.id) {
        // 本场的立直棒由放铳者承担（等价于立直者先付、再收回）
        const kyotaku = this.homba * 300 + this.round.players.filter(player => player.riichi).length * 1000
        score += kyotaku
        this.score[furikomi] -= kyotaku
        // 桌上已有的立直棒是之前流局时从立直者扣过的，直接给和牌者，不再向放铳者收
        score += this.riichibo * 1000
      }
      horaList.push({
        type: 'ron',
        id: ctx.player.id,
        yaku: hora.yaku,
        score,
      })
      this.score[ctx.player.id] += score
    }
    this.end({
      type: 'hora',
      hora: horaList,
    })
  }

  tsumo(ctx: MahjongContext) {
    if (!ctx.types.has('tsumo')) throw new Error('unreachable')
    const hora = ctx.hora!
    const oya = this.round.dealer === ctx.player.id
    // 每家支付额各自向上取整到百点：庄家 2a、闲家 a；庄家自摸时三家都付 2a
    const dealerPay = Math.ceil(2 * hora.points / 100) * 100
    const nonDealerPay = Math.ceil(hora.points / 100) * 100
    let score = 0
    for (const id of playerIds) {
      if (this.round.players[id].riichi) {
        // 自家的立直棒将会在后面加回来
        this.score[id] -= 1000
      }
      if (id === ctx.player.id) continue
      const pay = oya || id === this.round.dealer ? dealerPay : nonDealerPay
      this.score[id] -= pay + 100 * this.homba
      score += pay
    }
    // 供托（本场棒 + 桌上立直棒 + 本局立直棒）
    score += this.homba * 300 + (this.riichibo + this.round.players.filter(player => player.riichi).length) * 1000
    this.score[ctx.player.id] += score
    this.end({
      type: 'hora',
      hora: [{
        type: 'tsumo',
        id: ctx.player.id,
        yaku: hora.yaku,
        score,
      }],
    })
  }

  // isRinshan 表示这次是杠后的补牌（岭上开花）
  mopai(keepTurn?: boolean, id?: PlayerId, isRinshan?: boolean) {
    if (this.round.rest === 0) {
      const tenpaiIds = playerIds.filter(id => this.round.players[id].waits)
      const mangan = playerIds.filter(id => this.round.players[id].ryuukyokuMangan)
      if (mangan.length !== 0) {
        const basePoints = 2000
        for (const id of mangan) {
          if (id === this.round.dealer) {
            // 庄家流满
            this.score[id] += 6 * basePoints
            for (const other of playerIds) {
              if (other === id) continue
              this.score[other] -= 2 * basePoints
            }
          } else {
            // 闲家流满
            this.score[id] += 4 * basePoints
            for (const other of playerIds) {
              if (other === id) continue
              if (other === this.round.dealer) {
                this.score[other] -= 2 * basePoints
              } else {
                this.score[other] -= basePoints
              }
            }
          }
        }
      } else if (tenpaiIds.length !== 0 && tenpaiIds.length !== 4) {
        const receive = 3000 / tenpaiIds.length
        const pay = 3000 / (4 - tenpaiIds.length)
        for (const id of playerIds) {
          if (tenpaiIds.includes(id)) {
            this.score[id] += receive
          } else {
            this.score[id] -= pay
          }
        }
      }
      this.end({
        type: 'ryuukyoku',
        ryuukyoku: {
          type: '荒牌流局',
          tenpai: tenpaiIds,
          mangan,
        },
      })
      return
    }
    this.round.mopai(keepTurn, id, isRinshan)
    this.next()
  }

  // 轮到这一家操作时回调调用方：可能是刚摸完牌，也可能是刚吃完/碰完（没摸牌）
  next() {
    const id = this.round.currentId
    const action = this.round.action(id)
    if (!action) throw new Error('unreachable')
    const ctxs = {
      [id]: new MahjongContext(this, this.round.player, action),
    }
    this.callback(ctxs, this.passHandler(ctxs))
  }

  // 有人打牌（或开杠）后，问其余几家要不要吃、碰、杠、和；
  // 都没人要就继续摸牌（牌山摸完时由 mopai() 走荒牌流局）
  naki(isKan?: boolean, isAnkan?: boolean) {
    const others = playerIds.filter(id => id !== this.round.currentId)
    const ctxs: { [id in PlayerId]?: MahjongContext } = {}
    for (const id of others) {
      const action = this.round.action(id, isKan, isAnkan)
      if (!action) continue
      ctxs[id] = new MahjongContext(this, this.round.players[id], action)
    }
    if (Object.values(ctxs).length === 0) {
      if (this.checkKan()) {
        if (isKan) {
          // 杠的补牌（岭上）
          this.mopai(true, this.round.currentId, true)
        } else {
          this.mopai()
        }
      }
    } else {
      // 开杠被人见逃后，由开杠的那一家补牌
      this.callback(ctxs, this.passHandler(ctxs, isKan ? this.round.currentId : undefined))
    }
  }

  end(end: MahjongEnd) {
    // 和牌与流局的点数计算分别在 ron/tsumo 和 mopai 里，这里只处理立直棒的进出
    if (end.type === 'ryuukyoku') {
      for (const id of playerIds) {
        if (!this.round.players[id].riichi) continue
        this.score[id] -= 1000
        this.riichibo++
      }
    } else {
      this.riichibo = 0
    }
    this.lastEnd = end
    this.roundEnd(end)
  }

  // 本局结束后推进：连庄（本场棒 +1）、进下一局（庄家轮转）、进下一场（场风推进），
  // 或者返回 false 表示整场结束（被飞 / 西入超分 / 南四局结束）
  nextRound(): boolean {
    const end = this.lastEnd
    // 被飞了
    if (this.score.some(score => score < 0)) {
      return false
    }
    // 西入后只要有人分数超过 30000 则结束
    if (this.bakaze === 'sha' && this.score.some(score => score > 30000)) {
      return false
    }
    // 南四局如果庄家是第一则结束
    if (this.bakaze === 'nan' && this.kyoku === 4) {
      const dealerIndex = this.round.dealer
      if (this.score.every((score, i) => i === dealerIndex || score > this.score[dealerIndex])) {
        return false
      }
    }
    let oya = false
    if (end.type === 'hora') {
      oya = end.hora.some(hora => hora.id === this.round.dealer)
    } else if (end.type === 'ryuukyoku' && end.ryuukyoku.type === '荒牌流局') {
      oya = end.ryuukyoku.tenpai.some(id => id === this.round.dealer)
    }
    // 西、南四局如果是闲家和牌则结束
    // (不会北入)
    if (['nan', 'sha'].includes(this.bakaze) && this.kyoku === 4) {
      if (!oya) return false
    }
    if (oya) {
      this.homba++
      this.createRound()
    } else if (this.kyoku < 4) {
      this.kyoku++
      this.dealer = nextId(this.dealer)
      this.createRound()
    } else {
      this.kyoku = 1
      this.dealer = nextId(this.dealer)
      this.bakaze = shimocha(this.bakaze)
      this.createRound()
    }
    this.next()
    return true
  }

  // 检查四杠散了：四家合计四杠、且不是某一家独占四杠时流局。
  // 返回 true 表示没有流局（可以继续摸牌）
  private checkKan(): boolean {
    if (this.round.kanCount === 4) {
      // 如果某一家自己有四杠，那就不流局
      const ryuukyoku = !playerIds.some(id => {
        const player = this.round.players[id]
        return player.ankan.length + player.minkan.length === 4
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
  
  private createRound() {
    // 按当前场风与庄家开新的一局，牌山交给 createTiles（不传则用默认打乱的一副）
    this.round = new Round(this.bakaze, this.dealer, this.createTiles?.(this.dealer, this.kyoku, this.homba))
  }
}
