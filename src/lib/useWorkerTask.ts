import { onUnmounted } from 'vue'

// 把重计算挪进 Web Worker 的通用封装：
// - 惰性创建，首次 run 才 new
// - seq 序号守卫，过期结果直接丢弃（run 返回 null）
// - worker 忙时来了新请求：terminate 旧 worker 重建——这是中断一个算了几十秒的
//   Myers diff 的唯一手段，保证"输入一变旧计算立即停"
export function useWorkerTask<Req, Res>(createWorker: () => Worker) {
  let busy = false
  let worker: Worker | null = null
  let seq = 0
  let pendingResolve: ((v: Res | null) => void) | null = null

  function run(req: Req): Promise<Res | null> {
    const mySeq = ++seq
    if (pendingResolve) {
      pendingResolve(null)
      pendingResolve = null
    }
    if (worker && busy) {
      worker.terminate()
      worker = null
    }
    if (!worker) worker = createWorker()
    const w = worker
    busy = true
    return new Promise((resolve) => {
      pendingResolve = resolve
      const onMessage = (e: MessageEvent<{ seq: number; result: Res }>) => {
        if (e.data.seq !== mySeq) return
        w.removeEventListener('message', onMessage)
        if (mySeq !== seq) return // 已被更新的请求取代，其 resolve(null) 已在上面执行
        pendingResolve = null
        busy = false
        resolve(e.data.result)
      }
      w.addEventListener('message', onMessage)
      w.postMessage({ seq: mySeq, req })
    })
  }

  onUnmounted(() => worker?.terminate())

  return { run }
}
