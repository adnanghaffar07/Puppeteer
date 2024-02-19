import puppeteer from "puppeteer";
import lighthouse from "lighthouse";
import { URL } from "url"; // Import URL class separately

export async function createBrowser() {
  const browser = await puppeteer.launch({
    args: ["--show-paint-rects"], // Required by lighthouse
  });

  return browser;
}

export async function createReportWithBrowser(browser, url, options = { output: "html" }) {
  const endpoint = browser.wsEndpoint(); // Allows us to talk via DevTools protocol
  const endpointURL = new URL(endpoint); // Lighthouse only cares about the port, so we have to parse the URL so we can grab the port to talk to Chrome on
  return lighthouse(
    url,
    Object.assign({}, {
      port: endpointURL.port
    }, options) // Allow options to override anything here
  );
}