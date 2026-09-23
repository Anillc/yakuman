import { Action, ActionType, Kan, Kaze, Player, PlayerId, Round, Tile, playerIds } from './round'
import { MahjongError, nextId, shimocha } from './utils'
import { HoraResult } from './yaku'

export * from './round'
export * from './tenpai'
export * from './utils'
export * from './yaku'

// 尚未实现的规则（TODO）：
// - 食い替え：吃/碰之后不能打回刚鸣的那张（以及同筋的牌）
// - 吃、碰之后不能杠（加杠/暗杠）
// - 包牌（大三元、大四喜、四杠子等的责任支付）
//
// 注意：轮到谁操作时都要在 callback 里给出一个动作（或者全部跳过时调用 pass），
// 否则牌局会停在原地 —— 调用方的责任。
// 另外这两件事由库保证：动作必须是 ctx.types 里有的、候选必须来自 ctx 给出的候选列表；
// 误用一律抛 MahjongError（code 一览见 utils.ts）。

// 某一家当前可以做的操作。
// types 里是该家可用的动作，候选（能吃/碰的牌组、能杠的 kans、和牌的役与基本点）挂在对应字段上。
// 调用方从 ctx 里选一个方法执行：tedashi / tsumogiri / chi / pon / kan / ryuukyoku，
// 和牌则调用 ctx.ron() 或 ctx.tsumo()（多家荣和才需要 mahjong.ron([...])）。
export class MahjongContext implements Action {
  types: Set<ActionType>
  chiTiles?: Tile[][]
  ponTiles?: Tile[][]
  kans?: Kan[]
  hora?: HoraResult

  round: Round

  constructor(
    public mahjong: Mahjong,
    public player: Player,
    action: Action,
  ) {
    this.round = mahjong.round
    Object.assign(this, action)
  }

  // ctx 是用一次就作废的：动作执行之后牌局已经往前走了，
  // ctx 里的 types 与候选都过期了，再拿它做动作就是拿旧局面改新牌局（会静默改坏状态）。
  private used = false

  private assertFresh() {
    if (this.used) {
      throw new MahjongError('context-used', '这个 ctx 已经执行过动作了（ctx 是一次性的，请用下一次 callback 给的新 ctx）')
    }
  }

  // 手切：只能打手牌里原有的牌（不收牌值，必须传手牌里那张 Tile 对象，
  // 这样赤 5 与普通 5、以及牌是从哪摸来的等身份信息都不会丢）。
  // 刚摸到的那张不能手切 —— 那是摸切，请改用 tsumogiri()。
  // （这是有意的严格约定：以后写进文档，见 README 的「打牌」一节）
  tedashi(tile: Tile, riichi?: boolean) {
    this.assertFresh()
    if (!this.types.has('tedashi')) throw new MahjongError('action-not-allowed', '手切: 现在不能手切（立直中只能摸切，吃碰之后只能手切）')
    if (this.player.riichi) throw new MahjongError('action-not-allowed', '手切: 立直中只能摸切（用 tsumogiri()）')
    if (!this.player.tiles.includes(tile)) throw new MahjongError('tile-not-in-hand', '手切: 这张牌不在手牌里')
    if (!this.round.kiru && tile === this.player.tiles.at(-1)) {
      throw new MahjongError('tedashi-drawn-tile', '手切: 打的是刚摸到的牌，请改用 tsumogiri()')
    }
    this.discard(tile, riichi)
    this.used = true
  }

  // 摸切：打刚摸到的那张（吃、碰之后没有刚摸的牌，只能用 tedashi()）
  tsumogiri(riichi?: boolean) {
    this.assertFresh()
    if (!this.types.has('tsumogiri')) throw new MahjongError('action-not-allowed', '摸切: 现在不能摸切（吃过、碰过之后请用 tedashi()）')
    this.discard(this.player.tiles.at(-1), riichi)
    this.used = true
  }

  private discard(tile: Tile, riichi?: boolean) {
    if (riichi) {
      if (!this.types.has('riichi')) throw new MahjongError('action-not-allowed', '立直: 现在不能立直')
      if (!this.player.waitsAfterDiscard(tile)) {
        throw new MahjongError('riichi-not-tenpai', '立直: 打这张之后不听牌')
      }
    }
    this.round.dahai(tile, riichi)
    // 打完之后问其余三家要不要吃碰杠和，并顺带判定四家立直 / 四风连打
    if (riichi && this.round.players.every(player => player.riichi)) {
      this.mahjong.end({ type: 'ryuukyoku', ryuukyoku: { type: 'suuchaRiichi' } })
    } else if (this.round.sufurenda === true) {
      this.mahjong.end({ type: 'ryuukyoku', ryuukyoku: { type: 'sufurenda' } })
    } else {
      this.mahjong.naki()
    }
  }

  // 吃碰杠都直接传候选本身（chiTiles / ponTiles / kans 里的那一项）。
  // 库用同一性校验：不在候选列表里（或拿着过期的候选）就抛错。
  private candidate<T>(list: T[] | undefined, pick: T, what: string): T {
    if (!list?.includes(pick)) throw new MahjongError('not-candidate', `${what}: 这个候选不在候选列表里`)
    return pick
  }

  // 报错时用哪种杠的说法
  private what(kan: Kan) {
    return { minkan: '明杠', ankan: '暗杠', chakan: '加杠' }[kan?.type] ?? '杠'
  }

  // 吃、碰都不摸牌：更新牌局状态后直接 next()，由这家自己打一张
  chi(candidate: Tile[]) {
    this.assertFresh()
    if (!this.types.has('chi')) throw new MahjongError('action-not-allowed', '吃: 现在不能吃')
    this.round.chi(this.candidate(this.chiTiles, candidate, '吃'))
    this.used = true
    this.mahjong.next()
  }

  // 碰也不摸牌（和吃同理）
  pon(candidate: Tile[]) {
    this.assertFresh()
    if (!this.types.has('pon')) throw new MahjongError('action-not-allowed', '碰: 现在不能碰')
    this.round.pon(this.player.id, this.candidate(this.ponTiles, candidate, '碰'))
    this.used = true
    this.mahjong.next()
  }

  // 杠：传 ctx.kans 里的那一项，type 决定是明杠、暗杠还是加杠
  // - 明杠补的牌在 Round.minkan 里，所以不用再调 mopai
  // - 暗杠、加杠先问一圈有没有人抢杠（国士无双可抢暗杠），没人抢才补牌
  kan(kan: Kan) {
    this.assertFresh()
    if (!this.types.has('kan')) throw new MahjongError('action-not-allowed', `${this.what(kan)}: 现在不能杠`)
    this.candidate(this.kans, kan, this.what(kan))
    if (kan.type === 'minkan') {
      this.round.minkan(this.player.id, kan.tiles)
      this.used = true
      this.mahjong.next()
    } else if (kan.type === 'ankan') {
      this.round.ankan(kan.tiles)
      this.used = true
      this.mahjong.naki(true, true)
    } else {
      this.round.chakan(kan.tiles[0])
      this.used = true
      this.mahjong.naki(true)
    }
  }

  // 荣和：一般就用这家的 ctx 直接调用；多家荣和（非头跳）才需要 mahjong.ron([...])
  ron() {
    this.assertFresh()
    if (!this.types.has('ron')) throw new MahjongError('action-not-allowed', '荣和: 现在不能荣和')
    this.used = true
    this.mahjong.ron([this])
  }

  // 自摸
  tsumo() {
    this.assertFresh()
    if (!this.types.has('tsumo')) throw new MahjongError('action-not-allowed', '自摸: 现在不能自摸')
    this.used = true
    this.mahjong.tsumo(this)
  }

  // 宣告九种九牌流局（只能在第一巡、且没有任何人鸣牌时）
  ryuukyoku() {
    this.assertFresh()
    if (!this.types.has('ryuukyoku')) throw new MahjongError('action-not-allowed', '九种九牌: 现在不能宣告')
    this.used = true
    this.mahjong.end({
      type: 'ryuukyoku',
      ryuukyoku: {
        type: 'kyuushu',
        id: this.player.id,
      },
    })
  }
}

// 流局的种类（id 用罗马音，方便比较；要给人看请自己准备文案）
//   hoapai       荒牌流局（牌山摸完）
//   kyuushu      九種九牌
//   suuchaRiichi 四家立直
//   sufurenda    四風連打
//   suukansanra  四槓散了
export type RyuukyokuType = 'hoapai' | 'kyuushu' | 'suuchaRiichi' | 'sufurenda' | 'suukansanra'

// 一局结束的结果：和牌（可多家，含每个和牌者的役与点数）或流局
export class MahjongEnd {
  type: 'hora' | 'ryuukyoku'
  // 和牌者（可多家）：和牌结果（役与基本点）加上这一家实际收/付的点数
  hora?: ({ type: 'tsumo' | 'ron', id: PlayerId, score: number } & HoraResult)[]
  ryuukyoku?: {
    type: RyuukyokuType
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
  | { action: 'kan', kan: Kan }
  | { action: 'ryuukyoku' }
  | { action: 'pass' }

export class Mahjong {
  round: Round
  // 场风（东场 -> 南场 -> 西场）
  bakaze: Kaze = 'ton'
  kyoku = 1
  score = [25000, 25000, 25000, 25000]
  // 本场棒（每本场 +300 点，和牌者收、放铳者/自摸者付）
  homba = 0
  // 桌上已有的立直棒数量（每根 1000 点，和牌者收）
  riichibo = 0
  // 最近一次结束的结果，nextRound() 靠它决定连庄/进局
  lastEnd: MahjongEnd
  // 多家荣和的规则：
  //   false = 頭ハネ（默认）：只有离放铳者最近的那家和牌，其他家不算和
  //   true  = 每家和牌者都收（天鳳・雀魂风格；本場棒/立直棒仍然只给最近的赢家）
  multipleRon = false

  constructor(
    // 轮到某一家操作时回调：ctxs 是该家（或其余几家）可做的操作，
    // pass 在"这几家全都不要（不吃碰杠和）"之后调用，库会接着收尾（见 passHandler）
    public callback: (ctxs: { [id in PlayerId]?: MahjongContext }, pass: () => void) => void,
    // 每局结束时回调，第二个参数表示整场是否还能继续（被飞、西入超分、南四局结束时为 false）。
    // 返回 true = 继续下一局，库会自己接续；返回 false / 不返回 = 停下来，由调用方决定是否 nextRound()。
    public roundEnd: (end: MahjongEnd, canContinue: boolean) => boolean | void,
    // 可选：自定义牌山生成（庄家座位、第几局、本场棒），用于测试或复盘
    public createTiles?: (dealerId: PlayerId, kyoku: number, homba: number) => Tile[],
    // 可选：规则开关（目前只有多家荣和）
    options?: { multipleRon?: boolean },
  ) {
    if (options?.multipleRon !== undefined) this.multipleRon = options.multipleRon
    // 起家是 0 号，之后由 nextRound() 轮转
    this.createRound(0)
  }

  start() {
    this.next()
  }

  // 本局的庄家（唯一来源是 round.dealer，外面改不了；起家固定 0 号，之后连庄/轮转都走 nextRound）
  get dealer(): PlayerId {
    return this.round.dealer
  }

  // 一把打完：用决策回调（playDecisions）打完整场，每局结束自动接续，直到被飞 / 西入超分 / 南四局结束。
  // 传入的 roundEnd 仍然会收到每局结果，只是返回值由库接管。返回最终分数。
  playToEnd(choose: (ctx: MahjongContext) => Decision | undefined): number[] {
    this.playDecisions(choose)
    const notify = this.roundEnd
    this.roundEnd = (end, canContinue) => {
      notify(end, canContinue)
      return true
    }
    this.start()
    return this.score
  }

  // 用"每家的决策回调"驱动整局：调用方只回答这一家做什么，其余交给库：
  // 1) 荣和优先（可多家同时荣和）；2) 碰、明杠优先于吃；3) 其余按玩家编号顺序；
  // 4) 全都 pass 才继续摸牌（等价于调用 callback 的 pass）。
  // 注意：同一家在一次询问里可能被问两次（先问荣和，再问吃碰杠）。
  playDecisions(choose: (ctx: MahjongContext) => Decision | undefined) {
    this.callback = (ctxs, pass) => {
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
          case 'tsumo': ctx.tsumo(); return
          case 'tedashi': ctx.tedashi(decision.tile, decision.riichi); return
          case 'tsumogiri': ctx.tsumogiri(decision.riichi); return
          case 'chi': ctx.chi(decision.candidate); return
          case 'pon': ctx.pon(decision.candidate); return
          case 'kan': ctx.kan(decision.kan); return
          case 'ryuukyoku': ctx.ryuukyoku(); return
        }
      }
      pass()
    }
  }

  // 全体跳过（都不吃、碰、杠、和）后的处理：生成传给 callback 的 pass 回调。
  // 其中"能和却不和"的那几家会在下面记见逃（同巡振听）。
  // 调用方在确认所有 ctx 都放弃后调用它：先检查四杠散了，没散就继续摸牌。
  // drawer 非空表示刚才问的是抢杠（见逃后由这家补一张牌）。
  private passHandler(ctxs: { [id in PlayerId]?: MahjongContext }, drawer?: PlayerId) {
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
    if (ctxs.some(ctx => !ctx.types.has('ron'))) {
      throw new MahjongError('action-not-allowed', '荣和: 这家里有现在不能荣和的人')
    }
    let closestWinner = this.round.kiru.playerId
    while (!ctxs.find(ctx => ctx.player.id === closestWinner)) {
      closestWinner = nextId(closestWinner)
    }
    // 頭ハネ：只有最近的那家算和
    if (!this.multipleRon && ctxs.length > 1) {
      ctxs = [ctxs.find(ctx => ctx.player.id === closestWinner)]
    }
    const furikomi = this.round.kiru.playerId
    const horaList: MahjongEnd['hora'] = []
    for (const ctx of ctxs) {
      const oya = ctx.player.isDealer
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
        ...hora,
        type: 'ron',
        id: ctx.player.id,
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
    if (!ctx.types.has('tsumo')) throw new MahjongError('action-not-allowed', '自摸: 现在不能自摸')
    const hora = ctx.hora!
    const oya = ctx.player.isDealer
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
      const pay = oya || this.round.players[id].isDealer ? dealerPay : nonDealerPay
      this.score[id] -= pay + 100 * this.homba
      score += pay
    }
    // 供托（本场棒 + 桌上立直棒 + 本局立直棒）
    score += this.homba * 300 + (this.riichibo + this.round.players.filter(player => player.riichi).length) * 1000
    this.score[ctx.player.id] += score
    this.end({
      type: 'hora',
      hora: [{
        ...hora,
        type: 'tsumo',
        id: ctx.player.id,
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
          if (this.round.players[id].isDealer) {
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
              if (this.round.players[other].isDealer) {
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
          type: 'hoapai',
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
    if (!action) throw new MahjongError('unreachable', 'next: 当前这一家没有可选的动作')
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
    // roundEnd 返回 true = 还想打下一局；整场已经结束（canNextRound 为 false）时库不接续
    if (this.roundEnd(end, this.canNextRound())) this.nextRound()
  }

  // 整场是否还能再打一局（被飞 / 西入超分 / 南四局结束 → false）。看的是 lastEnd 与当前分数
  private canNextRound(): boolean {
    const end = this.lastEnd
    // 被飞了
    if (this.score.some(score => score < 0)) {
      return false
    }
    // 西入后只要有人分数超过 30000 则结束
    if (this.bakaze === 'sha' && this.score.some(score => score > 30000)) {
      return false
    }
    // 南四局庄家垫底（其他三家都比庄家分高）就不打了
    if (this.bakaze === 'nan' && this.kyoku === 4) {
      const dealerScore = this.score[this.round.dealer]
      if (playerIds.every(id => this.round.players[id].isDealer || this.score[id] > dealerScore)) {
        return false
      }
    }
    // 西、南四局如果是闲家和牌（庄家没连庄）则结束（不会北入）
    if (['nan', 'sha'].includes(this.bakaze) && this.kyoku === 4 && !this.oyaRepeats()) {
      return false
    }
    return true
  }

  // 本局结束后庄家是否连庄（和牌者有庄家，或者荒牌流局庄家听牌）
  private oyaRepeats(): boolean {
    const end = this.lastEnd
    let oya = false
    if (end.type === 'hora') {
      oya = end.hora.some(hora => this.round.players[hora.id].isDealer)
    } else if (end.type === 'ryuukyoku' && end.ryuukyoku.type === 'hoapai') {
      oya = end.ryuukyoku.tenpai.some(id => this.round.players[id].isDealer)
    }
    return oya
  }

  // 本局结束后推进：连庄（本场棒 +1）、进下一局（庄家轮转）、进下一场（场风推进），
  // 或者返回 false 表示整场结束（被飞 / 西入超分 / 南四局结束）
  nextRound(): boolean {
    if (!this.canNextRound()) return false
    // 这一局的庄家（createRound 会把 round 换掉，先记下来）
    const dealer = this.round.dealer
    if (this.oyaRepeats()) {
      this.homba++
      this.createRound(dealer)
    } else if (this.kyoku < 4) {
      this.kyoku++
      this.createRound(nextId(dealer))
    } else {
      this.kyoku = 1
      this.bakaze = shimocha(this.bakaze)
      this.createRound(nextId(dealer))
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
            type: 'suukansanra',
          },
        })
        return false
      }
    }
    return true
  }
  
  private createRound(dealer: PlayerId) {
    // 按当前场风与庄家开新的一局，牌山交给 createTiles（不传则用默认打乱的一副）
    this.round = new Round(this.bakaze, dealer, this.createTiles?.(dealer, this.kyoku, this.homba))
  }
}
