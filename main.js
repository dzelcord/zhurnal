const { app, BrowserWindow, ipcMain, Menu, Tray, shell, screen, nativeImage, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("Журнал воскресной школы");
app.commandLine.appendSwitch("lang", "ru");

const dataDir = () => app.getPath("userData");
const dataFile = () => path.join(dataDir(), "journal.json");
const backupDir = () => path.join(dataDir(), "Резервные копии");
const settingsFile = () => path.join(dataDir(), "settings.json");

/* ---------- данные журнала ---------- */
function today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// Раз в день сохраняем копию журнала; храним последние 60 копий.
function dailyBackup() {
  try {
    if (!fs.existsSync(dataFile())) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const target = path.join(backupDir(), "journal-" + today() + ".json");
    if (!fs.existsSync(target)) fs.copyFileSync(dataFile(), target);
    const old = fs.readdirSync(backupDir()).filter(f => f.startsWith("journal-")).sort();
    old.slice(0, Math.max(0, old.length - 60)).forEach(f => fs.unlinkSync(path.join(backupDir(), f)));
  } catch (e) { console.error(e); }
}
ipcMain.handle("journal:load", () => {
  try { return fs.readFileSync(dataFile(), "utf8"); } catch (e) { return null; }
});
ipcMain.handle("journal:save", (_e, text) => {
  if (typeof text !== "string") return false;
  JSON.parse(text); // не записываем испорченные данные
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = dataFile() + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, dataFile());
  return true;
});

/* ---------- настройки виджетов ---------- */
let settings = { card: true, onTop: false, x: null, y: null };
function loadSettings() { try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), "utf8"))); } catch (e) {} }
function saveSettings() { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (e) {} }

/* ---------- расписание ---------- */
const DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const DSHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
let schedule = [];
const toMin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const hasSched = g => g && Number.isInteger(g.day) && /^\d\d:\d\d$/.test(g.start || "") && /^\d\d:\d\d$/.test(g.end || "");
function lessonNow(now = new Date()) {
  const items = schedule.filter(hasSched);
  if (!items.length) return null;
  const w = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  for (const g of items) {
    const a = g.day * 1440 + toMin(g.start), b = g.day * 1440 + toMin(g.end);
    if (w >= a && w < b) return { mode: "now", g, left: b - w, progress: (w - a) / (b - a) };
  }
  let best = null;
  for (const g of items) { let d = g.day * 1440 + toMin(g.start) - w; if (d <= 0) d += 7 * 1440; if (!best || d < best.d) best = { g, d }; }
  return { mode: "next", g: best.g, until: best.d };
}
const fmtLeft = m => m < 60 ? m + " мин" : Math.floor(m / 60) + " ч" + (m % 60 ? " " + (m % 60) + " мин" : "");
function fmtWait(m) {
  if (m < 60) return "через " + m + " мин";
  if (m < 24 * 60) { const h = Math.floor(m / 60), r = m % 60; return "через " + h + " ч" + (r ? " " + r + " мин" : ""); }
  return "";
}
ipcMain.on("schedule", (_e, list) => {
  if (!Array.isArray(list)) return;
  schedule = list.filter(g => g && typeof g.id === "string").map(g => ({ id: g.id, name: String(g.name || ""), day: g.day, start: g.start, end: g.end }));
  refresh();
});

/* ---------- окно журнала ---------- */
let win, tray, card;
let quitting = false, forceClose = false;
function flushRenderer() {
  if (!win || win.isDestroyed()) return Promise.resolve();
  const t = new Promise(r => setTimeout(r, 3000));
  const f = win.webContents.executeJavaScript("(async()=>{if(window.__flushAll)await window.__flushAll();if(window.__saveNow)await window.__saveNow();})()").catch(() => {});
  return Promise.race([f, t]);
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 500,
    title: "Журнал воскресной школы",
    backgroundColor: "#eef1fb",
    titleBarStyle: "hiddenInset",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", e => e.preventDefault());
  // Закрытие окна прячет его (виджеты продолжают работать); выход через Cmd+Q. Перед этим дописываем несохранённое.
  win.on("close", e => {
    if (forceClose) return;
    e.preventDefault();
    flushRenderer().finally(() => {
      if (quitting) { forceClose = true; app.quit(); } else win.hide();
    });
  });
}
function openJournal(groupId) {
  if (!win || win.isDestroyed()) return;
  win.show(); win.focus();
  if (groupId) win.webContents.executeJavaScript(`window.__openGroup&&window.__openGroup(${JSON.stringify(groupId)})`).catch(() => {});
}
ipcMain.on("open-group", (_e, id) => openJournal(typeof id === "string" ? id : null));

/* ---------- значок в строке меню ---------- */
function trayMenu(st) {
  const items = [];
  if (st) {
    const g = st.g;
    items.push({ label: st.mode === "now" ? `Сейчас идёт: ${g.name}, осталось ${fmtLeft(st.left)}` : `Следующее: ${g.name}, ${fmtWait(st.until) || DAYS[g.day] + " " + g.start}`, enabled: false });
    items.push({ type: "separator" });
  }
  const list = schedule.slice();
  if (list.length) {
    for (const g of list) {
      const live = st && st.mode === "now" && st.g.id === g.id;
      items.push({
        label: (live ? "● " : "    ") + g.name + (hasSched(g) ? `   ${DSHORT[g.day]} ${g.start}–${g.end}` : "   время не задано"),
        click: () => openJournal(g.id)
      });
    }
  } else items.push({ label: "Групп пока нет", enabled: false });
  items.push({ type: "separator" });
  items.push({ label: "Открыть журнал", click: () => openJournal(null) });
  items.push({ label: "Карточка на рабочем столе", type: "checkbox", checked: settings.card, click: m => { settings.card = m.checked; saveSettings(); syncCard(); } });
  items.push({ label: "Карточка поверх других окон", type: "checkbox", checked: settings.onTop, enabled: settings.card, click: m => { settings.onTop = m.checked; saveSettings(); if (card) card.setAlwaysOnTop(settings.onTop, "floating"); } });
  items.push({ type: "separator" });
  items.push({ label: "Выйти", click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, "trayTemplate.png"));
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip("Журнал воскресной школы");
}

/* ---------- карточка на рабочем столе ---------- */
function createCard() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 320, h = 168;
  let x = Number.isFinite(settings.x) ? settings.x : wa.x + wa.width - w - 24;
  let y = Number.isFinite(settings.y) ? settings.y : wa.y + 24;
  // если экран сменился и карточка оказалась за его краем, возвращаем её в угол
  const inside = screen.getAllDisplays().some(d => x >= d.workArea.x - w / 2 && x <= d.workArea.x + d.workArea.width - w / 2 && y >= d.workArea.y - 10 && y <= d.workArea.y + d.workArea.height - 40);
  if (!inside) { x = wa.x + wa.width - w - 24; y = wa.y + 24; }
  card = new BrowserWindow({
    width: w, height: h, x, y, frame: false, backgroundColor: "#00000000", resizable: false, fullscreenable: false,
    minimizable: false, maximizable: false, skipTaskbar: true, hasShadow: true, show: false,
    vibrancy: "under-window", visualEffectState: "active", roundedCorners: true,
    alwaysOnTop: settings.onTop,
    webPreferences: { preload: path.join(__dirname, "widget-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (settings.onTop) card.setAlwaysOnTop(true, "floating");
  card.setVisibleOnAllWorkspaces(true);
  card.loadFile(path.join(__dirname, "app", "widget.html"));
  card.once("ready-to-show", () => { card.showInactive(); refresh(); });
  card.on("moved", () => { const [nx, ny] = card.getPosition(); settings.x = nx; settings.y = ny; saveSettings(); });
  card.on("closed", () => { card = null; });
}
function syncCard() {
  if (settings.card && !card) createCard();
  if (!settings.card && card) card.close();
  refresh();
}
ipcMain.on("card-hide", () => { settings.card = false; saveSettings(); syncCard(); });

/* ---------- обновление каждые 20 секунд ---------- */
function refresh() {
  const st = lessonNow();
  if (tray) {
    tray.setTitle(st ? (st.mode === "now" ? ` ${st.g.name} · до ${st.g.end}` : ` ${st.g.name} · ${st.g.start}`) : "");
    tray.setContextMenu(trayMenu(st));
  }
  if (card && !card.isDestroyed()) {
    const payload = st ? {
      mode: st.mode, id: st.g.id, name: st.g.name, start: st.g.start, end: st.g.end,
      day: DAYS[st.g.day], left: st.left ? fmtLeft(st.left) : "", progress: st.progress || 0, wait: st.mode === "next" ? fmtWait(st.until) : ""
    } : null;
    card.webContents.send("state", payload);
  }
}

/* ---------- меню программы ---------- */
function step(d) { if (win) win.webContents.executeJavaScript(`window.__groupStep&&window.__groupStep(${d})`).catch(() => {}); }
function buildMenu() {
  const name = "Журнал воскресной школы";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: name, submenu: [
      { role: "about", label: "О программе" }, { type: "separator" },
      { role: "hide", label: "Скрыть" }, { role: "hideOthers", label: "Скрыть остальные" }, { type: "separator" },
      { role: "quit", label: "Выйти" } ] },
    { label: "Правка", submenu: [
      { role: "undo", label: "Отменить" }, { role: "redo", label: "Повторить" }, { type: "separator" },
      { role: "cut", label: "Вырезать" }, { role: "copy", label: "Копировать" }, { role: "paste", label: "Вставить" },
      { role: "selectAll", label: "Выбрать всё" } ] },
    { label: "Группа", submenu: [
      { label: "Предыдущая группа", accelerator: "CmdOrCtrl+[", click: () => step(-1) },
      { label: "Следующая группа", accelerator: "CmdOrCtrl+]", click: () => step(1) } ] },
    { label: "Вид", submenu: [
      { role: "zoomIn", label: "Крупнее" }, { role: "zoomOut", label: "Мельче" }, { role: "resetZoom", label: "Обычный размер" },
      { type: "separator" }, { role: "togglefullscreen", label: "Во весь экран" } ] },
    { label: "Данные", submenu: [
      { label: "Показать папку с журналом и копиями", click: () => { fs.mkdirSync(dataDir(), { recursive: true }); shell.openPath(dataDir()); } } ] },
    { role: "window", label: "Окно", submenu: [
      { label: "Журнал", accelerator: "CmdOrCtrl+1", click: () => openJournal(null) },
      { role: "minimize", label: "Свернуть" }, { role: "close", label: "Закрыть" } ] }
  ]));
}

app.whenReady().then(() => {
  nativeTheme.themeSource = "light";
  app.setAboutPanelOptions({ applicationName: "Журнал воскресной школы", applicationVersion: app.getVersion() });
  loadSettings();
  dailyBackup();
  buildMenu();
  createWindow();
  createTray();
  if (settings.card) createCard();
  refresh();
  setInterval(refresh, 20000);
  screen.on("display-removed", () => { if (card) { card.close(); setTimeout(syncCard, 300); } });
});
app.on("activate", () => openJournal(null));
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => app.quit());
