const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const fileInput = $("#file-input");
const dropZone = $("[data-drop-zone]");
const workspace = $("[data-workspace]");
const preview = $("[data-preview]");
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
const edgeField = $("[data-edge-field]");
const runButton = $("[data-run]");
const runLabel = $("[data-run-label]");
const downloadButton = $("[data-download]");
const deviceTitle = $("[data-device-title]");
const deviceDetail = $("[data-device-detail]");
const resultState = $("[data-result-state]");
const viewSwitch = $("[data-view-switch]");
const previewToolbar = $("[data-preview-toolbar]");
const bgSwitch = $("[data-bg-switch]");
const controlActions = $(".control-actions");
const pickButtons = $$("[data-pick], [data-change-image]");

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
  mobile: false,
  busy: false,
  view: "original"
};

let worker = null;
const pending = new Map();
let edgeTimer = 0;

function clearTaskTimer(task) {
  if (task?.timer) clearTimeout(task.timer);
}

function armTaskTimer(requestId) {
  const task = pending.get(requestId);
  if (!task) return;
  clearTaskTimer(task);
  task.timer = setTimeout(() => {
    pending.delete(requestId);
    try { worker?.terminate(); } catch (_) {}
    worker = null;
    task.reject(new Error("AI処理が停止したため中断しました。もう一度試してね。"));
  }, 180000);
}

function ensureWorker() {
  if (worker) return worker;

  worker = new Worker("./worker.js?v=5", { type: "module" });

  worker.addEventListener("message", (event) => {
    const data = event.data || {};
    const task = pending.get(data.requestId);
    if (!task) return;

    armTaskTimer(data.requestId);

    if (data.type === "progress") {
      if (Number.isFinite(data.progress)) {
        const p = Math.max(3, Math.min(100, data.progress));
        progressBar.style.width = p + "%";
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
      clearTaskTimer(task);
      task.resolve(data);
      return;
    }

    if (data.type === "error") {
      pending.delete(data.requestId);
      clearTaskTimer(task);
      const error = new Error(data.message || "AI処理に失敗しました。");
      error.code = data.code || "";
      task.reject(error);
    }
  });

  worker.addEventListener("error", (event) => {
    for (const [, task] of pending) {
      clearTaskTimer(task);
      task.reject(new Error(event.message || "AIの起動に失敗しました。"));
    }
    pending.clear();
    try { worker?.terminate(); } catch (_) {}
    worker = null;
  });

  return worker;
}

function workerProcess(payload) {
  return new Promise((resolve, reject) => {
    const activeWorker = ensureWorker();
    const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    pending.set(requestId, { resolve, reject, timer: 0 });
    armTaskTimer(requestId);
    activeWorker.postMessage({ type: "process", requestId, ...payload });
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
  node._timer = setTimeout(() => node.classList.remove("show"), 2300);
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

function shortName(name, max = 28) {
  if (!name || name.length <= max) return name || "画像";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.slice(0, Math.max(10, max - ext.length - 1)) + "…" + ext;
}

async function detectDevice() {
  state.mobile = Boolean(
    navigator.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    matchMedia("(pointer: coarse) and (max-width: 900px)").matches
  );

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

  if (state.webgpu) {
    deviceTitle.textContent = "RMBG-1.4 · WebGPU";
    deviceDetail.textContent = "背景除去AIを端末GPUで実行します";
  } else {
    deviceTitle.textContent = "RMBG-1.4 · CPU";
    deviceDetail.textContent = "背景除去AIを端末内CPUで実行します";
  }

  updateQualityNote();
}

function updateQualityNote() {
  qualityNote.textContent = state.webgpu
    ? "BRIA RMBG-1.4をWebGPUで実行します。"
    : "BRIA RMBG-1.4をCPUで実行します。";
}

function resetResultUI() {
  state.mask = null;
  state.maskWidth = 0;
  state.maskHeight = 0;
  state.tier = "";

  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = "";

  previewToolbar.hidden = true;
  viewSwitch.hidden = true;
  bgSwitch.hidden = true;
  edgeField.hidden = true;
  downloadButton.hidden = true;
  controlActions.classList.remove("has-result");
  resultState.textContent = "元画像";
  engine.textContent = "未処理";
  runLabel.textContent = "背景を透明化";
  setView("original");
}

function setBusy(value) {
  state.busy = value;
  runButton.disabled = value || !state.file;
  quality.disabled = value;
  fileInput.disabled = value;
  pickButtons.forEach((button) => { button.disabled = value; });
  processing.hidden = !value;
  document.body.classList.toggle("is-busy", value);

  if (value) {
    resultState.textContent = "処理中";
    progressBar.style.width = "4%";
    statusTitle.textContent = "AIを準備しています";
    statusDetail.textContent = "端末内で処理を開始します";
  } else if (state.resultUrl) {
    resultState.textContent = "透過済み";
  } else {
    resultState.textContent = "元画像";
  }
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
  state.file = file;
  state.originalUrl = URL.createObjectURL(file);
  resetResultUI();

  preview.src = state.originalUrl;
  preview.alt = file.name + " のプレビュー";
  workspace.hidden = false;
  dropZone.hidden = true;
  document.body.classList.add("is-editing");

  try {
    await preview.decode();
    state.width = preview.naturalWidth;
    state.height = preview.naturalHeight;
    fileName.textContent = shortName(file.name);
    fileName.title = file.name;
    resolution.textContent = state.width + " × " + state.height;
    runButton.disabled = false;
    toast("画像を読み込んだよ");
  } catch (_) {
    toast("この画像は読み込めなかった");
  }
}

function setView(view) {
  if (view === "result" && !state.resultUrl) view = "original";
  state.view = view;

  $$("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  preview.src = view === "result" && state.resultUrl ? state.resultUrl : state.originalUrl;
}

function alphaWithEdge(value) {
  let x = value / 255;

  // RMBG-1.4 already returns a foreground matte. Keep the original alpha
  // by default and only apply a small user-controlled edge contrast.
  const amount = (Number(edge.value) - 50) / 50;
  const contrast = amount >= 0 ? 1 + amount * 1.2 : 1 + amount * 0.18;
  x = (x - 0.5) * contrast + 0.5;

  if (x < 0.01) x = 0;
  if (x > 0.99) x = 1;

  return Math.round(Math.max(0, Math.min(1, x)) * 255);
}

async function loadImage(url) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

async function composeResult() {
  if (!state.file || !state.mask) return;

  const source = await loadImage(state.originalUrl);
  const canvas = document.createElement("canvas");
  canvas.width = state.width;
  canvas.height = state.height;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("画像の合成を開始できませんでした。");
  ctx.drawImage(source, 0, 0, state.width, state.height);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = state.maskWidth;
  maskCanvas.height = state.maskHeight;
  const maskCtx = maskCanvas.getContext("2d", { alpha: true });
  if (!maskCtx) throw new Error("マスクを作成できませんでした。");

  const imageData = maskCtx.createImageData(state.maskWidth, state.maskHeight);

  let min = 255;
  let max = 0;
  for (let i = 0; i < state.mask.length; i += Math.max(1, Math.floor(state.mask.length / 4096))) {
    const v = state.mask[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 8) {
    throw new Error("被写体を認識できませんでした。別の画像を試してね。");
  }

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
  if (!blob) throw new Error("透過PNGを生成できませんでした。");

  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);

  previewToolbar.hidden = false;
  viewSwitch.hidden = false;
  bgSwitch.hidden = false;
  edgeField.hidden = false;
  downloadButton.hidden = false;
  controlActions.classList.add("has-result");
  setView("result");
}

async function processImage() {
  if (!state.file || state.busy) return;

  setBusy(true);
  runLabel.textContent = "処理中…";

  try {
    const result = await workerProcess({
      file: state.file,
      webgpu: state.webgpu
    });

    state.mask = new Uint8Array(result.mask);
    state.maskWidth = result.maskWidth;
    state.maskHeight = result.maskHeight;
    state.tier = "rmbg";

    statusTitle.textContent = "仕上げています";
    statusDetail.textContent = "透過PNGを作成中";
    progressBar.style.width = "100%";

    await composeResult();

    engine.textContent = "RMBG-1.4 · " + (result.device === "webgpu" ? "WebGPU" : "CPU");
    runLabel.textContent = "AIで再処理";
    toast("できた！");
  } catch (error) {
    console.error(error);
    setView("original");
    engine.textContent = "エラー";
    runLabel.textContent = "もう一度試す";
    toast(error?.message || "処理に失敗しました");
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
  toast("透過PNGの保存を開始しました ✓");
}

pickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (state.busy) return;
    fileInput.value = "";
    fileInput.click();
  });
});

fileInput.addEventListener("change", () => selectFile(fileInput.files?.[0]));
runButton.addEventListener("click", processImage);
downloadButton.addEventListener("click", downloadResult);
quality.addEventListener("change", updateQualityNote);

edge.addEventListener("input", () => {
  edgeValue.textContent = edgeLabel(edge.value);
  if (!state.mask || state.busy) return;

  clearTimeout(edgeTimer);
  resultState.textContent = "輪郭を調整中";
  edgeTimer = setTimeout(async () => {
    try {
      await composeResult();
      resultState.textContent = "透過済み";
    } catch (error) {
      console.error(error);
      resultState.textContent = "透過済み";
      toast("輪郭調整に失敗しました");
    }
  }, 180);
});

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$$("[data-bg-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    document.documentElement.dataset.bg = button.dataset.bgChoice;
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
  selectFile(event.dataTransfer?.files?.[0]);
});

window.addEventListener("paste", (event) => {
  const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"));
  if (imageItem) selectFile(imageItem.getAsFile());
});

window.addEventListener("beforeunload", () => {
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  for (const [, task] of pending) clearTaskTimer(task);
  try { worker?.terminate(); } catch (_) {}
});

edgeValue.textContent = edgeLabel(edge.value);
detectDevice();
