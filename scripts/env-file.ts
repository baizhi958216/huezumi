import { parseEnv } from 'node:util'

/** dotenv quoting is not JSON escaping, especially for connection JSON strings. */
export function envAssignment(key: string, value: string) {
  const quote = ['\'', '"', '`'].find(delimiter => !value.includes(delimiter))
  if (!quote)
    throw new Error(`Cannot safely serialize environment key: ${key}`)
  const assignment = `${key}=${quote}${value}${quote}`
  if (parseEnv(assignment)[key] !== value)
    throw new Error(`Environment serialization check failed: ${key}`)
  return assignment
}
