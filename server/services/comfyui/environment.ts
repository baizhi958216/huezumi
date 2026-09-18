/** Preserve runtime/Python settings without passing platform infrastructure credentials. */
export function comfyChildEnvironment(source: Record<string, string | undefined>, llmConnectionsJson = '') {
  const inherited = Object.fromEntries(Object.entries(source).filter(([key]) => !/^(?:NUXT_|POSTGRES_|LOCAL_OSS_|FORKVDO_LEGACY_)/.test(key)))
  return {
    ...inherited,
    PYTHONUNBUFFERED: '1',
    FORKVDO_LLM_CONNECTIONS_JSON: llmConnectionsJson || source.FORKVDO_LLM_CONNECTIONS_JSON || '',
    FORKVDO_DASHSCOPE_API_KEY: source.FORKVDO_DASHSCOPE_API_KEY || source.NUXT_DASHSCOPE_API_KEY || '',
    FORKVDO_DASHSCOPE_WORKSPACE_ID: source.FORKVDO_DASHSCOPE_WORKSPACE_ID || source.NUXT_DASHSCOPE_WORKSPACE_ID || '',
    FORKVDO_DASHSCOPE_REGION: source.FORKVDO_DASHSCOPE_REGION || source.NUXT_DASHSCOPE_REGION || 'cn-beijing',
  }
}
