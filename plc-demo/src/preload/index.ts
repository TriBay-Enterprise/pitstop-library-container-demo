import { contextBridge, ipcRenderer } from 'electron'
//import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    //contextBridge.exposeInMainWorld('electron', electronAPI)
    //contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electron', {
      onNotification: (handler) => ipcRenderer.on('notification', (_, message, logLevel) => handler(message, logLevel)),
      postJob: (parameters) => ipcRenderer.invoke('post-job', parameters),
      chooseFile: () => ipcRenderer.invoke('choose-file'),
      toggleButtons: (handler) => ipcRenderer.on('toggle-buttons', (_, callback) => handler(callback)),
      onReport: (handler) => ipcRenderer.on('receive-report', (_, report) => handler(report)),
      downloadReport: (fileName) => ipcRenderer.invoke('download-report', fileName),
    });
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}