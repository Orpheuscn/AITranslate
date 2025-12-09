<template>
  <el-card class="index-card">
    <template #header>
      <div class="index-header">
        <h3>专有名词索引</h3>
        <div class="header-actions">
          <el-button
            size="small"
            type="primary"
            :icon="Upload"
            plain
            @click="handleImport"
          >
            导入
          </el-button>
          <el-button
            size="small"
            type="success"
            :icon="Download"
            plain
            @click="handleDownload"
            :disabled="Object.keys(store.properNouns).length === 0"
          >
            下载
          </el-button>
          <el-button
            size="small"
            type="danger"
            :icon="Delete"
            plain
            @click="handleClear"
            :disabled="Object.keys(store.properNouns).length === 0"
          >
            清空
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
      <div v-show="visible" class="index-content">
      <div v-if="Object.keys(store.properNouns).length === 0" class="empty-state">
        <p>暂无专有名词记录。翻译过程中将自动识别并添加。</p>
      </div>
      
      <el-table
        v-else
        :data="sortedTerms"
        style="width: 100%"
        size="small"
      >
        <el-table-column prop="original" label="原文术语" width="200" />
        <el-table-column label="中文翻译">
          <template #default="{ row }">
            <el-input
              v-model="row.translation"
              size="small"
              @blur="updateTerm(row.original, row.translation)"
              @keyup.enter="updateTerm(row.original, row.translation)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ row }">
            <el-button
              size="small"
              type="danger"
              :icon="Delete"
              link
              @click="removeTerm(row.original)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { ArrowUp, ArrowDown, Delete, Download, Upload } from '@element-plus/icons-vue'
import { useTranslationStore } from '@/stores/translation'
import type { ProperNoun } from '@/types'

const visible = ref(true)

const store = useTranslationStore()

const sortedTerms = computed(() => {
  return Object.entries(store.properNouns)
    .map(([original, translation]) => ({ original, translation }))
    .sort((a, b) => a.original.localeCompare(b.original))
})

function updateTerm(original: string, newTranslation: string) {
  if (newTranslation.trim() && newTranslation !== store.properNouns[original]) {
    store.updateProperNoun(original, newTranslation.trim())
    ElMessage.success(`术语 "${original}" 的译文已更新`)
  }
}

function removeTerm(original: string) {
  ElMessageBox.confirm(
    `确定要删除术语 "${original}" 吗？`,
    '确认删除',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    store.removeProperNoun(original)
    ElMessage.success('术语已删除')
  }).catch(() => {
    // 用户取消
  })
}

function handleDownload() {
  // 创建 JSON 数据
  const jsonData = JSON.stringify(store.properNouns, null, 2)
  
  // 创建 Blob 对象
  const blob = new Blob([jsonData], { type: 'application/json' })
  
  // 创建下载链接
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  
  // 生成文件名（带时间戳）
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  link.download = `proper-nouns-index-${timestamp}.json`
  
  // 触发下载
  document.body.appendChild(link)
  link.click()
  
  // 清理
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  ElMessage.success('索引已导出')
}

function handleImport() {
  // 创建文件输入元素
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  
  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    
    if (!file) return
    
    try {
      const text = await file.text()
      const imported = JSON.parse(text) as ProperNoun
      
      // 验证格式
      if (typeof imported !== 'object' || imported === null) {
        throw new Error('无效的JSON格式')
      }
      
      // 验证是否为术语索引格式（键值对都是字符串）
      for (const [key, value] of Object.entries(imported)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          throw new Error('术语索引格式错误')
        }
      }
      
      // 导入术语
      store.importProperNouns(imported)
      
      ElMessage.success(`成功导入 ${Object.keys(imported).length} 个术语`)
    } catch (error) {
      console.error('导入术语索引失败:', error)
      ElMessage.error('导入失败：' + (error instanceof Error ? error.message : '文件格式错误'))
    }
  }
  
  input.click()
}

function handleClear() {
  ElMessageBox.confirm(
    '确定要清空所有专有名词索引吗？此操作不可撤销。',
    '确认清空',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    store.clearProperNouns()
    ElMessage.success('专有名词索引已清空')
  }).catch(() => {
    // 用户取消
  })
}
</script>

<style scoped>
.index-card {
  margin: 16px 0;
}

.index-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.index-header h3 {
  margin: 0;
  color: #2c3e50;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.empty-state {
  text-align: center;
  color: #909399;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 6px;
  font-style: italic;
}

.index-content {
  margin-top: 12px;
}

:deep(.el-input) {
  width: 100%;
}

/* 暗色模式适配 */
html.dark .index-card :deep(.el-card) {
  background-color: #1e1e1e;
  border-color: #3a3a3a;
}

html.dark .index-card :deep(.el-card__header) {
  background-color: #252525;
  border-bottom-color: #3a3a3a;
}

html.dark .index-header h3 {
  color: #e5e5e5;
}

html.dark .empty-state {
  background: #2a2a2a;
  color: #909399;
}
</style>
