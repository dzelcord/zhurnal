const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("Журнал воскресной школы");
app.commandLine.appendSwitch("lang", "ru");
const dataDir = () => app.getPath("userData");
const dataFile = () => path.join(dataDir(), "journal.json");
const backupDir = () => path.join(dataDir(), "Резервные копии");

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

let win;
let closing = false;
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
  // Перед закрытием дописываем всё, что ещё не сохранено.
  win.on("close", e => {
    if (closing) return;
    e.preventDefault();
    const done = () => { closing = true; win.close(); };
    const t = setTimeout(done, 3000);
    win.webContents.executeJavaScript("(async()=>{if(window.__flushAll)await window.__flushAll();if(window.__saveNow)await window.__saveNow();})()")
      .catch(() => {}).finally(() => { clearTimeout(t); done(); });
  });
}

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
    { role: "window", label: "Окно", submenu: [ { role: "minimize", label: "Свернуть" }, { role: "close", label: "Закрыть" } ] }
  ]));
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: "Журнал воскресной школы", applicationVersion: "1.0.0" });
  dailyBackup();
  buildMenu();
  createWindow();
});
app.on("window-all-closed", () => app.quit());
