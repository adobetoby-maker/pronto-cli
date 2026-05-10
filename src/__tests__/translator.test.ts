import { describe, it, expect } from 'vitest'
import { flattenJson, unflattenJson } from '../lib/translator.js'

describe('flattenJson', () => {
  it('flattens a simple nested object', () => {
    const input = { hero: { title: 'Hello', subtitle: 'World' } }
    expect(flattenJson(input)).toEqual({
      'hero.title': 'Hello',
      'hero.subtitle': 'World',
    })
  })

  it('handles three levels of nesting', () => {
    const input = { a: { b: { c: 'deep' } } }
    expect(flattenJson(input)).toEqual({ 'a.b.c': 'deep' })
  })

  it('skips non-string values at the leaf level', () => {
    const input = { key: 'value', num: 42, nested: { str: 'ok' } }
    const result = flattenJson(input)
    expect(result).not.toHaveProperty('num')
    expect(result['nested.str']).toBe('ok')
    expect(result['key']).toBe('value')
  })

  it('returns empty object for empty input', () => {
    expect(flattenJson({})).toEqual({})
  })

  it('does not flatten top-level strings (no prefix)', () => {
    const input = { greeting: 'Hello', farewell: 'Bye' }
    expect(flattenJson(input)).toEqual({ greeting: 'Hello', farewell: 'Bye' })
  })
})

describe('unflattenJson', () => {
  it('reverses flattenJson output', () => {
    const flat = { 'hero.title': 'Hello', 'hero.subtitle': 'World' }
    expect(unflattenJson(flat)).toEqual({ hero: { title: 'Hello', subtitle: 'World' } })
  })

  it('handles three levels', () => {
    const flat = { 'a.b.c': 'deep' }
    expect(unflattenJson(flat)).toEqual({ a: { b: { c: 'deep' } } })
  })

  it('handles top-level keys', () => {
    const flat = { greeting: 'Hello', farewell: 'Bye' }
    expect(unflattenJson(flat)).toEqual({ greeting: 'Hello', farewell: 'Bye' })
  })

  it('is a round-trip inverse of flattenJson', () => {
    const original = {
      nav: { home: 'Home', about: 'About' },
      hero: { title: 'Title', cta: { primary: 'Click me' } },
    }
    const roundTripped = unflattenJson(flattenJson(original))
    expect(roundTripped).toEqual(original)
  })

  it('handles mixed depth keys in one object', () => {
    const flat = { 'a.b': '1', 'a.c': '2', 'd': '3' }
    expect(unflattenJson(flat)).toEqual({ a: { b: '1', c: '2' }, d: '3' })
  })
})
