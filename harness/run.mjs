import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
}
