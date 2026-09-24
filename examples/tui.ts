// TUI 试玩 example：和 tests/interactive.ts 用同一套规则，但画成一块牌桌。
// 用法（仓库根目录）：
//   yarn tsx examples/tui.ts --help     看全部参数
// 按键：←/→ 选牌 · Enter 打出 · m 摸切 · r 立直 · t 自摸 · o 荣和 · 1-9 选候选 · q 跳过 · Q 退出
// 终端建议 ≥ 80 列 × 26 行（四家分坐牌桌四方，中间是场况，自己的手牌在最下面）
import blessed from 'blessed'
import { writeFileSync } from 'fs'
import { Command } from 'commander'
import { Decision, Mahjong, MahjongContext, MahjongEnd, PlayerId, PromptSlot, RuleProfile, Tile, kazes, mLeague, majsoul, playerIds } from '../src/index.js'
import { TileKind, compareTileKind, toMPSZ } from '../src/utils.js'

const program = new Command()
program
  .name('tui')
  .description('日本麻将 TUI example（和 tests/interactive.ts 用同一套规则）')
  .option('--seat <seat>', '你操作哪一家：0-3 或 ton/nan/sha/pei', '0')
  .option('--seed <seed>', '牌山种子（固定住就能复现同一局）', '20230514')
  .option('--demo', '四家都交给机器人自动打')
  .option('--profile <profile>', '规则档：m-league（默认）或 majsoul', 'm-league')
  .option('--snapshot [path]', '不交互：打几手后把画面以纯文本输出（给路径就写文件，不给就打到 stdout）')
  .option('--after <after>', '配合 --snapshot：答完 N 格就停在那一格截图')
  .addHelpText('after', `
例子：
  yarn tsx examples/tui.ts --seat=0                    自己打一家，其余机器人（打到半庄结束）
  yarn tsx examples/tui.ts --demo --seed=7             四家机器人，看效果
  yarn tsx examples/tui.ts --profile=majsoul           换一套规则（预设里目前只有 m-league 和 majsoul）
  yarn tsx examples/tui.ts --snapshot --after=120      第 120 手时的画面打到 stdout
  yarn tsx examples/tui.ts --snapshot=/tmp/f.txt       同上，写进文件`)
  .showHelpAfterError()
program.parse()
const options = program.opts()

const seatArg = String(options.seat)
const seatIndex: Record<string, number> = { ton: 0, nan: 1, sha: 2, pei: 3 }
const SEAT = (/^[0-3]$/.test(seatArg) ? Number(seatArg) : seatIndex[seatArg]) as PlayerId
if (SEAT === undefined) {
  process.stderr.write(`--seat 只能是 0-3 或 ton/nan/sha/pei，收到的是 "${seatArg}"\n`)
  process.exit(1)
}
const SEED = Number(options.seed)
const DEMO = Boolean(options.demo)
// 不带值的 --snapshot 是 true，带路径的是字符串；统一成"'' = 打到 stdout，非空 = 写文件"
const SNAPSHOT = options.snapshot === undefined
  ? undefined
  : (typeof options.snapshot === 'string' ? options.snapshot : '')
const dumpAfter = options.after === undefined ? Infinity : Number(options.after)

let seed = SEED
function rnd() {
  seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

function makeWall(): Tile[] {
  const tiles: Tile[] = []
  for (const suit of ['man', 'so', 'pin'] as const) {
    for (let rank = 1; rank <= 9; rank++) {
      tiles.push(new Tile(suit, rank, rank === 5))
      for (let i = 0; i < 3; i++) tiles.push(new Tile(suit, rank, false))
    }
  }
  for (let rank = 1; rank <= 4; rank++) for (let i = 0; i < 4; i++) tiles.push(new Tile('kaze', rank, false))
  for (let rank = 1; rank <= 3; rank++) for (let i = 0; i < 4; i++) tiles.push(new Tile('sangen', rank, false))
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = tiles[i]
    tiles[i] = tiles[j]
    tiles[j] = tmp
  }
  return tiles
}

// 规则档：预设里目前有 m-league（默认）和 majsoul，不认识的档名直接报错
const profiles: Record<string, RuleProfile> = { 'm-league': mLeague, majsoul }
const profileName = String(options.profile).toLowerCase()
const profile = profiles[profileName]
if (!profile) {
  console.error(`不认识的规则档：${options.profile}（可用：${Object.keys(profiles).join(' / ')}）`)
  process.exit(1)
}

const mahjong = new Mahjong({ profile, createTiles: () => makeWall() })

// —— 画面上的小工具 ——
const kazeName = { ton: '东', nan: '南', sha: '西', pei: '北' } as const
const results: string[] = []
let cursor = 0
let notice = ''

function tile(t: Tile | { suit: string, rank: number }): string {
  const label = toMPSZ([t as never])
  if (t instanceof Tile && t.red) return `{red-fg}${label}{/red-fg}`
  if (t.suit === 'kaze' || t.suit === 'sangen') return `{cyan-fg}${label}{/cyan-fg}`
  return label
}

function melds(player: { id: PlayerId, chi: Tile[][], pon: { tiles: Tile[] }[], minkan: Tile[][], ankan: Tile[][] }): string {
  // 被鸣的那张是别家打出来的（playerId 不是自己）→ 标上是哪一家打的
  const from = (tiles: Tile[]) => {
    const called = tiles.find(tile => tile.playerId !== undefined && tile.playerId !== player.id)
    return called === undefined ? '' : `(${called.playerId})`
  }
  const groups = [
    ...player.chi.map(tiles => `吃${toMPSZ(tiles)}${from(tiles)}`),
    ...player.pon.map(pon => `碰${toMPSZ(pon.tiles)}${from(pon.tiles)}`),
    ...player.minkan.map(tiles => `明杠${toMPSZ(tiles)}${from(tiles)}`),
    ...player.ankan.map(tiles => `暗杠${toMPSZ(tiles)}`),
  ]
  return groups.length === 0 ? '-' : groups.join(' ')
}

// —— 排版：终端里中日韩字占两列，这里按显示宽度铺到一块画布上 ——
const stripTags = (text: string) => text.replace(/\{[^}]*\}/g, '')
const charWidth = (ch: string) => (/[⺀-⿿　-〿぀-ヿ一-鿿＀-｠]/.test(ch) ? 2 : 1)
const displayWidth = (text: string) => [...stripTags(text)].reduce((sum, ch) => sum + charWidth(ch), 0)
const pad = (text: string, columns: number) => text + ' '.repeat(Math.max(0, columns - displayWidth(text)))

function makeCanvas(rows: number, columns: number) {
  const grid = Array.from({ length: rows }, () => Array<string>(columns).fill(' '))
  return {
    put(row: number, column: number, text: string) {
      // 整个（可能带颜色标签的）串放进首格，后面的格子留空占位，宽度按显示宽度算
      grid[row][column] = text
      for (let i = 1; i < displayWidth(text); i++) grid[row][column + i] = ''
    },
    box(top: number, left: number, bottom: number, right: number) {
      this.put(top, left, '┌' + '─'.repeat(right - left - 1) + '┐')
      this.put(bottom, left, '└' + '─'.repeat(right - left - 1) + '┘')
      for (let row = top + 1; row < bottom; row++) {
        this.put(row, left, '│')
        this.put(row, right, '│')
      }
    },
    lines() {
      return grid.map(row => row.join('').replace(/\s+$/, ''))
    },
  }
}

// 刚摸完牌时，手里的最后一张就是摸到的那张（吃碰之后不是）
function myTiles() {
  const round = mahjong.round
  const player = round.players[SEAT]
  const justDrew = round.currentId === SEAT && !round.kiru
  const hand = [...player.tiles]
  const drawn = justDrew ? hand.pop()! : null
  hand.sort(byMpsz)
  return { hand, drawn, display: drawn ? [...hand, drawn] : hand }
}

// 手牌按 mpsz 的顺序排：万 → 索 → 筒 → 风 → 三元（和 toMPSZ 拼出来的顺序一致）
const suitOrder = { man: 0, so: 1, pin: 2, kaze: 3, sangen: 4 } as const
const byMpsz = (a: TileKind, b: TileKind) => suitOrder[a.suit] - suitOrder[b.suit] || a.rank - b.rank

// 四家坐在牌桌的四个方向：自己在下面，下家在右、对家在上、上家在左
function seatName(id: PlayerId) {
  const player = mahjong.round.players[id]
  const mark = id === SEAT ? '自家' : ['下家', '对家', '上家'][((id - SEAT + 4) % 4) - 1]
  return `${mark} ${kazeName[player.seatWind]}${player.isDealer ? '(庄)' : ''}`
}

function meldsOf(id: PlayerId) {
  const player = mahjong.round.players[id]
  const made = player.chi.length + player.pon.length + player.minkan.length + player.ankan.length
  return made === 0 ? '-' : melds(player)
}

function seatInfo(id: PlayerId, asking: boolean) {
  const player = mahjong.round.players[id]
  const riichi = player.riichi ? ' {yellow-fg}立直{/yellow-fg}' : ''
  const turn = asking ? ' {green-fg}←{/green-fg}' : ''
  return `${seatName(id)} {bold}${mahjong.score[id]}{/bold}${riichi}${turn}`
}

function riverOf(id: PlayerId, limit: number) {
  const discards = mahjong.round.players[id].discards
  // 黄的 = 立直宣言牌，灰的 = 摸切（牌河的颜色含义写在下面的按键提示里）
  const shown = discards.slice(-limit).map(t => {
    const text = toMPSZ([t])
    if (t.riichi) return `{yellow-fg}${text}{/yellow-fg}`
    if (t.tsumogiri) return `{gray-fg}${text}{/gray-fg}`
    return text
  })
  return shown.length === 0 ? '-' : shown.join(' ')
}

// 按显示宽度裁掉多余的（颜色标签不算宽度），别把左右两家挤到中间的信息盘上
function clip(text: string, columns: number) {
  let out = ''
  let used = 0
  const parts = text.split(/(\{[^}]*\})/)
  for (const part of parts) {
    if (part.startsWith('{')) { out += part; continue }
    for (const ch of part) {
      const cells = charWidth(ch)
      if (used + cells > columns) return out + '{/}'
      out += ch
      used += cells
    }
  }
  return out
}

// 只保留放得下的整组（副露是一组一组写的，裁在中间很难看）
function clipGroups(text: string, columns: number) {
  const groups = text.split(' ')
  let out = ''
  for (const group of groups) {
    const next = out === '' ? group : `${out} ${group}`
    if (displayWidth(next) > columns) break
    out = next
  }
  return out === '' ? clip(text, columns) : out
}

// 按空格分组换行（牌河横着排，放不下就折到下一行）；括号里的说明跟着前一组走，别拆开
function wrap(text: string, columns: number): string[] {
  const lines: string[] = []
  let line = ''
  const groups: string[] = []
  for (const token of text.split(' ')) {
    if (token.startsWith('（') && groups.length !== 0) groups[groups.length - 1] += ' ' + token
    else groups.push(token)
  }
  for (const group of groups) {
    const next = line === '' ? group : `${line} ${group}`
    if (displayWidth(next) > columns) {
      lines.push(line)
      line = group
    } else {
      line = next
    }
  }
  if (line !== '') lines.push(line)
  return lines.length === 0 ? [''] : lines
}

// 画牌桌：四家各占一块，中间是场况。宽高由调用方按终端比例给
function renderBoard(width: number, height: number, highlight?: PromptSlot) {
  const round = mahjong.round
  const canvas = makeCanvas(height, width)
  const asking = (id: PlayerId) => highlight?.ctx.player.id === id
  const top = (id: PlayerId) => `{green-fg}${id}{/green-fg}`
  const across = playerIds[(SEAT + 2) % 4]
  const left = playerIds[(SEAT + 3) % 4]
  const right = playerIds[(SEAT + 1) % 4]
  // 三栏：左边一家 | 场况 | 右边一家；上下两条留给对家和自家
  const sideWidth = Math.floor((width - 2) * 0.26)
  const centerWidth = width - 2 - sideWidth * 2 - 2
  const leftColumn = 1
  const centerColumn = leftColumn + sideWidth + 1
  const rightColumn = centerColumn + centerWidth + 1
  const topRows = Math.max(3, Math.round((height - 4) * 0.22))
  const bottomRows = topRows
  const middleTop = 1 + topRows + 1
  const middleBottom = height - 2 - bottomRows - 1

  // 对家（上）：一行信息 + 牌河占满剩下的行
  canvas.put(1, leftColumn + 1, clip(`${top(across)} ${seatInfo(across, asking(across))}`, 40))
  canvas.put(1, leftColumn + 43, clipGroups(`副露 ${meldsOf(across)}`, width - 47))
  wrap(`河 ${riverOf(across, 30)}`, width - 4).forEach((line, i) => canvas.put(2 + i, leftColumn + 1, line))
  // 左右两家：信息、副露、牌河都在自己那一栏里折行
  const side = (id: PlayerId, column: number, columns: number) => {
    canvas.put(middleTop, column, clip(`${top(id)} ${seatInfo(id, asking(id))}`, columns))
    let row = middleTop + 1
    for (const line of wrap(`副露 ${meldsOf(id)}`, columns)) {
      canvas.put(row++, column, clipGroups(line, columns))
    }
    for (const line of wrap(`河 ${riverOf(id, 30)}`, columns - 1)) {
      canvas.put(row++, column, line)
    }
  }
  side(left, leftColumn + 1, sideWidth - 1)
  side(right, rightColumn + 1, sideWidth - 1)

  // 中间：场况 + 这一格的候选，横竖都居中
  const center = [
    `{bold}${kyokuName()}{/bold}   本场 ${mahjong.homba}`,
    `宝牌 {cyan-fg}${toMPSZ(round.dorahyoji[0])}{/cyan-fg}`,
    `牌山 ${round.rest}   立直棒 ${mahjong.riichibo}`,
  ]
  if (highlight) {
    const hint = actionHint(highlight, round.players[SEAT])
    if (hint !== '') center.push('', ...wrap(hint.trim(), centerWidth - 4))
  }
  const centerTop = middleTop + Math.max(0, Math.floor((middleBottom - middleTop + 1 - center.length) / 2))
  center.forEach((line, i) => {
    const text = clip(line, centerWidth - 2)
    canvas.put(centerTop + i, centerColumn + 1 + Math.max(0, Math.floor((centerWidth - displayWidth(text)) / 2)), text)
  })
  // 自家（下）：贴着牌桌下边放
  const ownRiver = wrap(`河 ${riverOf(SEAT, 30)}`, width - 6)
  const ownInfoRow = height - 2 - ownRiver.length
  canvas.put(ownInfoRow, leftColumn + 1, clip(`${top(SEAT)} ${seatInfo(SEAT, asking(SEAT))}`, 40))
  canvas.put(ownInfoRow, leftColumn + 43, clipGroups(`副露 ${meldsOf(SEAT)}`, width - 47))
  ownRiver.forEach((line, i) => canvas.put(ownInfoRow + 1 + i, leftColumn + 1, line))

  // 边框和分栏线最后画，免得长牌河把线冲掉
  canvas.put(0, 0, '┌' + '─'.repeat(width - 2) + '┐')
  canvas.put(height - 1, 0, '└' + '─'.repeat(width - 2) + '┘')
  canvas.put(1 + topRows, 0, '├' + '─'.repeat(sideWidth) + '┬' + '─'.repeat(centerWidth) + '┬' + '─'.repeat(sideWidth) + '┤')
  canvas.put(middleBottom, 0, '├' + '─'.repeat(sideWidth) + '┴' + '─'.repeat(centerWidth) + '┴' + '─'.repeat(sideWidth) + '┤')
  for (let row = 1; row < height - 1; row++) {
    if (row === 1 + topRows || row === middleBottom) continue
    canvas.put(row, 0, '│')
    canvas.put(row, width - 1, '│')
    if (row >= middleTop && row <= middleBottom) {
      canvas.put(row, leftColumn + sideWidth, '│')
      canvas.put(row, centerColumn + centerWidth, '│')
    }
  }
  return canvas
}

// 手牌和下面的提示（和牌桌分开画，方便按终端宽度各自居中）
function renderHand(slot?: PromptSlot) {
  const { drawn, display } = myTiles()
  const handText = display.map((t, i) => {
    const card = i === cursor ? `{inverse} ${tile(t)} {/inverse}` : ` ${tile(t)} `
    return drawn && i === display.length - 1 ? `{gray-fg}│{/gray-fg}${card}` : card
  }).join('')
  const player = mahjong.round.players[SEAT]
  const card = display[cursor]
  // 只有"轮到自己打牌"时才给这个提示：不是自己的回合没什么可打的，
  // 立直中也只能摸切，光标停在别的牌上不该按它算听牌张（会看到打不出去的牌的听牌）
  const myTurn = slot?.phase === 'turn' && slot.ctx.player.id === SEAT
  const discardable = card !== undefined && (!player.riichi || card === drawn)
  const waits = myTurn && discardable ? player.waitsAfterDiscard(card) : undefined
  // 空数组 = 听牌但一张都抽不到（等的那张自己攥着 4 张），也要显示出来
  // 真值判断：null/undefined = 不听牌，空数组 = 听牌但一张都抽不到
  const waitsText = waits ? `   {green-fg}打这张听 ${waits.length === 0 ? '(0 张)' : toMPSZ(waits)}{/green-fg}` : ''
  return [
    `{bold}手牌{/bold} ${handText}${waitsText}`,
  ]
}

// —— 机器人（其余三家，以及 --demo 时的自己） ——
// 役牌：白发中，以及自风、场风
function isYakuhai(tile: Tile, ctx: MahjongContext): boolean {
  if (tile.suit === 'sangen') return true
  if (tile.suit !== 'kaze') return false
  const seatWind = kazes.indexOf(ctx.player.seatWind) + 1
  const roundWind = kazes.indexOf(ctx.round.bakaze) + 1
  return tile.rank === seatWind || tile.rank === roundWind
}

function botDecision(ctx: MahjongContext): Decision {
  const player = ctx.player
  if (ctx.types.has('ron')) return { action: 'ron' }
  if (ctx.types.has('tsumo')) return { action: 'tsumo' }
  if (ctx.types.has('tedashi') || ctx.types.has('tsumogiri')) {
    const drawn = player.tiles.at(-1)!
    if (player.riichi) return { action: 'tsumogiri' }
    const forbidden = ctx.kuikae ?? []
    const all = player.shantenPerDiscard()
    const options = all.filter(x => !forbidden.some(kind => compareTileKind(kind, x.discard) === 0))
    const best = (options.length === 0 ? all : options).reduce((acc, x) => (x.shanten < acc.shanten ? x : acc))
    const discard = player.tiles.find(t => t.equals(best.discard))!
    const waits = player.waitsAfterDiscard(discard)
    const riichi = ctx.types.has('riichi') && !!waits
    if (discard === drawn && !ctx.round.kiru && ctx.types.has('tsumogiri')) return { action: 'tsumogiri', riichi }
    return { action: 'tedashi', tile: discard, riichi }
  }
  // 副露只吃役牌：吃永远凑不出役，非役牌的碰也一样，鸣了就只是把手牌拆散
  const pon = ctx.ponTiles?.find(tiles => isYakuhai(tiles[0], ctx))
  if (pon) return { action: 'pon', candidate: pon }
  return { action: 'pass' }
}

// —— 屏幕 ——
if (SNAPSHOT === undefined && !process.stdout.isTTY) {
  process.stderr.write('这个 example 需要真终端才能画界面（blessed）；\n')
  process.stderr.write('没有终端想看画面，用 --snapshot=/tmp/frame.txt（打几手后把画面写成纯文本）。\n')
  process.exit(1)
}

const noScreen = SNAPSHOT !== undefined
// fullUnicode/forceUnicode 必须显式打开：blessed 默认认为终端画不了宽字符，会把中日韩字换成 '?'
const screen = noScreen ? null : blessed.screen({
  smartCSR: true, title: 'yakuman', fullUnicode: true, forceUnicode: true,
})
const board = noScreen ? null : blessed.box({ top: 0, left: 0, width: '100%', height: '100%', tags: true })
if (screen) {
  screen.append(board!)
}

function draw(slot?: PromptSlot) {
  // 牌桌按终端尺寸取 80%，整体再上下左右居中
  const columns = noScreen ? 120 : Number(screen!.width)
  const rows = (noScreen ? 36 : Number(screen!.height))
  const tableWidth = Math.max(40, Math.min(columns, Math.round(columns * 0.8)))
  const tableHeight = Math.max(9, Math.min(rows - 5, Math.round(rows * 0.8)))
  const table = renderBoard(tableWidth, tableHeight, slot).lines()
  const keys = '{gray-fg}牌河：灰=摸切 黄=立直宣言牌 · ←/→ 选牌 · Enter 打出 · m 摸切 · r 立直 · t 自摸 · o 荣和 · 1-9 选候选 · q 跳过 · Q 退出{/gray-fg}'
  const footer = [
    ...renderHand(slot),
    keys,
    ...(notice ? [`{red-fg}${notice}{/red-fg}`] : []),
    ...results.slice(-2),
  ]
  const block = [...table, '', ...footer]
  // 每行各按自己的宽度居中：牌桌对齐牌桌，提示行在终端里居中
  const center = (line: string, span: number) => ' '.repeat(Math.max(0, Math.floor((columns - span) / 2))) + line
  const padTop = Math.max(0, Math.floor((rows - block.length) / 2))
  const lines = [
    ...Array<string>(padTop).fill(''),
    ...table.map(line => center(line, tableWidth)),
    '',
    ...footer.map(line => center(line, displayWidth(line))),
  ]
  if (noScreen) return lines.join('\n')
  board!.setContent(lines.join('\n'))
  screen!.render()
  return lines.join('\n')
}

// 这一格能做什么
// 场风 + 局数（"南4局"），牌桌中间和局终提示都用它
const kyokuName = () => `${mahjong.bakaze === 'ton' ? '东' : mahjong.bakaze === 'nan' ? '南' : '西'}${mahjong.kyoku}局`

// 吃/碰/明杠的候选：提示里的编号和按键都走这一份列表，免得各自从 1 开始数、按同一个键撞车
function claimCandidates(ctx: MahjongContext) {
  const list: { label: string, decision: Decision }[] = []
  ctx.chiTiles?.forEach(chi => list.push({ label: `吃 ${toMPSZ(chi)}`, decision: { action: 'chi', candidate: chi } }))
  ctx.ponTiles?.forEach(pon => list.push({ label: `碰 ${toMPSZ(pon)}`, decision: { action: 'pon', candidate: pon } }))
  ctx.kans?.forEach(kan => list.push({ label: `${kan.type} ${toMPSZ(kan.tiles)}`, decision: { action: 'kan', kan } }))
  return list
}

function actionHint(slot: PromptSlot | undefined, player: { riichi: unknown }) {
  if (!slot) return ' '
  const options: string[] = []
  if (slot.phase === 'turn') {
    slot.ctx.kans?.forEach((kan, i) => options.push(`[${i + 1}] ${kan.type} ${toMPSZ(kan.tiles)}`))
    if (slot.ctx.types.has('tsumo')) options.push('[t] 自摸')
    if (slot.ctx.types.has('riichi')) {
      // 立直宣言牌只能是"打完还听牌"的那几张
      const riichiTiles = slot.ctx.player.tenpaiDiscards()
        .filter(({ discard }) => slot.ctx.player.tiles.some(tile => tile.equals(discard)))
        .map(({ discard }) => toMPSZ([discard]))
      if (riichiTiles.length !== 0) options.push(`[r] 立直（可打 ${riichiTiles.join(' ')}）`)
    }
    if (slot.ctx.types.has('ryuukyoku')) options.push('[9] 九种九牌')
  } else if (slot.phase === 'ron') {
    const from = slot.ctx.round.kiru?.playerId
    options.push(`[o] 荣和${from === undefined ? '' : `←${from}`}`, '[q] 跳过')
  } else {
    // 后面写上是谁打的（和牌河里的座位号对应），方便判断振听和危险牌
    const from = slot.ctx.round.kiru?.playerId
    claimCandidates(slot.ctx).forEach((candidate, i) =>
      options.push(`[${i + 1}] ${candidate.label}${from === undefined ? '' : `←${from}`}`))
    options.push('[q] 跳过')
  }
  if (options.length === 0) return ''
  return ` {green-fg}轮到 ${slot.ctx.player.id}{/green-fg}${player.riichi ? '（立直中）' : ''}：${options.join('  ')}`
}

// 键盘：先把按键收进队列，谁在等就给谁（避免"还没轮到问就已经按了"丢键）
const queue: string[] = []
const waiters: ((key: string) => void)[] = []
let lastKey = ''
let lastKeyAt = 0
screen?.on('keypress', (_ch, key) => {
  // blessed 把大写也报成小写 + shift，这里还原成 'Q'
  const name = key?.shift && key?.name ? key.name.toUpperCase() : (key?.name ?? String(_ch))
  // 一次 Enter 会同时报 enter 和 return 两个事件，不去重的话下一轮会莫名其妙再打一张
  const isEnter = name === 'enter' || name === 'return'
  const lastIsEnter = lastKey === 'enter' || lastKey === 'return'
  lastKey = name
  if (isEnter && lastIsEnter && Date.now() - lastKeyAt < 30) return
  lastKeyAt = Date.now()
  const waiter = waiters.shift()
  if (waiter) waiter(name)
  else queue.push(name)
})
function nextKey(): Promise<string> {
  if (queue.length !== 0) return Promise.resolve(queue.shift()!)
  return new Promise(resolve => waiters.push(resolve))
}
function quit() {
  screen?.destroy()
  process.exit(0)
}
screen?.key(['C-c', 'Q'], quit)
// 终端改大小时按新尺寸重画（牌桌是按终端比例算的）
screen?.on('resize', () => {
  if (waiters.length !== 0) draw(lastSlot)
})

async function humanDecision(slot: PromptSlot): Promise<Decision> {
  const ctx = slot.ctx
  notice = ''
  const { display } = myTiles()
  cursor = Math.max(0, Math.min(cursor, display.length - 1))
  for (;;) {
    draw(slot)
    const key = await nextKey()
    const option = <T>(list: T[] | undefined) => list?.[Number(key) - 1]
    if (key === 'left') cursor = Math.max(0, cursor - 1)
    else if (key === 'right') cursor = Math.min(display.length - 1, cursor + 1)
    else if (key === 'Q') quit()
    else if (key === 't' && ctx.types.has('tsumo')) return { action: 'tsumo' }
    else if (key === 'o' && ctx.types.has('ron')) return { action: 'ron' }
    else if (key === 'q' && ctx.types.has('pass')) return { action: 'pass' }
    else if (key === '9' && ctx.types.has('ryuukyoku')) return { action: 'ryuukyoku' }
    else if (/^[1-9]$/.test(key)) {
      // 自家回合只有杠；别人打出的牌是吃/碰/明杠——编号和提示里显示的一致
      const candidates: Decision[] = slot.phase === 'turn'
        ? (ctx.kans ?? []).map(kan => ({ action: 'kan', kan }))
        : claimCandidates(ctx).map(candidate => candidate.decision)
      const decision = candidates[Number(key) - 1]
      if (decision) return decision
      notice = '这个编号没有候选'
    } else if (key === 'm' && ctx.types.has('tsumogiri')) {
      return { action: 'tsumogiri' }
    } else if ((key === 'return' || key === 'enter') && (ctx.types.has('tedashi') || ctx.types.has('tsumogiri'))) {
      const card = display[cursor]
      const isDrawn = card === mahjong.round.players[SEAT].tiles.at(-1) && !mahjong.round.kiru
      if (isDrawn && ctx.types.has('tsumogiri')) return { action: 'tsumogiri' }
      if (ctx.types.has('tedashi')) return { action: 'tedashi', tile: card }
      notice = '现在只能摸切（吃过/碰过之后只能手切）'
    } else if (key === 'r' && ctx.types.has('riichi')) {
      const card = display[cursor]
      if (!mahjong.round.players[SEAT].waitsAfterDiscard(card)) notice = '打这张不听牌，不能立直'
      else if (card === mahjong.round.players[SEAT].tiles.at(-1) && !mahjong.round.kiru) return { action: 'tsumogiri', riichi: true }
      else return { action: 'tedashi', tile: card, riichi: true }
    }
  }
}

function summarize(end: MahjongEnd): string {
  // 里宝只在有人立直（也就是会被翻出来）的时候报
  const uradora = mahjong.round.players.some(player => player.riichi) ? mahjong.round.dorahyoji[1] : []
  if (end.type === 'hora') {
    return '和了 ' + end.hora!.map(hora => {
      const names = Object.keys(hora.yaku).filter(key => !['fu', 'fan'].includes(key))
      return `${hora.id} ${names.join('+')} ${hora.yaku.fan}番 ${hora.score}点${hora.pao !== undefined ? `（包 ${hora.pao}）` : ''}`
    }).join(' / ') + (uradora.length !== 0 ? `　里宝 ${toMPSZ(uradora)}` : '')
  }
  const ryuukyoku = end.ryuukyoku!
  const names: Record<string, string> = {
    hoapai: '荒牌流局', kyuushu: '九种九牌', suuchaRiichi: '四家立直', sufurenda: '四风连打', suukansanra: '四杠散了',
  }
  const tenpai = ryuukyoku.tenpai ? ` 听牌 ${ryuukyoku.tenpai.join('/') || '无'}` : ''
  return `流局 ${names[ryuukyoku.type]}${tenpai}`
}

let answered = 0
let lastSlot: PromptSlot | undefined
async function play() {
  for await (const step of mahjong.steps()) {
    if (step.type === 'roundEnd') {
      results.push(`{yellow-fg}【${kyokuName()} 结束】${summarize(step.end)}{/yellow-fg}`)
      draw()
      if (noScreen || DEMO) {
        const key = noScreen ? 'return' : await nextKey()
        if (!noScreen && key === 'Q') break
      }
      // 打到半庄结束（被飞、南四局结束、或轮到庄家连庄之外的收尾条件由库里判断）
      if (!step.canContinue) break
      continue
    }
    for (let slot = step.current; slot !== null; slot = step.current) {
      const human = !DEMO && !noScreen && slot.ctx.player.id === SEAT
      lastSlot = slot
      if (noScreen && answered >= dumpAfter) return     // --after=N：停下来交给外面的 snapshot
      draw(slot)
      let decision: Decision | null = null
      while (decision === null) {
        decision = human ? await humanDecision(slot) : botDecision(slot.ctx)
        try {
          answered++
          if (step.apply(slot.ctx, decision)) break
        } catch (error) {
          notice = (error as Error).message
          if (!human) throw error
          decision = null
        }
      }
    }
  }
  draw()
}

;(async () => {
  if (noScreen) {
    await play()
    const frame = draw(lastSlot)
    const text = frame.replace(/\{[^}]*\}/g, '') + '\n'
    if (SNAPSHOT) writeFileSync(SNAPSHOT, text)
    else process.stdout.write(text)
    process.exit(0)
  }
  await play()
  screen!.destroy()
  process.stdout.write('\n对局结束。\n')
  process.exit(0)
})()
