const labels={class:'Clase',guardia:'Guardia',free:'Libre',break:'Recreo',outside:'Fuera de horario',meeting:'Reunión',other:'Otra actividad'};
const $=selector=>document.querySelector(selector);

async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.error||`Error ${response.status}`);
  return body;
}

function detailFor(period){
  if(period.type==='break') return 'Pausa definida por el horario del curso';
  if(!period.session) return 'Sin actividad asignada';
  const session=period.session;
  return [session.subject,session.group,session.room,session.label].filter(Boolean).join(' · ')||labels[period.state];
}

function render(data){
  $('#loginPanel').hidden=true;
  $('#schedulePanel').hidden=false;
  $('#message').textContent='';
  $('#datasetLabel').textContent=`${data.dataset.academicYear} · ${data.dataset.label}`;
  $('#teacherCode').textContent=data.teacher.sourceCode||'';
  $('#teacherName').textContent=data.teacher.displayName;
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
  try{render(await request('/api/schedule/me'));}
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
    await request('/api/auth/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});
    $('#password').value='';
    await load();
  }catch(error){$('#message').textContent=error.message;}
});

$('#logoutButton').addEventListener('click',async()=>{
  await request('/api/auth/logout',{method:'POST',body:'{}'}).catch(()=>{});
  $('#schedulePanel').hidden=true;$('#loginPanel').hidden=false;$('#message').textContent='Sesión cerrada.';
});

load();
