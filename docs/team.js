/* Owner-only per-account access controls. Authorization remains on the backend. */
(() => {
  'use strict';
  window.initNearMeTeamManager = function initNearMeTeamManager(api, notify) {
    const $ = sel => document.querySelector(sel);
    const make = (tag, className='', text='') => {const el=document.createElement(tag); if(className)el.className=className;el.textContent=text;return el;};
    const members=$('#teamMembers'), audit=$('#teamAudit');
    let labels={}, defaults={}, busy=false;
    const copy = obj => Object.fromEntries(Object.entries(obj||{}).map(([key,value])=>[key,!!value]));
    const checked = box => Object.fromEntries([...box.querySelectorAll('input[data-permission]')].map(input=>[input.dataset.permission,input.checked]));
    function controls(values, name) {
      const grid=make('div','team-permission-grid');
      for(const [key,label] of Object.entries(labels)) {
        const item=make('label','team-permission');
        const box=make('input');box.type='checkbox';box.dataset.permission=key;
        box.checked=Boolean(values?.[key]);
        item.append(box,make('span','',label));grid.append(item);
      }
      grid.setAttribute('aria-label',name+' permissions');
      if(name.includes('Moderator')) {const live=grid.querySelector('[data-permission="view_live_visitors"]');if(live){live.checked=false;live.disabled=true;live.parentElement.title='Live visitor access is reserved for Owner and Admin roles';}}
      return grid;
    }
    const changeNotice = value => notify(value);
    async function load() {
      try {
        const response=await api('/api/admin/team');labels=response.permissions;defaults=response.defaults;
        members.replaceChildren();
        const owner=make('div','team-item');owner.append(make('strong','','Primary Owner · Telegram ID '+response.owner.user_id));
        owner.append(make('small','','All permissions · cannot be edited or removed'));members.append(owner);
        if(!response.members.length)members.append(make('p','team-explain','No additional staff yet.'));
        for(const user of response.members) {
          const row=make('div','team-item');const top=make('div','team-item-head');
          top.append(make('strong','',user.note||`Telegram ID ${user.user_id}`),
            make('span',user.active?'team-active':'team-suspended',user.active?'Active':'Suspended'));
          row.append(top,make('small','',`Telegram ID ${user.user_id} · ${user.role==='admin'?'Admin':'Content Moderator'}`));
          const role=make('select');role.setAttribute('aria-label','Role for '+user.user_id);
          for(const [value,label] of [['admin','Administrator'],['moderator','Content Moderator']]){
            const opt=make('option','',label);opt.value=value;role.append(opt);
          }
          role.value=user.role;
          const grid=controls(user.permissions||defaults[user.role],`Telegram ID ${user.user_id} ${user.role==='moderator'?'Moderator':''}`);
          role.addEventListener('change',()=>{
            const next=defaults[role.value]||{};
            for(const input of grid.querySelectorAll('input[data-permission]')){
              input.disabled=role.value==='moderator' && input.dataset.permission==='view_live_visitors';
              input.checked=input.disabled?false:!!next[input.dataset.permission];
            }
          });
          const save=make('button','plain-button','Save role & permissions');save.type='button';
          save.addEventListener('click', async()=>{
            if(busy)return;busy=true;save.disabled=true;
            try{await api(`/api/admin/team/${user.user_id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({role:role.value,active:Boolean(user.active),note:user.note||'',permissions:checked(grid)})});
              changeNotice('Permissions saved. Changes apply on the next staff request.');await load();}
            catch(error){changeNotice(error.message||'Could not save permissions');}
            finally{busy=false;save.disabled=false;}
          });
          const toggle=make('button','plain-button',user.active?'Suspend':'Activate');toggle.type='button';
          toggle.addEventListener('click',async()=>{
            if(busy)return;busy=true;
            try{await api(`/api/admin/team/${user.user_id}`,{method:'PUT',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({role:user.role,active:!user.active,note:user.note||'',permissions:user.permissions})});
              changeNotice(user.active?'Account suspended':'Account activated');await load();}
            catch(error){changeNotice(error.message||'Unable to update account');}finally{busy=false;}
          });
          const del=make('button','plain-button','Remove');del.type='button';
          del.addEventListener('click',async()=>{
            if(busy||!confirm(`Remove Telegram user ${user.user_id} from the NearMe team?`))return;busy=true;
            try{await api(`/api/admin/team/${user.user_id}`,{method:'DELETE'});changeNotice('Account removed');await load();}
            catch(error){changeNotice(error.message||'Unable to remove account');}finally{busy=false;}
          });
          const actions=make('div','team-actions');actions.append(role,save,toggle,del);
          row.append(grid,actions);members.append(row);
        }
        // Add form: initialize permissions only on first load or when Role changes.
        const addContainer=$('#teamNewPermissions');
        if(addContainer && !addContainer.childElementCount)addContainer.replaceChildren(controls(defaults[$('#teamRole').value],$('#teamRole').value==='moderator'?'New Moderator':'New Admin'));
      } catch(error){members.replaceChildren(make('p','team-explain',error.message||'Unable to load team'));return;}
      try{
        const result=await api('/api/admin/audit');audit.replaceChildren();
        if(!result.events.length)audit.append(make('p','team-explain','No recorded changes yet.'));
        for(const event of result.events){const row=make('div','audit-row');
          row.append(make('strong','',event.action.replaceAll('_',' ')),
            make('small','',`${event.actor_role} ${event.actor_id} · ${event.target_type} ${event.target_id}`),
            make('small','',new Date(event.happened_at*1000).toLocaleString(window.NearMeI18n?.language || 'en-US',{timeZone:'Asia/Kuala_Lumpur'})));
          audit.append(row);
        }
      }catch(error){audit.replaceChildren(make('p','team-explain',error.message||'Unable to load audit'));}
    }
    $('#teamRole').addEventListener('change',()=>{
      $('#teamNewPermissions').replaceChildren(controls(defaults[$('#teamRole').value],$('#teamRole').value==='moderator'?'New Moderator':'New Admin'));
    });
    $('#teamAddForm').addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      const raw=$('#teamUserId').value.trim();
      if(!/^[1-9]\d{0,18}$/.test(raw)||BigInt(raw)>=9223372036854775808n){notify('Enter a valid numeric Telegram user ID');return;}
      busy=true;$('#teamAddButton').disabled=true;
      try{
        await api('/api/admin/team',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({user_id:raw,role:$('#teamRole').value,note:$('#teamNote').value.trim(),
            permissions:checked($('#teamNewPermissions'))})});
        $('#teamAddForm').reset();$('#teamNewPermissions').replaceChildren();notify('Staff account added');await load();
      }catch(error){notify(error.message||'Could not add staff');}
      finally{busy=false;$('#teamAddButton').disabled=false;}
    });
    return {refresh:load};
  };
})();
