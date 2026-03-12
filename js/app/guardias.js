const HORA_MAP={1:{label:'1a',rango:'08:15-09:10'},2:{label:'2a',rango:'09:10-10:05'},3:{label:'3a',rango:'10:05-11:00'},4:{label:'4a',rango:'11:00-11:25'},5:{label:'5a',rango:'11:25-12:20'},6:{label:'6a',rango:'12:20-13:15'},7:{label:'7a',rango:'13:15-14:10'},8:{label:'8a',rango:'14:10-14:25'},9:{label:'9a',rango:'14:25-15:20'}};
const HORAS_PATIO=new Set([4,8,9]);
const DIAS=['Lunes','Martes','Miércoles','Jueves','Viernes'];
const KEY='IES_Alcalans_Guardias';
const KEY_ORDEN='IES_Alcalans_Guardias_OrdenHora';
const KEY_TAREAS='IES_Alcalans_Tareas_Profesorado';
const KEY_TEACHER_USER='IES_Alcalans_Profesorado_Actual';
const KEY_SESSION_OVERRIDES='IES_Alcalans_Sesiones_Profesorado';
const KEY_BIBLIOTECA='IES_Alcalans_Biblioteca_Guardias';
const RAW_PROFESORADO=(window.PROFESORADO_SOURCE&&Array.isArray(window.PROFESORADO_SOURCE.teachers))?window.PROFESORADO_SOURCE.teachers:[];
const GRUPOS_PROFESORADO={};
function decodeMojibake(value){
  if(value==null) return '';
  try{return decodeURIComponent(escape(String(value)));}catch(e){return String(value);}
}
function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function escapeHtml(value){
  return String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function cleanText(value){return decodeMojibake(value).replace(/\s+/g,' ').trim();}
function formatNowParts(){
  const now=new Date();
  return {hours:now.getHours(),minutes:now.getMinutes(),date:now};
}
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
let teacherName='';
let teacherDay=0;
const demo=[];
const LEGACY_DEMO_NAMES=new Set(['Garcia Lopez, Ana','Perez Sanchez, Luis','Torres Vidal, Marta','Romero Diaz, Javier','Navarro Gil, Carmen','Castro Reyes, David','Blanco Munoz, Rosa','Serrano Lara, Miguel']);
function syncTeacherIdentity(){
  const profesor=getProfesor(teacherName);
  const nombre=profesor?.nombre||teacherName||'Profesorado';
  const detalle=profesor?.departamento||'Profesorado';
  const nombreCompleto=profesor?.nombreCompleto||nombre;
  const teacherNameEl=document.getElementById('teacherName');
  const teacherMetaEl=document.getElementById('teacherMeta');
  const teacherBarNameEl=document.getElementById('teacherBarName');
  const teacherUserEl=document.getElementById('teacherUser');
  if(teacherNameEl) teacherNameEl.textContent=nombre;
  if(teacherMetaEl) teacherMetaEl.textContent=`${nombreCompleto} - ${detalle}`;
  if(teacherBarNameEl) teacherBarNameEl.textContent=`${nombre} - ${detalle}`;
  if(teacherUserEl) teacherUserEl.textContent=profesor?`Usuario: ${makeTeacherUsername(nombre)}`:'';
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
function loadTeacherUser(){try{return localStorage.getItem(KEY_TEACHER_USER)||'';}catch(e){return '';}}
function persistTeacherUser(nombre){try{localStorage.setItem(KEY_TEACHER_USER,nombre||'');}catch(e){}}
function loadSessionOverrides(){try{const d=localStorage.getItem(KEY_SESSION_OVERRIDES);return d?JSON.parse(d):{};}catch(e){return {};}}
function persistSessionOverrides(d){try{localStorage.setItem(KEY_SESSION_OVERRIDES,JSON.stringify(d));}catch(e){}}
function persistBibliotecaAssignments(d){try{localStorage.setItem(KEY_BIBLIOTECA,JSON.stringify(d));}catch(e){}}
function shuffle(arr){const copy=[...arr];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
function makeOrdenHora(dia,hora){return shuffle(HORARIO_GUARDIAS[dia]?.[hora]||[]).map((nombre,index)=>({nombre,numero:index+1}));}
function buildInitialOrden(){const orden={};for(let dia=0;dia<5;dia++){orden[dia]={};for(let hora=1;hora<=9;hora++){orden[dia][hora]=makeOrdenHora(dia,hora);}}persistOrden(orden);return orden;}
function buildDefaultBibliotecaAssignments(){
  const biblioteca={};
  for(let dia=0;dia<5;dia++){
    biblioteca[dia]={};
    for(let hora=1;hora<=9;hora++){
      if(HORAS_PATIO.has(hora)) continue;
      biblioteca[dia][hora]=getProfesHora(dia,hora)[0]||'';
    }
  }
  persistBibliotecaAssignments(biblioteca);
  return biblioteca;
}
function ensureBibliotecaAssignments(base){
  const biblioteca=base&&typeof base==='object'?base:{};
  let changed=false;
  for(let dia=0;dia<5;dia++){
    if(!biblioteca[dia]){biblioteca[dia]={};changed=true;}
    for(let hora=1;hora<=9;hora++){
      if(HORAS_PATIO.has(hora)) continue;
      const disponibles=getProfesHora(dia,hora);
      const actual=biblioteca[dia][hora];
      if(!actual||!disponibles.includes(actual)){
        biblioteca[dia][hora]=disponibles[0]||'';
        changed=true;
      }
    }
  }
  if(changed) persistBibliotecaAssignments(biblioteca);
  return biblioteca;
}
function loadBibliotecaAssignments(){
  try{
    const d=localStorage.getItem(KEY_BIBLIOTECA);
    return d?ensureBibliotecaAssignments(JSON.parse(d)):buildDefaultBibliotecaAssignments();
  }catch(e){return buildDefaultBibliotecaAssignments();}
}
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
function getBibliotecaAsignada(dia,hora){return bibliotecaGuardias[dia]?.[hora]||'';}
function getOrdenHoraDisponible(dia,hora,excluidos){
  const excluidosSet=new Set((excluidos||[]).filter(Boolean));
  return getOrdenHora(dia,hora).filter(item=>!excluidosSet.has(item.nombre));
}
function getGuardiaSugerida(dia,hora,turno){
  return getOrdenHoraDisponible(dia,hora,[getBibliotecaAsignada(dia,hora)])[turno-1]?.nombre||'';
}
function getGuardiaApoyo(dia,hora,ocupadas,excluidos){
  return getOrdenHoraDisponible(dia,hora,excluidos)[ocupadas]||null;
}
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
  const sesion=resolveTeacherSession(nombre,dia,hora);
  return sesion?.aula||'';
}
function makeTeacherUsername(nombre){
  return stripDiacritics(nombre).toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');
}
function makeSessionKey(nombre,dia,hora){return `${nombre}|${dia}|${hora}`;}
function getSessionOverride(nombre,dia,hora){return sessionOverrides[makeSessionKey(nombre,dia,hora)]||null;}
function resolveTeacherSession(nombre,dia,hora){
  const base=getHorarioProfesorDia(nombre,dia)?.[hora];
  if(!base) return null;
  const override=getSessionOverride(nombre,dia,hora);
  return override?{...base,...override}:base;
}
function resolveAulaRegistro(row){
  return getAulaProfesor(row.ausente,row.dia,row.hora)||row.aula||'';
}
function normalizeStoredRows(rows){
  if(!Array.isArray(rows)) return [];
  let changed=false;
  const normalized=rows.flatMap(row=>{
    const ausente=getProfesorNombreSeleccionado(row.ausente);
    if(!ausente){
      changed=true;
      return [];
    }
    const guardiaValida=row.guardia?getGuardiaNombreSeleccionado(row.guardia,row.dia,row.hora):'';
    const aulaReal=getAulaProfesor(ausente,row.dia,row.hora);
    const aula=aulaReal||'';
    const normalizedRow={
      ...row,
      ausente,
      guardia:guardiaValida,
      aula
    };
    if(
      row.ausente!==normalizedRow.ausente||
      (row.guardia||'')!==normalizedRow.guardia||
      (row.aula||'')!==normalizedRow.aula
    ){
      changed=true;
    }
    return [normalizedRow];
  });
  if(changed) persist(normalized);
  return normalized;
}
function makeTareaKey(nombre,dia,hora){return `${nombre}|${dia}|${hora}`;}
function getTareaProfesor(nombre,dia,hora){return tareasProfesorado[makeTareaKey(nombre,dia,hora)]||null;}
function resolveFaena(row){
  const tarea=getTareaProfesor(row.ausente,row.dia,row.hora);
  if(tarea) return {faena:!!tarea.dejada,obs:tarea.tarea||''};
  return {faena:row.faena,obs:row.obs};
}
let sessionOverrides=loadSessionOverrides();
let data=normalizeStoredRows(load());
let nid=data.reduce((m,g)=>Math.max(m,g.id),0)+1;
let ordenGuardias=loadOrden();
let bibliotecaGuardias=loadBibliotecaAssignments();
let tareasProfesorado=loadTareas();
(function(){const wd=new Date().getDay();day=(wd>=1&&wd<=5)?wd-1:0;})();
teacherName=getProfesorNombreSeleccionado(loadTeacherUser())||'';
teacherDay=day;
function isReportAvailable(){
  const now=formatNowParts();
  return now.hours>14 || (now.hours===14 && now.minutes>=10);
}
function updateAdminControls(){
  const btnSorteo=document.getElementById('btnSorteo');
  const btnInforme=document.getElementById('btnInforme');
  if(btnSorteo) btnSorteo.style.display=isAdmin?'':'none';
  // if(btnInforme) btnInforme.style.display=(isAdmin&&isReportAvailable())?'':'none';
  if(btnInforme) btnInforme.style.display=isAdmin?'':'none';
}
setInterval(()=>{
  document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  updateAdminControls();
},1000);
document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
function initials(n){return(n||'').split(/[\s,]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';}
function renderPills(){document.getElementById('dNombre').textContent=DIAS[day];document.getElementById('dayPills').innerHTML=DIAS.map((d,i)=>`<button class="day-pill${i===day?' active':''}" onclick="setDay(${i})">${d}</button>`).join('');}
function renderGuardiaBoard(){
  const grid=document.getElementById('guardiaGrid');
  const cards=[];
  let firstMobileCard=true;
  for(let hora=1;hora<=9;hora++){
    if(HORAS_PATIO.has(hora)) continue;
    const ordenHora=getOrdenHora(day,hora);
    const profes=ordenHora.map(item=>item.nombre);
    const biblioteca=getBibliotecaAsignada(day,hora);
    const banos=getGuardiaApoyo(day,hora,0,[biblioteca])?.nombre||'';
    const asignados=new Set(data.filter(g=>g.dia===day&&g.hora===hora&&g.guardia&&g.guardia.trim()).map(g=>g.guardia.trim()));
    const nombres=profes.map(nombre=>`<span class="guardia-mini${asignados.has(nombre)?' guardia-mini-assigned':''}${nombre===biblioteca?' guardia-mini-biblio':''}">${nombre}${nombre===biblioteca?' · Biblioteca':''}</span>`).join('')||'<span class="sin-asignar">Sin profesorado asignado</span>';
    const nombresDecorados=banos?nombres.replace(new RegExp(`<span class="([^"]*)">${escapeRegExp(banos)}</span>`),`<span class="$1 guardia-mini-banos">${banos} · Baños</span>`):nombres;
    cards.push(`<article class="guardia-card${firstMobileCard?' is-open':''}">
      <button class="guardia-card-toggle" type="button" onclick="toggleGuardiaCard(this)">
        <span class="guardia-card-head">
          <span class="guardia-num">${HORA_MAP[hora].label} hora</span>
          <span class="guardia-count">${profes.length} profesores</span>
        </span>
      </button>
      <div class="guardia-card-body">
        <div class="guardia-list">${nombresDecorados}</div>
      </div>
    </article>`);
    firstMobileCard=false;
  }
  grid.innerHTML=cards.join('');
}
function toggleGuardiaCard(button){
  if(window.innerWidth>900) return;
  button.parentElement.classList.toggle('is-open');
}
function setDay(i){day=i;renderPills();renderGuardiaBoard();renderTable();}
function sortearGuardiasDia(){for(let hora=1;hora<=9;hora++){ordenGuardias[day][hora]=makeOrdenHora(day,hora);}persistOrden(ordenGuardias);renderGuardiaBoard();renderTable();}
function buildDailyReportText(){
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const fecha=formatNowParts().date.toLocaleDateString('es-ES');
  const cabecera=[
    `Informe de guardias - ${DIAS[day]}`,
    `Fecha de generación: ${fecha}`,
    ''
  ];
  if(!rows.length) return cabecera.concat(['No hay ausencias registradas para este día.']).join('\n');
  const cuerpo=rows.map(g=>{
    const h=HORA_MAP[g.hora]||{rango:''};
    const cub=g.guardia&&g.guardia.trim();
    const sugerido=cub||getGuardiaSugerida(day,g.hora,1)||'Sin asignar';
    const biblioteca=getBibliotecaAsignada(day,g.hora)||'Sin asignar';
    const banos=getGuardiaApoyo(day,g.hora,0,[biblioteca,sugerido])?.nombre||'Sin asignar';
    const faenaInfo=resolveFaena(g);
    const aula=resolveAulaRegistro(g)||'-';
    return [
      `${h.rango.replace('-', ' - ')}`,
      `Ausente: ${g.ausente}`,
      `Guardia: ${sugerido}`,
      `Biblioteca: ${biblioteca}`,
      `Baños: ${banos}`,
      `Aula: ${aula}`,
      `Faena: ${faenaInfo.faena?'Sí':'No'}`,
      `${faenaInfo.obs?`Tarea: ${faenaInfo.obs}`:'Tarea: -'}`
    ].join('\n');
  }).join('\n\n');
  return cabecera.concat([cuerpo]).join('\n');
}
function buildDailyReportHtml(){
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const fecha=formatNowParts().date.toLocaleDateString('es-ES');
  const cards=rows.length?rows.map(g=>{
    const h=HORA_MAP[g.hora]||{rango:''};
    const cub=g.guardia&&g.guardia.trim();
    const sugerido=cub||getGuardiaSugerida(day,g.hora,1)||'Sin asignar';
    const biblioteca=getBibliotecaAsignada(day,g.hora)||'Sin asignar';
    const banos=getGuardiaApoyo(day,g.hora,0,[biblioteca,sugerido])?.nombre||'Sin asignar';
    const faenaInfo=resolveFaena(g);
    const aula=resolveAulaRegistro(g)||'-';
    return `
      <article class="item">
        <div class="item-head">${escapeHtml(h.rango.replace('-', ' - '))}</div>
        <div><strong>Ausente:</strong> ${escapeHtml(g.ausente)}</div>
        <div><strong>Guardia:</strong> ${escapeHtml(sugerido)}</div>
        <div><strong>Biblioteca:</strong> ${escapeHtml(biblioteca)}</div>
        <div><strong>Baños:</strong> ${escapeHtml(banos)}</div>
        <div><strong>Aula:</strong> ${escapeHtml(aula)}</div>
        <div><strong>Faena:</strong> ${faenaInfo.faena?'Sí':'No'}</div>
        <div><strong>Tarea:</strong> ${escapeHtml(faenaInfo.obs||'-')}</div>
      </article>`;
  }).join(''):`<p class="empty">No hay ausencias registradas para este día.</p>`;
  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Informe de guardias</title>
    <style>
      body{font-family:Arial,sans-serif;color:#1f2937;margin:32px}
      h1{margin:0 0 6px;font-size:28px}
      .meta{margin-bottom:24px;color:#6b7280}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .item{border:1px solid #dbe3ee;border-radius:12px;padding:16px;break-inside:avoid}
      .item-head{font-weight:700;font-size:18px;margin-bottom:10px}
      .item div{margin:4px 0}
      .empty{font-size:16px}
      @media print{body{margin:16px}.grid{gap:12px}}
    </style>
  </head>
  <body>
    <h1>Informe de guardias - ${escapeHtml(DIAS[day])}</h1>
    <div class="meta">Fecha de generación: ${escapeHtml(fecha)}</div>
    <section class="grid">${cards}</section>
  </body>
  </html>`;
}
function printDailyReportPdf(){
  // if(!isAdmin||!isReportAvailable()) return;
  if(!isAdmin) return;
  const ventana=window.open('','_blank','noopener,noreferrer,width=980,height=720');
  if(!ventana) return;
  ventana.document.open();
  ventana.document.write(buildDailyReportHtml());
  ventana.document.close();
  ventana.focus();
  ventana.print();
}
function editBibliotecaAssignment(){
  if(!isAdmin) return;
  const bibliotecaOverlay=document.getElementById('bibliotecaOverlay');
  const bHora=document.getElementById('bHora');
  if(!bibliotecaOverlay||!bHora) return;
  const primeraHoraDisponible=[1,2,3,5,6,7].find(hora=>getBibliotecaAsignada(day,hora))||1;
  bHora.value=String(primeraHoraDisponible);
  updateBibliotecaProfesorOptions();
  bibliotecaOverlay.classList.add('open');
}
function closeBibliotecaModal(){
  const bibliotecaOverlay=document.getElementById('bibliotecaOverlay');
  if(bibliotecaOverlay) bibliotecaOverlay.classList.remove('open');
}
function bgBibliotecaClose(e){if(e.target.id==='bibliotecaOverlay')closeBibliotecaModal();}
function updateBibliotecaProfesorOptions(){
  const bHora=document.getElementById('bHora');
  const bProfesor=document.getElementById('bProfesor');
  if(!bHora||!bProfesor) return;
  const hora=+bHora.value;
  const disponibles=getProfesHora(day,hora);
  const actual=getBibliotecaAsignada(day,hora);
  bProfesor.innerHTML=disponibles.map(nombre=>`<option value="${nombre}">${nombre}</option>`).join('');
  bProfesor.value=disponibles.includes(actual)?actual:(disponibles[0]||'');
}
function saveBibliotecaAssignment(){
  if(!isAdmin) return;
  const bHora=document.getElementById('bHora');
  const bProfesor=document.getElementById('bProfesor');
  if(!bHora||!bProfesor) return;
  const hora=+bHora.value;
  const nombre=bProfesor.value;
  const disponibles=getProfesHora(day,hora);
  if(!nombre||!disponibles.includes(nombre)){alert('Selecciona un profesor válido para esa hora.');return;}
  bibliotecaGuardias[day][hora]=nombre;
  persistBibliotecaAssignments(bibliotecaGuardias);
  closeBibliotecaModal();
  renderGuardiaBoard();
  renderTable();
  document.getElementById('saveTs').textContent=`Biblioteca actualizada - ${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`;
}
function renderTable(){
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const tb=document.getElementById('tbody');
  if(!rows.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No hay ausencias registradas para este dia.</td></tr>';}
  else{
    tb.innerHTML=rows.map(g=>{
      const h=HORA_MAP[g.hora]||{label:g.hora+'a',rango:''};
      const cub=g.guardia&&g.guardia.trim();
      const sugerido=cub||getGuardiaSugerida(day,g.hora,1);
      const biblioteca=getBibliotecaAsignada(day,g.hora);
      const banos=getGuardiaApoyo(day,g.hora,0,[biblioteca,sugerido]);
      const faenaInfo=resolveFaena(g);
      const aula=resolveAulaRegistro(g);
      return `<tr>
        <td><div class="hora-num">${h.rango.replace('-', ' - ')}</div></td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Ausente</span><div class="chip"><div class="avatar av-red">${initials(g.ausente)}</div>${g.ausente}</div></div></div></td>
        <td>${sugerido?`<div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">${cub?'Guardia asignada':'Turno 1'}</span><div class="chip guardia-chip${cub?' guardia-chip-assigned':''}"><div class="avatar av-yellow">${initials(sugerido)}</div>${sugerido}</div></div></div>`:`<span class="sin-asignar">Sin asignar</span>`}</td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Aula</span><span class="aula-tag">${aula||'-'}</span></div></div></td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Faena</span>${faenaInfo.faena?`<div class="faena-box"><span class="badge b-ok">Con tarea</span>${faenaInfo.obs?`<details class="faena-toggle"><summary></summary><div class="faena-text">${faenaInfo.obs}</div></details>`:''}</div>`:`<span class="badge b-nok">Sin tarea</span>`}</div></div></td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="slot-tag">Estado</span>${sugerido?`<span class="badge b-ok">${cub?'Asignada':'Turno 1'}</span>`:'<span class="badge b-nok">Sin cubrir</span>'}</div></div></td>
        <td style="${isAdmin?'':'display:none'}"><button class="btn-edit" onclick="openModal(${g.id})">Editar</button></td>
      </tr>`;
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
function toggleAdmin(){if(!isAdmin){const pw=prompt('Contraseña de jefe de estudios:');if(pw!=='jefe2025'){alert('Contraseña incorrecta.');return;}}isAdmin=!isAdmin;document.getElementById('btnAdmin').classList.toggle('on',isAdmin);document.getElementById('adminBar').classList.toggle('show',isAdmin);document.getElementById('btnSorteo').style.display=isAdmin?'':'none';renderTable();}
function renderTeacherAccessPreview(){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  const preview=document.getElementById('teacherAccessPreview');
  if(!teacherLoginInput||!preview) return;
  const nombre=getProfesorNombreSeleccionado(teacherLoginInput.value);
  if(!nombre){
    preview.textContent='Selecciona tu nombre para entrar en tu panel.';
    return;
  }
  preview.textContent=`EntrarÃ¡s como ${nombre}. Usuario: ${makeTeacherUsername(nombre)}.`;
}
function openTeacherAccess(resetSelection){
  const teacherLoginList=document.getElementById('teacherLoginList');
  const teacherLoginInput=document.getElementById('teacherLoginName');
  const teacherAccessOverlay=document.getElementById('teacherAccessOverlay');
  if(!teacherLoginList||!teacherLoginInput||!teacherAccessOverlay){openTeacherPanelFallback();return;}
  teacherLoginList.innerHTML=ALL_PROFESORES.map(nombre=>`<option value="${nombre}"></option>`).join('');
  teacherLoginInput.value=resetSelection?'':(teacherName||'');
  renderTeacherAccessPreview();
  teacherAccessOverlay.classList.add('open');
  teacherLoginInput.focus();
  teacherLoginInput.select();
}
function closeTeacherAccess(){const teacherAccessOverlay=document.getElementById('teacherAccessOverlay');if(teacherAccessOverlay) teacherAccessOverlay.classList.remove('open');}
function bgTeacherAccessClose(e){if(e.target.id==='teacherAccessOverlay')closeTeacherAccess();}
function changeTeacherUser(){
  closeTeacherPanel();
  openTeacherAccess(true);
}
function loginTeacher(){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  if(!teacherLoginInput) return;
  const nombre=getProfesorNombreSeleccionado(teacherLoginInput.value);
  if(!nombre){alert('Selecciona tu nombre del listado.');return;}
  teacherName=nombre;
  teacherDay=day;
  persistTeacherUser(nombre);
  closeTeacherAccess();
  closeTeacherPanel();
  syncTeacherIdentity();
  document.getElementById('teacherOverlay').classList.add('open');
  document.getElementById('teacherBar').classList.add('show');
  renderTeacherPanel();
}
function openTeacherPanelFallback(){
  teacherName=teacherName||ALL_PROFESORES[0]||'';
  teacherDay=day;
  syncTeacherIdentity();
  document.getElementById('teacherOverlay').classList.add('open');
  document.getElementById('teacherBar').classList.add('show');
  renderTeacherPanel();
}
function openTeacherPanel(){if(!getProfesor(teacherName)){openTeacherAccess();return;}teacherDay=day;syncTeacherIdentity();document.getElementById('teacherOverlay').classList.add('open');document.getElementById('teacherBar').classList.add('show');renderTeacherPanel();}
function closeTeacherPanel(){document.getElementById('teacherOverlay').classList.remove('open');}
function exitTeacherMode(){
  closeTeacherPanel();
  closeTeacherAccess();
  teacherName='';
  persistTeacherUser('');
  document.getElementById('teacherBar').classList.remove('show');
  syncTeacherIdentity();
}
function bgTeacherClose(e){if(e.target.id==='teacherOverlay')closeTeacherPanel();}
function setTeacherDay(dia){teacherDay=dia;renderTeacherPanel();}
function saveTeacherTask(dia,hora,exitAfter){
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  const sesionBase=getHorarioProfesorDia(teacherName,dia)?.[hora];
  if(!sesionBase) return;
  const dejada=document.getElementById(`taskCheck-${dia}-${hora}`).checked;
  const tarea=document.getElementById(`taskText-${dia}-${hora}`).value.trim();
  sessionOverrides[makeSessionKey(teacherName,dia,hora)]={
    materia:document.getElementById(`sessionMateria-${dia}-${hora}`).value.trim()||sesionBase.materia||'',
    grupo:document.getElementById(`sessionGrupo-${dia}-${hora}`).value.trim(),
    detalle:document.getElementById(`sessionDetalle-${dia}-${hora}`).value.trim()||sesionBase.detalle||'',
    aula:document.getElementById(`sessionAula-${dia}-${hora}`).value.trim()
  };
  persistSessionOverrides(sessionOverrides);
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
    const sesion=resolveTeacherSession(teacherName,teacherDay,hora);
    const grupo=sesion.grupo?GRUPOS_PROFESORADO[sesion.grupo]?.nombre||sesion.grupo:'';
    const aula=sesion.aula||'Sin aula';
    const tarea=getTareaProfesor(teacherName,teacherDay,hora);
    const checked=tarea?!!tarea.dejada:false;
    const texto=tarea?.tarea||'';
    return `<div class="teacher-session">
      <div class="teacher-session-head">
        <div>
          <div class="teacher-session-title">${HORA_MAP[hora].label} hora - ${sesion.materia||sesion.tipo}</div>
          <div class="teacher-session-meta">${grupo||sesion.detalle}</div>
        </div>
        <div class="teacher-session-meta">${HORA_MAP[hora].rango} · ${aula}</div>
      </div>
      <div class="teacher-session-edit">
        <div class="teacher-session-grid">
          <div class="fg">
            <label>Materia</label>
            <input id="sessionMateria-${teacherDay}-${hora}" type="text" value="${sesion.materia||''}">
          </div>
          <div class="fg">
            <label>Aula</label>
            <input id="sessionAula-${teacherDay}-${hora}" type="text" value="${sesion.aula||''}">
          </div>
          <div class="fg">
            <label>Grupo</label>
            <input id="sessionGrupo-${teacherDay}-${hora}" type="text" value="${sesion.grupo||''}">
          </div>
          <div class="fg">
            <label>Detalle</label>
            <input id="sessionDetalle-${teacherDay}-${hora}" type="text" value="${sesion.detalle||''}">
          </div>
        </div>
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
function openModal(id){editId=id||null;const g=id?data.find(x=>x.id===id):null;const aula=g?resolveAulaRegistro(g):'';document.getElementById('mTitle').textContent=g?'Editar ausencia':'Nueva ausencia';document.getElementById('btnDel').style.display=g?'':'none';document.getElementById('fDia').value=g?g.dia:day;document.getElementById('fHora').value=g?g.hora:1;document.getElementById('fAusente').value=g?g.ausente:'';document.getElementById('fGuardia').value=g?g.guardia:'';document.getElementById('fAula').value=aula;document.getElementById('fFaena').checked=g?g.faena:false;document.getElementById('fObs').value=g?g.obs:'';populateProfesoresGuardia();syncAulaFromProfesor(!g||!aula);document.getElementById('overlay').classList.add('open');}
function closeModal(){document.getElementById('overlay').classList.remove('open');}
function bgClose(e){if(e.target.id==='overlay')closeModal();}
function populateProfesoresAusencias(){
  const profesoresAusencias=document.getElementById('profesoresAusencias');
  if(!profesoresAusencias) return;
  profesoresAusencias.innerHTML=ALL_PROFESORES.map(nombre=>`<option value="${nombre}"></option>`).join('');
}
function syncAulaFromProfesor(force){
  const dia=+document.getElementById('fDia').value;
  const hora=+document.getElementById('fHora').value;
  const ausente=getProfesorNombreSeleccionado(document.getElementById('fAusente').value);
  const aulaInput=document.getElementById('fAula');
  const aulaReal=ausente?getAulaProfesor(ausente,dia,hora):'';
  if(force||!aulaInput.value.trim()) aulaInput.value=aulaReal;
}
function populateProfesoresGuardia(){
  const fDia=document.getElementById('fDia');
  const fHora=document.getElementById('fHora');
  const profesoresGuardia=document.getElementById('profesoresGuardia');
  const guardiaInput=document.getElementById('fGuardia');
  if(!fDia||!fHora||!profesoresGuardia||!guardiaInput) return;
  const dia=fDia.value;
  const hora=fHora.value;
  const guardias=getGuardiasDisponibles(dia,hora);
  profesoresGuardia.innerHTML=guardias.map(nombre=>`<option value="${nombre}"></option>`).join('');
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
const teacherLoginInput=document.getElementById('teacherLoginName');
if(teacherLoginInput){
  teacherLoginInput.addEventListener('input',renderTeacherAccessPreview);
  teacherLoginInput.addEventListener('change',renderTeacherAccessPreview);
}
const bibliotecaHoraInput=document.getElementById('bHora');
if(bibliotecaHoraInput){
  bibliotecaHoraInput.addEventListener('change',updateBibliotecaProfesorOptions);
}
function safeInitStep(fn,name){
  try{fn();}
  catch(error){
    console.error(`Init step failed: ${name}`,error);
  }
}
const originalToggleAdmin=toggleAdmin;
toggleAdmin=function(){
  originalToggleAdmin();
  updateAdminControls();
};
safeInitStep(populateProfesoresAusencias,'populateProfesoresAusencias');
safeInitStep(populateProfesoresGuardia,'populateProfesoresGuardia');
safeInitStep(renderPills,'renderPills');
safeInitStep(renderGuardiaBoard,'renderGuardiaBoard');
safeInitStep(renderTable,'renderTable');
safeInitStep(syncTeacherIdentity,'syncTeacherIdentity');
safeInitStep(updateAdminControls,'updateAdminControls');
