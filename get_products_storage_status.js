const fs = require("fs");
const parse = require("csv-parse").parse;
const puppeteer = require("puppeteer");
const stringify = require("csv-stringify").stringify;
const path = require('path');

const secrets = require("./secrets");
const filePath = secrets.filePath;

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const parser = fs.createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      })
    );

    const records = [];
    parser.on("data", (record) => records.push(record));
    parser.on("end", () => resolve(records));
    parser.on("error", (error) => reject(error));
  });
}

async function setupBrowser() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1030, height: 1040 });
  await page.goto(secrets.sitePage, { waitUntil: "networkidle0" });
  return { browser, page };
}

async function processSKUs(page, products) {
  const formExists = await page.$('form[action="/sok"]');
  if (!formExists) {
    throw new Error("Search form not found.");
  }

  for (const product of products) {
    const { SKU } = product;

    

    if (/^\d+$/.test(SKU)) {
      await page.type('input[name="q"]', SKU, { delay: 100 });
      // await page.waitForNavigation({ waitUntil: 'networkidle0' });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      // setTimeout(5000);

      try {
        const skuLinkSelector = `a[href*="${SKU}"][data-scope-link="true"]`;
        await page.waitForSelector(skuLinkSelector, {
          timeout: 5000,
        }); 
        
        // Evaluate the page for availability or other relevant details
        const availabilityInfo = await page.evaluate((selector) => {
          const linkElement = document.querySelector(selector);
          const parentElement = linkElement.closest('section'); // adjust this to step back to a common ancestor if needed
          return parentElement ? parentElement.innerText : "Not found";
        }, skuLinkSelector);

        
        // Parse the availability or other data from the innerText
        if (availabilityInfo.includes("Nettlager")) {
          const match = availabilityInfo.match(/Nettlager \((\d+\+)\)/);
          product["Availability"] = match ? match[1] : "Limited stock";
        } else if (availabilityInfo.includes("Ingen treff på")) {
          product["Availability"] = "Not found";
        } else if (availabilityInfo.includes("Bestillingsvare")) {
          product["Availability"] = "Bestillingsvare";
        } else if (availabilityInfo.includes("Forventet på lager")) {
            product["Availability"] = "On delivery";
        } else if (availabilityInfo.includes("Noe gikk galt")) {
            product["Availability"] = "0";
        } else {
          product["Availability"] = "Not found";
        }
        console.log('product["Availability"] ', SKU, ' ', product["Availability"]);

      } catch (error) {
        console.log("error", error);
        console.log("No AJAX response or timeout reached for SKU:", SKU);
        product["Availability"] = "Not found";
       // continue; // Skip to the next product if no relevant response is found
      }     

      // console.log('responseText', responseText)
      // // Interpret AJAX response
      // if (responseText === "NOT FOUND") {
      //   product["Availability"] = "NOT FOUND";
      // } else if (responseText.match(/Nettlager \((\d+\+)\)/)) {
      //   product["Availability"] = RegExp.$1; // Extracts the quantity
      // } else if (responseText.includes("Bestillingsvare")) {
      //   product["Availability"] = "Bestillingsvare";
      // } else if (responseText.includes("Forventet på lager")) {
      //   product["Availability"] = "On delivery";
      // } else if (responseText.includes("Noe gikk galt")) {
      //   product["Availability"] = "0";
      // }
      // console.log('product["Availability"] ', product["Availability"]);

      // Clear the search field
      await page.evaluate(
        () => (document.querySelector('input[name="q"]').value = "")
      );
      await page.waitForTimeout(1000);
    }
  }
  return products;
}

async function saveUpdatedCSV(updatedProducts) {
  stringify(updatedProducts, {
    header: true,
    columns: Object.keys(updatedProducts[0]),
  }, (err, csvString) => {
    if (err) {
        throw err;
    }
    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);
    const newFilePath = path.join(dir, 'UPDATED_Storage_' + filename);
    fs.writeFileSync(newFilePath, csvString);
  });
}

(async () => {
  try {
    const records = await readCSV(filePath);
    const { page, browser } = await setupBrowser();
    const updatedProducts = await processSKUs(page, records);
    await saveUpdatedCSV(updatedProducts);
    // await browser.close();
  } catch (error) {
    console.error("An error occurred:", error);
  }
})();
