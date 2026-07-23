<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n, type MessageKey } from '../i18n'
import {
  detectFormat,
  formatText,
  supportsMinify,
  FMT_LABEL,
  type Fmt,
  type FormatIssue,
  type Indent,
} from '../lib/formatters'
import FoldView from './FoldView.vue'

const { t } = useI18n()

const input = ref('')
const indent = ref<Indent>('2')
const detected = ref<Fmt | null>(null)
const output = ref('')
const issues = ref<FormatIssue[]>([])
const fatal = ref<{ message: string; line: number | null; col: number | null } | null>(null)
const unknown = ref(false)
const copied = ref(false)

const inputEl = ref<HTMLTextAreaElement | null>(null)
// 高亮层用 transform 跟随滚动而不是同步 scrollTop：
// macOS 橡皮筋回弹时 scrollTop 会越界（负值/超出最大值），赋值会被钳制导致高亮不跟着弹
const hlScroll = ref({ x: 0, y: 0 })

// 整行高亮：只用于没有精确范围的问题（以及解析失败的 fatal 行）；有范围的走片段高亮
const errLines = computed(() => {
  const s = new Set<number>()
  for (const iss of issues.value) if (iss.line !== null && !iss.ranges?.length) s.add(iss.line)
  if (fatal.value?.line) s.add(fatal.value.line)
  return s
})

const inputLines = computed(() => input.value.split('\n'))

// 片段高亮：把各问题的字符范围换算成 行号 → [起, 止) 列区间（0-based，已排序合并）
const lineSegs = computed(() => {
  const map = new Map<number, [number, number][]>()
  const lns = inputLines.value
  const starts: number[] = new Array(lns.length)
  let acc = 0
  for (let i = 0; i < lns.length; i++) {
    starts[i] = acc
    acc += lns[i].length + 1
  }
  for (const iss of issues.value) {
    for (const r of iss.ranges ?? []) {
      for (let li = 0; li < lns.length && starts[li] < r.end; li++) {
        const a = Math.max(0, r.start - starts[li])
        const b = Math.min(lns[li].length, r.end - starts[li])
        if (b > a) {
          if (!map.has(li + 1)) map.set(li + 1, [])
          map.get(li + 1)!.push([a, b])
        }
      }
    }
  }
  for (const [k, arr] of map) {
    arr.sort((x, y) => x[0] - y[0])
    const merged: [number, number][] = []
    for (const seg of arr) {
      const last = merged[merged.length - 1]
      if (last && seg[0] <= last[1]) last[1] = Math.max(last[1], seg[1])
      else merged.push([seg[0], seg[1]])
    }
    map.set(k, merged)
  }
  return map
})

function segsFor(i: number): { text: string; hl: boolean }[] {
  const ln = inputLines.value[i]
  const segs = lineSegs.value.get(i + 1)
  if (!segs) return [{ text: ln, hl: false }]
  const out: { text: string; hl: boolean }[] = []
  let p = 0
  for (const [a, b] of segs) {
    if (a > p) out.push({ text: ln.slice(p, a), hl: false })
    out.push({ text: ln.slice(a, b), hl: true })
    p = b
  }
  if (p < ln.length) out.push({ text: ln.slice(p), hl: false })
  return out
}

function syncScroll() {
  const el = inputEl.value
  if (el) hlScroll.value = { x: el.scrollLeft, y: el.scrollTop }
}

// 输入框随内容自动增高（min-height:100% 兜底），页面整体滚动，框内不出竖向滚动条
function autoresize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

watch(input, () => nextTick(autoresize))
onMounted(autoresize)

function jumpTo(line: number | null) {
  const el = inputEl.value
  if (!line || !el) return
  const lns = inputLines.value
  if (line > lns.length) return
  let start = 0
  for (let i = 0; i < line - 1; i++) start += lns[i].length + 1
  el.focus()
  el.setSelectionRange(start, start + lns[line - 1].length)
  // 输入框不再内部滚动，定位改为滚动整个页面到目标行
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 21
  const top = el.getBoundingClientRect().top + window.scrollY
  window.scrollTo({
    top: Math.max(0, top + (line - 1) * lh - window.innerHeight / 2),
    behavior: 'smooth',
  })
}

let timer: ReturnType<typeof setTimeout> | undefined
let runSeq = 0
watch(
  [input, indent],
  () => {
    clearTimeout(timer)
    timer = setTimeout(run, 250)
  },
  { immediate: true },
)

async function run() {
  const seq = ++runSeq
  copied.value = false
  const text = input.value
  if (text.trim() === '') {
    output.value = ('')
    issues.value = []
    fatal.value = null
    unknown.value = false
    detected.value = null
    return
  }
  const fmt = detectFormat(text)
  detected.value = fmt
  if (!fmt) {
    unknown.value = true
    fatal.value = null
    issues.value = []
    output.value = ('')
    return
  }
  unknown.value = false
  // 压缩模式对 YAML/SQL/Java 无意义，静默按 2 空格处理
  const ind = indent.value === 'min' && !supportsMinify(fmt) ? '2' : indent.value
  const res = await formatText(text, fmt, ind)
  if (seq !== runSeq) return // 期间输入又变了，丢弃过期结果
  if (res.fatal) {
    fatal.value = res.fatal
    issues.value = []
    output.value = ('')
  } else {
    fatal.value = null
    issues.value = res.issues
    output.value = (res.output)
  }
}

// 把格式化结果反映到左侧输入，用户可在此基础上继续修改
function applyToInput() {
  if (!output.value) return
  input.value = output.value
}

function issueText(iss: FormatIssue): string {
  const loc =
    iss.line !== null
      ? t.value('errorAt')
          .replace('{line}', String(iss.line))
          .replace('{col}', String(iss.col ?? 1))
      : ''
  const what = iss.code ? t.value(iss.code as MessageKey) : (iss.message ?? '')
  const extra = iss.detail ? ` (${iss.detail})` : ''
  return loc ? `${loc} — ${what}${extra}` : `${what}${extra}`
}

function fatalLocation(): string {
  if (!fatal.value || fatal.value.line === null) return ''
  return t.value('errorAt')
    .replace('{line}', String(fatal.value.line))
    .replace('{col}', String(fatal.value.col ?? 1))
}

function excerpt(): { line: string; caret: string } | null {
  if (!fatal.value?.line) return null
  const line = input.value.split('\n')[fatal.value.line - 1]
  if (line === undefined) return null
  const col = Math.max(1, Math.min(fatal.value.col ?? 1, line.length + 1))
  return { line, caret: ' '.repeat(col - 1) + '↑' }
}

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
  <section class="fmt-tool">
    <div class="toolbar">
      <div class="seg-group" role="group">
        <button :class="{ active: indent === '2' }" @click="indent = '2'">
          {{ t('indent2') }}
        </button>
        <button :class="{ active: indent === '4' }" @click="indent = '4'">
          {{ t('indent4') }}
        </button>
        <button
          :class="{ active: indent === 'min' }"
          :disabled="!!detected && !supportsMinify(detected)"
          @click="indent = 'min'"
        >
          {{ t('minify') }}
        </button>
      </div>

      <span v-if="detected" class="detected micro-label">
        {{ t('fmtDetected').replace('{fmt}', FMT_LABEL[detected]) }}
      </span>

      <div class="right">
        <span v-if="output" class="count">{{ output.length }} {{ t('chars') }}</span>
        <button type="button" class="copy-btn" :disabled="!output" @click="applyToInput">
          {{ t('applyLeft') }}
        </button>
        <button type="button" class="copy-btn" :disabled="!output" @click="copy">
          {{ copied ? t('copied') : t('copy') }}
        </button>
      </div>
    </div>

    <div class="panes">
      <div class="pane">
        <label class="pane-label micro-label" for="fmt-input">{{ t('fmtInput') }}</label>
        <div class="input-wrap">
          <!-- 高亮层：与 textarea 同字体同排版，只画错误行的底色，文字透明 -->
          <div class="hl-layer" aria-hidden="true">
            <div
              class="hl-content"
              :style="{ transform: `translate(${-hlScroll.x}px, ${-hlScroll.y}px)` }"
            >
              <div
                v-for="(ln, i) in inputLines"
                :key="i"
                class="hl-line"
                :class="{ hl: errLines.has(i + 1) }"
              ><template v-if="lineSegs.has(i + 1)"><span
                v-for="(sg, si) in segsFor(i)"
                :key="si"
                :class="{ 'hl-seg': sg.hl }"
              >{{ sg.text }}</span></template><template v-else>{{ ln }}</template></div>
            </div>
          </div>
          <textarea
            id="fmt-input"
            ref="inputEl"
            v-model="input"
            :placeholder="t('fmtPlaceholder')"
            spellcheck="false"
            @scroll="syncScroll"
          ></textarea>
        </div>
      </div>

      <div class="pane">
        <div class="pane-head">
          <label class="pane-label micro-label">{{ t('fmtOutput') }}</label>
        </div>

        <div v-if="unknown" class="result hint">{{ t('fmtUnknown') }}</div>

        <div v-else-if="fatal" class="result error-box">
          <div class="error-title">
            ⚠ {{ t('fmtError') }}<template v-if="fatal.line">：{{ fatalLocation() }}</template>
          </div>
          <pre
            v-if="excerpt()"
            class="error-excerpt jumpable"
            :title="t('issueJump')"
            @click="jumpTo(fatal.line)"
          >{{ excerpt()!.line }}
{{ excerpt()!.caret }}</pre>
          <div class="error-detail">{{ fatal.message }}</div>
        </div>

        <template v-else>
          <!-- 容错解析修了东西时，逐条列出改了哪里——绝不悄悄修 -->
          <div v-if="issues.length" class="issues">
            <div class="issues-title">
              ⚠ {{ t('fmtIssues').replace('{n}', String(issues.length)) }}
            </div>
            <ul>
              <li
                v-for="(iss, k) in issues"
                :key="k"
                :class="{ jumpable: iss.line !== null }"
                :title="iss.line !== null ? t('issueJump') : undefined"
                @click="jumpTo(iss.line)"
              >
                {{ issueText(iss) }}
              </li>
            </ul>
          </div>
          <!-- 只读折叠视图：带行号，可按缩进层级折叠；复制按钮始终复制完整结果 -->
          <FoldView v-if="output" :text="output" :fmt="detected" />
          <div v-else class="result hint">{{ t('fmtEmptyHint') }}</div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fmt-tool {
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

.detected {
  color: var(--fg-faint);
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

.seg-group button:hover:not(:disabled):not(.active) {
  color: var(--ink);
}

.seg-group button.active {
  background: var(--ink);
  color: var(--bg-panel);
}

.seg-group button:disabled {
  opacity: 0.35;
  cursor: default;
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
  .fmt-tool {
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

.pane-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

textarea,
.result {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-panel);
  font-family: var(--font-mono);
  font-size: 13px;
  /* 整数行高：13px×1.6=20.8px 的小数行高在 textarea 和高亮层里取整不一致，会造成错行 */
  line-height: 21px;
  padding: 14px 16px;
  margin: 0;
}

textarea {
  resize: none;
  color: var(--fg);
  transition: border-color 0.18s ease;
}

/* 输入框 + 错误行高亮层：层叠同排版，textarea 背景透明让底色透出来 */
.input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--bg-panel);
}

.input-wrap textarea {
  flex: 1;
  position: relative;
  z-index: 1;
  background: transparent;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  min-width: 0;
  /* 高度由 JS 按内容撑开，内容少时至少填满面板 */
  min-height: 100%;
  overflow-y: hidden;
}

.hl-layer {
  position: absolute;
  inset: 0;
  border: 1px solid transparent;
  overflow: hidden;
  pointer-events: none;
}

.hl-content {
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 21px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  color: transparent;
  will-change: transform;
}

.hl-line {
  min-height: 1lh;
}

.hl-line.hl {
  background: var(--del-bg);
}

/* 精确片段：用 diff 行内高亮同款的更深底色 */
.hl-seg {
  background: var(--del-hl);
  border-radius: 2px;
}

.jumpable {
  cursor: pointer;
}

.issues li.jumpable:hover {
  color: var(--fg);
  text-decoration: underline;
  text-underline-offset: 3px;
}

textarea::placeholder {
  color: var(--fg-faint);
}

textarea:focus {
  outline: none;
  border-color: var(--border-strong);
}

/* 容错修复清单：黄色系警示条，列表可滚动 */
.issues {
  border: 1px solid var(--mod-gutter);
  background: var(--mod-gutter);
  padding: 10px 14px;
  margin-bottom: 8px;
  max-height: 140px;
  overflow-y: auto;
  flex-shrink: 0;
}

.issues-title {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 6px;
}

.issues ul {
  margin: 0;
  padding-left: 18px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.8;
  color: var(--fg-muted);
}

.hint {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-faint);
  font-family: inherit;
  font-size: 13px;
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

.error-excerpt {
  margin: 0 0 8px;
  padding: 10px 12px;
  background: var(--del-bg);
  border-radius: 0;
  white-space: pre;
  overflow-x: auto;
  color: var(--fg);
}

.error-detail {
  font-size: 12px;
  color: var(--fg-muted);
  word-break: break-all;
}
</style>
