/* Admin-only Shop Manager. Every write is authorized by the Python backend. */
(() => {
  'use strict';
  window.initNearMeShopManager = function initNearMeShopManager(api, toast, getCategories, role='owner', permissions={}) {
    const can = key => role === 'owner' || Boolean(permissions[key]);
    const isModerator = !can('shop_publish');
    const isOwner = can('shop_boost');
    const canDelete = can('shop_delete');
    const canCreate = can('shop_create');
    const canEdit = can('shop_edit');
    const canVerify = can('shop_verify');
    const canPublish = can('shop_publish');
    const $ = selector => document.querySelector(selector);
    const form = $('#shopForm');
    const records = $('#shopRecords');
    let currentId = null;
    let profileImage = '';
    let gallery = [];
    let rows = [];
    let busy = false;
    let readOnlyShop = false;
    let previewingProposal = false;
    let pinMap = null;
    let pin = null;
    let resolvedAddress = '';
    const $matches = $('#shopMatches');
    function setPin(lat,lon,zoom=16) {
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
      $field('lat').value=lat.toFixed(6);$field('lon').value=lon.toFixed(6);
      if(pinMap) {
        if(!pin) {
          pin = L.marker([lat,lon],{draggable:true,title:'Drag to shop entrance'}).addTo(pinMap);
          pin.on('dragend',()=>{
            const coords=pin.getLatLng();
            $field('lat').value=coords.lat.toFixed(6);
            $field('lon').value=coords.lng.toFixed(6);
            resolvedAddress=$field('address').value.trim();
          });
        }
        else pin.setLatLng([lat,lon]);
        pinMap.setView([lat,lon],zoom);
      }
    }
    function ensureMap() {
      if(pinMap||!window.L)return;
      pinMap = L.map('shopPinMap',{scrollWheelZoom:false}).setView([3.139,101.6869],10);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
      }).addTo(pinMap);
      pinMap.on('click',event=>setPin(event.latlng.lat,event.latlng.lng));
      const host=$('#shopPinMap');
      if (typeof ResizeObserver !== 'undefined') {
        const observer=new ResizeObserver(() => {
          if (host.offsetWidth && host.offsetHeight && pinMap) {
            requestAnimationFrame(()=>pinMap.invalidateSize({pan:false,debounceMoveend:true}));
          }
        });
        observer.observe(host);
      }
    }
    function placeMap() {
      ensureMap();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!pinMap || !$('#shopPinMap').offsetWidth) return;
        pinMap.invalidateSize({pan:false});
        const lat=Number($field('lat').value),lon=Number($field('lon').value);
        if ($field('lat').value && $field('lon').value && Number.isFinite(lat) && Number.isFinite(lon)) setPin(lat,lon);
        setTimeout(() => { if (pinMap && $('#shopPinMap').offsetWidth) pinMap.invalidateSize({pan:false}); },220);
      }));
    }
    async function findAddress() {
      const address=$field('address').value.trim();
      if(address.length<8){notify('Enter a full street address with town and state first.');return;}
      $('#shopFindAddress').disabled=true;
      $matches.hidden=false;$matches.replaceChildren(make('p','','Looking up possible locations…'));
      try {
        const result=await api('/api/admin/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address})});
        $matches.replaceChildren();
        if(!result.matches?.length){$matches.append(make('p','','No exact match. Click the correct position on the map or enter coordinates manually.'));return;}
        const first=result.matches[0];
        resolvedAddress=address;
        setPin(Number(first.lat),Number(first.lon));
        $matches.append(make('p','','A suggested pin was added automatically. Verify the location and choose a different result if needed:'));
        for(const item of result.matches) {
          const button=make('button','',item.label);
          button.type='button';button.addEventListener('click',()=>{
            resolvedAddress=address;
            setPin(Number(item.lat),Number(item.lon));
            $matches.hidden=true;
            notify('Pin placed. Drag it to the exact shop entrance if needed.');
          });
          $matches.append(button);
        }
      } catch(err) {$matches.replaceChildren(make('p','',err.message||'Address lookup failed; place the pin manually.'));}
      finally{$('#shopFindAddress').disabled=false;}
    }

    const mediaURL = path => /^\/media\/[0-9a-f]{32}\.webp$/.test(path || '') ? String(window.NEARME_API_BASE || '').replace(/\/+$/, '') + path : '';
    const names = ['name','category','description','address','lat','lon','price','whatsapp','telegram_url','status','expires_on'];
    const $field = name => form.elements.namedItem(name);
    function refreshCategories() {
      const selector = $field('category');
      const previous = selector.value;
      selector.replaceChildren();
      const categories = (getCategories?.() || []).filter(c => c.key !== 'all');
      for (const c of categories) {
        const opt=document.createElement('option');opt.value=c.key;
        opt.textContent=[String(c.emoji || '').trim(),c.label].filter(Boolean).join(' ');
        selector.append(opt);
      }
      if (categories.some(c=>c.key===previous)) selector.value=previous;
      if (!selector.value && categories.length) selector.value=categories[0].key;
    }

    function notify(message) { $('#shopToast').textContent=message; toast(message); }
    function make(tag, cls, text) { const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el; }
    function profilePreview() {
      const holder=$('#shopProfilePreview');holder.replaceChildren();
      if (profileImage) {
        const img=make('img');img.src=mediaURL(profileImage);img.alt='Current shop profile image';
        holder.append(img);
      } else holder.append(make('p','shop-empty','No profile image uploaded yet.'));
      $('#shopRemoveProfile').disabled=!profileImage || readOnlyShop;
    }
    function photoList() {
      const holder=$('#shopGalleryList');holder.replaceChildren();
      gallery.forEach((item,index)=>{
        const wrap=make('div','shop-gallery-edit-card');
        const imageWrap=make('div','shop-gallery-edit-thumb');
        const img=make('img');img.src=mediaURL(item.url);img.alt=`Gallery photo ${index+1}`;
        imageWrap.append(img);
        const body=make('div','shop-gallery-edit-body');
        body.append(make('strong','',`Gallery image ${index+1}`));
        const caption=make('textarea');caption.maxLength=300;caption.rows=3;
        caption.placeholder='Describe this photo (optional). Example: Private massage room, 60-minute treatment.';
        caption.value=item.description||'';
        caption.setAttribute('aria-label',`Description for gallery image ${index+1}`);
        caption.disabled=readOnlyShop;
        caption.addEventListener('input',()=>{item.description=caption.value;});
        const actions=make('div','shop-gallery-edit-actions');
        for(const [symbol, label, offset] of [['↑','Move earlier',-1],['↓','Move later',1]]) {
          const button=make('button','plain-button',symbol);button.type='button';button.title=label;
          button.setAttribute('aria-label',`${label}: image ${index+1}`);
          button.disabled=readOnlyShop||index+offset<0||index+offset>=gallery.length;
          button.addEventListener('click',()=>{
            [gallery[index],gallery[index+offset]]=[gallery[index+offset],gallery[index]];
            photoList();
          });actions.append(button);
        }
        const remove=make('button','plain-button','Remove');remove.type='button';
        remove.setAttribute('aria-label',`Remove gallery image ${index+1}`);
        remove.disabled=readOnlyShop;
        remove.addEventListener('click',()=>{gallery.splice(index,1);photoList();});
        actions.append(remove);body.append(caption,actions);wrap.append(imageWrap,body);holder.append(wrap);
      });
      $('#shopGalleryCounter').textContent=`${gallery.length} / 20 gallery photos`;
      $('#shopGalleryPhotos').disabled=readOnlyShop || gallery.length>=20;
    }
    function showForm(shop, preview=false) {
      refreshCategories();
      form.hidden=false;
      currentId=shop?.id||null;
      previewingProposal=Boolean(preview && shop?.pending_edit_data && (canVerify || canPublish));
      const detail = ((isModerator || previewingProposal) && shop?.pending_edit_data)
        ? {...shop,...shop.pending_edit_data} : shop;
      profileImage=detail?.profile_image || detail?.images?.[0] || '';
      gallery=Array.isArray(detail?.gallery) ? detail.gallery.map(item=>({url:item.url, description:item.description||''})) :
        (detail?.images||[]).slice(1).map(url=>({url,description:''}));
      if(!shop && pin){pin.remove();pin=null;}
      form.reset();
      refreshCategories();
      resolvedAddress=detail?.address||'';
      $matches.hidden=true;$matches.replaceChildren();
      for (const name of names) {
        const field=$field(name);
        if (detail && field) field.value=detail[name] ?? '';
      }
      $field('featured').checked=Boolean(shop?.featured);
      $('#shopFormTitle').textContent=shop?(previewingProposal?'Review proposed shop changes':'Edit shop advertisement'):'New shop advertisement';
      readOnlyShop=previewingProposal || (shop ? !canEdit : !canCreate);
      $('#deleteShop').hidden=!shop || !canDelete || previewingProposal;
      const reviewable=Boolean(shop?.pending_edit && (canVerify || canPublish));
      $('#shopEditNotice').hidden=!shop?.pending_edit;
      if(shop?.pending_edit) $('#shopEditNotice').textContent=previewingProposal
        ? 'Review the proposed changes below. They are not public until approved.'
        : 'There are unpublished edits from a Content Moderator awaiting verification.';
      $('#reviewShopEdit').hidden=!reviewable;
      $('#reviewShopEdit').textContent=previewingProposal?'View live shop':'Review pending edits';
      $('#approveShopEdit').hidden=!reviewable || !previewingProposal || !canVerify || !canPublish;
      $('#rejectShopEdit').hidden=!reviewable || !canVerify;
      $('#saveShop').textContent=isModerator && shop && ['active','paused'].includes(shop.status)
        ? 'Submit edits for approval' : 'Save shop';
      for (const element of form.querySelectorAll('input,textarea,select')) {
        // The Cancel control remains available. Admin screens are convenience
        // controls only; actual permissions are enforced by FastAPI.
        if (element.name==='featured') element.disabled=!isOwner || readOnlyShop;
        else if (element.name==='status' && isModerator) {
          const live=Boolean(shop && ['active','paused'].includes(shop.status));
          for (const option of element.options) option.disabled=live
            ? option.value !== shop.status : !['draft','pending'].includes(option.value);
          element.disabled=live || readOnlyShop;
        } else element.disabled=readOnlyShop;
      }
      for (const button of form.querySelectorAll('button')) {
        if(button.id==='cancelShop')continue;
        if(['reviewShopEdit','approveShopEdit','rejectShopEdit'].includes(button.id)) continue;
        button.disabled=readOnlyShop || (button.id==='deleteShop' && !canDelete);
      }
      $('#shopProfilePhoto').disabled=readOnlyShop;
      $('#saveShop').hidden=readOnlyShop || !canEdit && Boolean(shop) || !canCreate && !shop;
      if (previewingProposal) notify('Review the proposed changes, then approve or reject them.');
      profilePreview();photoList();placeMap();
      form.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    function drawList() {
      records.replaceChildren();
      if (!rows.length) {records.append(make('p','shop-empty','No advertisements yet. Click “+ New shop” to create one.'));return;}
      for (const shop of rows) {
        const item=make('button','shop-record');item.type='button';item.dataset.id=shop.id;
        const first=make('div','shop-record-main');
        const thumb=make('div','shop-record-thumb');
        if (shop.image_url) {const img=make('img');img.src=mediaURL(shop.image_url);img.alt='';thumb.append(img)}
        else thumb.textContent='🏪';
        const title=make('div','shop-record-copy');title.append(make('strong','',shop.name),make('small','',shop.address));
        first.append(thumb,title);
        const sub=make('div','shop-record-sub');
        sub.append(make('span',`shop-status shop-${shop.status}`,shop.status.toUpperCase()));
        if(shop.featured && isOwner)sub.append(make('span','shop-featured','✦ Boosted to top'));
        if(shop.pending_edit)sub.append(make('span','shop-status shop-pending','Pending edits'));
        if(shop.expires_on)sub.append(make('small','',`Expires ${shop.expires_on}`));
        item.append(first,sub);
        item.addEventListener('click',()=>showForm(shop));
        const row=make('div','shop-record-row');row.append(item);
        const isExpired=Boolean(shop.expires_on && shop.expires_on < new Date().toISOString().slice(0,10));
        const canBoost=shop.status==='active' && !isExpired;
        if (isOwner) {
          const action=make('button','shop-boost-button', shop.featured ? 'Remove boost' : '✦ Boost to Top');
          action.type='button';action.disabled=busy || (!shop.featured && !canBoost);
          action.title=canBoost ? 'Show this shop first in All shops and when it matches Nearby' :
            'Only active and unexpired shops can be boosted';
          action.setAttribute('aria-label', `${shop.featured?'Remove boost from':'Boost'} ${shop.name}`);
          action.addEventListener('click',()=>boost(shop));row.append(action);
        }
        records.append(row);
      }
    }
    async function load() {
      records.replaceChildren(make('p','shop-empty','Loading shop listings…'));
      try {rows=(await api('/api/admin/shops')).shops||[];drawList()}
      catch(err){records.replaceChildren(make('p','shop-error',err.message||'Cannot load shop listings'))}
    }
    async function boost(shop) {
      if (busy) return;
      busy=true;
      try {
        const enabled=!shop.featured;
        await api(`/api/admin/shops/${encodeURIComponent(shop.id)}/boost`, {
          method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})
        });
        notify(enabled ? `${shop.name} is now boosted to the top` : `Boost removed from ${shop.name}`);
        await load();
        if (currentId) {
          const selected=rows.find(item=>item.id===currentId);
          if (selected) { $field('featured').checked=Boolean(selected.featured); }
        }
      } catch(err) {notify(err.message || 'Could not change boost');}
      finally {busy=false;drawList();}
    }

    async function save(event) {
      event.preventDefault();if(busy||readOnlyShop||(!canEdit&&currentId)||(!canCreate&&!currentId))return;
      if(gallery.length>20){notify('Only twenty gallery images can be added');return;}
      const payload={};
      for(const name of names){payload[name]=$field(name).value.trim();}
      if(!$field('lat').value||!$field('lon').value){notify('Choose an address result or click the exact shop position on the map first.');return;}
      if(payload.address !== resolvedAddress){
        notify('The address changed. Please find it again or click the correct position on the map.');return;
      }
      payload.lat=Number(payload.lat);payload.lon=Number(payload.lon);
      payload.featured=isOwner && $field('featured').checked && payload.status === 'active';
      payload.expires_on=payload.expires_on||null;
      payload.profile_image=profileImage;
      payload.gallery=gallery.map(item=>({url:item.url, description:item.description.trim()}));
      busy=true;$('#saveShop').disabled=true;
      try {
        const isEditing=Boolean(currentId);
        const endpoint=isEditing?`/api/admin/shops/${encodeURIComponent(currentId)}`:'/api/admin/shops';
        const updated=await api(endpoint,{method:isEditing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        notify(isModerator && isEditing && ['active','paused'].includes(payload.status)
          ? 'Edits submitted for Owner/Admin approval. The live shop is unchanged.'
          : `Shop ${isEditing?'updated':'created'} successfully`);
        await load();showForm(updated);
      }catch(err){notify(err.message||'Shop could not be saved')}
      finally{busy=false;$('#saveShop').disabled=false;}
    }
    async function remove() {
      if(!currentId||busy||!canDelete)return;
      if(!window.confirm('Permanently delete this advertisement? This does not delete uploaded images.'))return;
      busy=true;
      try{await api(`/api/admin/shops/${encodeURIComponent(currentId)}`,{method:'DELETE'});form.hidden=true;currentId=null;notify('Advertisement deleted');await load();}
      catch(err){notify(err.message||'Delete failed')}finally{busy=false;}
    }
    async function uploadFile(file, purpose='general') {
      if(readOnlyShop)return '';
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5_000_000){
        notify(`${file.name}: Use PNG, JPEG or WebP under 5 MB`);return '';
      }
      const body=new FormData();body.append('image',file);body.append('purpose',purpose);
      try {const result=await api('/api/admin/upload',{method:'POST',body});return result.url||'';}
      catch(err) {notify(`${file.name}: ${err.message||'Upload failed'}`);return '';}
    }
    async function uploadProfile(file) {
      if (!file || busy)return;
      busy=true;
      try {const url=await uploadFile(file, 'shop_profile');if(url){profileImage=url;profilePreview();notify('Profile photo automatically fitted to a square. Save the shop to publish it.');}}
      finally {busy=false;$('#shopProfilePhoto').value='';}
    }
    async function uploadGallery(files) {
      if (busy)return;
      busy=true;
      try {
        for(const file of files) {
          if(gallery.length>=20){notify('You can upload a maximum of 20 gallery images');break;}
          const url=await uploadFile(file);
          if(url){gallery.push({url,description:''});photoList();}
        }
      } finally {busy=false;$('#shopGalleryPhotos').value='';}
    }
    $('#newShop').hidden=!canCreate;
    $('#newShop').addEventListener('click',()=>showForm(null));
    $('#cancelShop').addEventListener('click',()=>{form.hidden=true;currentId=null;});
    $('#deleteShop').addEventListener('click',remove);
    $('#reviewShopEdit').addEventListener('click',()=>{
      const shop=rows.find(item=>item.id===currentId);
      if(shop) showForm(shop,!previewingProposal);
    });
    async function decideEdits(approve) {
      if(busy || !currentId || (approve ? !(canVerify&&canPublish) : !canVerify)) return;
      if(!window.confirm(approve?'Approve and publish the submitted shop changes?':'Reject the submitted changes?'))return;
      busy=true;
      try {
        const path=`/api/admin/shops/${encodeURIComponent(currentId)}/pending-edit`;
        await api(path+(approve?'/approve':''),{method:approve?'PUT':'DELETE'});
        notify(approve?'Submitted shop edits approved':'Submitted shop edits rejected');
        await load(); const changed=rows.find(row=>row.id===currentId);
        if(changed)showForm(changed);else form.hidden=true;
      }catch(err){notify(err.message||'Could not review edits')}
      finally{busy=false;}
    }
    $('#approveShopEdit').addEventListener('click',()=>decideEdits(true));
    $('#rejectShopEdit').addEventListener('click',()=>decideEdits(false));
    form.addEventListener('submit',save);
    $('#shopProfilePhoto').addEventListener('change',event=>uploadProfile(event.target.files[0]));
    $('#shopRemoveProfile').addEventListener('click',()=>{profileImage='';profilePreview();});
    $('#shopGalleryPhotos').addEventListener('change',event=>uploadGallery([...event.target.files]));
    $('#shopFindAddress').addEventListener('click',findAddress);
    $field('status').addEventListener('change',()=>{if($field('status').value!=='active') $field('featured').checked=false;});
    $field('address').addEventListener('input',()=>{$matches.hidden=true;});
    for(const name of ['lat','lon'])$field(name).addEventListener('change',()=>{
      const lat=Number($field('lat').value),lon=Number($field('lon').value);
      if($field('lat').value&&$field('lon').value&&Number.isFinite(lat)&&Number.isFinite(lon)){
        resolvedAddress=$field('address').value.trim();setPin(lat,lon);
      }
    });
    const mapHost=$('#shopPinMap');
    mapHost.addEventListener('click',()=>{if($field('address').value.trim())resolvedAddress=$field('address').value.trim();});
    $('#shopUseGPS').addEventListener('click',()=>{
      if(!navigator.geolocation){notify('Your browser does not support location');return;}
      navigator.geolocation.getCurrentPosition(pos=>{
        $field('lat').value=pos.coords.latitude.toFixed(6);$field('lon').value=pos.coords.longitude.toFixed(6);
        resolvedAddress=$field('address').value.trim();
        setPin(pos.coords.latitude,pos.coords.longitude);
        notify('Coordinates filled from your current location. Check that they match the shop.');
      },()=>notify('Location not available. Copy the shop coordinates from Google Maps instead.'),{enableHighAccuracy:true,timeout:15000});
    });
    refreshCategories();
    load();
    return {refreshCategories};
  };
})();
