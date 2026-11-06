/* NearMe Studio: server-verified staff roles on native Telegram or web login. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const apiBase = String(window.NEARME_API_BASE || '').replace(/\/+$/, '');
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';
  const webLogin = window.NearMeWebLogin;
  let role = null;
  let permissions = {};
  let design = null;
  let published = '';
  let publishedCategories = [];
  let busy = false;
  let toastTimer;
  let shopManager = null;
  let teamManager = null;
  let liveVisitors = null;
  let activityTimer = null;
  const mediaURL = value => /^\/media\/[a-f0-9]{32}\.webp$/.test(value || '') ? `${apiBase}${value}` : '';
  function toast(text) { clearTimeout(toastTimer);$('#toast').textContent=text;
    $('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3900); }
  async function api(path,options={}) {
    if (!apiBase && location.hostname.endsWith('github.io')) throw Error('Configure docs/config.js with your Cloudflare Tunnel URL first');
    const response=await fetch(`${apiBase}${path}`,{...options,
      headers:{'X-Telegram-Init-Data':initData,
        ...(!initData && webLogin?.getToken() ? {'Authorization':`Bearer ${webLogin.getToken()}`} : {}),
        ...options.headers}});
    if (!response.ok) { const data=await response.json().catch(()=>({}));
      const detail=Array.isArray(data.detail)?'Invalid settings: check the field limits':data.detail;
      throw Error(detail || `Server responded ${response.status}`); }
    return response.json();
  }
  function setBusy(value) {busy=value;$('#saveButton').disabled=value;
    $('#saveButton').textContent=value?'Publishing…':'Publish changes ↗'; }
  function dirty() { const hasChanges=published!==JSON.stringify(design);
    $('#saveState').textContent=hasChanges?'Unpublished changes':'All changes saved';
    $('#saveState').classList.toggle('dirty',hasChanges); }
  function populate() {
    $('#appName').value=design.app_name;$('#tagline').value=design.tagline;
    $('#darkMode').checked=design.appearance.dark_mode;
    for (const [id,key] of Object.entries({primary:'primary',accent:'accent',background:'background',textColor:'text'})) {
      $(`#${id}`).value=design.appearance[key];
    }
    $('#eyebrow').value=design.hero.eyebrow;$('#heroTitle').value=design.hero.title;
    $('#heroHighlight').value=design.hero.highlight;$('#heroDescription').value=design.hero.description;
    $('#cta').value=design.hero.cta;$('#showMap').checked=design.show_map;
    $('#showSaved').checked=design.show_saved;$('#searchPlaceholder').value=design.search_placeholder;
    $('#defaultRadius').value=design.default_radius;
    renderCategories();renderPreview();dirty();
  }
  function readFields() {
    design.app_name=$('#appName').value;design.tagline=$('#tagline').value;
    design.appearance.dark_mode=$('#darkMode').checked;
    for (const [id,key] of Object.entries({primary:'primary',accent:'accent',background:'background',textColor:'text'}))
      design.appearance[key]=$(`#${id}`).value.toUpperCase();
    design.hero.eyebrow=$('#eyebrow').value;design.hero.title=$('#heroTitle').value;
    design.hero.highlight=$('#heroHighlight').value;design.hero.description=$('#heroDescription').value;
    design.hero.cta=$('#cta').value;design.show_map=$('#showMap').checked;
    design.show_saved=$('#showSaved').checked;design.search_placeholder=$('#searchPlaceholder').value;
    design.default_radius=Number($('#defaultRadius').value);
    renderPreview();dirty();
  }
  function newCategory() {
    if (design.categories.length >= 60) {toast('Maximum 60 categories');return;}
    const raw = window.prompt('New category name (for example: Massage or Car Wash):');
    if (raw === null) return;
    const label = raw.trim();
    if (!label || label.length > 32) {toast('Use a category name between 1 and 32 characters');return;}
    const base = label.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').replace(/^([0-9])/,'category_$1');
    // Stable ID: do not rename after creating ads. Emoji and display labels are editable.
    const normalized = /^[a-z][a-z0-9_]*$/.test(base) && base.length >= 2 ? base : 'custom';
    const taken = new Set(design.categories.map(category=>category.key));
    let key=normalized.slice(0,32), suffix=2;
    while (taken.has(key)) {const tail='_'+suffix++;key=normalized.slice(0,32-tail.length)+tail;}
    design.categories.push({key,label,emoji:'',enabled:true});
    renderCategories();renderPreview();dirty();
    toast('Category added. Publish changes before assigning shops to it.');
  }
  function renderCategories() {
    const target=$('#categoryEditor');target.replaceChildren();
    design.categories.forEach((category,index) => {
      const row=document.createElement('div');row.className='category-row';
      const emoji=document.createElement('input');emoji.type='text';emoji.className='cat-emoji';
      emoji.value=category.emoji || '';emoji.maxLength=12;emoji.placeholder='Optional';
      emoji.title='Optional category emoji (leave blank for text only)';
      emoji.setAttribute('aria-label',`${category.label} emoji (optional)`);
      emoji.addEventListener('input',()=>{category.emoji=emoji.value;renderPreview();dirty()});
      const name=document.createElement('input');name.type='text';name.value=category.label;name.maxLength=32;
      name.setAttribute('aria-label',`${category.key} category label`);
      name.addEventListener('input',()=>{category.label=name.value;renderPreview();dirty()});
      const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=category.enabled;
      enabled.disabled=category.key==='all';enabled.setAttribute('aria-label',`Show ${category.key}`);
      enabled.addEventListener('change',()=>{category.enabled=enabled.checked;renderPreview();dirty()});
      const enabledLabel=document.createElement('label');enabledLabel.className='cat-switch';enabledLabel.append(enabled,document.createTextNode(' Show'));
      const arrows=document.createElement('div');arrows.className='arrow-controls';
      const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='Move up';up.disabled=index===0;
      up.addEventListener('click',()=>{[design.categories[index-1],design.categories[index]]=[design.categories[index],design.categories[index-1]];renderCategories();renderPreview();dirty()});
      const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='Move down';down.disabled=index===design.categories.length-1;
      down.addEventListener('click',()=>{[design.categories[index+1],design.categories[index]]=[design.categories[index],design.categories[index+1]];renderCategories();renderPreview();dirty()});
      const actions=document.createElement('div');actions.className='cat-actions';actions.append(arrows);
      if(category.key !== 'all') {
        const remove=document.createElement('button');remove.type='button';remove.className='cat-delete';
        remove.title='Delete category';remove.textContent='×';
        remove.setAttribute('aria-label',`Delete ${category.label}`);
        remove.addEventListener('click',()=>{
          if(!window.confirm(`Delete category “${category.label}”? If shops are assigned to it, publishing will be blocked until you reassign them.`))return;
          design.categories.splice(index,1);renderCategories();renderPreview();dirty();
        });actions.append(remove);
      }
      const info=document.createElement('small');info.className='cat-key';info.textContent=`ID: ${category.key}`;
      const labelGroup=document.createElement('div');labelGroup.className='cat-name';labelGroup.append(name,info);
      row.append(emoji,labelGroup,enabledLabel,actions);target.append(row);
    });
  }
  function renderPreview() {
    const a=design.appearance;
    const page=$('#previewPage');page.style.background=a.background;page.style.color=a.text;
    $('#previewName').textContent=design.app_name || 'Your brand';
    $('#previewLogo').replaceChildren();
    const logo=mediaURL(design.logo_url);
    if(logo){const img=document.createElement('img');img.src=logo;img.alt='Logo';$('#previewLogo').append(img);}
    else $('#previewLogo').textContent='✳';
    $('#previewLogo').style.background=a.primary;
    const hero=$('#previewHero');const banner=mediaURL(design.hero.banner_url);
    hero.style.backgroundImage=banner?`linear-gradient(100deg,rgba(35,10,64,.88),rgba(124,22,134,.5)),url("${banner}")`:'none';
    hero.style.backgroundColor=a.primary;
    $('#previewEyebrow').textContent='● '+design.hero.eyebrow;
    $('#previewTitle').textContent=design.hero.title;
    $('#previewHighlight').textContent=design.hero.highlight;
    $('#previewHighlight').style.color=a.accent;
    $('#previewDescription').textContent=design.hero.description;
    $('#previewCTA').textContent='📍 '+design.hero.cta+' →';
    $('#previewCTA').style.backgroundColor=a.accent;
    $('#previewCTA').style.color='#ffffff';
    $('#previewTagline').textContent=design.tagline;
    const chips=$('#previewCategories');chips.replaceChildren();
    design.categories.filter(c=>c.enabled).forEach((c,i)=>{
      const span=document.createElement('span');
      span.textContent=[String(c.emoji || '').trim(), c.label].filter(Boolean).join(' ');
      if(i===0)span.style.backgroundColor=a.primary;
      chips.append(span);
    });
    $$('[data-preview-tab="map"]').forEach(el=>el.hidden=!design.show_map);
    $$('[data-preview-tab="saved"]').forEach(el=>el.hidden=!design.show_saved);
    $('#logoPreview').replaceChildren();
    if(logo){const img=document.createElement('img');img.src=logo;img.alt='Current logo';$('#logoPreview').append(img)}
    else $('#logoPreview').textContent='✳';
    $('#bannerPreview').replaceChildren();
    if(banner){const img=document.createElement('img');img.src=banner;img.alt='Current banner';$('#bannerPreview').append(img)}
    else $('#bannerPreview').textContent='▧';
    for (const [id,key] of Object.entries({primary:'primary',accent:'accent',background:'background',textColor:'text'}))
      $(`#${id}Value`).textContent=a[key].toUpperCase();
  }
  async function upload(file,kind) {
    if (!file) return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5_000_000){toast('Please choose a PNG, JPEG or WebP image under 5 MB');return;}
    try {const form=new FormData();form.append('image',file);
      const result=await api('/api/admin/upload',{method:'POST',body:form});
      if(kind==='logo')design.logo_url=result.url;else design.hero.banner_url=result.url;
      renderPreview();dirty();toast('Image uploaded. Press Publish changes to use it.');
    } catch(err){toast(err.message||'Image upload failed');}
  }
  async function save() {
    if(busy)return;
    readFields();
    if(!design.app_name.trim() || !design.hero.title.trim() || !design.hero.highlight.trim() || !design.hero.cta.trim()){
      toast('App name, hero headlines and location button text must not be empty');return;}
    setBusy(true);
    const categoryOnly = document.querySelector('.nav-link.active')?.dataset.section === 'categories';
    try {const updated=await api(categoryOnly?'/api/admin/categories':'/api/admin/design',
      {method:'PUT',headers:{'Content-Type':'application/json'},
       body:JSON.stringify(categoryOnly?{categories:design.categories}:design)});
      design=updated;published=JSON.stringify(design);publishedCategories=design.categories.map(c=>({...c}));populate();
      if (shopManager) shopManager.refreshCategories();
      toast('Published! Refresh NearMe in Telegram to see the changes.');
    }catch(err){toast(err.message||'Could not publish');}finally{setBusy(false)}
  }
  async function boot() {
    if(tg){try{tg.ready();tg.expand();tg.setHeaderColor('#100A24');}catch{}}
    if(!initData && !webLogin?.getToken()){
      $('#gateText').textContent='Log in using Telegram on the NearMe homepage, then return to Admin Studio.';
      return;
    }
    try {
      const me = await api('/api/admin/me');
      role = me.role;
      permissions = me.permissions || {};
      design=await api('/api/admin/design');
      published=JSON.stringify(design);
      publishedCategories=design.categories.map(c=>({...c}));
      $('#gate').hidden=true;$('#studio').hidden=false;populate();
      $('#staffRoleLabel').textContent=`Your role: ${role==='owner'?'Primary Owner':role==='admin'?'Administrator':'Content Moderator'}`;
    } catch(err){$('#gateText').textContent=(err.message||'Access denied')+'. You must be assigned an active NearMe team role.';return;}
    if(window.initNearMeShopManager) shopManager = window.initNearMeShopManager(api,toast,()=>publishedCategories,role,permissions);
    if(role==='owner' && window.initNearMeTeamManager) teamManager=window.initNearMeTeamManager(api,toast);
    if(role!=='moderator' && permissions.view_live_visitors && window.initNearMeLiveVisitors)liveVisitors=window.initNearMeLiveVisitors(api);
    // Staff browsing the studio are visitors too. Keep presence refreshed while visible.
    const heartbeat=()=>{if(!document.hidden)api('/api/visitors/heartbeat',{method:'POST'}).catch(()=>{});};
    heartbeat();activityTimer=setInterval(heartbeat,45000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)heartbeat();});
    // Hide unauthorized editor sections: the backend independently enforces
    // every permission, so editing the HTML cannot grant extra access.
    const allowed = [];
    if(permissions.appearance_manage)allowed.push('brand','appearance','hero','layout');
    if(permissions.categories_manage)allowed.push('categories');
    if(Object.entries(permissions).some(([key,val])=>key.startsWith('shop_')&&val))allowed.push('shops');
    if(role!=='moderator' && permissions.view_live_visitors)allowed.push('visitors');
    if(role==='owner')allowed.push('team');
    $$('.nav-link').forEach(button=>button.hidden=!allowed.includes(button.dataset.section));
    function selectSection(section) {
      if(!allowed.includes(section))return;
      const shopMode=section==='shops',teamMode=section==='team', visitorMode=section==='visitors';
      if(liveVisitors){if(visitorMode)liveVisitors.start();else liveVisitors.stop();}
      if(shopMode && shopManager)shopManager.refreshCategories();
      if(teamMode && teamManager)teamManager.refresh();
      $$('.nav-link').forEach(item=>item.classList.toggle('active',item.dataset.section===section));
      $$('.editor-panel').forEach(panel=>panel.hidden=panel.id!=='panel-'+section);
      $('#shopManager').hidden=!shopMode;
      $('#teamManager').hidden=!teamMode;
      $('#liveVisitorsManager').hidden=!visitorMode;
      $('.editor').hidden=shopMode||teamMode||visitorMode;
      $('.preview-column').hidden=shopMode||teamMode||visitorMode;
      const canSave = section==='categories' ? permissions.categories_manage : permissions.appearance_manage;
      $('#saveButton').hidden=shopMode||teamMode||visitorMode||!canSave;
      $('#saveState').hidden=shopMode||teamMode||visitorMode||!canSave;
      $('.header-actions').hidden=shopMode||teamMode||visitorMode||!canSave;
      const heading=$('.workspace-header h1'), subheading=$('.workspace-header p'), kicker=$('.workspace-header .kicker');
      heading.textContent = visitorMode ? 'Live visitor activity' : teamMode ? 'Manage your NearMe team' :
        shopMode ? 'Manage shop advertisements' : section==='categories' ? 'Manage shop categories' : 'Create your nightlife look ✳';
      subheading.textContent=visitorMode ? 'Authorized live activity and recent Telegram logins.' : teamMode ? 'Grant, suspend and review staff access securely.' :
        shopMode ? 'Create, review and publish shop advertisements according to your permissions.' :
        'Preview edits and publish approved changes to NearMe.';
      kicker.textContent=visitorMode?'NEARME / LIVE VISITORS':teamMode?'NEARME / TEAM & ACCESS':shopMode?'NEARME / SHOP CONTENT':'NEARME / DESIGN SETTINGS';
      $('.editor-grid').classList.toggle('editing-shops',shopMode||teamMode||visitorMode);
    }
    $$('.nav-link').forEach(button=>button.addEventListener('click',()=>selectSection(button.dataset.section)));
    $$('input:not([type=file]),textarea,select').forEach(el=>{
      if(el.closest('#categoryEditor,#shopManager,#teamManager'))return;
      el.addEventListener('input',readFields);el.addEventListener('change',readFields);
    });
    $('#logoFile').addEventListener('change',e=>upload(e.target.files[0],'logo'));
    $('#bannerFile').addEventListener('change',e=>upload(e.target.files[0],'banner'));
    $('#removeLogo').addEventListener('click',()=>{design.logo_url='';renderPreview();dirty()});
    $('#removeBanner').addEventListener('click',()=>{design.hero.banner_url='';renderPreview();dirty()});
    $('#saveButton').addEventListener('click',save);
    $('#addCategory').addEventListener('click',newCategory);
    selectSection(allowed.includes('brand')?'brand':allowed.includes('shops')?'shops':allowed.includes('visitors')?'visitors':allowed[0]);
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
