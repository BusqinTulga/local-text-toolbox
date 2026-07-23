// 容错 JSON 解析器：尽量把"接近 JSON"的文本解析出来，同时记录每一处偏离标准的地方。
// 注意：解析结果只用来**检测问题位置**，格式化输出走下面的 formatJsonPreserving——
// 用户的内容一个字符都不改，只重排缩进；问题仅提示，不修复。

export type IssueCode =
  | 'issComment' // 有注释（标准 JSON 不允许 // /* */ #）
  | 'issQuote' // 引号问题：单引号、键/值没加引号、非法转义
  | 'issStrUnclosed' // 字符串没闭合
  | 'issCommaMissing' // 缺逗号
  | 'issCommaExtra' // 多余的逗号（尾逗号、连续逗号）
  | 'issColonMissing' // 缺冒号（或用了 =）
  | 'issValueMissing' // 缺少值
  | 'issBracketUnclosed' // 括号没闭合 / 不匹配
  | 'issLiteral' // 非标准字面量：None/True/NaN/Infinity/十六进制数……
  | 'issSkipped' // 无法解析的字符
  | 'issExtra' // 根值之后还有内容

export interface ParseIssue {
  code: IssueCode
  pos: number
  line: number
  col: number
}

export interface TolerantResult {
  value: unknown
  issues: ParseIssue[]
  /** 完全没解析出任何东西（输入非空但一个值都提取不出来） */
  failed: boolean
}

const MAX_DEPTH = 400

export function parseTolerant(text: string): TolerantResult {
  return new Parser(text).run()
}

class Parser {
  private text: string
  private i = 0
  private depth = 0
  private issues: ParseIssue[] = []

  constructor(text: string) {
    this.text = text
  }

  run(): TolerantResult {
    if (this.text.charCodeAt(0) === 0xfeff) this.i = 1 // BOM
    this.skipWs()
    if (this.i >= this.text.length) {
      return { value: undefined, issues: this.issues, failed: true }
    }
    let value = this.parseValue()
    // 开头就是垃圾字符时跳过重试，直到解析出东西或到结尾
    while (value === undefined && this.i < this.text.length) {
      this.issue('issSkipped')
      this.i++
      this.skipWs()
      if (this.i < this.text.length) value = this.parseValue()
    }
    this.skipWs()
    if (this.i < this.text.length) this.issue('issExtra')
    return { value, issues: this.issues, failed: value === undefined }
  }

  // ---- 基础工具 ----

  private issue(code: IssueCode, pos = this.i) {
    // 同一位置同一类问题只记一次（比如整段注释）
    const last = this.issues[this.issues.length - 1]
    if (last && last.code === code && pos - last.pos <= 1) {
      last.pos = pos
      return
    }
    const { line, col } = this.lineCol(pos)
    this.issues.push({ code, pos, line, col })
  }

  private lineCol(pos: number): { line: number; col: number } {
    let line = 1
    let col = 1
    for (let k = 0; k < pos && k < this.text.length; k++) {
      if (this.text[k] === '\n') {
        line++
        col = 1
      } else {
        col++
      }
    }
    return { line, col }
  }

  private skipWs() {
    const t = this.text
    for (;;) {
      while (this.i < t.length && ' \t\n\r\v\f '.includes(t[this.i])) this.i++
      // 注释：// … 行尾、/* … */、# … 行尾
      if (t[this.i] === '/' && t[this.i + 1] === '/') {
        this.issue('issComment')
        while (this.i < t.length && t[this.i] !== '\n') this.i++
      } else if (t[this.i] === '/' && t[this.i + 1] === '*') {
        this.issue('issComment')
        const end = t.indexOf('*/', this.i + 2)
        this.i = end === -1 ? t.length : end + 2
      } else if (t[this.i] === '#') {
        this.issue('issComment')
        while (this.i < t.length && t[this.i] !== '\n') this.i++
      } else {
        return
      }
    }
  }

  // ---- 值 ----

  private parseValue(): unknown {
    this.skipWs()
    const c = this.text[this.i]
    if (c === undefined) return undefined
    if (c === '{') return this.parseObject()
    if (c === '[') return this.parseArray()
    if (c === '"' || c === "'" || c === '“' || c === '”') return this.parseString()
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return this.parseNumber()
    if (/[A-Za-z_$¡-￿]/.test(c)) return this.parseWord()
    return undefined
  }

  private parseObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    if (++this.depth > MAX_DEPTH) {
      this.issue('issSkipped')
      this.skipBalanced('{', '}')
      this.depth--
      return obj
    }
    this.i++ // {
    let afterComma = false
    for (;;) {
      this.skipWs()
      const c = this.text[this.i]
      if (c === undefined) {
        this.issue('issBracketUnclosed', this.text.length)
        break
      }
      if (c === '}') {
        if (afterComma) this.issue('issCommaExtra')
        this.i++
        break
      }
      if (c === ',') {
        this.issue('issCommaExtra')
        this.i++
        continue
      }
      if (c === ']') {
        // 括号错配：{"a":1] —— 当作闭合
        this.issue('issBracketUnclosed')
        this.i++
        break
      }
      // 键
      const key = this.parseKey()
      if (key === undefined) {
        this.issue('issSkipped')
        this.i++
        continue
      }
      // 冒号（= 也认，缺了就补）
      this.skipWs()
      if (this.text[this.i] === ':') {
        this.i++
      } else if (this.text[this.i] === '=') {
        this.issue('issColonMissing')
        this.i++
      } else {
        this.issue('issColonMissing')
      }
      // 值
      this.skipWs()
      const vc = this.text[this.i]
      if (vc === ',' || vc === '}' || vc === undefined) {
        this.issue('issValueMissing')
        obj[key] = null
      } else {
        const v = this.parseValue()
        obj[key] = v === undefined ? null : v
        if (v === undefined) this.issue('issValueMissing')
      }
      // 分隔
      this.skipWs()
      const sc = this.text[this.i]
      if (sc === ',') {
        this.i++
        afterComma = true
      } else if (sc === '}' || sc === ']' || sc === undefined) {
        afterComma = false
      } else {
        this.issue('issCommaMissing')
        afterComma = false
      }
    }
    this.depth--
    return obj
  }

  private parseArray(): unknown[] {
    const arr: unknown[] = []
    if (++this.depth > MAX_DEPTH) {
      this.issue('issSkipped')
      this.skipBalanced('[', ']')
      this.depth--
      return arr
    }
    this.i++ // [
    let afterComma = false
    for (;;) {
      this.skipWs()
      const c = this.text[this.i]
      if (c === undefined) {
        this.issue('issBracketUnclosed', this.text.length)
        break
      }
      if (c === ']') {
        if (afterComma) this.issue('issCommaExtra')
        this.i++
        break
      }
      if (c === ',') {
        // [1,,2] —— 连续逗号：删掉
        this.issue('issCommaExtra')
        this.i++
        continue
      }
      if (c === '}') {
        this.issue('issBracketUnclosed')
        this.i++
        break
      }
      const v = this.parseValue()
      if (v === undefined) {
        this.issue('issSkipped')
        this.i++
        continue
      }
      arr.push(v)
      this.skipWs()
      const sc = this.text[this.i]
      if (sc === ',') {
        this.i++
        afterComma = true
      } else if (sc === ']' || sc === '}' || sc === undefined) {
        afterComma = false
      } else {
        this.issue('issCommaMissing')
        afterComma = false
      }
    }
    this.depth--
    return arr
  }

  private parseKey(): string | undefined {
    const c = this.text[this.i]
    if (c === '"' || c === "'" || c === '“' || c === '”') return this.parseString()
    // 未加引号的键：标识符风格，读到 : = 空白 为止
    if (/[A-Za-z0-9_$\-.¡-￿]/.test(c)) {
      const start = this.i
      while (this.i < this.text.length && /[A-Za-z0-9_$\-.¡-￿]/.test(this.text[this.i])) {
        this.i++
      }
      this.issue('issQuote', start)
      return this.text.slice(start, this.i)
    }
    return undefined
  }

  private parseString(): string {
    const quote = this.text[this.i]
    const isSingle = quote === "'"
    const isSmart = quote === '“' || quote === '”'
    if (isSingle || isSmart) this.issue('issQuote')
    this.i++
    let out = ''
    const t = this.text
    for (;;) {
      const c = t[this.i]
      if (c === undefined || c === '\n') {
        // 行尾还没闭合：就地截断，避免把后面整个文档吞进字符串
        this.issue('issStrUnclosed')
        break
      }
      if (c === quote || (isSmart && (c === '“' || c === '”'))) {
        this.i++
        break
      }
      if (c === '\\') {
        const n = t[this.i + 1]
        if (n === undefined) {
          this.issue('issStrUnclosed')
          this.i++
          break
        }
        if (n === 'u') {
          const hex = t.slice(this.i + 2, this.i + 6)
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16))
            this.i += 6
          } else {
            this.issue('issQuote')
            out += 'u'
            this.i += 2
          }
        } else {
          const map: Record<string, string> = {
            '"': '"',
            "'": "'",
            '\\': '\\',
            '/': '/',
            b: '\b',
            f: '\f',
            n: '\n',
            r: '\r',
            t: '\t',
          }
          if (n in map) {
            out += map[n]
          } else {
            this.issue('issQuote')
            out += n
          }
          this.i += 2
        }
        continue
      }
      out += c
      this.i++
    }
    return out
  }

  private parseNumber(): number | string {
    const start = this.i
    const t = this.text
    const m = /^[-+]?(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(
      t.slice(this.i),
    )
    if (!m) {
      // 光一个 - / + / . ，当垃圾跳过
      this.i++
      this.issue('issSkipped', start)
      return NaN as never
    }
    this.i += m[0].length
    const num = Number(m[0])
    // 严格 JSON 能不能直接 parse？不能就说明是非标准写法（+前缀、.5、0x、前导零……）
    let strict = true
    try {
      JSON.parse(m[0])
    } catch {
      strict = false
    }
    if (!strict) this.issue('issLiteral', start)
    return Number.isFinite(num) ? num : (this.issue('issLiteral', start), 0)
  }

  private parseWord(): unknown {
    const start = this.i
    const t = this.text
    while (this.i < t.length && /[A-Za-z_$]/.test(t[this.i])) this.i++
    const word = t.slice(start, this.i)
    switch (word) {
      case 'true':
        return true
      case 'false':
        return false
      case 'null':
        return null
      case 'True':
      case 'TRUE':
        this.issue('issLiteral', start)
        return true
      case 'False':
      case 'FALSE':
        this.issue('issLiteral', start)
        return false
      case 'None':
      case 'NULL':
      case 'Null':
      case 'nil':
      case 'undefined':
        this.issue('issLiteral', start)
        return null
      case 'NaN':
      case 'Infinity':
        this.issue('issLiteral', start)
        return null
    }
    // 不是关键字：当作没加引号的字符串，读到分隔符为止
    while (this.i < t.length && !',:{}[]"\n'.includes(t[this.i])) this.i++
    this.issue('issQuote', start)
    return t.slice(start, this.i).trimEnd()
  }

  /** 深度超限时快速跳过一段配平的括号内容 */
  private skipBalanced(open: string, close: string) {
    let level = 0
    while (this.i < this.text.length) {
      const c = this.text[this.i]
      if (c === open) level++
      else if (c === close) {
        level--
        if (level === 0) {
          this.i++
          return
        }
      }
      this.i++
    }
  }
}

// ---- 保内容格式化 ----
// 按原始 token 重排缩进/换行，token 文本原样保留：单引号、尾逗号、注释、
// 非标准字面量……统统不动。问题由上面的 parseTolerant 单独检测、只提示。

type TokType = 'open' | 'close' | 'comma' | 'colon' | 'str' | 'word' | 'lineComment' | 'blockComment'

interface Token {
  t: TokType
  s: string
}

const WS = ' \t\n\r\v\f'

function tokenize(text: string): Token[] {
  const toks: Token[] = []
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  while (i < text.length) {
    const c = text[i]
    if (WS.includes(c)) {
      i++
      continue
    }
    if ((c === '/' && text[i + 1] === '/') || c === '#') {
      let j = text.indexOf('\n', i)
      if (j === -1) j = text.length
      toks.push({ t: 'lineComment', s: text.slice(i, j) })
      i = j
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2)
      j = j === -1 ? text.length : j + 2
      toks.push({ t: 'blockComment', s: text.slice(i, j) })
      i = j
      continue
    }
    if (c === '{' || c === '[') {
      toks.push({ t: 'open', s: c })
      i++
      continue
    }
    if (c === '}' || c === ']') {
      toks.push({ t: 'close', s: c })
      i++
      continue
    }
    if (c === ',') {
      toks.push({ t: 'comma', s: c })
      i++
      continue
    }
    if (c === ':') {
      toks.push({ t: 'colon', s: c })
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '“' || c === '”') {
      const start = i
      const smart = c === '“' || c === '”'
      i++
      while (i < text.length) {
        const d = text[i]
        if (d === '\\') {
          i += 2
          continue
        }
        if (d === c || (smart && (d === '“' || d === '”'))) {
          i++
          break
        }
        if (d === '\n') break // 未闭合：截到行尾
        i++
      }
      toks.push({ t: 'str', s: text.slice(start, i) })
      continue
    }
    // 数字 / 字面量 / 无引号字符串 / 垃圾：读到分隔符为止
    const start = i
    while (
      i < text.length &&
      !WS.includes(text[i]) &&
      !'{}[],:"\'“”#'.includes(text[i]) &&
      !(text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*'))
    ) {
      i++
    }
    if (i === start) i++
    toks.push({ t: 'word', s: text.slice(start, Math.max(i, start + 1)) })
  }
  return toks
}

export function formatJsonPreserving(text: string, indent: '2' | '4' | 'min'): string {
  const toks = tokenize(text)
  if (toks.length === 0) return ''

  if (indent === 'min') {
    let out = ''
    let prev: Token | null = null
    for (const tok of toks) {
      // 两个值/字面量相邻（缺逗号）时必须留空格，否则会粘成一个 token
      const needGap =
        prev !== null &&
        (tok.t === 'str' || tok.t === 'word' || tok.t === 'blockComment') &&
        (prev.t === 'str' || prev.t === 'word' || prev.t === 'close' || prev.t === 'blockComment')
      out += (needGap ? ' ' : '') + tok.s
      if (tok.t === 'lineComment') out += '\n' // 行注释后必须换行，否则吞掉后面内容
      prev = tok
    }
    return out
  }

  const pad = indent === '4' ? '    ' : '  '
  const lines: { indent: number; text: string }[] = []
  let level = 0
  let cur = { indent: 0, text: '' }

  const flush = () => {
    lines.push(cur)
    cur = { indent: level, text: '' }
  }
  const append = (s: string) => {
    if (cur.text === '' || cur.text.endsWith(': ')) cur.text += s
    else cur.text += ' ' + s
  }

  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k]
    switch (tok.t) {
      case 'open': {
        const next = toks[k + 1]
        // 空容器 {} [] 保持一行
        if (next && next.t === 'close') {
          append(tok.s + next.s)
          k++
        } else {
          append(tok.s)
          level++
          flush()
        }
        break
      }
      case 'close':
        level = Math.max(0, level - 1)
        if (cur.text === '') cur.indent = level
        else flush()
        cur.text += tok.s
        break
      case 'comma':
        cur.text += tok.s
        flush()
        break
      case 'colon':
        cur.text += tok.s + ' '
        break
      case 'lineComment':
        append(tok.s)
        flush()
        break
      default:
        append(tok.s)
    }
  }
  if (cur.text !== '') flush()

  return lines
    .filter((l) => l.text !== '')
    .map((l) => pad.repeat(l.indent) + l.text)
    .join('\n')
}
