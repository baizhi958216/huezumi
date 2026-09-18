import { readConnectionVersion } from '../platform/connections'
import { DashScopeProvider } from './dashscope'
import { KlingProvider } from './kling'
import { MiniMaxProvider } from './minimax'
import { RollDekProvider } from './rolldek'
import { RunwayProvider } from './runway'
import { SeedanceProvider } from './seedance'

export async function configuredVideoProvider(revisionId: string) {
  const { connection, version, secrets } = await readConnectionVersion(revisionId)
  const s = version.settings
  switch (connection.provider) {
    case 'dashscope': return new DashScopeProvider({ apiKey: secrets.apiKey || '', baseUrl: s.baseUrl || (s.workspaceId ? `https://${s.workspaceId}.${s.region || 'cn-beijing'}.maas.aliyuncs.com/api/v1` : 'https://dashscope.aliyuncs.com/api/v1'), model: s.defaultModel })
    case 'minimax': return new MiniMaxProvider({ apiKey: secrets.apiKey || '', baseUrl: s.baseUrl || 'https://api.minimaxi.com/v1', groupId: s.groupId })
    case 'kling': return new KlingProvider({ accessKey: secrets.accessKey || '', secretKey: secrets.secretKey || '', baseUrl: s.baseUrl || 'https://api-beijing.klingai.com/v1' })
    case 'seedance': return new SeedanceProvider({ apiKey: secrets.apiKey || '', baseUrl: s.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3', model: s.defaultModel })
    case 'rolldek': return new RollDekProvider({ apiKey: secrets.apiKey || '', baseUrl: s.baseUrl || 'https://rolldek.com' })
    case 'runway': return new RunwayProvider({ apiKey: secrets.apiKey || '', baseUrl: s.baseUrl || 'https://api.dev.runwayml.com', model: s.defaultModel })
    default: throw createError({ statusCode: 422, statusMessage: '视频适配器不存在' })
  }
}
