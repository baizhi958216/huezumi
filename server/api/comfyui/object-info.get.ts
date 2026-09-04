import { fetchObjectInfo } from '../../services/comfyui/client'
import { getCachedObjectInfo, setCachedObjectInfo } from '../../services/comfyui/state'
import { withComfyUpstream } from '../../utils/comfyui'

/**
 * 节点定义。体积通常数 MB，服务端缓存；
 * 进程重启、安装完成、图片上传后由服务端主动失效，这里也支持 ?refresh=1 强制回源。
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const refresh = query.refresh === '1' || query.refresh === 'true'

  if (!refresh) {
    const cached = getCachedObjectInfo()
    if (cached)
      return cached
  }

  const info = await withComfyUpstream(() => fetchObjectInfo())
  setCachedObjectInfo(info)
  return info
})
