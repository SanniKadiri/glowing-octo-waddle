export const roles = [['responsible','Responsible'],['accountable','Accountable'],['consulted','Consulted'],['informed','Informed']];
const dateFormat = new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'UTC'});
export const dateLabel = value => value ? dateFormat.format(new Date(value+'T00:00:00Z')) : '—';
export function today() {
  const now = new Date();
  return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const isOverdue = action => action.status === 'Open' && action.due && action.due < today();
export const responsible = action => action.responsible || action.owner;
export const statusLabel = action => isOverdue(action) ? 'Open · Overdue' : action.status;
