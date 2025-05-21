import { app, shell, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { File, Config } from '../types/types';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ICON = path.join(__dirname, '../../build/icon.png');
console.log('Icon path: ', ICON);
const CONFIG: Config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));

// Use unix-style paths for PitStop POST requests
// Used in the JSON payload for the POST request

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { ICON } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.handle('choose-file', async (event: IpcMainInvokeEvent) => {
  event.sender.send('toggle-buttons');
  const RESULT = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });
  event.sender.send('toggle-buttons');
  return RESULT.filePaths[0];
});

ipcMain.handle('post-job', async (event: IpcMainInvokeEvent, parameters) => {
  try {
    event.sender.send('toggle-buttons');
    // Ping PLC to check if it is running
    const isRunning = await isPLCRunning();
    if (isRunning === false) throw new Error('Unable to connect to PLC.');

    let file: File = {
      nameInput: path.basename(parameters.filePath),
      nameInputNoExt: '',
      nameOutput: path.basename(parameters.filePath, path.extname(parameters.filePath)) + '_output.pdf',
    }
    file.nameInputNoExt = path.basename(file.nameInput, path.extname(parameters.filePath));

    // Prefix unix-style paths to action list and preflight profile names
    if (parameters.actionListsNames.length > 0) {
      parameters.actionListsNames = parameters.actionListsNames.map((name: string) => {
        return convertToUnixPath(path.join(CONFIG.docker.mounted.actionListsPath, name));
      });
    }
    if (parameters.preflightProfileName) {
      parameters.preflightProfileName = convertToUnixPath(path.join(CONFIG.docker.mounted.preflightProfilesPath, parameters.preflightProfileName));
    }

    // Copy input file to Docker input folder and delete previous output file(s) if it exists
    copyFileToDocker(parameters.filePath);
    checkAndDeleteOutputFile(file);

    // Create reference ID using the input file's name
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
        "configFileURL": CONFIG.docker.mounted.reportTemplatePath,
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
      path: '/job',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': DATA.length
      }
    };
    const REQUEST = http.request(OPTIONS, (res) => {
      let responseData: any;
      if (res.statusCode === 200) {
        event.sender.send('notification', `${file.nameInput} has been received and will be processed.`, 'info');
      }
      console.log(`STATUS: ${res.statusCode}`);
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        console.log(`Body: ${chunk}`);
        responseData = JSON.parse(chunk);
        if (res.statusCode !== 200) {
          try {
            throw `Error ${responseData.statusCode}: ${responseData.message}.`;
          } catch (e) {
            catchError(event, e as Error);
          }
        }
      });
      res.on('end', async () => {
        if (res.statusCode === 200) {
          openOutput(event, parameters, file);
        }
      });
    });
    REQUEST.on('error', (e) => {
      console.error(`${e.message}`);
    });
    REQUEST.write(DATA);
    REQUEST.end();
  } catch (e) {
    catchError(event, e as Error);
  }
});

// Copies the annotated PDF report to the user's selected folder
ipcMain.handle('download-report', async (event: IpcMainInvokeEvent, reportFileName: string) => {
  event.sender.send('toggle-buttons');
  const REPORT_PATH = path.join(CONFIG.docker.reportsPath, reportFileName);
  // The exported file is a bit different than what is on Docker
  const REPORT_FILE_NAME = path.basename(reportFileName, path.extname(reportFileName)) + '_annotated_report.pdf';
  const RESULT = await dialog.showSaveDialog({
    defaultPath: REPORT_FILE_NAME,
    title: 'Save Annotated PitStop Report',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });
  if (RESULT.canceled === false) {
    try {
      fs.copyFileSync(REPORT_PATH, RESULT.filePath);
      event.sender.send('notification', `Report downloaded to ${RESULT.filePath}`, 'success');
    } catch (e) {
      catchError(event, e as Error);
    }
  }
  event.sender.send('toggle-buttons');
});

function copyFileToDocker(src: string) {
  try {
    fs.copyFileSync(src, path.join(CONFIG.docker.inputPath, path.basename(src)));
    console.log(`File copied to Docker: ${src}`);
  } catch (e) {
    throw `Error copying input file to PLC: ${e}`;
  }
}

/* Check if the output file already exists. This is to prevent the app from opening a
previously generated file while PLC is still processing same input file. */
function checkAndDeleteOutputFile(file: File) {
  const OUTPUT_FILE_PATH = path.join(CONFIG.docker.outputPath, file.nameOutput);
  const OUTPUT_JSON_FILE_PATH = path.join(CONFIG.docker.reportsPath, file.nameInputNoExt + '.json');
  const OUTPUT_PDF_REPORT_PATH = path.join(CONFIG.docker.reportsPath, file.nameInputNoExt + '.pdf');
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

/* Tries multiple times to open the output PDF/report. Depending on the PDF, PLC may take
longer to generate the output file. */
function openOutput(event, parameters, file: File) {
  const MAX_ATTEMPTS = 15;
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
      catchError(event, e as Error);
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
        setTimeout(() => { // Wait for the PDF to open before enabling buttons
          event.sender.send('toggle-buttons');
        }, 2000);
      } else {
        event.sender.send('toggle-buttons');
      }
    } catch (error) {
      console.error(`Open attempt ${attemps}: ${error}`);
    }
  }, 1000);
}

function openPDFInDefaultApp(file: File) {
  const OUTPUT_FILE_PATH = path.join(CONFIG.docker.outputPath, file.nameOutput);
  try {
    if (fs.existsSync(OUTPUT_FILE_PATH)) {
      shell.openPath(OUTPUT_FILE_PATH);
    } else {
      throw new Error(`Output file not found: ${OUTPUT_FILE_PATH}`);
    }
  } catch (e) {
    throw e;
  }
}

// Send the JSON report to the renderer process for processing and formatting
function openJSONReport(event: IpcMainInvokeEvent, file: File) {
  const REPORT_FILE_PATH = path.join(CONFIG.docker.reportsPath, file.nameInputNoExt + '.json');
  try {
    if (fs.existsSync(REPORT_FILE_PATH)) {
      const REPORT_DATA = fs.readFileSync(REPORT_FILE_PATH, 'utf8');
      event.sender.send('receive-report', JSON.parse(REPORT_DATA));
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

    PING_REQ.on('error', () => {
      resolve(false);
    });

    PING_REQ.end();
  });
}

function notifyJobProcessed(event: IpcMainInvokeEvent, FILE_NAME_OUTPUT: string) {
  event.sender.send('notification', `<b>${FILE_NAME_OUTPUT}</b> has been processed successfully.`, 'success');
}

function convertToUnixPath(filePath: string) {
  return filePath.replace(/\\/g, '/');
}

function makeReferenceId(fileNameNoExt: string) {
  const REFERENCE_ID = fileNameNoExt.replace(/\s+/g, '_').substring(0, 10);
  return REFERENCE_ID;
}

function catchError(event: IpcMainInvokeEvent, e: Error | string) {
  console.error(e);
  event.sender.send('notification', e, 'error');
  event.sender.send('toggle-buttons');
}