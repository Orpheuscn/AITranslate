import { useTranslationStore } from '@/stores/translation'
import type { Sentence, ProperNoun } from '@/types'

export function useTranslationAPI() {
  const store = useTranslationStore()

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

  // 解析专有名词（自动查重，只添加新词条）
  function parseProperNouns(properNounText: string): ProperNoun {
    const newTerms: ProperNoun = {}
    const lines = properNounText.split('\n')

    lines.forEach((line: string) => {
      const trimmedLine = line.trim()
      if (!trimmedLine) return

      console.log('解析原始行:', trimmedLine)

      // 只在第一个冒号处分割
      const firstColonIndex = trimmedLine.indexOf(':')
      if (firstColonIndex === -1) return

      let original = trimmedLine.substring(0, firstColonIndex).trim()
      let afterFirstColon = trimmedLine.substring(firstColonIndex + 1).trim()

      console.log('  第一次分割 - 原文:', original)
      console.log('  第一次分割 - 后续:', afterFirstColon)

      // 策略1: 如果后续内容包含中文书名号《》，提取书名号内容作为翻译
      const bookTitleMatch = afterFirstColon.match(/《([^》]+)》/)
      if (bookTitleMatch) {
        const translation = `《${bookTitleMatch[1]}》`
        
        // 检查是否需要扩展原文（如果书名号前还有英文内容）
        const beforeBookTitle = afterFirstColon.substring(0, afterFirstColon.indexOf('《')).trim()
        if (beforeBookTitle) {
          // 移除末尾的冒号
          const cleanBeforeTitle = beforeBookTitle.replace(/:$/, '').trim()
          if (cleanBeforeTitle) {
            original = `${original}: ${cleanBeforeTitle}`
          }
        }
        
        console.log('  使用书名号提取 - 最终原文:', original)
        console.log('  使用书名号提取 - 最终译文:', translation)
        
        if (original && translation && !store.properNouns[original]) {
          newTerms[original] = translation
        }
        return
      }

      // 策略2: 如果没有书名号，尝试找到最后一个冒号后的中文内容
      const lastColonIndex = afterFirstColon.lastIndexOf(':')
      if (lastColonIndex !== -1) {
        const possibleTranslation = afterFirstColon.substring(lastColonIndex + 1).trim()
        
        // 检查是否包含中文
        const hasChinese = /[\u4e00-\u9fa5]/.test(possibleTranslation)
        if (hasChinese) {
          // 提取最后冒号前的英文部分（如果有）作为完整原文
          const englishPart = afterFirstColon.substring(0, lastColonIndex).trim()
          if (englishPart) {
            original = `${original}: ${englishPart}`
          }
          
          console.log('  使用最后冒号提取 - 最终原文:', original)
          console.log('  使用最后冒号提取 - 最终译文:', possibleTranslation)
          
          if (original && possibleTranslation && !store.properNouns[original]) {
            newTerms[original] = possibleTranslation
          }
          return
        }
      }

      // 策略3: 如果上面都不适用，检查afterFirstColon是否直接就是中文翻译
      const hasChinese = /[\u4e00-\u9fa5]/.test(afterFirstColon)
      if (hasChinese) {
        // 移除可能的英文前缀，只保留中文部分
        const chineseMatch = afterFirstColon.match(/[\u4e00-\u9fa5《》：、，。！？；""''（）]+/)
        if (chineseMatch) {
          const translation = chineseMatch[0].trim()
          console.log('  直接提取中文 - 最终原文:', original)
          console.log('  直接提取中文 - 最终译文:', translation)
          
          if (original && translation && !store.properNouns[original]) {
            newTerms[original] = translation
          }
        }
      }
    })

    console.log('解析后的新术语:', JSON.stringify(newTerms, null, 2))
    return newTerms
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
    const defaultPrompt = `你是一个专业的多语言翻译助手。请将给定的任何语言句子忠实准确地翻译成简体中文。
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
3. 翻译完成后，另起一行，使用'### Proper Nouns:'作为标记
4. 列出专有名词（人名、地名、书名等）及其翻译，格式: '原文术语: 中文翻译'
5. 确保翻译句子的数量与请求中的句子数量完全一致`

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
        const separator = '### Proper Nouns:'
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
    const defaultPrompt = `你是一个专业的多语言翻译助手。请将给定的单句忠实准确地翻译成简体中文。
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
