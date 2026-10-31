// Локальное хранилище журнала: тот же набор вызовов, что и у веб-версии, данные в файле на Mac.
(function () {
  const data = { classes: {}, students: {}, dates: {} };
  const subs = {};
  let loaded = false, timer = null;
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = v => JSON.parse(JSON.stringify(v));
  const snap = c => ({
    docs: Object.entries(data[c] || {}).map(([k, v]) => ({ id: k, exists: true, data: () => v })),
    metadata: { fromCache: false, hasPendingWrites: false }
  });
  const emit = c => (subs[c] || []).forEach(f => f(snap(c)));
  const saveNow = () => { clearTimeout(timer); timer = null; return window.journalStore.save(JSON.stringify(data)); };
  const persist = () => { clearTimeout(timer); timer = setTimeout(saveNow, 300); };
  const ready = window.journalStore.load().then(txt => {
    if (txt) { try { Object.assign(data, JSON.parse(txt)); } catch (e) { console.error(e); } }
    loaded = true; Object.keys(subs).forEach(emit);
  });
  async function whenReady() { if (!loaded) await ready; }
  function docRef(c, key) {
    return {
      id: key,
      async set(v) { await whenReady(); (data[c] = data[c] || {})[key] = clone(v); persist(); emit(c); },
      async update(v) {
        await whenReady(); const cur = (data[c] || {})[key];
        if (!cur) throw { code: "invalid_argument", message: "нет записи" };
        Object.assign(cur, clone(v)); persist(); emit(c);
      },
      async delete() { await whenReady(); delete (data[c] || {})[key]; persist(); emit(c); }
    };
  }
  function coll(c) {
    return {
      doc: k => docRef(c, k || id()),
      async add(v) { const r = docRef(c, id()); await r.set(v); return r; },
      onSnapshot(next) {
        (subs[c] = subs[c] || []).push(next);
        if (loaded) setTimeout(() => next(snap(c)), 0);
        return () => { subs[c] = subs[c].filter(f => f !== next); };
      }
    };
  }
  window.localDB = { collection: coll, doc: p => { const [c, k] = p.split("/"); return docRef(c, k); } };
  window.__saveNow = () => (timer ? saveNow() : Promise.resolve());
})();
