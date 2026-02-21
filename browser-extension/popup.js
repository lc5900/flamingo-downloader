const ext = typeof browser !== 'undefined' ? browser : chrome;

const el = {
  summary: document.getElementById('summary'),
  status: document.getElementById('status'),
  list: document.getElementById('list'),
  refresh: document.getElementById('refresh'),
  clear: document.getElementById('clear'),
  sendSelected: document.getElementById('sendSelected'),
  copySelected: document.getElementById('copySelected'),
  openOptions: document.getElementById('openOptions'),
  enabled: document.getElementById('enabled'),
  sniffMediaEnabled: document.getElementById('sniffMediaEnabled'),
  autoIntercept: document.getElementById('autoIntercept'),
  currentTabOnly: document.getElementById('currentTabOnly'),
};

let statusTimer = null;
let currentTabId = -1;
const selectedUrls = new Set();

function esc(input) {
  return String(input || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function fmtTs(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString();
}

async function ask(action, payload = {}) {
  return await ext.runtime.sendMessage({ action, ...payload });
}

function detectFormat(item) {
  const url = String(item?.url || '').toLowerCase();
  const contentType = String(item?.contentType || '').toLowerCase();
  if (url.includes('.m3u8') || contentType.includes('mpegurl')) return 'HLS';
  if (url.includes('.mpd') || contentType.includes('dash+xml')) return 'DASH';
  const extMatch = url.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
  return extMatch ? extMatch[1].toUpperCase() : (contentType.split('/')[1] || 'MEDIA').toUpperCase();
}

function detectQuality(item) {
  const source = `${String(item?.url || '')} ${String(item?.pageUrl || '')}`.toLowerCase();
  const m = source.match(/(2160p|1440p|1080p|720p|480p|360p)/);
  return m ? m[1].toUpperCase() : 'Unknown';
}

async function resolveCurrentTab() {
  try {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    const tab = Array.isArray(tabs) ? tabs[0] : null;
    currentTabId = Number.isInteger(tab?.id) ? tab.id : -1;
  } catch {
    currentTabId = -1;
  }
}

function showStatus(text, level = 'info') {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  el.status.className = `status ${level === 'success' ? 'success' : level === 'error' ? 'error' : ''}`.trim();
  el.status.textContent = String(text || '');
  statusTimer = setTimeout(() => {
    el.status.textContent = '';
    el.status.className = 'status';
  }, 3800);
}

async function loadQuickState() {
  const response = await ask('get_quick_state');
  if (!response?.ok) throw new Error(String(response?.error || 'state unavailable'));
  const state = response.state || {};
  el.enabled.checked = !!state.enabled;
  el.sniffMediaEnabled.checked = !!state.sniffMediaEnabled;
  el.autoIntercept.checked = !!state.autoIntercept;
  const activity = state.lastBridgeActivityAt ? fmtTs(state.lastBridgeActivityAt) : '-';
  el.summary.textContent = `Media ${Number(state.mediaCount || 0)} | Last ${activity}`;
}

async function loadCandidates() {
  const response = await ask('list_media_candidates');
  if (!response?.ok) throw new Error(String(response?.error || 'list unavailable'));
  const sourceItems = Array.isArray(response.items) ? response.items : [];
  const items = el.currentTabOnly.checked
    ? sourceItems.filter((item) => Number(item?.tabId || -1) === currentTabId)
    : sourceItems;
  if (items.length === 0) {
    selectedUrls.clear();
    el.list.innerHTML = '<div class="card muted">No media detected yet.</div>';
    return;
  }
  const visibleUrls = new Set(items.map((item) => String(item?.url || '').trim()).filter(Boolean));
  for (const url of Array.from(selectedUrls)) {
    if (!visibleUrls.has(url)) selectedUrls.delete(url);
  }
  el.list.innerHTML = items
    .slice(0, 40)
    .map((item, idx) => {
      const url = String(item?.url || '');
      const fmt = detectFormat(item);
      const quality = detectQuality(item);
      return `
<div class="card">
  <div class="hint">#${idx + 1} | ${esc(item?.reason)} | hits ${Number(item?.hits || 0)} | ${esc(fmtTs(item?.lastSeenAt))}</div>
  <label class="switch"><input class="pick" data-url="${encodeURIComponent(url)}" type="checkbox" ${selectedUrls.has(url) ? 'checked' : ''} />Select</label>
  <div><span class="chip">${esc(fmt)}</span><span class="chip">${esc(quality)}</span></div>
  <div class="url">${esc(url)}</div>
  <div class="toolbar">
    <button class="send primary" data-url="${encodeURIComponent(url)}" type="button">Send</button>
    <button class="copy" data-url="${encodeURIComponent(url)}" type="button">Copy</button>
    <button class="open" data-page="${encodeURIComponent(String(item?.pageUrl || ''))}" type="button">Open Source</button>
  </div>
</div>`;
    })
    .join('');

  el.list.querySelectorAll('.send').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = decodeURIComponent(String(btn.getAttribute('data-url') || ''));
      try {
        const response = await ask('send_media_candidate', { url: target });
        if (!response?.ok) {
          throw new Error(
            response?.reason
              ? `${String(response.reason)}: ${String(response?.error || 'send failed')}`
              : String(response?.error || 'send failed'),
          );
        }
        const taskId = String(response?.task_id || '');
        showStatus(taskId
          ? `Sent task: ${taskId}`
          : `Sent: ${target.slice(0, 80)}`, 'success');
      } catch (e) {
        showStatus(String(e?.message || e), 'error');
      }
    });
  });

  el.list.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = decodeURIComponent(String(btn.getAttribute('data-url') || ''));
      try {
        await navigator.clipboard.writeText(target);
        showStatus('Copied URL', 'success');
      } catch (e) {
        showStatus(String(e?.message || e), 'error');
      }
    });
  });

  el.list.querySelectorAll('.pick').forEach((box) => {
    box.addEventListener('change', () => {
      const target = decodeURIComponent(String(box.getAttribute('data-url') || ''));
      if (!target) return;
      if (box.checked) selectedUrls.add(target);
      else selectedUrls.delete(target);
    });
  });

  el.list.querySelectorAll('.open').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const page = decodeURIComponent(String(btn.getAttribute('data-page') || ''));
      if (!page) {
        showStatus('No source page available', 'error');
        return;
      }
      try {
        await ext.tabs.create({ url: page });
      } catch (e) {
        showStatus(String(e?.message || e), 'error');
      }
    });
  });
}

async function setQuickFlags() {
  try {
    await ask('set_quick_flags', {
      enabled: !!el.enabled.checked,
      sniffMediaEnabled: !!el.sniffMediaEnabled.checked,
      autoIntercept: !!el.autoIntercept.checked,
    });
    await loadQuickState();
  } catch (e) {
    showStatus(String(e?.message || e), 'error');
  }
}

async function refreshAll() {
  await resolveCurrentTab();
  await loadQuickState();
  await loadCandidates();
}

el.refresh.addEventListener('click', () => {
  refreshAll().catch((e) => {
    showStatus(String(e?.message || e), 'error');
  });
});

el.clear.addEventListener('click', () => {
  ask('clear_media_candidates')
    .then(() => {
      selectedUrls.clear();
      return refreshAll();
    })
    .catch((e) => {
      showStatus(String(e?.message || e), 'error');
    });
});

el.sendSelected.addEventListener('click', async () => {
  const targets = Array.from(selectedUrls);
  if (targets.length === 0) {
    showStatus('No selected media', 'error');
    return;
  }
  let okCount = 0;
  for (const url of targets) {
    try {
      const response = await ask('send_media_candidate', { url });
      if (response?.ok) okCount += 1;
    } catch {
      // continue
    }
  }
  if (okCount > 0) showStatus(`Sent ${okCount}/${targets.length}`, 'success');
  else showStatus('Batch send failed', 'error');
});

el.copySelected.addEventListener('click', async () => {
  const targets = Array.from(selectedUrls);
  if (targets.length === 0) {
    showStatus('No selected media', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(targets.join('\n'));
    showStatus(`Copied ${targets.length} URL(s)`, 'success');
  } catch (e) {
    showStatus(String(e?.message || e), 'error');
  }
});

el.openOptions.addEventListener('click', () => {
  if (ext.runtime.openOptionsPage) {
    ext.runtime.openOptionsPage();
  }
});

el.enabled.addEventListener('change', () => { void setQuickFlags(); });
el.sniffMediaEnabled.addEventListener('change', () => { void setQuickFlags(); });
el.autoIntercept.addEventListener('change', () => { void setQuickFlags(); });
el.currentTabOnly.addEventListener('change', () => {
  void loadCandidates().catch((e) => showStatus(String(e?.message || e), 'error'));
});

refreshAll().catch((e) => {
  showStatus(String(e?.message || e), 'error');
});
