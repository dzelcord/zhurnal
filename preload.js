const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("journalStore", {
  load: () => ipcRenderer.invoke("journal:load"),
  save: text => ipcRenderer.invoke("journal:save", String(text))
});
