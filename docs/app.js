/* NearMe: only obtains location after user click; identity verified by backend. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const tg = window.Telegram?.WebApp || null;
  const initData = tg?.initData || '';
  const webLogin = window.NearMeWebLogin;
  // Backend tunnel URL, configured publicly in docs/config.js (never put a bot token there).
  const apiBase = String(window.NEARME_API_BASE || (location.hostname.endsWith('github.io') || location.hostname === 'app.nearme.work.gd' ? '' : location.origin)).replace(/\/+$/, '');
  let categories = {
    all: ['All places', '✨'], coffee: ['Coffee', '☕'], food: ['Food & dining', '🍜'],
    shopping: ['Shops', '🛍️'], grocery: ['Groceries', '🥬'], pharmacy: ['Pharmacy', '💊']
  };
  const state = { user: null, places: [], catalog: [], coords: null, category: 'all', search: '',
                  radius: 2000, view: 'list', tab: 'explore', preview: false,
                  map: null, mapMarkers: [], demoEnabled: false, loading: false, nearbyOnly: false };

  const fallbackDesign = {
    app_name:'NearMe', tagline:'Discover amazing places around you.', logo_url:'',
    appearance:{dark_mode:true, primary:'#A32CDB', accent:'#FF5CBD', background:'#100A24', text:'#F8F2FF'},
    hero:{eyebrow:'YOUR CITY, YOUR VIBE', title:'Discover the scene.', highlight:'Right around you.',
      description:'Discover unforgettable spots, late-night gems, cafés and local favorites near you.',
      cta:'Use my location', banner_url:''},
    show_map:true,show_saved:true,search_placeholder:'Search lounges, cafés, shops...',default_radius:2000,
    categories:[{key:'all',label:'All places',emoji:'✨',enabled:true},
      {key:'coffee',label:'Coffee',emoji:'☕',enabled:true},
      {key:'food',label:'Food & dining',emoji:'🍜',enabled:true},
      {key:'shopping',label:'Shops',emoji:'🛍️',enabled:true},
      {key:'grocery',label:'Groceries',emoji:'🥬',enabled:true},
      {key:'pharmacy',label:'Pharmacy',emoji:'💊',enabled:true}]
  };
  let designSettings = fallbackDesign;
  const mediaURL = path => /^\/media\/[a-f0-9]{32}\.webp$/.test(path || '') ? `${apiBase}${path}` : '';

  function applyDesign(d) {
    designSettings = d;
    const a = d.appearance;
    const root = document.documentElement;
    root.dataset.theme = a.dark_mode ? 'dark' : 'light';
    root.style.setProperty('--green', a.primary);
    root.style.setProperty('--bright', a.accent);
    root.style.setProperty('--bg', a.background);
    root.style.setProperty('--ink', a.text);
    root.style.setProperty('--studio-banner', d.hero.banner_url ? `url("${mediaURL(d.hero.banner_url)}")` : 'none');
    const logo = $('#brandLogo');
    logo.replaceChildren();
    const url = mediaURL(d.logo_url);
    if (url) { const img=document.createElement('img'); img.src=url; img.alt=''; logo.append(img); }
    else { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      const use=document.createElementNS('http://www.w3.org/2000/svg','use');
      use.setAttribute('href','#i-pin');svg.append(use);logo.append(svg); }
    $('#brandName').textContent = d.app_name;
    document.title = `${d.app_name} · Discover around you`;
    $('#heroEyebrow').textContent = d.hero.eyebrow;
    $('#heroTitle').textContent = d.hero.title;
    $('#heroHighlight').textContent = d.hero.highlight;
    $('#heroDescription').textContent = d.hero.description;
    $('#discoveryTagline').textContent = d.tagline;
    $('#locationBtnText').textContent = d.hero.cta;
    $('#searchInput').placeholder = d.search_placeholder;
    state.radius = d.default_radius;
    $('#radiusText').textContent = `${state.radius/1000} km`;
    $$('#radiusOptions button').forEach(b => b.classList.toggle('selected',Number(b.dataset.radius) === state.radius));
    $('#mapViewBtn').hidden = !d.show_map;
    $$('.nav-item').forEach(el=>{if (el.dataset.tab==='saved') el.hidden=!d.show_saved;
      if (el.dataset.tab==='map') el.hidden=!d.show_map;});
    categories = Object.fromEntries(d.categories.map(c=>[c.key,[c.label,c.emoji || '']]));
    const chips=$('#categories'); chips.replaceChildren();
    for (const c of d.categories.filter(x=>x.enabled)) {
      const b=document.createElement('button');b.className='category';b.dataset.category=c.key;
      const emojiText=String(c.emoji || '').trim();
      if (emojiText) { const emoji=document.createElement('span');emoji.textContent=emojiText;b.append(emoji); }
      b.append(document.createTextNode(c.label));chips.append(b);
    }
    if (!d.categories.some(c=>c.key===state.category && c.enabled)) state.category='all';
    $$('.category').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category));
    if (!d.show_map && state.view==='map') {state.view='list';state.tab='explore';}
    if (!d.show_saved && state.tab==='saved') state.tab='explore';
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
    if (tg) {try {tg.setHeaderColor(a.background);tg.setBackgroundColor(a.background);} catch {}}
    render();
  }
  async function loadDesign() {
    if (!apiBase && window.location.hostname.endsWith('github.io')) { applyDesign(fallbackDesign); return; }
    try {
      const response = await fetch(`${apiBase}/api/design`, {cache:'no-store'});
      if (!response.ok) throw Error('Design unavailable');
      applyDesign(await response.json());
    } catch { applyDesign(fallbackDesign); }
  }

  let toastTimer;
  let lastVisitorReport = 0;
  let presenceTimer = null;
  const sample = [
    {id:'demo-01',name:'Morning Brew Café',category:'coffee',address:'Example coffee shop · Demo listing',distance_m:180,lat:3.1408,lon:101.6886},
    {id:'demo-02',name:'The Little Noodle House',category:'food',address:'Example restaurant · Demo listing',distance_m:340,lat:3.1397,lon:101.6909},
    {id:'demo-03',name:'Everyday Market',category:'grocery',address:'Example grocer · Demo listing',distance_m:560,lat:3.1388,lon:101.6860},
    {id:'demo-04',name:'The Corner Store',category:'shopping',address:'Example shop · Demo listing',distance_m:720,lat:3.1431,lon:101.6902},
    {id:'demo-05',name:'Health & Care',category:'pharmacy',address:'Example pharmacy · Demo listing',distance_m:950,lat:3.1365,lon:101.6890},
  ];
  const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons = {pin: '<svg><use href="#i-pin"/></svg>', route: '<svg><use href="#i-route"/></svg>', heart:'<svg><use href="#i-heart"/></svg>'};
  const fmt = (meters) => !Number.isFinite(meters) ? 'View location' : meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  // Shop coordinates are public, so distances can be computed locally. GPS is
  // never needed to fetch the catalogue, and a nearby filter cannot erase it.
  function distanceMeters(a, b) {
    const lat1=Number(a?.lat),lon1=Number(a?.lon),lat2=Number(b?.lat),lon2=Number(b?.lon);
    if (![lat1,lon1,lat2,lon2].every(Number.isFinite) || Math.abs(lat1)>90 || Math.abs(lat2)>90 || Math.abs(lon1)>180 || Math.abs(lon2)>180) return Infinity;
    const rad=Math.PI/180;
    const dLat=(lat2-lat1)*rad, dLon=(lon2-lon1)*rad;
    const t=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
    return 6371000*2*Math.asin(Math.min(1,Math.sqrt(t)));
  }
  function rankedCatalog() {
    const rows=state.catalog.map(shop=>({...shop, distance_m:state.coords ? distanceMeters(state.coords,shop) : null}));
    // The owner-selected boosted shop stays first even after GPS is enabled.
    // Nearby-only filtering still respects distance: an out-of-range shop is hidden.
    rows.sort((a,b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
      (state.coords ? a.distance_m - b.distance_m : 0));
    return rows;
  }
  function updateShopScope() {
    const near=Boolean(state.coords && !state.preview);
    const all=$('#allShopsBtn'), nearby=$('#nearbyShopsBtn');
    if (!all || !nearby) return;
    nearby.disabled=!near;
    all.classList.toggle('active',!state.nearbyOnly || !near);
    nearby.classList.toggle('active',state.nearbyOnly && near);
    all.setAttribute('aria-pressed',String(!state.nearbyOnly || !near));
    nearby.setAttribute('aria-pressed',String(state.nearbyOnly && near));
  }
  const storageKey = () => `nearme-saved-${state.user?.id || 'preview'}`;
  const saved = () => { try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch { return {}; } };
  const save = (obj) => { try { localStorage.setItem(storageKey(), JSON.stringify(obj)); } catch { /* storage may be disabled */ } };
  let galleryLightbox = null;
  let shopDetailOverlay = null;
  let shopDetailLastFocus = null;
  const directionsURL = p => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat + ',' + p.lon)}&travelmode=walking`;

  function toast(message) {
    clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show');
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3800);
  }
  function setStatus(title, caption, success = false) {
    const box = $('#locationStatus');
    box.querySelector('strong').textContent = title;
    box.querySelector('span').textContent = caption;
    box.querySelector('.status-indicator').style.background = success ? '#d8f5dd' : '';
  }
  function setUser(user) {
    state.user = user;
    const display = user?.first_name ? user.first_name : 'explorer';
    $('#hello').innerHTML = `Hello, ${escapeHTML(display)} <span class="wave">✌️</span>`;
    $('#avatar').textContent = ((user?.first_name || 'E')[0] + ((user?.last_name || '')[0] || '')).toUpperCase();
    $('#avatar').title = user?.username ? `@${user.username}` : 'Telegram visitor';
  }
  async function api(path, options = {}) {
    if (!apiBase && window.location.hostname.endsWith('github.io')) {
      throw new Error('API not configured: update docs/config.js with your tunnel URL');
    }
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {'X-Telegram-Init-Data': initData, ...(webLogin?.getToken() && !initData ? {'Authorization':`Bearer ${webLogin.getToken()}`} : {}), ...(options.headers || {})}
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.detail || `Request failed (${response.status})`);
    }
    return response.json();
  }
  function showLoginGate(error = '') {
    const gate = $('#nearmeAuthGate');
    const shell = $('#nearmeAppShell');
    gate.hidden = false;
    shell.inert = true;
    document.body.style.overflow = 'hidden';
    const message = $('#nearmeLoginError');
    message.textContent = error;
    message.hidden = !error;
    $('#nearmeLogout').hidden = true;
    $('#nearmeStaffLink').hidden = true;
  }
  function hideLoginGate() {
    $('#nearmeAuthGate').hidden = true;
    $('#nearmeAppShell').inert = false;
    document.body.style.overflow = '';
    $('#nearmeLogout').hidden = !(!initData && webLogin?.getToken());
  }
  async function logOut() {
    const token = webLogin?.getToken();
    if (token) {
      try { await api('/api/auth/session', {method:'DELETE'}); } catch {}
    }
    webLogin?.clearToken();
    state.user = null; state.catalog = []; state.places = []; state.coords = null;
    state.preview = false; state.nearbyOnly = false;
    if(presenceTimer)clearInterval(presenceTimer);presenceTimer=null;
    setUser(null);
    showLoginGate();
  }
  async function boot() {
    if (tg) {
      try { tg.ready(); tg.expand(); } catch { /* browser fallback */ }
    }
    $('#today').textContent = new Intl.DateTimeFormat(window.NearMeI18n?.language || 'en-US', {month:'short', day:'numeric'}).format(new Date());
    wireEvents();
    $('#nearmeLoginButton').addEventListener('click', async () => {
      const button = $('#nearmeLoginButton');
      button.disabled = true;
      button.textContent = 'Connecting to Telegram…';
      $('#nearmeLoginError').hidden = true;
      try { await webLogin.beginLogin(apiBase); }
      catch (err) {
        showLoginGate(err.message || 'Telegram login is unavailable');
        button.disabled = false;
        button.textContent = '✈ Continue with Telegram';
      }
    });
    $('#nearmeLogout').addEventListener('click', logOut);
    await loadDesign();
    state.demoEnabled = false;
    let loginError = '';
    try {
      if (!initData && webLogin) await webLogin.finishRedirect(apiBase);
      if (initData || webLogin?.getToken()) {
        const response = await api('/api/session', {method:'POST'});
        setUser(response.user);
        $('#nearmeStaffLink').hidden = !['owner','admin','moderator'].includes(response.role);
      }
    } catch (err) {
      loginError = err.message || 'Could not verify Telegram login';
      // Failed native Mini App initData must not silently grant web access.
      if (!initData && /expired|sign in|log in|Unauthorized|401|invalid/i.test(loginError)) webLogin?.clearToken();
    }
    if (!state.user) {showLoginGate(loginError);return;}
    hideLoginGate();
    const beat=()=>{if(state.user&&!document.hidden)api('/api/visitors/heartbeat',{method:'POST'}).catch(()=>{});};
    beat();if(presenceTimer)clearInterval(presenceTimer);
    presenceTimer=setInterval(beat,45000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)beat();});
    await loadPublicShops();
  }
  async function loadPublicShops() {
    let updated = false;
    if (!state.user) return updated;
    try {
      const data = await api('/api/shops');
      if (!Array.isArray(data.shops)) throw new Error('Invalid shop catalogue');
      state.catalog = data.shops;
      updated = true;
    } catch (err) {
      console.warn('NearMe catalogue refresh failed:', err);
      if (/Telegram login expired|Please sign in|Log in with Telegram/.test(err.message)) {
        webLogin?.clearToken(); state.user = null; showLoginGate('Your login has expired. Please sign in again.');
      }
    }
    if (!state.preview) {state.places=rankedCatalog();render();}
    return updated;
  }
  function wireEvents() {
    $('#locationBtn').addEventListener('click', locate);
    $('#sampleBtn').addEventListener('click', showSample);
    $('#allShopsBtn').addEventListener('click', () => {state.nearbyOnly=false;render();});
    $('#nearbyShopsBtn').addEventListener('click', () => {
      if (!state.coords || state.preview) {toast('Tap Use my location first');return;}
      state.nearbyOnly=true;render();
    });
    $('#searchInput').addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); render(); });
    $('#categories').addEventListener('click', event => {
      const btn=event.target.closest('button[data-category]');if(!btn) return;
      state.category=btn.dataset.category;
      $$('.category').forEach(item=>item.classList.toggle('active',item===btn));render();
    });
    $('#radiusBtn').addEventListener('click', () => $('#radiusOptions').hidden = !$('#radiusOptions').hidden);
    $$('#radiusOptions button').forEach(btn => btn.addEventListener('click', () => {
      state.radius = Number(btn.dataset.radius);
      $('#radiusText').textContent = `${state.radius / 1000} km`;
      $$('#radiusOptions button').forEach(x => x.classList.toggle('selected', x === btn));
      $('#radiusOptions').hidden = true;
      if (state.coords && !state.preview) fetchPlaces();
      else toast('Choose your location to search within this radius');
    }));
    $('#listViewBtn').addEventListener('click', () => setView('list'));
    $('#mapViewBtn').addEventListener('click', () => setView('map'));
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
      if (btn.hidden) return;
      state.tab = btn.dataset.tab;
      $$('.nav-item').forEach(x => x.classList.toggle('active', x === btn));
      if (state.tab === 'visitors') refreshPublicVisitorStats();
      if (state.tab === 'map') setView('map');
      else if (state.view === 'map') setView('list');
      render();
      (state.tab==='visitors' ? $('#visitorDashboardSection') : $('#discover')).scrollIntoView({behavior:'smooth', block:'start'});
    }));
    $('#resultList').addEventListener('click', event => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) {
        const card = event.target.closest('.place-card[data-shop-id]');
        if (card) {
          const place = getAvailablePlaces().find(p => p.id === card.dataset.shopId);
          if (place) openShopDetails(place);
        }
        return;
      }
      const place = getAvailablePlaces().find(p => p.id === btn.dataset.id);
      if (!place) return;
      const action = btn.dataset.action;
      if (action === 'details') {
        openShopDetails(place);
      } else if (action === 'save') {
        if (place.id.startsWith('demo-')) { toast('Sample places are for preview only'); return; }
        const favorites = saved();
        if (favorites[place.id]) { delete favorites[place.id]; toast('Removed from saved places'); }
        else { favorites[place.id] = place; toast('Saved for later ❤️'); }
        save(favorites);
        render();
      } else if (action === 'view-photo') {
        const idx=Number(btn.dataset.index);
        if (Number.isInteger(idx) && idx>=0) openGalleryPhoto(place, idx);
      } else if (action === 'directions') {
        if (place.id.startsWith('demo-')) { toast('Directions are disabled for fictional demo listings'); return; }
        const url = directionsURL(place);
        if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank', 'noopener,noreferrer');
      } else if (action === 'show-map') {
        setView('map', place);
      } else if (action === 'whatsapp' && place.whatsapp && /^\+?[1-9][0-9]{6,14}$/.test(place.whatsapp)) {
        const url=`https://wa.me/${place.whatsapp.replace(/\D/g,'')}`;
        if(tg?.openLink)tg.openLink(url);else window.open(url,'_blank','noopener,noreferrer');
      } else if (action === 'telegram' && /^https:\/\/(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/-]{3,120}$/.test(place.telegram_url||'')) {
        if(tg?.openTelegramLink && place.telegram_url.startsWith('https://t.me/'))tg.openTelegramLink(place.telegram_url);
        else if(tg?.openLink)tg.openLink(place.telegram_url);
        else window.open(place.telegram_url,'_blank','noopener,noreferrer');
      }
    });
    // The shop card itself is also keyboard accessible. Nested action buttons
    // keep their own behavior, so clicking WhatsApp never opens the details.
    $('#resultList').addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || !event.target.matches('.place-card[data-shop-id]')) return;
      event.preventDefault();
      const place = getAvailablePlaces().find(p => p.id === event.target.dataset.shopId);
      if (place) openShopDetails(place);
    });
  }

  function openGalleryPhoto(place, index) {
    const album=Array.isArray(place.gallery)?place.gallery:[];
    const item=album[index];
    if(!item || !mediaURL(item.url))return;
    if (!galleryLightbox) {
      const dialog=document.createElement('div');dialog.className='gallery-lightbox';dialog.hidden=true;
      dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
      dialog.setAttribute('aria-label','Shop photo viewer');
      dialog.innerHTML=`<div class="gallery-lightbox-inner"><button class="gallery-close" type="button" aria-label="Close photo viewer">×</button><img alt="Shop gallery photo"><p class="gallery-caption"></p><div class="gallery-pager"><button type="button" class="gallery-prev">← Previous</button><span class="gallery-count"></span><button type="button" class="gallery-next">Next →</button></div></div>`;
      document.body.append(dialog);galleryLightbox=dialog;
      dialog.querySelector('.gallery-close').addEventListener('click', closeGalleryPhoto);
      dialog.addEventListener('click',e=>{if(e.target===dialog)closeGalleryPhoto();});
      dialog.querySelector('.gallery-prev').addEventListener('click',()=>{const {place,index}=dialog._photoState;openGalleryPhoto(place,index-1);});
      dialog.querySelector('.gallery-next').addEventListener('click',()=>{const {place,index}=dialog._photoState;openGalleryPhoto(place,index+1);});
      document.addEventListener('keydown',e=>{
        if(dialog.hidden)return;
        if(e.key==='Escape')closeGalleryPhoto();
        if(e.key==='ArrowLeft' && dialog._photoState.index>0)openGalleryPhoto(dialog._photoState.place,dialog._photoState.index-1);
        if(e.key==='ArrowRight' && dialog._photoState.index<dialog._photoState.place.gallery.length-1)openGalleryPhoto(dialog._photoState.place,dialog._photoState.index+1);
      });
    }
    galleryLightbox._photoState={place,index};
    galleryLightbox.querySelector('img').src=mediaURL(item.url);
    galleryLightbox.querySelector('img').alt=`${place.name} gallery image ${index+1}`;
    galleryLightbox.querySelector('.gallery-caption').textContent=item.description || 'Shop photo';
    galleryLightbox.querySelector('.gallery-caption').toggleAttribute('data-nearme-no-translate',!!item.description);
    galleryLightbox.querySelector('.gallery-count').textContent=`${index+1} of ${album.length}`;
    galleryLightbox.querySelector('.gallery-prev').disabled=index===0;
    galleryLightbox.querySelector('.gallery-next').disabled=index===album.length-1;
    galleryLightbox.hidden=false;
    document.body.style.overflow='hidden';
    galleryLightbox.querySelector('.gallery-close').focus();
  }
  function closeGalleryPhoto(){
    if(galleryLightbox){
      galleryLightbox.hidden=true;
      document.body.style.overflow=(shopDetailOverlay && !shopDetailOverlay.hidden) ? 'hidden' : '';
    }
  }

  function closeShopDetails() {
    if (!shopDetailOverlay || shopDetailOverlay.hidden) return;
    if (galleryLightbox && !galleryLightbox.hidden) closeGalleryPhoto();
    shopDetailOverlay.hidden=true;
    document.body.style.overflow='';
    if (shopDetailLastFocus?.isConnected) shopDetailLastFocus.focus();
  }

  function openShopDetails(place) {
    if (!place) return;
    if (!shopDetailOverlay) {
      const overlay=document.createElement('div');
      overlay.className='shop-detail-overlay';
      overlay.hidden=true;
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-label','Shop advertisement details');
      overlay.innerHTML=`<div class="shop-detail-panel"><button type="button" class="shop-detail-close" aria-label="Close shop details">×</button><div class="shop-detail-content"></div></div>`;
      document.body.append(overlay);
      overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('.shop-detail-close')) { closeShopDetails(); return; }
        const btn=event.target.closest('button[data-detail-action]');
        if (!btn || !overlay._place) return;
        const p=overlay._place;
        switch (btn.dataset.detailAction) {
          case 'photo': openGalleryPhoto(p, Number(btn.dataset.index)); break;
          case 'map': closeShopDetails(); setView('map',p); break;
          case 'directions':
            if (p.id.startsWith('demo-')) { toast('Directions are disabled for fictional demo listings'); return; }
            if (tg?.openLink) tg.openLink(directionsURL(p));
            else window.open(directionsURL(p),'_blank','noopener,noreferrer');
            break;
          case 'whatsapp':
            if (!/^\+?[1-9][0-9]{6,14}$/.test(p.whatsapp || '')) return;
            const wa=`https://wa.me/${p.whatsapp.replace(/\D/g,'')}`;
            if (tg?.openLink) tg.openLink(wa); else window.open(wa,'_blank','noopener,noreferrer');
            break;
          case 'telegram':
            if (!/^https:\/\/(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/-]{3,120}$/.test(p.telegram_url||'')) return;
            if (tg?.openTelegramLink && p.telegram_url.startsWith('https://t.me/')) tg.openTelegramLink(p.telegram_url);
            else if (tg?.openLink) tg.openLink(p.telegram_url);
            else window.open(p.telegram_url,'_blank','noopener,noreferrer');
            break;
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key==='Escape' && !overlay.hidden && (!galleryLightbox || galleryLightbox.hidden)) closeShopDetails();
      });
      shopDetailOverlay=overlay;
    }
    const cover=mediaURL(place.profile_image || place.image_url);
    const category=categories[place.category] || ['Shop',''];
    const gallery=Array.isArray(place.gallery)?place.gallery:[];
    const photoHTML=gallery.map((item,i) => {
      const url=mediaURL(item.url);if(!url)return '';
      return `<figure class="shop-detail-photo"><button type="button" data-detail-action="photo" data-index="${i}" aria-label="Enlarge gallery photo ${i+1}"><img src="${url}" alt="${escapeHTML(place.name)} gallery photo ${i+1}" loading="lazy"></button>${item.description?`<figcaption data-nearme-no-translate>${escapeHTML(item.description)}</figcaption>`:''}</figure>`;
    }).join('');
    const isDemo=String(place.id).startsWith('demo-');
    const contact=[];
    if (place.whatsapp) contact.push('<button type="button" class="shop-detail-whatsapp" data-detail-action="whatsapp">WhatsApp · Enquire / Book</button>');
    if (place.telegram_url) contact.push('<button type="button" class="shop-detail-telegram" data-detail-action="telegram">Telegram</button>');
    const details=shopDetailOverlay.querySelector('.shop-detail-content');
    details.innerHTML=`
      <div class="shop-detail-cover">${cover?`<img src="${cover}" alt="${escapeHTML(place.name)} profile photo">`:`<span aria-hidden="true">${escapeHTML(category[1] || place.name.trim().slice(0,2).toUpperCase())}</span>`}</div>
      <div class="shop-detail-body">
        <span class="shop-detail-category">${escapeHTML(category[0])}</span>
        <h2 data-nearme-no-translate>${escapeHTML(place.name)}</h2>
        ${place.price?`<p class="shop-detail-price" data-nearme-no-translate>${escapeHTML(place.price)}</p>`:''}
        <p class="shop-detail-address" data-nearme-no-translate>📍 ${escapeHTML(place.address)}</p>
        ${place.description?`<p class="shop-detail-description" data-nearme-no-translate>${escapeHTML(place.description)}</p>`:''}
        ${photoHTML?`<h3>Photos &amp; details</h3><div class="shop-detail-gallery">${photoHTML}</div>`:''}
        <div class="shop-detail-actions">
          ${contact.join('')}
          ${!isDemo?'<button type="button" class="shop-detail-directions" data-detail-action="directions">Google Maps directions</button>':''}
          ${designSettings.show_map?'<button type="button" class="shop-detail-map" data-detail-action="map">View on map</button>':''}
        </div>
      </div>`;
    shopDetailOverlay._place=place;
    shopDetailLastFocus=document.activeElement;
    shopDetailOverlay.hidden=false;
    shopDetailOverlay.querySelector('.shop-detail-panel').scrollTop=0;
    document.body.style.overflow='hidden';
    shopDetailOverlay.querySelector('.shop-detail-close').focus();
  }

  function showSample() {
    state.preview = true;
    state.coords = {lat:3.1408, lon:101.6890}; // Illustrative Kuala Lumpur area, not user's location.
    state.places = sample;
    $('#demoBadge').hidden = false;
    $('#locationBtnText').textContent = 'Find real places near me';
    setStatus('Viewing a sample preview', 'Demo listings are fictional. Share your location for real nearby shops.');
    render();
  }
  async function locate() {
    if (state.loading) return;
    if (!state.user) {
      showLoginGate('Please log in with Telegram first');
      return;
    }
    state.loading = true;
    $('#locationBtn').disabled = true;
    $('#locationBtnText').textContent = 'Finding your location...';
    try {
      const pos = await getUserLocation();
      if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) throw new Error('Location not available');
      state.coords = pos;
      state.preview = false;
      $('#demoBadge').hidden = true;
      setStatus('Location shared for this search', 'Your position is used to find nearby businesses; we don’t save it in the visitor log.', true);
      await fetchPlaces();
    } catch (err) {
      toast(err.message || 'Location access was not granted');
      setStatus('Location permission needed', 'You can enable location for NearMe in Telegram settings, or try again.');
    } finally {
      state.loading = false;
      $('#locationBtn').disabled = false;
      $('#locationBtnText').textContent = state.coords && !state.preview ? 'Refresh my location' : designSettings.hero.cta;
    }
  }
  function getUserLocation() {
    const lm = tg?.LocationManager;
    if (lm && typeof lm.init === 'function' && (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'))) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Location request timed out')), 25000);
        lm.init(() => {
          if (!lm.isLocationAvailable) { clearTimeout(timer); reject(new Error('Location unavailable on this device')); return; }
          try {
            lm.getLocation(location => {
              clearTimeout(timer);
              if (!location) { reject(new Error('Location was not shared. Check Telegram location settings.')); return; }
              resolve({lat:Number(location.latitude), lon:Number(location.longitude)});
            });
          } catch (err) { clearTimeout(timer); reject(err); }
        });
      });
    }
    if (!navigator.geolocation) return Promise.reject(new Error('Your browser does not support GPS location'));
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({lat:pos.coords.latitude, lon:pos.coords.longitude}),
        () => reject(new Error('Location permission denied. Enable it in your device settings.')),
        {enableHighAccuracy:true, timeout:20000, maximumAge:60000}
      );
    });
  }
  async function fetchPlaces() {
    if (!state.coords) return;
    $('#subtitle').textContent = 'Updating shop distances...';
    state.preview = false;
    state.view = 'list';
    state.tab = 'explore';
    $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === 'explore'));
    const updated=await loadPublicShops();
    // Always retain the full published catalogue. The nearby-only switch is
    // the only action that filters by radius; simply using GPS does not.
    state.places=rankedCatalog();
    render();
    const nearby=state.places.filter(p=>p.distance_m<=state.radius).length;
    if (!updated && !state.catalog.length) toast('Could not load advertisements. Check your backend connection.');
    else toast(`${nearby} nearby · ${state.places.length} published shops available`);
  }
  function getAvailablePlaces() {
    return state.tab === 'saved' ? rankedCatalog().filter(shop=>Boolean(saved()[shop.id])) : state.places;
  }
  function getFilteredPlaces() {
    return getAvailablePlaces().filter(p =>
      (state.tab==='saved' || state.preview || !state.nearbyOnly || !state.coords || p.distance_m<=state.radius) &&
      (state.category === 'all' || p.category === state.category) &&
      (!state.search || `${p.name} ${p.address} ${categories[p.category]?.[0] || ''}`.toLowerCase().includes(state.search))
    );
  }
  function setView(view, focusPlace = null) {
    state.view = view;
    $('#listViewBtn').classList.toggle('selected', view === 'list');
    $('#mapViewBtn').classList.toggle('selected', view === 'map');
    if (view === 'map' && !designSettings.show_map) { toast('Map view is disabled'); return; }
    if (view === 'map') {
      state.tab = 'map';
      $$('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === 'map'));
    }
    render();
    // Wait until the map panel is laid out before centering a selected shop.
    if (focusPlace) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!state.map || $('#mapPanel').hidden) return;
        state.map.invalidateSize({pan:false});
        state.map.setView([Number(focusPlace.lat), Number(focusPlace.lon)], 16);
        const item=state.mapMarkers.find(m=>m.placeId===focusPlace.id);
        if (item) item.marker.openPopup();
      }));
    }
  }
  async function refreshPublicVisitorStats() {
    if(lastVisitorReport && Date.now()-lastVisitorReport < 60000)return;
    try{
      const report=await api('/api/visitor-dashboard');
      $('#visitorPublicTotal').textContent=report.total_members;
      $('#visitorPublicNew').textContent=report.new_members_7d;
      $('#visitorPublicUpdated').textContent='Historical report as of '+new Date(report.as_of*1000).toLocaleString('en-MY',
        {timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'})+' (Malaysia time). Not live.';
      lastVisitorReport=Date.now();
    }catch(error){$('#visitorPublicUpdated').textContent=error.message||'Could not load visitor summary';}
  }
  function render() {
    const visitorMode = state.tab === 'visitors';
    $('#visitorDashboardSection').hidden=!visitorMode;
    // Keep the language selector next to the profile only on the Discover tab.
    $('#discoverLanguageControl').hidden = state.tab !== 'explore';
    for(const section of ['.hero','.location-status','.discover','.results-section']) {
      const item=$(section);if(item)item.hidden=visitorMode;
    }
    updateShopScope();
    const rows = getFilteredPlaces();
    const all = getAvailablePlaces();
    const isSaved = state.tab === 'saved';
    const nearCount = state.coords && !state.preview ? state.places.filter(p=>p.distance_m<=state.radius).length : 0;
    $('#sectionTitle').innerHTML = isSaved ? 'Your saved spots <span class="title-star">♥</span>' :
      'Spots worth discovering <span class="title-star">✦</span>';
    $('#subtitle').textContent = state.preview ? 'A peek at what your neighborhood can look like' :
      isSaved ? `${all.length} places in your collection` :
      state.coords ? state.nearbyOnly
        ? `${rows.length} matching shop${rows.length===1?'':'s'} within ${state.radius / 1000} km · All Shops shows the full catalogue`
        : `${rows.length} shop${rows.length===1?'':'s'} shown · ${nearCount} within ${state.radius / 1000} km of you` :
      `${rows.length} published shop advertisement${rows.length===1?'':'s'} · Share location to see distances`; 
    const empty = $('#emptyState');
    const list = $('#resultList');
    const map = $('#mapPanel');
    const notes = $('#attribution');
    empty.hidden = true;
    list.hidden = true;
    // Avoid temporarily hiding an already visible map on every render.
    // Leaflet can otherwise cache a zero-sized viewport and load only one tile.
    if (state.view !== 'map') map.hidden = true;
    notes.hidden = true;
    if (!state.places.length && !state.preview && !isSaved) {
      map.hidden = true;
      empty.hidden = false;
      empty.querySelector('h3').textContent = "There's more nearby than you think.";
      empty.querySelector('p').innerHTML = 'No advertisements published yet. Tap <b>Use my location</b> to search for nearby ads, or explore a sample preview.';
      $('#sampleBtn').hidden = false;
      return;
    }
    if (!rows.length) {
      map.hidden = true;
      empty.hidden = false;
      empty.querySelector('h3').textContent = isSaved ? 'No saved spots yet' : 'No matching spots found';
      empty.querySelector('p').textContent = isSaved ? 'Tap the heart on a place to keep it here for later.' :
        state.nearbyOnly ? 'No matching shops in this radius. Tap All shops to browse every published advertisement.' :
        'Try another category or clear your search.';
      $('#sampleBtn').hidden = true;
      return;
    }
    if (state.view === 'map') {
      map.hidden = false;
      renderMap(rows);
    } else {
      list.hidden = false;
      list.innerHTML = (state.preview ? '<div class="demo-note">✨ Demo preview — fictional listings only.</div>' : '') + rows.map(p => {
        const category = categories[p.category] || ['Shop', ''];
        const isSaved = Boolean(saved()[p.id]);
        const sponsor = Boolean(p.sponsored);
        const cover = sponsor && mediaURL(p.image_url) ? `<img src="${mediaURL(p.image_url)}" loading="lazy" alt="Photo of ${escapeHTML(p.name)}">` : `<span>${escapeHTML(category[1] || p.name.trim().slice(0,2).toUpperCase())}</span>`;
        const galleryPhotos = sponsor ? (Array.isArray(p.gallery) ? p.gallery : (p.images||[]).slice(1).map(url=>({url,description:''}))) : [];
        const photoCount = galleryPhotos.filter(item=>mediaURL(item.url)).length;
        const title = escapeHTML(p.name);
        const id = escapeHTML(p.id);
        const distance = Number.isFinite(p.distance_m) ? `${icons.pin} ${fmt(p.distance_m)}` : `${icons.pin} View location`;
        return `<article class="place-card ${sponsor?'sponsored-card':''}" data-shop-id="${id}" tabindex="0" aria-label="View details for ${title}">
          <div class="place-image ${escapeHTML(p.category)}">${cover}${p.featured?'<span class="boost-pin">✦ Top Pick</span>':''}</div>
          <div class="place-info">
            <div class="place-topline"><span class="place-tag">${escapeHTML([String(category[1] || '').trim(),category[0]].filter(Boolean).join(' '))}</span></div>
            <h3 data-nearme-no-translate>${title}</h3>
            <p class="shop-card-address" data-nearme-no-translate title="${escapeHTML(p.address)}">${icons.pin} ${escapeHTML(p.address)}</p>
            ${p.description?`<p class="shop-description" data-nearme-no-translate>${escapeHTML(p.description)}</p>`:''}
            <div class="shop-card-meta">${p.price?`<span class="shop-price" data-nearme-no-translate>${escapeHTML(p.price)}</span>`:''}<span class="place-distance">${distance}</span></div>
          </div>
          <div class="card-action-zone">
            <button type="button" class="shop-view-details" data-action="details" data-id="${id}">View Shop <span aria-hidden="true">↗</span></button>
            <div class="card-contact-row">
              ${photoCount?`<button type="button" class="card-photo-count" data-action="details" data-id="${id}">▧ ${photoCount} photos</button>`:''}
              ${p.whatsapp?`<button type="button" class="contact-whatsapp" data-action="whatsapp" data-id="${id}">WhatsApp</button>`:''}
              ${p.telegram_url?`<button type="button" class="contact-telegram" data-action="telegram" data-id="${id}">Telegram</button>`:''}
              <button type="button" class="directions-btn" data-action="directions" data-id="${id}">${icons.route} Directions</button>
              ${designSettings.show_map ? `<button type="button" class="show-map-btn" data-action="show-map" data-id="${id}">Map</button>` : ''}
            </div>
          </div>
          <button ${designSettings.show_saved ? '' : 'hidden'} class="favorite-btn ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Unsave' : 'Save'} ${title}" data-action="save" data-id="${id}">${icons.heart}</button>
        </article>`;
      }).join('');
    }
    notes.hidden = true;
  }
  function renderMap(rows) {
    const host=document.getElementById('map');
    if (!window.L || !host) {
      host.textContent='Map cannot load. You can still open Google Maps directions using the shop cards.';
      return;
    }
    if(!state.map) {
      state.map=L.map(host,{zoomControl:true,scrollWheelZoom:false});
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        maxZoom:19
      }).addTo(state.map);
      // Telegram may resize the WebView while the tab is open. Leaflet needs
      // invalidateSize after the container becomes visible or changes size.
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          if (!$('#mapPanel').hidden && host.offsetWidth && host.offsetHeight) {
            requestAnimationFrame(() => state.map && state.map.invalidateSize({pan:false,debounceMoveend:true}));
          }
        });
        observer.observe(host);
      }
      window.addEventListener('resize', () => {
        if (!$('#mapPanel').hidden && state.map) state.map.invalidateSize({pan:false});
      });
      if (tg?.onEvent) {
        tg.onEvent('viewportChanged', () => {
          if (!$('#mapPanel').hidden && state.map) {
            requestAnimationFrame(() => state.map.invalidateSize({pan:false}));
          }
        });
      }
    }
    for(const item of state.mapMarkers)item.marker.remove();
    state.mapMarkers=[];
    const points=[];
    for(const p of rows) {
      const latitude=Number(p.lat), longitude=Number(p.lon);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude))continue;
      const marker=L.marker([latitude,longitude],{title:p.name}).addTo(state.map);
      const title=escapeHTML(p.name);
      const price=p.price?`<div>${escapeHTML(p.price)}</div>`:'';
      const directions=p.id.startsWith('demo-')?'':`<a href="${directionsURL(p)}" target="_blank" rel="noopener noreferrer">Open Google Maps directions</a>`;
      marker.bindPopup(`<div class="map-popup"><strong>${title}</strong>${price}<button type="button" class="map-shop-detail">View shop details</button>${directions}</div>`);
      marker.on('popupopen', () => {
        const button=marker.getPopup()?.getElement()?.querySelector('.map-shop-detail');
        if (button) button.addEventListener('click',() => {state.map.closePopup();openShopDetails(p);},{once:true});
      });
      state.mapMarkers.push({placeId:p.id,marker});points.push([latitude,longitude]);
    }
    if(state.coords && !state.preview)points.push([state.coords.lat,state.coords.lon]);
    // Fit bounds only AFTER the map gets its final visible dimensions.
    // Using fitBounds before invalidateSize caused the corner-only tiles.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if ($('#mapPanel').hidden || !host.offsetWidth || !host.offsetHeight || !state.map) return;
      state.map.invalidateSize({pan:false});
      if (points.length === 1) state.map.setView(points[0],15,{animate:false});
      else if (points.length) state.map.fitBounds(points,{padding:[28,28],maxZoom:15,animate:false});
      // WebView viewport transitions can settle a moment after the tab opens.
      setTimeout(() => {
        if (state.map && !$('#mapPanel').hidden) state.map.invalidateSize({pan:false});
      }, 220);
    }));
  }
  window.addEventListener('nearme:languagechange', () => {
    $('#today').textContent = new Intl.DateTimeFormat(window.NearMeI18n?.language || 'en-US', {month:'short', day:'numeric'}).format(new Date());
    if (state.user) setUser(state.user);
    if (designSettings) {
      // Refresh published design labels without changing the saved search state.
      const d=designSettings;
      const tr=s=>window.NearMeI18n?.t(s) || s;
      $('#heroEyebrow').textContent=tr(d.hero.eyebrow);
      $('#heroTitle').textContent=tr(d.hero.title);
      $('#heroHighlight').textContent=tr(d.hero.highlight);
      $('#heroDescription').textContent=tr(d.hero.description);
      $('#discoveryTagline').textContent=tr(d.tagline);
      $('#locationBtnText').textContent=tr(d.hero.cta);
      $('#searchInput').placeholder=tr(d.search_placeholder);
      document.querySelectorAll('.category[data-category]').forEach(b=>{
        const c=d.categories.find(x=>x.key===b.dataset.category);
        if(!c)return;for(const child of [...b.childNodes])if(child.nodeType===3)child.nodeValue=tr(c.label);
      });
    }
    render();
    window.NearMeI18n?.refresh();
  });
  document.addEventListener('DOMContentLoaded', boot);
})();
