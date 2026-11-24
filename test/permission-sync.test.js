const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const {readFileSync}=require('node:fs');
function mount(){
 const nodes={},events={},forms={},notices={textContent:''};
 const button=(id,module,label)=>({id,hidden:false,disabled:false,textContent:label,closest(selector){if(selector==='button')return this;if(selector==='#customerRows,#productRows,#priceRows')return{id:module+'Rows'};return null;}});
 nodes.productAdd=button('productAdd','product','Add');nodes.delete=button('delete','product','Delete');nodes.priceEdit=button('priceEdit','price','Edit price');nodes.restore=button('restore','price','Restore price');
 const editor={open:true,closed:0,close(){this.open=false;this.closed++;},querySelector(selector){return selector==='form'?{reset(){}}:null;}};
 forms.productForm={id:'productForm',hidden:false,closest(selector){return selector==='#productForm'?this:null;}};
 const window={};const document={body:{},getElementById:id=>id==='productCode'?{disabled:false}:id==='productEditor'?editor:id==='workspaceStatus'?notices:forms[id],querySelectorAll:()=>Object.values(nodes),addEventListener:(name,fn)=>events[name]=fn,dispatchEvent:()=>{}};
 vm.runInNewContext(readFileSync('public/permissions.js','utf8'),{window,document,MutationObserver:class{observe(){}},Event:class{constructor(type){this.type=type;}}});
 return{window,nodes,editor,events,form:forms.productForm,notices};
}
test('permission synchronization closes a stale Product editor and hides controls for missing actions',()=>{const ui=mount();ui.window.hopePermissions.sync({rightCodes:['product.edit'],user:{role:'user'}});assert.equal(ui.editor.open,false);assert.equal(ui.nodes.productAdd.hidden,true);assert.equal(ui.nodes.delete.disabled,true);assert.equal(ui.nodes.priceEdit.hidden,true);});
test('capture guard rejects stale form/action handlers after revocation',()=>{const ui=mount();ui.window.hopePermissions.sync({rightCodes:['product.add'],user:{role:'user'}});assert.equal(ui.editor.open,true);ui.window.hopePermissions.sync({rightCodes:[],user:{role:'user'}});let prevented=0,stopped=0;ui.events.submit({type:'submit',target:ui.form,preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}});assert.equal(prevented,1);assert.equal(stopped,1);assert.match(ui.notices.textContent,/access has changed/);});
test('single-action rights never promote another module/action in stale UI and failed refresh denies all',()=>{const ui=mount();ui.window.hopePermissions.sync({rightCodes:['price.edit'],user:{role:'user'}});assert.equal(ui.nodes.priceEdit.hidden,false);assert.equal(ui.nodes.delete.hidden,true);ui.window.hopePermissions.sync({});assert.equal(ui.nodes.priceEdit.hidden,true);});

test('restore UI remains privileged without adding a permission code',()=>{const user=mount();user.window.hopePermissions.sync({rightCodes:['price.delete'],user:{role:'user'}});assert.equal(user.nodes.restore.hidden,true);const admin=mount();admin.window.hopePermissions.sync({rightCodes:['price.delete'],user:{role:'admin'}});assert.equal(admin.nodes.restore.hidden,false);});
