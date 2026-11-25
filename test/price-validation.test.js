const {test}=require('node:test');const assert=require('node:assert/strict');
const {effectiveDate,unitPrice,priceInput,priceFilter}=require('../src/products/price-validation');
test('canonical real effective dates include leap days, past and future; impossible/ambiguous values fail',()=>{
 for(const date of ['0001-01-01','2024-02-29','2026-12-01','9999-12-31'])assert.equal(effectiveDate(date),date);
 for(const date of ['2026-02-29','2024-02-30','2026-04-31','2026-13-01','2026-00-01','2026-1-01','0000-01-01','2026-12-01T00:00:00Z','infinity',null])assert.throws(()=>effectiveDate(date));
});
test('exact decimal price text normalizes without rounding or floating-point coercion',()=>{
 for(const [input,result] of [['0.01','0.01'],['1','1.00'],['1.2','1.20'],['99999999.99','99999999.99']])assert.equal(unitPrice(input),result);
 for(const value of ['0','0.00','-1','100000000','1.001','1e2','Infinity','NaN','01.00',' 1.00',1,0.01,null])assert.throws(()=>unitPrice(value));
});
test('price payloads reject immutable keys, status/audit spoofing, malformed bodies, queries and invalid filters',()=>{
 const req={params:{prodCode:'P-001',effDate:'2026-12-01'},query:{},body:{unitPrice:'1.00'}};
 assert.deepEqual(priceInput(req,'edit'),{prodCode:'P-001',effDate:'2026-12-01',unitPrice:'1.00'});
 for(const body of [null,[],{...req.body,effDate:'2026-12-02'},{...req.body,status:'active'},{...req.body,stamp:'spoof'}])assert.throws(()=>priceInput({...req,body},'edit'));
 assert.throws(()=>priceInput({...req,query:{role:'admin'}},'edit'));assert.throws(()=>priceFilter({status:['active','inactive']}));assert.throws(()=>priceFilter({role:'admin'}));assert.equal(priceFilter({}), 'active');
});
