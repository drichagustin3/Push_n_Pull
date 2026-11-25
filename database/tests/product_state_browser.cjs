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
  assert.ok(process.env.PRODUCT_STATE_INTEGRATION === '1' && process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const { chromium } = require(process.env.HOPE_PLAYWRIGHT_MODULE);
  const { expect } = require(path.join(process.env.HOPE_PLAYWRIGHT_MODULE, 'test'));
  const evidence = path.join(path.dirname(process.env.PGHOST), 'browser-evidence'); await mkdir(evidence, { mode: 0o700 });
  const pool = new Pool(); let app, browser, server;
  try {
    assert.equal((await pool.query('SELECT inet_server_addr() IS NULL local')).rows[0].local, true);
    // Restore the fixture audit trigger removed by the API negative test.
    await pool.query("CREATE TRIGGER product_bu_check BEFORE UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_check_children()");
    const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password,12);
    for (const role of ['admin','user']) await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Browser','Fixture',$1,$2,$3,'active')",['state-browser-'+role+'@example.test',hash,role]);
    await pool.query("INSERT INTO user_permission(user_id,right_code) SELECT user_id,'product.delete' FROM app_user WHERE email='state-browser-user@example.test'");
    server=createServer((req,res)=>app(req,res)); server.listen(0,'127.0.0.1'); await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    app=createApp({pool,authConfig:readAuthConfig({SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:origin},'test')});
    browser=await chromium.launch({headless:true}); const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.name));
    const login=async role=>{await page.goto(origin+'/login');await page.getByLabel('Email address',{exact:true}).fill('state-browser-'+role+'@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/account');await page.goto(origin+'/workspace/product');await expect(page.locator('#productTable')).toBeVisible();};

    await pool.query("INSERT INTO product(prodcode,description,unit) VALUES('B-S001','Browser state','pc'); INSERT INTO pricehist(prodcode,effdate,unitprice) VALUES('B-S001',CURRENT_DATE,8.90)");
    await login('admin');await page.locator('#productSearch').fill('B-S001');await expect(page.locator('#productRows')).toContainText('Browser state');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#productRows').getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('#productRows')).toContainText('Browser state');console.log('PASS browser delete confirmation cancellation');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#productRows').getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('#productNotice')).toHaveText('Product deactivated.');await expect(page.locator('#productStatus')).toHaveText('No products match your search and filter.');
    await expect(page.locator('#productSearch')).toHaveValue('B-S001');await expect(page.getByRole('button',{name:'Inactive (1)',exact:true})).toBeVisible();console.log('PASS browser delete, active exclusion, counts and retained search');
    await page.getByRole('button',{name:'Inactive (1)',exact:true}).click();await expect(page.locator('#productRows .product-price')).toHaveText('₱8.90');await page.screenshot({path:path.join(evidence,'inactive-restore.png'),fullPage:true});
    page.once('dialog',dialog=>dialog.accept());await page.locator('#productRows').getByRole('button',{name:'Restore',exact:true}).click();await expect(page.locator('#productNotice')).toHaveText('Product restored.');await expect(page.locator('#productStatus')).toHaveText('No products match your search and filter.');
    await page.getByRole('button',{name:'Active (1)',exact:true}).click();await expect(page.locator('#productRows .product-price')).toHaveText('₱8.90');console.log('PASS browser restore, status tabs, counts and retained price');
    await page.route('**/api/products/B-S001',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Active related records prevent this operation.'})}));
    page.once('dialog',dialog=>dialog.accept());await page.locator('#productRows').getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('#productNotice')).toContainText('Active related records');await page.unroute('**/api/products/B-S001');console.log('PASS browser delete failure feedback');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#productRows').getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('#productNotice')).toHaveText('Product deactivated.');await page.getByRole('button',{name:'Inactive (1)',exact:true}).click();await expect(page.locator('#productRows')).toContainText('B-S001');
    await page.route('**/api/products/B-S001/restore',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'private SQL diagnostic'})}));page.once('dialog',dialog=>dialog.accept());await page.locator('#productRows').getByRole('button',{name:'Restore',exact:true}).click();await expect(page.locator('#productNotice')).toHaveText('Product status could not be saved. Try again later.');await page.unroute('**/api/products/B-S001/restore');console.log('PASS browser sanitized restore failure');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(evidence,'mobile-state.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    page.once('dialog',dialog=>dialog.accept());await page.locator('#productRows').getByRole('button',{name:'Restore',exact:true}).click();await expect(page.locator('#productNotice')).toHaveText('Product restored.');
    await page.goto(origin+'/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(url=>url.pathname==='/login');await login('user');await page.locator('#productSearch').fill('B-S001');await expect(page.locator('#productRows')).toContainText('B-S001');await expect(page.locator('#productRows').getByRole('button',{name:'Delete',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Restore',exact:true})).toHaveCount(0);await expect(page.locator('#productTabs')).toBeHidden();await page.screenshot({path:path.join(evidence,'user-delete-only.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS browser mobile and User delete-only visibility, no script errors');console.log('Screenshots: '+evidence);
  } finally { await browser?.close(); if(server) await new Promise(r=>{server.close(r);server.closeAllConnections();});await app?.locals.closeAuthStore();await pool.end(); }
})().catch(error=>{ console.error('Browser verification failed: '+error.name+' '+error.message.replace(/password|token/gi,'credential')); process.exitCode=1; });
