const {test}=require('node:test');const assert=require('node:assert/strict');
const {listPrices,writePrice}=require('../src/products/price-service');
test('User price listing projects no private metadata and enforces eligibility in one SQL snapshot',async()=>{
 let sql,values;const pool={query:async(q,v)=>{sql=q;values=v;return{rows:[{prodcode:'P-001',description:'Fixture',is_deleted:false,prices:[{effdate:'2026-01-01',unitprice:'99999999.99'}]}]};}};
 const data=await listPrices(pool,{user:{role:'user'},rights:new Set(['price.add'])},'P-001','all');assert.match(sql,/AND NOT p.is_deleted/);assert.match(sql,/NOT h.is_deleted/);assert.match(sql,/h.unitprice::text/);assert.deepEqual(values,['P-001']);assert.deepEqual(data.prices,[{effDate:'2026-01-01',unitPrice:'99999999.99'}]);assert.equal(data.filter.status,'active');assert.equal(data.capabilities.restore,false);
});
test('Admin price history retains decimal strings/status/stamps while inactive parents disable mutations',async()=>{
 const pool={query:async()=>({rows:[{prodcode:'P-001',description:'Fixture',is_deleted:true,prices:[{effdate:'2026-01-01',unitprice:null,is_deleted:true,stamp:'fixture'}]}]})};
 const data=await listPrices(pool,{user:{role:'admin'},rights:new Set(['price.add','price.edit','price.delete'])},'P-001','all');assert.equal(data.prices[0].unitPrice,null);assert.equal(data.prices[0].status,'inactive');assert.equal(data.prices[0].stamp,'fixture');assert.equal(data.capabilities.add,false);assert.equal(data.capabilities.restore,false);
});
test('missing parent is a safe 404 and transaction failures roll back/release without leaking diagnostics',async()=>{
 await assert.rejects(listPrices({query:async()=>({rows:[]})},{user:{role:'user'},rights:new Set()},'P-001','active'),e=>e.status===404);
 let released=false,rollback=false;const client={query:async(sql)=>{if(sql==='ROLLBACK'){rollback=true;return{};}throw Error('private SQL diagnostic');},release:()=>{released=true;}};
 await assert.rejects(writePrice({connect:async()=>client},{},'add',{}),e=>e.status===503&&!e.message.includes('private'));assert.equal(rollback,true);assert.equal(released,true);
});
