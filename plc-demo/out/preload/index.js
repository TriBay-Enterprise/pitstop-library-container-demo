"use strict";
const electron = require("electron");
const api = {};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", {
      onNotification: (handler) => electron.ipcRenderer.on("notification", (_, message, logLevel) => handler(message, logLevel)),
      postJob: (parameters) => electron.ipcRenderer.invoke("post-job", parameters),
      chooseFile: () => electron.ipcRenderer.invoke("choose-file"),
      toggleButtons: (handler) => electron.ipcRenderer.on("toggle-buttons", (_, callback) => handler(callback)),
      onReport: (handler) => electron.ipcRenderer.on("receive-report", (_, report) => handler(report)),
      downloadReport: (fileName) => electron.ipcRenderer.invoke("download-report", fileName)
    });
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
