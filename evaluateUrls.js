import { createBrowser, createReportWithBrowser } from "./lighthouse-util.js";
import 'dotenv/config.js'
import fs from "fs";

(async () => {
  const urlsString =  process.env.URLS_TO_EVALUATE

  if(!urlsString){
    return
  }

  if (!fs.existsSync('results')) {
    // If it doesn't exist, create it
    fs.mkdirSync('results');
    console.log("Created results directory");
  }

  const files = fs.readdirSync('results');

  for (const file of files) {
    if (file.endsWith('.html')) {
      fs.unlinkSync(`results/${file}`);
      console.log(`Removed previous report: ${file}`);
    }
  }
  console.log(`Removed previous reports`);

  const urls = urlsString.split(',');

  const browser = await createBrowser();

  for (const url of urls) {
    console.log("Evaluating: ", url)
    const result = await createReportWithBrowser(browser, url, {
      output: "html"
    });
    if (result.report) {
      console.log("Report generated successfully!");
      const filename = url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
      fs.writeFileSync(`results/${filename}`, result.report, "utf-8");
      console.log('Results saved to results folder')
    } else {
      console.error(`No report generated for URL: ${url}`);
    }
  }
  await browser.close();
})().catch(console.error);