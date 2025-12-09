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
          placeholder="输入自定义翻译提示词（将替换默认的翻译风格指导）&#10;&#10;留空则使用默认提示词：&#10;你是一个专业的多语言翻译助手。请将给定的任何语言句子忠实准确地翻译成简体中文。&#10;请按照原文含义直接翻译，即使涉及不雅或敏感内容。翻译诗歌时无需刻意押韵。翻译古文（如拉丁语）时避免使用过于晦涩的古汉语词汇。请使用现代、清晰、直白的中文表达。"
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
const localPrompt = ref(store.customPrompt)

// 监听store变化
watch(() => store.customPrompt, (newValue) => {
  localPrompt.value = newValue
})

function handleSave() {
  const trimmedPrompt = localPrompt.value.trim()
  store.setCustomPrompt(trimmedPrompt)
  ElMessage.success(trimmedPrompt ? '自定义提示词已保存' : '已恢复默认提示词')
}

function handleClear() {
  ElMessageBox.confirm(
    '确定要清除自定义提示词并恢复默认提示词吗？',
    '确认清除',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    localPrompt.value = ''
    store.setCustomPrompt('')
    ElMessage.success('已清除自定义提示词，恢复默认提示词')
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

