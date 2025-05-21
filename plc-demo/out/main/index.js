"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const http = require("http");
const fs = require("fs");
const ICON = path.join(__dirname, "../../build/icon.png");
console.log("Icon path: ", ICON);
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "../config.json"), "utf8"));
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 720,
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { ICON } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.ipcMain.handle("choose-file", async (event) => {
  event.sender.send("toggle-buttons");
  const RESULT = await electron.dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "PDF Files", extensions: ["pdf"] }
    ]
  });
  event.sender.send("toggle-buttons");
  return RESULT.filePaths[0];
});
electron.ipcMain.handle("post-job", async (event, parameters) => {
  try {
    event.sender.send("toggle-buttons");
    const isRunning = await isPLCRunning();
    if (isRunning === false) throw new Error("Unable to connect to PLC.");
    let file = {
      nameInput: path.basename(parameters.filePath),
      nameInputNoExt: "",
      nameOutput: path.basename(parameters.filePath, path.extname(parameters.filePath)) + "_output.pdf"
    };
    file.nameInputNoExt = path.basename(file.nameInput, path.extname(parameters.filePath));
    if (parameters.actionListsNames.length > 0) {
      parameters.actionListsNames = parameters.actionListsNames.map((name) => {
        return convertToUnixPath(path.join(CONFIG.docker.mounted.actionListsPath, name));
      });
    }
    if (parameters.preflightProfileName) {
      parameters.preflightProfileName = convertToUnixPath(path.join(CONFIG.docker.mounted.preflightProfilesPath, parameters.preflightProfileName));
    }
    copyFileToDocker(parameters.filePath);
    checkAndDeleteOutputFile(file);
    const REFERENCE_ID = makeReferenceId(file.nameOutput);
    const BODY = {
      "reference": REFERENCE_ID,
      "inputFileURL": `${CONFIG.docker.mounted.inputPath}/${file.nameInput}`,
      "actionListURLs": parameters.actionListsNames[0] ? parameters.actionListsNames : "",
      "profileURL": parameters.preflightProfileName ? parameters.preflightProfileName : "",
      "variableSetURL": "",
      "jobTicketURL": "",
      "extraFontsFolderURL": "",
      "outputFixedFileURL": `${CONFIG.docker.mounted.outputPath}/${file.nameOutput}`,
      "maxItemsPerCategory": "100",
      "maxNumOccurencesPerItem": "100",
      "reportLanguage": "en-US",
      "reportURLs": {
        "JSON": `${CONFIG.docker.mounted.reportsPath}/${file.nameInputNoExt}.json`,
        "PDF": `${CONFIG.docker.mounted.reportsPath}/${file.nameInputNoExt}.pdf`
      },
      "reportTemplate": {
        "configFileURL": CONFIG.docker.mounted.reportTemplatePath
      },
      "reportProgress": true,
      "progressTimeoutValue": "100",
      "abortingTypeValue": "5",
      "jobStatusURL": ""
    };
    console.log("Sending: ", BODY);
    const DATA = JSON.stringify(BODY);
    const OPTIONS = {
      hostname: CONFIG.plc.hostname,
      port: CONFIG.plc.port,
      path: "/job",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": DATA.length
      }
    };
    const REQUEST = http.request(OPTIONS, (res) => {
      let responseData;
      if (res.statusCode === 200) {
        event.sender.send("notification", `${file.nameInput} has been received and will be processed.`, "info");
      }
      console.log(`STATUS: ${res.statusCode}`);
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        console.log(`Body: ${chunk}`);
        responseData = JSON.parse(chunk);
        if (res.statusCode !== 200) {
          try {
            throw `Error ${responseData.statusCode}: ${responseData.message}.`;
          } catch (e) {
            catchError(event, e);
          }
        }
      });
      res.on("end", async () => {
        if (res.statusCode === 200) {
          openOutput(event, parameters, file);
        }
      });
    });
    REQUEST.on("error", (e) => {
      console.error(`${e.message}`);
    });
    REQUEST.write(DATA);
    REQUEST.end();
  } catch (e) {
    catchError(event, e);
  }
});
electron.ipcMain.handle("download-report", async (event, reportFileName) => {
  event.sender.send("toggle-buttons");
  const REPORT_PATH = path.join(CONFIG.docker.reportsPath, reportFileName);
  const REPORT_FILE_NAME = path.basename(reportFileName, path.extname(reportFileName)) + "_annotated_report.pdf";
  const RESULT = await electron.dialog.showSaveDialog({
    defaultPath: REPORT_FILE_NAME,
    title: "Save Annotated PitStop Report",
    filters: [
      { name: "PDF Files", extensions: ["pdf"] }
    ]
  });
  if (RESULT.canceled === false) {
    try {
      fs.copyFileSync(REPORT_PATH, RESULT.filePath);
      event.sender.send("notification", `Report downloaded to ${RESULT.filePath}`, "success");
    } catch (e) {
      catchError(event, e);
    }
  }
  event.sender.send("toggle-buttons");
});
function copyFileToDocker(src) {
  try {
    fs.copyFileSync(src, path.join(CONFIG.docker.inputPath, path.basename(src)));
    console.log(`File copied to Docker: ${src}`);
  } catch (e) {
    throw `Error copying input file to PLC: ${e}`;
  }
}
function checkAndDeleteOutputFile(file) {
  const OUTPUT_FILE_PATH = path.join(CONFIG.docker.outputPath, file.nameOutput);
  const OUTPUT_JSON_FILE_PATH = path.join(CONFIG.docker.reportsPath, file.nameInputNoExt + ".json");
  const OUTPUT_PDF_REPORT_PATH = path.join(CONFIG.docker.reportsPath, file.nameInputNoExt + ".pdf");
  try {
    if (fs.existsSync(OUTPUT_FILE_PATH)) {
      fs.unlinkSync(OUTPUT_FILE_PATH);
      console.log(`File deleted: ${file.nameOutput}`);
    }
    if (fs.existsSync(OUTPUT_JSON_FILE_PATH)) {
      fs.unlinkSync(OUTPUT_JSON_FILE_PATH);
      console.log(`File deleted: ${file.nameInputNoExt}.json`);
    }
    if (fs.existsSync(OUTPUT_PDF_REPORT_PATH)) {
      fs.unlinkSync(OUTPUT_PDF_REPORT_PATH);
      console.log(`File deleted: ${file.nameInputNoExt}.pdf`);
    }
  } catch (e) {
    throw `Error deleting previous output file: ${e}`;
  }
}
function openOutput(event, parameters, file) {
  const MAX_ATTEMPTS = 10;
  let attemps = 0;
  const INTERVAL = setInterval(() => {
    try {
      if (attemps >= MAX_ATTEMPTS) {
        clearInterval(INTERVAL);
        if (parameters.actionListsNames.length > 0 && parameters.preflightProfileName) {
          throw new Error(`Failed to open one or more items after ${MAX_ATTEMPTS} attempts: ${file.nameOutput}, ${file.nameInputNoExt}.json`);
        } else if (parameters.actionListsNames.length > 0) {
          throw new Error(`Failed to open PDF in default PDF viewer after ${MAX_ATTEMPTS} attempts: ${file.nameOutput}`);
        } else if (parameters.preflightProfileName) {
          throw new Error(`Failed to open JSON report after ${MAX_ATTEMPTS} attempts: ${file.nameInputNoExt}.json`);
        }
      }
      attemps++;
    } catch (e) {
      catchError(event, e);
    }
    try {
      if (parameters.actionListsNames.length > 0 && parameters.preflightProfileName) {
        openPDFInDefaultApp(file);
        openJSONReport(event, file);
      } else if (parameters.actionListsNames.length > 0) {
        openPDFInDefaultApp(file);
      } else if (parameters.preflightProfileName) {
        openJSONReport(event, file);
      }
      notifyJobProcessed(event, file.nameOutput);
      clearInterval(INTERVAL);
      if (parameters.actionListsNames.length > 0) {
        setTimeout(() => {
          event.sender.send("toggle-buttons");
        }, 2e3);
      } else {
        event.sender.send("toggle-buttons");
      }
    } catch (error) {
      console.error(`Open attempt ${attemps}: ${error}`);
    }
  }, 1e3);
}
function openPDFInDefaultApp(file) {
  const OUTPUT_FILE_PATH = path.join(CONFIG.docker.outputPath, file.nameOutput);
  try {
    if (fs.existsSync(OUTPUT_FILE_PATH)) {
      electron.shell.openPath(OUTPUT_FILE_PATH);
    } else {
      throw new Error(`Output file not found: ${OUTPUT_FILE_PATH}`);
    }
  } catch (e) {
    throw e;
  }
}
function openJSONReport(event, file) {
  const REPORT_FILE_PATH = path.join(CONFIG.docker.reportsPath, file.nameInputNoExt + ".json");
  try {
    if (fs.existsSync(REPORT_FILE_PATH)) {
      const REPORT_DATA = fs.readFileSync(REPORT_FILE_PATH, "utf8");
      event.sender.send("receive-report", JSON.parse(REPORT_DATA));
    } else {
      throw new Error(`PitStop report file not found: ${REPORT_FILE_PATH}`);
    }
  } catch (e) {
    throw e;
  }
}
async function isPLCRunning() {
  const PING_OPTIONS = {
    hostname: CONFIG.plc.hostname,
    port: CONFIG.plc.port
  };
  return new Promise((resolve) => {
    const PING_REQ = http.request(PING_OPTIONS, (res) => {
      if (res.statusCode === 404) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    PING_REQ.on("error", () => {
      resolve(false);
    });
    PING_REQ.end();
  });
}
function notifyJobProcessed(event, FILE_NAME_OUTPUT) {
  event.sender.send("notification", `<b>${FILE_NAME_OUTPUT}</b> has been processed successfully.`, "success");
}
function convertToUnixPath(filePath) {
  return filePath.replace(/\\/g, "/");
}
function makeReferenceId(fileNameNoExt) {
  const REFERENCE_ID = fileNameNoExt.replace(/\s+/g, "_").substring(0, 10);
  return REFERENCE_ID;
}
function catchError(event, e) {
  console.error(e);
  event.sender.send("notification", e, "error");
  event.sender.send("toggle-buttons");
}
