FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ARG COMFYUI_REF=v0.3.59
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl git \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 comfy

WORKDIR /opt
RUN git clone --depth 1 --branch "${COMFYUI_REF}" https://github.com/comfyanonymous/ComfyUI.git \
  && pip install --no-cache-dir -r /opt/ComfyUI/requirements.txt \
  && chown -R comfy:comfy /opt/ComfyUI

USER comfy
WORKDIR /opt/ComfyUI
EXPOSE 8188
HEALTHCHECK --interval=20s --timeout=5s --start-period=60s --retries=5 CMD curl -fsS http://127.0.0.1:8188/system_stats >/dev/null || exit 1
CMD ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188", "--disable-auto-launch"]
