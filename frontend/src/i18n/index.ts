import { zh } from './zh'
import { en } from './en'
import { useLangStore } from '../store/langStore'

const translations = { zh, en }

export function useT() {
  const lang = useLangStore(s => s.lang)
  const dict = translations[lang]
  return (key: keyof typeof zh): string => dict[key] ?? zh[key]
}
