<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DiffResult, DiffSide } from '../lib/diffEngine'
import { useI18n } from '../i18n'

const props = defineProps<{
  result: DiffResult | null
  view: 'side' | 'inline'
  codeMode: boolean
}>()

const { t } = useI18n()

// 单栏视图：mod/del 行在前（左侧内容），add/mod 行在后（右侧内容）
const inlineRows = computed(() => {
  if (!props.result) return []
  const out: { side: DiffSide; from: 'left' | 'right'; rowIndex: number }[] = []
  props.result.rows.forEach((row, rowIndex) => {
    if (row.left.type === 'same') {
      out.push({ side: row.left, from: 'left', rowIndex })
      return
    }
    if (row.left.type !== 'empty') out.push({ side: row.left, from: 'left', rowIndex })
    if (row.right.type !== 'empty') out.push({ side: row.right, from: 'right', rowIndex })
  })
  return out
})

// 差异块：连续的非 same 行算一块，记录每块首行在 rows 中的下标
const hunkStarts = computed(() => {
  const starts: number[] = []
  let inHunk = false
  for (const [i, row] of (props.result?.rows ?? []).entries()) {
    const changed = row.left.type !== 'same'
    if (changed && !inHunk) starts.push(i)
    inHunk = changed
  }
  return starts
})

// 行下标 -> 差异块序号，用于给块首行打标记
const hunkIndexByRow = computed(() => {
  const map = new Map<number, number>()
  hunkStarts.value.forEach((rowIndex, hunkIndex) => map.set(rowIndex, hunkIndex))
  return map
})

const rootEl = ref<HTMLElement | null>(null)
const currentHunk = ref(-1)

watch(() => props.result, () => {
  currentHunk.value = -1
})

function jumpHunk(dir: 1 | -1) {
  const n = hunkStarts.value.length
  if (!n) return
  currentHunk.value = ((currentHunk.value + dir) % n + n) % n
  const el = rootEl.value?.querySelector(`[data-hunk="${currentHunk.value}"]`)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

// 代码模式的左右对照：两个面板横向滚动联动
const leftPane = ref<HTMLElement | null>(null)
const rightPane = ref<HTMLElement | null>(null)
let syncing = false

function syncScroll(src: 'left' | 'right') {
  if (syncing) return
  const a = src === 'left' ? leftPane.value : rightPane.value
  const b = src === 'left' ? rightPane.value : leftPane.value
  if (!a || !b) return
  syncing = true
  b.scrollLeft = a.scrollLeft
  requestAnimationFrame(() => {
    syncing = false
  })
}
</script>

<template>
  <section ref="rootEl" class="diff" :class="{ code: codeMode }">
    <div v-if="!result" class="notice">{{ t('emptyHint') }}</div>
    <div v-else-if="result.identical" class="notice ok">{{ t('identical') }}</div>

    <template v-else>
      <div class="stats">
        <span class="stat add">+{{ result.stats.added }} {{ t('addedLines') }}</span>
        <span class="stat del">−{{ result.stats.removed }} {{ t('removedLines') }}</span>
        <span class="stat mod">~{{ result.stats.modified }} {{ t('modifiedLines') }}</span>
        <span v-if="hunkStarts.length" class="nav">
          <span class="nav-count">{{ currentHunk < 0 ? '–' : currentHunk + 1 }} / {{ hunkStarts.length }}</span>
          <button class="nav-btn" :title="t('prevDiff')" @click="jumpHunk(-1)">↑ {{ t('prevDiff') }}</button>
          <button class="nav-btn" :title="t('nextDiff')" @click="jumpHunk(1)">↓ {{ t('nextDiff') }}</button>
        </span>
      </div>

      <!-- 左右对照 · 文本模式：单个网格，两侧等宽、长行自动换行 -->
      <div v-if="view === 'side' && !codeMode" class="table side-by-side">
        <div
          v-for="(row, i) in result.rows"
          :key="i"
          class="row"
          :class="{ 'hunk-current': hunkIndexByRow.get(i) === currentHunk }"
          :data-hunk="hunkIndexByRow.get(i)"
        >
          <div class="lineno" :class="row.left.type">{{ row.left.lineNo ?? '' }}</div>
          <div class="cell is-left" :class="row.left.type">
            <span
              v-for="(seg, j) in row.left.segments"
              :key="j"
              :class="{ 'seg-del': seg.changed }"
            >{{ seg.text }}</span>
            <br v-if="row.left.segments.length === 0" />
          </div>
          <div class="lineno right" :class="row.right.type">{{ row.right.lineNo ?? '' }}</div>
          <div class="cell is-right" :class="row.right.type">
            <span
              v-for="(seg, j) in row.right.segments"
              :key="j"
              :class="{ 'seg-add': seg.changed }"
            >{{ seg.text }}</span>
            <br v-if="row.right.segments.length === 0" />
          </div>
        </div>
      </div>

      <!-- 左右对照 · 代码模式：两个独立面板，各自横向滚动且联动，行号吸附 -->
      <div v-else-if="view === 'side'" class="table split">
        <div ref="leftPane" class="half" @scroll="syncScroll('left')">
          <div
            v-for="(row, i) in result.rows"
            :key="i"
            class="row"
            :class="{ 'hunk-current': hunkIndexByRow.get(i) === currentHunk }"
          >
            <div class="lineno" :class="row.left.type" :data-hunk="hunkIndexByRow.get(i)">{{ row.left.lineNo ?? '' }}</div>
            <div class="cell is-left" :class="row.left.type">
              <span
                v-for="(seg, j) in row.left.segments"
                :key="j"
                :class="{ 'seg-del': seg.changed }"
              >{{ seg.text }}</span>
              <br v-if="row.left.segments.length === 0" />
            </div>
          </div>
        </div>
        <div ref="rightPane" class="half" @scroll="syncScroll('right')">
          <div
            v-for="(row, i) in result.rows"
            :key="i"
            class="row"
            :class="{ 'hunk-current': hunkIndexByRow.get(i) === currentHunk }"
          >
            <div class="lineno" :class="row.right.type">{{ row.right.lineNo ?? '' }}</div>
            <div class="cell is-right" :class="row.right.type">
              <span
                v-for="(seg, j) in row.right.segments"
                :key="j"
                :class="{ 'seg-add': seg.changed }"
              >{{ seg.text }}</span>
              <br v-if="row.right.segments.length === 0" />
            </div>
          </div>
        </div>
      </div>

      <!-- 单栏视图 -->
      <div v-else class="table inline">
        <div
          v-for="(item, i) in inlineRows"
          :key="i"
          class="row"
          :class="{ 'hunk-current': hunkIndexByRow.get(item.rowIndex) === currentHunk }"
        >
          <div
            class="lineno"
            :class="item.side.type"
            :data-hunk="i === 0 || inlineRows[i - 1].rowIndex !== item.rowIndex ? hunkIndexByRow.get(item.rowIndex) : undefined"
          >
            {{ item.from === 'left' ? (item.side.lineNo ?? '') : '' }}
          </div>
          <div class="lineno right" :class="item.side.type">
            {{ item.from === 'right' || item.side.type === 'same' ? (item.side.lineNo ?? '') : '' }}
          </div>
          <div
            class="cell"
            :class="item.side.type === 'mod' ? (item.from === 'left' ? 'del' : 'add') : item.side.type"
          >
            <span class="sign">{{
              item.side.type === 'same' ? ' ' : item.from === 'left' ? '−' : '+'
            }}</span>
            <span
              v-for="(seg, j) in item.side.segments"
              :key="j"
              :class="{ 'seg-del': seg.changed && item.from === 'left', 'seg-add': seg.changed && item.from === 'right' }"
            >{{ seg.text }}</span>
            <br v-if="item.side.segments.length === 0" />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.diff {
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-panel);
  animation: fade 0.25s ease both;
}

@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.notice {
  padding: 56px 32px;
  text-align: center;
  color: var(--fg-faint);
  font-size: 13px;
  letter-spacing: 0.02em;
}

.notice.ok {
  color: var(--add-fg);
}

@media (max-height: 660px) {
  .notice {
    padding: 26px 24px;
  }
}

.stats {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  /* 吸顶：滚到很下面时「上一处 / 下一处」仍然可见可点 */
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bg-panel);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stat.add { color: var(--add-fg); }
.stat.del { color: var(--del-fg); }
.stat.mod { color: var(--mod-fg); }

.nav {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-count {
  color: var(--fg-faint);
  letter-spacing: 0.04em;
}

.nav-btn {
  padding: 2px 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.nav-btn:hover {
  background: var(--bg-gutter);
}

/* 当前差异块高亮：行号加高亮竖条 */
.hunk-current .lineno {
  box-shadow: inset 2px 0 0 var(--fg, currentColor);
  color: var(--fg);
}

.table {
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
}

.row {
  display: grid;
}

/* 文本模式左右对照：两侧内容列严格等宽（minmax(0,1fr)），长行换行不挤压对侧 */
.side-by-side .row {
  grid-template-columns: 44px minmax(0, 1fr) 44px minmax(0, 1fr);
}

/* 单栏视图同理：整表一个 grid，行容器 display:contents */
.table.inline {
  display: grid;
  grid-template-columns: 44px 44px minmax(min-content, 1fr);
  align-content: start;
}

.inline .row {
  display: contents;
}

/* 代码模式左右对照：两个 50% 面板各自滚动 */
.split {
  display: flex;
  overflow: visible;
}

/* 面板整体是一个 grid，行号/内容格直接作为 grid 项（行容器 display:contents）：
   内容列宽度取决于所有行里最宽的一行，因此每行底色都铺满整个滚动宽度 */
.half {
  flex: 1 1 50%;
  min-width: 0;
  overflow-x: auto;
  display: grid;
  grid-template-columns: 44px minmax(min-content, 1fr);
  align-content: start;
}

.half + .half {
  border-left: 1px solid var(--border);
}

.half .row {
  display: contents;
}

/* 横向滚动时行号吸附在左侧 */
.half .lineno,
.inline .lineno {
  position: sticky;
  z-index: 1;
}

.half .lineno,
.inline .lineno:first-child {
  left: 0;
}

.inline .lineno.right {
  left: 44px;
}

.lineno {
  padding: 0 8px;
  text-align: right;
  color: var(--fg-faint);
  user-select: none;
  background: var(--bg-gutter);
  border-right: 1px solid var(--border);
}

.lineno.right {
  border-left: 1px solid var(--border);
}

.cell {
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-all;
  min-width: 0;
}

.code .cell {
  white-space: pre;
  word-break: normal;
}

.sign {
  display: inline-block;
  width: 1em;
  user-select: none;
  color: var(--fg-faint);
}

/* 行级底色 */
.cell.add { background: var(--add-bg); }
.cell.del { background: var(--del-bg); }
.cell.mod { background: var(--mod-bg); }
.cell.empty { background: var(--empty-bg); }
.lineno.add { background: var(--add-gutter); }
.lineno.del { background: var(--del-gutter); }
.lineno.mod { background: var(--mod-gutter); }
.lineno.empty {
  background: var(--empty-bg);
  background-color: var(--bg-gutter);
}

/* 行内变更片段 */
.seg-del {
  background: var(--del-hl);
  border-radius: 2px;
}

.seg-add {
  background: var(--add-hl);
  border-radius: 2px;
}
</style>
