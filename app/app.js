const labels={class:'Clase',guardia:'Guardia',free:'Libre',break:'Recreo',outside:'Fuera de horario',meeting:'Reunión',other:'Otra actividad',guardia_patio:'Guardia de patio',biblioteca_patio:'Biblioteca patio',patio_inclusivo:'Patis Inclusius'};
const $=selector=>document.querySelector(selector);

async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(body.error||`Error ${response.status}`);error.code=body.code||'';throw error;}
  return body;
}

function detailFor(period){
  if(!period.session) return period.type==='break'?'Pausa definida por el horario del curso':'Sin actividad asignada';
  const session=period.session;
  return [session.subject,session.group,session.room,session.label].filter(Boolean).join(' · ')||labels[period.state];
}

function render(data){
  $('#loginPanel').hidden=true;
  $('#passwordChangePanel').hidden=true;
  $('#schedulePanel').hidden=false;
  $('#message').textContent='';
  $('#datasetLabel').textContent=`${data.dataset.academicYear} · ${data.dataset.label}`;
  $('#teacherCode').textContent=data.teacher.sourceCode||'';
  $('#teacherName').textContent=data.teacher.substitution?.role==='substitute'
    ? (data.teacher.user?.displayName||data.teacher.user?.username||data.teacher.displayName)
    : data.teacher.displayName;
  const substitution=$('#substitutionBanner');
  if(data.teacher.substitution){
    const item=data.teacher.substitution;
    const period=`${item.startsOn} – ${item.endsOn||'sin fecha final'}`;
    substitution.hidden=false;
    substitution.textContent=item.role==='substitute'
      ? `Sustituyendo a ${item.titular.displayName} · ${period}`
      : `Sustitución activa · ${item.substitute.displayName} · ${period}`;
  }else substitution.hidden=true;
  $('#dateLabel').textContent=new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(new Date(`${data.date}T12:00:00`));
  $('#currentState').textContent=labels[data.currentState]||data.currentState;
  $('#periodList').innerHTML=data.periods.map(period=>`<li class="period${data.currentPeriod?.key===period.key?' current':''}" data-state="${period.state}">
    <div><strong>${period.label||period.key}</strong><div class="period-time">${period.startsAt}<br>${period.endsAt}</div></div>
    <div><div class="period-title">${labels[period.state]||period.state}</div><div class="period-detail">${escapeHtml(detailFor(period))}</div></div>
    <span class="period-state">${labels[period.state]||period.state}</span>
  </li>`).join('');
}

function escapeHtml(value){const node=document.createElement('div');node.textContent=String(value||'');return node.innerHTML;}

async function load(){
  try{
    const session=await request('/api/auth/session');
    if(!session.authenticated){$('#schedulePanel').hidden=true;$('#passwordChangePanel').hidden=true;$('#loginPanel').hidden=false;return;}
    if(session.mustChangePassword){$('#schedulePanel').hidden=true;$('#loginPanel').hidden=true;$('#passwordChangePanel').hidden=false;return;}
    render(await request('/api/schedule/me'));
  }
  catch(error){
    $('#schedulePanel').hidden=true;
    $('#loginPanel').hidden=false;
    $('#message').textContent=error.message==='Sesion no valida.'?'':error.message;
  }
}

$('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  $('#message').textContent='Accediendo…';
  try{
    const suppliedPassword=$('#password').value;
    const result=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:suppliedPassword})});
    $('#password').value='';
    if(result.mustChangePassword){$('#currentPassword').value=suppliedPassword;$('#loginPanel').hidden=true;$('#passwordChangePanel').hidden=false;$('#message').textContent='';return;}
    await load();
  }catch(error){$('#message').textContent=error.message;}
});

$('#passwordChangeForm').addEventListener('submit',async event=>{
  event.preventDefault();
  $('#message').textContent='Guardando contraseña…';
  try{
    await request('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:$('#currentPassword').value,newPassword:$('#newPassword').value})});
    $('#currentPassword').value='';$('#newPassword').value='';
    await load();
  }catch(error){$('#message').textContent=error.message;}
});

$('#logoutButton').addEventListener('click',async()=>{
  await request('/api/auth/logout',{method:'POST',body:'{}'}).catch(()=>{});
  $('#schedulePanel').hidden=true;$('#passwordChangePanel').hidden=true;$('#loginPanel').hidden=false;$('#message').textContent='Sesión cerrada.';
});

load();
