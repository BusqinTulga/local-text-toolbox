import { computeDiff, type Granularity } from '../lib/diffEngine'

interface DiffReq {
  oldText: string
  newText: string
  granularity: Granularity
}

self.onmessage = (e: MessageEvent<{ seq: number; req: DiffReq }>) => {
  const { seq, req } = e.data
  const result = computeDiff(req.oldText, req.newText, req.granularity)
  self.postMessage({ seq, result })
}
