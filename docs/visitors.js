/* NearMe staff presence dashboard. Shown only after server grants view_live_visitors. */
(() => {
  'use strict';
  window.initNearMeLiveVisitors = function initNearMeLiveVisitors(api) {
    const root=document.querySelector('#liveVisitorsManager');
    const $=selector=>root.querySelector(selector);
    const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=text;return el;};
    const myTime=t=>new Date(Number(t)*1000).toLocaleString(window.NearMeI18n?.language || 'en-US',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'});
    let running=false,refreshTimer=null;
    async function refresh() {
      if(!running || document.hidden)return;
      try{
        const result=await api('/api/admin/visitors/live');
        $('#visitorActiveNow').textContent=result.active_now;
        $('#visitorTotal').textContent=result.total_members;
        $('#visitorLoginToday').textContent=result.login_users_today;
        $('#visitorUpdated').textContent='Updated '+myTime(result.server_time)+' (MYT) · Online means activity in the past 2 minutes';
        const users=$('#visitorOnlineList');users.replaceChildren();
        if(!result.active_members.length)users.append(make('p','visitor-empty','No active NearMe sessions detected right now.'));
        for(const user of result.active_members){
          const item=make('div','visitor-person');
          const name=[user.first_name,user.last_name].filter(Boolean).join(' ')||'Telegram member';
          const left=make('div','',name);left.append(make('small','',`ID ${user.user_id}${user.username?' · @'+user.username:''}`));
          item.append(left,make('span','visitor-live-chip',`Active · ${myTime(user.last_active)}`));users.append(item);
        }
        const history=$('#visitorLoginList');history.replaceChildren();
        if(!result.recent_logins.length)history.append(make('p','visitor-empty','No recent login activity yet.'));
        for(const event of result.recent_logins){
          const name=[event.first_name,event.last_name].filter(Boolean).join(' ')||'Telegram member';
          const item=make('div','visitor-person');
          const left=make('div','',name);left.append(make('small','',`ID ${event.user_id}${event.username?' · @'+event.username:''} · ${event.source==='web'?'Website':'Mini App'}`));
          item.append(left,make('span','visitor-date',`${event.event} · ${myTime(event.happened_at)}`));history.append(item);
        }
        $('#visitorLiveError').hidden=true;
      }catch(error){$('#visitorLiveError').hidden=false;$('#visitorLiveError').textContent=error.message||'Live visitor data unavailable';}
    }
    function start(){running=true;refresh();if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(refresh,20000);}
    function stop(){running=false;if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;}
    document.addEventListener('visibilitychange',()=>{if(!document.hidden && running)refresh();});
    return {start,stop,refresh};
  };
})();
