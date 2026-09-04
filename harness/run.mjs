import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const full = process.argv.includes('--full')
const listOnly = process.argv.includes('--list')
const unknown = process.argv.slice(2).filter(arg => !['--full', '--list'].includes(arg))

if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(', ')}`)
  process.exit(2)
}

const steps = [
  { name: 'repository contract', run: validateRepository },
  { name: 'lint', command: ['pnpm', 'lint'] },
  { name: 'typecheck', command: ['pnpm', 'typecheck'] },
]

if (full)
  steps.push({ name: 'production build', command: ['pnpm', 'build'] })

if (listOnly) {
  for (const step of steps)
    process.stdout.write(`${step.name}\n`)
  process.exit(0)
}

for (const step of steps) {
  const startedAt = Date.now()
  process.stdout.write(`\n[harness] ${step.name}\n`)

  if (step.run) {
    try {
      step.run()
    }
    catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  }
  else {
    const [command, ...args] = step.command
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })
    if (result.error) {
      console.error(result.error.message)
      process.exit(1)
    }
    if (result.status !== 0)
      process.exit(result.status ?? 1)
  }

  process.stdout.write(`[harness] passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`)
}

process.stdout.write(`\n[harness] ${steps.length} checks passed (${full ? 'full' : 'quick'} mode)\n`)

function validateRepository() {
  const requiredFiles = [
    'AGENTS.md',
    'CLAUDE.md',
    'DESIGN.md',
    'README.md',
    'docs/README.md',
    'docs/api.md',
    'docs/development.md',
    'docs/decisions/000-template.md',
    'spec/README.md',
    'spec/_template.md',
  ]

  const missing = requiredFiles.filter(file => !existsSync(file))
  if (missing.length)
    throw new Error(`Missing required engineering files: ${missing.join(', ')}`)

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const requiredScripts = ['build', 'check', 'check:full', 'dev', 'lint', 'typecheck']
  const missingScripts = requiredScripts.filter(script => !packageJson.scripts?.[script])
  if (missingScripts.length)
    throw new Error(`Missing package scripts: ${missingScripts.join(', ')}`)

  const claude = readFileSync('CLAUDE.md', 'utf8')
  if (!claude.includes('@AGENTS.md'))
    throw new Error('CLAUDE.md must import AGENTS.md to keep agent rules in one source')

  const gitignore = readFileSync('.gitignore', 'utf8')
  for (const ignored of ['.env', '.data']) {
    if (!gitignore.split(/\r?\n/).includes(ignored))
      throw new Error(`.gitignore must contain ${ignored}`)
  }

  validateSpecs()
  validateMarkdownLinks()
  validateTrackedRuntimeFiles()
}

function validateSpecs() {
  const allowedStatuses = new Set(['draft', 'accepted', 'completed', 'superseded'])
  const specFiles = readdirSync('spec')
    .filter(file => file.endsWith('.md') && !['README.md', '_template.md'].includes(file))
    .map(file => `spec/${file}`)

  for (const file of specFiles) {
    const content = readFileSync(file, 'utf8')
    const status = content.match(/^- 状态：([^\r\n]+)$/m)?.[1]?.trim()
    if (!status)
      throw new Error(`${file} must declare a status`)
    if (!allowedStatuses.has(status))
      throw new Error(`${file} has unsupported status: ${status}`)
    if (status === 'completed' && /^- \[ \]/m.test(content))
      throw new Error(`${file} is completed but still has unchecked acceptance items`)
    if (status === 'superseded' && !/继任|替代|supersed/i.test(content))
      throw new Error(`${file} is superseded but does not identify its successor`)
  }
}

function validateMarkdownLinks() {
  const roots = ['AGENTS.md', 'CLAUDE.md', 'DESIGN.md', 'README.md', '.github', 'docs', 'harness', 'spec']
  const markdownFiles = roots.flatMap(collectMarkdownFiles)

  for (const file of markdownFiles) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim()
      if (target.startsWith('<'))
        target = target.slice(1, target.indexOf('>'))
      else
        target = target.split(/\s+["']/)[0]

      if (!target || target.startsWith('#') || target.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(target))
        continue

      const fileTarget = decodeURIComponent(target.split('#')[0].split('?')[0])
      if (fileTarget && !existsSync(resolve(dirname(file), fileTarget)))
        throw new Error(`Broken Markdown link in ${file}: ${target}`)
    }
  }
}

function collectMarkdownFiles(path) {
  if (!existsSync(path))
    return []
  if (!statSync(path).isDirectory())
    return path.endsWith('.md') ? [path] : []
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`
    if (entry.isDirectory())
      return collectMarkdownFiles(child)
    return entry.name.endsWith('.md') ? [child] : []
  })
}

function validateTrackedRuntimeFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (result.error)
    throw result.error
  if (result.status !== 0)
    throw new Error('Unable to inspect tracked files with git ls-files')

  const forbidden = result.stdout
    .split('\0')
    .filter(Boolean)
    .filter(file => file === '.env' || /^(?:\.data|\.nuxt|\.output|node_modules)\//.test(file))
  if (forbidden.length)
    throw new Error(`Runtime or sensitive files must not be tracked: ${forbidden.join(', ')}`)
}
