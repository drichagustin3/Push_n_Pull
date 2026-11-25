// Optional browser evidence on the runner-created disposable target-contract DB only.
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { createApp } = require('../../src/create-app');
const { readAuthConfig } = require('../../src/auth/config');
(async () => {
  assert.ok(process.env.PRICE_HISTORY_INTEGRATION === '1' && process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const { chromium } = require(process.env.HOPE_PLAYWRIGHT_MODULE);
  const { expect } = require(path.join(process.env.HOPE_PLAYWRIGHT_MODULE, 'test'));
  const evidence = path.join(path.dirname(process.env.PGHOST), 'browser-evidence'); await mkdir(evidence, { mode: 0o700 });
  const pool = new Pool(); let app, browser, server;
  try {
    assert.equal((await pool.query('SELECT inet_server_addr() IS NULL local')).rows[0].local, true);
    // Restore the fixture audit trigger removed by the API negative test.
    await pool.query("CREATE TRIGGER pricehist_aiu_audit AFTER INSERT OR UPDATE ON pricehist FOR EACH ROW EXECUTE FUNCTION trg_audit_log('effdate','prodcode')");
    const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password,12);
    for (const role of ['admin','user']) await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Browser','Fixture',$1,$2,$3,'active')",['history-browser-'+role+'@example.test',hash,role]);
    await pool.query("INSERT INTO user_permission(user_id,right_code) SELECT user_id,'price.add' FROM app_user WHERE email='history-browser-user@example.test'");
    server=createServer((req,res)=>app(req,res)); server.listen(0,'127.0.0.1'); await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    app=createApp({pool,authConfig:readAuthConfig({SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:origin},'test')});
    browser=await chromium.launch({headless:true}); const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.name));
    const login=async role=>{await page.goto(origin+'/login');await page.getByLabel('Email address',{exact:true}).fill('history-browser-'+role+'@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/account');await page.goto(origin+'/workspace/product');await expect(page.locator('#productTable')).toBeVisible();};


    await pool.query("INSERT INTO product(prodcode,description,unit) VALUES('B-H001','Browser history','pc')");
    const today=(await pool.query('SELECT CURRENT_DATE::text value')).rows[0].value;
    const past=(await pool.query('SELECT (CURRENT_DATE-5)::text AS value')).rows[0].value;
    const future=(await pool.query('SELECT (CURRENT_DATE+5)::text AS value')).rows[0].value;
    await login('admin');await page.locator('#productSearch').fill('B-H001');await expect(page.locator('#productRows')).toContainText('Browser history');await page.locator('#productRows').getByRole('button',{name:'Prices',exact:true}).click();
    const modal=page.locator('#priceHistory');await expect(modal).toBeVisible();await expect(page.locator('#priceStatus')).toHaveText('No price history matches this filter.');await page.screenshot({path:path.join(evidence,'empty-history.png'),fullPage:true});
    await page.locator('#priceSave').click();assert.equal(await page.locator('#priceDate').evaluate(el=>el.validity.valid),false);
    const add=async(day,amount)=>{await page.locator('#priceDate').fill(day);await page.locator('#priceAmount').fill(amount);await page.locator('#priceSave').click();};
    await page.locator('#priceDate').fill(today);await page.locator('#priceAmount').fill('0');await page.locator('#priceSave').click();assert.equal(await page.locator('#priceAmount').evaluate(el=>el.validity.valid),false);
    await add(past,'1.23');await expect(page.locator('#priceStatus')).toHaveText('1 price entries.');await add(today,'2.34');await expect(page.locator('#priceStatus')).toHaveText('2 price entries.');await add(future,'99.99');await expect(page.locator('#priceStatus')).toHaveText('3 price entries.');
    await expect(page.locator('#productRows .product-price')).toHaveText('₱2.34');assert.deepEqual(await page.locator('#priceRows tr td:first-child').allTextContents(),[future,today,past]);console.log('PASS browser modal, empty/native validation, add, DESC order and future exclusion');
    const todayRow=()=>page.locator('#priceRows tr').filter({hasText:today});await todayRow().getByRole('button',{name:'Edit price',exact:true}).click();await expect(page.locator('#priceDate')).toBeDisabled();await page.locator('#priceAmount').fill('3.45');await page.locator('#priceSave').click();await expect(page.locator('#productRows .product-price')).toHaveText('₱3.45');console.log('PASS browser edit with immutable date and current-price refresh');
    page.once('dialog',dialog=>dialog.dismiss());await todayRow().getByRole('button',{name:'Delete price',exact:true}).click();await expect(page.locator('#priceStatus')).toHaveText('3 price entries.');page.once('dialog',dialog=>dialog.accept());await todayRow().getByRole('button',{name:'Delete price',exact:true}).click();await expect(page.locator('#priceStatus')).toHaveText('2 price entries.');await expect(page.locator('#productRows .product-price')).toHaveText('₱1.23');
    await page.locator('#priceFilter').selectOption('inactive');await expect(page.locator('#priceStatus')).toHaveText('1 price entries.');await page.screenshot({path:path.join(evidence,'inactive-price.png'),fullPage:true});await todayRow().getByRole('button',{name:'Restore price',exact:true}).click();await expect(page.locator('#priceStatus')).toHaveText('No price history matches this filter.');await expect(page.locator('#productRows .product-price')).toHaveText('₱3.45');console.log('PASS browser delete confirmation, fallback and privileged restore');
    await page.locator('#priceFilter').selectOption('active');await expect(page.locator('#priceStatus')).toHaveText('3 price entries.');await add(today,'4.56');await expect(page.locator('#priceNotice')).toContainText('already exists');await page.screenshot({path:path.join(evidence,'duplicate-date.png'),fullPage:true});console.log('PASS browser duplicate-date feedback');
    let release;const gate=new Promise(resolve=>{release=resolve;});await page.route('**/api/products/B-H001/prices?*',async route=>{await gate;await route.continue();});await page.locator('#priceRetry').click();await expect(page.locator('#priceStatus')).toHaveText('Loading price history…');await page.screenshot({path:path.join(evidence,'loading-history.png'),fullPage:true});release();await expect(page.locator('#priceStatus')).toHaveText('3 price entries.');await page.unroute('**/api/products/B-H001/prices?*');
    await page.route('**/api/products/B-H001/prices?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'private diagnostic'})}));await page.locator('#priceRetry').click();await expect(page.locator('#priceStatus')).toHaveText('Price history could not be loaded. Try again.');await page.unroute('**/api/products/B-H001/prices?*');await page.locator('#priceRetry').click();await expect(page.locator('#priceStatus')).toHaveText('3 price entries.');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(evidence,'mobile-history.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));console.log('PASS browser sanitized error, recovery and mobile history');
    page.once('dialog',dialog=>dialog.accept());await todayRow().getByRole('button',{name:'Delete price',exact:true}).click();await expect(page.locator('#priceStatus')).toHaveText('2 price entries.');await page.locator('#priceClose').click();await page.goto(origin+'/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(url=>url.pathname==='/login');await login('user');await page.locator('#productSearch').fill('B-H001');await expect(page.locator('#productRows')).toContainText('B-H001');await page.locator('#productRows').getByRole('button',{name:'Prices',exact:true}).click();await expect(page.locator('#priceStatus')).toHaveText('2 price entries.');await expect(page.locator('#priceHead')).not.toContainText('Stamp');await expect(page.locator('#priceHead')).not.toContainText('Status');await expect(page.locator('#priceFilter')).toBeHidden();await expect(modal.getByRole('button',{name:'Restore price',exact:true})).toHaveCount(0);await expect(modal.getByRole('button',{name:'Edit price',exact:true})).toHaveCount(0);assert.equal((await page.locator('#priceRows').textContent()).includes(today),false);await page.screenshot({path:path.join(evidence,'user-active-only.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS browser User active-only history, hidden metadata and exact-right controls, no script errors');console.log('Screenshots: '+evidence);
  } finally { await browser?.close(); if(server) await new Promise(r=>{server.close(r);server.closeAllConnections();});await app?.locals.closeAuthStore();await pool.end(); }
})().catch(error=>{ console.error('Browser verification failed: '+error.name+' '+error.message.replace(/password|token/gi,'credential')); process.exitCode=1; });
