<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useI18n } from '../i18n'

const { t } = useI18n()

const input = ref('')
const tooLong = ref(false)

const inputEl = ref<HTMLTextAreaElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

const hasInput = computed(() => input.value.trim() !== '')

// 输入框随内容自动增高（与 Base64 工具同一套处理）
function autoresize() {
  const el = inputEl.value
  // 工具页用 v-show 切换，隐藏（display:none）状态下 scrollHeight 是 0，
  // 量出来会把高度锁死成 2px——跳过，等可见时由 ResizeObserver 补量
  if (!el || el.offsetParent === null) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

async function render() {
  tooLong.value = false
  const el = canvasEl.value
  if (!el) return
  const text = input.value.trim()
  if (text === '') return
  try {
    // 深浅色固定为黑白：扫码器在暗色主题下也需要白底才可靠
    await QRCode.toCanvas(el, text, {
      width: 640,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111111', light: '#ffffff' },
    })
  } catch {
    tooLong.value = true
  }
}

watch(input, () =>
  nextTick(() => {
    autoresize()
    render()
  }),
)
// 挂载时可能处于隐藏页；元素从隐藏变可见（尺寸 0 → 实际值）时观察器会触发，补量高度
let ro: ResizeObserver | undefined
onMounted(() => {
  autoresize()
  if (inputEl.value) {
    ro = new ResizeObserver(autoresize)
    ro.observe(inputEl.value)
  }
})
onUnmounted(() => ro?.disconnect())

function download() {
  const el = canvasEl.value
  if (!el || !hasInput.value || tooLong.value) return
  const a = document.createElement('a')
  a.href = el.toDataURL('image/png')
  a.download = 'qrcode.png'
  a.click()
}
</script>

<template>
  <section class="qr-tool">
    <div class="field">
      <label class="pane-label micro-label" for="qr-input">{{ t('fmtInput') }}</label>
      <textarea
        id="qr-input"
        ref="inputEl"
        v-model="input"
        :placeholder="t('qrPlaceholder')"
        spellcheck="false"
        rows="1"
      ></textarea>
    </div>

    <div v-if="tooLong" class="error-box">
      <div class="error-title">⚠ {{ t('qrError') }}</div>
      <div class="error-detail">{{ t('qrErrTooLong') }}</div>
    </div>

    <div v-if="!hasInput" class="qr-empty micro-label">{{ t('qrEmptyHint') }}</div>

    <div v-show="hasInput && !tooLong" class="qr-result">
      <canvas ref="canvasEl" class="qr-canvas"></canvas>
      <div class="scan-hint micro-label">{{ t('qrScanHint') }}</div>
      <button type="button" class="dl-btn" @click="download">{{ t('qrDownload') }}</button>
    </div>
  </section>
</template>

<style scoped>
/* 二维码是小尺寸输出，不需要双栏满屏——收窄成单列，内容出现在输入框正下方 */
.qr-tool {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: rise 0.3s ease both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.field {
  display: flex;
  flex-direction: column;
}

.pane-label {
  margin-bottom: 8px;
}

textarea {
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-panel);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 21px;
  padding: 14px 16px;
  margin: 0;
  resize: none;
  color: var(--fg);
  transition: border-color 0.18s ease;
  overflow-y: hidden;
}

textarea::placeholder {
  color: var(--fg-faint);
}

textarea:focus {
  outline: none;
  border-color: var(--border-strong);
}

.qr-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

/* canvas 内部按 640px 高清生成，显示时缩到 320px，扫码和下载都清晰；
   白色静区自带，不再额外加框 */
.qr-canvas {
  width: 320px !important;
  height: 320px !important;
  background: #fff;
}

/* 空状态：占住二维码将要出现的位置，告诉用户这里会长出什么 */
.qr-empty {
  width: 320px;
  height: 320px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  border: 1px dashed var(--border);
  color: var(--fg-faint);
}

.scan-hint {
  color: var(--fg-faint);
}

.dl-btn {
  padding: 6px 18px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-panel);
  color: var(--fg);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.dl-btn:hover {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--bg-panel);
  transform: translateY(-1px);
}

.error-box {
  border: 1px solid var(--del-fg);
  background: var(--bg-panel);
  padding: 14px 16px;
}

.error-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--del-fg);
  margin-bottom: 8px;
}

.error-detail {
  font-size: 12px;
  color: var(--fg-muted);
  word-break: break-all;
}
</style>
