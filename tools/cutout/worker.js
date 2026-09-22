import { pipeline, RawImage, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "briaai/RMBG-1.4";

let segmenter = null;
let activeDevice = "";

function send(requestId, payload, transfer = []) {
  self.postMessage({ requestId, ...payload }, transfer);
}

function progressReporter(requestId) {
  return (info) => {
    if (!info) return;
    if (info.status === "progress") {
      send(requestId, {
        type: "progress",
        file: info.file || "",
        progress: Number.isFinite(info.progress) ? info.progress : null
      });
    }
  };
}

async function disposePipeline() {
  if (segmenter && typeof segmenter.dispose === "function") {
    try { await segmenter.dispose(); } catch (_) {}
  }
  segmenter = null;
  activeDevice = "";
}

async function loadPipeline(requestId, preferredDevice) {
  if (segmenter && activeDevice === preferredDevice) return segmenter;

  await disposePipeline();

  send(requestId, {
    type: "status",
    phase: "loading",
    title: "RMBG-1.4を準備しています",
    detail: "初回のみAIモデルを端末へ読み込みます"
  });

  const progress_callback = progressReporter(requestId);

  try {
    segmenter = await pipeline("image-segmentation", MODEL_ID, {
      device: preferredDevice,
      dtype: "fp32",
      progress_callback
    });
    activeDevice = preferredDevice;
    return segmenter;
  } catch (error) {
    if (preferredDevice !== "webgpu") throw error;

    send(requestId, {
      type: "status",
      phase: "fallback",
      title: "CPUモードへ切り替えています",
      detail: "WebGPUで起動できなかったためWASMで再試行します"
    });

    await disposePipeline();
    segmenter = await pipeline("image-segmentation", MODEL_ID, {
      device: "wasm",
      dtype: "fp32",
      progress_callback
    });
    activeDevice = "wasm";
    return segmenter;
  }
}

function extractMask(mask) {
  if (!mask || !mask.data || !mask.width || !mask.height) {
    throw new Error("RMBG-1.4のマスクを取得できませんでした。");
  }

  const width = Number(mask.width);
  const height = Number(mask.height);
  const pixels = width * height;
  const src = mask.data;

  if (!pixels || src.length < pixels) {
    throw new Error("RMBG-1.4のマスクサイズが不正です。");
  }

  if (src.length === pixels) {
    return { width, height, bytes: Uint8Array.from(src) };
  }

  const channels = Math.max(1, Math.floor(src.length / pixels));
  const usableChannels = Math.min(channels, 4);

  // RawImage masks can be grayscale, RGB, or RGBA depending on pipeline
  // internals. Pick the channel that actually contains the segmentation
  // signal instead of assuming alpha is always the useful channel.
  let bestChannel = 0;
  let bestRange = -1;

  for (let c = 0; c < usableChannels; c += 1) {
    let min = 255;
    let max = 0;
    const step = Math.max(1, Math.floor(pixels / 4096));
    for (let i = 0; i < pixels; i += step) {
      const v = Number(src[i * channels + c] ?? 0);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min;
    if (range > bestRange) {
      bestRange = range;
      bestChannel = c;
    }
  }

  const bytes = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    bytes[i] = Number(src[i * channels + bestChannel] ?? 0);
  }

  return { width, height, bytes };
}

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type !== "process") return;

  const requestId = data.requestId;

  try {
    const preferredDevice = data.webgpu ? "webgpu" : "wasm";
    const pipe = await loadPipeline(requestId, preferredDevice);

    send(requestId, {
      type: "status",
      phase: "running",
      title: "背景を判定しています",
      detail: "BRIA RMBG-1.4で前景を抽出中"
    });

    const image = await RawImage.read(data.file);
    const output = await pipe(image);
    const first = Array.isArray(output) ? output[0] : output;
    const mask = first?.mask || first;

    const { width, height, bytes } = extractMask(mask);

    send(requestId, {
      type: "result",
      model: "BRIA RMBG-1.4",
      device: activeDevice,
      maskWidth: width,
      maskHeight: height,
      mask: bytes.buffer
    }, [bytes.buffer]);
  } catch (error) {
    send(requestId, {
      type: "error",
      code: error?.code || "",
      message: error?.message || String(error)
    });
  }
});
