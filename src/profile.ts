// 规则档（rule profile）：把成套的规则开关打包成一个可以整套切换、也可以自己改的对象。
// 库自带两档：mLeague（默认，逐条对着 M.League 官方规则写的）和 majsoul（雀魂四人段位戦）。
// M.League 条文原文：https://m-league.jp/about （rule 段，第1〜9章）
//
//   new Mahjong()                                                    // = mLeague
//   new Mahjong({ profile: majsoul })                                 // 整套换掉
//   new Mahjong({ profile: { ...majsoul, kazoeYakuman: false } })     // 基于某档改几项
//
// 要改规则就在 profile 上改（想省事就 ... 某一档再覆盖几项），库不做额外的合并/覆盖。
// 新增开关时：往 RuleProfile 加字段 + 在每一档里都写明（类型会强制写全），并在 mLeague 里标条文出处。
//
// 还没进 profile 的（都还没实现，等做了再加字段）：順位点/ウマ（第6章第2条）和罚则（第7章）。
export interface RuleProfile {
  // 多家荣和：false = 頭ハネ（一局只算离放铳者最近的那家）；true = 每家和牌者都收
  multipleRon: boolean
  // 包（責任払い）：大三元 / 大四喜 / 四槓子 被鸣确定后，责任者要替那手役满出钱
  pao: boolean
  // 赤牌枚数：0 = 无赤牌，3 = 万/索/筒各一张，4 = 再加一张赤 5m
  redFives: 0 | 3 | 4
  // 食断：true = 副露也认断幺九；false = 只有门清才认
  kuidashiTanyao: boolean
  // 切上满贯：true = 4 番 30 符 / 3 番 60 符 按满贯算；false = 按 7700（亲 11600）
  kiriageMangan: boolean
  // 流局满贯（流し満貫）：true = 成立
  nagashiMangan: boolean
  // 双倍役满：true = 四暗刻单骑 / 国士13面 / 纯正九莲 / 大四喜 按 26 番
  doubleYakuman: boolean
  // 途中流局：九種九牌 / 四風連打 / 四家立直 / 四槓散了
  abortiveDraws: boolean
  // 被飞：true = 有人点数变负数就结束半庄（箱割れ）
  bustEndsGame: boolean
  // 西入（サドンデス）：南四局结束时没人到 30000 点就接着打西场，谁先到 30000 点以上就终局
  suddenDeath: boolean
  // 数え役满：true = 13 番以上的普通役按役满算；false = 封顶三倍满
  kazoeYakuman: boolean
  // 0 张可抽的听牌（听牌张都被自己的手牌/副露吃掉）算不算听牌。也算进立直条件：
  // false 时既不算听（听牌料/连荘）也不能立直（M.League 第3章第11条）
  zeroWaitTenpai: boolean
  // 立直要求牌山还剩 ≥4 张（false = 只禁止"摸到海底牌之后立直"）
  riichiNeedsFourTiles: boolean
  // 国士无双抢暗杠（暗杠原则上谁都不能抢）
  kokushiAnkanChankan: boolean
}

// RuleProfile 的所有键（顺序就是文档顺序）。想遍历/展示开关的时候用它
export const ruleKeys = [
  'multipleRon', 'pao', 'redFives', 'kuidashiTanyao', 'kiriageMangan', 'nagashiMangan',
  'doubleYakuman', 'abortiveDraws', 'bustEndsGame', 'suddenDeath', 'kazoeYakuman',
  'zeroWaitTenpai', 'riichiNeedsFourTiles', 'kokushiAnkanChankan',
] as const satisfies readonly (keyof RuleProfile)[]

// M.League 官方规则。条文原文：https://m-league.jp/about （rule 段，第1〜9章）
export const mLeague: RuleProfile = {
  // 第5章第1条「アガリ者は一局に1人とする」＝頭ハネ
  multipleRon: false,
  // 第8章「包（パオ）」
  pao: true,
  // 第1章第2条「5萬・5筒・5索の各1枚を赤牌とする」
  redFives: 3,
  // 第9章把断么九列为非门前役 → 副露也认
  kuidashiTanyao: true,
  // 第6章第6条 満貫含「30符6翻」「60符5翻」（含场ゾロ即 4 番 30 符 / 3 番 60 符）
  kiriageMangan: true,
  // 条文里没有流し満貫
  nagashiMangan: false,
  // 第9章役满表没有单列四暗刻单骑等 → 都按 13 番，倍满只来自"纯粋な役満の複合"
  doubleYakuman: false,
  // 第3章第2条「途中流局はない」
  abortiveDraws: false,
  // 第3章第2条「持ち点が無くなった場合でも最終局が終了するまで続行する」
  bustEndsGame: false,
  // 第1章第1条「東南二風の半荘」＋ 条文里没有西入
  suddenDeath: false,
  // 第6章第6条「役満以外の役が複合したアガリ点は、三倍満までを上限とする」
  kazoeYakuman: false,
  // 第3章第11条「自己の手牌・副露牌でアガリ牌が消去されている場合は認められない」
  zeroWaitTenpai: false,
  // 第4章第8条只禁止「海底牌を摸した者はリーチを掛ける事はできない」
  riichiNeedsFourTiles: false,
  // 第4章第5条「いかなる場合でも、暗槓の搶槓は成立しない」
  kokushiAnkanChankan: false,
}

// 默认规则档：new Mahjong() 不传 profile 时整库就用这一档，也就是 mLeague。
// defaultProfile 和 mLeague 是同一个对象：预设当只读用，要改规则请铺开成新对象
// （{ ...mLeague, xxx: yyy }）—— 直接改字段会连预设和其它实例一起改掉
export const defaultProfile: RuleProfile = mLeague

// 雀魂（四人段位戦）。前四项和 M.League 一样，后面几项不同
export const majsoul: RuleProfile = {
  // 能和多家和牌：可以点多响（ダブロン / トリロン 都算）
  multipleRon: true,
  // 有包
  pao: true,
  // 赤 3 枚
  redFives: 3,
  // 有食断
  kuidashiTanyao: true,
  // 有切上满贯
  kiriageMangan: true,
  // 有流し満貫
  nagashiMangan: true,
  // 四暗刻单骑 / 国士13面 / 纯正九莲 / 大四喜 = 双倍役满
  doubleYakuman: true,
  // 有途中流局（九種九牌 / 四風連打 / 四家立直 / 四槓散了）
  abortiveDraws: true,
  // 箱割れ（点数变负）就结束半庄
  bustEndsGame: true,
  // 南四结束还没人到 30000 点就西入，谁先到 30000 点以上就终局
  suddenDeath: true,
  // 13 番以上算数え役满
  kazoeYakuman: true,
  // 0 张可抽的听牌照算听牌
  zeroWaitTenpai: true,
  // 立直要求牌山还剩 ≥4 张
  riichiNeedsFourTiles: true,
  // 国士无双可以抢暗杠
  kokushiAnkanChankan: true,
}
