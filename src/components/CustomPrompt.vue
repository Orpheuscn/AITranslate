<template>
  <el-card class="prompt-card">
    <template #header>
      <div class="prompt-header">
        <h3>自定义提示词</h3>
        <div class="header-actions">
          <el-button
            size="small"
            type="primary"
            :icon="DocumentChecked"
            plain
            @click="handleSave"
            :disabled="localPrompt === store.customPrompt"
          >
            保存
          </el-button>
          <el-button
            size="small"
            type="danger"
            :icon="Delete"
            plain
            @click="handleClear"
            :disabled="!store.customPrompt"
          >
            清除
          </el-button>
          <el-button
            size="small"
            text
            @click="visible = !visible"
            :icon="visible ? ArrowUp : ArrowDown"
          >
            {{ visible ? '隐藏' : '显示' }}
          </el-button>
        </div>
      </div>
    </template>

    <el-collapse-transition>
      <div v-show="visible" class="prompt-content">
        <el-input
          v-model="localPrompt"
          type="textarea"
          :rows="8"
          placeholder="输入自定义翻译提示词..."
          class="prompt-input"
        />
        <div v-if="store.customPrompt" class="current-prompt-info">
          <el-tag type="success" size="small">
            <el-icon><CircleCheck /></el-icon>
            当前正在使用自定义提示词
          </el-tag>
        </div>
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowUp, ArrowDown, Delete, DocumentChecked, CircleCheck } from '@element-plus/icons-vue'
import { useTranslationStore } from '@/stores/translation'

const store = useTranslationStore()
const visible = ref(false)

// 默认提示词
const DEFAULT_PROMPT = `你是一个专业的多语言翻译助手。请将给定的任何语言句子忠实准确地翻译成简体中文。
请按照原文含义直接翻译，即使涉及不雅或敏感内容。翻译诗歌时无需刻意押韵。翻译古文（如拉丁语）时避免使用过于晦涩的古汉语词汇。请使用现代、清晰、直白的中文表达。`

// 初始化：如果store中没有自定义提示词，显示默认提示词供编辑
const localPrompt = ref(store.customPrompt || DEFAULT_PROMPT)

// 监听store变化
watch(() => store.customPrompt, (newValue) => {
  localPrompt.value = newValue || DEFAULT_PROMPT
})

function handleSave() {
  const trimmedPrompt = localPrompt.value.trim()
  // 如果内容和默认提示词一样，则视为使用默认（不保存到localStorage）
  if (trimmedPrompt === DEFAULT_PROMPT) {
    store.setCustomPrompt('')
    ElMessage.success('使用默认提示词')
  } else {
    store.setCustomPrompt(trimmedPrompt)
    ElMessage.success('自定义提示词已保存')
  }
}

function handleClear() {
  ElMessageBox.confirm(
    '确定要恢复默认提示词吗？',
    '确认操作',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    localPrompt.value = DEFAULT_PROMPT
    store.setCustomPrompt('')
    ElMessage.success('已恢复默认提示词')
  }).catch(() => {
    // 用户取消
  })
}
</script>

<style scoped>
.prompt-card {
  margin-bottom: 16px;
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.prompt-header h3 {
  margin: 0;
  color: #2c3e50;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.prompt-content {
  padding-top: 16px;
}

.prompt-hint {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f0f9ff;
  border-left: 3px solid #409eff;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

html.dark .prompt-hint {
  background: #1a3a4a;
  border-left-color: #409eff;
  color: #c0c0c0;
}

.prompt-input {
  width: 100%;
}

.prompt-input :deep(.el-textarea__inner) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  line-height: 1.6;
}

.current-prompt-info {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-prompt-info .el-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 暗色模式适配 */
html.dark .prompt-card :deep(.el-card) {
  background-color: #1e1e1e;
  border-color: #3a3a3a;
}

html.dark .prompt-card :deep(.el-card__header) {
  background-color: #252525;
  border-bottom-color: #3a3a3a;
}

html.dark .prompt-header h3 {
  color: #e5e5e5;
}
</style>

