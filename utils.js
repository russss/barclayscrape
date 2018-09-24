// Click a link and wait for the navigation state to go to idle.
exports.click = (page, selector) => {
  // Executing el.click() within the page context with $eval means we can
  // click invisible links, which simplifies things.
  return Promise.all([
    page.$eval(selector, el => el.click()),
    page.waitForNavigation(),
  ]);
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
    const screenshotFile = './error.png';
    await page.screenshot(screenshotFile);
    throw `Couldn't find selector "${selector}" on page ${page.url()}. Screenshot saved to ${screenshotFile}.`;
  }
};
