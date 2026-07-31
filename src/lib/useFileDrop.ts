import { onUnmounted, ref, type Ref } from 'vue'
import type { MessageKey } from '../i18n'

// 一次性读进内存再填入 textarea，太大会卡死页面，直接拒绝
const MAX_SIZE = 20 * 1024 * 1024

export interface FileDrop {
  dragging: Ref<boolean>
  error: Ref<MessageKey | null>
  onDragover: (e: DragEvent) => void
  onDragleave: () => void
  onDrop: (e: DragEvent) => void
}

export function useFileDrop(onText: (text: string) => void): FileDrop {
  const dragging = ref(false)
  const error = ref<MessageKey | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function showError(code: MessageKey) {
    error.value = code
    clearTimeout(timer)
    timer = setTimeout(() => (error.value = null), 4000)
  }

  // 只响应文件拖拽；页面内拖选文字经过输入框时 types 里没有 Files，不触发
  function hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
  }

  function onDragover(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    dragging.value = true
  }

  function onDragleave() {
    dragging.value = false
  }

  async function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragging.value = false
    const file = e.dataTransfer?.files[0]
    if (!file) return
    if (file.size > MAX_SIZE) {
      showError('dropErrTooLarge')
      return
    }
    const text = await file.text()
    if (text.includes('\0')) {
      showError('dropErrBinary')
      return
    }
    clearTimeout(timer)
    error.value = null
    onText(text)
  }

  onUnmounted(() => clearTimeout(timer))

  return { dragging, error, onDragover, onDragleave, onDrop }
}
