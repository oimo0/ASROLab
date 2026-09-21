class LabHeader extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    const name = this.getAttribute('tool-name') || document.title.split('|')[0].trim() || 'Experiment';
    root.innerHTML = `
      <style>
        :host{display:block;position:sticky;top:0;z-index:999;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}
        *{box-sizing:border-box}.bar{height:62px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 max(14px,env(safe-area-inset-left));border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);background:color-mix(in srgb,Canvas 76%,transparent);color:CanvasText;backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%)}
        a{display:inline-flex;align-items:center;gap:9px;min-height:40px;color:inherit;text-decoration:none;font-weight:750}.back{padding:0 10px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;background:color-mix(in srgb,Canvas 70%,transparent)}.dot{width:8px;height:8px;border-radius:50%;background:#718fff;box-shadow:0 0 12px #718fff}.name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:color-mix(in srgb,currentColor 64%,transparent);font-size:.78rem}.lab{font:800 .65rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}@media(max-width:520px){.name{display:none}}
      </style>
      <div class="bar">
        <a class="back" href="../../" aria-label="ASRO Labへ戻る"><span aria-hidden="true">←</span><span class="lab">ASRO LAB</span></a>
        <span class="name">${name.replace(/[<>&"']/g, '')}</span>
        <a href="../../#catalog" aria-label="Lab shelfへ戻る"><span class="dot" aria-hidden="true"></span><span class="lab">INDEX</span></a>
      </div>`;
  }
}
customElements.define('lab-header', LabHeader);
