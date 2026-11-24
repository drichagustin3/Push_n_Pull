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
  assert.ok(process.env.PRODUCT_WRITE_INTEGRATION === '1' && process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const { chromium } = require(process.env.HOPE_PLAYWRIGHT_MODULE);
  const { expect } = require(path.join(process.env.HOPE_PLAYWRIGHT_MODULE, 'test'));
  const evidence = path.join(path.dirname(process.env.PGHOST), 'browser-evidence'); await mkdir(evidence, { mode: 0o700 });
  const pool = new Pool(); let app, browser, server;
  try {
    assert.equal((await pool.query('SELECT inet_server_addr() IS NULL local')).rows[0].local, true);
    // Restore the fixture audit trigger removed by the API negative test.
    await pool.query("CREATE TRIGGER product_aiu_audit AFTER INSERT OR UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_audit_log('prodcode')");
    const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password,12);
    for (const role of ['admin','user']) await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Browser','Fixture',$1,$2,$3,'active')",['product-browser-'+role+'@example.test',hash,role]);
    await pool.query("INSERT INTO user_permission(user_id,right_code) SELECT user_id,'product.edit' FROM app_user WHERE email='product-browser-user@example.test'");
    server=createServer((req,res)=>app(req,res)); server.listen(0,'127.0.0.1'); await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    app=createApp({pool,authConfig:readAuthConfig({SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:origin},'test')});
    browser=await chromium.launch({headless:true}); const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.name));
    const login=async role=>{await page.goto(origin+'/login');await page.getByLabel('Email address',{exact:true}).fill('product-browser-'+role+'@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/account');await page.goto(origin+'/workspace/product');await expect(page.locator('#productTable')).toBeVisible();};
    await login('admin');
    await page.locator('#productSearch').fill('B-001'); await expect(page.locator('#productStatus')).toHaveText('No products match your search and filter.');
    await page.locator('#productAdd').click();
    await expect(page.locator('#productSave')).toBeEnabled();
    await page.locator('#productSave').click(); await expect(page.locator('#productEditor')).toBeVisible(); // Native required validation.
    await page.locator('#productCode').fill('B-001'); await page.locator('#productDescription').fill('Browser pump'); await page.locator('#productUnit').selectOption('pair');
    await page.screenshot({path:path.join(evidence,'create.png'),fullPage:true});
    await page.locator('#productSave').click(); await expect(page.locator('#productNotice')).toHaveText('Product created.');
    await expect(page.locator('#productRows')).toContainText('Browser pump'); await expect(page.locator('#productSearch')).toHaveValue('B-001');
    await expect(page.locator('#productRows .product-price')).toHaveText('—');
    console.log('PASS browser create, native validation, null price and retained search');
    await page.locator('#productRows').getByRole('button',{name:'Edit',exact:true}).click(); await expect(page.locator('#productCode')).toBeDisabled();
    await page.locator('#productDescription').fill('Changed '+ 'x'.repeat(92)); await page.locator('#productUnit').selectOption('meter');
    await page.screenshot({path:path.join(evidence,'edit.png'),fullPage:true}); await page.locator('#productSave').click();
    await expect(page.locator('#productNotice')).toHaveText('Product updated.'); await expect(page.locator('#productRows')).toContainText('meter');
    assert.equal((await pool.query("SELECT length(description) n FROM product WHERE prodcode='B-001'")).rows[0].n,100);
    console.log('PASS browser immutable code, edit, exact 100 characters and success refresh');
    await page.locator('#productAdd').click(); await page.locator('#productCode').fill('B-001');await page.locator('#productDescription').fill('Duplicate');await page.locator('#productUnit').selectOption('pcs');await page.locator('#productSave').click();
    await expect(page.locator('#productFormError')).toContainText('already exists'); await page.screenshot({path:path.join(evidence,'duplicate.png'),fullPage:true}); await page.locator('#productCancel').click();
    console.log('PASS browser duplicate correction and cancel');
    await page.route('**/api/products', async route=> { if(route.request().method()==='POST') return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'private diagnostic'})});return route.continue(); });
    await page.locator('#productAdd').click();await page.locator('#productCode').fill('B-002');await page.locator('#productDescription').fill('Failure');await page.locator('#productUnit').selectOption('pcs');await page.locator('#productSave').click();
    await expect(page.locator('#productFormError')).toHaveText('Product changes could not be saved. Try again later.');await page.locator('#productCancel').click(); await page.unroute('**/api/products');
    console.log('PASS browser sanitized failure');
    await page.setViewportSize({width:390,height:844});await page.locator('#productAdd').click();await expect(page.locator('#productSave')).toBeVisible();await page.screenshot({path:path.join(evidence,'mobile.png'),fullPage:true});await page.locator('#productCancel').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));console.log('PASS browser mobile form');
    await page.goto(origin+'/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(url => url.pathname === '/login');await login('user');
    await expect(page.locator('#productAdd')).toBeHidden();await page.locator('#productSearch').fill('B-001');await expect(page.locator('#productRows')).toContainText('B-001');await expect(page.locator('#productRows').getByRole('button',{name:'Edit',exact:true})).toBeEnabled();
    await expect(page.locator('#productHead')).not.toContainText('Stamp');await page.screenshot({path:path.join(evidence,'user-edit-only.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS browser exact action visibility, metadata privacy and no script errors');console.log('Screenshots: '+evidence);
  } finally { await browser?.close(); if(server) await new Promise(r=>{server.close(r);server.closeAllConnections();});await app?.locals.closeAuthStore();await pool.end(); }
})().catch(error=>{ console.error('Browser verification failed: '+error.name+' '+error.message.replace(/password|token/gi,'credential')); process.exitCode=1; });
