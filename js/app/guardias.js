const HORA_MAP={1:{label:'1a',rango:'08:15-09:10'},2:{label:'2a',rango:'09:10-10:05'},3:{label:'3a',rango:'10:05-11:00'},4:{label:'4a',rango:'11:00-11:25'},5:{label:'5a',rango:'11:25-12:20'},6:{label:'6a',rango:'12:20-13:15'},7:{label:'7a',rango:'13:15-14:10'},8:{label:'8a',rango:'14:10-14:25'},9:{label:'9a',rango:'14:25-15:20'}};
const HORAS_PATIO=new Set([4,8]);
const DIAS=['Lunes','Martes','Miércoles','Jueves','Viernes'];
const KEY='IES_Alcalans_Guardias';
const KEY_ORDEN='IES_Alcalans_Guardias_OrdenHora';
const KEY_THEME='IES_Alcalans_Theme';
const KEY_TAREAS='IES_Alcalans_Tareas_Profesorado';
const RAW_PROFESORADO=(window.PROFESORADO_SOURCE&&Array.isArray(window.PROFESORADO_SOURCE.teachers))?window.PROFESORADO_SOURCE.teachers:[];
const GRUPOS_PROFESORADO={};
function decodeMojibake(value){
  if(value==null) return '';
  try{return decodeURIComponent(escape(String(value)));}catch(e){return String(value);}
}
function cleanText(value){return decodeMojibake(value).replace(/\s+/g,' ').trim();}
function stripDiacritics(value){return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function toTitleCase(value){return cleanText(value).toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúàèìòùüñç])/g,(m,p1,p2)=>p1+p2.toUpperCase());}
const DIA_INDEX={'lunes':0,'martes':1,'miercoles':2,'miércoles':2,'jueves':3,'viernes':4};
const HORA_INDEX=Object.fromEntries(Object.entries(HORA_MAP).map(([hora,info])=>[info.rango,+hora]));
function normalizaDia(value){return DIA_INDEX[cleanText(value).toLowerCase()] ?? null;}
function normalizaHora(franja){return HORA_INDEX[cleanText(franja)] ?? null;}
function formatTeacherName(value){return cleanText(value).toLowerCase().split(/([\s(\/-]+)/).map(token=>/^[\s(\/-]+$/.test(token)?token:token.charAt(0).toUpperCase()+token.slice(1)).join('');}
function resolveDiaIndex(value){return {'lunes':0,'martes':1,'miercoles':2,'jueves':3,'viernes':4}[stripDiacritics(value).toLowerCase()] ?? null;}
function isGuardiaTexto(texto){return cleanText(texto).toLowerCase().includes('guardia');}
function parseSesion(item){
  const texto=cleanText(item.texto);
  const aula=cleanText(item.aula);
  const partes=texto.split('|').map(parte=>cleanText(parte)).filter(Boolean);
  if(isGuardiaTexto(texto)) return {tipo:'guardia',materia:'Guardia',detalle:'Guardia',grupo:'',aula:aula||''};
  if(partes.length>=3) return {tipo:'clase',materia:partes[0],grupo:partes[1],detalle:texto,aula:aula||partes[2]||''};
  if(partes.length===2) return {tipo:'clase',materia:partes[0],grupo:'',detalle:texto,aula:aula||partes[1]||''};
  return {tipo:'clase',materia:partes[0]||texto||'Sesion',grupo:'',detalle:texto||'Sesion',aula:aula||''};
}
function buildProfesoradoData(){
  const profesoresBase={};
  const guardiasPorHora={};
  for(let dia=0;dia<5;dia++){
    guardiasPorHora[dia]={};
    for(let hora=1;hora<=9;hora++) guardiasPorHora[dia][hora]=[];
  }
  RAW_PROFESORADO.forEach((teacher,index)=>{
    const nombre=formatTeacherName(teacher.nombre)||`Profesor ${index+1}`;
    const horario={};
    (teacher.horario||[]).forEach(item=>{
      const dia=resolveDiaIndex(item.dia);
      const hora=normalizaHora(item.franja);
      if(dia==null||hora==null) return;
      if(!horario[dia]) horario[dia]={};
      horario[dia][hora]=parseSesion(item);
    });
    const guardiasUnicas=new Set();
    [...(teacher.guardias||[]),...(teacher.horario||[]).filter(item=>isGuardiaTexto(item.texto))].forEach(item=>{
      const dia=resolveDiaIndex(item.dia);
      const hora=normalizaHora(item.franja);
      if(dia==null||hora==null) return;
      if(HORAS_PATIO.has(hora)) return;
      const key=`${dia}-${hora}`;
      if(guardiasUnicas.has(key)) return;
      guardiasUnicas.add(key);
      guardiasPorHora[dia][hora].push(nombre);
    });
    profesoresBase[nombre]={nombre,nombreCompleto:nombre,departamento:'Profesorado',grupos:[],horario};
  });
  Object.keys(guardiasPorHora).forEach(dia=>{
    Object.keys(guardiasPorHora[dia]).forEach(hora=>{
      guardiasPorHora[dia][hora]=guardiasPorHora[dia][hora].sort((a,b)=>a.localeCompare(b,'es'));
    });
  });
  const profesPlantilla=Object.keys(profesoresBase).sort((a,b)=>a.localeCompare(b,'es'));
  return {profesPlantilla,profesoresBase,guardiasPorHora};
}
const PROFESORADO_DATA=buildProfesoradoData();
const PROFES_PLANTILLA=PROFESORADO_DATA.profesPlantilla;
const PROFESORES_BASE=PROFESORADO_DATA.profesoresBase;
const HORARIO_GUARDIAS=PROFESORADO_DATA.guardiasPorHora;
const ALL_PROFESORES=[...new Set([...PROFES_PLANTILLA,...Object.keys(PROFESORES_BASE)])].sort((a,b)=>a.localeCompare(b,'es'));
let isAdmin=false,day=0,editId=null;
let teacherName=ALL_PROFESORES[0]||'';
let teacherDay=0;
const demo=[];
const LEGACY_DEMO_NAMES=new Set(['Garcia Lopez, Ana','Perez Sanchez, Luis','Torres Vidal, Marta','Romero Diaz, Javier','Navarro Gil, Carmen','Castro Reyes, David','Blanco Munoz, Rosa','Serrano Lara, Miguel']);
function syncTeacherIdentity(){
  const profesor=getProfesor(teacherName);
  const nombre=profesor?.nombre||teacherName||'Profesorado';
  const detalle=profesor?.departamento||'Profesorado';
  const nombreCompleto=profesor?.nombreCompleto||nombre;
  document.getElementById('teacherName').textContent=nombre;
  document.getElementById('teacherMeta').textContent=`${nombreCompleto} - ${detalle}`;
  document.getElementById('teacherBarName').textContent=`${nombre} - ${detalle}`;
}
function load(){
  try{
    const d=localStorage.getItem(KEY);
    if(!d) return demo;
    const parsed=JSON.parse(d);
    if(Array.isArray(parsed)&&parsed.length&&parsed.every(item=>LEGACY_DEMO_NAMES.has(item.ausente))){
      localStorage.removeItem(KEY);
      return demo;
    }
    return parsed;
  }catch(e){return demo;}
}
function persist(d){try{localStorage.setItem(KEY,JSON.stringify(d));}catch(e){}}
function persistOrden(d){try{localStorage.setItem(KEY_ORDEN,JSON.stringify(d));}catch(e){}}
function loadTareas(){try{const d=localStorage.getItem(KEY_TAREAS);return d?JSON.parse(d):{};}catch(e){return {};}}
function persistTareas(d){try{localStorage.setItem(KEY_TAREAS,JSON.stringify(d));}catch(e){}}
function shuffle(arr){const copy=[...arr];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
function makeOrdenHora(dia,hora){return shuffle(HORARIO_GUARDIAS[dia]?.[hora]||[]).map((nombre,index)=>({nombre,numero:index+1}));}
function buildInitialOrden(){const orden={};for(let dia=0;dia<5;dia++){orden[dia]={};for(let hora=1;hora<=9;hora++){orden[dia][hora]=makeOrdenHora(dia,hora);}}persistOrden(orden);return orden;}
function ensureOrden(base){
  const orden={...base};
  for(let dia=0;dia<5;dia++){
    if(!orden[dia]) orden[dia]={};
    for(let hora=1;hora<=9;hora++){
      const esperados=HORARIO_GUARDIAS[dia]?.[hora]||[];
      const actuales=Array.isArray(orden[dia][hora])?orden[dia][hora]:[];
      const nombres=actuales.map(item=>item.nombre);
      const invalido=actuales.length!==esperados.length||esperados.some(nombre=>!nombres.includes(nombre));
      if(invalido) orden[dia][hora]=makeOrdenHora(dia,hora);
    }
  }
  persistOrden(orden);
  return orden;
}
function loadOrden(){try{const d=localStorage.getItem(KEY_ORDEN);return d?ensureOrden(JSON.parse(d)):buildInitialOrden();}catch(e){return buildInitialOrden();}}
function getOrdenHora(dia,hora){return (ordenGuardias[dia]?.[hora]||[]).slice().sort((a,b)=>a.numero-b.numero);}
function getGuardiaSugerida(dia,hora,turno){return getOrdenHora(dia,hora).find(item=>item.numero===turno)?.nombre||'';}
function getGuardiaApoyo(dia,hora,ocupadas){return getOrdenHora(dia,hora)[ocupadas]||null;}
function getProfesHora(dia,hora){return HORARIO_GUARDIAS[dia]?.[hora]||[];}
function getProfesor(nombre){return PROFESORES_BASE[nombre]||null;}
function getGuardiasDisponibles(dia,hora){return getProfesHora(+dia,+hora);}
function getProfesorNombreSeleccionado(valor){
  const texto=(valor||'').trim();
  if(!texto) return '';
  return ALL_PROFESORES.find(nombre=>nombre.toLowerCase()===texto.toLowerCase())||'';
}
function getGuardiaNombreSeleccionado(valor,dia,hora){
  const texto=(valor||'').trim();
  if(!texto) return '';
  return getGuardiasDisponibles(dia,hora).find(nombre=>nombre.toLowerCase()===texto.toLowerCase())||'';
}
function getHorarioProfesorDia(nombre,dia){return getProfesor(nombre)?.horario?.[dia]||{};}
function getAulaProfesor(nombre,dia,hora){
  const sesion=getHorarioProfesorDia(nombre,dia)?.[hora];
  return sesion?.aula||'';
}
function makeTareaKey(nombre,dia,hora){return `${nombre}|${dia}|${hora}`;}
function getTareaProfesor(nombre,dia,hora){return tareasProfesorado[makeTareaKey(nombre,dia,hora)]||null;}
function resolveFaena(row){
  const tarea=getTareaProfesor(row.ausente,row.dia,row.hora);
  if(tarea) return {faena:!!tarea.dejada,obs:tarea.tarea||''};
  return {faena:row.faena,obs:row.obs};
}
function applyTheme(theme){const dark=theme==='dark';document.body.classList.toggle('theme-dark',dark);const btn=document.getElementById('btnTheme');if(btn)btn.textContent=dark?'Modo claro':'Modo oscuro';}
function loadTheme(){try{return localStorage.getItem(KEY_THEME)||'light';}catch(e){return'light';}}
function toggleTheme(){const next=document.body.classList.contains('theme-dark')?'light':'dark';applyTheme(next);try{localStorage.setItem(KEY_THEME,next);}catch(e){}}
let data=load();
let nid=data.reduce((m,g)=>Math.max(m,g.id),0)+1;
let ordenGuardias=loadOrden();
let tareasProfesorado=loadTareas();
(function(){const wd=new Date().getDay();day=(wd>=1&&wd<=5)?wd-1:0;})();
teacherDay=day;
setInterval(()=>{document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});},1000);
document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
function initials(n){return(n||'').split(/[\s,]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';}
function renderPills(){document.getElementById('dNombre').textContent=DIAS[day];document.getElementById('dayPills').innerHTML=DIAS.map((d,i)=>`<button class="day-pill${i===day?' active':''}" onclick="setDay(${i})">${d}</button>`).join('');}
function renderGuardiaBoard(){
  const grid=document.getElementById('guardiaGrid');
  const cards=[];
  for(let hora=1;hora<=9;hora++){
    if(HORAS_PATIO.has(hora)) continue;
    const profes=getProfesHora(day,hora);
    const asignados=new Set(data.filter(g=>g.dia===day&&g.hora===hora&&g.guardia&&g.guardia.trim()).map(g=>g.guardia.trim()));
    cards.push(`<div class="guardia-card"><div class="guardia-card-head"><div class="guardia-num">${HORA_MAP[hora].label} hora</div></div><div class="guardia-list">${profes.map(nombre=>`<span class="guardia-mini${asignados.has(nombre)?' guardia-mini-assigned':''}">${nombre}</span>`).join('')}</div></div>`);
  }
  grid.innerHTML=cards.join('');
}
function setDay(i){day=i;renderPills();renderGuardiaBoard();renderTable();}
function sortearGuardiasDia(){for(let hora=1;hora<=9;hora++){ordenGuardias[day][hora]=makeOrdenHora(day,hora);}persistOrden(ordenGuardias);renderGuardiaBoard();renderTable();}
function renderTable(){
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const tb=document.getElementById('tbody');
  if(!rows.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No hay ausencias registradas para este dia.</td></tr>';}
  else{
    tb.innerHTML=rows.map(g=>{
      const h=HORA_MAP[g.hora]||{label:g.hora+'a',rango:''};
      const cub=g.guardia&&g.guardia.trim();
      const sugerido=cub||getGuardiaSugerida(day,g.hora,1);
      const biblioteca=getGuardiaApoyo(day,g.hora,1);
      const banos=getGuardiaApoyo(day,g.hora,2);
      const faenaInfo=resolveFaena(g);
      return `<tr>
        <td><div class="hora-num">${h.rango.replace('-', ' - ')}</div></td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Ausente</span><div class="chip"><div class="avatar av-red">${initials(g.ausente)}</div>${g.ausente}</div></div></div></td>
        <td>${sugerido?`<div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">${cub?'Guardia asignada':'Turno 1'}</span><div class="chip guardia-chip${cub?' guardia-chip-assigned':''}"><div class="avatar av-yellow">${initials(sugerido)}</div>${sugerido}</div></div></div>`:`<span class="sin-asignar">Sin asignar</span>`}</td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Aula</span><span class="aula-tag">${g.aula||'-'}</span></div></div></td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Faena</span>${faenaInfo.faena?`<div class="faena-box"><span class="badge b-ok">Con tarea</span>${faenaInfo.obs?`<details class="faena-toggle"><summary></summary><div class="faena-text">${faenaInfo.obs}</div></details>`:''}</div>`:`<span class="badge b-nok">Sin tarea</span>`}</div></div></td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Estado</span>${sugerido?`<span class="badge b-ok">${cub?'Asignada':'Turno 1'}</span>`:'<span class="badge b-nok">Sin cubrir</span>'}</div></div></td>
        <td style="${isAdmin?'':'display:none'}"><button class="btn-edit" onclick="openModal(${g.id})">Editar</button></td>
      </tr>${biblioteca?`<tr class="row-support"><td colspan="7"><div class="row-support-block"><span class="badge b-biblio">Biblioteca</span><span class="row-support-text">${biblioteca.nombre} cubre la guardia de la biblioteca en esta hora.</span></div></td></tr>`:''}${banos?`<tr class="row-support"><td colspan="7"><div class="row-support-block"><span class="badge b-banos">Banos</span><span class="row-support-text">${banos.nombre} cubre la puerta de los banos en esta hora.</span></div></td></tr>`:''}`;
    }).join('');
  }
  const aus=rows.length;
  const asig=rows.filter(g=>(g.guardia&&g.guardia.trim())||getGuardiaSugerida(day,g.hora,1)).length;
  document.getElementById('thAcc').style.display=isAdmin?'':'none';
  document.getElementById('sAus').textContent=aus;
  document.getElementById('sAsig').textContent=asig;
  document.getElementById('sSin').textContent=Math.max(aus-asig,0);
  document.getElementById('sFaena').textContent=rows.filter(g=>resolveFaena(g).faena).length;
}
function toggleAdmin(){if(!isAdmin){const pw=prompt('Contraseña de jefe de estudios:');if(pw!=='jefe2025'){alert('Contraseña incorrecta.');return;}}isAdmin=!isAdmin;document.getElementById('btnAdmin').classList.toggle('on',isAdmin);document.getElementById('adminBar').classList.toggle('show',isAdmin);renderTable();}
function openTeacherPanel(){teacherDay=day;syncTeacherIdentity();document.getElementById('teacherOverlay').classList.add('open');document.getElementById('teacherBar').classList.add('show');renderTeacherPanel();}
function closeTeacherPanel(){document.getElementById('teacherOverlay').classList.remove('open');}
function exitTeacherMode(){closeTeacherPanel();document.getElementById('teacherBar').classList.remove('show');}
function bgTeacherClose(e){if(e.target.id==='teacherOverlay')closeTeacherPanel();}
function setTeacherDay(dia){teacherDay=dia;renderTeacherPanel();}
function saveTeacherTask(dia,hora,exitAfter){
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  const dejada=document.getElementById(`taskCheck-${dia}-${hora}`).checked;
  const tarea=document.getElementById(`taskText-${dia}-${hora}`).value.trim();
  tareasProfesorado[makeTareaKey(teacherName,dia,hora)]={profesor:teacherName,dia,hora,dejada,tarea};
  persistTareas(tareasProfesorado);
  if(exitAfter){renderTable();exitTeacherMode();return;}
  renderTeacherPanel();
  renderTable();
}
function renderTeacherPanel(){
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  syncTeacherIdentity();
  document.getElementById('teacherName').textContent=profesor.nombre;
  document.getElementById('teacherMeta').textContent=`${profesor.nombreCompleto} - ${profesor.departamento}`;
  document.getElementById('teacherSummary').textContent=`${DIAS[teacherDay]} - sesiones programadas`;
  document.getElementById('teacherBarName').textContent=`${profesor.nombre} - ${profesor.departamento}`;
  document.getElementById('teacherDayPills').innerHTML=DIAS.map((nombreDia,index)=>`<button class="${index===teacherDay?'active':''}" onclick="setTeacherDay(${index})">${nombreDia}</button>`).join('');
  const sesiones=getHorarioProfesorDia(teacherName,teacherDay);
  const horas=Object.keys(sesiones).map(Number).sort((a,b)=>a-b);
  if(!horas.length){
    document.getElementById('teacherSessions').innerHTML='<div class="teacher-session"><div class="teacher-session-empty">No tienes sesiones registradas para este dia.</div></div>';
    return;
  }
  document.getElementById('teacherSessions').innerHTML=horas.map(hora=>{
    const sesion=sesiones[hora];
    const grupo=sesion.grupo?GRUPOS_PROFESORADO[sesion.grupo]?.nombre||sesion.grupo:'';
    const tarea=getTareaProfesor(teacherName,teacherDay,hora);
    const checked=tarea?!!tarea.dejada:false;
    const texto=tarea?.tarea||'';
    return `<div class="teacher-session">
      <div class="teacher-session-head">
        <div>
          <div class="teacher-session-title">${HORA_MAP[hora].label} hora - ${sesion.materia||sesion.tipo}</div>
          <div class="teacher-session-meta">${grupo||sesion.detalle}</div>
        </div>
        <div class="teacher-session-meta">${HORA_MAP[hora].rango}</div>
      </div>
      <label class="teacher-check">
        <input id="taskCheck-${teacherDay}-${hora}" type="checkbox" ${checked?'checked':''}>
        <span>He dejado tarea para este grupo</span>
      </label>
      <div class="fg">
        <label>Tarea</label>
        <textarea id="taskText-${teacherDay}-${hora}" placeholder="Indica que debe hacer el grupo">${texto}</textarea>
      </div>
      <button class="teacher-save" type="button" onclick="saveTeacherTask(${teacherDay},${hora},false)">Guardar tarea</button>
      <button class="teacher-save-exit" type="button" onclick="saveTeacherTask(${teacherDay},${hora},true)">Guardar y salir</button>
    </div>`;
  }).join('');
}
function openModal(id){editId=id||null;const g=id?data.find(x=>x.id===id):null;document.getElementById('mTitle').textContent=g?'Editar ausencia':'Nueva ausencia';document.getElementById('btnDel').style.display=g?'':'none';document.getElementById('fDia').value=g?g.dia:day;document.getElementById('fHora').value=g?g.hora:1;document.getElementById('fAusente').value=g?g.ausente:'';document.getElementById('fGuardia').value=g?g.guardia:'';document.getElementById('fAula').value=g?g.aula:'';document.getElementById('fFaena').checked=g?g.faena:false;document.getElementById('fObs').value=g?g.obs:'';populateProfesoresGuardia();syncAulaFromProfesor(!g||!g.aula);document.getElementById('overlay').classList.add('open');}
function closeModal(){document.getElementById('overlay').classList.remove('open');}
function bgClose(e){if(e.target.id==='overlay')closeModal();}
function populateProfesoresAusencias(){document.getElementById('profesoresAusencias').innerHTML=ALL_PROFESORES.map(nombre=>`<option value="${nombre}"></option>`).join('');}
function syncAulaFromProfesor(force){
  const dia=+document.getElementById('fDia').value;
  const hora=+document.getElementById('fHora').value;
  const ausente=getProfesorNombreSeleccionado(document.getElementById('fAusente').value);
  const aulaInput=document.getElementById('fAula');
  const aulaReal=ausente?getAulaProfesor(ausente,dia,hora):'';
  if(force||!aulaInput.value.trim()) aulaInput.value=aulaReal;
}
function populateProfesoresGuardia(){
  const dia=document.getElementById('fDia').value;
  const hora=document.getElementById('fHora').value;
  const guardias=getGuardiasDisponibles(dia,hora);
  const guardiaInput=document.getElementById('fGuardia');
  document.getElementById('profesoresGuardia').innerHTML=guardias.map(nombre=>`<option value="${nombre}"></option>`).join('');
  if(guardiaInput.value && !getGuardiaNombreSeleccionado(guardiaInput.value,dia,hora)) guardiaInput.value='';
}
function save(){const dia=+document.getElementById('fDia').value;const hora=+document.getElementById('fHora').value;const ausente=getProfesorNombreSeleccionado(document.getElementById('fAusente').value);const guardia=getGuardiaNombreSeleccionado(document.getElementById('fGuardia').value,dia,hora);const aulaReal=ausente?getAulaProfesor(ausente,dia,hora):'';const entry={dia,hora,ausente,guardia,aula:document.getElementById('fAula').value.trim()||aulaReal,faena:document.getElementById('fFaena').checked,obs:document.getElementById('fObs').value.trim()};if(!entry.ausente){alert('Selecciona un profesor ausente del desplegable.');return;}if(document.getElementById('fGuardia').value.trim()&&!entry.guardia){alert('Selecciona un profesor de guardia valido para esa hora.');return;}document.getElementById('fAusente').value=entry.ausente;document.getElementById('fGuardia').value=entry.guardia;document.getElementById('fAula').value=entry.aula;if(editId){const i=data.findIndex(g=>g.id===editId);data[i]={...entry,id:editId};}else{data.push({...entry,id:nid++});}persist(data);closeModal();if(day!==entry.dia)setDay(entry.dia);else renderTable();document.getElementById('saveTs').textContent='Guardado - '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});}
function del(){if(!confirm('Eliminar este registro?'))return;data=data.filter(g=>g.id!==editId);persist(data);closeModal();renderTable();}
document.getElementById('fDia').addEventListener('change',populateProfesoresGuardia);
document.getElementById('fHora').addEventListener('change',populateProfesoresGuardia);
document.getElementById('fDia').addEventListener('change',()=>syncAulaFromProfesor(true));
document.getElementById('fHora').addEventListener('change',()=>syncAulaFromProfesor(true));
document.getElementById('fAusente').addEventListener('change',()=>syncAulaFromProfesor(true));
document.getElementById('fAusente').addEventListener('input',()=>syncAulaFromProfesor(false));
populateProfesoresAusencias();populateProfesoresGuardia();syncTeacherIdentity();renderPills();renderGuardiaBoard();renderTable();applyTheme(loadTheme());
