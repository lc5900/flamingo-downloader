const el = {
  enabled: document.getElementById('enabled'),
  useNativeMessaging: document.getElementById('useNativeMessaging'),
  autoIntercept: document.getElementById('autoIntercept'),
  sniffMediaEnabled: document.getElementById('sniffMediaEnabled'),
  interceptAllowlist: document.getElementById('interceptAllowlist'),
  nativeHost: document.getElementById('nativeHost'),
  endpoint: document.getElementById('endpoint'),
  token: document.getElementById('token'),
  save: document.getElementById('save'),
  refreshState: document.getElementById('refreshState'),
  status: document.getElementById('status'),
  activity: document.getElementById('activity'),
  refreshMedia: document.getElementById('refreshMedia'),
  clearMedia: document.getElementById('clearMedia'),
  mediaList: document.getElementById('mediaList'),
};

const ext = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULTS = {
  enabled: true,
  useNativeMessaging: false,
  autoIntercept: false,
  sniffMediaEnabled: true,
  interceptAllowlist: '',
  nativeHost: 'com.lc5900.flamingo.bridge',
  endpoint: 'http://127.0.0.1:16789/add',
  token: '',
};

async function load() {
  const saved = await ext.storage.sync.get([
    'enabled',
    'useNativeMessaging',
    'autoIntercept',
    'sniffMediaEnabled',
    'interceptAllowlist',
    'nativeHost',
    'endpoint',
    'token',
  ]);
  el.enabled.checked = typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULTS.enabled;
  el.useNativeMessaging.checked =
    typeof saved.useNativeMessaging === 'boolean' ? saved.useNativeMessaging : DEFAULTS.useNativeMessaging;
  el.autoIntercept.checked =
    typeof saved.autoIntercept === 'boolean' ? saved.autoIntercept : DEFAULTS.autoIntercept;
  el.sniffMediaEnabled.checked =
    typeof saved.sniffMediaEnabled === 'boolean' ? saved.sniffMediaEnabled : DEFAULTS.sniffMediaEnabled;
  el.interceptAllowlist.value = String(saved.interceptAllowlist || DEFAULTS.interceptAllowlist);
  el.nativeHost.value = String(saved.nativeHost || DEFAULTS.nativeHost);
  el.endpoint.value = String(saved.endpoint || DEFAULTS.endpoint);
  el.token.value = String(saved.token || DEFAULTS.token);
  await loadActivity();
  await loadMedia();
}

async function loadActivity() {
  const local = await ext.storage.local.get([
    'lastBridgeError',
    'lastBridgeSuccess',
    'lastBridgeSkip',
    'lastBridgeActivityAt',
  ]);
  const lastAt = local.lastBridgeActivityAt ? new Date(Number(local.lastBridgeActivityAt)).toLocaleString() : '-';
  const success = String(local.lastBridgeSuccess || '-');
  const skipped = String(local.lastBridgeSkip || '-');
  const error = String(local.lastBridgeError || '-');
  el.activity.textContent = `Last Activity: ${lastAt}\nLast Success: ${success}\nLast Skipped: ${skipped}\nLast Error: ${error}`;
}

async function save() {
  await ext.storage.sync.set({
    enabled: !!el.enabled.checked,
    useNativeMessaging: !!el.useNativeMessaging.checked,
    autoIntercept: !!el.autoIntercept.checked,
    sniffMediaEnabled: !!el.sniffMediaEnabled.checked,
    interceptAllowlist: String(el.interceptAllowlist.value || '').trim(),
    nativeHost: String(el.nativeHost.value || DEFAULTS.nativeHost).trim(),
    endpoint: String(el.endpoint.value || DEFAULTS.endpoint).trim(),
    token: String(el.token.value || '').trim(),
  });
  el.status.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
}

function esc(input) {
  return String(input || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

async function sendMedia(url) {
  const response = await ext.runtime.sendMessage({ action: 'send_media_candidate', url });
  if (!response?.ok) {
    throw new Error(String(response?.error || response?.reason || 'send failed'));
  }
  el.status.textContent = `Sent media URL at ${new Date().toLocaleTimeString()}`;
}

async function loadMedia() {
  try {
    const response = await ext.runtime.sendMessage({ action: 'list_media_candidates' });
    const items = Array.isArray(response?.items) ? response.items : [];
    if (items.length === 0) {
      el.mediaList.innerHTML = '<div style=\"color:#6b7280;font-size:12px\">No media candidates detected yet.</div>';
      return;
    }
    el.mediaList.innerHTML = items
      .slice(0, 80)
      .map((item, idx) => {
        const url = String(item?.url || '');
        return `
<div style=\"border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-top:8px\">
  <div style=\"font-size:12px;color:#6b7280\">#${idx + 1} | ${esc(item?.reason)} | hits ${Number(item?.hits || 0)} | ${esc(fmtTime(item?.lastSeenAt))}</div>
  <div style=\"font-size:12px;word-break:break-all;margin:6px 0\">${esc(url)}</div>
  <div style=\"display:flex;gap:8px;align-items:center\">
    <button class=\"send-media\" data-url=\"${encodeURIComponent(url)}\" type=\"button\">Send to Flamingo</button>
    <span style=\"font-size:11px;color:#6b7280\">${esc(item?.contentType || '-')}</span>
  </div>
</div>`;
      })
      .join('');
    el.mediaList.querySelectorAll('.send-media').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = decodeURIComponent(String(btn.getAttribute('data-url') || ''));
        sendMedia(target).catch((e) => {
          el.status.textContent = String(e?.message || e);
        });
      });
    });
  } catch (e) {
    el.status.textContent = String(e?.message || e);
  }
}

el.save.addEventListener('click', () => {
  save().catch((e) => {
    el.status.textContent = String(e?.message || e);
  });
});

el.refreshState.addEventListener('click', () => {
  loadActivity().catch((e) => {
    el.status.textContent = String(e?.message || e);
  });
});

el.refreshMedia.addEventListener('click', () => {
  loadMedia().catch((e) => {
    el.status.textContent = String(e?.message || e);
  });
});

el.clearMedia.addEventListener('click', () => {
  ext.runtime
    .sendMessage({ action: 'clear_media_candidates' })
    .then(() => loadMedia())
    .catch((e) => {
      el.status.textContent = String(e?.message || e);
    });
});

load().catch((e) => {
  el.status.textContent = String(e?.message || e);
});
