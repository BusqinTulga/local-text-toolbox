// 容错 XML 格式化器：与 jsonTolerant 同一原则——
// 输出只按原始 token 重排缩进/换行（属性、引号、大小写、非法写法全部原样保留），
// 同时检测标签不匹配、未闭合等问题，按行列逐条报告，绝不替用户修改内容。

export type XmlIssueCode =
  | 'issXmlMismatch'
  | 'issXmlUnclosed'
  | 'issXmlCloseExtra'
  | 'issXmlTagSyntax'
  | 'issXmlCommentUnclosed'
  | 'issXmlAttrQuote'

export interface XmlIssue {
  code: XmlIssueCode
  pos: number
  line: number
  col: number
  /** 语言无关的补充信息，如「<kill> ↔ </skill>」 */
  detail?: string
  /** 出错内容在原文中的字符范围（可多段，如 mismatch 的开始/闭合两个标签），供 UI 精确高亮 */
  ranges?: { start: number; end: number }[]
}

interface Tok {
  t: 'open' | 'close' | 'self' | 'text' | 'block' // block = 注释/CDATA/DOCTYPE/<?…?>
  raw: string
  name: string
  pos: number
}

function lineCol(src: string, pos: number): { line: number; col: number } {
  let line = 1
  let last = -1
  const end = Math.min(pos, src.length)
  for (let i = 0; i < end; i++) {
    if (src[i] === '\n') {
      line++
      last = i
    }
  }
  return { line, col: pos - last }
}

// 名字字符取宽松定义：报错检测不是校验器，尽量往下解析
const NAME_CHAR = /[^\s<>/=]/
const NAME_START = /[A-Za-z_:-￿]/

type AddIssue = (
  c: XmlIssueCode,
  pos: number,
  detail?: string,
  ranges?: { start: number; end: number }[],
) => void

function tokenize(src: string, add: AddIssue): Tok[] {
  const toks: Tok[] = []
  const n = src.length
  let i = 0
  while (i < n) {
    if (src[i] !== '<') {
      let j = src.indexOf('<', i)
      if (j === -1) j = n
      toks.push({ t: 'text', raw: src.slice(i, j), name: '', pos: i })
      i = j
      continue
    }
    if (src.startsWith('<!--', i)) {
      const e = src.indexOf('-->', i + 4)
      if (e === -1) {
        add('issXmlCommentUnclosed', i, undefined, [{ start: i, end: i + 4 }])
        toks.push({ t: 'block', raw: src.slice(i), name: '', pos: i })
        i = n
      } else {
        toks.push({ t: 'block', raw: src.slice(i, e + 3), name: '', pos: i })
        i = e + 3
      }
      continue
    }
    if (src.startsWith('<![CDATA[', i)) {
      const e = src.indexOf(']]>', i + 9)
      if (e === -1) {
        add('issXmlCommentUnclosed', i, undefined, [{ start: i, end: i + 9 }])
        toks.push({ t: 'block', raw: src.slice(i), name: '', pos: i })
        i = n
      } else {
        toks.push({ t: 'block', raw: src.slice(i, e + 3), name: '', pos: i })
        i = e + 3
      }
      continue
    }
    if (src.startsWith('<?', i)) {
      const e = src.indexOf('?>', i + 2)
      if (e === -1) {
        add('issXmlTagSyntax', i, undefined, [{ start: i, end: i + 2 }])
        toks.push({ t: 'block', raw: src.slice(i), name: '', pos: i })
        i = n
      } else {
        toks.push({ t: 'block', raw: src.slice(i, e + 2), name: '', pos: i })
        i = e + 2
      }
      continue
    }
    if (src.startsWith('<!', i)) {
      // DOCTYPE 等：内部子集 [ … ] 里允许出现 >，用中括号深度判断结束
      let j = i + 2
      let depth = 0
      while (j < n) {
        const c = src[j]
        if (c === '[') depth++
        else if (c === ']') depth--
        else if (c === '>' && depth <= 0) break
        j++
      }
      if (j >= n) {
        add('issXmlTagSyntax', i, undefined, [{ start: i, end: i + 2 }])
        toks.push({ t: 'block', raw: src.slice(i), name: '', pos: i })
        i = n
      } else {
        toks.push({ t: 'block', raw: src.slice(i, j + 1), name: '', pos: i })
        i = j + 1
      }
      continue
    }
    if (src[i + 1] === '/') {
      // 闭合标签
      let j = i + 2
      let name = ''
      while (j < n && NAME_CHAR.test(src[j])) {
        name += src[j]
        j++
      }
      while (j < n && src[j] !== '>' && src[j] !== '<') j++
      if (src[j] === '>') {
        toks.push({ t: 'close', raw: src.slice(i, j + 1), name, pos: i })
        i = j + 1
      } else {
        // 没等到 > 就撞上 EOF 或下一个 <（如「</t」）
        add('issXmlTagSyntax', i, undefined, [{ start: i, end: j }])
        toks.push({ t: 'close', raw: src.slice(i, j), name, pos: i })
        i = j
      }
      continue
    }
    if (i + 1 < n && NAME_START.test(src[i + 1])) {
      // 开始标签：扫属性时跳过引号内容
      let j = i + 1
      let name = ''
      while (j < n && NAME_CHAR.test(src[j])) {
        name += src[j]
        j++
      }
      let closed = false
      while (j < n) {
        const c = src[j]
        if (c === '"' || c === "'") {
          const q = src.indexOf(c, j + 1)
          const nl = src.indexOf('\n', j + 1)
          if (q === -1 || (nl !== -1 && nl < q)) {
            // 引号没在本行闭合：报告后当普通字符处理，让 > 正常收尾
            add('issXmlAttrQuote', j, undefined, [{ start: j, end: j + 1 }])
            j++
          } else if (/[^\s/>]/.test(src[q + 1] ?? '') && src.slice(j + 1, q).includes('=')) {
            // 「闭合引号」后面紧贴内容、且引号内部还有 =：多半是这个开引号漏了闭合，
            // 把下一个属性的开引号误当成闭合了——按未闭合报在开引号上，
            // 从开引号后继续扫，让后面的属性能正常配对
            add('issXmlAttrQuote', j, undefined, [{ start: j, end: j + 1 }])
            j++
          } else {
            j = q + 1
          }
          continue
        }
        if (c === '>') {
          closed = true
          j++
          break
        }
        if (c === '<') break
        j++
      }
      if (!closed) add('issXmlTagSyntax', i, undefined, [{ start: i, end: j }])
      const raw = src.slice(i, j)
      toks.push({ t: raw.endsWith('/>') ? 'self' : 'open', raw, name, pos: i })
      i = j
      continue
    }
    // < 后面不是合法的标签起始（如「a < b」）：报告后当文本处理
    add('issXmlTagSyntax', i, undefined, [{ start: i, end: i + 1 }])
    let j = src.indexOf('<', i + 1)
    if (j === -1) j = n
    toks.push({ t: 'text', raw: src.slice(i, j), name: '', pos: i })
    i = j
  }
  return toks
}

export function formatXmlTolerant(
  text: string,
  indent: '2' | '4' | 'min',
): { output: string; issues: XmlIssue[] } {
  const src = text.replace(/^﻿/, '')
  const issues: XmlIssue[] = []
  const seen = new Set<string>()
  const add: AddIssue = (code, pos, detail, ranges) => {
    const key = code + ':' + pos
    if (seen.has(key)) return
    seen.add(key)
    issues.push({ code, pos, ...lineCol(src, pos), detail, ranges })
  }
  const rng = (t: Tok) => ({ start: t.pos, end: t.pos + t.raw.length })

  const toks = tokenize(src, add)

  // 布局 + 栈匹配一趟完成
  const lines: { ind: number; s: string }[] = []
  const push = (ind: number, s: string) => lines.push({ ind: Math.max(0, ind), s })
  const stack: { name: string; pos: number; end: number }[] = []
  let level = 0

  const pushText = (raw: string, ind: number) => {
    for (const ln of raw.split('\n')) {
      const s = ln.trim()
      if (s) push(ind, s)
    }
  }

  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k]
    if (tok.t === 'text') {
      pushText(tok.raw, level)
      continue
    }
    if (tok.t === 'block' || tok.t === 'self') {
      push(level, tok.raw)
      continue
    }
    if (tok.t === 'open') {
      const t1 = toks[k + 1]
      const t2 = toks[k + 2]
      // 「<a></a>」「<a>短文本</a>」合并成一行；名字不匹配但闭合标签就地配对
      // 当前元素（栈里更外层找不到同名开始标签）的也合并，mismatch 照报
      const closesHere = (c: Tok) => c.name === tok.name || !stack.some((s) => s.name === c.name)
      if (t1 && t1.t === 'close' && closesHere(t1)) {
        if (t1.name !== tok.name)
          add('issXmlMismatch', t1.pos, `<${tok.name}> ↔ </${t1.name}>`, [rng(tok), rng(t1)])
        push(level, tok.raw + t1.raw)
        k += 1
        continue
      }
      if (t1 && t1.t === 'text' && t2 && t2.t === 'close' && closesHere(t2)) {
        const inner = t1.raw.trim()
        if (!inner.includes('\n')) {
          if (t2.name !== tok.name)
            add('issXmlMismatch', t2.pos, `<${tok.name}> ↔ </${t2.name}>`, [rng(tok), rng(t2)])
          push(level, tok.raw + inner + t2.raw)
          k += 2
          continue
        }
      }
      stack.push({ name: tok.name, pos: tok.pos, end: tok.pos + tok.raw.length })
      push(level, tok.raw)
      level++
      continue
    }
    // close：按栈恢复缩进
    const top = stack[stack.length - 1]
    if (top && top.name === tok.name) {
      stack.pop()
      level--
      push(level, tok.raw)
    } else if (stack.some((s) => s.name === tok.name)) {
      // 能在更外层找到同名开始标签：中间没闭合的逐个报告
      while (stack.length && stack[stack.length - 1].name !== tok.name) {
        const p = stack.pop()!
        level--
        add('issXmlUnclosed', p.pos, `<${p.name}>`, [{ start: p.pos, end: p.end }])
      }
      stack.pop()
      level--
      push(level, tok.raw)
    } else if (top) {
      // 名字对不上又找不到同名的：视为闭合当前元素
      add('issXmlMismatch', tok.pos, `<${top.name}> ↔ </${tok.name}>`, [
        { start: top.pos, end: top.end },
        rng(tok),
      ])
      stack.pop()
      level--
      push(level, tok.raw)
    } else {
      add('issXmlCloseExtra', tok.pos, `</${tok.name}>`, [rng(tok)])
      push(level, tok.raw)
    }
  }
  for (const s of stack) add('issXmlUnclosed', s.pos, `<${s.name}>`, [{ start: s.pos, end: s.end }])

  issues.sort((a, b) => a.pos - b.pos)

  if (indent === 'min') {
    let out = ''
    for (const tok of toks) {
      out += tok.t === 'text' ? tok.raw.trim().replace(/\s*\n\s*/g, ' ') : tok.raw
    }
    return { output: out, issues }
  }

  const pad = indent === '4' ? '    ' : '  '
  return {
    output: lines.map((l) => pad.repeat(l.ind) + l.s).join('\n'),
    issues,
  }
}
