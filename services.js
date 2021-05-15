const u = require('./utils.js');
const path = require('path');
const fs = require('fs');

// Class for accessing features from the 'All Online Services' header menu
module.exports = class Services {
	constructor(session) {
	  this.session = session;
	  this.page = session.page;
	}

	async invoke_menu(page) {
		// Download a single OFX for all accounts 
		await page.waitForSelector("a.button.viewAllOnlineServices")

		// nav menu has display: none, so we need to request the document clicks 'All Online Services' inline 
		await page.evaluate(() => {
			document.querySelector("a.button.viewAllOnlineServices").click();
		});
	}

	async get_ofx_combined(out_path) {
		// Barclays emits the download as data.ofx, unclear how to override this currently
		let dest_basename = 'data.ofx'
		let dest_filename = path.join(out_path, dest_basename)
	
		// delete any existing dest_filename in out_path
		try {
			await fs.unlink(dest_filename)
		} catch(err) {
		}
		  
		await this.invoke_menu(this.page);
	
		// click 'Export My Transaction data'
		await this.page.waitForSelector("a#link_113")
		await this.page.click("a#link_113")

		// wait for download dialog
		await this.page.waitForSelector("form[name='process-form']");
	
		// click next in download dialog
		await this.page.waitForSelector("input[type='submit']#next_step1");
		await this.page.click("input[type='submit']#next_step1");

		// wait for download button
		let download_button = "input[type='submit']#data-download";
		await this.page.waitForSelector(download_button);
		await this.page._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: out_path+'/'})
		await this.page.click(download_button);

		// delay for download (is there a more reliable way to detect a completed download response?)
		await this.page.waitForTimeout(3000);
	
		// verify existence of download file
		try {
		  if (fs.existsSync(dest_filename)) {
			console.log('OFX file exported as: ' + dest_filename)
		  }
		  else {
			console.log('Error: ' + dest_filename + ' does not exist after attempting OFX download')
		  }
		} catch(err) {
		  console.error('Error: ' + err)
		}
	}
}