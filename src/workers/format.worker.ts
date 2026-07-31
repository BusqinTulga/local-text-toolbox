import { formatText, type Fmt, type Indent } from '../lib/formatters'

interface FormatReq {
  text: string
  fmt: Fmt
  indent: Indent
}

self.onmessage = async (e: MessageEvent<{ seq: number; req: FormatReq }>) => {
  const { seq, req } = e.data
  const result = await formatText(req.text, req.fmt, req.indent)
  self.postMessage({ seq, result })
}
