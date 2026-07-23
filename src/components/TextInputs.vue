<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '../i18n'

const oldText = defineModel<string>('oldText', { required: true })
const newText = defineModel<string>('newText', { required: true })

const { t } = useI18n()

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
      <label class="pane-label micro-label" for="old-text">{{ t('original') }}</label>
      <textarea
        id="old-text"
        ref="taA"
        v-model="oldText"
        :placeholder="t('placeholderOld')"
        spellcheck="false"
      ></textarea>
    </div>

    <div class="middle">
      <button type="button" class="btn" :title="t('swap')" @click="swap">⇄</button>
    </div>

    <div class="pane">
      <label class="pane-label micro-label" for="new-text">{{ t('modified') }}</label>
      <textarea
        id="new-text"
        ref="taB"
        v-model="newText"
        :placeholder="t('placeholderNew')"
        spellcheck="false"
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

.pane-label {
  margin-bottom: 8px;
}

textarea {
  height: 190px;
  min-height: 120px;
  max-height: 70vh;
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

.middle {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 8px;
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
