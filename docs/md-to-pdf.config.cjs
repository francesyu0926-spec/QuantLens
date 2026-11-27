const fs = require("fs");
const edge32 =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const edge64 = "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";
const chrome =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const exe = [edge64, edge32, chrome].find((p) => fs.existsSync(p));

module.exports = {
  stylesheet: ["pdf-print.css"],
  body_class: "markdown-body",
  launch_options: exe
    ? { executablePath: exe, headless: true, args: ["--no-sandbox"] }
    : { headless: true, args: ["--no-sandbox"] },
  pdf_options: {
    format: "A4",
    margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
    printBackground: true,
  },
};