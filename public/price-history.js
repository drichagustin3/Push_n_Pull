(() => {
  const dialog = document.getElementById('priceHistory'), form = document.getElementById('priceForm');
  if (!dialog || !form) return;
  const title = document.getElementById('priceTitle'), rows = document.getElementById('priceRows'), head = document.getElementById('priceHead');
  const status = document.getElementById('priceStatus'), notice = document.getElementById('priceNotice'), filter = document.getElementById('priceFilter');
  const date = document.getElementById('priceDate'), amount = document.getElementById('priceAmount'), save = document.getElementById('priceSave'), reset = document.getElementById('priceReset');
  const filterLabel = document.getElementById('priceFilterLabel');
  let product, editing = null, capabilities = {}, busy = false, generation = 0, trigger;
  const text = (tag,value) => { const node = document.createElement(tag); node.textContent = value ?? '—'; return node; };
  function newPrice() { form.dataset.requiredRight = 'price.add'; editing = null; form.reset(); date.disabled = false; save.textContent = 'Add price'; form.hidden = !capabilities.add; }
  function processing(value) { busy = value; form.setAttribute('aria-busy',String(value)); for(const node of dialog.querySelectorAll('button,input,select')) node.disabled = value; date.disabled = value || editing !== null; }
  function close() { if(busy) return; ++generation; dialog.close(); rows.replaceChildren(); form.reset(); product = null; notice.textContent = ''; trigger?.focus(); }
  async function load() {
    const version = ++generation; capabilities = {}; editing = null; rows.replaceChildren(); head.replaceChildren(); form.hidden = true; filter.hidden = true; filterLabel.hidden = true; status.textContent = 'Loading price history…';
    try {
      const response = await fetch('/api/products/'+encodeURIComponent(product.prodcode)+'/prices?'+new URLSearchParams({status:filter.value}),{headers:{Accept:'application/json'},cache:'no-store'});
      const data = await response.json(); if(version !== generation || !dialog.open) return;
      if(response.status===401){close();window.location.assign('/login?terminated=1');return;}
      if(!response.ok){status.textContent = response.status===403 ? 'Price access is unavailable. Contact an administrator.' : response.status===404 ? 'Product is no longer available.' : 'Price history could not be loaded. Try again.';return;}
      capabilities = data.capabilities; filter.hidden = !capabilities.metadata; filterLabel.hidden = !capabilities.metadata; filter.value = data.filter.status;
      const tr = document.createElement('tr');for(const label of ['Effective date','Unit price',...(capabilities.metadata?['Status','Stamp']:[]),'Actions']) { const cell=text('th',label);cell.setAttribute('scope','col');tr.append(cell); }head.append(tr);
      for(const price of data.prices){const tr=document.createElement('tr');if(price.status==='inactive')tr.className='product-inactive';tr.append(text('td',price.effDate),text('td',price.unitPrice));if(capabilities.metadata)tr.append(text('td',price.status),text('td',price.stamp));const actions=document.createElement('td');
        const button=(label,fn)=>{const node=text('button',label);node.type='button';node.addEventListener('click',fn);actions.append(node);};
        if(price.status!=='inactive' && capabilities.edit)button('Edit price',()=>{form.dataset.requiredRight='price.edit';editing=price.effDate;date.value=price.effDate;date.disabled=true;amount.value=price.unitPrice ?? '';form.hidden=false;save.textContent='Save price';amount.focus();});
        if(price.status!=='inactive' && capabilities.delete)button('Delete price',()=>{if(window.confirm('Deactivate price effective '+price.effDate+'?'))void mutate('DELETE',price.effDate,{});});
        if(price.status==='inactive' && capabilities.restore)button('Restore price',()=>{void mutate('PUT',price.effDate+'/restore',{});});
        tr.append(actions);rows.append(tr);
      }
      status.textContent = data.prices.length ? `${data.prices.length} price entries.` : 'No price history matches this filter.';newPrice();
    }catch{if(version===generation)status.textContent='Check your connection and try again.';}
  }
  async function mutate(method,suffix,body){
    if(busy || !product)return;processing(true);notice.textContent='Saving price…';
    try{
      const response=await fetch('/api/products/'+encodeURIComponent(product.prodcode)+'/prices'+(suffix?'/'+suffix:''),{method,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});const data=await response.json();
      if(response.status===401){processing(false);close();window.location.assign('/login?terminated=1');return;}
      if(!response.ok){notice.textContent=response.status===403?'Price access has changed. Contact an administrator.':[400,404,409].includes(response.status)?data.message:'Price changes could not be saved. Try again later.';if(response.status===403){newPrice();await load();document.dispatchEvent(new Event('permissions:refresh'));}return;}
      notice.textContent='Price saved.';await load();document.dispatchEvent(new Event('products:changed'));
    }catch{notice.textContent='The price change could not be confirmed. Refresh before retrying.';}
    finally{processing(false);}
  }
  window.priceHistory={open(selected){if(dialog.open || busy)return;trigger=document.activeElement;product=selected;editing=null;capabilities={};filter.value='active';notice.textContent='';title.textContent='Price history — '+selected.prodcode+' · '+selected.description;dialog.showModal();void load();}};
  document.getElementById('priceClose').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.getElementById('priceRetry').addEventListener('click',()=>{if(!busy)void load();});filter.addEventListener('change',()=>{if(!busy)void load();});reset.addEventListener('click',()=>{if(!busy)newPrice();});
  form.addEventListener('submit',event=>{event.preventDefault();if(busy || !form.reportValidity())return;void mutate(editing?'PUT':'POST',editing??'',{...(!editing?{effDate:date.value}:{}),unitPrice:amount.value});});
})();
