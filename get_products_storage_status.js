const fs = require("fs");
const parse = require("csv-parse").parse;
const puppeteer = require("puppeteer");
const stringify = require("csv-stringify").stringify;

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
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      
      try {
        await page.waitForXPath(
          `//div[contains(text(),'Ingen treff på ${SKU}')]`
        );
      } catch (error) {
        console.log("No AJAX response or timeout reached for SKU:", SKU);
        continue; // Skip to the next product if no relevant response is found
      }

      const responseText = await page.evaluate(() => {
        // We can adjust this part to target a more specific element if the above waitForSelector is still too broad
        const el = document.querySelector('[data-scope-link="true"]');
        return el ? el.innerText : "";
      });

      // Interpret AJAX response
      if (responseText.includes("Ingen treff på")) {
        product["Availability"] = "NOT FOUND";
      } else if (responseText.match(/Nettlager \((\d+\+)\)/)) {
        product["Availability"] = RegExp.$1; // Extracts the quantity
      } else if (responseText.includes("Bestillingsvare")) {
        product["Availability"] = "Bestillingsvare";
      } else if (responseText.includes("Forventet på lager")) {
        product["Availability"] = "On delivery";
      } else if (responseText.includes("Noe gikk galt")) {
        product["Availability"] = "0";
      }
      console.log('product["Availability"] ', product["Availability"]);

      // Clear the search field
      await page.evaluate(
        () => (document.querySelector('input[name="q"]').value = "")
      );
    }
  }
  return products;
}

async function saveUpdatedCSV(updatedProducts) {
  const csvString = stringify(updatedProducts, {
    header: true,
    columns: Object.keys(updatedProducts[0]),
  });
  fs.writeFileSync("UPDATED_Storage_" + filePath, csvString);
}

(async () => {
  try {
    const records = await readCSV(filePath);
    const { page, browser } = await setupBrowser();
    const updatedProducts = await processSKUs(page, records);
    await saveUpdatedCSV(updatedProducts);
    await browser.close();
  } catch (error) {
    console.error("An error occurred:", error);
  }
})();
