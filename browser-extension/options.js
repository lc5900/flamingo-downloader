const el = {
  enabled: document.getElementById('enabled'),
  endpoint: document.getElementById('endpoint'),
  token: document.getElementById('token'),
  save: document.getElementById('save'),
  status: document.getElementById('status'),
};

const DEFAULTS = {
  enabled: false,
  endpoint: 'http://127.0.0.1:16789/add',
  token: '',
};

async function load() {
  const saved = await chrome.storage.sync.get(['enabled', 'endpoint', 'token']);
  el.enabled.checked = typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULTS.enabled;
  el.endpoint.value = String(saved.endpoint || DEFAULTS.endpoint);
  el.token.value = String(saved.token || DEFAULTS.token);
}

async function save() {
  await chrome.storage.sync.set({
    enabled: !!el.enabled.checked,
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
