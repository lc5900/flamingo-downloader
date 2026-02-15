const UI_LOGS_STORAGE_KEY = "tarui.ui_logs";
const el = {
  logs: document.getElementById("logs"),
  btnRefresh: document.getElementById("btn-refresh"),
  btnClear: document.getElementById("btn-clear"),
  btnClose: document.getElementById("btn-close"),
};

function tauriCore() {
  const t = window.__TAURI__ || {};
  if (t.core && typeof t.core.invoke === "function") {
    return { invoke: t.core.invoke.bind(t.core) };
  }
  if (t.tauri && typeof t.tauri.invoke === "function") {
    return { invoke: t.tauri.invoke.bind(t.tauri) };
  }
  if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {
    return { invoke: window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__) };
  }
  return null;
}

async function invoke(cmd, args = {}) {
  const core = tauriCore();
  if (!core || typeof core.invoke !== "function") {
    throw new Error("Tauri invoke unavailable");
  }
  return core.invoke(cmd, args);
}

function hasActiveSelectionInLogs() {
  const sel = window.getSelection?.();
  if (!sel || sel.isCollapsed) return false;
  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  const inAnchor = !!(anchor && el.logs.contains(anchor));
  const inFocus = !!(focus && el.logs.contains(focus));
  return inAnchor || inFocus;
}

function readUiLogs() {
  try {
    const raw = window.localStorage.getItem(UI_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function refresh(force = false) {
  if (!force && hasActiveSelectionInLogs()) {
    return;
  }
  const uiLogs = readUiLogs();
  const backend = await invoke("list_operation_logs", { limit: 400 });
  const backendLines = backend.map((l) => {
    const ts = Number(l.ts || 0);
    const dt = ts > 0 ? new Date(ts * 1000).toLocaleString() : "-";
    return `[${dt}] ${l.action}: ${l.message}`;
  });

  const lines = [
    "[UI]",
    ...uiLogs,
    "",
    "[Backend]",
    ...backendLines,
  ];
  const nextText = lines.length > 4 ? lines.join("\n") : "(no logs yet)";
  if (el.logs.textContent !== nextText) {
    el.logs.textContent = nextText;
  }
}

async function clearLogs() {
  try {
    window.localStorage.setItem(UI_LOGS_STORAGE_KEY, JSON.stringify([]));
  } catch (_) {}
  await invoke("clear_operation_logs");
  await refresh(true);
}

async function closeWindow() {
  try {
    await invoke("close_logs_window");
    return;
  } catch (_) {}

  const winApi = window.__TAURI__?.window;
  const cw = winApi?.getCurrentWindow?.() || winApi?.appWindow;
  if (cw && typeof cw.close === "function") {
    await cw.close();
    return;
  }
  window.close();
}

if (!el.logs || !el.btnRefresh || !el.btnClear || !el.btnClose) {
  throw new Error("logs window init failed: missing required elements");
}

el.btnRefresh.onclick = () => refresh(true).catch((e) => {
  el.logs.textContent = e?.message || String(e);
});
el.btnClear.onclick = () => clearLogs().catch((e) => {
  el.logs.textContent = e?.message || String(e);
});
el.btnClose.onclick = () => closeWindow().catch(() => {});

refresh(true).catch((e) => {
  el.logs.textContent = e?.message || String(e);
});
setInterval(() => {
  refresh().catch(() => {});
}, 1000);

window.addEventListener("focus", () => {
  refresh(true).catch(() => {});
});

window.addEventListener("storage", (event) => {
  if (!event.key || event.key === UI_LOGS_STORAGE_KEY) {
    refresh().catch(() => {});
  }
});
