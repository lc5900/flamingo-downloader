const DEFAULTS = {
  enabled: true,
  useNativeMessaging: false,
  autoIntercept: false,
  sniffMediaEnabled: true,
  interceptAllowlist: "",
  nativeHost: "com.lc5900.flamingo.bridge",
  endpoint: "http://127.0.0.1:16789/add",
  token: "",
};
const MAX_MEDIA_CANDIDATES = 200;
const MEDIA_EXT_RE = /\.(mp4|webm|mkv|mov|m4v|avi|flv|ts|m3u8|mpd)([?#].*)?$/i;
const MEDIA_MIME_RE =
  /^(video\/|application\/vnd\.apple\.mpegurl|application\/x-mpegurl|application\/dash\+xml)/i;

const ext = typeof browser !== "undefined" ? browser : chrome;

async function getConfig() {
  const saved = await ext.storage.sync.get([
    "enabled",
    "useNativeMessaging",
    "autoIntercept",
    "sniffMediaEnabled",
    "interceptAllowlist",
    "nativeHost",
    "endpoint",
    "token",
  ]);
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULTS.enabled,
    useNativeMessaging:
      typeof saved.useNativeMessaging === "boolean"
        ? saved.useNativeMessaging
        : DEFAULTS.useNativeMessaging,
    autoIntercept:
      typeof saved.autoIntercept === "boolean" ? saved.autoIntercept : DEFAULTS.autoIntercept,
    sniffMediaEnabled:
      typeof saved.sniffMediaEnabled === "boolean"
        ? saved.sniffMediaEnabled
        : DEFAULTS.sniffMediaEnabled,
    interceptAllowlist: String(saved.interceptAllowlist || DEFAULTS.interceptAllowlist),
    nativeHost: String(saved.nativeHost || DEFAULTS.nativeHost),
    endpoint: String(saved.endpoint || DEFAULTS.endpoint),
    token: String(saved.token || DEFAULTS.token),
  };
}

function parseAllowlist(raw) {
  return String(raw || "")
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function hostAllowed(url, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  try {
    const host = String(new URL(url).hostname || "").toLowerCase();
    if (!host) return false;
    return rules.some((rule) => host === rule || host.endsWith(`.${rule}`));
  } catch {
    return false;
  }
}

function readHeader(headers, name) {
  if (!Array.isArray(headers)) return "";
  const target = String(name || "").toLowerCase();
  const row = headers.find((header) => String(header?.name || "").toLowerCase() === target);
  return String(row?.value || "").trim();
}

function detectMediaReason(url, contentType) {
  const normalizedUrl = String(url || "");
  const normalizedType = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (MEDIA_EXT_RE.test(normalizedUrl)) return "extension";
  if (MEDIA_MIME_RE.test(normalizedType)) return "content-type";
  return "";
}

async function upsertMediaCandidate(item) {
  const local = await ext.storage.local.get(["mediaCandidates"]);
  const list = Array.isArray(local.mediaCandidates) ? local.mediaCandidates.slice() : [];
  const key = String(item.url || "").trim();
  if (!key) return;

  const idx = list.findIndex((row) => String(row?.url || "") === key);
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      ...item,
      hits: Number(prev?.hits || 1) + 1,
      lastSeenAt: Date.now(),
    };
  } else {
    list.unshift({
      ...item,
      hits: 1,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  }

  list.sort((a, b) => Number(b?.lastSeenAt || 0) - Number(a?.lastSeenAt || 0));
  await ext.storage.local.set({ mediaCandidates: list.slice(0, MAX_MEDIA_CANDIDATES) });
}

async function maybeCaptureMedia(details) {
  try {
    const cfg = await getConfig();
    if (!cfg.sniffMediaEnabled) return;
    const url = String(details?.url || "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) return;
    const contentType = readHeader(details?.responseHeaders, "content-type");
    const reason = detectMediaReason(url, contentType);
    if (!reason) return;
    await upsertMediaCandidate({
      url,
      pageUrl: String(details?.documentUrl || details?.initiator || ""),
      tabId: Number.isFinite(details?.tabId) ? details.tabId : -1,
      contentType,
      reason,
      statusCode: Number(details?.statusCode || 0),
      method: String(details?.method || "GET"),
    });
  } catch (e) {
    await setBridgeActivity({
      lastBridgeError: `sniffer capture failed: ${String(e?.message || e || "unknown error")}`,
    });
  }
}

async function sendViaNativeMessaging(host, payload) {
  return ext.runtime.sendNativeMessage(host, payload);
}

async function sendToFlamingo(url, saveDir = null) {
  const cfg = await getConfig();
  if (!cfg.enabled) return { ok: false, skipped: true, reason: "bridge_disabled" };

  const body = { url };
  if (saveDir && typeof saveDir === "string") body.save_dir = saveDir;

  if (cfg.useNativeMessaging) {
    if (!cfg.nativeHost) {
      return { ok: false, skipped: true, reason: "native_host_missing" };
    }
    try {
      const res = await sendViaNativeMessaging(cfg.nativeHost, body);
      return res && typeof res === "object" ? res : { ok: true };
    } catch (e) {
      throw new Error(`native messaging failed: ${String(e?.message || e)}`.slice(0, 400));
    }
  }

  if (!cfg.token) return { ok: false, skipped: true, reason: "bridge_token_missing" };
  const resp = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Token": cfg.token,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`bridge request failed: ${resp.status} ${text}`.slice(0, 400));
  }
  return resp.json();
}

async function setBridgeActivity(entry) {
  const payload = {
    lastBridgeActivityAt: Date.now(),
    ...entry,
  };
  await ext.storage.local.set(payload);
}

async function getQuickState() {
  const cfg = await getConfig();
  const local = await ext.storage.local.get([
    "lastBridgeError",
    "lastBridgeSuccess",
    "lastBridgeSkip",
    "lastBridgeActivityAt",
    "mediaCandidates",
  ]);
  const mediaCandidates = Array.isArray(local.mediaCandidates) ? local.mediaCandidates : [];
  return {
    enabled: !!cfg.enabled,
    sniffMediaEnabled: !!cfg.sniffMediaEnabled,
    autoIntercept: !!cfg.autoIntercept,
    mediaCount: mediaCandidates.length,
    lastBridgeError: String(local.lastBridgeError || ""),
    lastBridgeSuccess: String(local.lastBridgeSuccess || ""),
    lastBridgeSkip: String(local.lastBridgeSkip || ""),
    lastBridgeActivityAt: Number(local.lastBridgeActivityAt || 0),
  };
}

async function maybeTakeOver(downloadItem) {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) {
      await setBridgeActivity({ lastBridgeSkip: "skip: bridge disabled" });
      return;
    }
    if (!cfg.autoIntercept) {
      await setBridgeActivity({ lastBridgeSkip: "skip: auto intercept disabled" });
      return;
    }
    if (!downloadItem || !downloadItem.url) {
      await setBridgeActivity({ lastBridgeSkip: "skip: missing download url" });
      return;
    }
    const url = String(downloadItem.url);
    if (!(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("magnet:?"))) {
      await setBridgeActivity({ lastBridgeSkip: `skip: unsupported scheme for ${url}` });
      return;
    }
    if ((url.startsWith("http://") || url.startsWith("https://")) && !hostAllowed(url, parseAllowlist(cfg.interceptAllowlist))) {
      await setBridgeActivity({ lastBridgeSkip: `skip: host not in allowlist (${url})` });
      return;
    }
    const result = await sendToFlamingo(url, null);
    if (result && result.ok) {
      await ext.downloads.cancel(downloadItem.id).catch(() => {});
      await ext.downloads.erase({ id: downloadItem.id }).catch(() => {});
      await setBridgeActivity({ lastBridgeSuccess: `auto intercept ok: ${url}` });
    } else {
      await setBridgeActivity({
        lastBridgeSkip: `skip: ${String(result?.reason || result?.error || "unknown reason")} (${url})`,
      });
    }
  } catch (e) {
    console.error("Flamingo bridge takeover failed", e);
    await setBridgeActivity({ lastBridgeError: String(e?.message || e || "unknown error") });
  }
}

ext.runtime.onInstalled.addListener(async () => {
  const saved = await ext.storage.sync.get([
    "enabled",
    "useNativeMessaging",
    "autoIntercept",
    "sniffMediaEnabled",
    "interceptAllowlist",
    "nativeHost",
    "endpoint",
    "token",
  ]);
  await ext.storage.sync.set({
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULTS.enabled,
    useNativeMessaging:
      typeof saved.useNativeMessaging === "boolean"
        ? saved.useNativeMessaging
        : DEFAULTS.useNativeMessaging,
    autoIntercept:
      typeof saved.autoIntercept === "boolean" ? saved.autoIntercept : DEFAULTS.autoIntercept,
    sniffMediaEnabled:
      typeof saved.sniffMediaEnabled === "boolean"
        ? saved.sniffMediaEnabled
        : DEFAULTS.sniffMediaEnabled,
    interceptAllowlist: String(saved.interceptAllowlist || DEFAULTS.interceptAllowlist),
    nativeHost: String(saved.nativeHost || DEFAULTS.nativeHost),
    endpoint: String(saved.endpoint || DEFAULTS.endpoint),
    token: String(saved.token || DEFAULTS.token),
  });
  ext.contextMenus.create({
    id: "flamingo-download-link",
    title: "Download with Flamingo",
    contexts: ["link"],
  });
  ext.contextMenus.create({
    id: "flamingo-download-page",
    title: "Download Page URL with Flamingo",
    contexts: ["page"],
  });
});

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = String(message?.action || "");
  if (action === "list_media_candidates") {
    ext.storage.local
      .get(["mediaCandidates"])
      .then((local) => {
        const items = Array.isArray(local.mediaCandidates) ? local.mediaCandidates : [];
        sendResponse({ ok: true, items });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (action === "clear_media_candidates") {
    ext.storage.local
      .set({ mediaCandidates: [] })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (action === "send_media_candidate") {
    const url = String(message?.url || "").trim();
    const saveDir = message?.saveDir ? String(message.saveDir) : null;
    sendToFlamingo(url, saveDir)
      .then((result) => sendResponse(result && typeof result === "object" ? result : { ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (action === "get_quick_state") {
    getQuickState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (action === "set_quick_flags") {
    const patch = {};
    if (typeof message?.enabled === "boolean") patch.enabled = !!message.enabled;
    if (typeof message?.sniffMediaEnabled === "boolean")
      patch.sniffMediaEnabled = !!message.sniffMediaEnabled;
    if (typeof message?.autoIntercept === "boolean") patch.autoIntercept = !!message.autoIntercept;
    ext.storage.sync
      .set(patch)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  return false;
});

ext.contextMenus.onClicked.addListener(async (info) => {
  const targetUrl =
    info.menuItemId === "flamingo-download-link"
      ? info.linkUrl
      : info.menuItemId === "flamingo-download-page"
        ? info.pageUrl
        : null;
  if (!targetUrl) return;
  try {
    await sendToFlamingo(targetUrl, null);
    await setBridgeActivity({ lastBridgeSuccess: `context menu ok: ${targetUrl}` });
  } catch (e) {
    console.error("Flamingo context menu send failed", e);
    await setBridgeActivity({ lastBridgeError: String(e?.message || e || "unknown error") });
  }
});

ext.downloads.onCreated.addListener((downloadItem) => {
  maybeTakeOver(downloadItem);
});

if (ext.webRequest?.onHeadersReceived) {
  ext.webRequest.onHeadersReceived.addListener(
    (details) => {
      void maybeCaptureMedia(details);
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"],
  );
}
