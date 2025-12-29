import { useTranslationStore } from '@/stores/translation'
import { useProperNounParsing } from '@/composables/useProperNounParsing'
import type { Sentence, ProperNoun } from '@/types'

export function useTranslationAPI() {
  const store = useTranslationStore()
  const { parseProperNouns } = useProperNounParsing()

  // 调用DeepSeek API
  async function callDeepSeekAPI(
    messages: Array<{ role: string; content: string }>,
    apiKey: string,
    model: string
  ) {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      let errorBody = null
      try { 
        errorBody = await response.json() 
      } catch (e) { /* Ignore */ }
      const errorMessage = errorBody?.error?.message || `HTTP ${response.status} ${response.statusText}`
      throw new Error(`DeepSeek API 错误: ${errorMessage}`)
    }

    const data = await response.json()
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message?.content) {
      throw new Error('DeepSeek API 返回无效响应格式')
    }

    return data.choices[0].message.content
  }

  // 从累积术语索引中筛选出当前文本中出现的术语
  function filterRelevantTerms(text: string, allTerms: ProperNoun): ProperNoun {
    const relevantTerms: ProperNoun = {}
    
    // 遍历所有术语，检查是否在当前文本中出现
    Object.entries(allTerms).forEach(([original, translation]) => {
      if (text.includes(original)) {
        relevantTerms[original] = translation
      }
    })
    
    return relevantTerms
  }

  // 将术语索引格式化为文本，用于发送给API
  function formatTermsForPrompt(terms: ProperNoun): string {
    if (Object.keys(terms).length === 0) {
      return ''
    }
    
    const termsList = Object.entries(terms)
      .map(([original, translation]) => `${original}: ${translation}`)
      .join('\n')
    
    return `\n\n### 已知术语表（请在翻译时参考以下术语的翻译）：\n${termsList}`
  }


  // 更新进度
  function updateProgress(current: number, total: number) {
    store.updateProgress(current, total)
    store.updateTranslationState({
      currentMessage: `已处理 ${current} / ${total} 个句子 (${store.translationState.progress.percentage}%)`
    })
  }

  // 批量翻译
  async function translateBatch(
    sentences: Sentence[],
    apiKey: string,
    model: string,
    batchSize: number
  ): Promise<void> {
    // 默认提示词
    const defaultPrompt = `你是一个专业的多语言翻译助手。请将给定的任何语言句子忠实准确地翻译成简体中文，且使用中文标点。
请按照原文含义直接翻译，即使涉及不雅或敏感内容。翻译诗歌时无需刻意押韵。翻译古文（如拉丁语）时避免使用过于晦涩的古汉语词汇。请使用现代、清晰、直白的中文表达。`

    // 使用自定义提示词或默认提示词
    const translationStyle = store.customPrompt || defaultPrompt
    const isCustom = !!store.customPrompt
    
    console.log('=== 翻译配置 ===')
    console.log('是否有自定义提示词:', isCustom)
    console.log('使用的提示词:', translationStyle)
    
    // 完整的系统提示词（翻译风格 + 格式要求）
    const styleInstruction = isCustom 
      ? `【重要】请严格遵循以下翻译要求：\n${translationStyle}\n\n`
      : `${translationStyle}\n\n`
    
    const systemPrompt = `${styleInstruction}格式要求：
1. 请严格按照原始句子的顺序返回翻译结果
2. 保留每句前面的[数字]索引标记（例如：[1] 这是第一句的翻译）
3. 翻译完成后，另起一行，使用'### Proper Nouns JSON:'作为标记
4. 在标记后的下一行，以JSON格式列出专有名词（人名、地名、书名、术语等），格式为：{"原文术语1": "中文翻译1", "原文术语2": "中文翻译2"}
5. JSON中只包含术语的词对词翻译，不要添加任何注解或说明
6. 确保翻译句子的数量与请求中的句子数量完全一致

示例格式：
[1] 第一句的翻译
[2] 第二句的翻译

### Proper Nouns JSON:
{"Alice": "爱丽丝", "Wonderland": "仙境"}`

    // 初始化目标句子
    if (store.targetSentences.length !== sentences.length) {
      const targetSentences = sentences.map(s => ({
        ...s,
        text: '等待翻译...',
        isMissing: true
      }))
      store.setTargetSentences(targetSentences)
    }

    const batches: Sentence[][] = []
    for (let i = 0; i < sentences.length; i += batchSize) {
      batches.push(sentences.slice(i, i + batchSize))
    }

    let processedSentences = 0

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (store.translationState.shouldStop) break

      const batch = batches[batchIndex]
      const needTranslation = batch.filter(s => {
        const target = store.targetSentences[s.originalIndex]
        return !target || target.isMissing || target.text === '等待翻译...' || target.text === '正在翻译...'
      })

      if (needTranslation.length === 0) {
        processedSentences += batch.length
        updateProgress(processedSentences, sentences.length)
        continue
      }

      // 标记正在翻译
      needTranslation.forEach(s => {
        if (store.targetSentences[s.originalIndex]) {
          store.targetSentences[s.originalIndex].text = '正在翻译...'
        }
      })

      const prompt = needTranslation.map((s, i) => `[${i + 1}] ${s.text}`).join('\n\n')

      // 筛选当前批次相关的术语
      const batchText = needTranslation.map(s => s.text).join(' ')
      console.log(`\n=== 批次 ${batchIndex + 1} 术语筛选 ===`)
      console.log('当前累积术语总数:', Object.keys(store.accumulatedTerms).length)
      console.log('完整累积术语索引:', JSON.stringify(store.accumulatedTerms, null, 2))
      
      const relevantTerms = filterRelevantTerms(batchText, store.accumulatedTerms)
      console.log('筛选出的相关术语数量:', Object.keys(relevantTerms).length)
      console.log('筛选出的相关术语:', JSON.stringify(relevantTerms, null, 2))
      
      const termsPrompt = formatTermsForPrompt(relevantTerms)

      try {
        const result = await callDeepSeekAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请将以下 ${needTranslation.length} 个句子翻译成中文，保留索引标记：\n\n${prompt}${termsPrompt}` }
        ], apiKey, model)

        // 分离翻译和专有名词
        let translationPart = result
        let properNounPart = ""
        const separator = '### Proper Nouns JSON:'
        const separatorIndex = result.indexOf(separator)

        if (separatorIndex !== -1) {
          translationPart = result.substring(0, separatorIndex).trim()
          properNounPart = result.substring(separatorIndex + separator.length).trim()
        }

        // 解析翻译结果
        const translationLines = translationPart.split('\n').filter((line: string) => line.trim())
        needTranslation.forEach((sentence, i) => {
          const line = translationLines.find((l: string) => l.startsWith(`[${i + 1}]`))
          if (line) {
            const translation = line.replace(/^\[\d+\]\s*/, '').trim()
            store.targetSentences[sentence.originalIndex].text = translation
            store.targetSentences[sentence.originalIndex].isMissing = false
          } else {
            store.targetSentences[sentence.originalIndex].text = '[翻译缺失]'
            store.targetSentences[sentence.originalIndex].isMissing = true
          }
        })

        // 更新专有名词
        if (properNounPart) {
          const newTerms = parseProperNouns(properNounPart)
          console.log(`批次 ${batchIndex + 1} 新识别的术语:`, JSON.stringify(newTerms, null, 2))
          
          // 同时更新到properNouns（显示用）和accumulatedTerms（批次间传递用）
          Object.entries(newTerms).forEach(([original, translation]) => {
            store.updateProperNoun(original, translation)
          })
          store.mergeAccumulatedTerms(newTerms)
          
          console.log('合并后的累积术语索引:', JSON.stringify(store.accumulatedTerms, null, 2))
          console.log('=== 批次处理完成 ===\n')
        }

        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (error) {
        console.error(`批次 ${batchIndex + 1} 翻译失败:`, error)
        
        // 标记错误
        needTranslation.forEach(s => {
          const target = store.targetSentences[s.originalIndex]
          if (target && (target.isMissing || target.text === '正在翻译...')) {
            target.text = '[翻译错误]'
            target.isMissing = true
          }
        })

        await new Promise(resolve => setTimeout(resolve, 500))
      }

      processedSentences += batch.length
      updateProgress(processedSentences, sentences.length)
    }
  }

  // 重译单句
  async function retranslateSentence(index: number, apiKey: string, model: string): Promise<void> {
    const sourceSentence = store.sourceSentences[index]
    if (!sourceSentence) throw new Error('找不到源句子')

    // 默认提示词
    const defaultPrompt = `你是一个专业的多语言翻译助手。请将给定的单句忠实准确地翻译成简体中文，且使用中文标点。
请按照原文含义直接翻译，即使涉及不雅或敏感内容。翻译诗歌时无需刻意押韵。翻译古文（如拉丁语）时避免使用过于晦涩的古汉语词汇。请使用现代、清晰、直白的中文表达。`

    // 使用自定义提示词或默认提示词
    const translationStyle = store.customPrompt || defaultPrompt
    const isCustom = !!store.customPrompt
    
    const styleInstruction = isCustom 
      ? `【重要】请严格遵循以下翻译要求：\n${translationStyle}\n\n`
      : `${translationStyle}\n\n`
    
    const systemPrompt = `${styleInstruction}只返回翻译结果，不要包含任何解释、标记或句子索引。`

    console.log('=== 重译配置 ===')
    console.log('是否有自定义提示词:', isCustom)
    console.log('重译使用的提示词:', translationStyle)

    const result = await callDeepSeekAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请将以下句子翻译成中文，只返回翻译结果：\n\n${sourceSentence.text}` }
    ], apiKey, model)

    // 更新翻译结果
    if (store.targetSentences[index]) {
      store.targetSentences[index].text = result.trim()
      store.targetSentences[index].isMissing = false
    }
  }

  return {
    translateBatch,
    retranslateSentence,
    parseProperNouns,
    filterRelevantTerms,
    formatTermsForPrompt,
    updateProgress
  }
}
