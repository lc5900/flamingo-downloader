const el = {
  enabled: document.getElementById('enabled'),
  useNativeMessaging: document.getElementById('useNativeMessaging'),
  autoIntercept: document.getElementById('autoIntercept'),
  interceptAllowlist: document.getElementById('interceptAllowlist'),
  nativeHost: document.getElementById('nativeHost'),
  endpoint: document.getElementById('endpoint'),
  token: document.getElementById('token'),
  save: document.getElementById('save'),
  refreshState: document.getElementById('refreshState'),
  status: document.getElementById('status'),
  activity: document.getElementById('activity'),
};

const ext = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULTS = {
  enabled: false,
  useNativeMessaging: false,
  autoIntercept: true,
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
  el.interceptAllowlist.value = String(saved.interceptAllowlist || DEFAULTS.interceptAllowlist);
  el.nativeHost.value = String(saved.nativeHost || DEFAULTS.nativeHost);
  el.endpoint.value = String(saved.endpoint || DEFAULTS.endpoint);
  el.token.value = String(saved.token || DEFAULTS.token);
  await loadActivity();
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
    interceptAllowlist: String(el.interceptAllowlist.value || '').trim(),
    nativeHost: String(el.nativeHost.value || DEFAULTS.nativeHost).trim(),
    endpoint: String(el.endpoint.value || DEFAULTS.endpoint).trim(),
    token: String(el.token.value || '').trim(),
  });
  el.status.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
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

load().catch((e) => {
  el.status.textContent = String(e?.message || e);
});
