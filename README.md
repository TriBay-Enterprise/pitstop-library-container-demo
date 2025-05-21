# PitStopLibraryContainerDemo
A simple front-end for Enfocus PitStop Library Container (PLC). Made with Electron-Vite and TypeScript using SCSS as a CSS preprocessor for styling.

Upload a PDF, preflight and/or use action lists, and see the output!

## Feature List
* Premade action lists, with the ability to enable/disable certain actions
* Premade preflight profile for 4" x 6" postcards, with an included sample postcard
* Human-readable preflight report, using data from the PLC JSON report
* Annotated report export

The action lists, preflight profile, report preferences file, and sample postcard are located in the `Resources` folder in the repository's root directory.

## Setup Instructions
Refer to the Enfocus [PLC user guide](https://www.enfocus.com/en/support/manuals/pitstop-library-container-manuals) to set up PLC. This app will not work if PLC is not set up correctly. Enfocus provides a [Postman collection file](https://go.enfocus.com/PLC-postman-collection) for testing.

After verifying that PLC is correctly receiving API calls, navigate to the `plc-demo` folder through the terminal and execute `npm i` to install dependencies.

Fill in the **config.json** file located in `plc-demo/out`. The mounted paths are used in the payload, which needs to refer to the mounted Docker drive, while the other paths are used by the PLC demo app for copying and reading files.
```
{
    "plc": {
        "hostname": "localhost",
        "port": 3002
    },
    "docker": {
        "inputPath": "C:/Users/Newye/Desktop/TriBay/Docker/Input",
        "outputPath": "C:/Users/Newye/Desktop/TriBay/Docker/Output",
        "reportsPath": "C:/Users/Newye/Desktop/TriBay/Docker/Reports",
        "mounted": {
            "inputPath": "/root/Input",
            "outputPath": "/root/Output",
            "reportsPath": "/root/Reports",
            "preflightProfilesPath": "/root/PitStop",
            "actionListsPath": "/root/PitStop",
            "reportTemplatePath": "/root/PitStop/PitStopReportAnnotated.prefs"
        }
    }
}
```
### Config Properties References
Input PDFs are located in the `inputPath`.  When the user selects a PDF and uploads it to PLC, the PLC demo app copies the PDF to this Docker input folder for PLC to reference.

PLC sends the processed PDF to the `outputPath`.

PLC sends the JSON and annotated reports to the `reportsPath`.

Preflight profiles are located in the `preflightProfilesPath`.

Action lists are located in the `actionListsPath`.

The report template is located in the `reportTemplatePath`.

## Running and Modifying the Dev Environment
1. Navigate to the `plc-demo` folder through the terminal.
2. Execute `run npm dev`. This will provide a dev environment where you can modify the code and see changes live, courtesy of Vite's hot module replacement (HMR) feature. The TypeScript code does not need to be compiled.
3. If you're using VSCode, install the [Live Sass Compiler extension by Glenn Marks](https://marketplace.visualstudio.com/items?itemName=ritwickdey.live-sass) to compile the **.scss** files to **.css**.

## Building the Executable
Navigate to the `plc-demo` folder through the terminal.
#### **Windows**
Execute `npm run build:win`.
#### **MacOS**
Execute `npm run build:mac`.
#### **Linux**
Execute `npm run build:linux`.

#### Your executable will be located in `plc-demo/dist`.