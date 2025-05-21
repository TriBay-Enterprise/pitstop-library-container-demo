declare global {
    interface Window {
        electron: {
            onNotification: (handler: (message: string, logLevel: 'info' | 'warning' | 'error' | 'success') => void) => void
            postJob: (parameters) => Promise<void>
            chooseFile: () => Promise<string>
            toggleButtons: (callback: () => void) => void
            onReport: (handler: (report: string) => void) => void,
            downloadReport: (fileName: string) => Promise<void>
        };
    }
}

export interface PitStopParameters {
    preflightProfileName: string,
    actionListsNames: string[],
    filePath: string
}

export interface File {
    nameInput: string,
    nameInputNoExt: string,
    nameOutput: string,
}

export interface Config {
    "plc": {
        "hostname": string,
        "port": number
    },
    "docker": {
        "inputPath": string,
        "outputPath": string,
        "reportsPath": string,
        "mounted": {
            "inputPath": string,
            "outputPath": string,
            "reportsPath": string,
            "preflightProfilesPath": string,
            "actionListsPath": string,
            "reportTemplatePath": string
        }
    }
}