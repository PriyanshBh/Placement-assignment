const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const state = { dashboard: null, healthTimer: null, selectedFile: null };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatDate(value, options = {}) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...options }).format(new Date(value));
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({ message: 'The server returned an invalid response.' }));
  if (!response.ok) {
    const error = new Error(body.message || 'Request failed.');
    error.details = body.details;
    throw error;
  }
  return body;
}

function toast(title, message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  $('#toastWrap').appendChild(item);
  setTimeout(() => item.remove(), 4800);
}

function showPage(name, updateHash = true) {
  const valid = ['overview', 'import', 'policies', 'messages', 'health'];
  const target = valid.includes(name) ? name : 'overview';
  $$('.page').forEach((page) => page.classList.toggle('active', page.id === target));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === target));
  $('#currentPage').textContent = { overview: 'Overview', import: 'Data import', policies: 'Policy search', messages: 'Scheduler', health: 'Server health' }[target];
  $('#sidebar').classList.remove('open');
  if (updateHash) history.replaceState(null, '', `#${target}`);
  if (target === 'policies') loadAggregation();
  if (target === 'messages') loadMessages();
  if (target === 'health') loadHealth();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function policyStatus(policy) {
  const now = new Date();
  if (new Date(policy.policyStartDate) > now) return 'upcoming';
  return new Date(policy.policyEndDate) >= now ? 'active' : 'expired';
}

async function loadDashboard(quiet = false) {
  try {
    const payload = await api('/api/dashboard');
    state.dashboard = payload;
    Object.entries(payload.totals).forEach(([key, value]) => $$(`[data-stat="${key}"]`).forEach((el) => { el.textContent = value.toLocaleString(); }));
    const total = payload.totals.policies || 1;
    const activeDegrees = Math.round((payload.totals.activePolicies / total) * 360);
    $('#policyRing').style.background = `conic-gradient(var(--blue) 0 ${activeDegrees}deg,var(--mint) ${activeDegrees}deg ${Math.min(360, activeDegrees + 75)}deg,var(--amber) ${Math.min(360, activeDegrees + 75)}deg ${Math.min(360, activeDegrees + 135)}deg,var(--violet) ${Math.min(360, activeDegrees + 135)}deg 360deg)`;
    $('#recentPolicies').innerHTML = payload.recentPolicies.length ? payload.recentPolicies.map((policy) => {
      const status = policyStatus(policy);
      return `<tr><td class="policy-no">${escapeHtml(policy.policyNumber)}</td><td>${escapeHtml(policy.userId?.firstName)}</td><td>${escapeHtml(policy.categoryId?.categoryName)}</td><td>${escapeHtml(policy.companyId?.companyName)}</td><td>${formatDate(policy.policyEndDate, { year: undefined })}</td><td><span class="status-badge status-${status === 'upcoming' ? 'pending' : status}">${status}</span></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-cell">Import a sheet to see policy activity.</td></tr>';
    if (!quiet) toast('Dashboard refreshed', 'All portfolio metrics are up to date.');
  } catch (error) {
    if (!quiet) toast('Unable to refresh', error.message, 'error');
  }
}

function selectFile(file) {
  const allowed = ['xlsx', 'csv'];
  if (!file || !allowed.includes(file.name.split('.').pop().toLowerCase())) {
    state.selectedFile = null;
    $('#selectedFile').classList.add('hidden');
    $('#uploadButton').disabled = true;
    if (file) toast('Unsupported file', 'Choose an XLSX or CSV file.', 'error');
    return;
  }
  state.selectedFile = file;
  $('#fileName').textContent = file.name;
  $('#fileSize').textContent = `${(file.size / 1024).toFixed(1)} KB · Ready to import`;
  $('#selectedFile').classList.remove('hidden');
  $('#uploadButton').disabled = false;
}

async function uploadFile(event) {
  event.preventDefault();
  if (!state.selectedFile) return;
  const button = $('#uploadButton');
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span>Worker is processing your sheet…</span>';
  const data = new FormData();
  data.append('file', state.selectedFile);
  try {
    const result = await api('/api/upload', { method: 'POST', body: data });
    toast('Import complete', `${result.rows} rows processed · ${result.created} created · ${result.updated} updated`);
    selectFile(null);
    $('#fileInput').value = '';
    await loadDashboard(true);
    setTimeout(() => showPage('overview'), 800);
  } catch (error) {
    const detail = error.details?.[0] ? ` ${error.details[0]}` : '';
    toast('Import failed', `${error.message}${detail}`, 'error');
  } finally {
    button.innerHTML = original;
    button.disabled = !state.selectedFile;
  }
}

async function searchPolicies(event) {
  event.preventDefault();
  const query = $('#searchInput').value.trim();
  const button = $('#searchForm button');
  button.disabled = true;
  button.textContent = 'Searching…';
  try {
    const result = await api(`/api/policies/search?username=${encodeURIComponent(query)}`);
    $('#searchMeta').textContent = `${result.count} ${result.count === 1 ? 'policy' : 'policies'} found for “${query}”`;
    $('#searchMeta').classList.remove('hidden');
    $('#searchResults').innerHTML = result.data.length ? result.data.map((policy) => {
      const status = policyStatus(policy);
      return `<article class="panel policy-card"><div class="policy-top"><div><strong>${escapeHtml(policy.policyNumber)}</strong><small>${escapeHtml(policy.userId?.firstName)} · ${escapeHtml(policy.userId?.email)}</small></div><span class="status-badge status-${status === 'upcoming' ? 'pending' : status}">${status}</span></div><div class="policy-details"><div><span>Line of business</span><strong>${escapeHtml(policy.categoryId?.categoryName)}</strong></div><div><span>Carrier</span><strong>${escapeHtml(policy.companyId?.companyName)}</strong></div><div><span>Agent</span><strong>${escapeHtml(policy.agentId?.name)}</strong></div><div><span>Account</span><strong>${escapeHtml(policy.accountId?.accountName)}</strong></div><div><span>Policy starts</span><strong>${formatDate(policy.policyStartDate)}</strong></div><div><span>Policy ends</span><strong>${formatDate(policy.policyEndDate)}</strong></div></div></article>`;
    }).join('') : '<div class="blank-state"><span><svg><use href="#search-icon"/></svg></span><h3>No matching policies</h3><p>Check the customer name or email and try again.</p></div>';
  } catch (error) { toast('Search failed', error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Search policies'; }
}

async function loadAggregation() {
  try {
    const result = await api('/api/policies/aggregate');
    $('#aggregationBody').innerHTML = result.data.length ? result.data.map((item) => `<tr><td class="policy-no">${escapeHtml(item.firstName)}</td><td>${escapeHtml(item.email || '—')}</td><td>${item.totalPolicies}</td><td><span class="status-badge status-active">${item.activePolicies} active</span></td><td>${formatDate(item.earliestStart, { year: undefined })} – ${formatDate(item.latestEnd, { year: undefined })}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No policy data imported yet.</td></tr>';
  } catch (error) { $('#aggregationBody').innerHTML = `<tr><td colspan="5" class="empty-cell">${escapeHtml(error.message)}</td></tr>`; }
}

async function scheduleMessage(event) {
  event.preventDefault();
  const button = $('#scheduleForm button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/messages/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: $('#messageInput').value, day: $('#dayInput').value, time: $('#timeInput').value }) });
    toast('Message scheduled', 'It will be inserted into the delivery collection at the selected time.');
    $('#messageInput').value = '';
    await loadMessages();
  } catch (error) { toast('Could not schedule', error.message, 'error'); }
  finally { button.disabled = false; }
}

async function loadMessages() {
  try {
    const result = await api('/api/messages');
    $('#messageQueue').innerHTML = result.scheduled.length ? result.scheduled.map((item) => {
      const date = new Date(item.scheduledFor);
      return `<div class="message-item"><div class="message-date"><div><strong>${date.getDate()}</strong><span>${date.toLocaleString('en-US', { month: 'short' })}</span></div></div><div class="message-copy"><p>${escapeHtml(item.message)}</p><small>${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Asia/Kolkata</small></div><span class="status-badge status-${item.status}">${item.status}</span></div>`;
    }).join('') : '<div class="empty-mini">No messages scheduled yet.</div>';
  } catch (error) { toast('Queue unavailable', error.message, 'error'); }
}

async function loadHealth() {
  try {
    const result = await api('/api/health');
    $('#cpuValue').textContent = `${result.cpuPercent}%`;
    $('#cpuThreshold').textContent = `${result.threshold}%`;
    $('#cpuGauge').style.setProperty('--cpu', `${Math.min(180, result.cpuPercent * 1.8)}deg`);
    $('#processId').textContent = result.pid;
    $('#memoryValue').textContent = `${result.memoryMb} MB`;
    $('#uptimeValue').textContent = formatUptime(result.uptimeSeconds);
    $('#nodeVersion').textContent = result.nodeVersion;
    $('#restartCount').textContent = result.restartCount;
  } catch (error) { toast('Health check failed', error.message, 'error'); }
}

function setDefaultSchedule() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (number) => String(number).padStart(2, '0');
  $('#dayInput').value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  $('#dayInput').min = new Date().toLocaleDateString('en-CA');
  $('#timeInput').value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

document.addEventListener('DOMContentLoaded', () => {
  $('#dayPeriod').textContent = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';
  $$('.nav-item').forEach((item) => item.addEventListener('click', (event) => { event.preventDefault(); showPage(item.dataset.page); }));
  $$('.jump').forEach((item) => item.addEventListener('click', () => showPage(item.dataset.target)));
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#refreshButton').addEventListener('click', () => loadDashboard());
  $('#fileInput').addEventListener('change', (event) => selectFile(event.target.files[0]));
  $('#clearFile').addEventListener('click', () => { $('#fileInput').value = ''; selectFile(null); });
  const drop = $('#dropZone');
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', (event) => selectFile(event.dataTransfer.files[0]));
  $('#uploadForm').addEventListener('submit', uploadFile);
  $('#searchForm').addEventListener('submit', searchPolicies);
  $('#loadAggregation').addEventListener('click', loadAggregation);
  $('#scheduleForm').addEventListener('submit', scheduleMessage);
  $('#refreshMessages').addEventListener('click', loadMessages);
  setDefaultSchedule();
  showPage(location.hash.slice(1) || 'overview', false);
  loadDashboard(true);
  state.healthTimer = setInterval(() => { if ($('#health').classList.contains('active')) loadHealth(); }, 5000);
});
