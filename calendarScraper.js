/*
Loughborough University Timetable Scraper
==========================================
Author: Sam Richardson

This script logs into the Loughborough University timetable system, handles Duo authentication, 
and downloads the timetable data for the specified semester in CSV format.

Usage:
node script.js <username> <password> <semester>

Example:
node script.js <username> <password> sem1
*/

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

function wait(millis) {
  return new Promise((resolve) => {
    setTimeout(resolve, millis); // 1000 milliseconds = 1 second
  });
}

async function loginAndHandleDuo(username, password, semester) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const downloadPath = path.resolve(__dirname, "downloads");
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadPath,
  });

  try {
    // Navigate to the login page
    await page.goto("https://lucas.lboro.ac.uk/its_apx/f?p=250:2::::::", {
      waitUntil: "networkidle2",
    });

    // Login process
    await page.waitForSelector("input#username", { timeout: 10000 });
    await page.type("input#username", username);
    await page.waitForSelector("input#password", { timeout: 10000 });
    await page.type("input#password", password);
    await page.click('input[type="submit"]');

    // Wait for either the Duo button or the MY_SET_ID selector
    console.log("Waiting for either Duo button or MY_SET_ID...");

    const element = await Promise.race([
      page
        .waitForSelector("#dont-trust-browser-button", { timeout: 60000 })
        .then(() => "dontTrustButton"),
      page
        .waitForSelector("#P2_MY_SET_ID", { timeout: 60000 })
        .then(() => "setId"),
    ]);

    if (element === "dontTrustButton") {
      console.log("Don't trust browser button found");
      await page.click("#dont-trust-browser-button");
      console.log(
        'Selected "Don\'t trust this browser". Duo authentication handled.'
      );
    } else if (element === "setId") {
      console.log("MY_SET_ID element found, bypassed Duo.");
    }

    // wait for period selectors on the timetable
    await page.waitForSelector("#P2_MY_SET_ID", { timeout: 10000 });
    await page.waitForSelector("#P2_MY_PERIOD", { timeout: 10000 });

    // Manually trigger the onchange event by directly calling the function, passing the semester parameter
    await page.evaluate((semester) => {
      const selectElement = document.querySelector("#P2_MY_PERIOD");
      selectElement.value = semester;
      process_action("my_indv_tab");
    }, semester);

    console.log("Semester 1 selected.");

    //wait for page to load
    await wait(500);

    // Inject jQuery if not present
    await page.evaluate(() => {
      if (typeof jQuery === "undefined") {
        const script = document.createElement("script");
        script.src = "https://code.jquery.com/jquery-3.6.0.min.js";
        document.head.appendChild(script);
      }
    });

    // Wait for jQuery to load
    await page.waitForFunction(() => typeof jQuery !== "undefined");

    // Inject and execute the lboro-calendar-scraper script
    const scraperPath = path.join(__dirname, "scraper.js");
    const scraperScript = fs.readFileSync(scraperPath, "utf8");
    await page.evaluate(scraperScript);

    console.log("Timetable script executed.");

    // Wait to ensure download completes
    await wait(800);
  } catch (error) {
    console.error("An error occurred during the process:", error);
  } finally {
    console.log("done!");
    await browser.close();
  }
}

// Capture command-line arguments
const args = process.argv.slice(2); // Skip the first two arguments (node and script path)
if (args.length < 3) {
  console.error("Usage: node script.js <username> <password> <semester>");
  process.exit(1); // Exit with an error code
}

const [username, password, semester] = args;

// Call the function with the provided command-line arguments
loginAndHandleDuo(username, password, semester);
