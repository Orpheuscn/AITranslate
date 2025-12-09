export interface Sentence {
  text: string
  originalIndex: number
  paragraph: number
  sentenceInParagraph: number
  type: 'sentence' | 'title' | 'poetry_line' | 'empty_line'
  isMissing?: boolean
  indentation?: number
  lineNumber?: number
}

export interface ProperNoun {
  [original: string]: string
}

export interface TranslationSettings {
  apiKey: string
  model: 'deepseek-chat' | 'deepseek-coder'
  batchSize: 10 | 20 | 30 | 50
  sentenceRange?: string // 例如: "69.1-79.4"
}

export interface TranslationProgress {
  current: number
  total: number
  percentage: number
}

export interface TranslationState {
  isTranslating: boolean
  shouldStop: boolean
  progress: TranslationProgress
  currentMessage: string
}
