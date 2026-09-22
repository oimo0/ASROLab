import { AutoModel, AutoProcessor, RawImage, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;

const MODELS = {
  high: {
    id: "jiabins0303/birefnet-lite-1024-webgpu",
    size: 1024
  },
  standard: {
    id: "studioludens/birefnet-lite-512",
    size: 512
  }
};

let model = null;
let processor = null;
let activeKey = "";

function send(requestId, payload, transfer) {
  self.postMessage({ requestId, ...payload }, transfer || []);
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

async function disposeCurrent() {
  if (model && typeof model.dispose === "function") {
    try { await model.dispose(); } catch (_) {}
  }
  model = null;
  processor = null;
  activeKey = "";
}

async function ensureModel(requestId, tier, webgpu) {
  const config = MODELS[tier];
  if (!config) throw new Error("Unknown quality tier.");
  if (tier === "high" && !webgpu) {
    const error = new Error("最高品質モードにはWebGPUが必要です。");
    error.code = "WEBGPU_REQUIRED";
    throw error;
  }

  const key = tier + ":" + (webgpu ? "webgpu" : "wasm");
  if (model && processor && activeKey === key) return config;

  await disposeCurrent();
  send(requestId, {
    type: "status",
    phase: "loading",
    title: tier === "high" ? "高品質AIを準備しています" : "AIを準備しています",
    detail: "初回はモデルを端末へ読み込みます"
  });

  const progress_callback = progressReporter(requestId);
  const options = tier === "high"
    ? {
        device: "webgpu",
        dtype: "fp32",
        model_file_name: "model_fp16",
        progress_callback
      }
    : {
        device: webgpu ? "webgpu" : "wasm",
        dtype: webgpu ? "fp16" : "fp32",
        progress_callback
      };

  model = await AutoModel.from_pretrained(config.id, options);
  processor = await AutoProcessor.from_pretrained(config.id, { progress_callback });
  activeKey = key;
  return config;
}

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type !== "process") return;

  const requestId = data.requestId;
  try {
    const config = await ensureModel(requestId, data.tier, Boolean(data.webgpu));

    send(requestId, {
      type: "status",
      phase: "running",
      title: "背景を解析しています",
      detail: config.size + "px AIで輪郭を抽出中"
    });

    const image = await RawImage.read(data.file);
    const inputs = await processor(image);
    const outputs = await model({ input_image: inputs.pixel_values });
    const logits = outputs.logits || outputs.output_image || outputs[Object.keys(outputs)[0]];

    if (!logits) throw new Error("AIの出力マスクを取得できませんでした。");

    const tensor = logits[0].sigmoid().mul(255).to("uint8");
    const maskImage = RawImage.fromTensor(tensor);
    const bytes = Uint8Array.from(maskImage.data);

    send(requestId, {
      type: "result",
      tier: data.tier,
      maskWidth: maskImage.width,
      maskHeight: maskImage.height,
      mask: bytes.buffer
    }, [bytes.buffer]);
  } catch (error) {
    send(requestId, {
      type: "error",
      code: error && error.code ? error.code : "",
      message: error && error.message ? error.message : String(error)
    });
  }
});
