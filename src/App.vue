<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import TextInputs from './components/TextInputs.vue'
import DiffView from './components/DiffView.vue'
import FormatTool from './components/FormatTool.vue'
import Base64Tool from './components/Base64Tool.vue'
import QrTool from './components/QrTool.vue'
import { computeDiff, type DiffResult } from './lib/diffEngine'
import { useI18n, type Lang } from './i18n'

const { lang, setLang, t } = useI18n()

type Tool = 'diff' | 'fmt' | 'b64' | 'qr'

const TOOL_PATHS: Record<Tool, string> = { diff: '/diff', fmt: '/format', b64: '/base64', qr: '/qr' }

function toolFromPath(path: string): Tool {
  const entry = Object.entries(TOOL_PATHS).find(([, p]) => p === path)
  return entry ? (entry[0] as Tool) : 'diff'
}

const tool = ref<Tool>(toolFromPath(location.pathname))

watch(tool, (v) => {
  if (location.pathname !== TOOL_PATHS[v]) history.pushState(null, '', TOOL_PATHS[v])
})

window.addEventListener('popstate', () => {
  tool.value = toolFromPath(location.pathname)
})

if (location.pathname !== TOOL_PATHS[tool.value]) {
  history.replaceState(null, '', TOOL_PATHS[tool.value])
}

const oldText = ref('')
const newText = ref('')
const mode = ref<'text' | 'code'>('text')
const view = ref<'side' | 'inline'>('side')

const result = shallowRef<DiffResult | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [oldText, newText, mode],
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (oldText.value === '' && newText.value === '') {
        result.value = null
        return
      }
      result.value = computeDiff(
        oldText.value,
        newText.value,
        mode.value === 'text' ? 'word' : 'char',
      )
    }, 300)
  },
  { immediate: true },
)

watch(lang, () => { document.title = t.value('title') }, { immediate: true })

const langs: { value: Lang; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <h1>{{ t('title') }}</h1>
      </div>

      <nav class="tabs" role="tablist">
        <button :class="{ active: tool === 'diff' }" @click="tool = 'diff'">
          <span class="tab-num">01</span>{{ t('tabDiff') }}
        </button>
        <button :class="{ active: tool === 'fmt' }" @click="tool = 'fmt'">
          <span class="tab-num">02</span>{{ t('tabFormat') }}
        </button>
        <button :class="{ active: tool === 'b64' }" @click="tool = 'b64'">
          <span class="tab-num">03</span>{{ t('tabBase64') }}
        </button>
        <button :class="{ active: tool === 'qr' }" @click="tool = 'qr'">
          <span class="tab-num">04</span>{{ t('tabQr') }}
        </button>
      </nav>

      <div class="lang" role="group" aria-label="Language">
        <!-- 每个按钮固定用自己语言的字体渲染，避免页面 lang 变化引起字宽抖动（Safari） -->
        <button
          v-for="l in langs"
          :key="l.value"
          :lang="l.value"
          :class="{ active: lang === l.value }"
          @click="setLang(l.value)"
        >
          {{ l.label }}
        </button>
      </div>
    </header>

    <main>
      <div v-show="tool === 'diff'" class="tool-page">
        <div class="toolbar">
          <div class="seg-group" role="group">
            <button :class="{ active: mode === 'text' }" @click="mode = 'text'">
              {{ t('modeText') }}
            </button>
            <button :class="{ active: mode === 'code' }" @click="mode = 'code'">
              {{ t('modeCode') }}
            </button>
          </div>

          <div class="seg-group" role="group">
            <button :class="{ active: view === 'side' }" @click="view = 'side'">
              {{ t('viewSideBySide') }}
            </button>
            <button :class="{ active: view === 'inline' }" @click="view = 'inline'">
              {{ t('viewInline') }}
            </button>
          </div>
        </div>
        <TextInputs v-model:old-text="oldText" v-model:new-text="newText" />
        <DiffView :result="result" :view="view" :code-mode="mode === 'code'" />
      </div>
      <FormatTool v-show="tool === 'fmt'" />
      <Base64Tool v-show="tool === 'b64'" />
      <QrTool v-show="tool === 'qr'" />
    </main>

    <footer class="privacy micro-label">{{ t('privacy') }}</footer>
  </div>
</template>

<style scoped>
.app {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 40px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 三列 grid：左（品牌）中（页签）右（语言）各自锚定，
   切换语言引起的文字宽度变化不会让别的区块漂移 */
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 28px 0 22px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 20px;
  justify-self: start;
}

h1 {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  margin: 0;
  color: var(--ink);
  white-space: nowrap;
}

/* 日语标题字符数多，0.28em 字距会顶到换行，按语言收窄 */
:lang(ja) h1 {
  letter-spacing: 0.08em;
}

/* 页签：带等宽序号，激活态黑白反转 */
.tabs {
  display: inline-flex;
  gap: 6px;
}

.tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 164px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;
}

.tab-num {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  opacity: 0.55;
}

.tabs button:hover:not(.active) {
  color: var(--ink);
  border-color: var(--border);
}

.tabs button.active {
  background: var(--ink);
  color: var(--bg-panel);
  border-color: var(--ink);
}

.tabs button.active .tab-num {
  opacity: 0.7;
}

/* 英语/日语的页签文字和标题都更长，164px 固定宽会把右侧语言栏挤到换行，
   按语言收窄页签宽度 */
:lang(en) .tabs button {
  min-width: 120px;
}

:lang(ja) .tabs button {
  min-width: 140px;
}

/* 语言切换：纯文字，激活加下划线 */
/* 允许换行 + min-width:0：窄视口（浏览器放大后）按钮排不下时折行，
   而不是撑破页面出横向滚动条（Safari 字宽略大于 Chrome，先在 Safari 上暴露） */
.lang {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  justify-self: end;
  min-width: 0;
}

.lang button {
  padding: 4px 8px;
  font-size: 12px;
  border: none;
  background: none;
  color: var(--fg-faint);
  cursor: pointer;
  text-underline-offset: 4px;
  transition: color 0.15s ease;
}

.lang button:hover {
  color: var(--fg);
}

/* 激活态不改字重：加粗会改变文字宽度，导致旁边的按钮跟着挪位置 */
.lang button.active {
  color: var(--ink);
  text-decoration: underline;
}

main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.tool-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.privacy {
  text-align: center;
  padding: 20px 0 18px;
  margin-top: 28px;
  border-top: 1px solid var(--border);
}

/* 视口高度不足（典型场景：浏览器缩放放大后 CSS 视口变矮）时压缩固定留白，
   避免内容只超出几像素就冒出页面滚动条 */
@media (max-height: 660px) {
  .topbar {
    padding: 12px 0 10px;
    margin-bottom: 14px;
  }

  .privacy {
    margin-top: 14px;
    padding: 10px 0;
  }

  .tool-page {
    gap: 12px;
  }
}

/* 880 以下（真窄窗口或浏览器放大后的窄视口）改为堆叠头部，
   避免单行布局把标题/语言栏挤变形 */
@media (max-width: 880px) {
  .app {
    padding: 0 16px;
  }

  .topbar {
    grid-template-columns: 1fr;
    justify-items: start;
    padding: 16px 0 14px;
    margin-bottom: 16px;
  }

  .lang {
    justify-self: start;
    justify-content: flex-start;
  }
}
</style>
