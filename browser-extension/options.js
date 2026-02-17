const el = {
  enabled: document.getElementById('enabled'),
  autoIntercept: document.getElementById('autoIntercept'),
  endpoint: document.getElementById('endpoint'),
  token: document.getElementById('token'),
  save: document.getElementById('save'),
  status: document.getElementById('status'),
};

const ext = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULTS = {
  enabled: false,
  autoIntercept: true,
  endpoint: 'http://127.0.0.1:16789/add',
  token: '',
};

async function load() {
  const saved = await ext.storage.sync.get(['enabled', 'autoIntercept', 'endpoint', 'token']);
  el.enabled.checked = typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULTS.enabled;
  el.autoIntercept.checked =
    typeof saved.autoIntercept === 'boolean' ? saved.autoIntercept : DEFAULTS.autoIntercept;
  el.endpoint.value = String(saved.endpoint || DEFAULTS.endpoint);
  el.token.value = String(saved.token || DEFAULTS.token);
}

async function save() {
  await ext.storage.sync.set({
    enabled: !!el.enabled.checked,
    autoIntercept: !!el.autoIntercept.checked,
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

load().catch((e) => {
  el.status.textContent = String(e?.message || e);
});
