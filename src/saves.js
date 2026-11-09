// Save slots in localStorage, plus export/import as .json files.
const INDEX = 'neonsprawl.slots.v2';
const SLOT = (id) => 'neonsprawl.slot.' + id;

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX) || '[]'); } catch (e) { return []; }
}
function writeIndex(list) {
  try { localStorage.setItem(INDEX, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
}

export function listSlots() {
  return readIndex().sort((a, b) => b.updated - a.updated);
}
export function newSlotId() {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
// Returns true on success.
export function writeSlot(id, meta, data) {
  try {
    localStorage.setItem(SLOT(id), JSON.stringify(data));
  } catch (e) {
    return false;
  }
  const list = readIndex().filter((s) => s.id !== id);
  list.push({ ...meta, id, updated: Date.now() });
  writeIndex(list);
  return true;
}
export function readSlot(id) {
  try { return JSON.parse(localStorage.getItem(SLOT(id)) || 'null'); } catch (e) { return null; }
}
export function deleteSlot(id) {
  try { localStorage.removeItem(SLOT(id)); } catch (e) { /* ignore */ }
  writeIndex(readIndex().filter((s) => s.id !== id));
}
export function exportFile(data, name) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name || 'city').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.neonsprawl.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function importFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        if (!data || data.v !== 2 || !data.city) throw new Error('Not a Neon Sprawl save file');
        resolve(data);
      } catch (e) { reject(e); }
    };
    input.click();
  });
}
