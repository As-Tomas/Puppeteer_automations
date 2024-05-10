const fs = require("fs");
const parse = require("csv-parse").parse;
const puppeteer = require("puppeteer");
const stringify = require("csv-stringify").stringify;
const path = require("path");

const secrets = require("./secrets");
const { count } = require("console");
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

  let count = 0;
  const totalProducts = products.length;
  for (const product of products) {
    count++;
    const { SKU } = product;
    await page.evaluate(
      () => (document.querySelector('input[name="q"]').value = "")
    );

    // If SKU contains anything other than numbers, skip this product
    if (!/^\d+$/.test(SKU)) {
      continue;
    }

    if (/^\d+$/.test(SKU)) {
      await page.type('input[name="q"]', SKU, { delay: 100 });
      // await page.waitForNavigation({ waitUntil: 'networkidle0' });

      await new Promise((resolve) => setTimeout(resolve, 1000));
      // setTimeout(5000);

      try {
        // First, check for "Ingen treff på" within the search results
         // Use XPath to check for "Ingen treff på" text within the search results
      const noHitsXPath = `//div[contains(text(), 'Ingen treff på ${SKU}') or contains(text(), 'Ingen resultater for ${SKU}')]`;
      const noHits = await page.$x(noHitsXPath);
      if (noHits.length > 0) {
        product["Availability"] = "Ingen treff på";
      } else {
          const skuLinkSelector = `a[href*="${SKU}"][data-scope-link="true"]`;
          await page.waitForSelector(skuLinkSelector, {
            timeout: 5000,
          });

          // Evaluate the page for availability or other relevant details
          const availabilityInfo = await page.evaluate((selector) => {
            const linkElement = document.querySelector(selector);
            const parentElement = linkElement.closest("section"); // adjust this to step back to a common ancestor if needed
            return parentElement ? parentElement.innerText : "Not found";
          }, skuLinkSelector);

          // Parse the availability or other data from the innerText
          if (availabilityInfo.includes("Nettlager")) {
            const match = availabilityInfo.match(
              /Nettlager \((\d+\+|\d+-\d+)\)/
            );
            product["Availability"] = match ? match[1] : "Limited stock";
          } else if (availabilityInfo.includes("Bestillingsvare")) {
            product["Availability"] = "Bestillingsvare";
          } else if (availabilityInfo.includes("Forventet på lager")) {
            product["Availability"] = "Forventet på lager";
          } else if (availabilityInfo.includes("Noe gikk galt")) {
            product["Availability"] = "Noe gikk galt";
          } else {
            product["Availability"] = "Not found";
          }          
        }
      } catch (error) {
        console.log("error", error);
        console.log("No AJAX response or timeout reached for SKU:", SKU);
        product["Availability"] = "Not found";
        // continue; // Skip to the next product if no relevant response is found
      }      
    }
    console.log( count, ' of ', totalProducts, ' product["Availability"] ', SKU, " ", product["Availability"]);
  }
  return products;
}

async function saveUpdatedCSV(updatedProducts) {
  stringify(
    updatedProducts,
    {
      header: true,
      columns: Object.keys(updatedProducts[0]),
    },
    (err, csvString) => {
      if (err) {
        throw err;
      }
      const dir = path.dirname(filePath);
      const filename = path.basename(filePath);
      const newFilePath = path.join(dir, "UPDATED_Storage_" + filename);
      fs.writeFileSync(newFilePath, csvString);
      console.log("Updated CSV file saved to:", newFilePath);
    }
  );
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
