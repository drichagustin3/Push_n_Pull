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
  assert.ok(process.env.ACTION_RIGHTS_INTEGRATION === '1' && process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const { chromium } = require(process.env.HOPE_PLAYWRIGHT_MODULE);
  const { expect } = require(path.join(process.env.HOPE_PLAYWRIGHT_MODULE, 'test'));
  const evidence = path.join(path.dirname(process.env.PGHOST), 'browser-evidence'); await mkdir(evidence, { mode: 0o700 });
  const pool = new Pool(); let app, browser, server;
  try {
    assert.equal((await pool.query('SELECT inet_server_addr() IS NULL local')).rows[0].local, true);
    // Restore the fixture audit trigger removed by the API negative test.

    const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password,12);
    for (const role of ['admin','user']) await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Browser','Fixture',$1,$2,$3,'active')",['sync-browser-'+role+'@example.test',hash,role]);
    for(const right of ['customer.add','product.edit','price.add'])await pool.query("INSERT INTO user_permission(user_id,right_code) SELECT user_id,$1 FROM app_user WHERE email='sync-browser-user@example.test'",[right]);
    server=createServer((req,res)=>app(req,res)); server.listen(0,'127.0.0.1'); await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    app=createApp({pool,authConfig:readAuthConfig({SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:origin},'test')});
    browser=await chromium.launch({headless:true}); const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.name));
    const login=async role=>{await page.goto(origin+'/login');await page.getByLabel('Email address',{exact:true}).fill('sync-browser-'+role+'@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/account');await page.goto(origin+'/workspace/product');await expect(page.locator('#productTable')).toBeVisible();};



    await pool.query(`INSERT INTO product(prodcode,description,unit) VALUES('PB001','Permission browser','pc'),('PB002','Missing price','pc'),('PB003','Maximum price','pc');
      INSERT INTO pricehist(prodcode,effdate,unitprice) VALUES('PB001',CURRENT_DATE,2.34),('PB003',CURRENT_DATE,99999999.99);
      INSERT INTO customer(custno,custname,payterm) VALUES('CB001','Permission customer','COD')`);
    const user=(await pool.query("SELECT user_id FROM app_user WHERE email='sync-browser-user@example.test'")).rows[0];
    const revoke=async right=>pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1 AND right_code=$2',[user.user_id,right]);
    const focus=async()=>page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await login('user');await page.goto(origin+'/workspace/customer');await expect(page.locator('#customerTable')).toBeVisible();await expect(page.locator('#customerAdd')).toBeVisible();await expect(page.locator('#customerRows button')).toHaveCount(0);
    await page.locator('#customerAdd').click();await page.locator('#customerNumber').fill('CB002');await page.locator('#customerName').fill('Browser customer');await page.locator('#customerTerms').selectOption('COD');await page.locator('#customerSave').click();await expect(page.locator('#customerRows')).toContainText('Browser customer');await page.screenshot({path:path.join(evidence,'customer-add-only.png'),fullPage:true});console.log('PASS browser Customer add-only controls and real form submission');
    await page.locator('#customerAdd').click();await revoke('customer.add');await focus();await expect(page.locator('#customerEditor')).not.toBeVisible();await expect(page.locator('#customerAdd')).toBeHidden();const forbiddenCustomer=await page.request.post(origin+'/api/customers',{headers:{Origin:origin},data:{custNo:'BAD01',custName:'Denied',address:'',payTerms:'COD'}});assert.equal(forbiddenCustomer.status(),403);console.log('PASS browser Customer live revocation closes stale editor and direct POST is denied');
    await page.goto(origin+'/workspace/product');await expect(page.locator('#productTable')).toBeVisible();await expect(page.locator('#productAdd')).toBeHidden();await page.locator('#productSearch').fill('PB00');await expect(page.locator('#productRows')).toContainText('PB003');
    const row=code=>page.locator('#productRows tr').filter({hasText:code});await expect(row('PB001').locator('.product-price')).toHaveText('₱2.34');await expect(row('PB002').locator('.product-price')).toHaveText('—');await expect(row('PB003').locator('.product-price')).toHaveText('₱99,999,999.99');await expect(page.locator('#productRows').getByRole('button',{name:'Delete',exact:true})).toHaveCount(0);await page.screenshot({path:path.join(evidence,'product-exact-prices.png'),fullPage:true});console.log('PASS browser exact current price, maximum precision, null em dash and Product single-action controls');
    await row('PB001').getByRole('button',{name:'Edit',exact:true}).click();await revoke('product.edit');await focus();await expect(page.locator('#productEditor')).not.toBeVisible();await expect(page.locator('#productRows').getByRole('button',{name:'Edit',exact:true})).toHaveCount(0);const forbiddenProduct=await page.request.put(origin+'/api/products/PB001',{headers:{Origin:origin},data:{description:'Denied',unit:'pc'}});assert.equal(forbiddenProduct.status(),403);console.log('PASS browser Product live revocation closes stale editor and direct PUT is denied');
    await row('PB001').getByRole('button',{name:'Prices',exact:true}).click();await expect(page.locator('#priceForm')).toBeVisible();await expect(page.locator('#priceRows').getByRole('button',{name:'Edit price',exact:true})).toHaveCount(0);await expect(page.locator('#priceRows').getByRole('button',{name:'Delete price',exact:true})).toHaveCount(0);
    const future=(await pool.query('SELECT (CURRENT_DATE+10)::text AS value')).rows[0].value;let release,requests=0;const gate=new Promise(resolve=>release=resolve);await page.route('**/api/products/PB001/prices',async route=>{if(route.request().method()==='POST'){requests++;await gate;}await route.continue();});
    await page.locator('#priceDate').fill(future);await page.locator('#priceAmount').fill('1.23');await page.locator('#priceSave').click();await expect(page.locator('#priceForm')).toHaveAttribute('aria-busy','true');await focus();await expect(page.locator('#priceHistory')).toBeVisible();await page.evaluate(()=>document.querySelector('#priceForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests,1);release();await expect(page.locator('#priceStatus')).toHaveText('2 price entries.');await expect(row('PB001').locator('.product-price')).toHaveText('₱2.34');await page.unroute('**/api/products/PB001/prices');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(evidence,'price-add-only-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));console.log('PASS browser Price add-only controls, pending navigation refresh, duplicate-submit guard and mobile');
    await revoke('price.add');await focus();await expect(page.locator('#priceHistory')).not.toBeVisible();await expect(page.locator('#productRows')).toBeEmpty();const forbiddenPrice=await page.request.post(origin+'/api/products/PB001/prices',{headers:{Origin:origin},data:{effDate:future,unitPrice:'2.34'}});assert.equal(forbiddenPrice.status(),403);const session=await(await page.request.get(origin+'/api/v1/auth/session')).json();assert.ok(Object.values(session.permissions).every(value=>value===false));
    assert.deepEqual(errors,[]);console.log('PASS browser Price revocation closes modal, removes stale controls, session flags and direct API rejection');console.log('Screenshots: '+evidence);
  } finally { await browser?.close(); if(server) await new Promise(r=>{server.close(r);server.closeAllConnections();});await app?.locals.closeAuthStore();await pool.end(); }
})().catch(error=>{ console.error('Browser verification failed: '+error.name); process.exitCode=1; });
