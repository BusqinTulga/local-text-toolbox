// Base64 编解码：UTF-8 安全（btoa/atob 只认 Latin-1，需经 TextEncoder 转字节）。
// 解码走容错路线：忽略空白、同时接受标准与 URL 安全字母表、自动补齐 padding；
// 解出的字节不是合法 UTF-8 时不直接报错，用替换字符显示并单独警告。

export type B64Code = 'b64ErrChars' | 'b64ErrLen' | 'b64WarnNotUtf8'

export function b64encode(text: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  const CHUNK = 0x8000 // 分块拼接，避免大输入时 fromCharCode 参数展开爆栈
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  const b64 = btoa(bin)
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64
}

export interface B64DecodeResult {
  text: string
  warnings: B64Code[]
  fatal?: B64Code
}

export function b64decode(input: string): B64DecodeResult {
  let s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (/[^A-Za-z0-9+/=]/.test(s)) return { text: '', warnings: [], fatal: 'b64ErrChars' }
  s = s.replace(/=+$/, '')
  if (s.length % 4 === 1) return { text: '', warnings: [], fatal: 'b64ErrLen' }
  if (s.length % 4 !== 0) s += '='.repeat(4 - (s.length % 4))

  let bin: string
  try {
    bin = atob(s)
  } catch {
    // 走到这里说明 '=' 出现在中间等 atob 才能发现的问题
    return { text: '', warnings: [], fatal: 'b64ErrChars' }
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), warnings: [] }
  } catch {
    return { text: new TextDecoder().decode(bytes), warnings: ['b64WarnNotUtf8'] }
  }
}
