export const blank = () => ({ version: 1, next: 1, actions: [] });
export const MAX_BYTES = 16 * 1024 * 1024;
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

const limits = { title:160, team:100, owner:100, raised:10, due:10, status:6, issue:4000,
  comment:4000, responsible:200, accountable:200, consulted:300, informed:300 };
const required = new Set(['title','team','owner','raised']);

export function validate(data) {
  if (data?.version !== 1 || !Array.isArray(data.actions) || !Number.isSafeInteger(data.next) || data.next < 1 || data.next > 1e12) {
    throw Error('Choose a valid Action Review backup.');
  }
  const ids = new Set();
  const actions = data.actions.map(input => {
    const id = input?.id;
    const number = Number(typeof id === 'string' ? id.slice(3) : NaN);
    if (typeof id !== 'string' || !/^AR-[0-9]{1,12}$/.test(id) || number < 1 || number >= data.next || ids.has(number)) {
      throw Error('The backup contains an invalid or duplicate action ID.');
    }
    ids.add(number);
    const action = { id };
    for (const [name, limit] of Object.entries(limits)) {
      const value = input[name];
      if (typeof value !== 'string' || value.length > limit || (required.has(name) && !value.trim())) {
        throw Error('The backup contains an invalid action field.');
      }
      action[name] = value;
    }
    if (!['Open','Closed'].includes(action.status) || !validDate(action.raised) ||
        (action.due && !validDate(action.due)) || (action.status === 'Closed' ? !validDate(input.closed) : input.closed !== '')) {
      throw Error('The backup contains an invalid status or date.');
    }
    return { ...action, closed:input.closed };
  });
  return { version:1, next:data.next, actions };
}
