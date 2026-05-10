import { describe, it, expect } from 'vitest'
import { diffStrings } from '../../lib/platforms/react.js'

describe('diffStrings', () => {
  it('returns all strings as changed when no existing translation', () => {
    const source = { greeting: 'Hello', farewell: 'Goodbye' }
    const { changed, unchanged } = diffStrings(source, null)
    expect(changed).toEqual(source)
    expect(unchanged).toBe(0)
  })

  it('returns only new keys when some strings already exist', () => {
    const source = { a: 'Apple', b: 'Banana', c: 'Cherry' }
    const existing = { a: 'Manzana', b: 'Plátano' }
    const { changed, unchanged } = diffStrings(source, existing)
    expect(changed).toEqual({ c: 'Cherry' })
    expect(unchanged).toBe(2)
  })

  it('returns empty changed when all strings already translated', () => {
    const source = { x: 'X', y: 'Y' }
    const existing = { x: 'ecs', y: 'igrek' }
    const { changed, unchanged } = diffStrings(source, existing)
    expect(changed).toEqual({})
    expect(unchanged).toBe(2)
  })

  it('treats empty existing object same as missing keys', () => {
    const source = { hello: 'Hello' }
    const { changed, unchanged } = diffStrings(source, {})
    expect(changed).toEqual({ hello: 'Hello' })
    expect(unchanged).toBe(0)
  })

  it('does not include keys in existing but not in source', () => {
    const source = { a: 'A' }
    const existing = { a: 'a_translated', b: 'b_translated' }
    const { changed, unchanged } = diffStrings(source, existing)
    // 'b' is in existing but not source — should not affect output
    expect(changed).toEqual({})
    expect(unchanged).toBe(1)
  })

  it('counts correctly with many strings', () => {
    const source: Record<string, string> = {}
    const existing: Record<string, string> = {}
    for (let i = 0; i < 100; i++) {
      source[`key_${i}`] = `Value ${i}`
      if (i < 60) existing[`key_${i}`] = `Translated ${i}`
    }
    const { changed, unchanged } = diffStrings(source, existing)
    expect(Object.keys(changed).length).toBe(40)
    expect(unchanged).toBe(60)
  })
})
