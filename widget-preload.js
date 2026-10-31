const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cardApi", {
  onState: cb => ipcRenderer.on("state", (_e, st) => cb(st)),
  open: id => ipcRenderer.send("open-group", id),
  hide: () => ipcRenderer.send("card-hide")
});
