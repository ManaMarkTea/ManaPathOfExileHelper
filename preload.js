const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLeagues: () => ipcRenderer.invoke('get-leagues'),
  checkPrice: (itemText, league) => ipcRenderer.invoke('check-price', { itemText, league }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
