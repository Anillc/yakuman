import { Action, ActionType, Kan, Kaze, Player, PlayerId, Round, Tile, playerIds } from './round.js'
import { MahjongError, TileKind, nextId, shimocha } from './utils.js'
import { HoraResult } from './yaku.js'

export * from './round.js'
export * from './tenpai.js'
export * from './utils.js'
export * from './yaku.js'

// 规则补充（调用方会碰到的）：
// - 食い替え禁止：刚鸣的那张（吃的话还有同筋的另一端）不能马上打，挂在 ctx.kuikae 上
// - 吃、碰之后这一巡不能杠（所以要先把 ctx.types 里的 kan 当成"摸牌后才可能有"）
// - 包（責任払い）默认关，见 MahjongOptions.pao
//
// 牌局由调用方"拉"着走：
//
//   for await (const step of mahjong.steps()) {
//     if (step.type === 'roundEnd') { ...看结果...; continue }   // 再取下一个 step = 打下一局
//     for (const slot of step.slots) {
//       if (step.apply(slot.ctx, await ask(slot))) break         // 这一圈定了就不用问剩下的
//     }
//   }
//
// 库本身是同步状态机，不 await 任何东西 —— 所以两步之间想等多久都行（等网络、等弹窗、等人工输入），
// 想只打一局就别再取下一个 step。动作必须来自 ctx.types、候选必须来自 ctx 给出的候选列表，
// 而且要按 slots 的顺序回答：误用一律抛 MahjongError（code 一览见 utils.ts）。

// 某一家当前可以做的操作（只读视图）。
// types 里是该家可用的动作，候选（能吃/碰的牌组、能杠的 kans、和牌的役与基本点）挂在对应字段上。
// 动作通过 Prompt.apply(ctx, decision) 提交，decision 见下方的 Decision。
export class MahjongContext implements Action {
  types: Set<ActionType>
  chiTiles?: Tile[][]
  ponTiles?: Tile[][]
  kans?: Kan[]
  kuikae?: TileKind[]
  hora?: HoraResult

  round: Round

  constructor(
    public player: Player,
    action: Action,
  ) {
    this.round = player.round
    Object.assign(this, action)
  }
}

// 一圈询问里的一格：
//   phase = 'ron'   问这一家"要不要荣和这张牌"（能和的人才会有这一格，可多家）
//   phase = 'claim' 问这一家"要不要碰/明杠/吃这张牌"（能吃碰杠的人才有）
//   phase = 'turn'  自家回合（刚摸完牌或刚吃碰完），问"这一手做什么"
// 能荣和的人想改成碰/杠/吃时，会先有一格 'ron' 再有一格 'claim'：先答跳过、再答要牌。
export interface PromptSlot {
  ctx: MahjongContext
  phase: 'ron' | 'claim' | 'turn'
}

// 一次询问：slots 按顺序回答。
// 顺序是库排的：先问能和的人（荣和能多家），再问碰/明杠，最后问吃。
// apply() 返回 true = 这一圈已经定了，剩下的不用再问；false = 这一格答了，接着问下一格。
// 动作不合法（不在 ctx.types、候选不对、顺序不对）会抛 MahjongError，那一家还算没答过，可以重问。
export interface Prompt {
  type: 'prompt'
  slots: PromptSlot[]
  // 现在等回答的那一格（这一圈答完 / 已经定了就是 null）。
  // 分几次拿 step 时用它取"该答哪一格"，不要每次都从 slots[0] 重来。
  readonly current: PromptSlot | null
  apply(ctx: MahjongContext, decision: Decision): boolean
}

// 一局结束。想要下一局就继续取下一个 step（不取就是到此为止）
export interface RoundEnd {
  type: 'roundEnd'
  end: MahjongEnd
  // 整场还能不能继续（被飞 / 西入超分 / 南四局结束时为 false）
  canContinue: boolean
}

export type Step = Prompt | RoundEnd

// 流局的种类（id 用罗马音，方便比较；要给人看请自己准备文案）
//   hoapai       荒牌流局（牌山摸完）
//   kyuushu      九種九牌
//   suuchaRiichi 四家立直
//   sufurenda    四風連打
//   suukansanra  四槓散了
export type RyuukyokuType = 'hoapai' | 'kyuushu' | 'suuchaRiichi' | 'sufurenda' | 'suukansanra'

export class MahjongEnd {
  type: 'hora' | 'ryuukyoku'
  // 和牌者（可多家）：和牌结果（役与基本点）加上这一家实际收/付的点数
  hora?: ({ type: 'tsumo' | 'ron', id: PlayerId, score: number, pao?: PlayerId } & HoraResult)[]
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

// 一家的决策：提交给 Prompt.apply(ctx, decision)
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

export interface MahjongOptions {
  // 可选：自定义牌山生成（庄家座位、第几局、本场棒），用于测试或复盘
  createTiles?: (dealerId: PlayerId, kyoku: number, homba: number) => Tile[]
  // 可选：多家荣和。false（默认）= 頭ハネ，只有离放铳者最近的那家和；true = 每家和牌者都收
  multipleRon?: boolean
  // 可选：包（責任払い）。false（默认）= 不包，和了按普通算；
  // true = 大三元 / 大四喜 / 四槓子 被鸣确定后和了这手役满，点数全由责任者一个人付
  // （荣和时放铳者不付，自摸时三家该付的都归责任者；MahjongEnd.hora[].pao 里记着是谁）
  pao?: boolean
}

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
  lastEnd: MahjongEnd
  multipleRon = false
  pao = false

  // 下一个要交给调用方的 step（一个询问，或一次局终）
  private pending: Step | null = null
  private createTiles?: MahjongOptions['createTiles']

  constructor(options?: MahjongOptions) {
    this.createTiles = options?.createTiles
    if (options?.multipleRon !== undefined) this.multipleRon = options.multipleRon
    if (options?.pao !== undefined) this.pao = options.pao
    // 起家是 0 号，之后由 nextRound() 轮转
    this.createRound(0)
    this.next()
  }

  // 本局的庄家（唯一来源是 round.dealer，外面改不了；起家固定 0 号，之后连庄/轮转都走 nextRound）
  get dealer(): PlayerId {
    return this.round.dealer
  }

  // 逐步驱动：每次拿到一个 Step，回答完（局终就是看完）再取下一个。
  // "继续下一局"就是再取一个 step；不再取 = 整场到此为止。
  async *steps(): AsyncGenerator<Step, void, void> {
    while (this.pending) {
      const step = this.pending
      // 询问：没答完（apply 一直返回 false）就还是这一圈，调用方可以分几次拿
      if (step.type === 'prompt') {
        yield step
        continue
      }
      // 局终：再取一个 step 就是"打下一局"
      this.pending = null
      yield step
      if (step.canContinue) this.nextRound()
    }
  }

  // 一把打完：每一步都交给 choose（可以是 async），局终交给 onRoundEnd
  // （返回 false 就停下，只想打一局就写成 () => false）。返回最终分数。
  async playToEnd(
    choose: (ctx: MahjongContext) => Decision | undefined | Promise<Decision | undefined>,
    onRoundEnd?: (end: MahjongEnd, canContinue: boolean) => boolean | void,
  ): Promise<number[]> {
    for await (const step of this.steps()) {
      if (step.type === 'roundEnd') {
        if (onRoundEnd?.(step.end, step.canContinue) === false) break
        continue
      }
      for (const slot of step.slots) {
        // choose 没给动作就当作 pass（自家回合没有 pass，库里会抛 action-not-allowed）
        const decision = (await choose(slot.ctx)) ?? { action: 'pass' } as const
        if (step.apply(slot.ctx, decision)) break
      }
    }
    return this.score
  }

  // 一次询问：答到哪一格、收到了哪些荣和，这些状态放在闭包里。
  // 每一格是"某一家 + 这一刻问什么"：荣和单独一格，鸣牌再单独一格，所以能荣和的人会被问两次。
  // 自家回合（这一家没有 pass）就只有一格，问要打什么。
  private createPrompt(ctxs: MahjongContext[], drawer?: PlayerId): Prompt {
    const slots: PromptSlot[] = []
    if (ctxs.every(ctx => !ctx.types.has('pass'))) {
      slots.push({ ctx: ctxs[0], phase: 'turn' })
    } else {
      for (const ctx of ctxs) if (ctx.types.has('ron')) slots.push({ ctx, phase: 'ron' })
      for (const ctx of ctxs) if (ctx.types.has('pon') || ctx.types.has('kan')) slots.push({ ctx, phase: 'claim' })
      for (const ctx of ctxs) if (ctx.types.has('chi') && !ctx.types.has('pon') && !ctx.types.has('kan')) {
        slots.push({ ctx, phase: 'claim' })
      }
    }
    let index = 0
    let finished = false
    const ronners: MahjongContext[] = []
    // 一家答完之后的结算：荣和只要"能和的都答完了"就能定（剩下的鸣牌格不用再问）；
    // 都没要（也没人荣和）且没有格子了 → 收尾
    const settle = (): boolean => {
      if (ronners.length !== 0 && !slots.slice(index).some(slot => slot.phase === 'ron')) {
        finished = true
        this.ron(ronners)
        return true
      }
      if (index < slots.length) return false
      finished = true
      this.passAll(ctxs, drawer)
      return true
    }
    return {
      type: 'prompt',
      slots,
      get current() {
        return finished ? null : slots[index] ?? null
      },
      apply: (ctx, decision) => {
        if (finished) throw new MahjongError('prompt-done', '这一圈已经定了，不用再回答')
        const slot = slots[index]
        if (slot?.ctx !== ctx) {
          const expect = slot?.ctx
          throw new MahjongError('out-of-order', `请按 slots 的顺序回答：现在该 ${expect ? `${expect.player.id} 家` : '（没有人）'}`)
        }
        // 跳过：还有人没问就继续问，全问完才收尾（见逃、抢杠补岭上、继续摸牌）
        if (decision.action === 'pass') {
          if (!ctx.types.has('pass')) {
            throw new MahjongError('action-not-allowed', '跳过: 轮到自家打牌时不能跳过')
          }
          index++
          return settle()
        }
        // 荣和：要等能和的人全答完才能定（頭ハネ挑离放铳者最近的，多家荣和要收齐）
        if (decision.action === 'ron') {
          if (!ctx.types.has('ron')) throw new MahjongError('action-not-allowed', '荣和: 现在不能荣和')
          if (slot.phase !== 'ron') {
            throw new MahjongError('out-of-order', '这一格问的是要不要吃碰杠：荣和在前面那一格已经答过跳过了')
          }
          ronners.push(ctx)
          index++
          return settle()
        }
        // 要牌（吃碰杠）与自家动作：不能抢在还没回答的荣和前头。
        // 先执行再记"答过"：动作不合法会抛错（比如候选不对），这一格还算没答，可以重问。
        if (slots.slice(index).some(slot => slot.phase === 'ron')) {
          throw new MahjongError('out-of-order', '还有人没答完荣和，先问完他们')
        }
        this.applyDecision(ctx, decision)
        index++
        finished = true
        return true
      },
    }
  }

  // 全都没要（不吃碰杠和）：能和却不和的记见逃（同巡振听），然后继续摸牌；
  // drawer 非空表示刚才问的是抢杠，没人抢就由开杠的那家补一张岭上牌。
  private passAll(ctxs: MahjongContext[], drawer?: PlayerId) {
    if (!this.checkKan()) return
    for (const ctx of ctxs) {
      if (ctx.types.has('ron')) this.round.minogashi(ctx.player.id)
    }
    if (drawer) {
      this.mopai(true, drawer, true)
    } else {
      this.mopai()
    }
  }

  private applyDecision(ctx: MahjongContext, decision: Decision) {
    switch (decision.action) {
      case 'tedashi': return this.tedashi(ctx, decision.tile, decision.riichi)
      case 'tsumogiri': return this.tsumogiri(ctx, decision.riichi)
      case 'chi': return this.chi(ctx, decision.candidate)
      case 'pon': return this.pon(ctx, decision.candidate)
      case 'kan': return this.kan(ctx, decision.kan)
      case 'tsumo': return this.tsumo(ctx)
      case 'ryuukyoku': return this.ryuukyoku(ctx)
      case 'ron':
      case 'pass':
        throw new MahjongError('unreachable', `${decision.action}: 这个动作由 Prompt 自己处理`)
    }
  }

  // 包（責任払い）：这一手和了被包的对象役满时，返回要全额付款的责任者。
  // 关掉包（默认）就永远返回 null，按普通和牌算（责任者是谁仍然记在 player.pao 里）
  private paoOf(ctx: MahjongContext): PlayerId | null {
    if (!this.pao) return null
    const hora = ctx.hora
    if (!hora) return null
    const entry = ctx.player.pao.find(entry => hora.yaku[entry.yaku])
    return entry ? entry.playerId : null
  }

  // 手切：只能打手牌里原有的牌（不收牌值，必须传手牌里那张 Tile 对象，
  // 这样赤 5 与普通 5、以及牌是从哪摸来的等身份信息都不会丢）。
  // 刚摸到的那张不能手切 —— 那是摸切，请改用 { action: 'tsumogiri' }。
  private tedashi(ctx: MahjongContext, tile: Tile, riichi?: boolean) {
    if (!ctx.types.has('tedashi')) throw new MahjongError('action-not-allowed', '手切: 现在不能手切（立直中只能摸切，吃碰之后只能手切）')
    if (ctx.player.riichi) throw new MahjongError('action-not-allowed', '手切: 立直中只能摸切（用 tsumogiri）')
    if (!ctx.player.tiles.includes(tile)) throw new MahjongError('tile-not-in-hand', '手切: 这张牌不在手牌里')
    if (!this.round.kiru && tile === ctx.player.tiles.at(-1)) {
      throw new MahjongError('tedashi-drawn-tile', '手切: 打的是刚摸到的牌，请改用摸切')
    }
    this.discard(ctx, tile, riichi)
  }

  private tsumogiri(ctx: MahjongContext, riichi?: boolean) {
    if (!ctx.types.has('tsumogiri')) throw new MahjongError('action-not-allowed', '摸切: 现在不能摸切（吃过、碰过之后请用手切）')
    this.discard(ctx, ctx.player.tiles.at(-1), riichi)
  }

  private discard(ctx: MahjongContext, tile: Tile, riichi?: boolean) {
    if (riichi) {
      if (!ctx.types.has('riichi')) throw new MahjongError('action-not-allowed', '立直: 现在不能立直')
      if (!ctx.player.waitsAfterDiscard(tile)) {
        throw new MahjongError('riichi-not-tenpai', '立直: 打这张之后不听牌')
      }
    }
    this.round.dahai(tile, riichi)
    // 打完之后问其余三家要不要吃碰杠和，并顺带判定四家立直 / 四风连打
    if (riichi && this.round.players.every(player => player.riichi)) {
      this.end({ type: 'ryuukyoku', ryuukyoku: { type: 'suuchaRiichi' } })
    } else if (this.round.sufurenda === true) {
      this.end({ type: 'ryuukyoku', ryuukyoku: { type: 'sufurenda' } })
    } else {
      this.naki()
    }
  }

  // 吃碰杠都直接传候选本身（chiTiles / ponTiles / kans 里的那一项）。
  // 库用同一性校验：不在候选列表里（或拿着过期的候选）就抛错。
  private candidate<T>(list: T[] | undefined, pick: T, what: string): T {
    if (!list?.includes(pick)) throw new MahjongError('not-candidate', `${what}: 这个候选不在候选列表里`)
    return pick
  }

  private what(kan: Kan) {
    return { minkan: '明杠', ankan: '暗杠', chakan: '加杠' }[kan?.type] ?? '杠'
  }

  // 吃、碰都不摸牌：更新牌局状态后直接 next()，由这家自己打一张
  private chi(ctx: MahjongContext, candidate: Tile[]) {
    if (!ctx.types.has('chi')) throw new MahjongError('action-not-allowed', '吃: 现在不能吃')
    this.round.chi(this.candidate(ctx.chiTiles, candidate, '吃'))
    this.next()
  }

  private pon(ctx: MahjongContext, candidate: Tile[]) {
    if (!ctx.types.has('pon')) throw new MahjongError('action-not-allowed', '碰: 现在不能碰')
    this.round.pon(ctx.player.id, this.candidate(ctx.ponTiles, candidate, '碰'))
    this.next()
  }

  // 杠：传 ctx.kans 里的那一项，type 决定是明杠、暗杠还是加杠
  // - 明杠补的牌在 Round.minkan 里，所以不用再调 mopai
  // - 暗杠、加杠先问一圈有没有人抢杠（国士无双可抢暗杠），没人抢才补牌
  private kan(ctx: MahjongContext, kan: Kan) {
    if (!ctx.types.has('kan')) throw new MahjongError('action-not-allowed', `${this.what(kan)}: 现在不能杠`)
    this.candidate(ctx.kans, kan, this.what(kan))
    if (kan.type === 'minkan') {
      this.round.minkan(ctx.player.id, kan.tiles)
      this.next()
    } else if (kan.type === 'ankan') {
      this.round.ankan(kan.tiles)
      this.naki(true, true)
    } else {
      this.round.chakan(kan.tiles[0])
      this.naki(true)
    }
  }

  // 宣告九种九牌流局（只能在第一巡、且没有任何人鸣牌时）
  private ryuukyoku(ctx: MahjongContext) {
    if (!ctx.types.has('ryuukyoku')) throw new MahjongError('action-not-allowed', '九种九牌: 现在不能宣告')
    this.end({
      type: 'ryuukyoku',
      ryuukyoku: {
        type: 'kyuushu',
        id: ctx.player.id,
      },
    })
  }

  private ron(ctxs: MahjongContext[]) {
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
      // 包（責任払い）：被包的那手役满和了时，点数全由责任者付（放铳者不付）
      const pao = this.paoOf(ctx)
      const payer = pao ?? furikomi
      this.score[payer] -= score
      if (closestWinner === ctx.player.id) {
        // 本场的立直棒由放铳者（被包时就是责任者）承担（等价于立直者先付、再收回）
        const kyotaku = this.homba * 300 + this.round.players.filter(player => player.riichi).length * 1000
        score += kyotaku
        this.score[payer] -= kyotaku
        // 桌上已有的立直棒是之前流局时从立直者扣过的，直接给和牌者，不再向放铳者收
        score += this.riichibo * 1000
      }
      horaList.push({
        ...hora,
        type: 'ron',
        id: ctx.player.id,
        score,
        ...pao !== null ? { pao } : {},
      })
      this.score[ctx.player.id] += score
    }
    this.end({
      type: 'hora',
      hora: horaList,
    })
  }

  private tsumo(ctx: MahjongContext) {
    if (!ctx.types.has('tsumo')) throw new MahjongError('action-not-allowed', '自摸: 现在不能自摸')
    const hora = ctx.hora!
    const oya = ctx.player.isDealer
    // 每家支付额各自向上取整到百点：庄家 2a、闲家 a；庄家自摸时三家都付 2a
    const dealerPay = Math.ceil(2 * hora.points / 100) * 100
    const nonDealerPay = Math.ceil(hora.points / 100) * 100
    // 包（責任払い）：被包的那手役满自摸时，三家该付的都由责任者一个人付
    const pao = this.paoOf(ctx)
    let score = 0
    for (const id of playerIds) {
      if (this.round.players[id].riichi) {
        // 自家的立直棒将会在后面加回来
        this.score[id] -= 1000
      }
      if (id === ctx.player.id) continue
      const pay = oya || this.round.players[id].isDealer ? dealerPay : nonDealerPay
      if (pao === null) this.score[id] -= pay + 100 * this.homba
      score += pay
    }
    if (pao !== null) {
      // 三家本该各付 pay + 本场 100，全由责任者出
      this.score[pao] -= score + 300 * this.homba
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
        ...pao !== null ? { pao } : {},
      }],
    })
  }

  // isRinshan 表示这次是杠后的补牌（岭上开花）
  private mopai(keepTurn?: boolean, id?: PlayerId, isRinshan?: boolean) {
    if (this.round.rest === 0) {
      const tenpaiIds = playerIds.filter(id => this.round.players[id].waits)
      const mangan = playerIds.filter(id => this.round.players[id].ryuukyokuMangan)
      if (mangan.length !== 0) {
        const basePoints = 2000
        for (const id of mangan) {
          if (this.round.players[id].isDealer) {
            this.score[id] += 6 * basePoints
            for (const other of playerIds) {
              if (other === id) continue
              this.score[other] -= 2 * basePoints
            }
          } else {
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

  // 这一家可以操作了（可能是刚摸完牌，也可能是刚吃完/碰完没摸牌）：把询问挂起来
  private next() {
    const id = this.round.currentId
    const action = this.round.action(id)
    if (!action) throw new MahjongError('unreachable', 'next: 当前这一家没有可选的动作')
    this.pending = this.createPrompt([new MahjongContext(this.round.player, action)])
  }

  // 有人打牌（或开杠）后，问其余几家要不要吃、碰、杠、和；
  // 都没人要就继续摸牌（牌山摸完时由 mopai() 走荒牌流局）
  private naki(isKan?: boolean, isAnkan?: boolean) {
    const others = playerIds.filter(id => id !== this.round.currentId)
    const ctxs: MahjongContext[] = []
    for (const id of others) {
      const action = this.round.action(id, isKan, isAnkan)
      if (!action) continue
      ctxs.push(new MahjongContext(this.round.players[id], action))
    }
    if (ctxs.length === 0) {
      if (this.checkKan()) {
        if (isKan) {
          // 杠的补牌（岭上）
          this.mopai(true, this.round.currentId, true)
        } else {
          this.mopai()
        }
      }
      return
    }
    // 先问能和的人（可以多家），再问碰/明杠，最后问吃；同一档按玩家编号
    const tier = (ctx: MahjongContext) =>
      ctx.types.has('ron') ? 0 : ctx.types.has('pon') || ctx.types.has('kan') ? 1 : 2
    ctxs.sort((a, b) => tier(a) - tier(b) || a.player.id - b.player.id)
    // 开杠被人见逃后，由开杠的那一家补岭上牌
    this.pending = this.createPrompt(ctxs, isKan ? this.round.currentId : undefined)
  }

  private end(end: MahjongEnd) {
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
    // 把局终交给调用方：还能不能继续也一起告诉它（要不要继续 = 要不要再取下一个 step）
    this.pending = { type: 'roundEnd', end, canContinue: this.canNextRound() }
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
  private nextRound(): boolean {
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
    this.round = new Round(this.bakaze, dealer, this.createTiles?.(dealer, this.kyoku, this.homba))
  }
}
