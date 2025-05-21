let filePath = "";
function init() {
  window.addEventListener("DOMContentLoaded", () => {
    const ELEMENT_FILE_NAME = document.getElementById("file-name");
    ELEMENT_FILE_NAME.textContent = ELEMENT_FILE_NAME.getAttribute("data-no-file");
    const INPUT_FILE = document.getElementById("input-file");
    INPUT_FILE.addEventListener("click", async (event) => {
      event?.preventDefault();
      const FILE_PATH = await window.electron.chooseFile();
      if (!FILE_PATH) {
        ELEMENT_FILE_NAME.textContent = ELEMENT_FILE_NAME.getAttribute("data-no-file");
        filePath = "";
        createNotification("File selection cancelled.", "info");
        return;
      }
      filePath = FILE_PATH;
      ELEMENT_FILE_NAME.textContent = FILE_PATH.split(/(\\|\/)/g).pop() || "";
    });
    const LABEL_INPUT_FILE = document.querySelector('label[for="input-file"]');
    LABEL_INPUT_FILE.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        INPUT_FILE.click();
      }
    });
    document.getElementById("btn-upload").addEventListener("click", async () => {
      const CHECKBOXES = document.getElementById("container-options").querySelectorAll('input[type="checkbox"]');
      const RADIO_BUTTONS = document.getElementById("container-options").querySelectorAll('input[type="radio"]');
      const CHECKED_CHECKBOXES = Array.from(CHECKBOXES).filter((checkbox) => checkbox.checked);
      const CHECKED_RADIO_BUTTONS = Array.from(RADIO_BUTTONS).filter((radio) => radio.checked);
      if (CHECKED_CHECKBOXES.length === 0 && CHECKED_RADIO_BUTTONS[0].getAttribute("data-file-name") === "None") {
        createNotification("Please select at least one action or preflight profile.", "warning");
        return;
      }
      if (filePath === "") {
        createNotification("Please select a file.", "warning");
        return;
      }
      await window.electron.postJob(returnPitStopParameters());
    });
    document.getElementById("btn-download-report").addEventListener("click", async () => {
      const FILE_NAME = document.getElementById("btn-download-report").getAttribute("data-file-name");
      console.log("FILE_NAME: ", FILE_NAME);
      await window.electron.downloadReport(FILE_NAME);
    });
    document.getElementById("btn-close-report").addEventListener("click", () => {
      const CONTAINER_REPORT = document.getElementById("container-report");
      CONTAINER_REPORT.classList.remove("fade-in");
      CONTAINER_REPORT.classList.add("fade-out");
      setTimeout(() => {
        CONTAINER_REPORT.style.display = "none";
        CONTAINER_REPORT.classList.remove("fade-out");
      }, 200);
    });
  });
}
function returnPitStopParameters() {
  const CHECKBOXES_ACTION_LISTS = document.getElementById("container-options-action-lists").querySelectorAll('input[type="checkbox"]');
  const CHECKBOXES_PREFLIGHT_PROFILES = document.getElementById("container-options-preflight-profiles").querySelectorAll('input[type="radio"]');
  const PARAMETERS = {
    preflightProfileName: "",
    actionListsNames: [],
    filePath
  };
  CHECKBOXES_ACTION_LISTS.forEach((checkbox) => {
    if (checkbox.checked) {
      const ATTRIBUTE = checkbox.getAttribute("data-file-name");
      if (ATTRIBUTE) PARAMETERS.actionListsNames.push(ATTRIBUTE);
    }
  });
  CHECKBOXES_PREFLIGHT_PROFILES.forEach((radio) => {
    if (radio.checked) {
      const ATTRIBUTE = radio.getAttribute("data-file-name");
      if (ATTRIBUTE && ATTRIBUTE !== "None") {
        PARAMETERS.preflightProfileName = ATTRIBUTE;
      }
    }
  });
  console.log("PitStop Parameters: ", PARAMETERS);
  return PARAMETERS;
}
init();
function createNotification(message, logLevel) {
  const CONTAINER_NOTIFICATION = document.getElementById("container-notification");
  CONTAINER_NOTIFICATION.classList.remove("notification-info");
  CONTAINER_NOTIFICATION.classList.remove("notification-warning");
  CONTAINER_NOTIFICATION.classList.remove("notification-error");
  CONTAINER_NOTIFICATION.classList.remove("notification-success");
  CONTAINER_NOTIFICATION.classList.add(`notification-${logLevel}`);
  CONTAINER_NOTIFICATION.classList.remove("notification-in");
  void CONTAINER_NOTIFICATION.offsetWidth;
  CONTAINER_NOTIFICATION.classList.add("notification-in");
  const MESSAGE = document.getElementById("notification-message");
  MESSAGE.innerHTML = message;
}
function toggleButtons() {
  const BUTTONS = document.querySelectorAll("button, input, label");
  BUTTONS.forEach((button) => {
    if (button.classList.contains("btn-disabled")) {
      button.classList.remove("btn-disabled");
      button.disabled = false;
    } else {
      button.classList.add("btn-disabled");
      button.disabled = true;
    }
  });
}
function returnReportHTML(REPORT_ITEMS) {
  let HTML = "";
  REPORT_ITEMS.forEach((item) => {
    const MESSAGE = item.message;
    HTML += `<p>➵ ${MESSAGE}</p>`;
  });
  return HTML;
}
function animateReportEnter() {
  const CONTAINER_REPORT_CONTENT = document.getElementById("container-report-content");
  const ELEMENTS = CONTAINER_REPORT_CONTENT.children;
  for (let i = 0; i < ELEMENTS.length; i++) {
    const ELEMENT = ELEMENTS[i];
    setTimeout(() => {
      ELEMENT.classList.add("element-enter");
    }, i * 50);
  }
}
function pluralizeWord(count, singularWord) {
  if (count !== 1 && singularWord.toLowerCase().endsWith("x")) {
    return `${singularWord}es`;
  }
  return count === 1 ? singularWord : `${singularWord}s`;
}
window.electron.onReport((report) => {
  console.log(report);
  const CONTAINER_REPORT_CONTENT = document.getElementById("container-report-content");
  CONTAINER_REPORT_CONTENT.innerHTML = "";
  const CONTAINER_REPORT = document.getElementById("container-report");
  CONTAINER_REPORT.style.display = "flex";
  CONTAINER_REPORT.classList.add("fade-in");
  const ERRORS_NUMBER = report.preflightReport.errorsNumber;
  const WARNINGS_NUMBER = report.preflightReport.warningsNumber;
  const FIXES_NUMBER = report.preflightReport.fixesNumber;
  document.getElementById("report-file-name").textContent = report.generalDocInfo.documentProperties.documentName;
  document.getElementById("report-errors-number").textContent = ERRORS_NUMBER;
  document.getElementById("report-warnings-number").textContent = WARNINGS_NUMBER;
  document.getElementById("report-fixes-number").textContent = FIXES_NUMBER;
  const ELEMENT_DOWNLOAD_REPORT = document.getElementById("btn-download-report");
  ELEMENT_DOWNLOAD_REPORT.setAttribute("data-file-name", report.generalDocInfo.documentProperties.documentName);
  const ELEMENT_ERRORS_TEXT = document.getElementById("report-errors-text");
  const ELEMENT_WARNINGS_TEXT = document.getElementById("report-warnings-text");
  const ELEMENT_FIXES_TEXT = document.getElementById("report-fixes-text");
  ELEMENT_ERRORS_TEXT.textContent = pluralizeWord(ERRORS_NUMBER, "Error");
  ELEMENT_WARNINGS_TEXT.textContent = pluralizeWord(WARNINGS_NUMBER, "Warning");
  ELEMENT_FIXES_TEXT.textContent = pluralizeWord(FIXES_NUMBER, "Fix");
  const REPORT_ITEMS = report.preflightReport.fixes.preflightReportItem;
  console.log("JSON_REPORT_ITEMS: ", REPORT_ITEMS);
  CONTAINER_REPORT_CONTENT.innerHTML = returnReportHTML(REPORT_ITEMS);
  animateReportEnter();
});
window.electron.toggleButtons(() => {
  toggleButtons();
});
window.electron.onNotification((message, logLevel) => {
  createNotification(message, logLevel);
});
