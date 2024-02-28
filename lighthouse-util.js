import puppeteer from "puppeteer";
import lighthouse from "lighthouse";
import { URL } from "url"; // Import URL class separately
import fs from "fs";
import archiver from "archiver";

export async function createBrowser() {
  const browser = await puppeteer.launch({
    args: ["--show-paint-rects"], // Required by lighthouse
  });

  return browser;
}

export async function createReportWithBrowser(
  browser,
  url,
  options = { output: "html" }
) {
  const endpoint = browser.wsEndpoint(); // Allows us to talk via DevTools protocol
  const endpointURL = new URL(endpoint); // Lighthouse only cares about the port, so we have to parse the URL so we can grab the port to talk to Chrome on
  return lighthouse(
    url,
    Object.assign(
      {},
      {
        port: endpointURL.port,
      },
      options
    ) // Allow options to override anything here
  );
}

export async function generatePDF(html, pdfPath) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const htmlContent = fs.readFileSync(html, "utf8");
  await page.setContent(htmlContent);
  await page.pdf({ path: pdfPath, format: "A4" });
  await browser.close();
}

export function zipDirectory(sourceDir, outPath) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = fs.createWriteStream(outPath);
  return new Promise((resolve, reject) => {
    archive
      .directory(sourceDir, false)
      .on("error", (err) => reject(err))
      .pipe(stream);
    stream.on("close", () => resolve());
    archive.finalize();
  });
}
