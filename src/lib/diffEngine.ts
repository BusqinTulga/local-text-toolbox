import { diffLines, diffChars, diffArrays } from 'diff'

export type Granularity = 'word' | 'char'

export interface InlineSegment {
  text: string
  changed: boolean
}

export type SideType = 'same' | 'add' | 'del' | 'mod' | 'empty'

export interface DiffSide {
  lineNo: number | null
  type: SideType
  segments: InlineSegment[]
}

export interface DiffRow {
  left: DiffSide
  right: DiffSide
}

export interface DiffResult {
  rows: DiffRow[]
  stats: { added: number; removed: number; modified: number }
  identical: boolean
}

// 单行超过此长度时跳过行内 diff，整行标记为变更，避免超长行卡顿
const MAX_INLINE_LINE_LENGTH = 3000

const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl

const segmenterCache = new Map<string, Intl.Segmenter>()

function getSegmenter(locale: string | undefined): Intl.Segmenter {
  const key = locale ?? ''
  let seg = segmenterCache.get(key)
  if (!seg) {
    seg = new Intl.Segmenter(locale, { granularity: 'word' })
    segmenterCache.set(key, seg)
  }
  return seg
}

// 假名 → 日文分词字典；否则含汉字 → 中文分词字典；其余交给默认 locale
function detectLocale(text: string): string | undefined {
  if (/[぀-ヿ]/.test(text)) return 'ja'
  if (/[一-鿿]/.test(text)) return 'zh'
  return undefined
}

function tokenize(text: string, locale: string | undefined): string[] {
  return Array.from(getSegmenter(locale).segment(text), (s) => s.segment)
}

function plainSide(lineNo: number | null, type: SideType, text: string): DiffSide {
  return { lineNo, type, segments: text === '' ? [] : [{ text, changed: false }] }
}

function emptySide(): DiffSide {
  return { lineNo: null, type: 'empty', segments: [] }
}

/** 对一对"修改前/修改后"的行做行内 diff，返回左右两侧的分段 */
function inlineDiff(
  oldLine: string,
  newLine: string,
  granularity: Granularity,
): { left: InlineSegment[]; right: InlineSegment[] } {
  if (
    oldLine.length > MAX_INLINE_LINE_LENGTH ||
    newLine.length > MAX_INLINE_LINE_LENGTH
  ) {
    return {
      left: [{ text: oldLine, changed: true }],
      right: [{ text: newLine, changed: true }],
    }
  }

  const left: InlineSegment[] = []
  const right: InlineSegment[] = []

  const push = (arr: InlineSegment[], text: string, changed: boolean) => {
    if (text === '') return
    const last = arr[arr.length - 1]
    if (last && last.changed === changed) last.text += text
    else arr.push({ text, changed })
  }

  if (granularity === 'word' && hasSegmenter) {
    const locale = detectLocale(oldLine + newLine)
    const changes = diffArrays(tokenize(oldLine, locale), tokenize(newLine, locale))
    for (const c of changes) {
      const text = c.value.join('')
      if (c.added) push(right, text, true)
      else if (c.removed) push(left, text, true)
      else {
        push(left, text, false)
        push(right, text, false)
      }
    }
  } else {
    const changes = diffChars(oldLine, newLine)
    for (const c of changes) {
      if (c.added) push(right, c.value, true)
      else if (c.removed) push(left, c.value, true)
      else {
        push(left, c.value, false)
        push(right, c.value, false)
      }
    }
  }

  return { left, right }
}

// 两行相似度低于此值时不视为"修改"，拆成独立的删除行 + 新增行
const MOD_SIMILARITY_THRESHOLD = 0.4

/** 两行的相似度：公共字符数 × 2 / 总长度，范围 0~1 */
function lineSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a === '' || b === '') return 0
  // 一行完整包含另一行（如文件名 vs 含该文件名的 ls -l 行）→ 视为同一行的两种写法
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  const shortTrim = short.trim()
  if (shortTrim.length >= 3 && long.includes(shortTrim)) {
    return Math.max(MOD_SIMILARITY_THRESHOLD, (shortTrim.length * 2) / (a.length + b.length))
  }
  // 长度差距本身就限定了相似度上限，够不着门槛时直接返回，省掉字符 diff
  const lengthBound = (short.length * 2) / (a.length + b.length)
  if (lengthBound < MOD_SIMILARITY_THRESHOLD) return lengthBound
  // 相似度只用于配对判断，取前若干字符估算即可，避免长行字符 diff 拖慢对齐
  const sa = a.slice(0, SIMILARITY_SAMPLE_CHARS)
  const sb = b.slice(0, SIMILARITY_SAMPLE_CHARS)
  let common = 0
  for (const c of diffChars(sa, sb)) {
    if (!c.added && !c.removed) common += c.value.length
  }
  return (common * 2) / (sa.length + sb.length)
}

// 相似度估算最多取的字符数：对齐配对不需要全行精确 diff
const SIMILARITY_SAMPLE_CHARS = 200

// 相似度对齐的规模上限：删除块行数 × 新增块行数超过它就退回按行号 1:1 配对
const MAX_ALIGN_CELLS = 10_000

/**
 * 把删除块和新增块的行按内容相似度对齐（LCS 式动态规划），
 * 返回配对序列：oldIndex / newIndex 为 null 表示该侧无对应行。
 * 这样中间插入/删除一行不会导致后面的行整体错位配对。
 */
function alignLines(
  oldLines: string[],
  newLines: string[],
): { oldIndex: number | null; newIndex: number | null }[] {
  const m = oldLines.length
  const n = newLines.length

  // 块太大时退回按行号配对，避免 O(m×n) 开销
  if (m * n > MAX_ALIGN_CELLS) {
    const pairs: { oldIndex: number | null; newIndex: number | null }[] = []
    for (let j = 0; j < Math.max(m, n); j++) {
      pairs.push({ oldIndex: j < m ? j : null, newIndex: j < n ? j : null })
    }
    return pairs
  }

  const sim: number[][] = []
  for (let a = 0; a < m; a++) {
    sim.push(newLines.map((line) => lineSimilarity(oldLines[a], line)))
  }

  // dp[a][b]：old 前 a 行与 new 前 b 行的最优配对得分，仅相似度达标的行允许配对
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let a = 1; a <= m; a++) {
    for (let b = 1; b <= n; b++) {
      const s = sim[a - 1][b - 1]
      dp[a][b] = Math.max(
        dp[a - 1][b],
        dp[a][b - 1],
        s >= MOD_SIMILARITY_THRESHOLD ? dp[a - 1][b - 1] + s : 0,
      )
    }
  }

  const pairs: { oldIndex: number | null; newIndex: number | null }[] = []
  let a = m
  let b = n
  while (a > 0 || b > 0) {
    const s = a > 0 && b > 0 ? sim[a - 1][b - 1] : 0
    if (
      a > 0 &&
      b > 0 &&
      s >= MOD_SIMILARITY_THRESHOLD &&
      dp[a][b] === dp[a - 1][b - 1] + s
    ) {
      pairs.push({ oldIndex: --a, newIndex: --b })
    } else if (a > 0 && (b === 0 || dp[a][b] === dp[a - 1][b])) {
      pairs.push({ oldIndex: --a, newIndex: null })
    } else {
      pairs.push({ oldIndex: null, newIndex: --b })
    }
  }
  return pairs.reverse()
}

/** diffLines 返回的块值按行拆开（丢弃末尾换行产生的空元素） */
function splitBlockLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function computeDiff(
  oldText: string,
  newText: string,
  granularity: Granularity,
): DiffResult {
  const rows: DiffRow[] = []
  let added = 0
  let removed = 0
  let modified = 0
  let leftNo = 1
  let rightNo = 1

  const changes = diffLines(oldText, newText, { ignoreNewlineAtEof: true })

  let i = 0
  while (i < changes.length) {
    const c = changes[i]

    if (!c.added && !c.removed) {
      for (const line of splitBlockLines(c.value)) {
        rows.push({
          left: plainSide(leftNo++, 'same', line),
          right: plainSide(rightNo++, 'same', line),
        })
      }
      i++
      continue
    }

    // 收集一组连续的差异块。diffLines 常把两段共有的空行当锚点，
    // 导致本该对应的内容被拆进空行两侧的不同块里，因此仅由空白行
    // 隔开的差异块也并入同一组（空白行两侧同时加入，参与配对）
    const oldLines: string[] = []
    const newLines: string[] = []
    while (i < changes.length) {
      const ch = changes[i]
      if (ch.removed) {
        oldLines.push(...splitBlockLines(ch.value))
        i++
        continue
      }
      if (ch.added) {
        newLines.push(...splitBlockLines(ch.value))
        i++
        continue
      }
      const sameLines = splitBlockLines(ch.value)
      const next = changes[i + 1]
      if (next && (next.added || next.removed) && sameLines.every((l) => l.trim() === '')) {
        oldLines.push(...sameLines)
        newLines.push(...sameLines)
        i++
        continue
      }
      break
    }

    // 组内只有一侧有内容 → 纯删除 / 纯新增
    if (newLines.length === 0) {
      for (const line of oldLines) {
        rows.push({ left: plainSide(leftNo++, 'del', line), right: emptySide() })
        removed++
      }
      continue
    }
    if (oldLines.length === 0) {
      for (const line of newLines) {
        rows.push({ left: emptySide(), right: plainSide(rightNo++, 'add', line) })
        added++
      }
      continue
    }

    // 两侧都有 → 按内容相似度对齐配对：
    // 完全相同的行按"未变"展示，相似的行配成"修改"做行内高亮，配不上的各自算删除 / 新增
    for (const pair of alignLines(oldLines, newLines)) {
      if (pair.oldIndex !== null && pair.newIndex !== null) {
        const oldLine = oldLines[pair.oldIndex]
        const newLine = newLines[pair.newIndex]
        if (oldLine === newLine) {
          rows.push({
            left: plainSide(leftNo++, 'same', oldLine),
            right: plainSide(rightNo++, 'same', newLine),
          })
          continue
        }
        // 相似度达标但仍差太远的兜底（大块退回行号配对时会出现）
        if (lineSimilarity(oldLine, newLine) < MOD_SIMILARITY_THRESHOLD) {
          rows.push({ left: plainSide(leftNo++, 'del', oldLine), right: emptySide() })
          rows.push({ left: emptySide(), right: plainSide(rightNo++, 'add', newLine) })
          removed++
          added++
          continue
        }
        const { left, right } = inlineDiff(oldLine, newLine, granularity)
        rows.push({
          left: { lineNo: leftNo++, type: 'mod', segments: left },
          right: { lineNo: rightNo++, type: 'mod', segments: right },
        })
        modified++
      } else if (pair.oldIndex !== null) {
        rows.push({ left: plainSide(leftNo++, 'del', oldLines[pair.oldIndex]), right: emptySide() })
        removed++
      } else if (pair.newIndex !== null) {
        rows.push({ left: emptySide(), right: plainSide(rightNo++, 'add', newLines[pair.newIndex]) })
        added++
      }
    }
  }

  return {
    rows,
    stats: { added, removed, modified },
    identical: added === 0 && removed === 0 && modified === 0,
  }
}
