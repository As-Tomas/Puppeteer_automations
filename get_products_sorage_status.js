const fs = require('fs');
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify/lib/sync');

// Read the CSV file
const filePath = '/path/to/your/csv.csv';
const fileContent = fs.readFileSync(filePath);
const records = parse(fileContent, {
  columns: true,
  skip_empty_lines: true
});

console.log(records);

const puppeteer = require('puppeteer');

async function setupBrowser() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://mysite.com', { waitUntil: 'networkidle0' });
  return { browser, page };
}

async function processSKUs(page, products) {
    const formExists = await page.$('form[action="/sok"]');
    if (!formExists) {
      throw new Error("Search form not found.");
    }
  
    for (const product of products) {
      const { SKU } = product;
      if (/^\d+$/.test(SKU)) { // Ensure SKU is numeric
        await page.type('input[name="q"]', SKU, { delay: 100 });
        await page.waitForSelector('.ajax-response-class', { visible: true });
        const responseText = await page.$eval('.ajax-response-class', el => el.textContent);
  
        // Interpret AJAX response
        if (responseText.includes("Ingen treff på")) {
          product.status = "NOT FOUND";
        } else if (responseText.match(/Nettlager \((\d+)\)/)) {
          product.status = RegExp.$1;
        } else if (responseText.includes("Bestillingsvare")) {
          product.status = "Bestillingsvare";
        } else if (responseText.includes("Forventet på lager")) {
          product.status = "On delivery";
        } else if (responseText.includes("Noe gikk galt")) {
          product.status = 0;
        } else {
          product.status = "Unknown";
        }
  
        // Clear the search field
        await page.evaluate(() => document.querySelector('input[name="q"]').value = '');
      }
    }
  
    return products;
  }
  

  async function saveUpdatedCSV(updatedProducts) {
    const csv = stringify(updatedProducts, {
      header: true,
      columns: Object.keys(updatedProducts[0])
    });
    fs.writeFileSync('UPDATED_Storage_' + filePath, csv);
  }
  
  //all these functions together in a main async function that orchestrates everything:
  (async () => {
    try {
      const { page, browser } = await setupBrowser();
      const updatedProducts = await processSKUs(page, records);
      await saveUpdatedCSV(updatedProducts);
      await browser.close();
    } catch (error) {
      console.error("An error occurred:", error);
    }
  })();
  