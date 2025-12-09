<template>
  <span
    ref="sentenceRef"
    class="sentence-item"
    :class="{
      'highlighted': isHighlighted,
      'permanent-highlighted': isPermanentHighlighted,
      'missing-translation': !isSource && sentence.isMissing,
      'title-sentence': sentence.type === 'title',
      'poetry-line': sentence.type === 'poetry_line',
      'editing': isEditing
    }"
    @mouseenter="!isEditing && $emit('highlight', false)"
    @mouseleave="!isEditing && $emit('highlight', false)"
    @click="!isEditing && $emit('highlight', true)"
  >
    <span 
      class="sentence-number"
      :class="{ 'clickable': !isSource }"
      @click.stop="!isSource && toggleActions()"
    >
      {{ getSentenceLabel(sentence) }}
    </span>
    
    <!-- 显示模式 -->
    <span v-if="!isEditing" class="sentence-text" v-html="highlightedText"></span>
    
    <!-- 编辑模式 -->
    <span v-else class="sentence-edit">
      <el-input
        v-model="editText"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 10 }"
        ref="editInputRef"
        @keydown.enter.ctrl="saveEdit"
        @keydown.esc="cancelEdit"
      />
    </span>
    
    <!-- 操作按钮 -->
    <span v-if="!isSource && showActions && !isEditing" class="sentence-actions">
      <el-button
        size="small"
        type="primary"
        :icon="RefreshRight"
        link
        @click.stop="$emit('retranslate')"
      >
        重译
      </el-button>
      <el-button
        size="small"
        type="warning"
        :icon="Edit"
        link
        @click.stop="startEdit"
      >
        编辑
      </el-button>
    </span>
    
    <!-- 编辑时的保存/取消按钮 -->
    <span v-if="isEditing" class="sentence-edit-actions">
      <el-button
        size="small"
        type="primary"
        :icon="Check"
        @click.stop="saveEdit"
      >
        保存
      </el-button>
      <el-button
        size="small"
        :icon="Close"
        @click.stop="cancelEdit"
      >
        取消
      </el-button>
      <span class="edit-hint">Ctrl+Enter保存 / Esc取消</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { RefreshRight, Edit, Check, Close } from '@element-plus/icons-vue'
import { useTranslationStore } from '@/stores/translation'
import type { Sentence } from '@/types'

interface Props {
  sentence: Sentence
  isSource?: boolean
  isHighlighted?: boolean
  isPermanentHighlighted?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isSource: false,
  isHighlighted: false,
  isPermanentHighlighted: false
})

const emit = defineEmits<{
  highlight: [permanent: boolean]
  retranslate: []
  edit: [newText: string]
}>()

const showActions = ref(false)
const isEditing = ref(false)
const editText = ref('')
const editInputRef = ref()
const sentenceRef = ref<HTMLElement>()
const store = useTranslationStore()

// 转义HTML特殊字符
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 生成高亮后的文本
const highlightedText = computed(() => {
  let text = props.sentence.text
  const properNouns = store.properNouns
  
  if (Object.keys(properNouns).length === 0) {
    return escapeHtml(text)
  }
  
  // 收集所有需要匹配的词（原文和译文）
  const termsToMatch: string[] = []
  
  // 如果是源文本（左侧），匹配原文
  if (props.isSource) {
    termsToMatch.push(...Object.keys(properNouns))
  } else {
    // 如果是译文（右侧），匹配译文
    termsToMatch.push(...Object.values(properNouns))
  }
  
  // 按长度从长到短排序，避免短词匹配覆盖长词
  const sortedTerms = [...termsToMatch].sort((a, b) => b.length - a.length)
  
  // 创建替换映射
  const replacements: { start: number; end: number; term: string }[] = []
  
  sortedTerms.forEach(term => {
    let index = 0
    while ((index = text.indexOf(term, index)) !== -1) {
      // 检查是否与已有的替换区域重叠
      const overlaps = replacements.some(
        r => (index >= r.start && index < r.end) || (index + term.length > r.start && index + term.length <= r.end)
      )
      
      if (!overlaps) {
        replacements.push({
          start: index,
          end: index + term.length,
          term: term
        })
      }
      
      index += term.length
    }
  })
  
  // 按位置排序
  replacements.sort((a, b) => a.start - b.start)
  
  // 构建最终的HTML
  let result = ''
  let lastIndex = 0
  
  replacements.forEach(r => {
    // 添加未高亮的部分
    result += escapeHtml(text.substring(lastIndex, r.start))
    // 添加高亮的术语（使用CSS类，颜色由CSS控制）
    result += `<span class="term-highlight">${escapeHtml(r.term)}</span>`
    lastIndex = r.end
  })
  
  // 添加剩余的文本
  result += escapeHtml(text.substring(lastIndex))
  
  return result
})

// 监听永久高亮状态变化（点击），自动滚动到可见区域（仅在容器内滚动）
watch(() => props.isPermanentHighlighted, (newVal) => {
  if (newVal && sentenceRef.value) {
    nextTick(() => {
      // 找到滚动容器（.text-content）
      const element = sentenceRef.value
      if (!element) return
      
      const container = element.closest('.text-content') as HTMLElement
      if (!container) return
      
      const containerRect = container.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      
      // 计算元素在容器中的绝对位置
      const relativeTop = elementRect.top - containerRect.top + container.scrollTop
      
      // 计算目标滚动位置：让元素在容器中央显示
      const targetScrollTop = relativeTop - (container.clientHeight / 2) + (elementRect.height / 2)
      
      // 只在容器内滚动，不影响页面
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      })
    })
  }
})

function getSentenceLabel(sentence: Sentence): string {
  if (sentence.type === 'title') {
    return '[标题]'
  } else if (sentence.type === 'poetry_line') {
    return `[${sentence.lineNumber || sentence.originalIndex + 1}]`
  } else {
    return `[${sentence.paragraph}.${sentence.sentenceInParagraph}]`
  }
}

function toggleActions() {
  showActions.value = !showActions.value
}

async function startEdit() {
  isEditing.value = true
  editText.value = props.sentence.text
  showActions.value = false
  
  // 等待DOM更新后聚焦输入框
  await nextTick()
  editInputRef.value?.focus()
}

function saveEdit() {
  if (editText.value.trim() && editText.value.trim() !== props.sentence.text) {
    emit('edit', editText.value.trim())
  }
  isEditing.value = false
  showActions.value = false
}

function cancelEdit() {
  isEditing.value = false
  editText.value = ''
  showActions.value = false
}
</script>

<style scoped>
.sentence-item {
  display: inline;
  cursor: pointer;
  transition: background-color 0.2s ease;
  padding: 2px 4px;
  border-radius: 3px;
  position: relative;
}

.sentence-item:not(.editing):hover {
  background-color: #fff3cd;
}

.highlighted {
  background-color: #fff3cd !important;
}

.permanent-highlighted {
  background-color: #d4edda !important;
}

.missing-translation {
  background-color: #f8d7da;
  color: #721c24;
}

.title-sentence {
  font-weight: bold;
  display: block;
  margin-bottom: 8px;
}

.poetry-line {
  display: block;
  margin-bottom: 2px;
}

.editing {
  display: block;
  background-color: #f0f9ff;
  padding: 8px;
  margin: 4px 0;
  border: 2px solid #409eff;
  border-radius: 4px;
}

.sentence-number {
  color: #6c757d;
  font-size: 0.85em;
  margin-right: 4px;
  font-weight: 500;
}

.sentence-number.clickable {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.2s ease;
}

.sentence-number.clickable:hover {
  background-color: #409eff;
  color: white;
}

.sentence-text {
  font-size: 14px;
}

/* 术语高亮样式 - 亮色模式 */
.sentence-text :deep(.term-highlight) {
  background-color: #B4E7CE;
  color: #1a5a3a;
  padding: 2px 4px;
  border-radius: 3px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.sentence-text :deep(.term-highlight:hover) {
  background-color: #9dd9bb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

/* 术语高亮样式 - 暗色模式 */
html.dark .sentence-text :deep(.term-highlight) {
  background-color: #2a5a4a;
  color: #a0e7c4;
}

html.dark .sentence-text :deep(.term-highlight:hover) {
  background-color: #356b58;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.sentence-edit {
  display: block;
  margin: 4px 0;
}

.sentence-edit :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.6;
}

.sentence-actions {
  display: inline-block;
  margin-left: 12px;
  white-space: nowrap;
}

.sentence-actions .el-button {
  margin-left: 6px;
  font-size: 13px;
}

.sentence-edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e4e7ed;
}

.sentence-edit-actions .el-button {
  border-radius: 6px;
}

.edit-hint {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
  font-style: italic;
}

/* 暗色模式适配 */
html.dark .sentence-item:not(.editing):hover {
  background-color: #4a4a2a;
}

html.dark .highlighted {
  background-color: #4a4a2a !important;
}

html.dark .permanent-highlighted {
  background-color: #2a4a3a !important;
}

html.dark .missing-translation {
  background-color: #4a2a2a;
  color: #ff6b6b;
}

html.dark .editing {
  background-color: #2a2a3a;
  border-color: #409eff;
}

html.dark .sentence-number {
  color: #a0a0a0;
}

html.dark .sentence-edit-actions {
  border-top-color: #3a3a3a;
}
</style>
