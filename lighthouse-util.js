import puppeteer from "puppeteer";
import lighthouse from "lighthouse";
import { URL } from "url"; // Import URL class separately
import fs from "fs";
import archiver from "archiver";
import "dotenv/config.js";
import axios from "axios";
import { google } from "googleapis";
import btoa from "btoa";
import { mailList } from "./constants.js";
import * as nodemailer from "nodemailer";

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

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI;
const REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const date = new Date();
const currentDate =
  date.getDate() + "-" + (date.getMonth() + 1) + "-" + date.getFullYear();
const currentTime = date.getHours() + ":" + date.getMinutes();

const drive = google.drive({
  version: "v3",
  auth: oauth2Client,
});

export async function uploadFile() {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: `TestReport_${currentDate}-${currentTime}_lighthouse.zip`,
        mimeType: "application/zip",
      },
      media: {
        mimeType: "application/zip",
        body: fs.createReadStream("results.zip"),
      },
    });
    const fileID = response.data.id;

    if (fileID) {
      await drive.permissions.create({
        fileId: fileID,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });

      const results = await drive.files.get({
        fileId: fileID,
        fields: "webViewLink, webContentLink",
      });
      console.log("done");
      return results.data.webViewLink;
    } else {
      return "File Failed to Upload (Size Limitation)";
    }
  } catch (error) {
    console.log(error);
  }
}

export async function addCommentToJira(link, reportResults, siteMap = false) {
  const apiTokenJira = process.env.JIRA_API_TOKEN;
  const usernameJira = process.env.JIRA_USERNAME;
  const url = `https://codeautomation.atlassian.net/rest/api/3/issue/${process.env.ISSUE_KEY}/comment`;

  /**Condional based Data for adding comment to jira is created here based on siteMap varibale */
  const data = !siteMap
    ? {
        body: {
          content: [
            {
              content: [
                {
                  text: `Report generated successfully for ${process.env.URLS_TO_EVALUATE}\n`,
                  type: "text",
                },
                {
                  text: `Performance: ${
                    reportResults.performance.score * 100
                  }%\n`,
                  type: "text",
                },
                {
                  text: `Accessibility ${
                    reportResults.accessibility.score * 100
                  }%\n`,
                  type: "text",
                },
                {
                  text: `Best Practices ${
                    reportResults["best-practices"].score * 100
                  }%\n`,
                  type: "text",
                },
                {
                  text: `SEO ${reportResults.seo.score * 100}%\n`,
                  type: "text",
                },
                {
                  text: `PWA ${reportResults.pwa.score * 100}%\n`,
                  type: "text",
                },
                {
                  text: `Report Link`,
                  type: "text",
                  marks: [
                    {
                      type: "link",
                      attrs: {
                        href: link,
                        title: "Report",
                      },
                    },
                  ],
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
          version: 1,
        },
      }
    : {
        body: {
          content: [
            {
              content: [
                {
                  text: `Site Map Report Generated successfully. SiteMap URL (${process.env.SITE_MAP_URL})\n`,
                  type: "text",
                },
                {
                  text: `detailed Stats are available in Report attached below\n`,
                  type: "text",
                },
                {
                  text: `Report Link`,
                  type: "text",
                  marks: [
                    {
                      type: "link",
                      attrs: {
                        href: link,
                        title: "Report",
                      },
                    },
                  ],
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
          version: 1,
        },
      };

      /**Jira Rest API is configured below */
  const config = {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${usernameJira}:${apiTokenJira}`)}`,
    },
  };

  /**Axios request to post jira Comments */

  await axios
    .post(url, data, config)
    .then((response) => {
      console.log("Comment Added to jira successfully", response.status);
    })
    .catch((error) => {
      console.error(
        "Error:",
        error.response ? error.response.data : error.message
      );
    });
}

export const sendEmail = async (reportLink, reportResults, siteMap = false) => {

  /** Unique Date and Time Variables Created Here */
  const date = new Date();
  const currentDate =
    date.getUTCMonth() +
    1 +
    "-" +
    date.getUTCDate() +
    "-" +
    date.getUTCFullYear();
  const userEmail = process.env.GMAIL_EMAIL;
  const userPassword = process.env.GMAIL_PASSWORD;

  const currentTime = date.getUTCHours() + ":" + date.getUTCMinutes();

  /**Transporter is created Below */

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: userEmail,
      pass: userPassword,
    },
  });

  /** Condional Bases HTML Body for Sitemap and Simple URL */

  const htmlBody = !siteMap
    ? `<h2><strong>Google Lighthouse Summary for ${
        process.env.URLS_TO_EVALUATE
      }</strong></h2>
  
  <h4><strong>Performance: ${
    reportResults.performance.score * 100
  }%</strong></h4>   
  <h4><strong>Accessibility: ${
    reportResults.accessibility.score * 100
  }%</strong></h4>   
  <h4><strong>Best Practices: ${
    reportResults["best-practices"].score * 100
  }%</strong></h4>   
  <h4><strong>SEO: ${reportResults.seo.score * 100}%</strong></h4>   
  <h4><strong>PWA: ${reportResults.pwa.score * 100}%</strong></h4>
  <h3>\nReport Link is Attached Below</h3>   
      <a href="${reportLink}">
      <strong>Report Link</strong>
      </a>`
    : `<h2><strong>Google Lighthouse Summary for SiteMap ${process.env.SITE_MAP_URL}</strong></h2>
      <h3>\nReport Link is Attached Below</h3>   
          <a href="${reportLink}">
          <strong>Report Link</strong>
          </a>`;



          /**Mail Formated Below  */

  const mailOptions = {
    from: userEmail,
    to: mailList,
    subject: `Light House Report of (${currentDate}-${currentTime} UTC)`,
    html: htmlBody,
  };


  /**Mail is Sended Here after formation */

  await transporter.sendMail({ ...mailOptions });
};
