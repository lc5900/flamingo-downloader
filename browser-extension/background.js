const DEFAULTS = {
  enabled: false,
  useNativeMessaging: false,
  autoIntercept: true,
  nativeHost: "com.lc5900.flamingo.bridge",
  endpoint: "http://127.0.0.1:16789/add",
  token: "",
};

const ext = typeof browser !== "undefined" ? browser : chrome;

async function getConfig() {
  const saved = await ext.storage.sync.get([
    "enabled",
    "useNativeMessaging",
    "autoIntercept",
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
    nativeHost: String(saved.nativeHost || DEFAULTS.nativeHost),
    endpoint: String(saved.endpoint || DEFAULTS.endpoint),
    token: String(saved.token || DEFAULTS.token),
  };
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
  const saved = await ext.storage.sync.get([
    "enabled",
    "useNativeMessaging",
    "autoIntercept",
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
