Test each product storage status from products csv file by doing search by product number ussing puppeteer library.
1. Read the CSV File: We'll read the data from the CSV file to get the list of product SKUs.
2. Set Up Puppeteer and Open the Website: We'll launch Puppeteer, navigate to the website, and ensure it's fully loaded.
3. Validate Search Form: Check if the correct search form exists.
4. SKU Processing:
    Validate the SKU format.
    Input the SKU in the search form.
    Fetch and interpret the AJAX response.
5. Store SKU Status:
    Based on AJAX response, categorize and store the SKU status.
6. Update and Save the CSV: Append the new data to the existing object and save it with a new filename.