"""forkvdo prompt workflow nodes.

This package is mounted into ComfyUI/custom_nodes by forkvdo for local runs.
Remote ComfyUI instances should mount or copy this repository directory.
"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .image_workflow import NODE_CLASS_MAPPINGS as IMAGE_NODES, NODE_DISPLAY_NAME_MAPPINGS as IMAGE_NAMES

NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **IMAGE_NODES}
NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **IMAGE_NAMES}


def _patch_broken_pipe() -> None:
    """容错补丁：在开发环境（如 Nuxt/Nitro 热重载）下，父进程的标准输出/错误管道可能关闭。
    防止 tqdm 或控制台日志 flush 触发 BrokenPipeError 打断 KSampler 采样。
    """
    try:
        import app.logger

        if hasattr(app.logger, "LogInterceptor"):
            orig_flush = app.logger.LogInterceptor.flush
            orig_write = app.logger.LogInterceptor.write

            def safe_flush(self):
                try:
                    orig_flush(self)
                except (BrokenPipeError, OSError):
                    pass

            def safe_write(self, data):
                try:
                    orig_write(self, data)
                except (BrokenPipeError, OSError):
                    pass

            app.logger.LogInterceptor.flush = safe_flush
            app.logger.LogInterceptor.write = safe_write
    except Exception:
        pass


_patch_broken_pipe()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
