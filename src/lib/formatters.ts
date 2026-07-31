// 统一格式化入口：自动识别格式 + 按格式分发。
// JSON/XML 走自写的保内容容错格式化器（只重排缩进，绝不改内容，问题单独提示）；
// YAML 走本地打包的 yaml 库，动态 import 做代码分割——运行时不发任何网络请求。

import { parseTolerant, formatJsonPreserving, type IssueCode } from './jsonTolerant'
import { formatXmlTolerant, type XmlIssueCode } from './xmlTolerant'

export type Fmt = 'json' | 'xml' | 'yaml'

export const FMT_LABEL: Record<Fmt, string> = {
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
}

export interface FormatIssue {
  line: number | null
  col: number | null
  /** JSON/XML 问题走 i18n key */
  code?: IssueCode | XmlIssueCode
  /** 其他格式的原始报错信息 */
  message?: string
  /** 语言无关的补充信息，如「<kill> ↔ </skill>」 */
  detail?: string
  /** 出错内容在输入原文中的字符范围（可多段），有则 UI 只高亮这些片段，无则整行 */
  ranges?: { start: number; end: number }[]
}

export interface FormatOutput {
  output: string
  issues: FormatIssue[]
  /** 完全无法给出结果时的致命错误 */
  fatal?: { message: string; line: number | null; col: number | null }
}

export type Indent = '2' | '4' | 'min'

/** 压缩模式只对这些格式有意义 */
export function supportsMinify(fmt: Fmt): boolean {
  return fmt === 'json' || fmt === 'xml'
}

// ---- 自动识别 ----

export function detectFormat(text: string): Fmt | null {
  const t = text.replace(/^﻿/, '').trimStart()
  if (t === '') return null
  const head = t.slice(0, 4000)

  if (t[0] === '<') return 'xml'
  if (t[0] === '{' || t[0] === '[') return 'json'
  if (
    /^---(\s|$)/.test(t) ||
    /^[ \t]*[^#\s{[][^:\n]*:([ \t]|$)/m.test(head) ||
    /^[ \t]*- /m.test(head)
  ) {
    return 'yaml'
  }
  // 裸标量（"abc" / 123 / true）也算 JSON——必须整个文本就是这一个标量：
  // 只看开头的话，以时间戳/数字开头的日志、纯文本全会被误判成 JSON
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*$/.test(t)) return 'json'
  if (/^(true|false|null)\s*$/.test(t)) return 'json'
  if (/^(["'])[\s\S]*\1\s*$/.test(t)) return 'json'
  return null
}

// ---- 分发 ----

export async function formatText(text: string, fmt: Fmt, indent: Indent): Promise<FormatOutput> {
  switch (fmt) {
    case 'json':
      return formatJson(text, indent)
    case 'xml':
      return formatXml(text, indent)
    case 'yaml':
      return formatYaml(text, indent === '4' ? 4 : 2)
  }
}

function formatJson(text: string, indent: Indent): FormatOutput {
  // 排版与检错分离：输出只重排原始 token，问题清单来自容错解析
  const output = formatJsonPreserving(text, indent)
  const r = parseTolerant(text)
  return {
    output,
    issues: r.issues.map((i) => ({
      line: i.line,
      col: i.col,
      code: i.code,
      ranges: [{ start: i.pos, end: jsonTokenEnd(text, i.pos) }],
    })),
  }
}

/** JSON 问题只有单点 pos：从该点向后扫出一个 token 的近似范围用于高亮 */
function jsonTokenEnd(text: string, pos: number): number {
  const c = text[pos]
  if (c === undefined) return pos
  if (c === '"' || c === "'") {
    // 字符串：扫到同种引号闭合（跳过转义），最多到行尾
    for (let i = pos + 1; i < text.length && i - pos < 200; i++) {
      if (text[i] === '\\') i++
      else if (text[i] === c) return i + 1
      else if (text[i] === '\n') return i
    }
    return Math.min(pos + 200, text.length)
  }
  const m = /^(\/\/[^\n]*|\/\*[\s\S]*?\*\/|[^\s,:\]}"']+)/.exec(text.slice(pos, pos + 200))
  return pos + (m ? m[0].length : 1)
}

function formatXml(text: string, indent: Indent): FormatOutput {
  // 与 JSON 同一原则：只按原始 token 重排缩进，问题逐条提示，绝不改内容
  const r = formatXmlTolerant(text, indent)
  return {
    output: r.output,
    issues: r.issues.map((i) => ({
      line: i.line,
      col: i.col,
      code: i.code,
      detail: i.detail,
      ranges: i.ranges,
    })),
  }
}

async function formatYaml(text: string, width: number): Promise<FormatOutput> {
  const YAML = await import('yaml')
  try {
    const docs = YAML.parseAllDocuments(text)
    if (docs.length === 0) return { output: '', issues: [] }
    const issues: FormatIssue[] = []
    for (const doc of docs) {
      for (const err of [...doc.errors, ...doc.warnings]) {
        issues.push({
          line: err.linePos?.[0]?.line ?? null,
          col: err.linePos?.[0]?.col ?? null,
          message: err.message.split('\n')[0],
          // yaml 库的 err.pos 就是 [start, end) 字符范围
          ranges:
            Array.isArray(err.pos) && err.pos.length === 2
              ? [{ start: err.pos[0], end: Math.max(err.pos[1], err.pos[0] + 1) }]
              : undefined,
        })
      }
    }
    const parts: string[] = []
    for (const doc of docs) {
      // 与 JSON 同一原则：有错也尽量给结果。带错误的文档 toString 会抛异常，
      // 这时按原文原样保留该文档，错误已在上面逐条列出
      try {
        parts.push(doc.toString({ indent: width }))
      } catch {
        const [start, , end] = doc.range
        parts.push(text.slice(start, end).replace(/^\n+|\s+$/g, '') + '\n')
      }
    }
    // 多文档之间补分隔线（toString 只在文档自带 directives 时才输出 ---）
    const output = parts
      .map((p, k) => (k > 0 && !p.startsWith('---') ? '---\n' + p : p))
      .join('')
      // toString 输出总带结尾换行，去掉避免结果多出一个空行
      .replace(/\n+$/, '')
    return { output, issues }
  } catch (e) {
    return { output: '', issues: [], fatal: toFatal(e) }
  }
}

/** 从库的报错信息里尽量抠出行列号 */
function toFatal(e: unknown): { message: string; line: number | null; col: number | null } {
  const message = e instanceof Error ? e.message : String(e)
  const m =
    message.match(/line[:\s]+(\d+)[,:\s]+col(?:umn)?[:\s]+(\d+)/i) ??
    message.match(/\((\d+):(\d+)\)/) ??
    message.match(/(\d+):(\d+)/)
  return {
    message: message.length > 600 ? message.slice(0, 600) + '…' : message,
    line: m ? Number(m[1]) : null,
    col: m ? Number(m[2]) : null,
  }
}
