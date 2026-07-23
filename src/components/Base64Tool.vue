<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { b64encode, b64decode, type B64Code } from '../lib/base64'

const { t } = useI18n()

const dir = ref<'enc' | 'dec'>('dec')
const urlSafe = ref(false)
const input = ref('')
const copied = ref(false)

const inputEl = ref<HTMLTextAreaElement | null>(null)

const result = computed<{ text: string; warnings: B64Code[]; fatal?: B64Code }>(() => {
  if (input.value === '') return { text: '', warnings: [] }
  if (dir.value === 'enc') {
    return { text: b64encode(input.value, urlSafe.value), warnings: [] }
  }
  return b64decode(input.value)
})

const output = computed(() => (result.value.fatal ? '' : result.value.text))

watch([input, dir, urlSafe], () => (copied.value = false))

// 输入框随内容自动增高（与格式化工具同一套处理）
function autoresize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

watch(input, () => nextTick(autoresize))
onMounted(autoresize)

async function copy() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
  } catch {
    // http 内网环境没有 clipboard API，退回旧方案
    const ta = document.createElement('textarea')
    ta.value = output.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copied.value = true
}
</script>

<template>
  <section class="b64-tool">
    <div class="toolbar">
      <div class="seg-group" role="group">
        <button :class="{ active: dir === 'dec' }" @click="dir = 'dec'">
          {{ t('b64Decode') }}
        </button>
        <button :class="{ active: dir === 'enc' }" @click="dir = 'enc'">
          {{ t('b64Encode') }}
        </button>
      </div>

      <div v-if="dir === 'enc'" class="seg-group" role="group">
        <button :class="{ active: !urlSafe }" @click="urlSafe = false">
          {{ t('b64Standard') }}
        </button>
        <button :class="{ active: urlSafe }" @click="urlSafe = true">
          {{ t('b64UrlSafe') }}
        </button>
      </div>

      <div class="right">
        <span v-if="output" class="count">{{ output.length }} {{ t('chars') }}</span>
        <button type="button" class="copy-btn" :disabled="!output" @click="copy">
          {{ copied ? t('copied') : t('copy') }}
        </button>
      </div>
    </div>

    <div class="panes">
      <div class="pane">
        <label class="pane-label micro-label" for="b64-input">{{ t('fmtInput') }}</label>
        <div class="input-wrap">
          <textarea
            id="b64-input"
            ref="inputEl"
            v-model="input"
            :placeholder="dir === 'enc' ? t('b64PhEnc') : t('b64PhDec')"
            spellcheck="false"
          ></textarea>
        </div>
      </div>

      <div class="pane">
        <label class="pane-label micro-label">{{ t('b64Output') }}</label>

        <div v-if="result.fatal" class="result error-box">
          <div class="error-title">⚠ {{ t('b64Error') }}</div>
          <div class="error-detail">{{ t(result.fatal) }}</div>
        </div>

        <template v-else>
          <div v-if="result.warnings.length" class="issues">
            <div class="issues-title">⚠ {{ t(result.warnings[0]) }}</div>
          </div>
          <pre v-if="output" class="result out">{{ output }}</pre>
          <div v-else class="result hint">{{ t('b64EmptyHint') }}</div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.b64-tool {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
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

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.count {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--fg-faint);
}

.seg-group {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-panel);
}

.seg-group button {
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.seg-group button:hover:not(.active) {
  color: var(--ink);
}

.seg-group button.active {
  background: var(--ink);
  color: var(--bg-panel);
}

.copy-btn {
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

.copy-btn:hover:not(:disabled) {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--bg-panel);
  transform: translateY(-1px);
}

.copy-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.panes {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 420px;
}

@media (max-height: 660px) {
  .b64-tool {
    gap: 12px;
  }

  .panes {
    min-height: 240px;
  }
}

.pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pane-label {
  margin-bottom: 8px;
}

textarea,
.result {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-panel);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 21px;
  padding: 14px 16px;
  margin: 0;
}

/* 与格式化工具同构：textarea 的 min-height:100% 相对这层 flex:1 的容器算，
   而不是相对含标签的整个 pane——否则左框会比右框高出一个标签的高度 */
.input-wrap {
  flex: 1;
  display: flex;
  min-height: 0;
}

textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  color: var(--fg);
  transition: border-color 0.18s ease;
  min-height: 100%;
  overflow-y: hidden;
}

textarea::placeholder {
  color: var(--fg-faint);
}

textarea:focus {
  outline: none;
  border-color: var(--border-strong);
}

.out {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-all;
  color: var(--fg);
}

.hint {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-faint);
  font-family: inherit;
  font-size: 13px;
}

.issues {
  border: 1px solid var(--mod-gutter);
  background: var(--mod-gutter);
  padding: 10px 14px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.issues-title {
  font-weight: 600;
  font-size: 12px;
}

.error-box {
  border-color: var(--del-fg);
  overflow: auto;
}

.error-title {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  font-weight: 600;
  color: var(--del-fg);
  margin-bottom: 8px;
}

.error-detail {
  font-size: 12px;
  color: var(--fg-muted);
  word-break: break-all;
}
</style>
