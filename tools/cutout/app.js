const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const fileInput = $("#file-input");
const dropZone = $("[data-drop-zone]");
const workspace = $("[data-workspace]");
const pickButtons = $$("[data-pick], [data-new-image]");
const preview = $("[data-preview]");
const stageEmpty = $("[data-stage-empty]");
const processing = $("[data-processing]");
const statusTitle = $("[data-status-title]");
const statusDetail = $("[data-status-detail]");
const progressBar = $("[data-progress]");
const fileName = $("[data-file-name]");
const resolution = $("[data-resolution]");
const engine = $("[data-engine]");
const quality = $("[data-quality]");
const qualityNote = $("[data-quality-note]");
const edge = $("[data-edge]");
const edgeValue = $("[data-edge-value]");
const runButton = $("[data-run]");
const runLabel = $("[data-run-label]");
const downloadButton = $("[data-download]");
const deviceTitle = $("[data-device-title]");
const deviceDetail = $("[data-device-detail]");

const state = {
  file: null,
  originalUrl: "",
  resultUrl: "",
  width: 0,
  height: 0,
  mask: null,
  maskWidth: 0,
  maskHeight: 0,
  tier: "",
  webgpu: false,
  highCapable: false,
  busy: false,
  view: "result"
};

const worker = new Worker("./worker.js?v=1", { type: "module" });
const pending = new Map();

worker.addEventListener("message", (event) => {
  const data = event.data || {};
  const task = pending.get(data.requestId);
  if (!task) return;

  if (data.type === "progress") {
    if (Number.isFinite(data.progress)) {
      progressBar.style.width = Math.max(3, Math.min(100, data.progress)) + "%";
      statusDetail.textContent = "AIモデルを読み込み中 " + Math.round(data.progress) + "%";
    }
    return;
  }

  if (data.type === "status") {
    statusTitle.textContent = data.title || "処理中";
    statusDetail.textContent = data.detail || "";
    if (data.phase === "running") progressBar.style.width = "100%";
    return;
  }

  if (data.type === "result") {
    pending.delete(data.requestId);
    task.resolve(data);
    return;
  }

  if (data.type === "error") {
    pending.delete(data.requestId);
    const error = new Error(data.message || "AI処理に失敗しました。");
    error.code = data.code || "";
    task.reject(error);
  }
});

worker.addEventListener("error", (event) => {
  for (const [, task] of pending) task.reject(new Error(event.message || "AI worker error"));
  pending.clear();
});

function workerProcess(payload) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    pending.set(requestId, { resolve, reject });
    worker.postMessage({ type: "process", requestId, ...payload });
  });
}

function toast(message) {
  let node = $(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove("show"), 2400);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(value >= 10 || unit === 0 ? 0 : 1) + " " + units[unit];
}

async function detectDevice() {
  try {
    if (!("gpu" in navigator)) throw new Error("no webgpu");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("no adapter");
    state.webgpu = true;
    state.highCapable = Number(adapter.limits.maxStorageBuffersPerShaderStage || 0) >= 8;
  } catch (_) {
    state.webgpu = false;
    state.highCapable = false;
  }

  if (state.highCapable) {
    deviceTitle.textContent = "WebGPU 高品質対応";
    deviceDetail.textContent = "1024px BiRefNetを端末GPUで実行できます";
  } else if (state.webgpu) {
    deviceTitle.textContent = "WebGPU 対応";
    deviceDetail.textContent = "互換性優先の512px AIを端末GPUで実行します";
  } else {
    deviceTitle.textContent = "WASM モード";
    deviceDetail.textContent = "GPU非対応のためCPUで端末内処理します";
  }
  updateQualityNote();
}

function updateQualityNote() {
  const value = quality.value;
  if (value === "high") {
    qualityNote.textContent = state.highCapable
      ? "1024pxモデルで細い髪・毛・製品の輪郭を優先します。"
      : "この端末では最高品質モードを使えないため、実行時に標準へ切り替えます。";
  } else if (value === "standard") {
    qualityNote.textContent = "512pxモデル。軽くて幅広い端末で動作します。";
  } else {
    qualityNote.textContent = state.highCapable
      ? "この端末では1024px高品質モデルを自動選択します。"
      : "この端末では互換性の高い512pxモデルを自動選択します。";
  }
}

function resolveTier() {
  if (quality.value === "standard") return "standard";
  if (quality.value === "high") return state.highCapable ? "high" : "standard";
  return state.highCapable ? "high" : "standard";
}

function setBusy(value) {
  state.busy = value;
  runButton.disabled = value || !state.file;
  quality.disabled = value;
  fileInput.disabled = value;
  processing.hidden = !value;
  if (value) {
    progressBar.style.width = "4%";
    statusTitle.textContent = "AIを準備しています";
    statusDetail.textContent = "端末内で処理を開始します";
  }
}

async function loadImage(url) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

async function selectFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    toast("画像ファイルを選んでね");
    return;
  }

  if (file.size > 120 * 1024 * 1024) {
    toast("120MB以下の画像を使ってね");
    return;
  }

  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);

  state.file = file;
  state.originalUrl = URL.createObjectURL(file);
  state.resultUrl = "";
  state.mask = null;
  state.maskWidth = 0;
  state.maskHeight = 0;
  state.tier = "";
  downloadButton.disabled = true;

  preview.src = state.originalUrl;
  preview.alt = file.name + " のプレビュー";
  stageEmpty.hidden = true;
  workspace.hidden = false;
  dropZone.hidden = true;

  try {
    await preview.decode();
    state.width = preview.naturalWidth;
    state.height = preview.naturalHeight;
    fileName.textContent = file.name + (file.size ? " · " + formatBytes(file.size) : "");
    resolution.textContent = state.width + " × " + state.height;
    engine.textContent = "未処理";
    runButton.disabled = false;
    runLabel.textContent = "背景を透明化";
    setView("original");
    await processImage();
  } catch (_) {
    toast("この画像形式はブラウザで読み込めなかった");
  }
}

function setView(view) {
  state.view = view;
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "result" && state.resultUrl) {
    preview.src = state.resultUrl;
  } else if (state.originalUrl) {
    preview.src = state.originalUrl;
  }
}

function alphaWithEdge(value) {
  let x = value / 255;
  const amount = (Number(edge.value) - 50) / 50;
  const contrast = amount >= 0 ? 1 + amount * 1.55 : 1 + amount * 0.25;
  x = (x - 0.5) * contrast + 0.5;
  return Math.round(Math.max(0, Math.min(1, x)) * 255);
}

async function composeResult() {
  if (!state.file || !state.mask) return;

  const source = await loadImage(state.originalUrl);
  const canvas = document.createElement("canvas");
  canvas.width = state.width;
  canvas.height = state.height;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvasを作成できませんでした。");
  ctx.drawImage(source, 0, 0, state.width, state.height);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = state.maskWidth;
  maskCanvas.height = state.maskHeight;
  const maskCtx = maskCanvas.getContext("2d", { alpha: true });
  const imageData = maskCtx.createImageData(state.maskWidth, state.maskHeight);

  for (let i = 0, p = 0; i < state.mask.length; i += 1, p += 4) {
    const a = alphaWithEdge(state.mask[i]);
    imageData.data[p] = 255;
    imageData.data[p + 1] = 255;
    imageData.data[p + 2] = 255;
    imageData.data[p + 3] = a;
  }

  maskCtx.putImageData(imageData, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(maskCanvas, 0, 0, state.width, state.height);
  ctx.globalCompositeOperation = "source-over";

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNGの生成に失敗しました。");

  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);
  downloadButton.disabled = false;
  setView("result");
}

async function processImage() {
  if (!state.file || state.busy) return;

  let tier = resolveTier();
  if (quality.value === "high" && tier !== "high") {
    toast("この端末では標準AIへ自動切り替えするよ");
  }

  setBusy(true);
  runLabel.textContent = "処理中…";

  try {
    const result = await workerProcess({
      file: state.file,
      tier,
      webgpu: state.webgpu
    });

    state.mask = new Uint8Array(result.mask);
    state.maskWidth = result.maskWidth;
    state.maskHeight = result.maskHeight;
    state.tier = tier;

    statusTitle.textContent = "仕上げています";
    statusDetail.textContent = "元解像度へ高品質合成中";
    progressBar.style.width = "100%";

    await composeResult();

    engine.textContent = tier === "high"
      ? "BiRefNet · 1024 · WebGPU"
      : "BiRefNet · 512 · " + (state.webgpu ? "WebGPU" : "WASM");
    runLabel.textContent = "この設定で再処理";
    toast("背景を透明化したよ");
  } catch (error) {
    console.error(error);
    setView("original");
    engine.textContent = "処理エラー";
    toast(error && error.message ? error.message : "処理に失敗しました");
  } finally {
    setBusy(false);
  }
}

function edgeLabel(value) {
  const n = Number(value);
  if (n < 34) return "やわらか";
  if (n > 66) return "くっきり";
  return "自然";
}

function downloadResult() {
  if (!state.resultUrl || !state.file) return;
  const base = state.file.name.replace(/\.[^.]+$/, "") || "image";
  const a = document.createElement("a");
  a.href = state.resultUrl;
  a.download = base + "-cutout.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

pickButtons.forEach((button) => button.addEventListener("click", () => fileInput.click()));
fileInput.addEventListener("change", () => selectFile(fileInput.files && fileInput.files[0]));

runButton.addEventListener("click", processImage);
downloadButton.addEventListener("click", downloadResult);

quality.addEventListener("change", updateQualityNote);

edge.addEventListener("input", () => {
  edgeValue.textContent = edgeLabel(edge.value);
});
edge.addEventListener("change", async () => {
  if (!state.mask || state.busy) return;
  processing.hidden = false;
  statusTitle.textContent = "エッジを調整しています";
  statusDetail.textContent = "AIのマスクからPNGを再合成中";
  progressBar.style.width = "100%";
  try {
    await composeResult();
  } finally {
    processing.hidden = true;
  }
});

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$$("[data-bg-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.bgChoice;
    document.documentElement.dataset.bg = selected;
    $$("[data-bg-choice]").forEach((item) => item.classList.toggle("active", item === button));
  });
});

["dragenter", "dragover"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});
dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  selectFile(file);
});

window.addEventListener("paste", (event) => {
  const items = [...(event.clipboardData ? event.clipboardData.items : [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (imageItem) selectFile(imageItem.getAsFile());
});

window.addEventListener("beforeunload", () => {
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
});

edgeValue.textContent = edgeLabel(edge.value);
detectDevice();
