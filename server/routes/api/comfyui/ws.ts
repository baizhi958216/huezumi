/**
 * ComfyUI 实时事件代理。
 *
 * 浏览器只连接本服务，由服务端转发 ComfyUI 的 `/ws` 事件，
 * 这样 ComfyUI 的端口、地址和协议细节都不会暴露到前端。
 *
 * 需要 Node 22 及以上（使用全局 WebSocket 客户端）。运行环境不满足时，
 * 前端会退化成轮询 `/api/comfyui/history`，功能不受影响，只是没有逐节点进度。
 */

import { getComfyBaseUrl, getComfyConfig } from '../../../services/comfyui/config'

interface UpstreamSocket {
  send: (data: string) => void
  close: () => void
}

interface WebSocketLike {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
}

interface UpstreamHandlers {
  onMessage: (data: string) => void
  onClose: () => void
  onError: () => void
}

const upstreams = new Map<string, UpstreamSocket>()

function createGlobalSocket(url: string): WebSocketLike | undefined {
  const factory = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket
  if (!factory)
    return undefined
  const Socket = factory
  return new Socket(url)
}

function connectUpstream(url: string, handlers: UpstreamHandlers): UpstreamSocket {
  const socket = createGlobalSocket(url)
  if (!socket) {
    throw new Error('当前 Node 版本缺少全局 WebSocket 客户端，请升级到 Node 22 或更高')
  }

  socket.addEventListener('message', (event) => {
    if (event.data === undefined)
      return
    handlers.onMessage(typeof event.data === 'string' ? event.data : String(event.data))
  })
  socket.addEventListener('close', () => handlers.onClose())
  socket.addEventListener('error', () => handlers.onError())

  return {
    send: data => socket.send(data),
    close: () => socket.close(),
  }
}

export default defineWebSocketHandler({
  open(peer) {
    const config = getComfyConfig()
    const baseUrl = getComfyBaseUrl(config)
    const target = `${baseUrl.replace(/^http/, 'ws')}/ws`

    try {
      const upstream = connectUpstream(target, {
        onMessage: data => peer.send(data),
        onClose: () => peer.close(),
        onError: () => peer.close(),
      })
      upstreams.set(peer.id, upstream)
    }
    catch (error) {
      peer.send(JSON.stringify({
        type: 'connection_error',
        data: { message: error instanceof Error ? error.message : '无法连接 ComfyUI' },
      }))
      peer.close()
    }
  },

  message(peer, message) {
    upstreams.get(peer.id)?.send(message.text())
  },

  close(peer) {
    upstreams.get(peer.id)?.close()
    upstreams.delete(peer.id)
  },

  error(peer) {
    upstreams.get(peer.id)?.close()
    upstreams.delete(peer.id)
  },
})
