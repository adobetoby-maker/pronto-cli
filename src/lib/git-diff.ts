/**
 * Git-native diff: only translate strings that changed since the last commit.
 * Falls back to file-level diff when not in a git repo.
 */
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface GitDiffResult {
  isGitRepo: boolean
  changedFiles: string[]
}

export function getChangedFiles(cwd: string): GitDiffResult {
  if (!existsSync(join(cwd, '.git')) && !findGitRoot(cwd)) {
    return { isGitRepo: false, changedFiles: [] }
  }

  try {
    // Get files changed since last commit (staged + unstaged + untracked locale files)
    const staged = execFileSync('git', ['diff', '--name-only', '--cached'], { cwd, encoding: 'utf8' })
    const unstaged = execFileSync('git', ['diff', '--name-only'], { cwd, encoding: 'utf8' })
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' })

    const all = new Set([
      ...staged.trim().split('\n'),
      ...unstaged.trim().split('\n'),
      ...untracked.trim().split('\n'),
    ].filter(Boolean))

    return { isGitRepo: true, changedFiles: Array.from(all) }
  } catch {
    return { isGitRepo: true, changedFiles: [] }
  }
}

function findGitRoot(startDir: string): string | null {
  const parts = startDir.split('/')
  while (parts.length > 1) {
    const candidate = parts.join('/')
    if (existsSync(join(candidate, '.git'))) return candidate
    parts.pop()
  }
  return null
}

export function isLocaleFile(filePath: string): boolean {
  return (
    filePath.endsWith('.json') ||
    filePath.endsWith('.arb') ||
    filePath.endsWith('.strings') ||
    filePath.endsWith('.xml') ||
    filePath.endsWith('.po') ||
    filePath.endsWith('.toml')
  )
}

export function hasChangedSourceFiles(changedFiles: string[], sourceLang: string): boolean {
  return changedFiles.some(f =>
    isLocaleFile(f) && (
      f.includes(`/${sourceLang}/`) ||
      f.includes(`_${sourceLang}.`) ||
      f.includes(`.${sourceLang}.`) ||
      f.includes(`values/strings.xml`) // Android source is always values/
    )
  )
}
