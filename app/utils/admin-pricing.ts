/** Keep one version per exact price key; wildcard matching remains the quote service's job. */
export function latestPriceVersions<T extends { version: number }>(rows: T[], key: (row: T) => string): T[] {
  const latest = new Map<string, T>()
  for (const row of rows) {
    const id = key(row)
    if (!latest.has(id) || latest.get(id)!.version < row.version)
      latest.set(id, row)
  }
  return [...latest.values()]
}
