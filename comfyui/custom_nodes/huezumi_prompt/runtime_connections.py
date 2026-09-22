"""Per-run credentials using ComfyUI's private queue slot, never node inputs.

Only install on executors with the sensitive-extra-data contract. The capability
endpoint lets the platform fail closed before sending credentials to old nodes.
"""
from contextvars import ContextVar
from functools import wraps


PRIVATE_KEY = "huezumi_connections"
_connections = ContextVar("huezumi_connections", default=None)


def runtime_connections():
    return _connections.get()


def connection_revision():
    config = runtime_connections()
    return repr(sorted((key, value.get("revisionId")) for key, value in (config or {}).items()))


def install_runtime_connections(execution, prompt_server):
    if getattr(execution.PromptExecutor, "_huezumi_connections_installed", False):
        return
    if not hasattr(execution, "SENSITIVE_EXTRA_DATA_KEYS") or not hasattr(execution.PromptExecutor, "execute_async"):
        raise RuntimeError("Huezumi 后台连接需要支持私有队列数据的新版 ComfyUI")
    execution.SENSITIVE_EXTRA_DATA_KEYS = tuple(dict.fromkeys((*execution.SENSITIVE_EXTRA_DATA_KEYS, PRIVATE_KEY)))
    original = execution.PromptExecutor.execute_async

    @wraps(original)
    async def execute_with_connections(self, prompt, prompt_id, extra_data=None, execute_outputs=None):
        data = extra_data or {}
        token = _connections.set(data.get(PRIVATE_KEY))
        try:
            return await original(self, prompt, prompt_id, data, execute_outputs or [])
        finally:
            _connections.reset(token)

    execution.PromptExecutor.execute_async = execute_with_connections
    execution.PromptExecutor._huezumi_connections_installed = True

    from aiohttp import web

    @prompt_server.routes.get("/huezumi/runtime-capabilities")
    async def capabilities(request):
        return web.json_response({"privateConnections": 1})
