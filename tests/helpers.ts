// 测试公用的小工具：牌山、手牌、牌局驱动。
// 这里不写断言（所以不叫 *.test.ts）。
import {
  Decision, Mahjong, MahjongEnd, PlayerId, PromptSlot, Round, RuleProfile, Suit, Tile, defaultProfile, playerIds,
} from '../src/index.js'
import { HoraResult, yaku } from '../src/yaku.js'
import { TileKind, compareTileKind } from '../src/utils.js'

// "123m05p77z" → 牌种类（0 表示赤 5；z 的 1〜4 是风、5〜7 是三元）
export function parse(mpsz: string): (TileKind & { red: boolean })[] {
  const result: (TileKind & { red: boolean })[] = []
  let nums = ''
  for (const ch of mpsz) {
    if (ch >= '0' && ch <= '9') { nums += ch; continue }
    for (const n of nums) {
      const rank = n === '0' ? 5 : +n
      const red = n === '0'
      if (ch === 'z' && (rank < 1 || rank > 7)) throw new Error(`不认识的牌：${n}z（z 只到 7，1〜4 是风、5〜7 是三元）`)
      if (ch !== 'z' && (rank < 1 || rank > 9)) throw new Error(`不认识的牌：${n}${ch}`)
      if (ch === 'z') result.push({ suit: rank <= 4 ? 'kaze' : 'sangen', rank: rank <= 4 ? rank : rank - 4, red: false })
      else result.push({ suit: ch === 'm' ? 'man' : ch === 's' ? 'so' : 'pin', rank, red })
    }
    nums = ''
  }
  return result
}

export const tiles = (mpsz: string): Tile[] =>
  parse(mpsz).map(({ suit, rank, red }) => new Tile(suit, rank, red))

// 一副固定顺序的牌山（136 张）：万→索→筒→风→三元，每种 4 张、5 的第一张是赤
export function canonicalWall(): Tile[] {
  const result: Tile[] = []
  for (const suit of ['man', 'so', 'pin'] satisfies Suit[]) {
    for (let rank = 1; rank <= 9; rank++) {
      result.push(new Tile(suit, rank, rank === 5))
      for (let i = 0; i < 3; i++) result.push(new Tile(suit, rank, false))
    }
  }
  for (let rank = 1; rank <= 4; rank++) for (let i = 0; i < 4; i++) result.push(new Tile('kaze', rank, false))
  for (let rank = 1; rank <= 3; rank++) for (let i = 0; i < 4; i++) result.push(new Tile('sangen', rank, false))
  return result
}

// 从牌山里拿走指定的牌（和 canonicalWall 一样，0 = 赤 5）
export function take(mpsz: string, wall: Tile[]): Tile[] {
  const result: Tile[] = []
  for (const { suit, rank } of parse(mpsz)) {
    const index = wall.findIndex(tile => tile.suit === suit && tile.rank === rank)
    if (index === -1) throw new Error(`牌山里没有 ${mpsz}`)
    result.push(wall.splice(index, 1)[0])
  }
  return result
}

// 13 张起手牌
export function hand(mpsz: string, wall: Tile[]): Tile[] {
  const result = take(mpsz, wall)
  if (result.length !== 13) throw new Error(`${mpsz} 不是 13 张（${result.length}）`)
  return result
}

// 固定种子的牌山（洗牌用 imul，避免浮点丢低位）
export function seededWall(seed: number): Tile[] {
  const wall = canonicalWall()
  let state = seed
  const rnd = () => (state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[wall[i], wall[j]] = [wall[j], wall[i]]
  }
  return wall
}

// 直接拿来算役的牌局：牌山是固定顺序，首巡标记先关掉
export function roundOf(dealer: PlayerId = 0, rules: Partial<RuleProfile> = {}): Round {
  const round = new Round('ton', dealer, undefined, { ...defaultProfile, ...rules })
  round.firstTurnIntact = false
  const wall = canonicalWall()
  round.wanpai = wall.slice(-14)
  round.haiyama = wall.slice(52, -14)
  return round
}

// 摆一手"某家 13 张 + 副露"然后算和牌（不驱动牌局）
export function horaOf(
  round: Round, tilesStr: string, winStr: string,
  options: { ankan?: string[], minkan?: string[], melds?: string[], chakan?: string[], tsumo?: boolean, riichi?: boolean } = {},
  id: PlayerId = 0,
): HoraResult {
  const player = round.players[id]
  player.tiles = tiles(tilesStr)
  player.chi = []
  player.pon = (options.melds ?? []).map(melds => ({ tiles: tiles(melds), chakan: false }))
  player.pon.push(...(options.chakan ?? []).map(chakan => ({ tiles: tiles(chakan), chakan: true })))
  player.minkan = (options.minkan ?? []).map(minkan => tiles(minkan))
  player.ankan = (options.ankan ?? []).map(ankan => tiles(ankan))
  player.riichi = options.riichi ? { double: false, iipatsu: false } : undefined
  // 手牌（暗杠从手里拿出来）+ 副露应该是 13 张 + 杠数（每杠多一张），和牌张另算
  const kans = player.minkan.length + player.ankan.length + player.pon.filter(pon => pon.chakan).length
  const count = player.tiles.length + player.chi.length * 3
    + player.pon.reduce((sum, pon) => sum + pon.tiles.length, 0)
    + player.minkan.reduce((sum, kan) => sum + kan.length, 0)
    + player.ankan.reduce((sum, kan) => sum + kan.length, 0)
  if (count !== 13 + kans) throw new Error(`手牌 ${tilesStr} 是 ${count} 张（应为 ${13 + kans}）`)
  return yaku(round, player, tiles(winStr)[0], options.tsumo ?? false)
}

// 一局的驱动：每一格交给 decide，答完一局就把局终结果返回（想提前收工就 throw）
export async function drive(mahjong: Mahjong, decide: (slot: PromptSlot) => Decision): Promise<MahjongEnd> {
  for await (const step of mahjong.steps()) {
    if (step.type === 'roundEnd') return step.end
    for (let slot = step.current; slot !== null; slot = step.current) {
      if (step.apply(slot.ctx, decide(slot))) break
    }
  }
  throw new Error('牌局没有结束')
}

// 四家手牌 + 副露 + 牌河 + 牌山（含王牌）应该正好 136 张
export function assertTileCount(mahjong: Mahjong) {
  const round = mahjong.round
  let total = round.haiyama.length + round.wanpai.length
  for (const id of playerIds) {
    const player = round.players[id]
    total += player.tiles.length + player.discards.length
    // 碰按实际的牌数算：加杠存在 pon 里，是 4 张（写死 *3 会把加杠少算一张）
    total += player.chi.length * 3 + player.pon.reduce((sum, pon) => sum + pon.tiles.length, 0)
      + player.minkan.length * 4 + player.ankan.length * 4
  }
  return total
}

// 分数守恒：四家分数 + 桌上立直棒 = 100000
export const scoreTotal = (mahjong: Mahjong) =>
  mahjong.score.reduce((a, b) => a + b, 0) + mahjong.riichibo * 1000

// 简单的机器人：能和就和、能自摸就自摸，否则打"打完之后向听最小"的那张；鸣牌/立直按概率
export function simpleBot(mahjong: Mahjong, seed = 1, meldRate = 0, riichiRate = 0.3) {
  let state = seed
  const rnd = () => (state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
  return (slot: PromptSlot): Decision => {
    const ctx = slot.ctx
    if (ctx.types.has('ron')) return { action: 'ron' }
    if (ctx.types.has('tsumo')) return { action: 'tsumo' }
    if (ctx.types.has('pon') && rnd() < meldRate) return { action: 'pon', candidate: ctx.ponTiles![0] }
    if (ctx.types.has('chi') && rnd() < meldRate) return { action: 'chi', candidate: ctx.chiTiles![0] }
    // 立直中的暗杠本来就难得出现（要听牌张不变），出现就杠，好让随机对局也覆盖到这条路径
    if (ctx.player.riichi) {
      const ankan = ctx.kans?.find(kan => kan.type === 'ankan')
      if (ankan) return { action: 'kan', kan: ankan }
    }
    // 三种杠都随机挑一个：明杠/暗杠/加杠都得被试到（立直中暗杠的候选由库里先过滤好）
    const kan = ctx.kans?.length ? ctx.kans[Math.floor(rnd() * ctx.kans.length)] : undefined
    if (kan && rnd() < meldRate) return { action: 'kan', kan }
    const drawn = ctx.player.tiles.at(-1)
    const kuikae = ctx.kuikae ?? []
    const forbidden = (tile: Tile) => kuikae.some(kind => tile.equals(kind))
    const best = ctx.player.shantenPerDiscard()
      .filter(({ discard }) => !kuikae.some(kind => compareTileKind(kind, discard) === 0))
      .reduce<{ discard: TileKind, shanten: number } | undefined>(
        (acc, x) => !acc || x.shanten < acc.shanten ? x : acc, undefined)
    const canTsumogiri = ctx.types.has('tsumogiri')
    const wantsRiichi = !!best && ctx.types.has('riichi') && rnd() < riichiRate
    const riichi = wantsRiichi && !!ctx.player.waitsAfterDiscard(best.discard as TileKind)
    // 想打的那张就是刚摸的 → 摸切
    if (best && canTsumogiri && drawn?.equals(best.discard)) return { action: 'tsumogiri', riichi }
    const tile = ctx.player.tiles.find(candidate => candidate !== drawn && !!best && candidate.equals(best.discard) && !forbidden(candidate))
      ?? ctx.player.tiles.find(candidate => candidate !== drawn && !forbidden(candidate))
      ?? ctx.player.tiles.find(candidate => !forbidden(candidate))
    if (tile && ctx.types.has('tedashi')) return { action: 'tedashi', tile, riichi: !!best && tile.equals(best.discard) && riichi }
    if (canTsumogiri) return { action: 'tsumogiri' }
    return { action: 'pass' }
  }
}
