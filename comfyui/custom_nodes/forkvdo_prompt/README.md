# forkvdo prompt nodes

This package is maintained in the forkvdo repository and is not copied into
`vendor/ComfyUI` in Git. The local Nuxt process mounts it into the configured
ComfyUI `custom_nodes/forkvdo_prompt` directory before starting ComfyUI.

For a remote ComfyUI, mount or copy this directory into that instance's
`custom_nodes/forkvdo_prompt` directory and restart ComfyUI.

The execution host reads `FORKVDO_LLM_CONNECTIONS_JSON`. Each connection has a
`baseUrl`, `apiKey`, `supportsVision`, and optional limits. The node only stores
the connection id and model name in a workflow. The supported endpoint is
`POST <baseUrl>/v1/chat/completions` with an OpenAI Chat Completions request.
