const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {actionDenials}=require('../src/security/action-denials');const {permissionFlags}=require('../src/rbac/service');
test('all nine action denials log once, with only fixed fields and no sensitive request data',()=>{
 const endpoints=[['POST','/api/customers','customer.add'],['PUT','/api/customers/C1','customer.edit'],['DELETE','/api/customers/C1','customer.delete'],['POST','/api/products','product.add'],['PUT','/api/products/P1','product.edit'],['DELETE','/api/products/P1','product.delete'],['POST','/api/products/P1/prices','price.add'],['PUT','/api/products/P1/prices/2026-01-01','price.edit'],['DELETE','/api/products/P1/prices/2026-01-01','price.delete']];
 for(const [method,path,right]of endpoints){const logs=[],res=new EventEmitter();res.statusCode=403;actionDenials({warn:text=>logs.push(JSON.parse(text))})({method,path,body:{password:'private'},headers:{cookie:'private'},query:{role:'superadmin'},user:{email:'private@example.test'}},res,()=>{});res.emit('finish');res.emit('finish');assert.equal(logs.length,1);assert.deepEqual(Object.keys(logs[0]).sort(),['action','at','event','status']);assert.equal(logs[0].action,right);assert.equal(logs[0].status,403);assert.doesNotMatch(JSON.stringify(logs),/private|superadmin|C1|P1/);}
});
test('non-denials and unrelated routes do not create misleading mutation security events',()=>{
 const logs=[];for(const [method,path,status]of [['POST','/api/products',201],['POST','/api/products',503],['GET','/api/products',403],['POST','/login',401]]){const res=new EventEmitter();res.statusCode=status;actionDenials({warn:line=>logs.push(line)})({method,path},res,()=>{});res.emit('finish');}assert.deepEqual(logs,[]);
});
test('session permission flags cover exactly the nine effective actions without module-wide promotion',()=>{
 const flags=permissionFlags({rights:new Set(['price.add','customer.edit'])});assert.equal(Object.keys(flags).length,9);assert.equal(flags['price.add'],true);assert.equal(flags['price.edit'],false);assert.equal(flags['product.add'],false);assert.equal(flags['customer.edit'],true);
});

test('case-insensitive Express route variants still log denials without logging identifiers',()=>{
 const logs=[],res=new EventEmitter();res.statusCode=401;actionDenials({warn:line=>logs.push(JSON.parse(line))})({method:'PUT',path:'/API/PRODUCTS/Private-Name'},res,()=>{});res.emit('finish');assert.equal(logs[0].action,'product.edit');assert.doesNotMatch(JSON.stringify(logs),/Private-Name/);
});
