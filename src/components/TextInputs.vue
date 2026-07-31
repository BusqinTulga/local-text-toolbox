<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '../i18n'
import { useFileDrop } from '../lib/useFileDrop'

const oldText = defineModel<string>('oldText', { required: true })
const newText = defineModel<string>('newText', { required: true })

const { t } = useI18n()

const dropA = useFileDrop((text) => (oldText.value = text))
const dropB = useFileDrop((text) => (newText.value = text))

// 两个输入框高度联动：拖动任意一个，另一个跟着变
const taA = ref<HTMLTextAreaElement | null>(null)
const taB = ref<HTMLTextAreaElement | null>(null)
let ro: ResizeObserver | undefined

onMounted(() => {
  ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const src = entry.target as HTMLTextAreaElement
      const dst = src === taA.value ? taB.value : taA.value
      if (!dst) continue
      const h = src.offsetHeight
      if (Math.abs(dst.offsetHeight - h) > 1) dst.style.height = `${h}px`
    }
  })
  if (taA.value) ro.observe(taA.value)
  if (taB.value) ro.observe(taB.value)
})

onUnmounted(() => ro?.disconnect())

function swap() {
  ;[oldText.value, newText.value] = [newText.value, oldText.value]
}
</script>

<template>
  <section class="inputs">
    <div class="pane">
      <div class="pane-head">
        <label class="pane-label micro-label" for="old-text">{{ t('original') }}</label>
        <span v-if="dropA.error.value" class="drop-err micro-label">
          ⚠ {{ t(dropA.error.value) }}
        </span>
      </div>
      <textarea
        id="old-text"
        ref="taA"
        v-model="oldText"
        :placeholder="t('placeholderOld')"
        spellcheck="false"
        :class="{ dropping: dropA.dragging.value }"
        @dragover="dropA.onDragover"
        @dragleave="dropA.onDragleave"
        @drop="dropA.onDrop"
      ></textarea>
    </div>

    <div class="middle">
      <button type="button" class="btn" :title="t('swap')" @click="swap">⇄</button>
    </div>

    <div class="pane">
      <div class="pane-head">
        <label class="pane-label micro-label" for="new-text">{{ t('modified') }}</label>
        <span v-if="dropB.error.value" class="drop-err micro-label">
          ⚠ {{ t(dropB.error.value) }}
        </span>
      </div>
      <textarea
        id="new-text"
        ref="taB"
        v-model="newText"
        :placeholder="t('placeholderNew')"
        spellcheck="false"
        :class="{ dropping: dropB.dragging.value }"
        @dragover="dropB.onDragover"
        @dragleave="dropB.onDragleave"
        @drop="dropB.onDrop"
      ></textarea>
    </div>
  </section>
</template>

<style scoped>
.inputs {
  display: flex;
  gap: 12px;
  align-items: stretch;
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
  justify-content: space-between;
  gap: 8px;
}

.pane-label {
  margin-bottom: 8px;
}

.drop-err {
  color: var(--del-fg);
}

textarea {
  height: 190px;
  min-height: 120px;
  resize: vertical;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--bg-panel);
  color: var(--fg);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  transition: border-color 0.18s ease;
}

/* 视口矮（浏览器放大）时降低默认高度，配合 App.vue 的同档媒体查询避免页面滚动条 */
@media (max-height: 660px) {
  textarea {
    height: 140px;
  }
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

/* 按钮置顶：内容一长（输入框被拉高）时置底就找不到了。
   padding-top 对齐 textarea 顶缘（pane-head 标签行的高度） */
.middle {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding-top: 26px;
  gap: 8px;
}

.btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-panel);
  color: var(--fg-muted);
  cursor: pointer;
  font-size: 14px;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.btn:hover {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--bg-panel);
  transform: translateY(-1px);
}

.btn:active {
  transform: none;
}
</style>
