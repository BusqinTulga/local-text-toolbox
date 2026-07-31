<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Fmt } from '../lib/formatters'
import { useI18n } from '../i18n'
import { ROWS_PAGE } from '../lib/perf'

// 基于缩进的通用折叠视图：某行的下一非空行缩进更深即可折叠，
// 收起后隐藏所有更深缩进的行（含中间空行），对 JSON / XML / YAML 都成立
const props = defineProps<{ text: string; fmt?: Fmt | null }>()

const lines = computed(() => props.text.split('\n'))

// 空行记为 -1，折叠范围计算时归属于所在块
const indents = computed(() =>
  lines.value.map((l) => (l.trim() === '' ? -1 : (/^\s*/.exec(l)?.[0].length ?? 0))),
)

// foldEnd[i]：以第 i 行开头的可折叠块的最后一行下标；不可折叠为 null
const foldEnd = computed(() => {
  const ind = indents.value
  const n = ind.length
  const out: (number | null)[] = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (ind[i] < 0) continue
    let j = i + 1
    while (j < n && ind[j] < 0) j++
    if (j >= n || ind[j] <= ind[i]) continue
    let end = j
    for (let k = j + 1; k < n; k++) {
      if (ind[k] < 0) continue
      if (ind[k] <= ind[i]) break
      end = k
    }
    out[i] = end
  }
  return out
})

// 行号列宽随总行数的位数走
const linenoWidth = computed(() => `${Math.max(2, String(lines.value.length).length)}.5ch`)

const { t } = useI18n()

const collapsed = ref(new Set<number>())

// 分批渲染：大结果只先渲染一批，避免一次性生成十几万 DOM 节点
const visibleCount = ref(ROWS_PAGE)

watch(
  () => props.text,
  () => {
    collapsed.value = new Set()
    visibleCount.value = ROWS_PAGE
  },
)

function toggle(i: number) {
  const next = new Set(collapsed.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  collapsed.value = next
}

// 可见行 + 收起标记：被收起块内部的行整体跳过
const visibleRows = computed(() => {
  const rows: { i: number; hiddenCount: number }[] = []
  const ends = foldEnd.value
  const n = lines.value.length
  for (let i = 0; i < n; i++) {
    const end = ends[i]
    if (collapsed.value.has(i) && end !== null) {
      rows.push({ i, hiddenCount: end - i })
      i = end
    } else {
      rows.push({ i, hiddenCount: 0 })
    }
  }
  return rows
})

// ---- 轻量语法高亮：逐行正则分词，格式化后的输出结构规整，按行处理足够 ----

interface Tok {
  text: string
  cls?: string
}

function pushGap(out: Tok[], line: string, from: number, to: number) {
  if (to > from) out.push({ text: line.slice(from, to) })
}

// JSON：键 / 字符串 / 数字 / 字面量
function hlJson(line: string): Tok[] {
  const out: Tok[] = []
  const re = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    pushGap(out, line, last, m.index)
    const s = m[0]
    let cls = 'tk-num'
    if (s[0] === '"') cls = /^\s*:/.test(line.slice(re.lastIndex)) ? 'tk-key' : 'tk-str'
    else if (/^[a-z]/.test(s)) cls = 'tk-lit'
    out.push({ text: s, cls })
    last = re.lastIndex
  }
  pushGap(out, line, last, line.length)
  return out
}

// YAML：行首键、注释，其余同 JSON 规则
function hlYaml(line: string): Tok[] {
  const out: Tok[] = []
  let rest = line
  let base = 0
  const key = /^(\s*(?:-\s+)?)((?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s:#][^:#]*?))(:)(?=\s|$)/.exec(line)
  if (key) {
    pushGap(out, line, 0, key[1].length)
    out.push({ text: key[2], cls: 'tk-key' })
    out.push({ text: key[3] })
    base = key[1].length + key[2].length + key[3].length
    rest = line.slice(base)
  }
  const re = /"(?:[^"\\]|\\.)*"|'[^']*'|#.*$|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?=\s|$)|\b(?:true|false|null|~)\b/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) {
    pushGap(out, rest, last, m.index)
    const s = m[0]
    const cls =
      s[0] === '#' ? 'tk-comment'
      : s[0] === '"' || s[0] === "'" ? 'tk-str'
      : /^[a-z~]/.test(s) ? 'tk-lit'
      : 'tk-num'
    out.push({ text: s, cls })
    last = re.lastIndex
  }
  pushGap(out, rest, last, rest.length)
  return out
}

// XML：注释整段一色；标签内再分 标签名 / 属性名 / 属性值
function hlXml(line: string): Tok[] {
  const out: Tok[] = []
  const re = /<!--.*?(?:-->|$)|<[^>]*>?/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    pushGap(out, line, last, m.index)
    const s = m[0]
    if (s.startsWith('<!--')) {
      out.push({ text: s, cls: 'tk-comment' })
    } else {
      hlXmlTag(s, out)
    }
    last = re.lastIndex
  }
  pushGap(out, line, last, line.length)
  return out
}

function hlXmlTag(s: string, out: Tok[]) {
  const head = /^(<[/?!]?)([^\s>/]*)/.exec(s)
  if (!head) {
    out.push({ text: s })
    return
  }
  out.push({ text: head[1], cls: 'tk-tag' })
  if (head[2]) out.push({ text: head[2], cls: 'tk-tag' })
  const rest = s.slice(head[0].length)
  const re = /([^\s=>/"']+)(?==)|"[^"]*"|'[^']*'|[/?]?>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) {
    pushGap(out, rest, last, m.index)
    const t = m[0]
    const cls = t.endsWith('>') ? 'tk-tag' : t[0] === '"' || t[0] === "'" ? 'tk-str' : 'tk-attr'
    out.push({ text: t, cls })
    last = re.lastIndex
  }
  pushGap(out, rest, last, rest.length)
}

const shownRows = computed(() => {
  const rows = visibleRows.value
  return rows.length <= visibleCount.value ? rows : rows.slice(0, visibleCount.value)
})

const hiddenTail = computed(() => Math.max(0, visibleRows.value.length - visibleCount.value))

// 语法高亮只对当前渲染窗口计算，不再全量 tokenize 屏幕外的行
const hlShown = computed<Map<number, Tok[]>>(() => {
  const fn = props.fmt === 'xml' ? hlXml : props.fmt === 'yaml' ? hlYaml : props.fmt === 'json' ? hlJson : null
  const map = new Map<number, Tok[]>()
  for (const row of shownRows.value) {
    const l = lines.value[row.i]
    map.set(row.i, fn ? fn(l) : [{ text: l }])
  }
  return map
})
</script>

<template>
  <div class="fold-view">
    <div v-for="row in shownRows" :key="row.i" class="fold-line">
      <span class="lineno" :style="{ width: linenoWidth }">{{ row.i + 1 }}</span>
      <button
        v-if="foldEnd[row.i] !== null"
        class="fold-btn"
        @click="toggle(row.i)"
      >{{ collapsed.has(row.i) ? '▸' : '▾' }}</button>
      <span v-else class="fold-btn placeholder"></span>
      <span class="fold-text"><span
        v-for="(tk, k) in hlShown.get(row.i)"
        :key="k"
        :class="tk.cls"
      >{{ tk.text }}</span></span>
      <button
        v-if="row.hiddenCount"
        class="fold-more"
        @click="toggle(row.i)"
      >⋯ {{ row.hiddenCount }}</button>
    </div>

    <button v-if="hiddenTail > 0" type="button" class="show-more" @click="visibleCount += ROWS_PAGE">
      {{ t('showMore').replace('{n}', String(hiddenTail)) }}
    </button>
  </div>
</template>

<style scoped>
.fold-view {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 21px;
  padding: 14px 6px 14px 0;
  overflow: auto;
}

.fold-line {
  display: flex;
  align-items: flex-start;
  white-space: pre;
}

.lineno {
  flex-shrink: 0;
  padding-left: 10px;
  text-align: right;
  color: var(--fg-faint);
  user-select: none;
}

.fold-btn {
  flex-shrink: 0;
  width: 26px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 14px;
  line-height: 21px;
  text-align: center;
  cursor: pointer;
  user-select: none;
}

.fold-btn:hover {
  color: var(--fg);
}

.fold-btn.placeholder {
  cursor: default;
}

.fold-text {
  white-space: pre;
}

.fold-more {
  margin-left: 8px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-gutter);
  color: var(--fg-muted);
  font: inherit;
  font-size: 11px;
  line-height: 19px;
  cursor: pointer;
}

.fold-more:hover {
  color: var(--fg);
}

.show-more {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 10px 16px;
  border: none;
  border-top: 1px solid var(--border);
  background: var(--bg-gutter);
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.show-more:hover {
  color: var(--fg);
}

/* 语法高亮配色：亮色取偏深的低饱和色，暗色对应提亮 */
.tk-key { color: #0b63c5; }
.tk-str { color: #1a7f37; }
.tk-num { color: #953800; }
.tk-lit { color: #8250df; }
.tk-tag { color: #0f766e; }
.tk-attr { color: #953800; }
.tk-comment { color: var(--fg-faint); font-style: italic; }

@media (prefers-color-scheme: dark) {
  .tk-key { color: #79c0ff; }
  .tk-str { color: #7ee787; }
  .tk-num { color: #ffa657; }
  .tk-lit { color: #d2a8ff; }
  .tk-tag { color: #56d4c8; }
  .tk-attr { color: #ffa657; }
}
</style>
