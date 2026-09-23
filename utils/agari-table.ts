import {
  MAX_SHAPE_TILES, SHAPE_COUNT, assertShape, encodeShape, reachableShapes,
} from './shanten-table.js'

// 和了表：单花色形状 → 能不能一张不剩地拆成面子（刻子 / 顺子）
//
// 和牌 = 4 面子 + 1 将，将一定是两张一样的牌：枚举将、拿走两张，剩下的每组查这张表。
// 面子不跨花色，所以整手牌就是每组各查一次。形状编码和向听表共用。

const splitCache = new Map<number, boolean>()

/** 只要一个布尔，所以只试刻子/顺子，且必须一张不剩 */
export function canSplit(tiles: number[]): boolean {
  assertShape(tiles)
  return search([...tiles], 0)   // 搜索会临时改张数，复制一份
}

function search(tiles: number[], i: number): boolean {
  while (i < 9 && tiles[i] === 0) i++
  if (i === 9) return true
  const key = encodeShape(tiles) * 10 + i
  const hit = splitCache.get(key)
  if (hit !== undefined) return hit

  let ok = false
  if (tiles[i] >= 3) {
    tiles[i] -= 3
    ok = search(tiles, i)
    tiles[i] += 3
  }
  // 刻子和顺子必须都试：1111m23m 要拆成 111m + 123m（共用同一张 1m）
  if (!ok && i + 2 < 9 && tiles[i] >= 1 && tiles[i + 1] >= 1 && tiles[i + 2] >= 1) {
    tiles[i]--; tiles[i + 1]--; tiles[i + 2]--
    ok = search(tiles, i)
    tiles[i]++; tiles[i + 1]++; tiles[i + 2]++
  }
  splitCache.set(key, ok)
  return ok
}

/** 字牌不用查表：不能连顺，能吃干净 ⟺ 每种的张数都是 3 的倍数 */
export function honorsSplittable(kaze: number[], sangen: number[]): boolean {
  return [...kaze, ...sangen].every(n => n % 3 === 0)
}

export interface AgariTable {
  /** 形状码 → 位，低位在前（code>>3 取字节、code&7 取位） */
  bits: Uint8Array
  get(tiles: number[]): boolean
}

/** 实测 405,350 个形状约 0.25 秒，能整拆的只有 2,869 个 */
export function buildTable(maxTiles = MAX_SHAPE_TILES): AgariTable {
  const bits = new Uint8Array(Math.ceil(SHAPE_COUNT / 8))
  for (const tiles of reachableShapes(maxTiles)) {
    if (canSplit(tiles)) {
      const code = encodeShape(tiles)
      bits[code >> 3] |= 1 << (code & 7)
    }
  }
  return {
    bits,
    get(tiles: number[]) {
      assertShape(tiles)
      const code = encodeShape(tiles)
      return ((bits[code >> 3] >> (code & 7)) & 1) === 1
    },
  }
}

/** JSON.stringify 要普通数组 */
export function tableJson(table: AgariTable): { bits: number[] } {
  return { bits: Array.from(table.bits) }
}
