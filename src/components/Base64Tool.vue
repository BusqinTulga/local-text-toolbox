<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { b64encode, b64decode, type B64Code } from '../lib/base64'
import { useFileDrop } from '../lib/useFileDrop'
import { MAX_OUT_CHARS, HUGE_TEXT_CHARS } from '../lib/perf'

const { t } = useI18n()

const dir = ref<'enc' | 'dec'>('dec')
const urlSafe = ref(false)
const input = ref('')
const drop = useFileDrop((text) => (input.value = text))
const copied = ref(false)
const working = ref(false)

const inputEl = ref<HTMLTextAreaElement | null>(null)

// 编解码本身是 O(n)，但 2MB 级输入每次按键都全量算一遍就太浪费——加防抖
const result = ref<{ text: string; warnings: B64Code[]; fatal?: B64Code }>({
  text: '',
  warnings: [],
})
const showFull = ref(false)

let calcTimer: ReturnType<typeof setTimeout> | undefined
watch(
  [input, dir, urlSafe],
  () => {
    copied.value = false
    showFull.value = false
    working.value = input.value !== ''
    clearTimeout(calcTimer)
    calcTimer = setTimeout(() => {
      if (input.value === '') {
        result.value = { text: '', warnings: [] }
      } else if (dir.value === 'enc') {
        result.value = { text: b64encode(input.value, urlSafe.value), warnings: [] }
      } else {
        result.value = b64decode(input.value)
      }
      working.value = false
    }, 200)
  },
  { immediate: true },
)

const output = computed(() => (result.value.fatal ? '' : result.value.text))

// 超长结果只渲染前段：几 MB 的单个文本节点每次重排都以百 ms 计；复制仍是完整内容
const truncated = computed(() => !showFull.value && output.value.length > MAX_OUT_CHARS)
const displayOutput = computed(() =>
  truncated.value ? output.value.slice(0, MAX_OUT_CHARS) + '…' : output.value,
)

// 输入框随内容自动增高（与格式化工具同一套处理）。
// 测一次 scrollHeight 就是一次全量 reflow，超大内容改为防抖测量：打字期间不测，停顿后再校准
let resizeTimer: ReturnType<typeof setTimeout> | undefined

function measureHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

function autoresize() {
  const el = inputEl.value
  // 工具页用 v-show 切换，隐藏（display:none）状态下 scrollHeight 是 0，
  // 量出来会把高度锁死成 2px——跳过，等可见时由 ResizeObserver 补量
  if (!el || el.offsetParent === null) return
  clearTimeout(resizeTimer)
  if (el.value.length > HUGE_TEXT_CHARS) {
    resizeTimer = setTimeout(() => measureHeight(el), 250)
  } else {
    measureHeight(el)
  }
}

watch(input, () => nextTick(autoresize))
// 输入删空时 autoresize 先于结果清空执行（计算有防抖），此刻右侧还被旧的超长输出撑着，
// min-height:100% 会把旧巨高原样量回来；结果落地后再补量一次，高度才能回落
watch(result, () => nextTick(autoresize))
// 挂载时可能处于隐藏页；元素从隐藏变可见（尺寸 0 → 实际值）时观察器会触发，补量高度
let ro: ResizeObserver | undefined
onMounted(() => {
  autoresize()
  if (inputEl.value) {
    ro = new ResizeObserver(autoresize)
    ro.observe(inputEl.value)
  }
})
onUnmounted(() => {
  ro?.disconnect()
  clearTimeout(resizeTimer)
})

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
        <div class="pane-head">
          <label class="pane-label micro-label" for="b64-input">{{ t('fmtInput') }}</label>
          <span v-if="drop.error.value" class="drop-err micro-label">
            ⚠ {{ t(drop.error.value) }}
          </span>
        </div>
        <div class="input-wrap">
          <textarea
            id="b64-input"
            ref="inputEl"
            v-model="input"
            :placeholder="dir === 'enc' ? t('b64PhEnc') : t('b64PhDec')"
            spellcheck="false"
            :class="{ dropping: drop.dragging.value }"
            @dragover="drop.onDragover"
            @dragleave="drop.onDragleave"
            @drop="drop.onDrop"
          ></textarea>
        </div>
      </div>

      <div class="pane">
        <div class="pane-head">
          <label class="pane-label micro-label">{{ t('b64Output') }}</label>
        </div>

        <div class="out-body">
        <!-- 处理中提示：钉在与空状态提示相同的位置（默认高度框的居中处），与格式化工具同款 -->
        <div v-if="working" class="working-top"><span>{{ t('processing') }}</span></div>

        <div v-if="result.fatal" class="result error-box">
          <div class="error-title">⚠ {{ t('b64Error') }}</div>
          <div class="error-detail">{{ t(result.fatal) }}</div>
        </div>

        <template v-else>
          <div v-if="result.warnings.length" class="issues">
            <div class="issues-title">⚠ {{ t(result.warnings[0]) }}</div>
          </div>
          <div v-if="truncated" class="issues trunc">
            <div class="issues-title">⚠ {{ t('outTruncated') }}</div>
            <button type="button" class="show-all" @click="showFull = true">
              {{ t('showAll') }}
            </button>
          </div>
          <pre v-if="output" class="result out">{{ displayOutput }}</pre>
          <div v-else class="result hint">
            <!-- 处理中时藏住提示文字，两段文字在同一位置会叠在一起 -->
            <div v-show="!working" class="hint-pin">{{ t('b64EmptyHint') }}</div>
          </div>
        </template>
        </div>
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

.pane-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.pane-label {
  margin-bottom: 8px;
}

.drop-err {
  margin-left: auto;
  color: var(--del-fg);
}

/* 输出区包一层相对定位容器，处理中提示才能贴着输出框顶部盖上去 */
.out-body {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 与 .hint-pin 钉在同一位置：hint-pin 在 14px padding 之内，这里在 out-body
   顶上，高度补上 28px 差值后两者的居中点重合 */
.working-top {
  position: absolute;
  top: 1px;
  left: 1px;
  right: 1px;
  height: min(100%, max(240px, calc(100vh - 259px)));
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}

.working-top span {
  padding: 6px 20px;
  font-size: 15px;
  color: var(--fg-muted);
  background: color-mix(in srgb, var(--bg-panel) 85%, transparent);
  animation: breathe 1s ease-in-out infinite alternate;
}

@keyframes breathe {
  from {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
}

.issues.trunc {
  display: flex;
  align-items: center;
  gap: 12px;
}

.show-all {
  padding: 2px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-panel);
  color: var(--fg-muted);
  font-size: 11px;
  cursor: pointer;
}

.show-all:hover {
  color: var(--fg);
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

textarea.dropping {
  border-style: dashed;
  border-color: var(--ink);
}

.out {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-all;
  color: var(--fg);
}

.hint {
  color: var(--fg-faint);
  font-family: inherit;
  font-size: 13px;
}

/* 提示文字钉在「默认高度输出框的垂直居中处」，框被超长输入撑高时不跟着往下跑。
   页面固定部分 259px + 框自身 padding 28px → 默认框内容高度 = 100vh − 287px；
   框为默认高度时 min() 取 100%，与原先的整框居中完全一致 */
.hint-pin {
  height: min(100%, max(212px, calc(100vh - 287px)));
  display: flex;
  align-items: center;
  justify-content: center;
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
