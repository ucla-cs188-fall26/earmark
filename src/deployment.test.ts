import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../vite.config.ts'

describe('manual root deployment', () => {
  it('uses root assets even when a legacy Pages flag is present', () => {
    const previous = process.env.GITHUB_PAGES
    process.env.GITHUB_PAGES = '1'
    try { expect(config.base).toBe('/') } finally {
      if (previous === undefined) delete process.env.GITHUB_PAGES
      else process.env.GITHUB_PAGES = previous
    }
  })
  it('keeps checks but has no automatic publishing workflow', () => {
    expect(existsSync('.github/workflows/deploy.yml')).toBe(false)
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
    for (const command of ['lint', 'typecheck', 'test', 'build']) expect(ci).toContain(command)
    expect(ci).not.toContain('deploy-pages')
  })
})
