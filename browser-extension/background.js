const DEFAULTS = {
  enabled: false,
  autoIntercept: true,
  endpoint: "http://127.0.0.1:16789/add",
  token: "",
};

const ext = typeof browser !== "undefined" ? browser : chrome;

async function getConfig() {
  const saved = await ext.storage.sync.get(["enabled", "autoIntercept", "endpoint", "token"]);
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULTS.enabled,
    autoIntercept:
      typeof saved.autoIntercept === "boolean" ? saved.autoIntercept : DEFAULTS.autoIntercept,
    endpoint: String(saved.endpoint || DEFAULTS.endpoint),
    token: String(saved.token || DEFAULTS.token),
  };
}

async function sendToFlamingo(url, saveDir = null) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.token) return { ok: false, skipped: true, reason: "bridge_disabled_or_token_missing" };

  const body = { url };
  if (saveDir && typeof saveDir === "string") body.save_dir = saveDir;

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

async function maybeTakeOver(downloadItem) {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.autoIntercept) return;
    if (!downloadItem || !downloadItem.url) return;
    const url = String(downloadItem.url);
    if (!(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("magnet:?"))) {
      return;
    }
    const result = await sendToFlamingo(url, null);
    if (result && result.ok) {
      await ext.downloads.cancel(downloadItem.id).catch(() => {});
      await ext.downloads.erase({ id: downloadItem.id }).catch(() => {});
      await setBridgeActivity({ lastBridgeSuccess: `auto intercept ok: ${url}` });
    }
  } catch (e) {
    console.error("Flamingo bridge takeover failed", e);
    await setBridgeActivity({ lastBridgeError: String(e?.message || e || "unknown error") });
  }
}

ext.runtime.onInstalled.addListener(async () => {
  const saved = await ext.storage.sync.get(["enabled", "autoIntercept", "endpoint", "token"]);
  await ext.storage.sync.set({
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : DEFAULTS.enabled,
    autoIntercept:
      typeof saved.autoIntercept === "boolean" ? saved.autoIntercept : DEFAULTS.autoIntercept,
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
