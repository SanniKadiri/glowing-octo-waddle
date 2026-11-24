import '@fontsource-variable/archivo';
import checkIcon from 'lucide-static/icons/check.svg?raw';
import plusIcon from 'lucide-static/icons/plus.svg?raw';
import downloadIcon from 'lucide-static/icons/download.svg?raw';
import reloadIcon from 'lucide-static/icons/refresh-cw.svg?raw';
import './modernist.css';
import './app.css';
import { blank, validate, validDate, MAX_BYTES } from './domain.js';
import { roles, today, dateLabel, escapeHTML, isOverdue, responsible, statusLabel } from './format.js';
import { connect, desktop, saveFile } from './storage.js';
import { workbook } from './excel.js';
import { makePdf } from './pdf.js';

'use strict';
const $ = id => document.getElementById(id);
function icon(element, markup) {
  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.setAttribute('aria-hidden','true');
  glyph.innerHTML = markup;
  element.prepend(glyph);
}
const mark = document.querySelector('.mark');
mark.textContent = '';
icon(mark,checkIcon);
icon($('new-action'),plusIcon);
icon($('export-button'),downloadIcon);
icon($('reload-button'),reloadIcon);

const settingsKey = 'action-review.connection.v1';
function initialConnection() {
  if (!desktop) return {mode:'web',server:'',key:''};
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey));
    if (saved?.mode === 'remote' && typeof saved.server === 'string') return {mode:'remote',server:saved.server,key:''};
  } catch {}
  return {mode:'local',server:'',key:''};
}
const fields = Array.from($('action-form').querySelectorAll('[name]'));
let state = blank();
let editId = null;
let revision = 0;
let store = null;
let connection = initialConnection();
let busy = false;

async function persist(updated) {
  if (!store || busy) throw Error('Connect to storage before saving.');
  busy = true;
  try {
    revision = await store.write(revision,validate(updated));
    state = updated;
  } finally { busy = false; }
}
function notify(message, error=false) {
  $('feedback').textContent = message;
  $('feedback').classList.toggle('error',error);
}
function filtered() {
  const term = $('search').value.trim().toLowerCase();
  const status = $('status').value;
  return state.actions.filter(action =>
    (!$('team').value || action.team === $('team').value) &&
    (!$('owner').value || action.owner === $('owner').value) &&
    (!status || (status === 'overdue' ? isOverdue(action) : action.status === status)) &&
    (!term || Object.values(action).some(value => value.toLowerCase().includes(term))));
}
function render() {
  for (const keyName of ['team','owner']) {
    const select = $(keyName);
    const previous = select.value;
    const options = [...new Set(state.actions.map(action => action[keyName]))].sort((a,b) => a.localeCompare(b));
    select.replaceChildren(new Option(keyName === 'team' ? 'All teams' : 'All owners',''), ...options.map(value => new Option(value,value)));
    if (options.includes(previous)) select.value = previous;
  }
  $('open-count').textContent = state.actions.filter(action => action.status === 'Open').length;
  $('overdue-count').textContent = state.actions.filter(isOverdue).length;
  $('closed-count').textContent = state.actions.filter(action => action.status === 'Closed').length;
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.filter === $('status').value)));
  const actions = filtered();
  $('register').querySelector('tbody').innerHTML = actions.map(action => {
    const status = isOverdue(action) ? 'Overdue' : action.status;
    return '<tr><td><span class="action-id">'+action.id+'</span><button class="action-button" data-edit="'+action.id+'">'+escapeHTML(action.title)+'</button></td><td><span class="tag tag-neutral">'+escapeHTML(action.team)+'</span></td><td>'+escapeHTML(action.owner)+'</td><td>'+dateLabel(action.due)+'</td><td><span class="tag tag-outline '+status.toLowerCase()+'">'+status+'</span></td></tr>';
  }).join('');
  $('empty').hidden = actions.length > 0;
  $('empty').innerHTML = state.actions.length ? '<strong>No matching actions</strong>Try another search or filter.' : '<strong>No actions yet</strong>Add an action to start your register.';
  $('visible-count').textContent = actions.length+' of '+state.actions.length+' '+(state.actions.length === 1 ? 'action' : 'actions');
}
function openEditor(id=null) {
  if (!store || busy) return;
  const item = state.actions.find(action => action.id === id);
  editId = id;
  $('editor-title').textContent = item ? 'Edit '+item.id : 'New action';
  $('editor-error').textContent = '';
  $('closure').textContent = item?.closed ? 'Closed '+dateLabel(item.closed) : '';
  for (const field of fields) field.value = item?.[field.name] ?? ({raised:today(),status:'Open'}[field.name] || '');
  $('editor').showModal();
}
$('action-form').addEventListener('submit', async event => {
  event.preventDefault();
  const item = Object.fromEntries(fields.map(field => [field.name,field.value.trim()]));
  if (!item.title || !item.team || !item.owner || !validDate(item.raised) || (item.due && !validDate(item.due))) {
    $('editor-error').textContent = 'Enter an action name, team, owner and valid dates.';
    return;
  }
  const existing = state.actions.find(action => action.id === editId);
  item.id = existing?.id || 'AR-'+String(state.next).padStart(4,'0');
  item.closed = item.status === 'Closed' ? (existing?.closed || today()) : '';
  const updated = existing ? state.actions.map(action => action.id === editId ? item : action) : [item,...state.actions];
  try { await persist({...state,actions:updated,next:state.next+Number(!existing)}); }
  catch (error) { $('editor-error').textContent = error.message; return; }
  $('editor').close();
  render();
  notify('Saved '+item.id+'.');
});
$('new-action').onclick = () => openEditor();
$('register').addEventListener('click',event => {
  const button = event.target.closest('[data-edit]');
  if (button) openEditor(button.dataset.edit);
});
for (const id of ['team','owner','status']) $(id).addEventListener('change',render);
$('search').addEventListener('input',render);
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  $('status').value = button.getAttribute('aria-pressed') === 'true' ? '' : button.dataset.filter;
  render();
});
document.querySelectorAll('[data-dismiss]').forEach(button => button.onclick = () => button.closest('dialog').close());
$('backup-button').onclick = () => {
  $('backup-file').value = '';
  $('restore').disabled = true;
  $('backup-error').textContent = '';
  $('backup').showModal();
};
$('backup-file').onchange = () => { $('restore').disabled = !$('backup-file').files.length; };
$('download-backup').onclick = async () => {
  if (!store) return;
  try { await saveFile(new Blob([JSON.stringify(state)],{type:'application/json'}),'action-review-'+today()+'.json'); }
  catch (error) { $('backup-error').textContent = String(error); }
};
$('restore').onclick = async () => {
  const file = $('backup-file').files[0];
  const originalStore = store;
  const originalRevision = revision;
  $('restore').disabled = true;
  $('backup-error').textContent = '';
  try {
    if (file.size > MAX_BYTES) throw Error('Choose a backup smaller than 16 MB.');
    const restored = validate(JSON.parse(await file.text()));
    if (store !== originalStore || revision !== originalRevision) throw Error('The register changed. Select the backup again.');
    await persist(restored);
    $('backup').close();
    render();
    notify('Restored '+restored.actions.length+' actions.');
  } catch (error) {
    $('backup-error').textContent = error instanceof SyntaxError ? 'This file does not contain valid JSON.' : error.message;
  } finally { $('restore').disabled = !$('backup-file').files.length; }
};
function exportData() {
  const actions = $('scope').value === 'all' ? state.actions : filtered();
  const teams = [...new Set(actions.map(action => action.team))];
  return {
    actions,
    title:$('report-title').value.trim() || 'Action Review',
    date:$('review-date').value,
    orientation:$('orientation').value,
    team:teams.length === 1 ? teams[0] : (teams.length ? 'Multiple teams' : ($('scope').value === 'filtered' && $('team').value) || 'All teams')
  };
}
function updateExportCount() {
  const {actions} = exportData();
  $('export-count').textContent = actions.length+' '+(actions.length === 1 ? 'action' : 'actions')+' included.';
}
$('export-button').onclick = () => {
  $('review-date').value ||= today();
  $('export-error').textContent = '';
  updateExportCount();
  $('exports').showModal();
};
$('scope').onchange = updateExportCount;
const detail = (label,value) => value ? '<div><b>'+label+'</b> '+escapeHTML(value)+'</div>' : '';
function showReport(data) {
  previewData = data;
  $('report-error').textContent = '';
  const landscape = data.orientation === 'landscape';
  const headers = landscape
    ? ['Action','Team / owner','Dates','Issue or context','RACI','Latest comment','Status']
    : ['Action and review notes','Team / owner','Dates / status'];
  const widths = landscape ? [16,13,13,16,14,17,11] : [55,20,25];
  const body = data.actions.map(action => {
    const title = '<span class="action-id">'+action.id+'</span>'+escapeHTML(action.title);
    const team = escapeHTML(action.team)+'<div class="report-subtle">'+escapeHTML(action.owner)+'</div>';
    const dates = detail('Raised',dateLabel(action.raised))+(action.due ? detail('Due',dateLabel(action.due)) : '')+(action.closed ? detail('Closed',dateLabel(action.closed)) : '');
    const raci = roles.map(([role,label]) => detail(label,role === 'responsible' ? responsible(action) : action[role])).join('');
    const status = statusLabel(action);
    const cells = landscape
      ? [title,team,dates,escapeHTML(action.issue),raci,escapeHTML(action.comment),status]
      : [title+'<div class="report-details report-subtle">'+detail('Issue',action.issue)+detail('Comment',action.comment)+raci+'</div>',team,detail('Status',status)+dates];
    return '<tr>'+cells.map(cell => '<td>'+cell+'</td>').join('')+'</tr>';
  }).join('');
  $('report-paper').className = 'report-paper '+data.orientation;
  $('report-paper').innerHTML = '<header class="report-header"><h1>'+escapeHTML(data.title)+'</h1><p>'+escapeHTML(data.team)+' · '+dateLabel(data.date)+' · '+data.actions.length+' '+(data.actions.length === 1 ? 'action' : 'actions')+'</p></header>'+
    '<div class="scroll"><table class="table"><colgroup>'+widths.map(width => '<col style="width:'+width+'%">').join('')+'</colgroup><thead><tr>'+
    headers.map(header => '<th scope="col">'+header+'</th>').join('')+'</tr></thead><tbody>'+ (body || '<tr><td colspan="'+headers.length+'">No actions in this report.</td></tr>')+
    '</tbody></table></div><footer class="report-footer">Action Review · '+dateLabel(data.date)+'</footer>';
  $('page-style').textContent = '@page { size:A4 '+data.orientation+'; margin:16mm 13mm 16mm; @top-left { content:"Action register"; font:9pt system-ui; color:var(--color-text); } @bottom-left { content:"Action Review  /  '+data.date+'"; font:9pt system-ui; color:var(--color-text); border-top:1px solid var(--color-divider); } @bottom-right { content:"Page " counter(page) " of " counter(pages); font:9pt system-ui; color:var(--color-text); border-top:1px solid var(--color-divider); } }';
  $('exports').close();
  $('app').hidden = true;
  $('report').hidden = false;
  document.body.classList.add('printing');
  window.scrollTo(0,0);
  $('back').focus();
}
$('back').onclick = () => {
  $('report').hidden = true;
  $('app').hidden = false;
  document.body.classList.remove('printing');
  $('export-button').focus();
};
let previewData;
$('print').hidden = desktop;
$('save-pdf').onclick = async () => {
  try { await saveFile(await makePdf(previewData),'action-review-'+previewData.date+'.pdf'); }
  catch (error) { $('report-error').textContent = String(error); }
};
$('print').onclick = () => window.print();
$('export-form').onsubmit = async event => {
  event.preventDefault();
  const data = exportData();
  if (!validDate(data.date)) { $('export-error').textContent = 'Enter a valid review date.'; return; }
  if (event.submitter?.value === 'excel') {
    try { await saveFile(workbook(data),'action-review-'+data.date+'.xlsx'); }
    catch (error) { $('export-error').textContent = error.message; }
  } else if (event.submitter?.value === 'pdf') {
    try { await saveFile(await makePdf(data),'action-review-'+data.date+'.pdf'); }
    catch (error) { $('export-error').textContent = String(error); }
  } else {
    showReport(data);
  }
};
window.addEventListener('beforeprint',() => {
  if ($('report').hidden) {
    $('review-date').value ||= today();
    if (!validDate($('review-date').value)) $('review-date').value = today();
    showReport(exportData());
  }
});
function updateControls() {
  for (const id of ['new-action','backup-button','export-button','reload-button']) $(id).disabled = !store;
  $('storage-button').textContent = !store ? 'Connect storage' : connection.mode === 'local' ? 'Storage · SQLite' : 'Storage · Server';
}
async function load(candidate) {
  if (busy) return;
  busy = true;
  try {
    const next = connect(candidate);
    const snapshot = await next.read();
    state = snapshot.register;
    revision = snapshot.revision;
    store = next;
    connection = candidate;
    updateControls();
    render();
  } finally { busy = false; }
}
function storageFields() {
  $('mode-field').hidden = !desktop;
  $('server-field').hidden = !desktop || $('mode').value === 'local';
  $('key-field').hidden = desktop && $('mode').value === 'local';
  $('server').required = !$('server-field').hidden;
  $('storage-description').textContent = desktop
    ? 'Switch between the database on this device and an Action Review server. Each connection has its own register.'
    : 'Connect to the database configured on this Action Review server.';
}
$('mode').onchange = storageFields;
$('storage-button').onclick = () => {
  $('mode').value = connection.mode === 'remote' ? 'remote' : 'local';
  $('server').value = connection.server;
  $('access-key').value = connection.key;
  $('storage-error').textContent = '';
  storageFields();
  $('storage').showModal();
};
$('storage-form').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const candidate = {mode:desktop ? $('mode').value : 'web',server:$('server-field').hidden ? '' : $('server').value.trim(),key:$('key-field').hidden ? '' : $('access-key').value};
  try {
    await load(candidate);
    if (desktop) {
      try { localStorage.setItem(settingsKey,JSON.stringify({mode:candidate.mode,server:candidate.server})); }
      catch {} // The active connection is still usable when preference storage is unavailable.
    }
    $('access-key').value = '';
    $('storage').close();
    notify('Connected to '+(candidate.mode === 'local' ? 'local SQLite.' : 'the server.'));
  } catch (error) { $('storage-error').textContent = error.message; }
};
$('reload-button').onclick = async () => {
  if (busy) return;
  try { await load(connection); notify('Register reloaded.'); }
  catch (error) { notify(error.message,true); }
};
updateControls();
render();
load(connection).catch(error => notify(error.message,true));
