/* MACC secure access layer — Supabase Auth, roles and audit trail */
(function(){
  window.MACC_SECURE_BOOT=true;
  const URL='https://wfdkprsszmvhqsycjwuh.supabase.co';
  const KEY='sb_publishable_e95XvrX-cpaj7-dITbc67g__KYosuXT';
  const db=window.supabase.createClient(URL,KEY);
  let session=null, profile=null, originalRender=null, originalNavigate=null;
  let booted=false, latestData='';

  const css=`
    #macc-auth{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(circle at top,#2c4260,#162030 65%)}
    .macc-auth-card{width:420px;max-width:100%;background:#263a52;border:1px solid #3f5f84;border-radius:16px;padding:30px;box-shadow:0 25px 80px #0008;color:#fff}
    .macc-auth-logo{display:flex;align-items:center;gap:12px;margin-bottom:24px}.macc-auth-logo b{color:#f0b429;font-size:20px;letter-spacing:.08em}.macc-auth-logo span{font-size:11px;color:#a0b4c8}
    .macc-auth-card h1{font-size:20px;margin:0 0 8px}.macc-auth-card p{font-size:13px;color:#c7d4e3;line-height:1.5;margin:0 0 20px}.macc-auth-card label{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;color:#a0b4c8;margin:13px 0 5px;text-transform:uppercase}
    .macc-auth-card input,.macc-auth-card select{width:100%;padding:10px 12px;border-radius:7px;border:1px solid #3f5f84;background:#162030;color:#fff;font-size:14px}.macc-auth-card button{width:100%;margin-top:18px;padding:11px;border:0;border-radius:7px;background:#f0b429;color:#162030;font-weight:800;cursor:pointer}.macc-auth-card button:disabled{opacity:.6;cursor:wait}.macc-auth-message{min-height:20px;margin-top:13px;font-size:12px;color:#fbbf24}.macc-auth-help{font-size:11px!important;color:#a0b4c8!important;margin-top:18px!important}
    #macc-user-box{padding:12px 14px 14px;border-top:1px solid var(--border);margin-top:4px}.macc-user-email{font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.macc-user-role{font-size:9px;color:var(--accent);font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-top:3px}.macc-user-actions{display:flex;gap:6px;margin-top:8px}.macc-user-actions button{background:none;border:1px solid var(--border2);border-radius:5px;color:var(--text3);font-size:10px;padding:4px 7px;cursor:pointer}.macc-user-actions button:hover{color:var(--text);border-color:var(--accent)}
    #nav-access{display:none}.macc-access-note{font-size:12px;color:var(--text3);line-height:1.5}.macc-access-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.macc-access-grid .card{margin-bottom:0}@media(max-width:700px){.macc-access-grid{grid-template-columns:1fr}}
  `;
  function esc(v){return String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function roleLabel(role){return({admin:'Адміністратор',editor:'Редактор',viewer:'Перегляд'})[role]||role;}
  function authOverlay(){
    if(document.getElementById('macc-auth'))return;
    document.head.insertAdjacentHTML('beforeend',`<style>${css}</style>`);
    document.body.insertAdjacentHTML('beforeend',`<div id="macc-auth"><form class="macc-auth-card" id="macc-auth-form"><div class="macc-auth-logo"><img src="logo.png" width="42" height="42" style="border-radius:50%"><div><b>MACC</b><br><span>Management Accounting</span></div></div><h1>Вхід до робочого простору</h1><p>Доступ надає адміністратор команди. Увійдіть за вашою корпоративною поштою та паролем.</p><label for="macc-login-email">Електронна пошта</label><input id="macc-login-email" type="email" required autocomplete="email"><label for="macc-login-password">Пароль</label><input id="macc-login-password" type="password" required autocomplete="current-password"><button id="macc-login-submit" type="submit">Увійти</button><div id="macc-login-message" class="macc-auth-message"></div><p class="macc-auth-help">Немає доступу або забули пароль? Зверніться до адміністратора сайту.</p></form></div>`);
    document.getElementById('macc-auth-form').addEventListener('submit',signIn);
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
  function showPasswordSetup(){
    authOverlay();
    const overlay=document.getElementById('macc-auth');
    overlay.innerHTML=`<form class="macc-auth-card" id="macc-password-form"><div class="macc-auth-logo"><img src="logo.png" width="42" height="42" style="border-radius:50%"><div><b>MACC</b><br><span>Management Accounting</span></div></div><h1>Створіть пароль</h1><p>Задайте пароль для наступних входів до закритого робочого простору MACC.</p><label for="macc-new-password">Новий пароль</label><input id="macc-new-password" type="password" required minlength="8" autocomplete="new-password"><label for="macc-new-password-repeat">Повторіть пароль</label><input id="macc-new-password-repeat" type="password" required minlength="8" autocomplete="new-password"><button id="macc-password-submit" type="submit">Зберегти пароль і відкрити сайт</button><div id="macc-password-message" class="macc-auth-message"></div></form>`;
    document.getElementById('macc-password-form').addEventListener('submit',async e=>{
      e.preventDefault();
      const password=document.getElementById('macc-new-password').value;
      const repeat=document.getElementById('macc-new-password-repeat').value;
      const message=document.getElementById('macc-password-message'), button=document.getElementById('macc-password-submit');
      if(password!==repeat){message.textContent='Паролі не збігаються.';return;}
      button.disabled=true; message.textContent='Зберігаємо пароль…';
      const {error}=await db.auth.updateUser({password});
      if(error){message.textContent='Не вдалося зберегти пароль: '+error.message;button.disabled=false;return;}
      const {error:activationError}=await db.functions.invoke('manage-users',{body:{action:'activate_self'}});
      if(activationError){message.textContent='Пароль збережено, але доступ не підтверджено: '+activationError.message;button.disabled=false;return;}
      profile.active=true;profile.revoked_at=null;
      history.replaceState(null,'',location.pathname);
      overlay.remove(); addUserBox(); enableNavigation();
      await db.from('macc_access_log').insert({user_id:session.user.id,event:'login'});
      await secureLoad();
    });
  }
  async function getProfile(){
    const {data,error}=await db.from('macc_profiles').select('id,email,role,active,revoked_at').eq('id',session.user.id).maybeSingle();
    if(error)throw error; return data;
  }
  function addUserBox(){
    let box=document.getElementById('macc-user-box');
    if(!box){box=document.createElement('div');box.id='macc-user-box';document.querySelector('.topbar').appendChild(box);}
    box.innerHTML=`<div class="macc-user-email">${esc(profile.email)}</div><div class="macc-user-role">${roleLabel(profile.role)}</div><div class="macc-user-actions">${profile.role==='admin'?'<button onclick="navigate(\'access\')">Керування доступом</button>':''}<button onclick="maccSignOut()">Вийти</button></div>`;
  }
  function enableNavigation(){
    if(!document.getElementById('nav-access')){
      const b=document.createElement('button');b.id='nav-access';b.className='nav-item';b.innerHTML='<span class="nav-icon">🔐</span>Доступ команди';b.onclick=()=>navigate('access');
      document.getElementById('nav-service').before(b);
    }
    document.getElementById('nav-access').style.display=profile.role==='admin'?'flex':'none';
  }
  function applyReadOnly(){
    const readOnly=profile.role==='viewer';
    document.querySelectorAll('#main-content button,#main-content input,#main-content select,#main-content textarea').forEach(el=>el.disabled=readOnly);
    if(readOnly)document.querySelectorAll('#main-content .page-header').forEach(el=>{if(!el.querySelector('.macc-viewer-note'))el.insertAdjacentHTML('beforeend','<span class="macc-viewer-note" style="font-size:11px;color:var(--accent)">Режим перегляду</span>')});
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
    if(!profile||!['admin','editor'].includes(profile.role)){alert('У вас є лише доступ для перегляду.');return;}
    const payload=JSON.stringify(state);
    localStorage.setItem('macc_state',payload);
    if(payload===latestData)return;
    const previous=latestData?JSON.parse(latestData):{};
    latestData=payload;
    const {error}=await db.from('macc_app_state').upsert({id:'main',data:state,updated_at:new Date().toISOString(),updated_by:session.user.id});
    if(error){console.error(error); alert('Зміни не вдалося синхронізувати: '+error.message);return;}
    const changes=auditChanges(previous,state);await db.from('macc_audit_log').insert({user_id:session.user.id,action:changes.length?changes.join('; '):'Зміна даних сайту',details:{sections:topLevelChanges(previous,state)}});
  }
  async function secureLoad(){
    const savedTheme=localStorage.getItem('macc_theme')||'dark';document.body.classList.toggle('light-theme',savedTheme==='light');
    const {data,error}=await db.from('macc_app_state').select('data,updated_at').eq('id','main').maybeSingle();
    if(error)throw error;
    if(data?.data){window.applyState(data.data);latestData=JSON.stringify(state);localStorage.setItem('macc_state',latestData);}
    else if(profile.role==='admin'){
      const backup=await fetch('https://macc-d6e9b-default-rtdb.europe-west1.firebasedatabase.app/data.json').then(r=>r.ok?r.json():null).catch(()=>null);
      if(backup&&(backup.sites||backup.cashflows)){
        window.applyState(backup); latestData=JSON.stringify(state);
        const {error:writeError}=await db.from('macc_app_state').upsert({id:'main',data:state,updated_at:new Date().toISOString(),updated_by:session.user.id});
        if(writeError)throw writeError;
        await db.from('macc_audit_log').insert({user_id:session.user.id,action:'Початкове перенесення даних',details:{source:'попереднє сховище'}});
      }
    }
    window.render();applyReadOnly();
  }
  function renderAccess(){
    const el=document.getElementById('main-content');
    el.innerHTML=`<div class="page-header"><div><h1 class="page-title">🔐 Доступ команди</h1><div class="macc-access-note">Тут адміністратор надає або забирає доступ. Усі входи та зміни фіксуються.</div></div></div><div class="macc-access-grid"><div class="card"><div class="card-head"><span class="card-title">Запросити користувача</span></div><div class="card-body"><div class="form-group"><label class="form-label">Ім’я та прізвище</label><input id="invite-name" class="form-input" placeholder="Іван Петренко"></div><div class="form-group"><label class="form-label">Посада</label><input id="invite-position" class="form-input" placeholder="Напр. бухгалтер"></div><div class="form-group"><label class="form-label">Телефон</label><input id="invite-phone" class="form-input" type="tel" placeholder="+380…"></div><div class="form-group"><label class="form-label">Електронна пошта</label><input id="invite-email" class="form-input" type="email" placeholder="name@company.com"></div><div class="form-group"><label class="form-label">Роль</label><select id="invite-role" class="form-input"><option value="editor">Редактор — може вносити зміни</option><option value="viewer">Перегляд — без права змін</option><option value="admin">Адміністратор — керує доступом</option></select></div><button class="btn primary" onclick="maccInviteUser()">Надіслати запрошення</button><div id="invite-result" class="macc-access-note" style="margin-top:12px"></div></div></div><div class="card"><div class="card-head"><span class="card-title">Користувачі</span></div><div class="card-body" id="macc-members">Завантаження…</div></div></div><div style="margin-top:14px"><button class="btn secondary" onclick="maccToggleHistory()">📋 Історія змін</button></div><div class="card" id="macc-history-card" style="display:none;margin-top:14px"><div class="card-head"><span class="card-title">Історія змін</span></div><div class="card-body" id="macc-history">Завантаження…</div></div>`;
    const inviteCard=el.querySelector('.macc-access-grid .card');
    inviteCard.style.display='none';
    inviteCard.querySelector('button').textContent='Відправити запрошення';
    const inviteOpen=document.createElement('button');inviteOpen.className='btn primary';inviteOpen.textContent='Надіслати запрошення';inviteOpen.onclick=()=>{inviteCard.style.display='block';inviteOpen.style.display='none';};
    el.querySelector('.macc-access-grid').prepend(inviteOpen);
    loadAccessData();
  }
  async function loadAccessData(){
    const [members,access,audit]=await Promise.all([db.from('macc_profiles').select('id,email,role,active,invited_at,revoked_at,full_name,position,phone').order('invited_at',{ascending:false}),db.from('macc_access_log').select('created_at,event,user_id').order('created_at',{ascending:false}).limit(12),db.from('macc_audit_log').select('created_at,action,details,user_id').order('created_at',{ascending:false}).limit(12)]);
    const memberEl=document.getElementById('macc-members'), historyEl=document.getElementById('macc-history');if(!memberEl||!historyEl)return;
    if(members.error){memberEl.textContent='Не вдалося завантажити список.';return;}
    memberEl.innerHTML=(members.data||[]).map(m=>`<div style="padding:9px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;justify-content:space-between"><div>${m.full_name?`<div style="font-size:13px;font-weight:600;color:var(--text)">${esc(m.full_name)}</div>`:''}<div style="font-size:12px;color:var(--text)">${esc(m.email)}</div><div style="font-size:10px;color:var(--text3)">${roleLabel(m.role)} · ${m.active?'активний':'доступ забрано'}</div>${m.position?`<div style="font-size:10px;color:var(--text3);margin-top:3px">Посада: ${esc(m.position)}</div>`:''}${m.phone?`<div style="font-size:10px;color:var(--text3)">Телефон: ${esc(m.phone)}</div>`:''}</div>${m.id!==session.user.id&&m.active?`<button class="btn sm danger" onclick="maccRevokeUser('${m.id}','${esc(m.email)}')">Забрати доступ</button>`:''}</div>`).join('')||'<div class="macc-access-note">Користувачів ще немає.</div>';
    const emails=Object.fromEntries((members.data||[]).map(m=>[m.id,m.email]));
    const sectionNames={sites:'Об’єкти',contractors:'Контрагенти',executors:'Виконавці',cashflows:'Грошові потоки',budgets:'Бюджети',meetings:'Наради',tasks:'Завдання',tenders:'Тендери'};
    const records=[...(access.data||[]).map(x=>({at:x.created_at,by:emails[x.user_id]||'—',text:x.event==='login'?'Вхід до сайту':'Вихід із сайту'})),...(audit.data||[]).map(x=>({at:x.created_at,by:emails[x.user_id]||'—',text:x.action+(x.details?.sections?.length?' — '+x.details.sections.map(s=>sectionNames[s]||s).join(', '):'')}))].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,50);
    historyEl.innerHTML=records.map(x=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--text2)"><span style="color:var(--text3);font-size:10px">${new Date(x.at).toLocaleString('uk-UA')}</span><br>${esc(x.text)}<br><span style="font-size:10px;color:var(--text3)">Ким: ${esc(x.by)}</span></div>`).join('')||'<div class="macc-access-note">Ще немає записів.</div>';
  }
  async function invite(){
    const email=document.getElementById('invite-email').value.trim(), role=document.getElementById('invite-role').value, fullName=document.getElementById('invite-name').value.trim(), position=document.getElementById('invite-position').value.trim(), phone=document.getElementById('invite-phone').value.trim(), out=document.getElementById('invite-result');
    if(!email){out.textContent='Вкажіть пошту користувача.';return;}
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
  window.maccToggleHistory=()=>{const card=document.getElementById('macc-history-card');if(card)card.style.display=card.style.display==='none'?'block':'none';};
  window.maccInviteUser=invite;window.maccRevokeUser=revoke;
  window.maccSignOut=async()=>{sessionStorage.removeItem('macc_last_page');if(session)await db.from('macc_access_log').insert({user_id:session.user.id,event:'logout'});await db.auth.signOut();};
  async function activate(nextSession){
    session=nextSession;
    if(!session){profile=null;showLogin();return;}
    try{profile=await getProfile();}catch(e){showLogin('Помилка перевірки доступу: '+e.message);return;}
    if(location.hash.includes('type=recovery')||(!profile?.active&&!profile?.revoked_at)){showPasswordSetup();return;}
    if(!profile?.active){await db.auth.signOut();showLogin('Для цієї пошти доступ закрито адміністратором.');return;}
    document.getElementById('macc-auth')?.remove();addUserBox();enableNavigation();
    await db.from('macc_access_log').insert({user_id:session.user.id,event:'login'});
    await secureLoad();
    const rememberedPage=sessionStorage.getItem('macc_last_page');if(rememberedPage&&rememberedPage!==curPage)window.navigate(rememberedPage);
    db.channel('macc-main-state').on('postgres_changes',{event:'UPDATE',schema:'public',table:'macc_app_state',filter:'id=eq.main'},payload=>{if(payload.new.updated_by!==session.user.id){window.applyState(payload.new.data);latestData=JSON.stringify(state);window.render();applyReadOnly();}}).subscribe();
  }
  window.maccAccessBoot=async function(){
    if(booted)return;booted=true;
    originalRender=window.render;window.render=function(){originalRender();if(profile)applyReadOnly();};
    originalNavigate=window.navigate;window.navigate=function(page){sessionStorage.setItem('macc_last_page',page);if(page==='access'){curPage='access';document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));document.getElementById('nav-access')?.classList.add('active');renderAccess();return;}originalNavigate(page);};
    window.save=secureSave;
    const {data:{session:existing}}=await db.auth.getSession();await activate(existing);
    db.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(()=>activate(next),0);});
  };
})();
