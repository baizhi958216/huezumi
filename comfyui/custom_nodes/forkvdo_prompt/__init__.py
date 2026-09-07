"""forkvdo prompt workflow nodes.

This package is mounted into ComfyUI/custom_nodes by forkvdo for local runs.
Remote ComfyUI instances should mount or copy this repository directory.
"""

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
