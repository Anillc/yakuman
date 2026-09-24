import { Action, ActionType, Kan, Kaze, PaoYaku, Player, PlayerId, Round, Tile, playerIds } from './round.js'
import { MahjongError, TileKind, nextId, shimocha } from './utils.js'
import { HoraResult, basicPoints } from './yaku.js'

export * from './round.js'
export * from './tenpai.js'
export * from './utils.js'
export * from './yaku.js'

// 规则补充（调用方会碰到的）：
// - 食い替え禁止：刚鸣的那张（吃的话还有同筋的另一端）不能马上打，挂在 ctx.kuikae 上
// - 吃、碰之后这一巡不能杠（所以要先把 ctx.types 里的 kan 当成"摸牌后才可能有"）
// - 包（責任払い）默认开（M.League 第8章第1条），见 MahjongOptions.pao
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
  // pao = 包（責任払い）时喂牌的责任者；责任只承担被鸣确定的那手役满，其余照常结算
  hora?: ({ type: 'tsumo' | 'ron', id: PlayerId, score: number, pao?: PlayerId } & HoraResult)[]
  ryuukyoku?: {
    type: RyuukyokuType
    // 荒牌流局
    tenpai?: PlayerId[]
    // 荒牌流局的流局满贯：实际结算的人（多家时按 頭ハネ 只留一家，multipleRon 打开时全部列出）。
    // 按流局算，只结算基本点，本场棒/立直棒留在桌上（见 Mahjong.mopai 的注释）
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
  // 可选：自定义牌山生成（庄家座位、第几局、本场棒），用于测试或复盘。
  // 返回 136 张、按摸牌顺序排：前 52 张当配牌、末尾 14 张当王牌（岭上牌 + 宝牌指示牌）
  createTiles?: (dealerId: PlayerId, kyoku: number, homba: number) => Tile[]
  // 可选：多家荣和。false（默认，M.League 第5章第1条：一局只能有一家和，頭ハネ）= 只有离放铳者最近的那家和；
  // true = 每家和牌者都收
  multipleRon?: boolean
  // 可选：包（責任払い）。true（默认，M.League 第8章第1条）= 包生效，对象是大三元 / 大四喜 / 四槓子。
  // 责任只承担被鸣确定的那手役满：自摸时那手役满三家该付的全由责任者出（責任払い），
  // 别家放铳时责任者与放铳者各出一半（折半払い）——双倍役满以上时被鸣确定的那手役满仍是这个算法，
  // 其余役满部分按普通和牌结算（含本场棒由鸣牌者负担）。
  // false = 不包，和了按普通算。责任者是谁仍然记在 MahjongEnd.hora[].pao 里
  pao?: boolean
  // —— 规则开关（不传就用这里的默认值；默认按 M.League 官方规则，条文出处见注释）——
  // 赤牌枚数：0 = 无赤牌，3（默认，第1章第2条「5萬・5筒・5索の各1枚」），4 = 再加一张赤 5m
  redFives?: 0 | 3 | 4
  // 食断：true（默认，第9章把断么九列为非门前役）= 副露也认断幺九；false = 只有门清才认
  kuidashiTanyao?: boolean
  // 切上满贯：true（默认，第6章第6条满贯含「30符6翻」「60符5翻」，含场ゾロ即 4 番 30 符 / 3 番 60 符）
  // false = 这两种按 7700（亲 11600）算
  kiriageMangan?: boolean
  // 流局满贯（流し満貫）：false（默认，规则条文里没有这一条）= 不成立，按普通荒牌流局结算；true = 有
  nagashiMangan?: boolean
  // 双倍役满：false（默认，第9章役满表没有单列这几种）= 四暗刻单骑 / 国士13面 / 纯正九莲 / 大四喜 按 13 番；
  // true = 按 26 番
  doubleYakuman?: boolean
  // 途中流局（九種九牌 / 四風連打 / 四家立直 / 四槓散了）：false（默认，第3章第2条「途中流局はない」）= 不发生
  abortiveDraws?: boolean
  // 被飞：false（默认，第3章第2条「持ち点が無くなった場合でも最終局が終了するまで続行」）
  bustEndsGame?: boolean
  // 数え役满：false（默认，第6章第6条「役満以外の役が複合したアガリ点は三倍満まで」）；true = 13 番以上按役满
  kazoeYakuman?: boolean
  // 0 张可抽的听牌（听牌张都被自己的手牌/副露吃掉）：false（默认，第3章第11条「認められない」）
  zeroWaitTenpai?: boolean
  // 立直要求牌山还剩 ≥4 张：false（默认，第4章第8条只禁止「摸到海底牌之后立直」）；true = 另一些规则的 4 张限制
  riichiNeedsFourTiles?: boolean
  // 国士无双抢暗杠：false（默认，第4章第5条「いかなる場合でも、暗槓の搶槓は成立しない」）；true = 认这条本地规则
  kokushiAnkanChankan?: boolean
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
  pao = true
  // 规则开关（默认值见 MahjongOptions 的注释；给空就是这里的默认）
  redFives: 0 | 3 | 4 = 3
  kuidashiTanyao = true
  kiriageMangan = true
  nagashiMangan = false
  doubleYakuman = false
  abortiveDraws = false
  bustEndsGame = false
  kazoeYakuman = false
  zeroWaitTenpai = false
  riichiNeedsFourTiles = false
  kokushiAnkanChankan = false

  // 下一个要交给调用方的 step（一个询问，或一次局终）
  private pending: Step | null = null
  private createTiles?: MahjongOptions['createTiles']

  constructor(options?: MahjongOptions) {
    this.createTiles = options?.createTiles
    if (options?.multipleRon !== undefined) this.multipleRon = options.multipleRon
    if (options?.pao !== undefined) this.pao = options.pao
    if (options?.redFives !== undefined) this.redFives = options.redFives
    if (options?.kuidashiTanyao !== undefined) this.kuidashiTanyao = options.kuidashiTanyao
    if (options?.kiriageMangan !== undefined) this.kiriageMangan = options.kiriageMangan
    if (options?.nagashiMangan !== undefined) this.nagashiMangan = options.nagashiMangan
    if (options?.doubleYakuman !== undefined) this.doubleYakuman = options.doubleYakuman
    if (options?.abortiveDraws !== undefined) this.abortiveDraws = options.abortiveDraws
    if (options?.bustEndsGame !== undefined) this.bustEndsGame = options.bustEndsGame
    if (options?.kazoeYakuman !== undefined) this.kazoeYakuman = options.kazoeYakuman
    if (options?.zeroWaitTenpai !== undefined) this.zeroWaitTenpai = options.zeroWaitTenpai
    if (options?.riichiNeedsFourTiles !== undefined) this.riichiNeedsFourTiles = options.riichiNeedsFourTiles
    if (options?.kokushiAnkanChankan !== undefined) this.kokushiAnkanChankan = options.kokushiAnkanChankan
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
    // 没人抢杠 → 这一杠成立（成立之后才翻杠宝牌、才破一発、才判四槓散了）
    if (drawer !== undefined) this.round.establishKan()
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

  // 包（責任払い）：这一手和了被包的对象役满时，返回被确定的那个役满和喂牌的责任者。
  // 关掉包就永远返回 null，按普通和牌算（责任者是谁仍然记在 player.pao 里）
  private paoOf(ctx: MahjongContext): { yaku: PaoYaku, playerId: PlayerId } | null {
    if (!this.pao) return null
    const hora = ctx.hora
    if (!hora) return null
    return ctx.player.pao.find(entry => hora.yaku[entry.yaku]) ?? null
  }

  // 被包的那手役满单独值多少基本点（开双倍役满时大四喜算 2 倍役满）。
  // 和牌点是役满之和，所以剩余部分 = hora.points - 这个值
  private paoBasicPoints(ctx: MahjongContext, pao: PaoYaku) {
    return basicPoints(ctx.hora!.yaku[pao]!, ctx.hora!.yaku.fu)
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
    // 途中流局（四家立直 / 四風連打）只在 abortiveDraws 打开时成立（M.League 没有途中流局）
    if (this.abortiveDraws && riichi && this.round.players.every(player => player.riichi)) {
      this.end({ type: 'ryuukyoku', ryuukyoku: { type: 'suuchaRiichi' } })
    } else if (this.abortiveDraws && this.round.sufurenda === true) {
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
  // - 暗杠、加杠先问一圈有没有人抢杠（默认只有加杠能被抢；国士抢暗杠要开 kokushiAnkanChankan），
  //   没人抢的话由 Round.establishKan() 把这一杠坐实，再补岭上牌
  private kan(ctx: MahjongContext, kan: Kan) {
    if (!ctx.types.has('kan')) throw new MahjongError('action-not-allowed', `${this.what(kan)}: 现在不能杠`)
    this.candidate(ctx.kans, kan, this.what(kan))
    if (kan.type === 'minkan') {
      // 明杠不会被抢，但可能是第 4 个槓（四槓散了）：先做杠、判流局，没人流局才补岭上
      this.round.minkan(ctx.player.id, kan.tiles, false)
      if (this.checkKan()) this.mopai(true, ctx.player.id, true)
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
      // 荣和时一家该付多少：庄家 6a、闲家 4a，向上取整到百点
      const ronPay = (points: number) => Math.ceil((oya ? 6 : 4) * points / 100) * 100
      // 包（責任払い）：责任者只承担被鸣确定的那手役满，其余（双倍役满以上时的其它役满）
      // 按普通荣和算，全由放铳者出
      const pao = this.paoOf(ctx)
      const payer = pao?.playerId ?? furikomi
      // 被包的那手役满单独值多少（没有包时是 0，整手都算「其余部分」）
      const paoPart = pao === null ? 0 : ronPay(this.paoBasicPoints(ctx, pao.yaku))
      const restPart = ronPay(hora.points) - paoPart
      let score = ronPay(hora.points)
      if (pao === null || pao.playerId === furikomi) {
        // 鸣牌的人自己放铳：全付
        this.score[payer] -= score
      } else {
        // 包 + 别家放铳 → 被鸣确定的那手役满折半（M.League 第8章第1条「別の放銃者がいたら折半払い」）
        const half = Math.ceil(paoPart / 2 / 100) * 100
        this.score[pao.playerId] -= half
        this.score[furikomi] -= (paoPart - half) + restPart
      }
      if (closestWinner === ctx.player.id) {
        // 本场棒由放铳者（被包时就是责任者）出，和自摸一样每家 100 点
        const homba = this.homba * 300
        score += homba
        this.score[payer] -= homba
        // 立直棒由立直者自己出（和 tsumo 一致），和牌者收；放铳者不替别人付
        for (const player of this.round.players) {
          if (player.riichi) this.score[player.id] -= 1000
        }
        // 桌上已有的立直棒是之前流局时从立直者扣过的，直接给和牌者，不再向放铳者收
        score += (this.riichibo + this.round.players.filter(player => player.riichi).length) * 1000
      }
      horaList.push({
        ...hora,
        type: 'ron',
        id: ctx.player.id,
        score,
        ...pao !== null ? { pao: pao.playerId } : {},
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
    // 自摸时一家该付多少：庄家 2a、闲家 a；庄家自摸时三家都付 2a；各自向上取整到百点
    const tsumoPay = (points: number, id: PlayerId) =>
      Math.ceil((oya || this.round.players[id].isDealer ? 2 : 1) * points / 100) * 100
    // 包（責任払い）：责任者一个人出被鸣确定的那手役满（自摸＝責任払い），
    // 其余（双倍役满以上时的其它役满）按普通自摸分摊，本场棒也由责任者出
    const pao = this.paoOf(ctx)
    const paoPart = pao === null ? 0 : this.paoBasicPoints(ctx, pao.yaku)
    const restPart = hora.points - paoPart
    let score = 0
    for (const id of playerIds) {
      if (this.round.players[id].riichi) {
        // 自家的立直棒将会在后面加回来
        this.score[id] -= 1000
      }
      if (id === ctx.player.id) continue
      // 没包就是整手；有包就只分摊除了被鸣那手役满以外的部分
      const pay = tsumoPay(pao === null ? hora.points : restPart, id)
      this.score[id] -= pao === null ? pay + 100 * this.homba : pay
      score += pay
    }
    if (pao !== null) {
      // 被鸣确定的那手役满按自摸收多少（三家各付 2a/a），全由责任者出，本场棒也归他
      const paoPay = playerIds.reduce((acc, id) =>
        id === ctx.player.id ? acc : acc + tsumoPay(paoPart, id), 0)
      this.score[pao.playerId] -= paoPay + 300 * this.homba
      score += paoPay
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
        ...pao !== null ? { pao: pao.playerId } : {},
      }],
    })
  }

  // isRinshan 表示这次是杠后的补牌（岭上开花）
  private mopai(keepTurn?: boolean, id?: PlayerId, isRinshan?: boolean) {
    if (this.round.rest === 0) {
      // 听牌：0 张可抽的听牌（听牌张都被自己手牌/副露吃掉）按 M.League 第3章第11条不算听牌
      const tenpaiIds = playerIds.filter(id => {
        const waits = this.round.players[id].waits
        return !!waits && (this.zeroWaitTenpai || waits.length !== 0)
      })
      // 流局满贯：关掉这个规则时按普通荒牌流局结算（听牌料照付）
      let mangan = this.nagashiMangan ? playerIds.filter(id => this.round.players[id].ryuukyokuMangan) : []
      // 多家流满和多家和牌共用开关：默认頭ハネ（从亲按顺位找第一家），multipleRon = true 时几家一起结算
      if (mangan.length > 1 && !this.multipleRon) {
        let closest = this.round.dealer
        while (!mangan.includes(closest)) closest = nextId(closest)
        mangan = [closest]
      }
      if (mangan.length !== 0) {
        // 流し満貫按流局处理：只算基本点（满贯 2000），本场棒和立直棒这些场供不动（棒留在桌上）
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
    // 立直要 1000 点以上。分数是 Mahjong 这边的状态（Round 看不到），所以在交给调用方之前摘掉；
    // 动作本身的校验在 Prompt.apply / discard 里，调用方硬传 riichi 会被 action-not-allowed 挡下
    if (this.score[id] < 1000) action.types.delete('riichi')
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
      // 没人能抢杠 → 这一杠成立（暗杠/加杠都先"预备"，到这里才真的算一杠）
      if (isKan) this.round.establishKan()
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
    const canContinue = this.canNextRound()
    // 半荘以流局收尾时，桌上剩下的立直棒归当时的第一名（第6章第2条）。
    // 和牌结束时立直棒已经被和牌者收走了（上面 riichibo = 0），这里不会动
    if (!canContinue) this.payRiichiboToTop()
    // 把局终交给调用方：还能不能继续也一起告诉它（要不要继续 = 要不要再取下一个 step）
    this.pending = { type: 'roundEnd', end, canContinue }
  }

  // 整场是否还能再打一局（被飞 / 西入超分 / 南四局结束 → false）。看的是 lastEnd 与当前分数
  private canNextRound(): boolean {
    const end = this.lastEnd
    // 被飞（M.League 没有这条：点数到负也继续打到最终局）
    if (this.bustEndsGame && this.score.some(score => score < 0)) {
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

  // 本局结束后庄家是否连庄：和牌者有庄家 / 荒牌流局庄家听牌 / 中途流局亲续投
  private oyaRepeats(): boolean {
    const end = this.lastEnd
    let oya = false
    if (end.type === 'hora') {
      oya = end.hora.some(hora => this.round.players[hora.id].isDealer)
    } else if (end.type === 'ryuukyoku') {
      // 荒牌流局（含流局满贯）看亲听不听；中途流局（九種九牌 / 四風連打 / 四家立直 / 四槓散了）亲续投
      oya = end.ryuukyoku.type === 'hoapai'
        ? end.ryuukyoku.tenpai.some(id => this.round.players[id].isDealer)
        : true
    }
    return oya
  }

  // 本局结束后推进：连庄（亲继续）、进下一局（庄家轮转）、进下一场（场风推进），
  // 或者返回 false 表示整场结束（被飞 / 西入超分 / 南四局结束）
  private nextRound(): boolean {
    if (!this.canNextRound()) return false
    // 这一局的庄家（createRound 会把 round 换掉，先记下来）
    const dealer = this.round.dealer
    const oyaRepeats = this.oyaRepeats()
    // 积木场（本场）：M.League 第3章第13条「連荘および親がノーテンで流局した際は積み場とし、
    // 以後回数と共に増やしていく」「子のアガリを以って積み棒は消滅する」
    // → 连荘（亲和了 / 亲听牌流局）和荒牌流局都 +1（亲不聴轮庄了也 +1），子和了归 0。
    // 桌上不摆 100 点棒、只用计数器（同条）；和了时按 300/本 加算、由付点方出（第6章第5条的例子）
    if (oyaRepeats || this.lastEnd.type === 'ryuukyoku') this.homba++
    else this.homba = 0
    if (oyaRepeats) {
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

  // 半荘结束（流局结尾）时把桌上的立直棒给第一名；同分就分（第6章第2条）：
  // 两人同分均分，三人按 4:3:3（1000点→400/300/300，2000点→800/600/600），四人再均分。
  // 名次相同的时候离起家（0 号）近的排前面。和牌结束时 riichibo 已经是 0，所以这里不动
  private payRiichiboToTop() {
    if (this.riichibo === 0) return
    const pot = this.riichibo * 1000
    this.riichibo = 0
    const best = Math.max(...this.score)
    const tops = playerIds.filter(id => this.score[id] === best)
      .sort((a, b) => ((a - playerIds[0] + 4) % 4) - ((b - playerIds[0] + 4) % 4))
    if (tops.length === 1) this.score[tops[0]] += pot
    else if (tops.length === 2) {
      this.score[tops[0]] += pot / 2
      this.score[tops[1]] += pot / 2
    } else if (tops.length === 3) {
      this.score[tops[0]] += pot * 0.4
      this.score[tops[1]] += pot * 0.3
      this.score[tops[2]] += pot * 0.3
    } else {
      for (const id of tops) this.score[id] += pot / tops.length
    }
  }

  // 检查四杠散了：四家合计四杠、且不是某一家独占四杠时流局。
  // 返回 true 表示没有流局（可以继续摸牌）
  private checkKan(): boolean {
    if (this.abortiveDraws && this.round.kanCount === 4) {
      // 如果某一家自己有四杠，那就不流局
      const ryuukyoku = !playerIds.some(id => {
        const player = this.round.players[id]
        // 加杠记在 pon 里，必须用 player.kanCount，不然四槓子会被当成四槓散了
        return player.kanCount === 4
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
    this.round = new Round(this.bakaze, dealer, this.createTiles?.(dealer, this.kyoku, this.homba), this.redFives)
    // 其余规则开关挂在 Round 上，和了判定 / 流局结算时读
    this.round.kuidashiTanyao = this.kuidashiTanyao
    this.round.kiriageMangan = this.kiriageMangan
    this.round.doubleYakuman = this.doubleYakuman
    this.round.kazoeYakuman = this.kazoeYakuman
    this.round.abortiveDraws = this.abortiveDraws
    this.round.riichiNeedsFourTiles = this.riichiNeedsFourTiles
    this.round.kokushiAnkanChankan = this.kokushiAnkanChankan
  }
}
