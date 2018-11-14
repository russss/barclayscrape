// Look for a warning on the page and raise it as an error.
async function raiseWarning(page) {
  const warningText = await page.$eval('.notification--warning', el => {
    if (el) {
      el.textContent;
    }
  });

  console.log(warningText);

  if (warningText) {
    throw `Barclays Error: "${warningText.trim()}" (while fetching ${selector})`;
  }
}

// Click a link and wait for the navigation state to go to idle.
exports.click = async (page, selector) => {
  try {
    await Promise.all([
      page.waitForNavigation({timeout: 10000}),
      // Executing el.click() within the page context with $eval means we can
      // click invisible links, which simplifies things.
      page.$eval(selector, el => el.click()),
    ]);
  } catch (err) {
    throw `Error when clicking ${selector} on URL ${page.url()}: ${err}`;
  }
};

exports.fillFields = async (page, form) => {
  // Disappointingly, you can't type into multiple fields simultaneously.
  for (let key of Object.keys(form)) {
    await page.type(key, form[key]);
  }
};

exports.getAttribute = (page, element, attribute) => {
  return page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
};

// Wait for a selector to become visible, and issue a nice error if it doesn't.
exports.wait = async (page, selector) => {
  try {
    await page.waitFor(selector, {timeout: 10000});
  } catch (err) {
    raiseWarning(page);

    const screenshotFile = './error.png';
    await page.screenshot(screenshotFile);
    throw `Couldn't find selector "${selector}" on page ${page.url()}. Screenshot saved to ${screenshotFile}.`;
  }
};
