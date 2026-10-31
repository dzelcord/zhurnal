const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("journalStore", {
  load: () => ipcRenderer.invoke("journal:load"),
  save: text => ipcRenderer.invoke("journal:save", String(text)),
  setSchedule: list => ipcRenderer.send("schedule", JSON.parse(JSON.stringify(list)))
});
