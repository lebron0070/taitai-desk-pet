const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskPet', {
  onAction: (callback) => ipcRenderer.on('pet-action', (_event, data) => callback(data)),
  onPreferences: (callback) => ipcRenderer.on('preferences', (_event, data) => callback(data)),
  setHover: (hovering) => ipcRenderer.send('pet-hover', hovering),
  dragTo: (point) => ipcRenderer.send('pet-drag', point),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: (data) => ipcRenderer.invoke('save-preferences', data),
  showSettings: () => ipcRenderer.send('show-settings'),
  showContextMenu: () => ipcRenderer.send('pet-context-menu')
});
