/** Preserve runtime/Python settings without passing platform infrastructure credentials. */
export function comfyChildEnvironment(source: Record<string, string | undefined>, llmConnectionsJson = '') {
  const inherited = Object.fromEntries(Object.entries(source).filter(([key]) => !/^(?:NUXT_|POSTGRES_|LOCAL_OSS_|HUEZUMI_)/.test(key)))
  return {
    ...inherited,
    PYTHONUNBUFFERED: '1',
    HUEZUMI_LLM_CONNECTIONS_JSON: llmConnectionsJson || source.HUEZUMI_LLM_CONNECTIONS_JSON || '',
    HUEZUMI_DASHSCOPE_API_KEY: source.HUEZUMI_DASHSCOPE_API_KEY || source.NUXT_DASHSCOPE_API_KEY || '',
    HUEZUMI_DASHSCOPE_WORKSPACE_ID: source.HUEZUMI_DASHSCOPE_WORKSPACE_ID || source.NUXT_DASHSCOPE_WORKSPACE_ID || '',
    HUEZUMI_DASHSCOPE_REGION: source.HUEZUMI_DASHSCOPE_REGION || source.NUXT_DASHSCOPE_REGION || 'cn-beijing',
  }
}
