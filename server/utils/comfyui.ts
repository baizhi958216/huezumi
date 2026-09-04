import { ComfyUpstreamError } from '../services/comfyui/client'

/**
 * 把 ComfyUI 上游错误翻译成对外 HTTP 错误。
 * 上游响应正文可能包含内部路径，错误对象里只保留可操作的消息与状态码。
 */
export async function withComfyUpstream<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  }
  catch (error) {
    if (error instanceof ComfyUpstreamError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
      })
    }
    throw error
  }
}
