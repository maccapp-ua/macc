/* MACC secure access layer — Supabase Auth, roles and audit trail */
(function(){
  window.MACC_SECURE_BOOT=true;
  const URL='https://wfdkprsszmvhqsycjwuh.supabase.co';
  const KEY='sb_publishable_e95XvrX-cpaj7-dITbc67g__KYosuXT';
  const recoveryFromLink=/(?:[?#&])type=recovery(?:&|$)/.test(window.location.href);
  // Авторизація діє лише в межах поточної сесії браузера.
  // Після оновлення сторінки вона зберігається, а після закриття браузера — ні.
  const db=window.supabase.createClient(URL,KEY,{auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let session=null, profile=null, company=null, originalRender=null, originalNavigate=null, fullState=null, teamMembers=[], signedOutByUser=false;
  let booted=false, latestData='';

  const css=`
    #macc-auth{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(circle at top,#2c4260,#162030 65%)}
    .macc-auth-card{width:420px;max-width:100%;background:#263a52;border:1px solid #3f5f84;border-radius:16px;padding:30px;box-shadow:0 25px 80px #0008;color:#fff}
    .macc-auth-logo{display:flex;align-items:center;gap:12px;margin-bottom:24px}.macc-auth-logo b{color:#f0b429;font-size:20px;letter-spacing:.08em}.macc-auth-logo span{font-size:11px;color:#a0b4c8}
    .macc-auth-card h1{font-size:20px;margin:0 0 8px}.macc-auth-card p{font-size:13px;color:#c7d4e3;line-height:1.5;margin:0 0 20px}.macc-auth-card label{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#a0b4c8;margin:13px 0 5px;text-transform:uppercase}
    .macc-auth-card input,.macc-auth-card select{width:100%;padding:10px 12px;border-radius:7px;border:1px solid #3f5f84;background:#162030;color:#fff;font-size:14px}.macc-auth-card button{width:100%;margin-top:18px;padding:11px;border:0;border-radius:7px;background:#f0b429;color:#162030;font-weight:800;cursor:pointer}.macc-auth-card button:disabled{opacity:.6;cursor:wait}.macc-auth-message{min-height:20px;margin-top:13px;font-size:12px;color:#fbbf24}.macc-auth-help{font-size:11px!important;color:#a0b4c8!important;margin-top:18px!important}
    .macc-workspace-panel{margin:10px 10px 7px;overflow:hidden;border:1px solid var(--border2);border-radius:13px;background:linear-gradient(135deg,rgba(39,59,82,.98),rgba(25,39,57,.98));box-shadow:0 8px 24px #0003}.macc-workspace-panel .logo{padding:12px 14px 10px;border-bottom:1px solid var(--border)}.macc-workspace-panel .logo img{width:34px;height:34px}.macc-workspace-panel .logo-text b{font-size:15px}.macc-workspace-panel .logo-text span{font-size:8px}
    #macc-user-box{position:static;width:auto;min-width:0;padding:11px 14px 13px;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none}.macc-user-email{font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.macc-user-role{font-size:9px;color:var(--accent);font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-top:4px}.macc-user-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.macc-user-actions button{appearance:none;background:transparent;border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:10px;font-weight:700;padding:6px 8px;cursor:pointer;line-height:1}.macc-user-actions button:hover{color:var(--text);border-color:var(--accent);background:var(--bg3)}.macc-user-actions button:last-child{color:#fca5a5;border-color:#7f3f4a}
    #nav-access{display:none}.macc-access-note{font-size:12px;color:var(--text3);line-height:1.5}.macc-access-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}.macc-access-grid .card{margin-bottom:0}.macc-company-brand{margin:0;padding:10px 14px;border:0;border-radius:0;border-bottom:1px solid var(--border);background:transparent;display:none;align-items:center;gap:9px;min-width:0}.macc-company-brand img,.macc-company-mark{width:34px;height:34px;flex:0 0 34px;object-fit:contain;border-radius:8px;background:#fff;border:1px solid rgba(240,180,41,.28)}.macc-company-mark{display:grid;place-items:center;background:rgba(240,180,41,.15);color:var(--accent);font-size:13px;font-weight:900;border-color:rgba(240,180,41,.38)}.macc-company-brand div{min-width:0}.macc-company-brand b{display:block;font-size:11px;line-height:1.25;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.macc-company-brand span{display:block;font-size:9px;color:var(--text3);margin-top:2px;letter-spacing:.04em;text-transform:uppercase}.macc-logo-file{margin-top:6px;font-size:11px;color:var(--text2)}@media(max-width:700px){.macc-access-grid{grid-template-columns:1fr}}
  `;
  function ensureStyles(){
    if(!document.getElementById('macc-secure-styles'))document.head.insertAdjacentHTML('beforeend',`<style id="macc-secure-styles">${css}</style>`);
  }
  function esc(v){return String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function roleLabel(role){return({admin:'Адміністратор',financial_analyst:'Фінансовий аналітик',accountant:'Бухгалтер',project_manager:'Керівник проєкту'})[role]||role;}
  function roleOptions(selected){return[['financial_analyst','Фінансовий аналітик'],['accountant','Бухгалтер'],['project_manager','Керівник проєкту'],['admin','Адміністратор']].map(([value,label])=>`<option value="${value}"${value===selected?' selected':''}>${label}</option>`).join('');}
  function isAdmin(){return profile?.role==='admin';}
  function companyStateKey(){return profile?.company_id?'macc_state_'+profile.company_id:'macc_state';}
  function applyCompanyBrand(){
    const brand=document.getElementById('macc-company-brand');
    if(!brand)return;
    if(!company?.name){brand.style.display='none';return;}
    brand.style.display='flex';
    const initial=esc(company.name.trim().slice(0,1).toUpperCase()||'М');
    brand.innerHTML=`${company.logo_url?`<img src="${esc(company.logo_url)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`:''}<span class="macc-company-mark" style="display:${company.logo_url?'none':'grid'}">${initial}</span><div><b title="${esc(company.name)}">${esc(company.name)}</b><span>Робочий простір</span></div>`;
  }
  function logoDataFromInput(fileId,urlId){
    const file=document.getElementById(fileId)?.files?.[0];
    const link=document.getElementById(urlId)?.value.trim()||'';
    if(!file)return Promise.resolve(link);
    if(!file.type.startsWith('image/'))return Promise.reject(new Error('Оберіть файл зображення.'));
    if(file.size>5*1024*1024)return Promise.reject(new Error('Логотип має бути меншим за 5 МБ.'));
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Не вдалося прочитати логотип.'));
      reader.onload=()=>{
        const image=new Image();
        image.onerror=()=>reject(new Error('Не вдалося відкрити файл логотипу.'));
        image.onload=()=>{
          const maxSide=512,scale=Math.min(1,maxSide/image.width,maxSide/image.height);
          const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/webp',0.86));
        };
        image.src=String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }
  async function getCompany(){
    if(!profile?.company_id)return null;
    const {data,error}=await db.from('macc_companies').select('id,name,logo_url').eq('id',profile.company_id).maybeSingle();
    if(error)throw error; company=data; applyCompanyBrand(); return company;
  }
  function assignedSiteIds(data=fullState){return new Set((data?.sites||[]).filter(s=>String(s.projectManagerEmail||'').toLowerCase()===String(profile?.email||'').toLowerCase()).map(s=>s.id));}
  function clone(data){return JSON.parse(JSON.stringify(data||{}));}
  function recordIds(rows){return new Set((rows||[]).filter(x=>x&&typeof x==='object'&&x.id).map(x=>x.id));}
  function hasDeletedRecords(before,after){
    if(Array.isArray(before)){
      if(!Array.isArray(after))return before.length>0;
      if(before.some(x=>x===null||typeof x!=='object'))return before.some(x=>!after.includes(x));
      const afterIds=recordIds(after);
      for(const row of before||[]){
        if(row&&typeof row==='object'&&row.id&&!afterIds.has(row.id))return true;
        if(row&&typeof row==='object'&&row.id){const match=(after||[]).find(x=>x&&x.id===row.id);if(match&&hasDeletedRecords(row,match))return true;}
      }
    }else if(before&&typeof before==='object'){
      for(const [key,value] of Object.entries(before))if(Array.isArray(value)&&hasDeletedRecords(value,after?.[key]))return true;
    }
    return false;
  }
  function scopedState(data){
    if(profile?.role!=='project_manager')return data;
    const ids=assignedSiteIds(data),copy=clone(data);
    copy.sites=(copy.sites||[]).filter(s=>ids.has(s.id));
    copy.cashflows=(copy.cashflows||[]).filter(x=>ids.has(x.siteId));
    copy.budgets=Object.fromEntries(Object.entries(copy.budgets||{}).filter(([id])=>ids.has(id)));
    copy.meetings=(copy.meetings||[]).filter(x=>ids.has(x.siteId));
    copy.tasks=(copy.tasks||[]).filter(x=>ids.has(x.siteId));
    copy.tenders=(copy.tenders||[]).filter(x=>ids.has(x.siteId));
    // The company directory is common for the entire team. A project manager
    // may use any existing contractor or executor in their own projects.
    copy.contractors=clone(data?.contractors||[]);
    copy.executors=clone(data?.executors||[]);
    copy.cfCategories=[...new Set(copy.cashflows.map(x=>x.category).filter(Boolean))];
    copy.cfCounterparties=[...new Set(copy.cashflows.map(x=>x.counterparty).filter(Boolean))];
    return copy;
  }
  function projectManagerMaySave(before,after){
    const ids=assignedSiteIds(before),visibleBefore=scopedState(before),afterSites=new Map((after?.sites||[]).map(s=>[s.id,s]));
    if([...afterSites.keys()].some(id=>!ids.has(id)))return false;
    for(const site of (visibleBefore?.sites||[])){
      const changed=afterSites.get(site.id);
      if(!changed||changed.projectManagerEmail!==site.projectManagerEmail)return false;
      // A project manager may remove only an assignment from their own site.
      // Removing acts or any other nested project data remains forbidden.
      const oldSubs=new Map((site.subContracts||[]).map(x=>[x.id,x]));
      const newSubs=new Map((changed.subContracts||[]).map(x=>[x.id,x]));
      for(const [id,oldSub] of oldSubs){const newSub=newSubs.get(id);if(newSub&&hasDeletedRecords(oldSub,newSub))return false;}
      const plainOld=clone(site),plainNew=clone(changed);
      plainOld.subContracts=[];plainOld.itrAssignments=[];plainNew.subContracts=[];plainNew.itrAssignments=[];
      if(hasDeletedRecords(plainOld,plainNew))return false;
    }
    for(const key of ['cashflows','meetings','tasks']){
      const oldRows=visibleBefore?.[key]||[],newRows=after?.[key]||[];
      if(newRows.some(x=>!ids.has(x.siteId))||hasDeletedRecords(oldRows,newRows))return false;
    }
    for(const id of ids)if(hasDeletedRecords(visibleBefore?.budgets?.[id]?.rows||[],after?.budgets?.[id]?.rows||[]))return false;
    const knownExecutors=recordIds(before?.executors),visibleExecutors=new Map((visibleBefore?.executors||[]).map(x=>[x.id,x]));
    for(const executor of after?.executors||[]){
      const old=visibleExecutors.get(executor.id);
      if(old&&JSON.stringify(old)!==JSON.stringify(executor))return false;
      if(!old&&knownExecutors.has(executor.id))return false;
    }
    if([...visibleExecutors.keys()].some(id=>!(after?.executors||[]).some(x=>x.id===id)))return false;
    const knownContractors=recordIds(before?.contractors),visibleContractors=new Map((visibleBefore?.contractors||[]).map(x=>[x.id,x]));
    for(const contractor of after?.contractors||[]){
      const old=visibleContractors.get(contractor.id);
      if(old&&JSON.stringify(old)!==JSON.stringify(contractor))return false;
      if(!old&&knownContractors.has(contractor.id))return false;
    }
    if([...visibleContractors.keys()].some(id=>!(after?.contractors||[]).some(x=>x.id===id)))return false;
    for(const key of ['cfCategories','cfCounterparties','tenders'])if(JSON.stringify(visibleBefore?.[key]??null)!==JSON.stringify(after?.[key]??null))return false;
    return true;
  }
  function mergeProjectManagerChanges(before,after){
    const ids=assignedSiteIds(before),merged=clone(before),afterSites=new Map((after?.sites||[]).map(s=>[s.id,s]));
    merged.sites=(before?.sites||[]).map(s=>ids.has(s.id)?afterSites.get(s.id):s);
    for(const key of ['cashflows','meetings','tasks'])merged[key]=[...(before?.[key]||[]).filter(x=>!ids.has(x.siteId)),...(after?.[key]||[]).filter(x=>ids.has(x.siteId))];
    merged.budgets=clone(before?.budgets||{});for(const id of ids)merged.budgets[id]=clone(after?.budgets?.[id]||{rows:[]});
    const existingExecutors=recordIds(before?.executors),existingContractors=recordIds(before?.contractors);
    merged.executors=[...(before?.executors||[]),...(after?.executors||[]).filter(x=>!existingExecutors.has(x.id))];
    merged.contractors=[...(before?.contractors||[]),...(after?.contractors||[]).filter(x=>!existingContractors.has(x.id))];
    return merged;
  }
  function listOnlyAdds(before,after){
    const oldRows=new Map((before||[]).map(x=>[x.id,x]));
    return (after||[]).every(x=>!oldRows.has(x.id)||JSON.stringify(oldRows.get(x.id))===JSON.stringify(x))&&[...oldRows.keys()].every(id=>(after||[]).some(x=>x.id===id));
  }
  function siteAssignmentsOnlyAdd(before,after){
    const oldSites=new Map((before||[]).map(x=>[x.id,x])),newSites=new Map((after||[]).map(x=>[x.id,x]));
    if(oldSites.size!==newSites.size||[...oldSites.keys()].some(id=>!newSites.has(id)))return false;
    for(const [id,oldSite] of oldSites){
      const newSite=newSites.get(id),oldBase=clone(oldSite),newBase=clone(newSite);
      oldBase.subContracts=[];oldBase.itrAssignments=[];newBase.subContracts=[];newBase.itrAssignments=[];
      if(JSON.stringify(oldBase)!==JSON.stringify(newBase)||!listOnlyAdds(oldSite.subContracts,newSite.subContracts)||!listOnlyAdds(oldSite.itrAssignments,newSite.itrAssignments))return false;
    }
    return true;
  }
  function accountantMaySave(before,after){
    if(!siteAssignmentsOnlyAdd(before?.sites,after?.sites)||!listOnlyAdds(before?.contractors,after?.contractors)||!listOnlyAdds(before?.executors,after?.executors))return false;
    return ['budgets','meetings','tasks','tenders'].every(key=>JSON.stringify(before?.[key]??null)===JSON.stringify(after?.[key]??null));
  }
  window.maccCanManageProjects=()=>isAdmin();
  window.maccCanAddDirectory=()=>!!profile&&profile.role!=='financial_analyst';
  window.maccCanEditDirectory=()=>isAdmin();
  window.maccDirectoryOwner=()=>profile?.email||'';
  window.maccCanEditSite=(siteId)=>isAdmin()||(profile?.role==='project_manager'&&assignedSiteIds().has(siteId));
  window.maccProjectManagers=()=>teamMembers.filter(m=>m.role==='project_manager'&&m.active&&!m.revoked_at);
  window.maccProjectFilterEmail='';window.maccProjectFilterLabel='';
  window.maccShowUserProjects=(email,label)=>{window.maccProjectFilterEmail=email;window.maccProjectFilterLabel=label||email;window.navigate('sites');};
  window.maccClearProjectFilter=()=>{window.maccProjectFilterEmail='';window.maccProjectFilterLabel='';window.render();};
  function authOverlay(){
    ensureStyles();
    if(document.getElementById('macc-auth'))return;
    document.body.insertAdjacentHTML('beforeend',`<div id="macc-auth"><form class="macc-auth-card" id="macc-auth-form"><div class="macc-auth-logo"><img src="logo.png" width="42" height="42" style="border-radius:50%"><div><b>MACC</b><br><span>Management Accounting</span></div></div><h1>Вхід до робочого простору</h1><p>Доступ надає адміністратор команди. Увійдіть за вашою корпоративною поштою та паролем.</p><label for="macc-login-email">Електронна пошта</label><input id="macc-login-email" type="email" required autocomplete="email"><label for="macc-login-password">Пароль</label><input id="macc-login-password" type="password" required autocomplete="current-password"><button id="macc-login-submit" type="submit">Увійти</button><button id="macc-password-reset" type="button" style="margin-top:9px;background:transparent;color:#c7d4e3;border:1px solid #3f5f84">Забули пароль?</button><div id="macc-login-message" class="macc-auth-message"></div><p class="macc-auth-help">Відновлення пароля надійде на вказану пошту. Доступ мають лише запрошені адміністратором користувачі.</p></form></div>`);
    document.getElementById('macc-auth-form').addEventListener('submit',signIn);
    document.getElementById('macc-password-reset').addEventListener('click',sendPasswordReset);
  }
  function showLogin(message=''){
    authOverlay(); document.getElementById('macc-auth').style.display='flex';
    document.getElementById('macc-login-message').textContent=message;
  }
  async function signIn(e){
    e.preventDefault();
    const email=document.getElementById('macc-login-email').value.trim();
    const password=document.getElementById('macc-login-password').value;
    const button=document.getElementById('macc-login-submit'), message=document.getElementById('macc-login-message');
    button.disabled=true; message.textContent='Перевіряємо дані…';
    const {error}=await db.auth.signInWithPassword({email,password});
    if(error){message.textContent='Не вдалося увійти: '+error.message;button.disabled=false;}
  }
  async function sendPasswordReset(){
    const email=document.getElementById('macc-login-email').value.trim();
    const message=document.getElementById('macc-login-message'), button=document.getElementById('macc-password-reset');
    if(!email){message.textContent='Спочатку введіть вашу електронну пошту.';return;}
    button.disabled=true;message.textContent='Надсилаємо лист для відновлення…';
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    if(error){message.textContent='Не вдалося надіслати лист: '+error.message;button.disabled=false;return;}
    message.textContent='Лист для встановлення нового пароля надіслано. Перевірте також папку «Спам».';
  }
  function showPasswordSetup(){
    authOverlay();
    const overlay=document.getElementById('macc-auth');
    const firstAdminSetup=profile?.role==='admin'&&!profile.active;
    const companySetup=firstAdminSetup?`<div style="margin:18px 0 4px;padding:14px;border:1px solid #3f5f84;border-radius:10px;background:#1c2b3e"><b style="font-size:13px;color:#fff">Налаштуйте робочий простір</b><p style="font-size:11px;margin:6px 0 10px">Назва компанії буде показана у верхньому лівому куті. Логотип — необов’язковий.</p><label for="macc-first-company-name">Назва компанії *</label><input id="macc-first-company-name" type="text" required value="${esc(company?.name||'')}"><label for="macc-first-company-logo-url">Посилання на логотип</label><input id="macc-first-company-logo-url" type="url" placeholder="https://…"><label for="macc-first-company-logo-file">або файл логотипу</label><input class="macc-logo-file" id="macc-first-company-logo-file" type="file" accept="image/*"></div>`:'';
    overlay.innerHTML=`<form class="macc-auth-card" id="macc-password-form"><div class="macc-auth-logo"><img src="logo.png" width="42" height="42" style="border-radius:50%"><div><b>MACC</b><br><span>Management Accounting</span></div></div><h1>Створіть пароль</h1><p>Задайте пароль для наступних входів до закритого робочого простору MACC.</p>${companySetup}<label for="macc-new-password">Новий пароль</label><input id="macc-new-password" type="password" required minlength="8" autocomplete="new-password"><label for="macc-new-password-repeat">Повторіть пароль</label><input id="macc-new-password-repeat" type="password" required minlength="8" autocomplete="new-password"><button id="macc-password-submit" type="submit">${firstAdminSetup?'Зберегти та відкрити робочий простір':'Зберегти пароль і відкрити сайт'}</button><div id="macc-password-message" class="macc-auth-message"></div></form>`;
    document.getElementById('macc-password-form').addEventListener('submit',async e=>{
      e.preventDefault();
      const password=document.getElementById('macc-new-password').value;
      const repeat=document.getElementById('macc-new-password-repeat').value;
      const message=document.getElementById('macc-password-message'), button=document.getElementById('macc-password-submit');
      if(password!==repeat){message.textContent='Паролі не збігаються.';return;}
      const companyName=firstAdminSetup?document.getElementById('macc-first-company-name').value.trim():'';
      if(firstAdminSetup&&!companyName){message.textContent='Вкажіть назву компанії.';return;}
      button.disabled=true; message.textContent='Зберігаємо пароль…';
      const {error}=await db.auth.updateUser({password});
      if(error){message.textContent='Не вдалося зберегти пароль: '+error.message;button.disabled=false;return;}
      if(!profile.active){
        const {error:activationError}=await db.functions.invoke('manage-users',{body:{action:'activate_self'}});
        if(activationError){message.textContent='Пароль збережено, але доступ не підтверджено: '+activationError.message;button.disabled=false;return;}
        profile.active=true;profile.revoked_at=null;
      }
      if(firstAdminSetup){
        let logoUrl='';
        try{logoUrl=await logoDataFromInput('macc-first-company-logo-file','macc-first-company-logo-url');}catch(e){message.textContent=e.message;button.disabled=false;return;}
        const {data,error:companyError}=await db.from('macc_companies').update({name:companyName,logo_url:logoUrl||null}).eq('id',profile.company_id).select('id,name,logo_url').single();
        if(companyError){message.textContent='Пароль збережено, але компанію не вдалося налаштувати: '+companyError.message;button.disabled=false;return;}
        company=data;applyCompanyBrand();
      }
      history.replaceState(null,'',location.pathname);
      overlay.remove(); addUserBox(); enableNavigation();
      await db.from('macc_access_log').insert({company_id:profile.company_id,user_id:session.user.id,event:'login'});
      await secureLoad();
    });
  }
  async function getProfile(){
    const {data,error}=await db.from('macc_profiles').select('id,email,role,active,revoked_at,company_id').eq('id',session.user.id).maybeSingle();
    if(error)throw error; return data;
  }
  async function refreshTeamMembers(){const {data}=await db.from('macc_profiles').select('id,email,role,active,revoked_at,full_name,position,phone').eq('company_id',profile.company_id).order('invited_at',{ascending:false});if(data)teamMembers=data;return teamMembers;}
  function addUserBox(){
    let box=document.getElementById('macc-user-box');
    if(!box){box=document.createElement('div');box.id='macc-user-box';}
    const workspacePanel=document.getElementById('macc-workspace-panel');
    if(workspacePanel&&box.parentElement!==workspacePanel)workspacePanel.appendChild(box);
    else if(!box.parentElement)document.body.appendChild(box);
    box.innerHTML=`<div class="macc-user-email">${esc(profile.email)}</div><div class="macc-user-role">${roleLabel(profile.role)}</div><div class="macc-user-actions">${profile.role==='admin'?'<button onclick="navigate(\'access\')">Команда</button><button onclick="maccOpenCompanySettings()">Компанія</button>':''}<button onclick="maccShowPasswordChange()">Змінити пароль</button><button onclick="maccSignOut()">Вийти</button></div>`;
  }
  function enableNavigation(){
    if(!document.getElementById('nav-access')){
      const b=document.createElement('button');b.id='nav-access';b.className='nav-item';b.innerHTML='<span class="nav-icon">🔐</span>Доступ команди';b.onclick=()=>navigate('access');
      document.getElementById('nav-service').before(b);
    }
    document.getElementById('nav-access').style.display=profile.role==='admin'?'flex':'none';
  }
  function applyReadOnly(){
    const role=profile?.role;const accountantLimited=role==='accountant'&&curPage!=='cashflow';const readOnly=role==='financial_analyst'||accountantLimited;
    document.querySelectorAll('#main-content button,#main-content input,#main-content select,#main-content textarea').forEach(el=>el.disabled=readOnly);
    if(accountantLimited)document.querySelectorAll('#main-content [data-macc-accountant-allowed]').forEach(el=>el.disabled=false);
    if(role==='financial_analyst')document.querySelectorAll('#main-content button[onclick*="export"]').forEach(el=>el.disabled=false);
    if(role==='project_manager'){
      document.querySelectorAll('.nav-item').forEach(el=>{if(el.id!=='nav-access')el.style.display='';});
      document.querySelectorAll('#main-content button[onclick*="delete"],#main-content button[onclick*="Delete"]').forEach(el=>{if(el.dataset.maccPmDelete!=='assignment'){el.disabled=true;el.style.display='none';}});
    }
    if(readOnly)document.querySelectorAll('#main-content .page-header').forEach(el=>{if(!el.querySelector('.macc-viewer-note'))el.insertAdjacentHTML('beforeend',`<span class="macc-viewer-note" style="font-size:11px;color:var(--accent)">${role==='financial_analyst'?'Перегляд і вивантаження':'Бухгалтер може також додавати виконавців і підрядників до об’єктів'}</span>`)});
  }
  function topLevelChanges(before,after){
    const changed=[];['sites','contractors','executors','cashflows','budgets','meetings','tasks','tenders'].forEach(k=>{if(JSON.stringify(before?.[k]??null)!==JSON.stringify(after?.[k]??null))changed.push(k)});return changed;
  }
  function auditChanges(before,after){
    const changes=[];
    const oldSites=new Map((before?.sites||[]).map(x=>[x.id,x]));
    const newSites=new Map((after?.sites||[]).map(x=>[x.id,x]));
    newSites.forEach((site,id)=>{if(!oldSites.has(id))changes.push('Додано об’єкт «'+(site.name||'без назви')+'»');else if(JSON.stringify(oldSites.get(id))!==JSON.stringify(site))changes.push('Змінено об’єкт «'+(site.name||'без назви')+'»');});
    oldSites.forEach((site,id)=>{if(!newSites.has(id))changes.push('Видалено об’єкт «'+(site.name||'без назви')+'»');});
    return changes;
  }
  async function secureSave(){
    if(!profile){alert('Потрібен вхід до сайту.');return;}
    const previous=fullState||{};let next=state;
    if(profile.role==='financial_analyst'){alert('Фінансовий аналітик має доступ лише для перегляду та вивантаження.');window.applyState(scopedState(previous));window.render();return;}
    if(profile.role==='accountant'&&!accountantMaySave(previous,next)){alert('Бухгалтер може змінювати лише дані у «Грошових потоках».');window.applyState(scopedState(previous));window.render();return;}
    if(profile.role==='project_manager'){if(!projectManagerMaySave(previous,next)){alert('Керівник проєкту може додавати та редагувати дані лише у своїх об’єктах. Видалення даних і зміни чужих об’єктів недоступні.');window.applyState(scopedState(previous));window.render();return;}next=mergeProjectManagerChanges(previous,next);}
    if(!isAdmin()&&profile.role!=='accountant'&&profile.role!=='project_manager'){alert('У вас немає права вносити зміни.');return;}
    const payload=JSON.stringify(next);
    localStorage.setItem(companyStateKey(),payload);
    if(payload===latestData)return;
    latestData=payload;
    fullState=next;
    const {error}=await db.from('macc_company_state').upsert({company_id:profile.company_id,data:next,updated_at:new Date().toISOString(),updated_by:session.user.id},{onConflict:'company_id'});
    if(error){console.error(error); alert('Зміни не вдалося синхронізувати: '+error.message);return;}
    const changes=auditChanges(previous,next);await db.from('macc_audit_log').insert({company_id:profile.company_id,user_id:session.user.id,action:changes.length?changes.join('; '):'Зміна даних сайту',details:{sections:topLevelChanges(previous,next)}});
  }
  async function secureLoad(){
    const savedTheme=localStorage.getItem('macc_theme')||'dark';document.body.classList.toggle('light-theme',savedTheme==='light');
    const {data,error}=await db.from('macc_company_state').select('data,updated_at').eq('company_id',profile.company_id).maybeSingle();
    if(error)throw error;
    if(data?.data){fullState=data.data;window.applyState(scopedState(data.data));latestData=JSON.stringify(data.data);localStorage.setItem(companyStateKey(),JSON.stringify(state));}
    else {fullState={sites:[],contractors:[],executors:[],cashflows:[],cfCategories:[],cfCounterparties:[],budgets:{},meetings:[],tasks:[],tenders:[]};window.applyState(fullState);latestData=JSON.stringify(fullState);}
    window.render();applyReadOnly();
  }
  function renderAccess(){
    const el=document.getElementById('main-content');
    el.innerHTML=`<div class="page-header"><div><h1 class="page-title">🔐 Доступ команди</h1><div class="macc-access-note">Лише адміністратор запрошує людей, призначає їм статус та керує доступом.</div></div></div><div class="macc-access-grid"><div class="card"><div class="card-head"><span class="card-title">Запросити користувача</span></div><div class="card-body"><div class="form-group"><label class="form-label">Ім’я та прізвище</label><input id="invite-name" class="form-input" placeholder="Іван Петренко"></div><div class="form-group"><label class="form-label">Посада</label><input id="invite-position" class="form-input" placeholder="Напр. бухгалтер"></div><div class="form-group"><label class="form-label">Телефон</label><input id="invite-phone" class="form-input" type="tel" placeholder="+380…"></div><div class="form-group"><label class="form-label">Електронна пошта</label><input id="invite-email" class="form-input" type="email" placeholder="name@company.com"></div><div class="form-group"><label class="form-label">Статус *</label><select id="invite-role" class="form-input" required><option value="" selected disabled>— Оберіть статус —</option><option value="financial_analyst">Фінансовий аналітик — перегляд і вивантаження</option><option value="accountant">Бухгалтер — редагує лише грошові потоки</option><option value="project_manager">Керівник проєкту — працює зі своїми об’єктами</option><option value="admin">Адміністратор — повний доступ</option></select></div><button class="btn primary" onclick="maccInviteUser()">Надіслати запрошення</button><div id="invite-result" class="macc-access-note" style="margin-top:12px"></div></div></div><div class="card"><div class="card-head"><span class="card-title">Користувачі</span></div><div class="card-body" id="macc-members">Завантаження…</div></div></div><div style="margin-top:14px"><button class="btn secondary" onclick="maccToggleHistory()">📋 Історія змін</button></div><div class="card" id="macc-history-card" style="display:none;margin-top:14px"><div class="card-head"><span class="card-title">Історія змін</span></div><div class="card-body" id="macc-history">Завантаження…</div></div>`;
    const inviteCard=el.querySelector('.macc-access-grid .card');
    inviteCard.style.display='none';
    inviteCard.querySelector('button').textContent='Відправити запрошення';
    const inviteOpen=document.createElement('button');inviteOpen.className='btn primary';inviteOpen.textContent='Надіслати запрошення';inviteOpen.onclick=()=>{inviteCard.style.display='block';inviteSlot.style.display='none';};
    const inviteSlot=document.createElement('div');inviteSlot.style.alignSelf='start';inviteSlot.appendChild(inviteOpen);
    el.querySelector('.macc-access-grid').prepend(inviteSlot);
    loadAccessData();
  }
  async function loadAccessData(){
    const [members,access,audit]=await Promise.all([db.from('macc_profiles').select('id,email,role,active,invited_at,revoked_at,full_name,position,phone').eq('company_id',profile.company_id).order('invited_at',{ascending:false}),db.from('macc_access_log').select('created_at,event,user_id').eq('company_id',profile.company_id).order('created_at',{ascending:false}).limit(500),db.from('macc_audit_log').select('created_at,action,details,user_id').eq('company_id',profile.company_id).order('created_at',{ascending:false}).limit(50)]);
    const memberEl=document.getElementById('macc-members'), historyEl=document.getElementById('macc-history');if(!memberEl||!historyEl)return;
    if(members.error){memberEl.textContent='Не вдалося завантажити список.';return;}
    const allMembers=members.data||[],activeMembers=allMembers.filter(m=>m.active&&!m.revoked_at);teamMembers=activeMembers;
    const lastVisit={};(access.data||[]).filter(x=>x.event==='login').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).forEach(x=>{if(!lastVisit[x.user_id])lastVisit[x.user_id]=x.created_at;});
    memberEl.innerHTML=activeMembers.map(m=>{const projects=(fullState?.sites||[]).filter(s=>s.projectManagerEmail===m.email);const person=esc(m.full_name||m.email);const details=`<div style="font-size:13px;font-weight:600;color:var(--text)">${person}</div><div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(m.email)}${m.phone?' · '+esc(m.phone):''}</div>${m.position?`<div style="font-size:10px;color:var(--text3);margin-top:3px">${esc(m.position)}</div>`:''}<div style="font-size:10px;color:var(--accent);margin-top:4px">${roleLabel(m.role)} · активний</div><div style="font-size:10px;color:var(--text3);margin-top:4px">Останній вхід: ${lastVisit[m.id]?new Date(lastVisit[m.id]).toLocaleString('uk-UA'):'ще не заходив'}</div>${m.role==='project_manager'?`<div style="font-size:10px;color:var(--text2);margin-top:4px">Проєкти: ${projects.length?projects.map(s=>esc(s.name)).join(', '):'не призначено'}</div>`:''}`;const card=m.role==='project_manager'?`<button type="button" onclick="maccShowUserProjects('${esc(m.email)}','${person}')" style="border:0;background:none;color:inherit;text-align:left;padding:0;cursor:pointer;flex:1">${details}</button>`:`<div style="flex:1">${details}</div>`;return`<div style="padding:12px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;justify-content:space-between">${card}${m.id!==session.user.id?`<div style="display:flex;gap:6px;align-items:center"><select class="form-input" style="width:auto;padding:5px;font-size:10px" onchange="event.stopPropagation();maccChangeRole('${m.id}',this.value)">${roleOptions(m.role)}</select><button class="btn sm danger" onclick="maccRevokeUser('${m.id}','${esc(m.email)}')">Забрати доступ</button></div>`:''}</div>`;}).join('')||'<div class="macc-access-note">У команді поки тільки ви. Натисніть «Надіслати запрошення», щоб додати першого користувача.</div>';
    const emails=Object.fromEntries(allMembers.map(m=>[m.id,m.email]));
    const sectionNames={sites:'Об’єкти',contractors:'Контрагенти',executors:'Виконавці',cashflows:'Грошові потоки',budgets:'Бюджети',meetings:'Наради',tasks:'Завдання',tenders:'Тендери'};
    const records=[...(access.data||[]).map(x=>({at:x.created_at,by:emails[x.user_id]||'—',text:x.event==='login'?'Вхід до сайту':'Вихід із сайту'})),...(audit.data||[]).map(x=>({at:x.created_at,by:emails[x.user_id]||'—',text:x.action+(x.details?.sections?.length?' — '+x.details.sections.map(s=>sectionNames[s]||s).join(', '):'')}))].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,50);
    historyEl.innerHTML=records.map(x=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--text2)"><span style="color:var(--text3);font-size:10px">${new Date(x.at).toLocaleString('uk-UA')}</span><br>${esc(x.text)}<br><span style="font-size:10px;color:var(--text3)">Ким: ${esc(x.by)}</span></div>`).join('')||'<div class="macc-access-note">Ще немає записів.</div>';
  }
  async function invite(){
    const email=document.getElementById('invite-email').value.trim(), role=document.getElementById('invite-role').value, fullName=document.getElementById('invite-name').value.trim(), position=document.getElementById('invite-position').value.trim(), phone=document.getElementById('invite-phone').value.trim(), out=document.getElementById('invite-result');
    if(!email||!role){out.textContent='Вкажіть пошту та обов’язково оберіть статус.';return;}
    out.textContent='Створюємо запрошення…';
    const {data,error}=await db.functions.invoke('manage-users',{body:{action:'invite',email,role,fullName,position,phone}});
    let reason=error?.message;
    if(error?.context){try{const detail=await error.context.json();reason=detail.error||reason;}catch(e){}}
    out.textContent=error?('Помилка: '+reason):(data?.message||'Запрошення надіслано.');if(!error)loadAccessData();
  }
  async function revoke(id,email){
    if(!confirm('Забрати доступ для '+email+'? Користувач буде примусово виведений із сайту.'))return;
    const {error}=await db.functions.invoke('manage-users',{body:{action:'revoke',userId:id}});
    if(error)alert('Помилка: '+error.message);else loadAccessData();
  }
  async function changeRole(id,role){const {error}=await db.functions.invoke('manage-users',{body:{action:'update_role',userId:id,role}});if(error)alert('Не вдалося змінити статус: '+error.message);else loadAccessData();}
  window.maccOpenCompanySettings=()=>{
    if(!isAdmin()||!company)return;
    let overlay=document.getElementById('macc-company-settings');
    if(!overlay){overlay=document.createElement('div');overlay.id='macc-company-settings';overlay.className='modal-overlay';overlay.style.zIndex='600';document.body.appendChild(overlay);}
    overlay.innerHTML=`<div class="modal" style="width:460px"><div class="modal-head"><span class="modal-title">Налаштування компанії</span><button class="modal-close" onclick="document.getElementById('macc-company-settings').classList.remove('open')">×</button></div><div class="modal-body"><div class="macc-access-note" style="margin-bottom:14px">Назва відображається у робочому просторі. Логотип можна додати посиланням або вибрати файл; поле необов’язкове.</div><div class="form-group"><label class="form-label">Назва компанії *</label><input id="macc-company-name" class="form-input" value="${esc(company.name)}" required></div><div class="form-group"><label class="form-label">Посилання на логотип</label><input id="macc-company-logo-url" class="form-input" type="url" value="${esc(company.logo_url||'')}" placeholder="https://…"></div><div class="form-group"><label class="form-label">Або виберіть файл логотипу</label><input id="macc-company-logo-file" type="file" accept="image/*" class="macc-logo-file"></div><div id="macc-company-result" class="macc-access-note"></div></div><div class="modal-footer"><button class="btn secondary" onclick="document.getElementById('macc-company-settings').classList.remove('open')">Скасувати</button><button class="btn primary" onclick="maccSaveCompanySettings()">Зберегти</button></div></div>`;
    overlay.classList.add('open');
  };
  window.maccSaveCompanySettings=async()=>{
    const name=document.getElementById('macc-company-name').value.trim(),out=document.getElementById('macc-company-result');
    if(!name){out.textContent='Вкажіть назву компанії.';return;}
    out.textContent='Зберігаємо…';
    let logoUrl='';try{logoUrl=await logoDataFromInput('macc-company-logo-file','macc-company-logo-url');}catch(e){out.textContent=e.message;return;}
    const {data,error}=await db.from('macc_companies').update({name,logo_url:logoUrl||null}).eq('id',company.id).select('id,name,logo_url').single();
    if(error){out.textContent='Не вдалося зберегти: '+error.message;return;}
    company=data;applyCompanyBrand();out.textContent='Збережено.';setTimeout(()=>document.getElementById('macc-company-settings')?.classList.remove('open'),500);
  };
  window.maccToggleHistory=()=>{const card=document.getElementById('macc-history-card');if(card)card.style.display=card.style.display==='none'?'block':'none';};
  window.maccShowPasswordChange=()=>showPasswordSetup();
  window.maccInviteUser=invite;window.maccRevokeUser=revoke;window.maccChangeRole=changeRole;
  window.maccSignOut=async()=>{sessionStorage.removeItem('macc_last_page');signedOutByUser=true;if(session)await db.from('macc_access_log').insert({company_id:profile?.company_id,user_id:session.user.id,event:'logout'});await db.auth.signOut({scope:'local'});};
  async function activate(nextSession,isPasswordRecovery=false){
    session=nextSession;
    if(!session){profile=null;showLogin(signedOutByUser?'Ви вийшли з робочого простору. Для повторного входу введіть пошту та пароль.':'');return;}
    try{profile=await getProfile();}catch(e){showLogin('Помилка перевірки доступу: '+e.message);return;}
    if(!profile){await db.auth.signOut();showLogin('Доступ надається лише після запрошення адміністратора.');return;}
    if(isPasswordRecovery||location.hash.includes('type=recovery')||!profile.active){if(profile.revoked_at){await db.auth.signOut();showLogin('Доступ закрито адміністратором.');return;}showPasswordSetup();return;}
    if(!profile?.active){await db.auth.signOut();showLogin('Для цієї пошти доступ закрито адміністратором.');return;}
    try{await getCompany();}catch(e){await db.auth.signOut();showLogin('Не вдалося відкрити робочий простір: '+e.message);return;}
    document.getElementById('macc-auth')?.remove();if(isAdmin())await refreshTeamMembers();addUserBox();enableNavigation();
    await db.from('macc_access_log').insert({company_id:profile.company_id,user_id:session.user.id,event:'login'});
    await secureLoad();
    const rememberedPage=sessionStorage.getItem('macc_last_page');if(rememberedPage&&rememberedPage!==curPage)window.navigate(rememberedPage);
    db.channel('macc-company-state-'+profile.company_id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'macc_company_state',filter:'company_id=eq.'+profile.company_id},payload=>{if(payload.new.updated_by!==session.user.id){fullState=payload.new.data;window.applyState(scopedState(payload.new.data));latestData=JSON.stringify(payload.new.data);window.render();applyReadOnly();}}).subscribe();
  }
  window.maccAccessBoot=async function(){
    if(booted)return;booted=true;
    ensureStyles();
    originalRender=window.render;window.render=function(){originalRender();if(profile)applyReadOnly();};
    originalNavigate=window.navigate;window.navigate=function(page){sessionStorage.setItem('macc_last_page',page);if(page==='access'){curPage='access';document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));document.getElementById('nav-access')?.classList.add('active');renderAccess();return;}originalNavigate(page);};
    window.save=secureSave;
    const {data:{session:existing}}=await db.auth.getSession();await activate(existing,recoveryFromLink);
    db.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='PASSWORD_RECOVERY')setTimeout(()=>activate(next,event==='PASSWORD_RECOVERY'),0);});
  };
})();
