import { SHAPE_COUNT, buildTable as buildShantenTable, reachableShapes, tableJson as shantenTableJson } from './shanten-table.js'
import { buildTable as buildAgariTable, tableJson as agariTableJson } from './agari-table.js'

// 生成两张表，合成一个 JSON 打到 stdout，统计信息走 stderr：tsx utils/table.ts > src/table.json
//
// { shanten: { frontiers, index }, agari: { bits } }
// 两张表共用同一套形状编码，拿同一个 code 就能查两边
function main() {
  const t0 = performance.now()
  const shanten = buildShantenTable()
  const t1 = performance.now()
  const agari = buildAgariTable()
  const t2 = performance.now()

  const size = new Map<number, number>()
  let shapes = 0
  let splittable = 0
  for (const tiles of reachableShapes()) {
    shapes++
    const n = shanten.get(tiles).length
    size.set(n, (size.get(n) ?? 0) + 1)
    if (agari.get(tiles)) splittable++
  }

  const json = JSON.stringify({
    shanten: shantenTableJson(shanten),
    agari: agariTableJson(agari),
  })

  console.error(`向听表：${shapes.toLocaleString()} 个形状，${(t1 - t0).toFixed(0)}ms，前沿 ${shanten.frontiers.length} 种`)
  console.error(`  前沿规模分布: ${[...size.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}项 ${v.toLocaleString()} 个形状`).join('，')}`)
  console.error(`和了表：${(t2 - t1).toFixed(0)}ms，能整拆成面子的 ${splittable.toLocaleString()} 个（${(splittable / shapes * 100).toFixed(2)}%）`)
  console.error(`输出：${(json.length / 1048576).toFixed(2)}MB JSON（共 ${SHAPE_COUNT.toLocaleString()} 格）`)

  process.stdout.write(json + '\n')
}

if ((import.meta as unknown as { main?: boolean }).main) main()
