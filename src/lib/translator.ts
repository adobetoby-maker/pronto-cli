import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from './auth.js'
import { ProntoConfig } from './config.js'

const client = new Anthropic()

export interface TranslationBatch {
  strings: Record<string, string>   // key → source text
  targetLanguage: string
  config: ProntoConfig
}

export interface TranslationResult {
  strings: Record<string, string>   // key → translated text
  wordsProcessed: number
  tokensUsed: number
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function flattenJson(obj: unknown, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      result[key] = v
    } else if (typeof v === 'object' && v !== null) {
      Object.assign(result, flattenJson(v, key))
    }
  }
  return result
}

function unflattenJson(flat: Record<string, string>): unknown {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let cur = result
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in cur)) cur[part] = {}
      cur = cur[part] as Record<string, unknown>
    }
    cur[parts[parts.length - 1]] = value
  }
  return result
}

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese',
  ja: 'Japanese', zh: 'Simplified Chinese', ko: 'Korean', ar: 'Arabic',
  ru: 'Russian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', sv: 'Swedish',
  da: 'Danish', fi: 'Finnish', no: 'Norwegian', he: 'Hebrew', hi: 'Hindi',
}

export async function translateBatch(batch: TranslationBatch): Promise<TranslationResult> {
  const { strings, targetLanguage, config } = batch
  const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
  const wordCount = Object.values(strings).reduce((sum, s) => sum + countWords(s), 0)

  const toneInstruction = config.tone === 'formal'
    ? 'Use formal language and polite forms of address.'
    : config.tone === 'informal'
    ? 'Use casual, friendly language.'
    : 'Match the tone of the source text.'

  const domainInstruction = config.domain
    ? `This is ${config.domain} content. Use appropriate domain-specific terminology.`
    : ''

  const doNotTranslate = config.do_not_translate?.length
    ? `Do NOT translate these terms — keep them exactly as-is: ${config.do_not_translate.join(', ')}.`
    : ''

  const systemPrompt = `You are a professional localization expert. Translate UI strings from ${config.source_language} to ${langName}.

Rules:
- Preserve all interpolation variables exactly: {{variable}}, {variable}, %s, %d, etc.
- Preserve HTML tags if present.
- ${toneInstruction}
- ${domainInstruction}
- ${doNotTranslate}
- Return ONLY valid JSON, no explanation.
- Keep keys identical to input. Translate only values.`

  const inputJson = JSON.stringify(strings, null, 2)

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: Math.max(4096, inputJson.length * 2),
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Translate these UI strings to ${langName}:\n\n${inputJson}\n\nReturn only the translated JSON object.`,
    }],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extract JSON from response (handle markdown code fences)
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    ?? responseText.match(/(\{[\s\S]*\})/)

  if (!jsonMatch) {
    throw new Error(`Claude returned non-JSON response: ${responseText.slice(0, 200)}`)
  }

  const translated = JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as Record<string, string>

  return {
    strings: translated,
    wordsProcessed: wordCount,
    tokensUsed: (message.usage.input_tokens + message.usage.output_tokens),
  }
}

export { flattenJson, unflattenJson }
