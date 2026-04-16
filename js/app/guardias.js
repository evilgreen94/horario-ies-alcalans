const HORA_MAP={1:{label:'1a',rango:'08:15-09:10'},2:{label:'2a',rango:'09:10-10:05'},3:{label:'3a',rango:'10:05-11:00'},4:{label:'4a',rango:'11:00-11:25'},5:{label:'5a',rango:'11:25-12:20'},6:{label:'6a',rango:'12:20-13:15'},7:{label:'7a',rango:'13:15-14:10'},8:{label:'8a',rango:'14:10-14:25'},9:{label:'9a',rango:'14:25-15:20'}};
const HORAS_PATIO=new Set([4,8,9]);
const DIAS=['Lunes','Martes','Mi\u00e9rcoles','Jueves','Viernes'];
const KEY='IES_Alcalans_Guardias';
const KEY_ORDEN='IES_Alcalans_Guardias_OrdenHora';
const KEY_TAREAS='IES_Alcalans_Tareas_Profesorado';
const KEY_TEACHER_USER='IES_Alcalans_Profesorado_Actual';
const KEY_TEACHER_RECENTS='IES_Alcalans_Profesorado_Recientes';
const KEY_TEACHER_SUBSTITUTIONS='IES_Alcalans_Profesorado_Sustituciones';
const KEY_TEACHER_PRACTICAS_GUARDIAS='IES_Alcalans_Profesorado_Practicas_Guardias';
const KEY_TEACHER_PRACTICAS_GUARDIAS_TRAMOS='IES_Alcalans_Profesorado_Practicas_Guardias_Tramos';
const KEY_TEACHER_FUTURE_ABSENCES='IES_Alcalans_Profesorado_Faltas_Futuras';
const KEY_SESSION_OVERRIDES='IES_Alcalans_Sesiones_Profesorado';
const KEY_HISTORIAL='IES_Alcalans_Historial_Cambios';
const KEY_WEEK='IES_Alcalans_School_Week_Key';
const KEY_ANNUAL_DATASET='IES_Alcalans_Annual_Dataset_Id';
const RAW_PROFESORADO=(window.PROFESORADO_SOURCE&&Array.isArray(window.PROFESORADO_SOURCE.teachers))?window.PROFESORADO_SOURCE.teachers:[];
const ANNUAL_DATASET_ID=cleanText(window.PROFESORADO_SOURCE?.datasetId||'legacy');
const GRUPOS_PROFESORADO={};
const storage=window.GuardiasStorage;
function escapeHtml(value){
  return String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function cleanText(value){return String(value ?? '').replace(/\s+/g,' ').trim();}
function formatNowParts(){
  const now=new Date();
  return {hours:now.getHours(),minutes:now.getMinutes(),date:now};
}
function formatDateKey(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
function getCurrentSchoolWeekKey(){
  const now=formatNowParts().date;
  const day=now.getDay();
  const mondayOffset=day===0?-6:1-day;
  const monday=new Date(now);
  monday.setHours(0,0,0,0);
  monday.setDate(monday.getDate()+mondayOffset);
  return formatDateKey(monday);
}
function getSchoolWeekDateFromKey(weekKey){
  const date=new Date(`${weekKey}T00:00:00`);
  return Number.isNaN(date.getTime())?null:date;
}
function getSchoolWeekKeyFromOffset(offset){
  const monday=getSchoolWeekDateFromKey(getCurrentSchoolWeekKey());
  if(!monday) return getCurrentSchoolWeekKey();
  monday.setDate(monday.getDate()+(offset*7));
  return formatDateKey(monday);
}
function formatWeekRangeLabel(weekKey,offset){
  const monday=getSchoolWeekDateFromKey(weekKey);
  if(!monday) return 'Semana lectiva';
  const friday=new Date(monday);
  friday.setDate(monday.getDate()+4);
  const range=`${monday.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})} - ${friday.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})}`;
  if(offset===0) return `Semana actual · ${range}`;
  if(offset===1) return `Semana siguiente · ${range}`;
  if(offset===-1) return `Semana anterior · ${range}`;
  return `${offset>0?`+${offset}`:offset} semanas · ${range}`;
}
function stripDiacritics(value){return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
const DIA_INDEX={'lunes':0,'martes':1,'miercoles':2,'mi\u00e9rcoles':2,'jueves':3,'viernes':4};
const HORA_INDEX=Object.fromEntries(Object.entries(HORA_MAP).map(([hora,info])=>[info.rango,+hora]));
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
  return {tipo:'clase',materia:partes[0]||texto||'Sesi?n',grupo:'',detalle:texto||'Sesi?n',aula:aula||''};
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
    const gruposProfesor=new Set();
    (teacher.horario||[]).forEach(item=>{
      const dia=resolveDiaIndex(item.dia);
      const hora=normalizaHora(item.franja);
      if(dia==null||hora==null) return;
      if(!horario[dia]) horario[dia]={};
      const sesion=parseSesion(item);
      horario[dia][hora]=sesion;
      if(sesion.grupo){
        gruposProfesor.add(sesion.grupo);
        if(!GRUPOS_PROFESORADO[sesion.grupo]){
          GRUPOS_PROFESORADO[sesion.grupo]={nombre:sesion.grupo};
        }
      }
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
    profesoresBase[nombre]={nombre,nombreCompleto:nombre,departamento:'Profesorado',grupos:[...gruposProfesor],horario};
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
let isSuperAdmin=false;
let teacherName='';
let teacherDay=0;
let teacherAccessMatches=[];
let teacherAccessActiveIndex=-1;
let teacherRecents=[];
let absenceMatches=[];
let absenceActiveIndex=-1;
let teacherSubstitutions={};
let teacherPracticasGuardias=[];
let teacherPracticasGuardiasTramos=[];
let practicasGuardiasFilter='';
let practicasGuardiasConfigTeacher='';
let substitutionFilter='';
let teacherDutyFocusTimer=null;
let teacherFutureAbsences=[];
let futureAbsenceAdminStatusFilter='all';
let futureAbsenceAdminTeacherFilter='';
let weekOffset=0;
let teacherWeekOffset=0;
const demo=[];
const APP_URL_PARAMS=new URLSearchParams(window.location.search||'');
const SUPERADMIN_ENABLED=APP_URL_PARAMS.get('panel')==='superadmin';
let superAdminRoutePrompted=false;
document.body.classList.toggle('superadmin-route',SUPERADMIN_ENABLED);
const LEGACY_DEMO_NAMES=new Set(['Garcia Lopez, Ana','Perez Sanchez, Luis','Torres Vidal, Marta','Romero Diaz, Javier','Navarro Gil, Carmen','Castro Reyes, David','Blanco Munoz, Rosa','Serrano Lara, Miguel']);
function syncTeacherIdentity(){
  const profesor=getProfesor(teacherName);
  const nombre=getVisibleTeacherName(profesor?.nombre||teacherName||'')||'Profesorado';
  const detalle=profesor?.departamento||'Profesorado';
  const nombreCompleto=getVisibleTeacherName(profesor?.nombreCompleto||teacherName||nombre)||nombre;
  const substitutionMeta=getTeacherDisplayMeta(teacherName);
  const teacherNameEl=document.getElementById('teacherName');
  const teacherMetaEl=document.getElementById('teacherMeta');
  const teacherBarNameEl=document.getElementById('teacherBarName');
  const teacherUserEl=document.getElementById('teacherUser');
  if(teacherNameEl) teacherNameEl.textContent=nombre;
  if(teacherMetaEl) teacherMetaEl.textContent=`${nombreCompleto} - ${detalle}${substitutionMeta?` - ${substitutionMeta}`:''}`;
  if(teacherBarNameEl) teacherBarNameEl.textContent=`${nombre} - ${detalle}`;
  if(teacherUserEl) teacherUserEl.textContent=profesor?`Usuario: ${makeTeacherUsername(nombre)}`:'';
}
function load(){
  try{
    const d=storage.readText(KEY,'');
    if(!d) return demo;
    const parsed=JSON.parse(d);
    if(Array.isArray(parsed)&&parsed.length&&parsed.every(item=>LEGACY_DEMO_NAMES.has(item.ausente))){
      storage.writeText(KEY,'');
      return demo;
    }
    return parsed;
  }catch(e){return demo;}
}
function persist(d){storage.writeJson(KEY,d);}
function persistOrden(d){storage.writeJson(KEY_ORDEN,d);}
function loadTareas(){return storage.readJson(KEY_TAREAS,{});}
function persistTareas(d){storage.writeJson(KEY_TAREAS,d);}
function loadTeacherUser(){return storage.readText(KEY_TEACHER_USER,'');}
function persistTeacherUser(nombre){storage.writeText(KEY_TEACHER_USER,nombre||'');}
function loadTeacherRecents(){return storage.readJson(KEY_TEACHER_RECENTS,[]).filter(nombre=>getProfesor(nombre));}
function persistTeacherRecents(list){storage.writeJson(KEY_TEACHER_RECENTS,(list||[]).filter(nombre=>getProfesor(nombre)).slice(0,6));}
function loadTeacherSubstitutions(){
  const rows=storage.readJson(KEY_TEACHER_SUBSTITUTIONS,[]);
  if(Array.isArray(rows)){
    return Object.fromEntries(rows.map(row=>[row.profesor,row.sustituto]).filter(([profesor,sustituto])=>getProfesor(profesor)&&cleanText(sustituto)));
  }
  return Object.entries(rows||{}).reduce((acc,[profesor,sustituto])=>{
    if(getProfesor(profesor)&&cleanText(sustituto)) acc[profesor]=cleanText(sustituto);
    return acc;
  },{});
}
function persistTeacherSubstitutions(map){
  storage.writeJson(KEY_TEACHER_SUBSTITUTIONS,Object.entries(map||{}).map(([profesor,sustituto])=>({profesor,sustituto})));
}
function loadTeacherPracticasGuardias(){
  return [...new Set(storage.readJson(KEY_TEACHER_PRACTICAS_GUARDIAS,[]).map(row=>cleanText(typeof row==='string'?row:row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
}
function persistTeacherPracticasGuardias(list){
  storage.writeJson(KEY_TEACHER_PRACTICAS_GUARDIAS,[...new Set((list||[]).map(cleanText).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es')).map(profesor=>({profesor})));
}
function normalizePracticasGuardiasSlot(row){
  const profesor=cleanText(row?.profesor);
  const dia=Number(row?.dia);
  const hora=Number(row?.hora);
  if(!getProfesor(profesor)||!Number.isInteger(dia)||dia<0||dia>4||!Number.isInteger(hora)||hora<1||hora>9||HORAS_PATIO.has(hora)) return null;
  return {profesor,dia,hora};
}
function loadTeacherPracticasGuardiasTramos(){
  const rows=storage.readJson(KEY_TEACHER_PRACTICAS_GUARDIAS_TRAMOS,[]);
  return [...new Map((Array.isArray(rows)?rows:[]).map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[`${row.profesor}|${row.dia}|${row.hora}`,row])).values()]
    .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
}
function persistTeacherPracticasGuardiasTramos(rows){
  const normalized=[...new Map((rows||[]).map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[`${row.profesor}|${row.dia}|${row.hora}`,row])).values()]
    .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
  storage.writeJson(KEY_TEACHER_PRACTICAS_GUARDIAS_TRAMOS,normalized);
}
function loadTeacherFutureAbsences(){return storage.readJson(KEY_TEACHER_FUTURE_ABSENCES,[]);}
function persistTeacherFutureAbsences(rows){storage.writeJson(KEY_TEACHER_FUTURE_ABSENCES,Array.isArray(rows)?rows:[]);}
function loadSessionOverrides(){return storage.readJson(KEY_SESSION_OVERRIDES,{});}
function persistSessionOverrides(d){storage.writeJson(KEY_SESSION_OVERRIDES,d);}
function loadHistorial(){return storage.readJson(KEY_HISTORIAL,[]);}
function persistHistorial(d){storage.writeJson(KEY_HISTORIAL,d);}
function loadWeekKey(){return storage.readText(KEY_WEEK,'');}
function persistWeekKey(value){storage.writeText(KEY_WEEK,value||'');}
function loadAnnualDatasetId(){return storage.readText(KEY_ANNUAL_DATASET,'');}
function persistAnnualDatasetId(value){storage.writeText(KEY_ANNUAL_DATASET,value||'');}
function resetAnnualLocalStateIfNeeded(){
  const storedDatasetId=loadAnnualDatasetId();
  if(storedDatasetId===ANNUAL_DATASET_ID){
    return false;
  }
  [
    KEY,
    KEY_ORDEN,
    KEY_TAREAS,
    KEY_TEACHER_USER,
    KEY_TEACHER_RECENTS,
    KEY_TEACHER_SUBSTITUTIONS,
    KEY_TEACHER_FUTURE_ABSENCES,
    KEY_SESSION_OVERRIDES,
    KEY_HISTORIAL,
    KEY_WEEK
  ].forEach(key=>storage.writeText(key,''));
  persistAnnualDatasetId(ANNUAL_DATASET_ID);
  return true;
}
function resetWeeklyLocalStateIfNeeded(){
  const currentWeekKey=getCurrentSchoolWeekKey();
  const storedWeekKey=loadWeekKey();
  if(storedWeekKey===currentWeekKey){
    return false;
  }
  storage.writeText(KEY,'');
  storage.writeText(KEY_ORDEN,'');
  storage.writeText(KEY_TAREAS,'');
  storage.writeText(KEY_HISTORIAL,'');
  storage.writeText(KEY_SESSION_OVERRIDES,'');
  persistWeekKey(currentWeekKey);
  return true;
}
function cloneJson(value){return JSON.parse(JSON.stringify(value));}
function computeNextId(rows){return (rows||[]).reduce((m,g)=>Math.max(m,g.id||0),0)+1;}
function formatHoraLabel(hora){
  const info=HORA_MAP[hora];
  return info?`${info.label} hora (${info.rango})`:`Hora ${hora}`;
}
function formatDiaHora(dia,hora){
  return `${DIAS[dia]||'Dia'} \u00b7 ${formatHoraLabel(hora)}`;
}
function formatHistoryAbsence(row){
  if(!row) return '';
  const partes=[formatDiaHora(row.dia,row.hora),getVisibleTeacherName(row.ausente)];
  const aula=resolveAulaRegistro(row)||row.aula||'';
  if(aula) partes.push(aula);
  if(row.guardia) partes.push(`Guardia: ${getVisibleTeacherName(row.guardia)}`);
  return partes.join(' ? ');
}
function buildUndoState(targetDay){
  return {
    data:cloneJson(data),
    day:typeof targetDay==='number'?targetDay:day
  };
}
function addHistoryEntry(title,detail,type,options){
  historialCambios.unshift({
    id:`hist-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    title,
    detail,
    type:type||'other',
    undoState:options?.undoState||null,
    actor:'Jefatura',
    ts:new Date().toISOString()
  });
  historialCambios=historialCambios.slice(0,200);
  persistHistorial(historialCambios);
  syncAdminState();
}
function formatHistoryTimestamp(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES',{
    day:'2-digit',
    month:'2-digit',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit'
  });
}
function getLastUndoableHistoryEntry(){
  return historialCambios.find(entry=>entry?.undoState&&entry.type!=='undo')||null;
}
function shuffle(arr){const copy=[...arr];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
function makeOrdenHora(dia,hora){return shuffle(getProfesHora(dia,hora)).map((nombre,index)=>({nombre,numero:index+1}));}
function buildInitialOrden(){const orden={};for(let dia=0;dia<5;dia++){orden[dia]={};for(let hora=1;hora<=9;hora++){orden[dia][hora]=makeOrdenHora(dia,hora);}}persistOrden(orden);return orden;}
function ensureOrden(base){
  const orden={...base};
  for(let dia=0;dia<5;dia++){
    if(!orden[dia]) orden[dia]={};
    for(let hora=1;hora<=9;hora++){
      const esperados=getProfesHora(dia,hora);
      const actuales=Array.isArray(orden[dia][hora])?orden[dia][hora]:[];
      const nombres=actuales.map(item=>item.nombre);
      const invalido=actuales.length!==esperados.length||esperados.some(nombre=>!nombres.includes(nombre));
      if(invalido) orden[dia][hora]=makeOrdenHora(dia,hora);
    }
  }
  persistOrden(orden);
  return orden;
}
function loadOrden(){try{const d=storage.readJson(KEY_ORDEN,null);return d?ensureOrden(d):buildInitialOrden();}catch(e){return buildInitialOrden();}}
function getOrdenHora(dia,hora){return (ordenGuardias[dia]?.[hora]||[]).slice().sort((a,b)=>a.numero-b.numero);}
function refreshOrdenGuardias(){ordenGuardias=ensureOrden(ordenGuardias);}
function hashSeed(value){
  let hash=2166136261;
  const text=String(value||'');
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return hash>>>0;
}
function seededShuffle(list,seed){
  const copy=[...(list||[])];
  let state=hashSeed(seed)||1;
  for(let i=copy.length-1;i>0;i--){
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const j=state%(i+1);
    [copy[i],copy[j]]=[copy[j],copy[i]];
  }
  return copy;
}
function getSpecialAssignments(dia,hora,rowsSource=data){
  const orderedNames=seededShuffle(getOrdenHora(dia,hora).map(item=>item.nombre),`${new Date().toISOString().slice(0,10)}|${dia}|${hora}`);
  const biblioteca=orderedNames[0]||'';
  const banos=orderedNames.find(nombre=>nombre!==biblioteca)||'';
  const specialCount=(biblioteca?1:0)+(banos?1:0);
  const uncoveredIfReserved=(rowsSource||[]).filter(row=>row.dia===dia&&row.hora===hora).length>Math.max(orderedNames.length-specialCount,0);
  return {
    biblioteca: uncoveredIfReserved?'':biblioteca,
    banos: uncoveredIfReserved?'':banos
  };
}
function getBibliotecaAsignada(dia,hora,rowsSource=data){return getSpecialAssignments(dia,hora,rowsSource).biblioteca||'';}
function getBanosAsignado(dia,hora,rowsSource=data){return getSpecialAssignments(dia,hora,rowsSource).banos||'';}
function buildGuardiaCoverageCounter(options={}){
  const {excludeDia=null,excludeHora=null,dayOnly=null}=options;
  const rowsSource=Array.isArray(options.rowsSource)?options.rowsSource:data;
  const counter={};
  rowsSource.forEach(row=>{
    if(excludeDia===row.dia&&excludeHora===row.hora) return;
    if(dayOnly!=null&&row.dia!==dayOnly) return;
    const nombre=cleanText(row.guardia);
    if(!nombre) return;
    counter[nombre]=(counter[nombre]||0)+1;
  });
  return counter;
}
function getBalancedGuardiaOrder(dia,hora,options={}){
  const {
    excludeNames=[],
    excludeDia=dia,
    excludeHora=hora,
    dayOnly=dia
  }=options;
  const blocked=new Set((excludeNames||[]).filter(Boolean));
  const rowsSource=Array.isArray(options.rowsSource)?options.rowsSource:data;
  const totalCounter=buildGuardiaCoverageCounter({excludeDia,excludeHora,rowsSource});
  const dayCounter=buildGuardiaCoverageCounter({excludeDia,excludeHora,dayOnly,rowsSource});
  const baseOrder=getOrdenHora(dia,hora)
    .map((item,index)=>({...item,index}))
    .filter(item=>!blocked.has(item.nombre));
  return baseOrder.sort((a,b)=>
    (totalCounter[a.nombre]||0)-(totalCounter[b.nombre]||0)||
    (dayCounter[a.nombre]||0)-(dayCounter[b.nombre]||0)||
    a.numero-b.numero||
    a.index-b.index
  );
}
function getOrdenHoraDisponible(dia,hora,excluidos){
  const excluidosSet=new Set((excluidos||[]).filter(Boolean));
  return getBalancedGuardiaOrder(dia,hora,{excludeNames:[...excluidosSet]}).map(item=>({nombre:item.nombre,numero:item.numero}));
}
function assignGuardiasForRows(rowsSource){
  const rows=(rowsSource||[]).map(row=>({...row}));
  for(let diaIndex=0;diaIndex<5;diaIndex++){
    for(let hora=1;hora<=9;hora++){
      if(HORAS_PATIO.has(hora)) continue;
      reassignGuardiasForSlot(diaIndex,hora,rows);
    }
  }
  return rows;
}
function reassignGuardiasForSlot(dia,hora,rowsSource=data){
  const rows=rowsSource.filter(row=>row.dia===dia&&row.hora===hora).sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
  if(!rows.length) return;
  const ausentes=new Set(rows.map(row=>row.ausente).filter(Boolean));
  const biblioteca=getBibliotecaAsignada(dia,hora,rowsSource);
  const banos=getBanosAsignado(dia,hora,rowsSource);
  const totalCounter=buildGuardiaCoverageCounter({excludeDia:dia,excludeHora:hora,rowsSource});
  const dayCounter=buildGuardiaCoverageCounter({excludeDia:dia,excludeHora:hora,dayOnly:dia,rowsSource});
  const orderedNames=getBalancedGuardiaOrder(dia,hora,{excludeNames:[...ausentes],rowsSource}).map(item=>item.nombre);
  const principales=orderedNames.filter(nombre=>nombre!==biblioteca&&nombre!==banos);
  const assigned=new Set();
  function scoreNombre(nombre){
    return [(totalCounter[nombre]||0),(dayCounter[nombre]||0)];
  }
  function assignNombre(nombre){
    assigned.add(nombre);
    totalCounter[nombre]=(totalCounter[nombre]||0)+1;
    dayCounter[nombre]=(dayCounter[nombre]||0)+1;
  }
  rows.forEach(row=>{
    const siguientePrincipal=principales
      .filter(nombre=>!assigned.has(nombre))
      .sort((a,b)=>{
        const [aTotal,aDay]=scoreNombre(a);
        const [bTotal,bDay]=scoreNombre(b);
        return aTotal-bTotal||aDay-bDay||principales.indexOf(a)-principales.indexOf(b);
      })[0];
    if(siguientePrincipal){
      row.guardia=siguientePrincipal;
      assignNombre(siguientePrincipal);
      return;
    }
    const especiales=[banos,biblioteca]
      .filter(nombre=>nombre&&orderedNames.includes(nombre)&&!assigned.has(nombre))
      .sort((a,b)=>{
        const [aTotal,aDay]=scoreNombre(a);
        const [bTotal,bDay]=scoreNombre(b);
        return aTotal-bTotal||aDay-bDay;
      });
    if(especiales[0]){
      row.guardia=especiales[0];
      assignNombre(especiales[0]);
      return;
    }
    row.guardia='';
  });
}
function reassignGuardiasForDayHours(dia,horas){
  [...new Set((horas||[]).map(Number).filter(Number.isInteger))].forEach(hora=>reassignGuardiasForSlot(dia,hora));
}
function reassignAllGuardias(){
  for(let dia=0;dia<5;dia++){
    for(let hora=1;hora<=9;hora++){
      if(HORAS_PATIO.has(hora)) continue;
      reassignGuardiasForSlot(dia,hora);
    }
  }
}
function getGuardiaSugerida(dia,hora,turno,rowsSource=data){
  return getBalancedGuardiaOrder(dia,hora,{excludeNames:[getBibliotecaAsignada(dia,hora,rowsSource),getBanosAsignado(dia,hora,rowsSource)],rowsSource})[turno-1]?.nombre||'';
}
function isPracticasSessionEligible(sesion){
  if(!sesion||sesion.tipo==='guardia') return false;
  const texto=[sesion.materia,sesion.grupo,sesion.detalle,sesion.aula].map(cleanText).filter(Boolean).join(' ? ');
  return /(\bCFB\b|\bCFM\b|\bGM\b|\bGS\b|\bFPB\b|INTERMODULAR|FCT|PRACTIC)/i.test(texto);
}
function makePracticasGuardiasSlotKey(profesor,dia,hora){return `${profesor}|${dia}|${hora}`;}
function getTeacherPracticasGuardiasSet(){
  return new Set(teacherPracticasGuardias);
}
function getTeacherPracticasGuardiasTramosSet(){
  return new Set(teacherPracticasGuardiasTramos.map(row=>makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora)));
}
function isTeacherPracticasGuardiasEnabled(nombre){
  return getTeacherPracticasGuardiasSet().has(nombre);
}
function isTeacherPracticasGuardiasSlotEnabled(nombre,dia,hora){
  return getTeacherPracticasGuardiasTramosSet().has(makePracticasGuardiasSlotKey(nombre,dia,hora));
}
function getPracticasGuardiaTeachersForSlot(dia,hora){
  const enabled=getTeacherPracticasGuardiasSet();
  const manuales=teacherPracticasGuardiasTramos
    .filter(row=>row.dia===dia&&row.hora===hora)
    .map(row=>row.profesor);
  if(!enabled.size&&!manuales.length) return [];
  return [...new Set([
      ...teacherPracticasGuardias
        .filter(nombre=>{
          const sesion=resolveTeacherSession(nombre,dia,hora);
          return isPracticasSessionEligible(sesion);
        }),
      ...manuales
    ])]
    .sort((a,b)=>a.localeCompare(b,'es'));
}
function getProfesHora(dia,hora){
  return [...new Set([...(HORARIO_GUARDIAS[dia]?.[hora]||[]),...getPracticasGuardiaTeachersForSlot(dia,hora)])].sort((a,b)=>a.localeCompare(b,'es'));
}
function getProfesor(nombre){return PROFESORES_BASE[nombre]||null;}
function getVisibleTeacherName(nombre){return cleanText(teacherSubstitutions[nombre])||nombre||'';}
function getTeacherSearchNames(nombre){
  const visible=getVisibleTeacherName(nombre);
  return [...new Set([nombre,visible].map(cleanText).filter(Boolean))];
}
function getTeacherUsernames(nombre){
  return [...new Set(getTeacherSearchNames(nombre).map(makeTeacherUsername).filter(Boolean))];
}
function getTeacherDisplayMeta(nombre){
  const visible=getVisibleTeacherName(nombre);
  if(!visible||visible===nombre) return '';
  return `Sustituye a ${nombre}`;
}
function validateTeacherSubstitutionName(nombre,rawValue){
  const value=cleanText(rawValue);
  if(!value) return 'Indica un nombre para el sustituto.';
  const normalizedValue=normalizeTeacherSearch(value);
  const normalizedOwner=normalizeTeacherSearch(nombre);
  if(normalizedValue===normalizedOwner) return 'El sustituto no puede tener exactamente el mismo nombre que el titular.';

  const canonicalConflict=ALL_PROFESORES.find(otherNombre=>
    otherNombre!==nombre&&normalizeTeacherSearch(otherNombre)===normalizedValue
  );
  if(canonicalConflict){
    return `Ese nombre coincide con el profesor real ${canonicalConflict}.`;
  }

  const aliasConflict=Object.entries(teacherSubstitutions).find(([otherNombre,sustituto])=>
    otherNombre!==nombre&&normalizeTeacherSearch(sustituto)===normalizedValue
  );
  if(aliasConflict){
    return `Ese nombre ya estÃ¡ asignado como sustituto de ${aliasConflict[0]}.`;
  }

  return '';
}
function getGuardiasDisponibles(dia,hora){return getProfesHora(+dia,+hora);}
function getProfesorNombreSeleccionado(valor){
  const texto=(valor||'').trim();
  if(!texto) return '';
  const normalized=normalizeTeacherSearch(texto);
  return ALL_PROFESORES.find(nombre=>
    getTeacherSearchNames(nombre).some(candidate=>normalizeTeacherSearch(candidate)===normalized)||
    getTeacherUsernames(nombre).includes(normalized)
  )||'';
}
function normalizeTeacherSearch(value){return stripDiacritics(value).toLowerCase().replace(/\s+/g,' ').trim();}
function getTeacherSearchTokens(value){return normalizeTeacherSearch(value).split(/[\s._-]+/).filter(Boolean);}
function teacherMatchesQuery(nombre,query){
  const tokens=getTeacherSearchTokens(query);
  if(!tokens.length) return true;
  const candidates=[...getTeacherSearchNames(nombre).map(normalizeTeacherSearch),...getTeacherUsernames(nombre)];
  return tokens.every(token=>candidates.some(candidate=>candidate.includes(token)));
}
function getTeacherSummaryForDay(nombre,targetDay){
  const horas=getHorasLectivasProfesorDia(nombre,targetDay);
  const nextHour=horas.find(hora=>hora>=1)||null;
  return {horas,nextHour};
}
function getTeacherAccessMatches(value){
  const query=normalizeTeacherSearch(value);
  const recents=teacherRecents.filter(nombre=>teacherMatchesQuery(nombre,query));
  const recentSet=new Set(recents);
  const ranked=ALL_PROFESORES
    .filter(nombre=>!recentSet.has(nombre))
    .map(nombre=>{
      const normalizedNames=getTeacherSearchNames(nombre).map(normalizeTeacherSearch);
      const usernames=getTeacherUsernames(nombre);
      const tokens=getTeacherSearchTokens(query);
      if(query && !tokens.every(token=>[...normalizedNames,...usernames].some(candidate=>candidate.includes(token)))) return null;
      let score=0;
      if(!query) score=10;
      if(normalizedNames.includes(query)||usernames.includes(query)) score+=300;
      if(query&&normalizedNames.some(candidate=>candidate.startsWith(query))) score+=180;
      if(query&&usernames.some(candidate=>candidate.startsWith(query))) score+=160;
      if(tokens.length&&tokens.every(token=>[...normalizedNames,...usernames].some(candidate=>candidate.startsWith(token)))) score+=120;
      if(query){
        const firstToken=tokens[0]||query;
        const pos=Math.min(...[...normalizedNames,...usernames].map(candidate=>candidate.indexOf(firstToken)===-1?999:candidate.indexOf(firstToken)));
        score+=Math.max(0,60-pos);
      }
      score+=Math.min(getTeacherSummaryForDay(nombre,day).horas.length,6);
      return {nombre,score};
    })
    .filter(Boolean)
    .sort((a,b)=>b.score-a.score||a.nombre.localeCompare(b.nombre,'es'))
    .map(item=>item.nombre);
  return [...recents,...ranked].slice(0,10);
}
function getAbsenceMatches(value){
  const query=normalizeTeacherSearch(value);
  return ALL_PROFESORES
    .map(nombre=>{
      const normalizedNames=getTeacherSearchNames(nombre).map(normalizeTeacherSearch);
      const usernames=getTeacherUsernames(nombre);
      const tokens=getTeacherSearchTokens(query);
      if(query && !tokens.every(token=>[...normalizedNames,...usernames].some(candidate=>candidate.includes(token)))) return null;
      let score=0;
      if(!query) score=10;
      if(normalizedNames.includes(query)||usernames.includes(query)) score+=300;
      if(query&&normalizedNames.some(candidate=>candidate.startsWith(query))) score+=180;
      if(query&&usernames.some(candidate=>candidate.startsWith(query))) score+=140;
      if(tokens.length&&tokens.every(token=>[...normalizedNames,...usernames].some(candidate=>candidate.startsWith(token)))) score+=100;
      return {nombre,score};
    })
    .filter(Boolean)
    .sort((a,b)=>b.score-a.score||a.nombre.localeCompare(b.nombre,'es'))
    .map(item=>item.nombre)
    .slice(0,8);
}
function getGuardiaNombreSeleccionado(valor,dia,hora){
  const texto=(valor||'').trim();
  if(!texto) return '';
  const normalized=normalizeTeacherSearch(texto);
  return getGuardiasDisponibles(dia,hora).find(nombre=>
    getTeacherSearchNames(nombre).some(candidate=>normalizeTeacherSearch(candidate)===normalized)||
    getTeacherUsernames(nombre).includes(normalized)
  )||'';
}
function getHorarioProfesorDia(nombre,dia){return getProfesor(nombre)?.horario?.[dia]||{};}
function getHorasLectivasProfesorDia(nombre,dia){
  const sesiones=getHorarioProfesorDia(nombre,dia);
  return Object.keys(sesiones)
    .map(Number)
    .filter(hora=>!HORAS_PATIO.has(hora)&&sesiones[hora]&&sesiones[hora].tipo!=='guardia')
    .sort((a,b)=>a-b);
}
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
function getAbsenceTaskState(nombre,dia,hora,fallbackFaena,fallbackObs){
  const fallbackText=cleanText(fallbackObs);
  const fallbackHasTask=!!fallbackFaena||!!fallbackText;
  const tarea=getTareaProfesor(nombre,dia,hora);
  if(tarea){
    const tareaText=cleanText(tarea.tarea);
    const tareaHasTask=!!tarea.dejada||!!tareaText;
    if(tareaHasTask||!fallbackHasTask){
      return {
        faena:tareaHasTask,
        obs:tareaText
      };
    }
  }
  return {
    faena:fallbackHasTask,
    obs:fallbackText
  };
}
function resolveFaena(row){
  return getAbsenceTaskState(row.ausente,row.dia,row.hora,row.faena,row.obs);
}
function getTeacherAssignedAbsences(nombre,dia,hora){
  return data
    .filter(row=>row.dia===dia&&row.hora===hora&&row.guardia===nombre)
    .map(row=>({
      ...row,
      faenaInfo:resolveFaena(row),
      aula:resolveAulaRegistro(row)
    }));
}
resetAnnualLocalStateIfNeeded();
resetWeeklyLocalStateIfNeeded();
let sessionOverrides=loadSessionOverrides();
let data=normalizeStoredRows(load());
let nid=data.reduce((m,g)=>Math.max(m,g.id),0)+1;
let ordenGuardias=loadOrden();
let tareasProfesorado=loadTareas();
let historialCambios=loadHistorial();
let historyFilter='all';
let dialogResolver=null;
let backendSyncInFlight=false;
let backendHydrated=false;
let backendPollingInFlight=false;
let futureAbsenceSyncFlags=new Set();
let superAdminEvents=[];
let lastBackendSnapshot='';
let superAdminOpsInfo=null;
let superAdminOpsLoading=false;
let superAdminOpsLastFetchAt='';
const superAdminStatus={
  lastAdminSyncAt:'',
  lastTeacherSyncAt:'',
  lastPollAt:'',
  lastHydrateAt:'',
  lastError:'',
  lastErrorAt:''
};
const BACKEND_POLL_INTERVAL_MS=10000;
const SUPERADMIN_INFO_REFRESH_MS=30000;
(function(){const wd=new Date().getDay();day=(wd>=1&&wd<=5)?wd-1:0;})();
teacherRecents=loadTeacherRecents();
teacherSubstitutions=loadTeacherSubstitutions();
teacherPracticasGuardias=loadTeacherPracticasGuardias();
teacherPracticasGuardiasTramos=loadTeacherPracticasGuardiasTramos();
refreshOrdenGuardias();
teacherFutureAbsences=loadTeacherFutureAbsences();
teacherName=getProfesorNombreSeleccionado(loadTeacherUser())||'';
teacherDay=day;
function serializeBibliotecaAssignments(){
  const rows=[];
  for(let dia=0;dia<5;dia++){
    for(let hora=1;hora<=9;hora++){
      if(HORAS_PATIO.has(hora)) continue;
      const profesor=getBibliotecaAsignada(dia,hora)||'';
      if(profesor) rows.push({dia,hora,profesor});
    }
  }
  return rows;
}
function serializeTeacherTasks(){
  return Object.entries(tareasProfesorado).map(([id,row])=>({
    id,
    profesor:row.profesor,
    dia:row.dia,
    hora:row.hora,
    dejada:!!row.dejada,
    tarea:row.tarea||''
  }));
}
function serializeSessionOverrides(){
  return Object.entries(sessionOverrides).map(([id,row])=>({
    id,
    profesor:id.split('|')[0]||'',
    dia:Number(id.split('|')[1]||0),
    hora:Number(id.split('|')[2]||0),
    materia:row.materia||'',
    grupo:row.grupo||'',
    detalle:row.detalle||'',
    aula:row.aula||''
  }));
}
function serializeTeacherSubstitutions(){
  return Object.entries(teacherSubstitutions).map(([profesor,sustituto])=>({profesor,sustituto}));
}
function serializeTeacherPracticasGuardias(){
  return teacherPracticasGuardias.map(profesor=>({profesor}));
}
function serializeTeacherPracticasGuardiasTramos(){
  return teacherPracticasGuardiasTramos.map(row=>({profesor:row.profesor,dia:row.dia,hora:row.hora}));
}
function formatStatusTimestamp(value){
  if(!value) return 'Sin registro';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return 'Sin registro';
  return date.toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function formatBytes(value){
  const bytes=Number(value)||0;
  if(bytes<=0) return '0 B';
  const units=['B','KB','MB','GB'];
  let size=bytes;
  let index=0;
  while(size>=1024&&index<units.length-1){
    size/=1024;
    index++;
  }
  const digits=size>=100||index===0?0:1;
  return `${size.toFixed(digits)} ${units[index]}`;
}
function formatDurationShort(ms){
  const value=Math.max(0,Number(ms)||0);
  if(value<1000) return `${Math.round(value)} ms`;
  const seconds=value/1000;
  if(seconds<60) return `${seconds.toFixed(seconds>=10?0:1)} s`;
  const minutes=Math.floor(seconds/60);
  const remain=Math.round(seconds%60);
  return `${minutes} min ${remain}s`;
}
function formatUptime(seconds){
  const total=Math.max(0,Number(seconds)||0);
  const days=Math.floor(total/86400);
  const hours=Math.floor((total%86400)/3600);
  const minutes=Math.floor((total%3600)/60);
  if(days>0) return `${days} d ${hours} h`;
  if(hours>0) return `${hours} h ${minutes} min`;
  return `${minutes||0} min`;
}
function getSuperAdminHealthMeta(){
  if(!storage.hasBackend()){
    return {label:'Sin backend',className:'superadmin-pill-warn',note:'La web funciona sin servidor accesible o solo con cache local.'};
  }
  if(!superAdminOpsInfo){
    return {label:superAdminOpsLoading?'Consultando':'Sin datos',className:'superadmin-pill-warn',note:'Todavía no hay lectura operativa del servidor.'};
  }
  if(superAdminOpsInfo.restoreInProgress){
    return {label:'Restaurando',className:'superadmin-pill-warn',note:'Hay una restauración activa. Conviene evitar cambios hasta que termine.'};
  }
  const minute=superAdminOpsInfo.server?.telemetry?.recent?.lastMinute||{};
  const fiveMinutes=superAdminOpsInfo.server?.telemetry?.recent?.lastFiveMinutes||{};
  const activeRequests=Number(superAdminOpsInfo.server?.telemetry?.activeRequests)||0;
  if(superAdminStatus.lastError||Number(minute.errors||0)>=3){
    return {label:'Con incidencias',className:'superadmin-pill-error',note:'Se han detectado errores recientes o fallos de sincronización.'};
  }
  if(activeRequests>=12||Number(minute.count||0)>=180||Number(fiveMinutes.avgDurationMs||0)>=1200){
    return {label:'Carga alta',className:'superadmin-pill-error',note:'El servidor esta bastante exigido. Mejor no lanzar tareas pesadas ahora.'};
  }
  if(activeRequests>=6||Number(minute.count||0)>=90||Number(fiveMinutes.avgDurationMs||0)>=700){
    return {label:'Vigilando',className:'superadmin-pill-warn',note:'La carga es aceptable, pero ya conviene seguirla de cerca.'};
  }
  return {label:'Estable',className:'superadmin-pill-ok',note:'Servidor sano y carga controlada.'};
}
function buildSuperAdminOpsItems(){
  const items=[];
  const health=getSuperAdminHealthMeta();
  items.push({title:`Salud general: ${health.label}`,note:health.note});
  if(superAdminOpsInfo){
    items.push({
      title:`Base de datos: ${formatBytes(superAdminOpsInfo.dbSizeBytes)}`,
      note:`${superAdminOpsInfo.dbFileName||'SQLite'} · ${superAdminOpsInfo.counts?.guardias||0} guardias · ${superAdminOpsInfo.counts?.tareasProfesorado||0} tareas.`
    });
    const minute=superAdminOpsInfo.server?.telemetry?.recent?.lastMinute||{};
    items.push({
      title:`Actividad reciente: ${minute.count||0} peticiones/min`,
      note:`Errores en el último minuto: ${minute.errors||0}. Activas ahora: ${superAdminOpsInfo.server?.telemetry?.activeRequests||0}.`
    });
    items.push({
      title:`Última lectura: ${formatStatusTimestamp(superAdminOpsLastFetchAt)}`,
      note:`Uptime ${formatUptime(superAdminOpsInfo.server?.uptimeSec||0)} · Node ${superAdminOpsInfo.server?.nodeVersion||'-'} · ${superAdminOpsInfo.server?.platform||'-'}.`
    });
  }else if(storage.hasBackend()){
    items.push({
      title:'Telemetría pendiente',
      note:'Pulsa "Actualizar estado" para cargar datos del servidor y revisar la carga real.'
    });
  }
  if(lastBackendSnapshot&&lastBackendSnapshot!==makeBackendSnapshot()){
    items.push({
      title:'Cambios locales pendientes',
      note:'Hay diferencias entre el estado local y el backend. Conviene revisarlas antes de hacer backup o restauración.'
    });
  }
  return items.slice(0,4);
}
async function refreshSuperAdminOps(force){
  if(!storage.hasBackend()||!isSuperAdmin) return;
  if(superAdminOpsLoading&&!force) return;
  const lastFetchMs=superAdminOpsLastFetchAt?new Date(superAdminOpsLastFetchAt).getTime():0;
  if(!force&&lastFetchMs&&(Date.now()-lastFetchMs)<SUPERADMIN_INFO_REFRESH_MS) return;
  superAdminOpsLoading=true;
  renderSuperAdminMonitor();
  try{
    superAdminOpsInfo=await storage.fetchSuperAdminInfo();
    superAdminOpsLastFetchAt=new Date().toISOString();
    if(!superAdminStatus.lastError){
      setSuperAdminHint(`Estado del servidor actualizado a las ${new Date(superAdminOpsLastFetchAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}.`,'info');
    }
  }catch(error){
    console.warn('Superadmin info fetch failed',error);
    setSuperAdminHint('No se pudo consultar el estado del servidor. Revisa sesión o conectividad.','error');
  }finally{
    superAdminOpsLoading=false;
    renderSuperAdminMonitor();
  }
}
function pushSuperAdminEvent(type,message){
  superAdminEvents.unshift({
    id:`monitor-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    type,
    message,
    ts:new Date().toISOString()
  });
  superAdminEvents=superAdminEvents.slice(0,8);
  renderSuperAdminMonitor();
}
function setSuperAdminError(message){
  superAdminStatus.lastError=message||'';
  superAdminStatus.lastErrorAt=message?new Date().toISOString():'';
  renderSuperAdminMonitor();
}
function clearSuperAdminError(){
  superAdminStatus.lastError='';
  superAdminStatus.lastErrorAt='';
  renderSuperAdminMonitor();
}
function renderSuperAdminMonitor(){
  const grid=document.getElementById('superAdminMonitorGrid');
  const log=document.getElementById('superAdminMonitorLog');
  const opsList=document.getElementById('superAdminOpsList');
  if(!grid||!log) return;
  const backendConnected=storage.hasBackend();
  const syncPending=futureAbsenceSyncFlags.size;
  const syncState=backendConnected?(backendSyncInFlight||backendPollingInFlight?'Sincronizando':(superAdminStatus.lastError?'Con incidencias':'En seguimiento')):'Sin backend';
  const syncClass=!backendConnected?'superadmin-pill-warn':(superAdminStatus.lastError?'superadmin-pill-error':(backendSyncInFlight||backendPollingInFlight?'superadmin-pill-warn':'superadmin-pill-ok'));
  const driftState=lastBackendSnapshot&&lastBackendSnapshot!==makeBackendSnapshot()?'Cambios locales pendientes':'Sin diferencias detectadas';
  const driftClass=lastBackendSnapshot&&lastBackendSnapshot!==makeBackendSnapshot()?'superadmin-pill-warn':'superadmin-pill-ok';
  const health=getSuperAdminHealthMeta();
  const telemetry=superAdminOpsInfo?.server?.telemetry||{};
  const minute=telemetry.recent?.lastMinute||{};
  const fiveMinutes=telemetry.recent?.lastFiveMinutes||{};
  const appStateSummary=(superAdminOpsInfo?.counts?.appState||[]).map(item=>item.key).join(', ');
  const cards=[
    {
      k:'Salud',
      v:`<span class="superadmin-pill ${health.className}">${health.label}</span>`,
      note:health.note
    },
    {
      k:'Backend',
      v:backendConnected?'Disponible':'No configurado',
      note:`Modo ${storage.storageMode||'hybrid'}${superAdminOpsLoading?' · Actualizando...':''}`
    },
    {
      k:'Sincronización',
      v:`<span class="superadmin-pill ${syncClass}">${syncState}</span>`,
      note:`Admin: ${formatStatusTimestamp(superAdminStatus.lastAdminSyncAt)}`
    },
    {
      k:'Profesorado',
      v:formatStatusTimestamp(superAdminStatus.lastTeacherSyncAt),
      note:`Hydrate: ${formatStatusTimestamp(superAdminStatus.lastHydrateAt)}`
    },
    {
      k:'Carga reciente',
      v:`${minute.count||0} req/min`,
      note:`Activas ${telemetry.activeRequests||0} · pico ${telemetry.peakConcurrentRequests||0}`
    },
    {
      k:'Respuesta',
      v:fiveMinutes.avgDurationMs?formatDurationShort(fiveMinutes.avgDurationMs):'Sin datos',
      note:`P95 ${fiveMinutes.p95DurationMs?formatDurationShort(fiveMinutes.p95DurationMs):'Sin datos'} · errores 5 min: ${fiveMinutes.errors||0}`
    },
    {
      k:'Base SQLite',
      v:superAdminOpsInfo?formatBytes(superAdminOpsInfo.dbSizeBytes):'Sin datos',
      note:superAdminOpsInfo?`${superAdminOpsInfo.dbFileName||'guardias.sqlite'} · ${superAdminOpsInfo.counts?.guardias||0} guardias`:'Sin lectura del servidor'
    },
    {
      k:'Servidor',
      v:superAdminOpsInfo?formatUptime(superAdminOpsInfo.server?.uptimeSec||0):'Sin datos',
      note:superAdminOpsInfo?`${formatBytes(superAdminOpsInfo.server?.memory?.rss||0)} en memoria RSS · ${superAdminOpsInfo.server?.cpuCount||0} CPU`:'Sin lectura del servidor'
    },
    {
      k:'Mantenimiento',
      v:superAdminOpsInfo?.restoreInProgress?`<span class="superadmin-pill superadmin-pill-warn">Restaurando</span>`:`<span class="superadmin-pill superadmin-pill-ok">Operativo</span>`,
      note:superAdminOpsInfo?`Estado app: ${appStateSummary||'sin extras'} · poll ${formatStatusTimestamp(superAdminStatus.lastPollAt)}`:`${syncPending} avisos futuros pendientes de backend`
    },
    {
      k:'Diferencias',
      v:`<span class="superadmin-pill ${driftClass}">${driftState}</span>`,
      note:superAdminStatus.lastError?`Último error: ${superAdminStatus.lastError}`:'Sin errores recientes'
    }
  ];
  grid.innerHTML=cards.map(card=>`<article class="superadmin-monitor-card"><div class="superadmin-monitor-k">${card.k}</div><div class="superadmin-monitor-v">${card.v}</div><div class="superadmin-monitor-note">${card.note}</div></article>`).join('');
  if(opsList){
    opsList.innerHTML=buildSuperAdminOpsItems()
      .map(item=>`<article class="superadmin-ops-item"><div class="superadmin-ops-title">${escapeHtml(item.title)}</div><div class="superadmin-ops-note">${escapeHtml(item.note)}</div></article>`)
      .join('');
  }
  log.innerHTML=superAdminEvents.length
    ?superAdminEvents.map(item=>`<div class="superadmin-monitor-log-item"><strong>${escapeHtml(item.type)}</strong> · ${escapeHtml(formatStatusTimestamp(item.ts))}<br>${escapeHtml(item.message)}</div>`).join('')
    :'<div class="superadmin-monitor-log-item">Sin eventos de sincronización registrados todavía.</div>';
}
async function syncAdminState(){
  if(!storage.hasBackend()||backendSyncInFlight) return;
  backendSyncInFlight=true;
  renderSuperAdminMonitor();
  try{
    await Promise.all([
      storage.replaceGuardias(data),
      storage.replaceBiblioteca(serializeBibliotecaAssignments()),
      storage.replaceHistorial(historialCambios),
      storage.replaceTeacherSubstitutions(serializeTeacherSubstitutions()),
      storage.replaceTeacherPracticasGuardias(serializeTeacherPracticasGuardias()),
      storage.replaceTeacherPracticasGuardiasTramos(serializeTeacherPracticasGuardiasTramos())
    ]);
    lastBackendSnapshot=makeBackendSnapshot();
    superAdminStatus.lastAdminSyncAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Admin sync','Guardias, biblioteca, historial, sustituciones y ajustes de practicas sincronizados con backend.');
  }catch(error){
    console.warn('Backend sync failed',error);
    setSuperAdminError('Fallo en la sincronización de Jefatura.');
    pushSuperAdminEvent('Error sync',`Jefatura: ${String(error?.message||error)}`);
  }finally{
    backendSyncInFlight=false;
    renderSuperAdminMonitor();
  }
}
async function syncTeacherState(){
  if(!storage.hasBackend()||backendSyncInFlight) return;
  backendSyncInFlight=true;
  renderSuperAdminMonitor();
  try{
    await Promise.all([
      storage.replaceTareasProfesorado(serializeTeacherTasks()),
      storage.replaceSessionOverrides(serializeSessionOverrides())
    ]);
    lastBackendSnapshot=makeBackendSnapshot();
    superAdminStatus.lastTeacherSyncAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Teacher sync','Tareas y ajustes de profesorado sincronizados con backend.');
  }catch(error){
    console.warn('Teacher backend sync failed',error);
    setSuperAdminError('Fallo en la sincronización de profesorado.');
    pushSuperAdminEvent('Error sync',`Profesorado: ${String(error?.message||error)}`);
  }finally{
    backendSyncInFlight=false;
    renderSuperAdminMonitor();
  }
}
async function syncTeacherTaskEntry(overrideKey,overrideRow,tareaKey,tareaRow){
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  try{
    const requests=[];
    if(overrideRow){
      requests.push(storage.saveSessionOverrideEntry({
        id:overrideKey,
        profesor:teacherName,
        dia:overrideRow.dia,
        hora:overrideRow.hora,
        materia:overrideRow.materia||'',
        grupo:overrideRow.grupo||'',
        detalle:overrideRow.detalle||'',
        aula:overrideRow.aula||''
      }));
    }else{
      requests.push(storage.deleteSessionOverrideEntry(overrideKey));
    }
    if(tareaRow){
      requests.push(storage.saveTeacherTaskEntry({
        id:tareaKey,
        profesor:teacherName,
        dia:tareaRow.dia,
        hora:tareaRow.hora,
        dejada:!!tareaRow.dejada,
        tarea:tareaRow.tarea||''
      }));
    }else{
      requests.push(storage.deleteTeacherTaskEntry(tareaKey));
    }
    await Promise.all(requests);
    superAdminStatus.lastTeacherSyncAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Teacher sync','Tarea y ajustes de profesorado sincronizados con backend.');
    return {ok:true};
  }catch(error){
    console.warn('Teacher task backend sync failed',error);
    setSuperAdminError('Fallo en la sincronización de tarea de profesorado.');
    pushSuperAdminEvent('Error sync',`Profesorado: ${String(error?.message||error)}`);
    return {ok:true,localOnly:true,syncError:true};
  }
}
async function hydrateTeacherSubstitutions(){
  if(!storage.hasBackend()) return;
  try{
    const rows=await storage.fetchTeacherSubstitutions();
    if(!Array.isArray(rows)) return;
    teacherSubstitutions=Object.fromEntries(rows.map(row=>[row.profesor,row.sustituto]).filter(([profesor,sustituto])=>getProfesor(profesor)&&cleanText(sustituto)));
    persistTeacherSubstitutions(teacherSubstitutions);
    syncTeacherIdentity();
    renderGuardiaBoard();
    renderTable();
    renderSubstitutionList();
    if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
    superAdminStatus.lastHydrateAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Hydrate','Sustituciones de profesorado recargadas desde backend.');
  }catch(error){
    console.warn('Teacher substitutions hydration failed',error);
    setSuperAdminError('Fallo al hidratar sustituciones.');
  }
}
async function hydrateTeacherFutureAbsences(){
  if(!storage.hasBackend()) return;
  try{
    const rows=await storage.fetchTeacherFutureAbsences();
    if(!Array.isArray(rows)) return;
    teacherFutureAbsences=rows.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.profesor||'').localeCompare(String(b.profesor||''),'es'));
    persistTeacherFutureAbsences(teacherFutureAbsences);
    futureAbsenceSyncFlags.clear();
    renderFutureAbsenceAdminList();
    renderTeacherFutureAbsenceOwnList();
    superAdminStatus.lastHydrateAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Hydrate','Faltas futuras recargadas desde backend.');
  }catch(error){
    console.warn('Teacher future absences hydration failed',error);
    setSuperAdminError('Fallo al hidratar faltas futuras.');
  }
}
async function hydrateTeacherPracticasGuardias(){
  if(!storage.hasBackend()||!isAdmin) return;
  try{
    const [rows,tramos]=await Promise.all([
      storage.fetchTeacherPracticasGuardias(),
      storage.fetchTeacherPracticasGuardiasTramos()
    ]);
    if(!Array.isArray(rows)||!Array.isArray(tramos)) return;
    teacherPracticasGuardias=[...new Set(rows.map(row=>cleanText(row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
    teacherPracticasGuardiasTramos=[...new Map(tramos.map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora),row])).values()]
      .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
    persistTeacherPracticasGuardias(teacherPracticasGuardias);
    persistTeacherPracticasGuardiasTramos(teacherPracticasGuardiasTramos);
    refreshOrdenGuardias();
    reassignAllGuardias();
    persist(data);
    renderGuardiaBoard();
    renderTable();
    renderPracticasGuardiasList();
    renderPracticasGuardiasConfig();
  }catch(error){
    console.warn('Teacher practicas guardias hydration failed',error);
  }
}
function sortTeacherFutureAbsences(rows){
  return (rows||[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.profesor||'').localeCompare(String(b.profesor||''),'es'));
}
function normalizeTeacherFutureAbsence(row){
  return {
    id:cleanText(row?.id),
    profesor:cleanText(row?.profesor),
    date:cleanText(row?.date),
    note:cleanText(row?.note),
    hours:Array.isArray(row?.hours)?[...new Set(row.hours.map(Number).filter(Number.isInteger).filter(hora=>!HORAS_PATIO.has(hora)))].sort((a,b)=>a-b):[],
    status:cleanText(row?.status||'pending')||'pending',
    reviewedAt:cleanText(row?.reviewedAt),
    reviewerNote:cleanText(row?.reviewerNote),
    appliedAt:cleanText(row?.appliedAt),
    createdAt:cleanText(row?.createdAt)||new Date().toISOString()
  };
}
function getFutureAbsenceStatusLabel(status){
  return status==='approved'?'Validada':status==='rejected'?'Rechazada':status==='applied'?'Aplicada':'Pendiente';
}
function getFutureAbsenceStatusClass(status){
  return status==='approved'?'future-absence-status-approved':status==='rejected'?'future-absence-status-rejected':status==='applied'?'future-absence-status-applied':'future-absence-status-pending';
}
function getCurrentDateIso(){
  return new Date().toISOString().slice(0,10);
}
function isCurrentWeekOffset(offset){
  return Number(offset||0)===0;
}
function isTeacherCurrentWeek(){
  return isCurrentWeekOffset(teacherWeekOffset);
}
function getSelectedWeekKey(){
  return getSchoolWeekKeyFromOffset(weekOffset);
}
function getTeacherSelectedWeekKey(){
  return getSchoolWeekKeyFromOffset(teacherWeekOffset);
}
function getSchoolWeekInfoFromDate(dateValue){
  const base=new Date(`${dateValue}T00:00:00`);
  if(Number.isNaN(base.getTime())) return null;
  const dayOfWeek=base.getDay();
  const mondayOffset=dayOfWeek===0?-6:1-dayOfWeek;
  const monday=new Date(base);
  monday.setDate(base.getDate()+mondayOffset);
  monday.setHours(0,0,0,0);
  return {
    weekKey:formatDateKey(monday),
    dayIndex:dayOfWeek>=1&&dayOfWeek<=5?dayOfWeek-1:null
  };
}
function getFutureAbsenceHoursForEntry(item){
  if(Array.isArray(item?.hours)&&item.hours.length){
    return [...new Set(item.hours.map(Number).filter(Number.isInteger).filter(hora=>!HORAS_PATIO.has(hora)))].sort((a,b)=>a-b);
  }
  const weekInfo=getSchoolWeekInfoFromDate(item?.date);
  if(!weekInfo||weekInfo.dayIndex==null) return [];
  return getHorasLectivasProfesorDia(item.profesor,weekInfo.dayIndex);
}
function isFutureAbsenceProjected(item){
  const status=cleanText(item?.status||'pending')||'pending';
  return status==='approved'||status==='applied';
}
function findOverlappingFutureAbsence(entry,options={}){
  const excludeId=cleanText(options.excludeId);
  const profesor=cleanText(entry?.profesor);
  const date=cleanText(entry?.date);
  const hours=new Set(getFutureAbsenceHoursForEntry(entry));
  if(!profesor||!date||!hours.size) return null;
  return teacherFutureAbsences.find(item=>{
    if(cleanText(item?.id)===excludeId) return false;
    if(cleanText(item?.status)==='rejected') return false;
    if(cleanText(item?.profesor)!==profesor||cleanText(item?.date)!==date) return false;
    return getFutureAbsenceHoursForEntry(item).some(hora=>hours.has(hora));
  })||null;
}
function formatHourListLabel(hours){
  const rows=(hours||[]).map(hora=>formatHoraLabel(hora));
  return rows.length?rows.join(', '):'Sin horas lectivas';
}
function buildProjectedRowsForWeek(weekKey){
  const rows=[];
  const seen=new Set();
  teacherFutureAbsences
    .filter(item=>isFutureAbsenceProjected(item))
    .forEach(item=>{
      const weekInfo=getSchoolWeekInfoFromDate(item.date);
      if(!weekInfo||weekInfo.weekKey!==weekKey||weekInfo.dayIndex==null) return;
      const horasLectivas=getFutureAbsenceHoursForEntry(item);
      horasLectivas.forEach(hora=>{
        const key=`${item.id}|${hora}`;
        if(seen.has(key)) return;
        seen.add(key);
        rows.push({
          id:key,
          dia:weekInfo.dayIndex,
          hora,
          ausente:item.profesor,
          guardia:'',
          aula:getAulaProfesor(item.profesor,weekInfo.dayIndex,hora)||'',
          faena:false,
          obs:'',
          futurePlanned:true,
          futureStatus:item.status,
          futureDate:item.date,
          futureSourceId:item.id,
          reviewerNote:item.reviewerNote||''
        });
      });
    });
  return assignGuardiasForRows(rows);
}
function getRowsForWeekOffset(offset){
  return isCurrentWeekOffset(offset)?data:buildProjectedRowsForWeek(getSchoolWeekKeyFromOffset(offset));
}
function getSelectedRowsForDay(targetDay){
  return getRowsForWeekOffset(weekOffset).filter(row=>row.dia===targetDay).sort((a,b)=>a.hora-b.hora);
}
function getTeacherWeekRowsForDay(targetDay){
  return getRowsForWeekOffset(teacherWeekOffset).filter(row=>row.dia===targetDay).sort((a,b)=>a.hora-b.hora);
}
async function updateTeacherFutureAbsenceEntry(entry){
  const normalized=normalizeTeacherFutureAbsence(entry);
  teacherFutureAbsences=sortTeacherFutureAbsences([normalized,...teacherFutureAbsences.filter(item=>item.id!==normalized.id)]);
  persistTeacherFutureAbsences(teacherFutureAbsences);
  renderFutureAbsenceAdminList();
  renderTeacherFutureAbsenceOwnList();
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  try{
    const result=await storage.updateTeacherFutureAbsence(normalized.id,normalized);
    const saved=normalizeTeacherFutureAbsence(result?.entry||normalized);
    futureAbsenceSyncFlags.delete(`upsert:${saved.id}`);
    teacherFutureAbsences=sortTeacherFutureAbsences([saved,...teacherFutureAbsences.filter(item=>item.id!==saved.id)]);
    persistTeacherFutureAbsences(teacherFutureAbsences);
    renderFutureAbsenceAdminList();
    renderTeacherFutureAbsenceOwnList();
    clearSuperAdminError();
    pushSuperAdminEvent('Future absence',`Aviso futuro actualizado para ${saved.profesor}.`);
    return result||{ok:true,entry:saved};
  }catch(error){
    console.warn('Teacher future absence update backend sync failed; keeping local state',error);
    futureAbsenceSyncFlags.add(`upsert:${normalized.id}`);
    setSuperAdminError('Hay avisos futuros pendientes de sincronizar.');
    pushSuperAdminEvent('Pendiente backend',`Aviso futuro de ${normalized.profesor} guardado solo en local.`);
    renderSuperAdminMonitor();
    return {ok:true,localOnly:true,syncError:true,entry:normalized};
  }
}
async function applyApprovedFutureAbsencesForCurrentWeek(){
  const currentWeekKey=getCurrentSchoolWeekKey();
  const approvedRows=teacherFutureAbsences.filter(item=>item.status==='approved'&&!item.appliedAt);
  if(!approvedRows.length) return false;
  let stateChanged=false;
  let approvalsChanged=false;
  const appliedSummaries=[];
  const undoState=buildUndoState(day);
  for(const item of approvedRows){
    const weekInfo=getSchoolWeekInfoFromDate(item.date);
    if(!weekInfo||weekInfo.weekKey!==currentWeekKey||weekInfo.dayIndex==null) continue;
    const horasLectivas=getFutureAbsenceHoursForEntry(item);
    if(!horasLectivas.length) continue;
    horasLectivas.forEach(horaItem=>{
      if(data.some(row=>row.dia===weekInfo.dayIndex&&row.hora===horaItem&&row.ausente===item.profesor)) return;
      data.push({dia:weekInfo.dayIndex,hora:horaItem,ausente:item.profesor,guardia:'',aula:getAulaProfesor(item.profesor,weekInfo.dayIndex,horaItem)||'',faena:false,obs:'',id:nid++});
      stateChanged=true;
    });
    appliedSummaries.push(`${getVisibleTeacherName(item.profesor)||item.profesor} Â· ${item.date} Â· ${horasLectivas.map(formatHoraLabel).join(', ')}`);
    item.status='applied';
    item.appliedAt=new Date().toISOString();
    approvalsChanged=true;
  }
  if(stateChanged){
    data=normalizeStoredRows(data);
    reassignAllGuardias();
    persist(data);
    renderGuardiaBoard();
    renderTable();
  }
  if(appliedSummaries.length){
    historialCambios.unshift({
      id:`hist-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      title:appliedSummaries.length===1?'Falta futura aplicada':'Faltas futuras aplicadas',
      detail:appliedSummaries.join(' ? '),
      type:'create',
      undoState,
      actor:'Jefatura',
      ts:new Date().toISOString()
    });
    historialCambios=historialCambios.slice(0,200);
    persistHistorial(historialCambios);
    renderHistoryList();
  }
  if(approvalsChanged){
    persistTeacherFutureAbsences(teacherFutureAbsences);
    renderFutureAbsenceAdminList();
    renderTeacherFutureAbsenceOwnList();
    if(storage.hasBackend()&&isAdmin){
      await Promise.allSettled(teacherFutureAbsences.filter(item=>item.appliedAt).map(item=>storage.updateTeacherFutureAbsence(item.id,normalizeTeacherFutureAbsence(item))));
    }
  }
  if(appliedSummaries.length){
    await syncAdminState();
  }
  return stateChanged||approvalsChanged;
}
async function createTeacherFutureAbsenceEntry(entry){
  const normalized=normalizeTeacherFutureAbsence(entry);
  teacherFutureAbsences=sortTeacherFutureAbsences([normalized,...teacherFutureAbsences.filter(item=>item.id!==normalized.id)]);
  persistTeacherFutureAbsences(teacherFutureAbsences);
  renderFutureAbsenceAdminList();
  renderTeacherFutureAbsenceOwnList();
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  try{
    const result=await storage.createTeacherFutureAbsence(normalized);
    const saved=normalizeTeacherFutureAbsence(result?.entry||normalized);
    futureAbsenceSyncFlags.delete(`upsert:${saved.id}`);
    teacherFutureAbsences=sortTeacherFutureAbsences([saved,...teacherFutureAbsences.filter(item=>item.id!==saved.id)]);
    persistTeacherFutureAbsences(teacherFutureAbsences);
    renderFutureAbsenceAdminList();
    renderTeacherFutureAbsenceOwnList();
    clearSuperAdminError();
    pushSuperAdminEvent('Future absence',`Nuevo aviso futuro registrado para ${saved.profesor}.`);
    return result||{ok:true,entry:saved};
  }catch(error){
    console.warn('Teacher future absence create backend sync failed; keeping local state',error);
    futureAbsenceSyncFlags.add(`upsert:${normalized.id}`);
    setSuperAdminError('Hay avisos futuros pendientes de sincronizar.');
    pushSuperAdminEvent('Pendiente backend',`Nuevo aviso futuro de ${normalized.profesor} guardado solo en local.`);
    renderSuperAdminMonitor();
    return {ok:true,localOnly:true,syncError:true,entry:normalized};
  }
}
async function deleteTeacherFutureAbsenceEntry(id){
  teacherFutureAbsences=teacherFutureAbsences.filter(item=>item.id!==id);
  persistTeacherFutureAbsences(teacherFutureAbsences);
  renderFutureAbsenceAdminList();
  renderTeacherFutureAbsenceOwnList();
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  try{
    futureAbsenceSyncFlags.delete(`upsert:${id}`);
    futureAbsenceSyncFlags.delete(`delete:${id}`);
    const result=await storage.deleteTeacherFutureAbsence(id);
    clearSuperAdminError();
    pushSuperAdminEvent('Future absence',`Aviso futuro ${id} eliminado en backend.`);
    return result;
  }catch(error){
    console.warn('Teacher future absence delete backend sync failed; keeping local state',error);
    futureAbsenceSyncFlags.add(`delete:${id}`);
    setSuperAdminError('Hay eliminaciones pendientes de sincronizar.');
    pushSuperAdminEvent('Pendiente backend',`Eliminación local pendiente para aviso ${id}.`);
    renderSuperAdminMonitor();
    return {ok:true,localOnly:true,syncError:true};
  }
}
async function hydrateFromBackend(){
  if(!storage.hasBackend()||backendHydrated) return;
  if(!isAdmin&&!isSuperAdmin) return;
  backendHydrated=true;
  try{
    const [guardiasResult,historialResult,tareasResult,overridesResult,substitutionsResult,practicasGuardiasResult,practicasGuardiasTramosResult]=await Promise.allSettled([
      storage.fetchGuardias(),
      storage.fetchHistorial(),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides(),
      storage.fetchTeacherSubstitutions(),
      storage.fetchTeacherPracticasGuardias(),
      storage.fetchTeacherPracticasGuardiasTramos()
    ]);
    const guardiasRows=guardiasResult.status==='fulfilled'?guardiasResult.value:null;
    const historialRows=historialResult.status==='fulfilled'?historialResult.value:null;
    const tareasRows=tareasResult.status==='fulfilled'?tareasResult.value:null;
    const overridesRows=overridesResult.status==='fulfilled'?overridesResult.value:null;
    const substitutionsRows=substitutionsResult.status==='fulfilled'?substitutionsResult.value:null;
    const practicasGuardiasRows=practicasGuardiasResult.status==='fulfilled'?practicasGuardiasResult.value:null;
    const practicasGuardiasTramosRows=practicasGuardiasTramosResult.status==='fulfilled'?practicasGuardiasTramosResult.value:null;

    const backendHasData=
      (Array.isArray(guardiasRows)&&guardiasRows.length)||
      (Array.isArray(historialRows)&&historialRows.length)||
      (Array.isArray(tareasRows)&&tareasRows.length)||
      (Array.isArray(overridesRows)&&overridesRows.length)||
      (Array.isArray(substitutionsRows)&&substitutionsRows.length)||
      (Array.isArray(practicasGuardiasRows)&&practicasGuardiasRows.length)||
      (Array.isArray(practicasGuardiasTramosRows)&&practicasGuardiasTramosRows.length);

    if(Array.isArray(guardiasRows)){
      data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
    }

    if(Array.isArray(historialRows)){
      historialCambios=historialRows;
      persistHistorial(historialCambios);
    }

    if(Array.isArray(tareasRows)){
      tareasProfesorado=Object.fromEntries(
        tareasRows.map(row=>[
          row.id||makeTareaKey(row.profesor,row.dia,row.hora),
          {
            profesor:row.profesor,
            dia:row.dia,
            hora:row.hora,
            dejada:!!row.dejada,
            tarea:row.tarea||''
          }
        ])
      );
      persistTareas(tareasProfesorado);
    }

    if(Array.isArray(overridesRows)){
      sessionOverrides=Object.fromEntries(
        overridesRows.map(row=>[
          row.id||makeSessionKey(row.profesor,row.dia,row.hora),
          {
            materia:row.materia||'',
            grupo:row.grupo||'',
            detalle:row.detalle||'',
            aula:row.aula||''
          }
        ])
      );
      persistSessionOverrides(sessionOverrides);
    }
    if(Array.isArray(substitutionsRows)){
      teacherSubstitutions=Object.fromEntries(substitutionsRows.map(row=>[row.profesor,row.sustituto]).filter(([profesor,sustituto])=>getProfesor(profesor)&&cleanText(sustituto)));
      persistTeacherSubstitutions(teacherSubstitutions);
    }
    if(Array.isArray(practicasGuardiasRows)){
      teacherPracticasGuardias=[...new Set(practicasGuardiasRows.map(row=>cleanText(row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
      persistTeacherPracticasGuardias(teacherPracticasGuardias);
    }
    if(Array.isArray(practicasGuardiasTramosRows)){
      teacherPracticasGuardiasTramos=[...new Map(practicasGuardiasTramosRows.map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora),row])).values()]
        .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
      persistTeacherPracticasGuardiasTramos(teacherPracticasGuardiasTramos);
    }
    refreshOrdenGuardias();

    reassignAllGuardias();
    persist(data);
    lastBackendSnapshot=makeBackendSnapshot();
    superAdminStatus.lastHydrateAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Hydrate','Estado principal recargado desde backend.');
    renderGuardiaBoard();
    renderTable();
    renderHistoryList();
    renderSubstitutionList();
    renderPracticasGuardiasList();
    renderPracticasGuardiasConfig();
    renderFutureAbsenceAdminList();

    if(!backendHasData&&!storage.isBackendOnly()&&(data.length||historialCambios.length)){
      syncAdminState();
    }
  }catch(error){
    console.warn('Backend hydration failed',error);
    setSuperAdminError('Fallo al hidratar el estado principal.');
    pushSuperAdminEvent('Error hydrate',String(error?.message||error));
  }
}
function isAnyOverlayOpen(){
  return ['overlay','teacherOverlay','teacherAccessOverlay','historyOverlay','substitutionOverlay','practicasGuardiasOverlay','futureAbsenceAdminOverlay','dialogOverlay']
    .some(id=>document.getElementById(id)?.classList.contains('open'));
}
function makeBackendSnapshot(){
  return JSON.stringify({
    data,
    biblioteca:serializeBibliotecaAssignments(),
    tareas:serializeTeacherTasks(),
    overrides:serializeSessionOverrides(),
    substitutions:serializeTeacherSubstitutions(),
    practicasGuardias:serializeTeacherPracticasGuardias(),
    practicasGuardiasTramos:serializeTeacherPracticasGuardiasTramos(),
    historial:historialCambios.map(entry=>({
      id:entry.id,
      title:entry.title,
      detail:entry.detail,
      type:entry.type,
      actor:entry.actor,
      ts:entry.ts,
      undoState:entry.undoState||null
    }))
  });
}
async function pollBackendState(){
  if(!storage.hasBackend()||backendPollingInFlight||backendSyncInFlight) return;
  if(!isAdmin&&!isSuperAdmin) return;
  if(document.hidden||isAnyOverlayOpen()) return;

  backendPollingInFlight=true;
  renderSuperAdminMonitor();
  try{
    const previousSnapshot=makeBackendSnapshot();
    const [guardiasResult,historialResult,tareasResult,overridesResult,substitutionsResult,practicasGuardiasResult,practicasGuardiasTramosResult]=await Promise.allSettled([
      storage.fetchGuardias(),
      storage.fetchHistorial(),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides(),
      storage.fetchTeacherSubstitutions(),
      storage.fetchTeacherPracticasGuardias(),
      storage.fetchTeacherPracticasGuardiasTramos()
    ]);
    const guardiasRows=guardiasResult.status==='fulfilled'?guardiasResult.value:null;
    const historialRows=historialResult.status==='fulfilled'?historialResult.value:null;
    const tareasRows=tareasResult.status==='fulfilled'?tareasResult.value:null;
    const overridesRows=overridesResult.status==='fulfilled'?overridesResult.value:null;
    const substitutionsRows=substitutionsResult.status==='fulfilled'?substitutionsResult.value:null;
    const practicasGuardiasRows=practicasGuardiasResult.status==='fulfilled'?practicasGuardiasResult.value:null;
    const practicasGuardiasTramosRows=practicasGuardiasTramosResult.status==='fulfilled'?practicasGuardiasTramosResult.value:null;

    if(Array.isArray(guardiasRows)){
      data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
    }

    if(Array.isArray(historialRows)){
      historialCambios=historialRows;
      persistHistorial(historialCambios);
    }

    if(Array.isArray(tareasRows)){
      tareasProfesorado=Object.fromEntries(
        tareasRows.map(row=>[
          row.id||makeTareaKey(row.profesor,row.dia,row.hora),
          {
            profesor:row.profesor,
            dia:row.dia,
            hora:row.hora,
            dejada:!!row.dejada,
            tarea:row.tarea||''
          }
        ])
      );
      persistTareas(tareasProfesorado);
    }

    if(Array.isArray(overridesRows)){
      sessionOverrides=Object.fromEntries(
        overridesRows.map(row=>[
          row.id||makeSessionKey(row.profesor,row.dia,row.hora),
          {
            materia:row.materia||'',
            grupo:row.grupo||'',
            detalle:row.detalle||'',
            aula:row.aula||''
          }
        ])
      );
      persistSessionOverrides(sessionOverrides);
    }
    if(Array.isArray(substitutionsRows)){
      teacherSubstitutions=Object.fromEntries(substitutionsRows.map(row=>[row.profesor,row.sustituto]).filter(([profesor,sustituto])=>getProfesor(profesor)&&cleanText(sustituto)));
      persistTeacherSubstitutions(teacherSubstitutions);
    }
    if(Array.isArray(practicasGuardiasRows)){
      teacherPracticasGuardias=[...new Set(practicasGuardiasRows.map(row=>cleanText(row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
      persistTeacherPracticasGuardias(teacherPracticasGuardias);
    }
    if(Array.isArray(practicasGuardiasTramosRows)){
      teacherPracticasGuardiasTramos=[...new Map(practicasGuardiasTramosRows.map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora),row])).values()]
        .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
      persistTeacherPracticasGuardiasTramos(teacherPracticasGuardiasTramos);
    }
    refreshOrdenGuardias();

    reassignAllGuardias();
    persist(data);
    lastBackendSnapshot=makeBackendSnapshot();
    superAdminStatus.lastPollAt=new Date().toISOString();
    clearSuperAdminError();
    if(previousSnapshot!==makeBackendSnapshot()){
      pushSuperAdminEvent('Polling','Se detectaron cambios remotos y se actualizaron en local.');
      renderGuardiaBoard();
      renderTable();
      renderHistoryList();
      renderSubstitutionList();
      renderPracticasGuardiasList();
      renderPracticasGuardiasConfig();
    }else{
      pushSuperAdminEvent('Polling','Comprobación remota sin cambios.');
    }
  }catch(error){
    console.warn('Backend polling failed',error);
    setSuperAdminError('Fallo en la comprobación periódica del backend.');
    pushSuperAdminEvent('Error polling',String(error?.message||error));
  }finally{
    backendPollingInFlight=false;
    renderSuperAdminMonitor();
  }
}
function isReportAvailable(){
  const now=formatNowParts();
  return now.hours>14 || (now.hours===14 && now.minutes>=10);
}
function isWeeklyReportAvailable(){
  const { hours, minutes, date }=formatNowParts();
  const weekday=date.getDay();
  if(weekday===6||weekday===0) return true;
  return weekday===5&&(hours>14||(hours===14&&minutes>=10));
}
function updateAdminControls(){
  const btnAddAusencia=document.getElementById('btnAddAusencia');
  const btnSorteo=document.getElementById('btnSorteo');
  const btnInforme=document.getElementById('btnInforme');
  const btnInformeSemanal=document.getElementById('btnInformeSemanal');
  const currentWeek=isCurrentWeekOffset(weekOffset);
  if(btnAddAusencia) btnAddAusencia.style.display=isAdmin&&currentWeek?'':'none';
  if(btnSorteo) btnSorteo.style.display=isAdmin&&currentWeek?'':'none';
  if(btnInforme) btnInforme.style.display=isAdmin?'':'none';
  if(btnInformeSemanal) btnInformeSemanal.style.display=isAdmin?'':'none';
}
function refreshAccessUi(){
  const btnAdmin=document.getElementById('btnAdmin');
  const btnSuperAdmin=document.getElementById('btnSuperAdmin');
  const adminBar=document.getElementById('adminBar');
  const superAdminBar=document.getElementById('superAdminBar');
  document.body.classList.toggle('superadmin-active',isSuperAdmin);
  if(btnAdmin){
    btnAdmin.classList.toggle('on',isAdmin);
    btnAdmin.textContent=isAdmin?'Salir Jefatura':'Jefe de estudios';
  }
  if(btnSuperAdmin){
    btnSuperAdmin.style.display=(SUPERADMIN_ENABLED||isSuperAdmin)?'':'none';
    btnSuperAdmin.classList.toggle('on',isSuperAdmin);
    btnSuperAdmin.textContent=isSuperAdmin?'Salir Superadmin':'Superadmin';
  }
  if(adminBar) adminBar.classList.toggle('show',isAdmin);
  if(superAdminBar) superAdminBar.classList.toggle('show',isSuperAdmin);
  updateAdminControls();
  renderSuperAdminMonitor();
  if(isSuperAdmin){
    refreshSuperAdminOps(false);
  }
}
function showToast(message,type){
  const toastStack=document.getElementById('toastStack');
  if(!toastStack||!message) return;
  const toast=document.createElement('div');
  toast.className=`toast is-${type||'info'}`;
  toast.textContent=message;
  toastStack.appendChild(toast);
  window.setTimeout(()=>{
    toast.remove();
  },3200);
}
function setSuperAdminHint(message,type){
  const hint=document.getElementById('superAdminHint');
  if(!hint) return;
  hint.textContent=message||'';
  hint.classList.remove('is-success','is-error','is-info');
  if(type) hint.classList.add(`is-${type}`);
}
function openDialog(config){
  const dialogOverlay=document.getElementById('dialogOverlay');
  const dialogTitle=document.getElementById('dialogTitle');
  const dialogText=document.getElementById('dialogText');
  const dialogInput=document.getElementById('dialogInput');
  const dialogCancel=document.getElementById('dialogCancel');
  const dialogConfirm=document.getElementById('dialogConfirm');
  if(!dialogOverlay||!dialogTitle||!dialogText||!dialogInput||!dialogCancel||!dialogConfirm){
    return Promise.resolve({confirmed:false,value:''});
  }
  dialogTitle.textContent=config?.title||'Aviso';
  dialogText.textContent=config?.message||'';
  dialogConfirm.textContent=config?.confirmText||'Aceptar';
  dialogCancel.textContent=config?.cancelText||'Cancelar';
  dialogCancel.style.display=config?.showCancel?'':'none';
  dialogInput.style.display=config?.input?'block':'none';
  dialogInput.type=config?.inputType||'text';
  dialogInput.value=config?.defaultValue||'';
  dialogInput.placeholder=config?.placeholder||'';
  dialogInput.onkeydown=config?.input?event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      closeDialog(true);
    }
  }:null;
  dialogOverlay.classList.add('open');
  if(config?.input){
    window.setTimeout(()=>{
      dialogInput.focus();
      dialogInput.select();
    },0);
  }else{
    window.setTimeout(()=>dialogConfirm.focus(),0);
  }
  return new Promise(resolve=>{
    dialogResolver=resolve;
  });
}
function closeDialog(confirmed){
  const dialogOverlay=document.getElementById('dialogOverlay');
  const dialogInput=document.getElementById('dialogInput');
  if(dialogOverlay) dialogOverlay.classList.remove('open');
  const resolver=dialogResolver;
  dialogResolver=null;
  if(resolver) resolver({confirmed:!!confirmed,value:dialogInput?dialogInput.value:''});
}
function bgDialogClose(e){if(e.target.id==='dialogOverlay') closeDialog(false);}
async function askConfirm(title,message,confirmText){
  const result=await openDialog({title,message,confirmText:confirmText||'Aceptar',showCancel:true});
  return result.confirmed;
}
async function askPassword(title,message){
  const result=await openDialog({title,message,confirmText:'Entrar',showCancel:true,input:true,inputType:'password',placeholder:'Introduce la contrase\u00f1a'});
  return result.confirmed?result.value:'';
}
async function askText(title,message,defaultValue,placeholder,confirmText){
  const result=await openDialog({title,message,confirmText:confirmText||'Guardar',showCancel:true,input:true,inputType:'text',defaultValue:defaultValue||'',placeholder:placeholder||''});
  return result.confirmed?result.value:'';
}
async function loadAuthSession(){
  if(!storage.hasBackend()){
    isAdmin=false;
    isSuperAdmin=false;
    refreshAccessUi();
    return;
  }
  try{
    const session=await storage.fetchAuthSession();
    if(session?.isSuperAdmin&&!SUPERADMIN_ENABLED){
      try{
        await storage.logoutRole();
      }catch(error){
        console.warn('Superadmin session cleanup failed',error);
      }
      isAdmin=false;
      isSuperAdmin=false;
      refreshAccessUi();
      renderTable();
      return;
    }
    isAdmin=session?.role==='admin';
    isSuperAdmin=!!session?.isSuperAdmin;
    refreshAccessUi();
    renderTable();
  }catch(error){
    console.warn('Session load failed',error);
    isAdmin=false;
    isSuperAdmin=false;
    refreshAccessUi();
    renderTable();
  }
}
async function loginRole(role,password){
  if(!storage.hasBackend()){
    showToast('Este acceso requiere backend activo.','error');
    return false;
  }
  try{
    const result=await storage.loginRole(role,password);
    isAdmin=result?.role==='admin';
    isSuperAdmin=!!result?.isSuperAdmin;
    refreshAccessUi();
    backendHydrated=false;
    await hydrateFromBackend();
    return true;
  }catch(error){
    if(String(error?.message||'').includes('401')) return false;
    console.warn('Role login failed',error);
    showToast('No se pudo iniciar la sesi\u00f3n.','error');
    return false;
  }
}
async function logoutCurrentRole(){
  if(storage.hasBackend()){
    try{
      await storage.logoutRole();
    }catch(error){
      console.warn('Logout failed',error);
    }
  }
  isAdmin=false;
  isSuperAdmin=false;
  backendHydrated=false;
  refreshAccessUi();
}
async function ensureSuperAdminRouteAccess(){
  if(!SUPERADMIN_ENABLED||superAdminRoutePrompted) return true;
  superAdminRoutePrompted=true;
  if(isSuperAdmin||isAdmin){
    await logoutCurrentRole();
  }
  const password=await askPassword('Acceso Superadmin','Introduce la contraseña del modo superadmin.');
  if(!password){
    window.location.href=window.location.pathname;
    return false;
  }
  const ok=await loginRole('superadmin',password);
  if(ok) return true;
  showToast('Contraseña incorrecta.','error');
  window.location.href=window.location.pathname;
  return false;
}
async function initializeApp(){
  await loadAuthSession();
  if(!await ensureSuperAdminRouteAccess()) return;
  await hydrateTeacherSubstitutions();
  await hydrateTeacherPracticasGuardias();
  await hydrateTeacherFutureAbsences();
  await hydrateFromBackend();
}
async function changeRolePasswordFlow(role){
  const roleLabel=role==='superadmin'?'Superadmin':'Jefatura';
  if(role==='superadmin'&&!isSuperAdmin){
    showToast('Necesitas sesi\u00f3n de superadmin.','error');
    return;
  }
  if(role==='admin'&&!isAdmin){
    showToast('Necesitas sesi\u00f3n de Jefatura.','error');
    return;
  }
  const currentPassword=await askPassword(`Cambiar contrase\u00f1a de ${roleLabel}`,'Introduce la contrase\u00f1a actual.');
  if(!currentPassword) return;
  const newPassword=await askPassword(`Nueva contrase\u00f1a de ${roleLabel}`,'Introduce la nueva contrase\u00f1a.');
  if(!newPassword) return;
  const confirmPassword=await askPassword(`Confirmar contrase\u00f1a de ${roleLabel}`,'Vuelve a introducir la nueva contrase\u00f1a.');
  if(!confirmPassword) return;
  if(newPassword!==confirmPassword){
    showToast('La confirmaci\u00f3n no coincide.','error');
    return;
  }
  try{
    const result=await storage.changeRolePassword(role,currentPassword,newPassword);
    if(result?.ok) showToast(`Contrase\u00f1a de ${roleLabel} actualizada.`, 'success');
  }catch(error){
    if(String(error?.message||'').includes('401')){
      showToast('La contrase\u00f1a actual no es correcta.','error');
      return;
    }
    console.warn('Password change failed',error);
    showToast('No se pudo actualizar la contrase\u00f1a.','error');
  }
}
setInterval(()=>{updateClockUi();},1000);
updateClockUi();
function initials(n){return(n||'').split(/[\s,]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';}
function renderWeekLabel(){
  const weekLabel=document.getElementById('weekLabel');
  if(weekLabel) weekLabel.textContent=formatWeekRangeLabel(getSelectedWeekKey(),weekOffset);
  const teacherWeekLabel=document.getElementById('teacherWeekLabel');
  if(teacherWeekLabel) teacherWeekLabel.textContent=formatWeekRangeLabel(getTeacherSelectedWeekKey(),teacherWeekOffset);
  const saveTs=document.getElementById('saveTs');
  if(saveTs&&!isCurrentWeekOffset(weekOffset)){
    saveTs.textContent='Vista de planificaciÃ³n. La ediciÃ³n sigue reservada a la semana actual.';
  }
}
function renderPills(){document.getElementById('dNombre').textContent=DIAS[day];document.getElementById('dayPills').innerHTML=DIAS.map((d,i)=>`<button class="day-pill${i===day?' active':''}" onclick="setDay(${i})">${d}</button>`).join('');renderWeekLabel();}
function renderGuardiaBoard(){
  const grid=document.getElementById('guardiaGrid');
  const cards=[];
  let firstMobileCard=true;
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const coverageCounter=buildGuardiaCoverageCounter({rowsSource});
  for(let hora=1;hora<=9;hora++){
    if(HORAS_PATIO.has(hora)) continue;
    const ordenHora=getOrdenHora(day,hora);
    const profes=ordenHora.map(item=>item.nombre);
    const biblioteca=getBibliotecaAsignada(day,hora,rowsSource);
    const banos=getBanosAsignado(day,hora,rowsSource)||'';
    const teacherAssignedHere=!!(teacherName&&rowsSource.filter(row=>row.dia===day&&row.hora===hora&&row.guardia===teacherName).length);
    const asignados=new Set(rowsSource.filter(g=>g.dia===day&&g.hora===hora&&g.guardia&&g.guardia.trim()).map(g=>g.guardia.trim()));
    const nombres=profes.map(nombre=>{
      const coverageCount=coverageCounter[nombre]||0;
      const classes=[
        'guardia-mini',
        asignados.has(nombre)?'guardia-mini-assigned':'',
        teacherAssignedHere&&nombre===teacherName?'guardia-mini-current':'',
        nombre===biblioteca?'guardia-mini-biblio':'',
        nombre===banos?'guardia-mini-banos':''
      ].filter(Boolean).join(' ');
      const suffix=nombre===biblioteca?' \u00b7 Biblioteca':(nombre===banos?' \u00b7 Ba\u00f1os':'');
      const counterLabel=` \u00b7 ${coverageCount} ${coverageCount===1?'guardia':'guardias'}`;
      return `<span class="${classes}" title="${escapeHtml(`${getVisibleTeacherName(nombre)}${counterLabel}`)}">${escapeHtml(getVisibleTeacherName(nombre))}${suffix}<small class="guardia-mini-count">${coverageCount}</small></span>`;
    }).join('')||'<span class="sin-asignar">Sin profesorado asignado</span>';
    const cardClasses=['guardia-card'];
    if(firstMobileCard) cardClasses.push('is-open');
    if(teacherAssignedHere) cardClasses.push('guardia-card-current');
    cards.push(`<article class="${cardClasses.join(' ')}">
      <button class="guardia-card-toggle" type="button" onclick="toggleGuardiaCard(this)">
        <span class="guardia-card-head">
          <span class="guardia-num">${HORA_MAP[hora].label} hora</span>
          <span class="guardia-count">${profes.length} profesores</span>
        </span>
      </button>
      <div class="guardia-card-body">
        <div class="guardia-list">${nombres}</div>
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
function changeWeekOffset(delta){
  weekOffset=Math.max(-1,Math.min(3,weekOffset+delta));
  renderPills();
  updateAdminControls();
  renderGuardiaBoard();
  renderTable();
}
function sortearGuardiasDia(){for(let hora=1;hora<=9;hora++){ordenGuardias[day][hora]=makeOrdenHora(day,hora);}persistOrden(ordenGuardias);renderGuardiaBoard();renderTable();}
function buildDailyReportText(){
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const fecha=formatNowParts().date.toLocaleDateString('es-ES');
  const cabecera=[
    `Informe de guardias - ${DIAS[day]}`,
    `Fecha de generaci\u00f3n: ${fecha}`,
    ''
  ];
  if(!rows.length) return cabecera.concat(['No hay ausencias registradas para este d\u00eda.']).join('\n');
  const cuerpo=rows.map(g=>{
    const h=HORA_MAP[g.hora]||{rango:''};
    const cub=g.guardia&&g.guardia.trim();
    const sugerido=cub||getGuardiaSugerida(day,g.hora,1)||'Sin asignar';
    const biblioteca=getBibliotecaAsignada(day,g.hora)||'Sin asignar';
    const banos=getBanosAsignado(day,g.hora)||'Sin asignar';
    const faenaInfo=resolveFaena(g);
    const aula=resolveAulaRegistro(g)||'-';
    return [
      `${h.rango.replace('-', ' - ')}`,
      `Ausente: ${getVisibleTeacherName(g.ausente)}`,
      `Guardia: ${getVisibleTeacherName(sugerido)}`,
      `Biblioteca: ${biblioteca}`,
      `Ba\u00f1os: ${banos}`,
      `Aula: ${aula}`,
      `Faena: ${faenaInfo.faena?'S\u00ed':'No'}`,
      `${faenaInfo.obs?`Tarea: ${faenaInfo.obs}`:'Tarea: -'}`
    ].join('\n');
  }).join('\n\n');
  return cabecera.concat([cuerpo]).join('\n');
}
function buildDailyReportHtml(){
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const fecha=formatNowParts().date.toLocaleDateString('es-ES');
  const totalAusencias=rows.length;
  const totalConTarea=rows.filter(g=>resolveFaena(g).faena).length;
  const totalCubiertas=rows.filter(g=>(g.guardia&&g.guardia.trim())||getGuardiaSugerida(day,g.hora,1)).length;
  const cards=rows.length?rows.map(g=>{
    const h=HORA_MAP[g.hora]||{label:`${g.hora}a`,rango:''};
    const cub=g.guardia&&g.guardia.trim();
    const sugerido=cub||getGuardiaSugerida(day,g.hora,1)||'';
    const biblioteca=getBibliotecaAsignada(day,g.hora)||'Sin asignar';
    const banos=getBanosAsignado(day,g.hora)||'Sin asignar';
    const faenaInfo=resolveFaena(g);
    const aula=resolveAulaRegistro(g)||'Sin aula';
    return `
      <article class="item">
        <div class="item-top">
          <div>
            <div class="item-eyebrow">${escapeHtml(h.label)} hora</div>
            <div class="item-head">${escapeHtml(h.rango.replace('-', ' - '))}</div>
          </div>
          <span class="pill ${sugerido?(cub?'pill-ok':'pill-warn'):'pill-bad'}">${sugerido?(cub?'Cubierta':'Prevista'):'Sin cubrir'}</span>
        </div>
        <div class="person-block person-block-absent">
          <div class="person-label">Profesor ausente</div>
          <div class="person-name">${escapeHtml(getVisibleTeacherName(g.ausente))}</div>
        </div>
        <div class="person-block person-block-guard">
          <div class="person-label">Profesor de guardia</div>
          <div class="person-name">${escapeHtml(sugerido?getVisibleTeacherName(sugerido):'Sin asignar')}</div>
        </div>
        <div class="meta-grid">
          <div class="meta-card"><span class="meta-k">Aula</span><span class="meta-v">${escapeHtml(aula)}</span></div>
          <div class="meta-card"><span class="meta-k">Tarea</span><span class="meta-v">${faenaInfo.faena?'Disponible':'No registrada'}</span></div>
          <div class="meta-card"><span class="meta-k">Biblioteca</span><span class="meta-v">${escapeHtml(biblioteca)}</span></div>
          <div class="meta-card"><span class="meta-k">BaÃ±os</span><span class="meta-v">${escapeHtml(banos)}</span></div>
        </div>
        ${faenaInfo.obs?`<div class="task-box"><div class="task-title">Indicaciones para el grupo</div><div class="task-text">${escapeHtml(faenaInfo.obs)}</div></div>`:''}
      </article>`;
  }).join(''):`<p class="empty empty-left">No hay ausencias registradas para este dÃ­a.</p>`;
  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Informe de guardias</title>
    <style>
      :root{color-scheme:light}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;color:#1f2937;margin:28px;background:#f6f8fb}
      .sheet{max-width:1120px;margin:0 auto;background:#fff;border:1px solid #dbe3ee;border-radius:24px;padding:28px 30px 30px;box-shadow:0 18px 40px rgba(31,41,55,.08)}
      .topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}
      .title-kicker{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#8a94a6;margin-bottom:8px}
      h1{margin:0;font-size:30px;line-height:1.05}
      .subtitle{margin-top:8px;color:#6b7280;font-size:14px}
      .summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:22px}
      .summary-card{padding:14px 16px;border:1px solid #dbe3ee;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fbff)}
      .summary-k{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a94a6;margin-bottom:8px}
      .summary-v{display:block;font-size:28px;font-weight:800;line-height:1;color:#1f2937}
      .summary-note{display:block;margin-top:6px;font-size:13px;color:#6b7280}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .item{border:1px solid #dbe3ee;border-radius:18px;padding:18px;background:#fff;break-inside:avoid;box-shadow:0 10px 24px rgba(31,41,55,.05)}
      .item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .item-eyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a94a6;margin-bottom:4px}
      .item-head{font-weight:800;font-size:22px;line-height:1.05}
      .pill{display:inline-flex;align-items:center;justify-content:center;padding:7px 11px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
      .pill-ok{background:#edf9f3;color:#1f9d63;border:1px solid #cdebd9}
      .pill-warn{background:#fff3cf;color:#8c6707;border:1px solid #efdba6}
      .pill-bad{background:#fff1f1;color:#d9534f;border:1px solid #f3d1d1}
      .person-block{padding:12px 13px;border-radius:14px;margin-bottom:10px}
      .person-block-absent{background:#fff7f7;border:1px solid #f0cccc}
      .person-block-guard{background:#f8fbff;border:1px solid #d7e4fb}
      .person-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a94a6;margin-bottom:6px}
      .person-name{font-size:18px;font-weight:800;line-height:1.2}
      .meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .meta-card{padding:10px 11px;border-radius:12px;background:#f7f9fc;border:1px solid #e5ebf3}
      .meta-k{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a94a6;margin-bottom:6px}
      .meta-v{display:block;font-size:14px;font-weight:700;color:#1f2937}
      .task-box{margin-top:14px;padding:13px 14px;border-radius:14px;background:#fff8e8;border:1px solid #efdba6}
      .task-title{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8c6707;margin-bottom:8px}
      .task-text{font-size:14px;line-height:1.5;white-space:pre-wrap;color:#1f2937}
      .empty{font-size:16px;color:#6b7280}
      @media print{body{margin:0;background:#fff}.sheet{max-width:none;border:none;border-radius:0;box-shadow:none;padding:16px}.grid{gap:12px}.item{box-shadow:none}}
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="topbar">
        <div>
          <div class="title-kicker">IES Alcalans Â· Guardias</div>
          <h1>Informe diario Â· ${escapeHtml(DIAS[day])}</h1>
          <div class="subtitle">Fecha de generaciÃ³n: ${escapeHtml(fecha)}</div>
        </div>
      </div>
      <section class="summary">
        <article class="summary-card"><span class="summary-k">Ausencias</span><span class="summary-v">${totalAusencias}</span><span class="summary-note">Registros del dÃ­a</span></article>
        <article class="summary-card"><span class="summary-k">Coberturas</span><span class="summary-v">${totalCubiertas}</span><span class="summary-note">Asignadas o previstas</span></article>
        <article class="summary-card"><span class="summary-k">Con tarea</span><span class="summary-v">${totalConTarea}</span><span class="summary-note">Faena disponible</span></article>
      </section>
      <section class="grid">${cards}</section>
    </main>
  </body>
  </html>`;
}
function buildWeeklyReportHtml(){
  const fecha=formatNowParts().date.toLocaleDateString('es-ES');
  const totalAusencias=data.length;
  const totalCoberturas=data.filter(row=>cleanText(row.guardia)).length;
  const totalConTarea=data.filter(row=>resolveFaena(row).faena).length;
  const diasConIncidencia=new Set(data.map(row=>row.dia)).size;
  const daySections=DIAS.map((diaNombre,diaIndex)=>{
    const rows=data
      .filter(row=>row.dia===diaIndex)
      .sort((a,b)=>a.hora-b.hora||String(a.ausente||'').localeCompare(String(b.ausente||''),'es'));
    if(!rows.length){
      return `<section class="day-block"><div class="day-head"><h2>${escapeHtml(diaNombre)}</h2><span class="day-count">Sin incidencias</span></div><p class="empty empty-left">No hay ausencias registradas para este dÃ­a.</p></section>`;
    }
    const grouped=new Map();
    rows.forEach(row=>{
      const key=row.ausente||'Profesorado sin identificar';
      if(!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(row);
    });
    const items=[...grouped.entries()]
      .map(([ausente,entries])=>({
        ausente,
        horas:[...new Set(entries.map(row=>row.hora))].sort((a,b)=>a-b),
        guardias:[...new Set(entries.map(row=>cleanText(row.guardia)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')),
        aulas:[...new Set(entries.map(row=>resolveAulaRegistro(row)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')),
        conTarea:entries.some(row=>resolveFaena(row).faena)
      }))
      .sort((a,b)=>a.ausente.localeCompare(b.ausente,'es'))
      .map(item=>`
        <article class="item">
          <div class="item-top">
            <div class="item-head">${escapeHtml(item.ausente)}</div>
            <span class="pill ${item.conTarea?'pill-ok':'pill-warn'}">${item.conTarea?'Con tarea':'Sin tarea'}</span>
          </div>
          <div class="item-row"><span class="item-k">Horas</span><span class="item-v">${escapeHtml(item.horas.map(hora=>`${formatHoraLabel(hora)} (${HORA_MAP[hora]?.rango||''})`).join(' ? '))}</span></div>
          <div class="item-row"><span class="item-k">Cobertura</span><span class="item-v">${escapeHtml(item.guardias.length?item.guardias.join(' ? '):'Sin asignar')}</span></div>
          <div class="item-row"><span class="item-k">Aula</span><span class="item-v">${escapeHtml(item.aulas.length?item.aulas.join(' ? '):'Sin aula')}</span></div>
        </article>
      `)
      .join('');
    return `<section class="day-block"><div class="day-head"><h2>${escapeHtml(diaNombre)}</h2><span class="day-count">${rows.length} registros</span></div><div class="grid">${items}</div></section>`;
  }).join('');

  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Informe semanal de guardias</title>
    <style>
      body{font-family:Arial,sans-serif;color:#1f2937;margin:0;background:#eef3f8}
      .sheet{max-width:1080px;margin:0 auto;padding:28px 28px 34px}
      .hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;padding:24px 26px;border-radius:24px;background:linear-gradient(135deg,#153a63,#28588b);color:#fff;margin-bottom:18px}
      .hero-kicker{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:.78;margin-bottom:10px}
      h1{margin:0 0 8px;font-size:30px;line-height:1.05}
      .hero-meta{font-size:14px;opacity:.82}
      .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:22px}
      .summary-card{background:#fff;border:1px solid #dbe3ee;border-radius:18px;padding:16px 18px}
      .summary-k{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a94a6;margin-bottom:8px}
      .summary-v{display:block;font-size:28px;font-weight:800;color:#153a63}
      .summary-note{display:block;font-size:13px;color:#6b7280;margin-top:6px}
      .day-block{margin-bottom:22px;page-break-inside:avoid;background:#fff;border:1px solid #dbe3ee;border-radius:22px;padding:18px 18px 16px}
      .day-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}
      h2{margin:0;font-size:20px}
      .day-count{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:999px;background:#edf4ff;color:#28588b;font-size:12px;font-weight:700}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .item{border:1px solid #dbe3ee;border-radius:16px;padding:16px;background:#fbfcfe;break-inside:avoid}
      .item-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
      .item-head{font-weight:800;font-size:18px;line-height:1.2}
      .item-row{display:grid;grid-template-columns:94px minmax(0,1fr);gap:10px;margin-top:8px}
      .item-k{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a94a6}
      .item-v{font-size:14px;line-height:1.5}
      .pill{display:inline-flex;align-items:center;justify-content:center;padding:7px 11px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
      .pill-ok{background:#edf9f3;color:#1f9d63;border:1px solid #cdebd9}
      .pill-warn{background:#fff3cf;color:#8c6707;border:1px solid #efdba6}
      .empty{font-size:15px;color:#6b7280}.empty-left{text-align:left;margin:0}
      @media print{body{background:#fff}.sheet{max-width:none;padding:16px}.hero{padding:18px 20px}.summary{gap:10px}.grid{gap:12px}}
    </style>
  </head>
  <body>
    <main class="sheet">
      <section class="hero">
        <div>
          <div class="hero-kicker">IES Alcalans Â· Guardias</div>
          <h1>Informe semanal de guardias</h1>
          <div class="hero-meta">Fecha de generaciÃ³n: ${escapeHtml(fecha)}</div>
        </div>
      </section>
      <section class="summary">
        <article class="summary-card"><span class="summary-k">Ausencias</span><span class="summary-v">${totalAusencias}</span><span class="summary-note">Registros semanales</span></article>
        <article class="summary-card"><span class="summary-k">Coberturas</span><span class="summary-v">${totalCoberturas}</span><span class="summary-note">Guardias asignadas</span></article>
        <article class="summary-card"><span class="summary-k">Con tarea</span><span class="summary-v">${totalConTarea}</span><span class="summary-note">Faena disponible</span></article>
        <article class="summary-card"><span class="summary-k">DÃ­as activos</span><span class="summary-v">${diasConIncidencia}</span><span class="summary-note">Con incidencias registradas</span></article>
      </section>
      ${daySections}
    </main>
  </body>
  </html>`;
}
function printDailyReportPdf(){
  if(!isAdmin) return;
  if(!storage.hasBackend()){
    const ventana=window.open('','_blank','noopener,noreferrer,width=980,height=720');
    if(!ventana) return;
    ventana.document.open();
    ventana.document.write(buildDailyReportHtml());
    ventana.document.close();
    ventana.focus();
    ventana.print();
    return;
  }
  const reportUrl=`${storage.backendBaseUrl}/report/daily.pdf?day=${day}`;
  const link=document.createElement('a');
  link.href=reportUrl;
  link.target='_blank';
  link.rel='noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function printWeeklyReportPdf(){
  if(!isAdmin) return;
  if(!storage.hasBackend()){
    const ventana=window.open('','_blank','noopener,noreferrer,width=1100,height=780');
    if(!ventana) return;
    ventana.document.open();
    ventana.document.write(buildWeeklyReportHtml());
    ventana.document.close();
    ventana.focus();
    ventana.print();
    return;
  }
  const link=document.createElement('a');
  link.href=`${storage.backendBaseUrl}/report/weekly.pdf`;
  link.target='_blank';
  link.rel='noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function downloadBackupJson(){
  if(!isSuperAdmin||!storage.hasBackend()) return;
  const link=document.createElement('a');
  link.href=`${storage.backendBaseUrl}/export/snapshot.json`;
  link.target='_blank';
  link.rel='noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function downloadDatabaseBackup(){
  if(!isSuperAdmin||!storage.hasBackend()) return;
  const link=document.createElement('a');
  link.href=`${storage.backendBaseUrl}/export/database.sqlite`;
  link.target='_blank';
  link.rel='noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function triggerRestoreSnapshot(){
  if(!isSuperAdmin) return;
  const input=document.getElementById('restoreSnapshotInput');
  if(!input) return;
  input.value='';
  input.click();
}
async function restoreSnapshotFromFile(file){
  if(!file||!isSuperAdmin||!storage.hasBackend()) return;
  const confirmed=await askConfirm(
    'Restaurar copia',
    'Se reemplazar\u00e1n guardias, biblioteca, historial y tareas con el contenido del backup seleccionado.',
    'Restaurar'
  );
  if(!confirmed) return;
  try{
    const payload=JSON.parse(await file.text());
    const result=await storage.restoreSnapshot(payload);
    backendHydrated=false;
    await hydrateFromBackend();
    renderTeacherPanel();
    renderTable();
    await refreshSuperAdminOps(true);
    const restoreTime=new Date(result?.restoredAt||Date.now()).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    setSuperAdminHint(`JSON restaurado a las ${restoreTime} \u00b7 ${file.name} \u00b7 Guardias: ${result?.counts?.guardias ?? 0}`,'success');
    showToast(`Copia restaurada. Guardias: ${result?.counts?.guardias ?? 0}.`,'success');
  }catch(error){
    console.warn('Snapshot restore failed',error);
    setSuperAdminHint(`Error al restaurar ${file?.name||'el backup JSON'}. Revisa el formato o la sesión.`,'error');
    showToast('No se pudo restaurar la copia.','error');
  }
}
function renderHistoryList(){
  const historyList=document.getElementById('historyList');
  const undoButton=document.getElementById('btnUndoHistory');
  if(!historyList) return;
  if(undoButton) undoButton.disabled=!getLastUndoableHistoryEntry();
  const visibles=historyFilter==='all'
    ? historialCambios
    : historialCambios.filter(entry=>(entry.type||'other')===historyFilter);
  const filterButtons=document.querySelectorAll('#historyFilters .history-filter');
  filterButtons.forEach(button=>{
    button.classList.toggle('active',button.dataset.filter===historyFilter);
  });
  if(!visibles.length){
    const texto=historyFilter==='all'
      ? 'Todavía no hay cambios registrados.'
      : 'No hay cambios de este tipo en el historial.';
    historyList.innerHTML=`<div class="history-empty">${texto}</div>`;
    return;
  }
  historyList.innerHTML=visibles.map(entry=>`<article class="history-item">
    <div class="history-item-head">
      <div class="history-item-title">${escapeHtml(entry.title||'Cambio')}</div>
      <div class="history-item-time">${escapeHtml(formatHistoryTimestamp(entry.ts))}</div>
    </div>
    <div class="history-item-body">${escapeHtml(entry.detail||'')}</div>
  </article>`).join('');
}
function setHistoryFilter(filter){
  historyFilter=filter||'all';
  renderHistoryList();
}
function restoreUndoState(state){
  if(!state) return false;
  data=normalizeStoredRows(cloneJson(state.data||[]));
  reassignAllGuardias();
  persist(data);
  nid=computeNextId(data);
  day=typeof state.day==='number'?state.day:day;
  renderPills();
  renderGuardiaBoard();
  renderTable();
  return true;
}
function updateClockUi(){
  if(resetWeeklyLocalStateIfNeeded()){
    data=normalizeStoredRows(load());
    nid=computeNextId(data);
    ordenGuardias=loadOrden();
    tareasProfesorado=loadTareas();
    historialCambios=loadHistorial();
    sessionOverrides=loadSessionOverrides();
    const wd=new Date().getDay();
    day=(wd>=1&&wd<=5)?wd-1:0;
    teacherDay=day;
    renderPills();
    renderGuardiaBoard();
    renderTable();
    renderHistoryList();
    renderSubstitutionList();
    renderFutureAbsenceAdminList();
    if(document.getElementById('teacherOverlay')?.classList.contains('open')){
      renderTeacherPanel();
    }
    if(storage.hasBackend()&&(isAdmin||isSuperAdmin)){
      backendHydrated=false;
      hydrateFromBackend();
    }
    showToast('Nueva semana lectiva iniciada. El calendario se ha reiniciado.','info');
  }
  applyApprovedFutureAbsencesForCurrentWeek().catch(error=>console.warn('Future absence auto-apply failed',error));
  document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  updateAdminControls();
}
function openHistoryModal(){
  if(!isAdmin) return;
  renderHistoryList();
  document.getElementById('historyOverlay')?.classList.add('open');
}
function closeHistoryModal(){
  document.getElementById('historyOverlay')?.classList.remove('open');
}
function bgHistoryClose(e){if(e.target.id==='historyOverlay') closeHistoryModal();}
function getFilteredSubstitutionTeachers(){
  const query=normalizeTeacherSearch(substitutionFilter);
  return ALL_PROFESORES.filter(nombre=>{
    if(!query) return true;
    return teacherMatchesQuery(nombre,query);
  });
}
function getPracticasGuardiasCandidateTeachers(){
  return ALL_PROFESORES.filter(nombre=>Object.values(getHorarioProfesorDia(nombre,0)).length||Object.values(getHorarioProfesorDia(nombre,1)).length||Object.values(getHorarioProfesorDia(nombre,2)).length||Object.values(getHorarioProfesorDia(nombre,3)).length||Object.values(getHorarioProfesorDia(nombre,4)).length)
    .filter(nombre=>DIAS.some((_,dia)=>Object.values(getHorarioProfesorDia(nombre,dia)).some(isPracticasSessionEligible)))
    .sort((a,b)=>a.localeCompare(b,'es'));
}
function getPracticasGuardiasFreedSlots(nombre){
  let total=0;
  for(let dia=0;dia<5;dia++){
    total+=Object.values(getHorarioProfesorDia(nombre,dia)).filter(isPracticasSessionEligible).length;
  }
  return total;
}
function getPracticasGuardiasManualSlotsCount(nombre){
  return teacherPracticasGuardiasTramos.filter(row=>row.profesor===nombre).length;
}
function getFilteredPracticasGuardiasTeachers(){
  const query=normalizeTeacherSearch(practicasGuardiasFilter);
  return getPracticasGuardiasCandidateTeachers().filter(nombre=>{
    if(!query) return true;
    return teacherMatchesQuery(nombre,query);
  });
}
function getPracticasGuardiasTeacherManualSlots(nombre){
  return teacherPracticasGuardiasTramos
    .filter(row=>row.profesor===nombre)
    .sort((a,b)=>a.dia-b.dia||a.hora-b.hora);
}
function renderSubstitutionList(){
  const list=document.getElementById('substitutionList');
  if(!list) return;
  const teachers=getFilteredSubstitutionTeachers();
  if(!teachers.length){
    list.innerHTML='<div class="history-empty">No hay profesores que coincidan con la b\u00fasqueda.</div>';
    return;
  }
  list.innerHTML=teachers.map(nombre=>{
    const sustituto=getVisibleTeacherName(nombre)!==nombre?getVisibleTeacherName(nombre):'';
    const meta=sustituto?`Titular: ${nombre}`:'Sin sustituto activo';
    return `<article class="substitution-item">
      <div>
        <div class="substitution-item-title">${escapeHtml(sustituto||nombre)}</div>
        <div class="substitution-item-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="substitution-item-actions">
        <button class="btn-substitution" type="button" data-substitution-action="assign" data-teacher-name="${escapeHtml(nombre)}">${sustituto?'Editar sustituto':'Asignar sustituto'}</button>
        ${sustituto?`<button class="btn-substitution btn-substitution-danger" type="button" data-substitution-action="clear" data-teacher-name="${escapeHtml(nombre)}">Restaurar titular</button>`:''}
      </div>
    </article>`;
  }).join('');
}
function renderPracticasGuardiasList(){
  const list=document.getElementById('practicasGuardiasList');
  const summary=document.getElementById('practicasGuardiasSummary');
  if(!list) return;
  const teachers=getFilteredPracticasGuardiasTeachers();
  const enabledSet=getTeacherPracticasGuardiasSet();
  if(summary){
    const candidates=getPracticasGuardiasCandidateTeachers().length;
    summary.innerHTML=`<span class="future-absence-chip"><strong>${enabledSet.size}</strong> habilitados</span><span class="future-absence-chip"><strong>${candidates}</strong> candidatos</span>`;
  }
  if(!teachers.length){
    list.innerHTML='<div class="history-empty">No hay profesorado de ciclos que coincida con la búsqueda.</div>';
    return;
  }
  list.innerHTML=teachers.map(nombre=>{
    const enabled=enabledSet.has(nombre);
    const slots=getPracticasGuardiasFreedSlots(nombre);
    const manualSlots=getPracticasGuardiasManualSlotsCount(nombre);
    return `<article class="substitution-item">
      <div>
        <div class="substitution-item-title">${escapeHtml(getVisibleTeacherName(nombre))}</div>
        <div class="substitution-item-meta">${escapeHtml(`${enabled?'Disponible para entrar en la rotacion':'Fuera de la rotacion'} · ${slots} horas potenciales por practicas · ${manualSlots} tramos manuales`)}</div>
      </div>
      <div class="substitution-item-actions">
        <button class="btn-substitution${enabled?' btn-substitution-danger':''}" type="button" data-practicas-guardias-toggle="${escapeHtml(nombre)}">${enabled?'Quitar de guardias':'Habilitar guardias'}</button>
        <button class="btn-substitution" type="button" data-practicas-guardias-config="${escapeHtml(nombre)}">Configurar horas</button>
      </div>
    </article>`;
  }).join('');
}
function openSubstitutionModal(){
  if(!isAdmin) return;
  substitutionFilter='';
  const input=document.getElementById('substitutionSearch');
  if(input) input.value='';
  renderSubstitutionList();
  document.getElementById('substitutionOverlay')?.classList.add('open');
}
function closeSubstitutionModal(){
  document.getElementById('substitutionOverlay')?.classList.remove('open');
}
function bgSubstitutionClose(e){if(e.target.id==='substitutionOverlay') closeSubstitutionModal();}
function openPracticasGuardiasModal(){
  if(!isAdmin) return;
  practicasGuardiasFilter='';
  const input=document.getElementById('practicasGuardiasSearch');
  if(input) input.value='';
  practicasGuardiasConfigTeacher='';
  renderPracticasGuardiasList();
  renderPracticasGuardiasConfig();
  document.getElementById('practicasGuardiasOverlay')?.classList.add('open');
}
function closePracticasGuardiasModal(){
  document.getElementById('practicasGuardiasOverlay')?.classList.remove('open');
}
function bgPracticasGuardiasClose(e){if(e.target.id==='practicasGuardiasOverlay') closePracticasGuardiasModal();}
function openPracticasGuardiasTeacherConfig(nombre){
  if(!isAdmin||!getProfesor(nombre)) return;
  practicasGuardiasConfigTeacher=nombre;
  renderPracticasGuardiasConfig();
}
function closePracticasGuardiasTeacherConfig(){
  practicasGuardiasConfigTeacher='';
  renderPracticasGuardiasConfig();
}
function renderPracticasGuardiasConfig(){
  const panel=document.getElementById('practicasGuardiasConfig');
  if(!panel) return;
  const nombre=practicasGuardiasConfigTeacher;
  if(!nombre||!getProfesor(nombre)){
    panel.innerHTML='<div class="history-empty">Selecciona un profesor y pulsa en "Configurar horas" para habilitar tramos concretos.</div>';
    return;
  }
  const manualSet=getTeacherPracticasGuardiasTramosSet();
  const rows=[];
  for(let dia=0;dia<5;dia++){
    const chips=[];
    for(let hora=1;hora<=9;hora++){
      if(HORAS_PATIO.has(hora)) continue;
      const sesion=resolveTeacherSession(nombre,dia,hora);
      const eligible=isPracticasSessionEligible(sesion);
      const manual=manualSet.has(makePracticasGuardiasSlotKey(nombre,dia,hora));
      const classes=['practicas-slot-chip',manual?'is-manual':'',eligible?'is-eligible':''].filter(Boolean).join(' ');
      const stateLabel=manual?'Manual':(eligible?'Practicas':'No activo');
      chips.push(`<button class="${classes}" type="button" data-practicas-slot-toggle="${escapeHtml(nombre)}|${dia}|${hora}" title="${escapeHtml(`${DIAS[dia]} · ${formatHoraLabel(hora)} · ${stateLabel}`)}">${escapeHtml(HORA_MAP[hora].label)}<span>${escapeHtml(stateLabel)}</span></button>`);
    }
    rows.push(`<div class="practicas-config-row"><div class="practicas-config-day">${escapeHtml(DIAS[dia])}</div><div class="practicas-config-slots">${chips.join('')}</div></div>`);
  }
  const manualSlots=getPracticasGuardiasTeacherManualSlots(nombre);
  const manualList=manualSlots.length
    ?manualSlots.map(row=>`${DIAS[row.dia]} ${formatHoraLabel(row.hora)}`).join(' ? ')
    :'Sin tramos manuales.';
  panel.innerHTML=`<article class="practicas-config-card">
    <div class="practicas-config-head">
      <div>
        <div class="substitution-item-title">${escapeHtml(getVisibleTeacherName(nombre))}</div>
        <div class="substitution-item-meta">Activa aqui tramos manuales aunque no entren por practicas de forma general.</div>
      </div>
      <div class="substitution-item-actions">
        <button class="btn-substitution" type="button" onclick="closePracticasGuardiasTeacherConfig()">Cerrar detalle</button>
      </div>
    </div>
    <div class="practicas-config-legend">
      <span class="future-absence-chip"><strong>Practicas</strong> hora elegible por horario</span>
      <span class="future-absence-chip"><strong>Manual</strong> hora forzada por Jefatura</span>
    </div>
    <div class="practicas-config-grid">${rows.join('')}</div>
    <div class="substitution-item-meta">Tramos manuales activos: ${escapeHtml(manualList)}</div>
  </article>`;
}
function formatFutureAbsenceDateLabel(value){
  if(!value) return 'Sin fecha';
  const date=new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function getFutureAbsenceSortValue(item){
  const dateValue=cleanText(item?.date);
  const date=new Date(`${dateValue}T00:00:00`);
  const time=Number.isNaN(date.getTime())?Number.MAX_SAFE_INTEGER:date.getTime();
  const firstHour=getFutureAbsenceHoursForEntry(item)[0]||99;
  return {time,firstHour};
}
function sortFutureAbsenceRowsForDisplay(rows){
  return (rows||[]).slice().sort((a,b)=>{
    const aSort=getFutureAbsenceSortValue(a);
    const bSort=getFutureAbsenceSortValue(b);
    return aSort.time-bSort.time||
      aSort.firstHour-bSort.firstHour||
      String(a.profesor||'').localeCompare(String(b.profesor||''),'es');
  });
}
function getFutureAbsenceTemporalMeta(item){
  const today=getCurrentDateIso();
  const dateValue=cleanText(item?.date);
  if(!dateValue) return '';
  if(dateValue===today) return 'Hoy';
  const todayDate=new Date(`${today}T00:00:00`);
  const targetDate=new Date(`${dateValue}T00:00:00`);
  if(Number.isNaN(todayDate.getTime())||Number.isNaN(targetDate.getTime())) return '';
  const diffDays=Math.round((targetDate.getTime()-todayDate.getTime())/86400000);
  if(diffDays===1) return 'MaÃ±ana';
  if(diffDays>1&&diffDays<=7) return 'Esta semana';
  if(diffDays<0) return 'Pasada';
  return '';
}
function getFutureAbsenceStatusGroupLabel(status){
  return status==='pending'?'Pendientes':status==='approved'?'Validadas':status==='applied'?'Aplicadas':status==='rejected'?'Rechazadas':'Otros avisos';
}
function groupFutureAbsenceRowsByStatus(rows){
  const statusOrder=['pending','approved','applied','rejected'];
  return statusOrder.map(status=>({
    status,
    label:getFutureAbsenceStatusGroupLabel(status),
    rows:sortFutureAbsenceRowsForDisplay(rows.filter(item=>(item.status||'pending')===status))
  })).filter(group=>group.rows.length);
}
function renderFutureAbsenceCard(item,options={}){
  const temporalMeta=getFutureAbsenceTemporalMeta(item);
  const temporalBadge=temporalMeta?`<span class="future-absence-time-badge">${escapeHtml(temporalMeta)}</span>`:'';
  const reviewedAtLabel=item.reviewedAt?new Date(item.reviewedAt).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  const actionsMarkup=options.showAdminActions?`<div class="substitution-item-actions">
      ${item.status==='pending'?`<button class="btn-substitution" type="button" data-future-absence-approve="${escapeHtml(item.id)}">Validar</button><button class="btn-substitution btn-substitution-danger" type="button" data-future-absence-reject="${escapeHtml(item.id)}">Rechazar</button>`:''}
      <button class="btn-substitution btn-substitution-danger" type="button" data-future-absence-delete="${escapeHtml(item.id)}">Eliminar aviso</button>
    </div>`:'';
  return `<article class="future-absence-item">
    <div class="future-absence-item-head">
      <div>
        <div class="future-absence-item-title">${escapeHtml(options.showTeacherName?(getVisibleTeacherName(item.profesor)||item.profesor):formatFutureAbsenceDateLabel(item.date))}</div>
        <div class="future-absence-item-date">${escapeHtml(options.showTeacherName?formatFutureAbsenceDateLabel(item.date):formatHourListLabel(getFutureAbsenceHoursForEntry(item)))}</div>
      </div>
      <div class="future-absence-item-meta">
        ${temporalBadge}
        <span class="future-absence-status ${getFutureAbsenceStatusClass(item.status)}">${escapeHtml(getFutureAbsenceStatusLabel(item.status))}</span>
      </div>
    </div>
    <div class="future-absence-item-note"><strong>Horas:</strong> ${escapeHtml(formatHourListLabel(getFutureAbsenceHoursForEntry(item)))}</div>
    ${options.showTeacherName?`<div class="future-absence-item-note"><strong>Profesor:</strong> ${escapeHtml(getVisibleTeacherName(item.profesor)||item.profesor)}</div>`:''}
    <div class="future-absence-item-note"><strong>Observaciones:</strong> ${escapeHtml(item.note||'Sin observaciones adicionales.')}</div>
    ${item.reviewerNote?`<div class="future-absence-item-note"><strong>Respuesta de Jefatura:</strong> ${escapeHtml(item.reviewerNote)}</div>`:''}
    ${reviewedAtLabel?`<div class="future-absence-item-note"><strong>Revisada:</strong> ${escapeHtml(reviewedAtLabel)}</div>`:''}
    ${actionsMarkup}
  </article>`;
}
function formatFutureAbsenceAdminSummary(rows){
  const counts=rows.reduce((acc,item)=>{
    const status=item.status||'pending';
    acc.total+=1;
    acc[status]=(acc[status]||0)+1;
    return acc;
  },{total:0,pending:0,approved:0,rejected:0,applied:0});
  return `
    <span class="future-absence-chip"><strong>${counts.total}</strong> avisos</span>
    <span class="future-absence-chip"><strong>${counts.pending}</strong> pendientes</span>
    <span class="future-absence-chip"><strong>${counts.approved}</strong> validadas</span>
    <span class="future-absence-chip"><strong>${counts.rejected}</strong> rechazadas</span>
    <span class="future-absence-chip"><strong>${counts.applied}</strong> aplicadas</span>
  `;
}
function renderFutureAbsenceAdminList(){
  const list=document.getElementById('futureAbsenceAdminList');
  const summary=document.getElementById('futureAbsenceAdminSummary');
  if(!list) return;
  const rows=sortFutureAbsenceRowsForDisplay(teacherFutureAbsences);
  if(summary) summary.innerHTML=rows.length?formatFutureAbsenceAdminSummary(rows):'';
  if(!rows.length){
    list.innerHTML='<div class="future-absence-empty">No hay faltas futuras comunicadas.</div>';
    return;
  }
  const teacherFilter=normalizeTeacherSearch(futureAbsenceAdminTeacherFilter);
  const filtered=rows.filter(item=>{
    if(futureAbsenceAdminStatusFilter!=='all'&&item.status!==futureAbsenceAdminStatusFilter) return false;
    if(teacherFilter){
      const visible=getVisibleTeacherName(item.profesor)||item.profesor;
      const haystack=[item.profesor,visible,makeTeacherUsername(visible)].map(normalizeTeacherSearch);
      if(!haystack.some(value=>value.includes(teacherFilter))) return false;
    }
    return true;
  });
  if(!filtered.length){
    list.innerHTML='<div class="future-absence-empty">No hay avisos que coincidan con el filtro actual.</div>';
    return;
  }
  const groups=groupFutureAbsenceRowsByStatus(filtered);
  list.innerHTML=groups.map(group=>`<section class="future-absence-group">
    <div class="future-absence-group-head">
      <h3>${escapeHtml(group.label)}</h3>
      <span class="future-absence-group-count">${group.rows.length}</span>
    </div>
    <div class="future-absence-group-list">${group.rows.map(item=>renderFutureAbsenceCard(item,{showTeacherName:true,showAdminActions:isAdmin})).join('')}</div>
  </section>`).join('');
}
function renderTeacherFutureAbsenceOwnList(){
  const list=document.getElementById('teacherFutureAbsenceOwnList');
  if(!list) return;
  const rows=sortFutureAbsenceRowsForDisplay(teacherFutureAbsences.filter(item=>item.profesor===teacherName));
  if(!rows.length){
    list.innerHTML='<div class="future-absence-empty">Todavía no has enviado avisos de falta futura.</div>';
    return;
  }
  const groups=groupFutureAbsenceRowsByStatus(rows);
  list.innerHTML=groups.map(group=>`<section class="future-absence-group">
    <div class="future-absence-group-head">
      <h3>${escapeHtml(group.label)}</h3>
      <span class="future-absence-group-count">${group.rows.length}</span>
    </div>
    <div class="future-absence-group-list">${group.rows.map(item=>renderFutureAbsenceCard(item,{showTeacherName:false,showAdminActions:false})).join('')}</div>
  </section>`).join('');
}
function getTeacherFutureAbsenceDaySelection(){
  const input=document.getElementById('teacherFutureAbsenceDate');
  const dateValue=cleanText(input?.value);
  if(!dateValue) return null;
  return getSchoolWeekInfoFromDate(dateValue);
}
function handleTeacherFutureAbsenceDateChange(){
  const hoursWrap=document.getElementById('teacherFutureAbsenceHours');
  const meta=document.getElementById('teacherFutureAbsenceDayMeta');
  if(!hoursWrap||!meta) return;
  const selection=getTeacherFutureAbsenceDaySelection();
  if(!selection||selection.dayIndex==null){
    meta.textContent='Selecciona una fecha lectiva para ver tus horas de clase.';
    hoursWrap.innerHTML='<div class="teacher-future-hours-empty">No hay horas para seleccionar.</div>';
    return;
  }
  const hours=getHorasLectivasProfesorDia(teacherName,selection.dayIndex);
  if(!hours.length){
    meta.textContent=`${DIAS[selection.dayIndex]} · Sin clases lectivas registradas.`;
    hoursWrap.innerHTML='<div class="teacher-future-hours-empty">Ese día no tienes clases lectivas en el horario cargado.</div>';
    return;
  }
  meta.textContent=`${DIAS[selection.dayIndex]} · Selecciona las horas que quieres comunicar.`;
  hoursWrap.innerHTML=hours.map(hora=>{
    const sesion=resolveTeacherSession(teacherName,selection.dayIndex,hora);
    const detalle=[sesion?.materia||'Clase',sesion?.grupo||'',sesion?.aula||'Sin aula'].filter(Boolean).join(' · ');
    return `<label class="teacher-future-hour-option"><input type="checkbox" data-future-hour value="${hora}" checked><span class="teacher-future-hour-copy"><span class="teacher-future-hour-title">${escapeHtml(formatHoraLabel(hora))}</span><span class="teacher-future-hour-meta">${escapeHtml(detalle)}</span></span></label>`;
  }).join('');
}
function openTeacherFutureAbsenceModal(){
  if(!teacherName) return;
  const nameInput=document.getElementById('teacherFutureAbsenceName');
  const dateInput=document.getElementById('teacherFutureAbsenceDate');
  const noteInput=document.getElementById('teacherFutureAbsenceNote');
  if(nameInput) nameInput.value=getVisibleTeacherName(teacherName);
  if(dateInput){ dateInput.min=getCurrentDateIso(); dateInput.value=''; }
  if(noteInput) noteInput.value='';
  handleTeacherFutureAbsenceDateChange();
  renderTeacherFutureAbsenceOwnList();
  document.getElementById('teacherFutureAbsenceOverlay')?.classList.add('open');
}
function closeTeacherFutureAbsenceModal(){
  document.getElementById('teacherFutureAbsenceOverlay')?.classList.remove('open');
}
function bgTeacherFutureAbsenceClose(e){if(e.target.id==='teacherFutureAbsenceOverlay') closeTeacherFutureAbsenceModal();}
async function submitTeacherFutureAbsence(){
  if(!teacherName) return;
  const dateInput=document.getElementById('teacherFutureAbsenceDate');
  const noteInput=document.getElementById('teacherFutureAbsenceNote');
  const dateValue=cleanText(dateInput?.value);
  const noteValue=cleanText(noteInput?.value);
  const selectedHours=[...document.querySelectorAll('#teacherFutureAbsenceHours [data-future-hour]:checked')].map(input=>Number(input.value)).filter(Number.isInteger);
  if(!dateValue){
    showToast('Indica la fecha de la falta prevista.','error');
    dateInput?.focus();
    return;
  }
  if(!selectedHours.length){
    showToast('Selecciona al menos una hora lectiva para ese día.','error');
    return;
  }
  const entry={
    id:`future-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    profesor:teacherName,
    date:dateValue,
    note:noteValue,
    hours:selectedHours,
    status:'pending',
    reviewerNote:'',
    reviewedAt:'',
    appliedAt:'',
    createdAt:new Date().toISOString()
  };
  const overlap=findOverlappingFutureAbsence(entry);
  if(overlap){
    showToast(`Ya existe un aviso para ${formatFutureAbsenceDateLabel(dateValue)} en las horas ${formatHourListLabel(getFutureAbsenceHoursForEntry(overlap))}.`, 'error');
    return;
  }
  try{
    const result=await createTeacherFutureAbsenceEntry(entry);
    closeTeacherFutureAbsenceModal();
    showToast(result?.syncError?'Aviso guardado en local. Pendiente de sincronizar con el servidor.':'Aviso de ausencia futura enviado.','success');
  }catch(error){
    console.warn('Teacher future absence create failed',error);
    showToast('No se pudo enviar el aviso.','error');
  }
}
function openFutureAbsenceAdminModal(){
  if(!isAdmin) return;
  const statusFilter=document.getElementById('futureAbsenceAdminStatusFilter');
  const teacherFilterInput=document.getElementById('futureAbsenceAdminTeacherFilter');
  if(statusFilter) statusFilter.value=futureAbsenceAdminStatusFilter;
  if(teacherFilterInput) teacherFilterInput.value=futureAbsenceAdminTeacherFilter;
  renderFutureAbsenceAdminList();
  document.getElementById('futureAbsenceAdminOverlay')?.classList.add('open');
}
function closeFutureAbsenceAdminModal(){
  document.getElementById('futureAbsenceAdminOverlay')?.classList.remove('open');
}
function bgFutureAbsenceAdminClose(e){if(e.target.id==='futureAbsenceAdminOverlay') closeFutureAbsenceAdminModal();}
async function handleFutureAbsenceAdminDelete(id){
  if(!isAdmin||!id) return;
  if(!await askConfirm('Eliminar aviso','Se eliminar? este aviso de ausencia futura.','Eliminar')) return;
  try{
    const result=await deleteTeacherFutureAbsenceEntry(id);
    showToast(result?.syncError?'Aviso eliminado en local. Pendiente de sincronizar con el servidor.':'Aviso eliminado.','success');
  }catch(error){
    console.warn('Teacher future absence delete failed',error);
    showToast('No se pudo eliminar el aviso.','error');
  }
}
async function reviewTeacherFutureAbsence(id,status){
  if(!isAdmin||!id) return;
  const current=teacherFutureAbsences.find(item=>item.id===id);
  if(!current) return;
  const reviewerNote=cleanText(await askText(status==='approved'?'Validar falta futura':'Rechazar falta futura',`Puedes dejar una respuesta breve para ${getVisibleTeacherName(current.profesor)||current.profesor}.`,current.reviewerNote||'','Respuesta opcional',status==='approved'?'Validar':'Rechazar'));
  const nextEntry={...current,status,reviewerNote,reviewedAt:new Date().toISOString()};
  try{
    const result=await updateTeacherFutureAbsenceEntry(nextEntry);
    if(status==='approved') await applyApprovedFutureAbsencesForCurrentWeek();
    showToast(result?.syncError?(status==='approved'?'Falta futura validada en local. Pendiente de sincronizar.':'Falta futura rechazada en local. Pendiente de sincronizar.'):(status==='approved'?'Falta futura validada.':'Falta futura rechazada.'),'success');
  }catch(error){
    console.warn('Teacher future absence review failed',error);
    showToast('No se pudo actualizar el aviso.','error');
  }
}
async function assignTeacherSubstitution(nombre){
  if(!isAdmin||!getProfesor(nombre)) return;
  const current=teacherSubstitutions[nombre]||'';
  const value=cleanText(await askText('Asignar sustituto',`Introduce el nombre del sustituto para ${getVisibleTeacherName(nombre)===nombre?nombre:getVisibleTeacherName(nombre)}.`,current,'Nombre del sustituto','Guardar'));
  if(!value) return;
  const validationError=validateTeacherSubstitutionName(nombre,value);
  if(validationError){
    showToast(validationError,'error');
    return;
  }
  teacherSubstitutions={...teacherSubstitutions,[nombre]:value};
  persistTeacherSubstitutions(teacherSubstitutions);
  if(teacherName===nombre) persistTeacherUser(getVisibleTeacherName(nombre));
  renderSubstitutionList();
  syncTeacherIdentity();
  renderGuardiaBoard();
  renderTable();
  if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
  showToast('Sustituto asignado correctamente.','success');
  syncAdminState();
}
async function clearTeacherSubstitution(nombre){
  if(!isAdmin||!teacherSubstitutions[nombre]) return;
  if(!await askConfirm('Restaurar titular',`Se restaurar\u00e1 el nombre original de ${nombre}.`,'Restaurar')) return;
  delete teacherSubstitutions[nombre];
  teacherSubstitutions={...teacherSubstitutions};
  persistTeacherSubstitutions(teacherSubstitutions);
  if(teacherName===nombre) persistTeacherUser(nombre);
  renderSubstitutionList();
  syncTeacherIdentity();
  renderGuardiaBoard();
  renderTable();
  if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
  showToast('Titular restaurado.','success');
  syncAdminState();
}
async function toggleTeacherPracticasGuardias(nombre){
  if(!isAdmin||!getProfesor(nombre)) return;
  const enabled=isTeacherPracticasGuardiasEnabled(nombre);
  teacherPracticasGuardias=enabled
    ?teacherPracticasGuardias.filter(item=>item!==nombre)
    :[...teacherPracticasGuardias,nombre];
  teacherPracticasGuardias=[...new Set(teacherPracticasGuardias)].sort((a,b)=>a.localeCompare(b,'es'));
  persistTeacherPracticasGuardias(teacherPracticasGuardias);
  refreshOrdenGuardias();
  reassignAllGuardias();
  persist(data);
  renderPracticasGuardiasList();
  renderPracticasGuardiasConfig();
  renderGuardiaBoard();
  renderTable();
  showToast(enabled?'Profesor retirado de la rotaci\u00f3n por pr\u00e1cticas.':'Profesor habilitado para entrar en guardias por pr\u00e1cticas.','success');
  syncAdminState();
}
async function toggleTeacherPracticasGuardiasSlot(nombre,dia,hora){
  if(!isAdmin||!getProfesor(nombre)||HORAS_PATIO.has(hora)) return;
  const key=makePracticasGuardiasSlotKey(nombre,dia,hora);
  const current=getTeacherPracticasGuardiasTramosSet();
  if(current.has(key)){
    teacherPracticasGuardiasTramos=teacherPracticasGuardiasTramos.filter(row=>makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora)!==key);
  }else{
    teacherPracticasGuardiasTramos=[...teacherPracticasGuardiasTramos,{profesor:nombre,dia,hora}];
  }
  persistTeacherPracticasGuardiasTramos(teacherPracticasGuardiasTramos);
  refreshOrdenGuardias();
  reassignAllGuardias();
  persist(data);
  renderPracticasGuardiasList();
  renderPracticasGuardiasConfig();
  renderGuardiaBoard();
  renderTable();
  showToast(current.has(key)?'Tramo manual retirado de guardias.':'Tramo manual habilitado para guardias.','success');
  syncAdminState();
}
async function clearHistory(){
  if(!isAdmin) return;
  if(!await askConfirm('Borrar historial','Se eliminaran todas las entradas del historial de cambios.','Borrar')) return;
  historialCambios=[];
  persistHistorial(historialCambios);
  renderHistoryList();
  showToast('Historial borrado.','success');
  syncAdminState();
}
async function undoLastHistoryChange(){
  if(!isAdmin) return;
  const entry=getLastUndoableHistoryEntry();
  if(!entry){
    showToast('No hay cambios para deshacer.','info');
    return;
  }
  if(!await askConfirm('Deshacer \u00faltimo cambio',`Se revertir\u00e1: ${entry.title}.`,'Deshacer')) return;
  const currentState=buildUndoState(typeof entry.undoState?.day==='number'?entry.undoState.day:day);
  if(!restoreUndoState(entry.undoState)){
    showToast('No se pudo deshacer el cambio.','error');
    return;
  }
  entry.undoState=null;
  entry.reverted=true;
  persistHistorial(historialCambios);
  addHistoryEntry('Cambio deshecho',`Se revirti\u00f3: ${entry.title}`,'undo',{undoState:currentState});
  renderHistoryList();
  document.getElementById('saveTs').textContent='Deshecho - '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  showToast('\u00daltimo cambio deshecho.','success');
}
function renderTable(){
  const rows=getSelectedRowsForDay(day);
  const editableWeek=isCurrentWeekOffset(weekOffset);
  const tb=document.getElementById('tbody');
  if(!rows.length){tb.innerHTML=`<tr class="empty-row"><td colspan="7">No hay ausencias registradas para ${editableWeek?'este dÃ­a':'esta vista futura'}.</td></tr>`;}
  else{
    tb.innerHTML=rows.map(g=>{
      const h=HORA_MAP[g.hora]||{label:g.hora+'a',rango:''};
      const cub=g.guardia&&g.guardia.trim();
      const sugerido=cub||getGuardiaSugerida(day,g.hora,1,getRowsForWeekOffset(weekOffset));
      const faenaInfo=resolveFaena(g);
      const aula=resolveAulaRegistro(g)||'-';
      const ausenteNombre=getVisibleTeacherName(g.ausente);
      const guardiaNombre=sugerido?getVisibleTeacherName(sugerido):'';
      const guardiaEstado=g.futurePlanned?(g.futureStatus==='approved'||g.futureStatus==='applied'?(cub?'Guardia planificada':'Cobertura prevista'):'Pendiente de validar'):(sugerido?(cub?'':'Guardia prevista'):'Sin cobertura');
      const guardiaBadgeClass=g.futurePlanned
        ?(g.futureStatus==='approved'||g.futureStatus==='applied'?'b-ok status-pill':'status-pill teacher-duty-badge')
        :(sugerido?(cub?'b-ok status-pill':'status-pill teacher-duty-badge'):'b-nok status-pill');
      const guardiaChipClass=sugerido?(cub?'guardia-chip guardia-chip-assigned chip-strong':'guardia-chip guardia-chip-suggested chip-strong'):'';
      const statusText=g.futurePlanned
        ?(g.futureStatus==='approved'?'Validada':g.futureStatus==='applied'?'Aplicada':g.futureStatus==='pending'?'Pendiente':'Planificada')
        :(sugerido?(cub?'Cubierta':'Pendiente de confirmar'):'Sin cubrir');
      const planningMeta=g.futurePlanned?`<span class="badge future-plan-badge ${g.futureStatus==='pending'?'future-plan-badge-pending':'future-plan-badge-approved'}">${g.futureStatus==='pending'?'Falta futura pendiente':'Falta futura validada'}</span>`:'';
      return `<tr class="${g.futurePlanned?'future-planned-row':''}">
        <td>
          <div class="cell-stack cell-stack-hour">
            <div class="hora-num">${HORA_MAP[g.hora].label} hora</div>
            <div class="hora-range">${h.rango.replace('-', ' - ')}</div>
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <div class="cell-label">Ausente</div>
            ${planningMeta}
            <div class="guardia-slot">
              <div class="chip chip-absence chip-strong"><div class="avatar av-red">${initials(ausenteNombre)}</div>${escapeHtml(ausenteNombre)}</div>
            </div>
            ${g.futurePlanned?`<div class="cell-meta">Planificada para ${escapeHtml(formatFutureAbsenceDateLabel(g.futureDate))}</div>`:''}
          </div>
        </td>
        <td>
          ${sugerido?`<div class="cell-stack"><div class="cell-label">Cubre</div><div class="guardia-slot"><div class="chip ${guardiaChipClass}"><div class="avatar av-yellow">${initials(guardiaNombre)}</div>${escapeHtml(guardiaNombre)}</div></div><div class="cell-meta">${guardiaEstado}</div></div>`:`<div class="cell-stack"><div class="cell-label">Cubre</div><span class="sin-asignar">Sin asignar</span><div class="cell-meta">No hay profesor disponible en este turno.</div></div>`}
        </td>
        <td>
          <div class="cell-stack cell-stack-compact">
            <div class="cell-label">Aula</div>
            <div class="guardia-slot"><span class="aula-tag">${escapeHtml(aula)}</span></div>
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <div class="cell-label">Tarea</div>
            <div class="guardia-slot">
              ${g.futurePlanned?`<span class="badge ${g.futureStatus==='pending'?'teacher-duty-badge':'b-ok'}">${g.futureStatus==='pending'?'Pendiente':'Planificada'}</span>`:(faenaInfo.faena?`<div class="faena-status"><span class="badge b-ok">Con tarea</span>${faenaInfo.obs?`<details class="faena-toggle"><summary></summary><div class="faena-text">${escapeHtml(faenaInfo.obs)}</div></details>`:''}</div>`:`<span class="badge b-nok">Sin tarea</span>`)}
            </div>
          </div>
        </td>
        <td>
          <div class="cell-stack cell-stack-compact">
            <div class="cell-label">Estado</div>
            <div class="guardia-slot"><span class="badge ${guardiaBadgeClass}">${statusText}</span></div>
          </div>
        </td>
        <td style="${isAdmin?'':'display:none'}">${isAdmin&&editableWeek&&Number.isInteger(Number(g.id))?`<button class="btn-edit" onclick="openModal(${g.id})">Editar</button>`:'<span class="cell-meta">Solo lectura</span>'}</td>
      </tr>`;
    }).join('');
  }
  const aus=rows.length;
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const asig=rows.filter(g=>(g.guardia&&g.guardia.trim())||getGuardiaSugerida(day,g.hora,1,rowsSource)).length;
  document.getElementById('thAcc').style.display=isAdmin?'':'none';
  document.getElementById('sAus').textContent=aus;
  document.getElementById('sAsig').textContent=asig;
  document.getElementById('sSin').textContent=Math.max(aus-asig,0);
  document.getElementById('sFaena').textContent=rows.filter(g=>!g.futurePlanned&&resolveFaena(g).faena).length;
}
async function toggleAdmin(){
  if(!isAdmin){
    const pw=await askPassword('Acceso Jefatura','Introduce la contrase\u00f1a de Jefatura de Estudios.');
    if(!pw) return;
    if(!await loginRole('admin',pw)){
      if(pw) showToast('Contrase\u00f1a incorrecta.','error');
      return;
    }
    renderTable();
    showToast('Modo Jefatura activado.','info');
    return;
  }
  await logoutCurrentRole();
  renderTable();
  showToast('Modo Jefatura desactivado.','info');
}
async function toggleSuperAdmin(){
  if(!SUPERADMIN_ENABLED) return;
  if(!isSuperAdmin){
    const pw=await askPassword('Acceso Superadmin','Introduce la contrase\u00f1a del modo superadmin.');
    if(!pw) return;
    if(!await loginRole('superadmin',pw)){
      if(pw) showToast('Contrase\u00f1a incorrecta.','error');
      return;
    }
    renderTable();
    showToast('Modo Superadmin activado.','info');
    return;
  }
  await logoutCurrentRole();
  if(SUPERADMIN_ENABLED){
    window.location.href=window.location.pathname;
    return;
  }
  renderTable();
  showToast('Modo Superadmin desactivado.','info');
}
function renderTeacherAccessPreview(){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  const preview=document.getElementById('teacherAccessPreview');
  if(!teacherLoginInput||!preview) return;
  const nombre=getProfesorNombreSeleccionado(teacherLoginInput.value);
  if(!nombre){
    preview.innerHTML='Selecciona tu nombre para entrar en tu panel.';
    return;
  }
  const profesor=getProfesor(nombre);
  const visibleName=getVisibleTeacherName(nombre);
  const summary=getTeacherSummaryForDay(nombre,day);
  const nextSession=summary.nextHour?resolveTeacherSession(nombre,day,summary.nextHour):null;
  const nextLabel=summary.nextHour&&nextSession?`${formatHoraLabel(summary.nextHour)} - ${nextSession.materia||nextSession.detalle||'Sesión'}`:'Sin sesiones lectivas hoy';
  preview.innerHTML=`
    <div class="teacher-access-preview-title">${escapeHtml(visibleName)}</div>
    <div class="teacher-access-preview-meta">Usuario: ${escapeHtml(makeTeacherUsername(visibleName))}${profesor?.departamento?` \u00b7 ${escapeHtml(profesor.departamento)}`:''}${getTeacherDisplayMeta(nombre)?` \u00b7 ${escapeHtml(getTeacherDisplayMeta(nombre))}`:''}</div>
    <div class="teacher-access-preview-stats">
      <span class="teacher-access-preview-stat">${summary.horas.length} sesiones hoy</span>
      <span class="teacher-access-preview-stat">${escapeHtml(nextLabel)}</span>
    </div>
  `;
}
function renderTeacherAccessRecents(){
  const recentContainer=document.getElementById('teacherAccessRecent');
  if(!recentContainer) return;
  teacherRecents=loadTeacherRecents();
  if(!teacherRecents.length){
    recentContainer.hidden=true;
    recentContainer.innerHTML='';
    return;
  }
  recentContainer.hidden=false;
  recentContainer.innerHTML=teacherRecents.map(nombre=>`<button class="teacher-access-chip" type="button" data-teacher-name="${escapeHtml(nombre)}">${escapeHtml(getVisibleTeacherName(nombre))}</button>`).join('');
}
function closeTeacherAccessSuggestions(){
  const suggestions=document.getElementById('teacherAccessSuggestions');
  if(!suggestions) return;
  suggestions.hidden=true;
}
function renderTeacherAccessSuggestions(forceOpen=false){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  const suggestions=document.getElementById('teacherAccessSuggestions');
  if(!teacherLoginInput||!suggestions) return;
  const hasFocus=document.activeElement===teacherLoginInput;
  const query=normalizeTeacherSearch(teacherLoginInput.value);
  teacherRecents=loadTeacherRecents();
  teacherAccessMatches=getTeacherAccessMatches(teacherLoginInput.value);
  const selected=getProfesorNombreSeleccionado(teacherLoginInput.value);
  if(!query && !selected){
    suggestions.innerHTML='';
    suggestions.hidden=true;
    return;
  }
  if(selected){
    teacherAccessActiveIndex=teacherAccessMatches.findIndex(nombre=>nombre===selected);
  }else if(teacherAccessActiveIndex>=teacherAccessMatches.length){
    teacherAccessActiveIndex=teacherAccessMatches.length?0:-1;
  }
  if(!teacherAccessMatches.length){
    suggestions.innerHTML='<div class="teacher-access-suggestion-empty">No hay coincidencias.</div>';
    suggestions.hidden=!(forceOpen||hasFocus);
    return;
  }
  suggestions.innerHTML=teacherAccessMatches.map((nombre,index)=>{
    const summary=getTeacherSummaryForDay(nombre,day);
    const detail=summary.horas.length?`${summary.horas.length} sesiones hoy`:'Sin clases hoy';
    const recentBadge=teacherRecents.includes(nombre)?'<span class="teacher-access-suggestion-badge">Reciente</span>':'';
    const visibleName=getVisibleTeacherName(nombre);
    return `<button class="teacher-access-suggestion${index===teacherAccessActiveIndex?' active':''}" type="button" data-teacher-name="${escapeHtml(nombre)}">
      <span class="teacher-access-suggestion-row">
        <span>${escapeHtml(visibleName)}</span>
        ${recentBadge}
      </span>
      <span class="teacher-access-suggestion-user">${escapeHtml(makeTeacherUsername(visibleName))}</span>
      <span class="teacher-access-suggestion-meta">${escapeHtml(getTeacherDisplayMeta(nombre)||detail)}</span>
    </button>`;
  }).join('');
  suggestions.hidden=!(forceOpen||hasFocus);
}
function selectTeacherAccessSuggestion(nombre){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  if(!teacherLoginInput) return;
  teacherLoginInput.value=getVisibleTeacherName(nombre);
  teacherAccessActiveIndex=teacherAccessMatches.findIndex(item=>item===nombre);
  renderTeacherAccessPreview();
  closeTeacherAccessSuggestions();
  teacherLoginInput.blur();
}
function handleTeacherAccessInput(){
  teacherAccessActiveIndex=-1;
  renderTeacherAccessPreview();
  renderTeacherAccessSuggestions(true);
}
function handleTeacherAccessKeydown(event){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  if(!teacherLoginInput) return;
  if(event.key==='ArrowDown'){
    event.preventDefault();
    teacherAccessMatches=getTeacherAccessMatches(teacherLoginInput.value);
    if(!teacherAccessMatches.length) return;
    teacherAccessActiveIndex=(teacherAccessActiveIndex+1+teacherAccessMatches.length)%teacherAccessMatches.length;
    renderTeacherAccessSuggestions(true);
    return;
  }
  if(event.key==='ArrowUp'){
    event.preventDefault();
    teacherAccessMatches=getTeacherAccessMatches(teacherLoginInput.value);
    if(!teacherAccessMatches.length) return;
    teacherAccessActiveIndex=(teacherAccessActiveIndex-1+teacherAccessMatches.length)%teacherAccessMatches.length;
    renderTeacherAccessSuggestions(true);
    return;
  }
  if(event.key==='Enter'){
    if(teacherAccessActiveIndex>=0&&teacherAccessMatches[teacherAccessActiveIndex]){
      event.preventDefault();
      selectTeacherAccessSuggestion(teacherAccessMatches[teacherAccessActiveIndex]);
      return;
    }
    const nombre=getProfesorNombreSeleccionado(teacherLoginInput.value);
    if(nombre){
      event.preventDefault();
      loginTeacher();
    }
    return;
  }
  if(event.key==='Escape'){
    closeTeacherAccessSuggestions();
  }
}
function openTeacherAccess(resetSelection){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  const teacherAccessOverlay=document.getElementById('teacherAccessOverlay');
  if(!teacherLoginInput||!teacherAccessOverlay){openTeacherPanelFallback();return;}
  teacherLoginInput.value=resetSelection?'':getVisibleTeacherName(teacherName||'');
  teacherAccessActiveIndex=-1;
  renderTeacherAccessRecents();
  renderTeacherAccessPreview();
  teacherAccessOverlay.classList.add('open');
  teacherLoginInput.focus();
  teacherLoginInput.select();
  renderTeacherAccessSuggestions(true);
}
function closeTeacherAccess(){
  const teacherAccessOverlay=document.getElementById('teacherAccessOverlay');
  if(teacherAccessOverlay) teacherAccessOverlay.classList.remove('open');
  closeTeacherAccessSuggestions();
}
function bgTeacherAccessClose(e){if(e.target.id==='teacherAccessOverlay')closeTeacherAccess();}
function changeTeacherUser(){
  closeTeacherPanel();
  openTeacherAccess(true);
}
function loginTeacher(){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  if(!teacherLoginInput) return;
  const nombre=getProfesorNombreSeleccionado(teacherLoginInput.value);
  if(!nombre){showToast('Selecciona tu nombre de la lista.','error');teacherLoginInput.focus();renderTeacherAccessSuggestions(true);return;}
  teacherName=nombre;
  teacherDay=day;
  teacherWeekOffset=weekOffset;
  persistTeacherUser(nombre);
  persistTeacherRecents([nombre,...teacherRecents.filter(item=>item!==nombre)]);
  teacherRecents=loadTeacherRecents();
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
  teacherWeekOffset=weekOffset;
  syncTeacherIdentity();
  document.getElementById('teacherOverlay').classList.add('open');
  document.getElementById('teacherBar').classList.add('show');
  renderTeacherPanel();
}
function openTeacherPanel(){if(!getProfesor(teacherName)){openTeacherAccess();return;}teacherDay=day;teacherWeekOffset=weekOffset;syncTeacherIdentity();document.getElementById('teacherOverlay').classList.add('open');document.getElementById('teacherBar').classList.add('show');renderTeacherPanel();}
function closeTeacherPanel(){document.getElementById('teacherOverlay').classList.remove('open');}
function exitTeacherMode(){
  closeTeacherPanel();
  closeTeacherAccess();
  teacherName='';
  persistTeacherUser('');
  document.getElementById('teacherBar').classList.remove('show');
  syncTeacherIdentity();
}
function setTeacherDay(dia){teacherDay=dia;renderTeacherPanel();}
function changeTeacherWeekOffset(delta){
  teacherWeekOffset=Math.max(-1,Math.min(3,teacherWeekOffset+delta));
  renderTeacherPanel();
}
function toggleTeacherSessionPanel(dia,hora){
  const panel=document.getElementById(`teacherSessionPanel-${dia}-${hora}`);
  const button=document.getElementById(`teacherSessionToggle-${dia}-${hora}`);
  if(!panel||!button) return;
  const hiddenNext=!panel.hidden;
  panel.hidden=hiddenNext;
  button.textContent=hiddenNext?'Abrir bloque':'Ocultar bloque';
  button.setAttribute('aria-expanded',hiddenNext?'false':'true');
}
function focusTeacherDutyHour(hora){
  const card=document.querySelector(`[data-teacher-hour="${hora}"]`);
  if(!card) return;
  card.scrollIntoView({behavior:'smooth',block:'center'});
  card.classList.remove('teacher-session-duty-focus');
  void card.offsetWidth;
  card.classList.add('teacher-session-duty-focus');
  if(teacherDutyFocusTimer) window.clearTimeout(teacherDutyFocusTimer);
  teacherDutyFocusTimer=window.setTimeout(()=>{card.classList.remove('teacher-session-duty-focus');},1800);
}
async function saveTeacherTask(dia,hora,exitAfter){
  if(!isTeacherCurrentWeek()){
    showToast('Solo puedes editar tareas en la semana actual.','info');
    return;
  }
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  const sesionBase=getHorarioProfesorDia(teacherName,dia)?.[hora];
  if(!sesionBase) return;
  const tarea=document.getElementById(`taskText-${dia}-${hora}`).value.trim();
  const dejada=document.getElementById(`taskCheck-${dia}-${hora}`).checked||!!tarea;
  const overrideKey=makeSessionKey(teacherName,dia,hora);
  const nextOverride={
    materia:document.getElementById(`sessionMateria-${dia}-${hora}`).value.trim()||sesionBase.materia||'',
    grupo:document.getElementById(`sessionGrupo-${dia}-${hora}`).value.trim(),
    detalle:document.getElementById(`sessionDetalle-${dia}-${hora}`).value.trim()||sesionBase.detalle||'',
    aula:document.getElementById(`sessionAula-${dia}-${hora}`).value.trim()
  };
  const normalizedBase={
    materia:sesionBase.materia||'',
    grupo:sesionBase.grupo||'',
    detalle:sesionBase.detalle||'',
    aula:sesionBase.aula||''
  };
  if(JSON.stringify(nextOverride)===JSON.stringify(normalizedBase)){
    delete sessionOverrides[overrideKey];
  }else{
    sessionOverrides[overrideKey]=nextOverride;
  }
  persistSessionOverrides(sessionOverrides);
  const tareaKey=makeTareaKey(teacherName,dia,hora);
  if(!dejada && !tarea){
    delete tareasProfesorado[tareaKey];
  }else{
    tareasProfesorado[tareaKey]={profesor:teacherName,dia,hora,dejada,tarea};
  }
  persistTareas(tareasProfesorado);
  const syncResult=await syncTeacherTaskEntry(
    overrideKey,
    sessionOverrides[overrideKey]?{...sessionOverrides[overrideKey],dia,hora}:null,
    tareaKey,
    tareasProfesorado[tareaKey]?{...tareasProfesorado[tareaKey]}:null
  );
  if(exitAfter){
    renderTable();
    showToast(syncResult?.syncError?'Tarea guardada en local. Pendiente de sincronizar con el servidor.':'Tarea guardada correctamente.','success');
    exitTeacherMode();
    return;
  }
  renderTeacherPanel();
  renderTable();
  showToast(syncResult?.syncError?'Tarea guardada en local. Pendiente de sincronizar con el servidor.':'Tarea guardada correctamente.','success');
}
function renderTeacherPanel(){
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  renderWeekLabel();
  syncTeacherIdentity();
  document.getElementById('teacherName').textContent=getVisibleTeacherName(profesor.nombre);
  document.getElementById('teacherMeta').textContent=`${getVisibleTeacherName(profesor.nombreCompleto||profesor.nombre)} - ${profesor.departamento}${getTeacherDisplayMeta(teacherName)?` - ${getTeacherDisplayMeta(teacherName)}`:''}`;
  const sesiones=getHorarioProfesorDia(teacherName,teacherDay);
  const horas=Object.keys(sesiones).map(Number).sort((a,b)=>a-b);
  const currentTeacherWeek=isTeacherCurrentWeek();
  const teacherRowsForDay=getTeacherWeekRowsForDay(teacherDay);
  const overview=document.getElementById('teacherOverview');
  const totalConTarea=currentTeacherWeek?horas.filter(hora=>{const tarea=getTareaProfesor(teacherName,teacherDay,hora);return !!(tarea?.dejada||tarea?.tarea);}).length:0;
  const dutyAssignments=teacherRowsForDay
    .filter(row=>row.guardia===teacherName)
    .map(row=>({
      ...row,
      faenaInfo:currentTeacherWeek?resolveFaena(row):{faena:false,obs:''},
      aula:resolveAulaRegistro(row)
    }));
  const futureOwnRows=sortFutureAbsenceRowsForDisplay(teacherFutureAbsences.filter(item=>item.profesor===teacherName));
  const pendingFutureCount=futureOwnRows.filter(item=>(item.status||'pending')==='pending').length;
  const nextFutureAbsence=futureOwnRows.find(item=>['pending','approved','applied'].includes(item.status||'pending'))||null;
  const nextDuty=dutyAssignments.slice().sort((a,b)=>a.hora-b.hora)[0]||null;
  document.getElementById('teacherSummary').textContent=`${DIAS[teacherDay]} \u00b7 ${horas.length} sesiones \u00b7 ${totalConTarea} con tarea \u00b7 ${dutyAssignments.length} coberturas${currentTeacherWeek?'':` \u00b7 semana futura`}`;
  const dutyAlert=document.getElementById('teacherDutyAlert');
  if(dutyAlert){
    if(dutyAssignments.length){
      dutyAlert.hidden=false;
      dutyAlert.innerHTML=`<div class="teacher-duty-alert-title">${currentTeacherWeek?'Guardia asignada':'Guardia prevista'}</div><div class="teacher-duty-alert-copy">${currentTeacherWeek?'Hoy cubres':'En esta semana cubres'} ${dutyAssignments.length} ${dutyAssignments.length===1?'ausencia':'ausencias'}. Pr\u00f3xima cobertura: ${escapeHtml(getVisibleTeacherName(nextDuty.ausente))} en ${escapeHtml(nextDuty.aula||'Sin aula')} (${escapeHtml(formatHoraLabel(nextDuty.hora))}). Pulsa aqu\u00ed para ir a esa hora.</div>`;
      dutyAlert.onclick=()=>focusTeacherDutyHour(nextDuty.hora);
      dutyAlert.setAttribute('role','button');
      dutyAlert.setAttribute('tabindex','0');
      dutyAlert.onkeydown=event=>{
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();
          focusTeacherDutyHour(nextDuty.hora);
        }
      };
    }else{
      dutyAlert.hidden=true;
      dutyAlert.innerHTML='';
      dutyAlert.onclick=null;
      dutyAlert.onkeydown=null;
      dutyAlert.removeAttribute('role');
      dutyAlert.removeAttribute('tabindex');
    }
  }
  document.getElementById('teacherBarName').textContent=`${getVisibleTeacherName(profesor.nombre)} - ${profesor.departamento}`;
  document.getElementById('teacherDayPills').innerHTML=DIAS.map((nombreDia,index)=>`<button class="${index===teacherDay?'active':''}" onclick="setTeacherDay(${index})">${nombreDia}</button>`).join('');
  if(overview){
    overview.innerHTML=`
      <article class="teacher-overview-card">
        <div class="teacher-overview-label">Hoy tengo clase</div>
        <div class="teacher-overview-value">${horas.length}</div>
        <div class="teacher-overview-copy">${horas.length?`Próxima sesión: ${escapeHtml(formatHoraLabel(horas[0]))}`:'Sin clases lectivas registradas para este día.'}</div>
        <button class="btn-teacher-panel teacher-overview-action" type="button" onclick="document.getElementById('teacherSessions')?.scrollIntoView({behavior:'smooth',block:'start'})">Ver sesiones</button>
      </article>
      <article class="teacher-overview-card teacher-overview-card-duty">
        <div class="teacher-overview-label">Hoy estoy de guardia</div>
        <div class="teacher-overview-value">${dutyAssignments.length}</div>
        <div class="teacher-overview-copy">${nextDuty?`Próxima cobertura: ${escapeHtml(getVisibleTeacherName(nextDuty.ausente))} · ${escapeHtml(formatHoraLabel(nextDuty.hora))}`:'No tienes coberturas asignadas en este día.'}</div>
        <button class="btn-teacher-panel teacher-overview-action" type="button" ${nextDuty?'':'disabled'} onclick="${nextDuty?`focusTeacherDutyHour(${nextDuty.hora})`:''}">${nextDuty?'Ir a mi guardia':'Sin guardias'}</button>
      </article>
      <article class="teacher-overview-card">
        <div class="teacher-overview-label">Próximas faltas</div>
        <div class="teacher-overview-value">${futureOwnRows.length}</div>
        <div class="teacher-overview-copy">${nextFutureAbsence?`${escapeHtml(formatFutureAbsenceDateLabel(nextFutureAbsence.date))} · ${escapeHtml(formatHourListLabel(getFutureAbsenceHoursForEntry(nextFutureAbsence)))}`:'No tienes avisos pendientes.'}${pendingFutureCount?` Pendientes: ${pendingFutureCount}.`:''}</div>
        <button class="btn-teacher-panel teacher-overview-action teacher-overview-action-primary" type="button" onclick="openTeacherFutureAbsenceModal()">Avisar falta futura</button>
      </article>
    `;
  }
  if(!horas.length){
    document.getElementById('teacherSessions').innerHTML='<div class="teacher-session"><div class="teacher-session-empty">No tienes sesiones registradas para este d\u00eda.</div></div>';
    return;
  }
  document.getElementById('teacherSessions').innerHTML=horas.map(hora=>{
    const sesion=resolveTeacherSession(teacherName,teacherDay,hora);
    const grupo=sesion.grupo?GRUPOS_PROFESORADO[sesion.grupo]?.nombre||sesion.grupo:'';
    const aula=sesion.aula||'Sin aula';
    const tarea=currentTeacherWeek?getTareaProfesor(teacherName,teacherDay,hora):null;
    const checked=tarea?!!(tarea.dejada||tarea.tarea):false;
    const texto=tarea?.tarea||'';
    const detalleVisible=grupo||sesion.detalle||'Sin detalle adicional';
    const guardiaTasks=sesion.tipo==='guardia'?dutyAssignments.filter(item=>item.hora===hora):[];
    const dutyBadge=guardiaTasks.length?`<span class="badge teacher-duty-badge">${currentTeacherWeek?'Te toca cubrir':'Cobertura prevista'}</span>`:''; 
    const openByDefault=checked||!!texto||guardiaTasks.length;
    const guardiaTasksMarkup=guardiaTasks.length?`<div class="teacher-guardia-tasks">${guardiaTasks.map(item=>`
      <article class="teacher-guardia-task">
        <div class="teacher-guardia-task-head">
          <div class="teacher-guardia-task-title">Cubres a ${escapeHtml(getVisibleTeacherName(item.ausente))}</div>
          <span class="badge ${item.faenaInfo.faena?'b-ok':'b-nok'}">${item.faenaInfo.faena?'Con tarea':'Sin tarea'}</span>
        </div>
        <div class="teacher-guardia-task-meta">${escapeHtml(formatHoraLabel(item.hora))} \u00b7 ${escapeHtml(item.aula||'Sin aula')}</div>
        ${item.faenaInfo.obs?`<div class="teacher-guardia-task-text">${escapeHtml(item.faenaInfo.obs)}</div>`:''}
      </article>
    `).join('')}</div>`:'';
    const sessionKindLabel=sesion.tipo==='guardia'?'Guardia':sesion.materia||sesion.tipo;
    return `<div class="teacher-session${guardiaTasks.length?' teacher-session-duty':''}" data-teacher-hour="${hora}">
      <div class="teacher-session-head">
        <div class="teacher-session-summary">
          <div class="teacher-session-slot">${HORA_MAP[hora].label} hora</div>
          <div class="teacher-session-title">${sessionKindLabel}</div>
          <div class="teacher-session-meta">${detalleVisible}</div>
        </div>
        <div class="teacher-session-side">
          <div class="teacher-session-meta">${HORA_MAP[hora].rango}</div>
          <div class="teacher-session-badges">
            ${dutyBadge}
            <span class="badge ${checked?'b-ok':'b-nok'}">${checked?'Con tarea':'Sin tarea'}</span>
            <span class="badge b-biblio">${aula}</span>
          </div>
          <button class="teacher-edit-toggle" id="teacherSessionToggle-${teacherDay}-${hora}" type="button" onclick="toggleTeacherSessionPanel(${teacherDay},${hora})" aria-expanded="${openByDefault?'true':'false'}">${openByDefault?'Ocultar bloque':'Abrir bloque'}</button>
        </div>
      </div>
      <div class="teacher-session-quick">
        <div class="teacher-quick-item"><span class="teacher-quick-label">Grupo</span><span class="teacher-quick-value">${escapeHtml(grupo||'Sin grupo')}</span></div>
        <div class="teacher-quick-item"><span class="teacher-quick-label">Aula</span><span class="teacher-quick-value">${escapeHtml(aula)}</span></div>
        <div class="teacher-quick-item"><span class="teacher-quick-label">Tarea</span><span class="teacher-quick-value">${checked?(texto?escapeHtml(texto.slice(0,72)+(texto.length>72?'...':'')):'Marcada para el grupo'):'No has dejado tarea todavía'}</span></div>
      </div>
      <div class="teacher-session-panel" id="teacherSessionPanel-${teacherDay}-${hora}" ${openByDefault?'':'hidden'}>
        <div class="fg">
          <label>Tarea para este grupo</label>
          <textarea id="taskText-${teacherDay}-${hora}" placeholder="${currentTeacherWeek?'Indica que debe hacer el grupo':'Las tareas solo se registran en la semana actual'}" ${currentTeacherWeek?'':'readonly'}>${texto}</textarea>
        </div>
        <label class="teacher-check">
          <input id="taskCheck-${teacherDay}-${hora}" type="checkbox" ${checked?'checked':''} ${currentTeacherWeek?'':'disabled'}>
          <span>He dejado tarea para este grupo</span>
        </label>
        ${guardiaTasksMarkup}
        <details class="teacher-session-settings">
          <summary>${currentTeacherWeek?'Ajustes de la sesión':'Ver datos de la sesión'}</summary>
          <div class="teacher-session-edit">
            <div class="teacher-session-grid">
              <div class="fg">
                <label>Materia</label>
                <input id="sessionMateria-${teacherDay}-${hora}" type="text" value="${sesion.materia||''}" ${currentTeacherWeek?'':'readonly'}>
              </div>
              <div class="fg">
                <label>Aula</label>
                <input id="sessionAula-${teacherDay}-${hora}" type="text" value="${sesion.aula||''}" ${currentTeacherWeek?'':'readonly'}>
              </div>
              <div class="fg">
                <label>Grupo</label>
                <input id="sessionGrupo-${teacherDay}-${hora}" type="text" value="${sesion.grupo||''}" ${currentTeacherWeek?'':'readonly'}>
              </div>
              <div class="fg">
                <label>Detalle</label>
                <input id="sessionDetalle-${teacherDay}-${hora}" type="text" value="${sesion.detalle||''}" ${currentTeacherWeek?'':'readonly'}>
              </div>
            </div>
          </div>
      </div>
        </details>
      <div class="teacher-actions">
        ${currentTeacherWeek?`<button class="teacher-save" type="button" onclick="saveTeacherTask(${teacherDay},${hora},false)">Guardar tarea</button>
        <button class="teacher-save-exit" type="button" onclick="saveTeacherTask(${teacherDay},${hora},true)">Guardar y salir</button>`:`<div class="teacher-meta">Vista de planificación. La edición se habilita en la semana actual.</div>`}
      </div>
      </div>
    </div>`;
  }).join('');
}
function syncTodoDiaMode(){
  const todoDiaInput=document.getElementById('fTodoDia');
  const guardiaInput=document.getElementById('fGuardia');
  if(!todoDiaInput||!guardiaInput) return;
  guardiaInput.disabled=true;
  guardiaInput.placeholder='La guardia se asigna automaticamente';
  setFieldError('fGuardia','');
}
function openModal(id){if(!isCurrentWeekOffset(weekOffset)){showToast('La ediciÃ³n solo estÃ¡ disponible en la semana actual.','info');return;}editId=id||null;const g=id?data.find(x=>x.id===id):null;const aula=g?resolveAulaRegistro(g):'';const faenaInfo=g?resolveFaena(g):{faena:false,obs:''};clearAbsenceFormErrors();document.getElementById('mTitle').textContent=g?'Editar ausencia':'Nueva ausencia';document.getElementById('btnDel').style.display=g?'':'none';document.getElementById('fDia').value=g?g.dia:day;document.getElementById('fHora').value=g?g.hora:1;document.getElementById('fAusente').value=g?getVisibleTeacherName(g.ausente):'';document.getElementById('fGuardia').value=g?getVisibleTeacherName(g.guardia):'';document.getElementById('fAula').value=aula;document.getElementById('fTodoDia').checked=false;document.getElementById('fFaena').checked=faenaInfo.faena;document.getElementById('fObs').value=faenaInfo.obs||'';populateProfesoresGuardia();syncAulaFromProfesor(!g||!aula);syncTodoDiaMode();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();closeAusenteSuggestions();document.getElementById('overlay').classList.add('open');}
function renderAusentePreview(){
  const input=document.getElementById('fAusente');
  const preview=document.getElementById('ausentePreview');
  if(!input||!preview) return;
  const nombre=getProfesorNombreSeleccionado(input.value);
  if(!nombre){
    preview.textContent='Empieza a escribir para localizar al profesor.';
    return;
  }
  const dia=+document.getElementById('fDia').value;
  const hora=+document.getElementById('fHora').value;
  const aula=getAulaProfesor(nombre,dia,hora)||'Sin aula registrada';
  const horas=getHorasLectivasProfesorDia(nombre,dia);
  preview.textContent=`${getVisibleTeacherName(nombre)} \u00b7 ${DIAS[dia]} \u00b7 ${horas.length} sesiones lectivas \u00b7 ${aula}`;
}
function renderAbsenceDecisionBar(){
  const panel=document.getElementById('absenceDecisionBar');
  if(!panel) return;
  const input=document.getElementById('fAusente');
  if(!input){
    panel.textContent='Selecciona profesor y hora para ver aula, cobertura prevista y tarea disponible.';
    return;
  }
  const nombre=getProfesorNombreSeleccionado(input.value);
  if(!nombre){
    panel.textContent='Selecciona profesor y hora para ver aula, cobertura prevista y tarea disponible.';
    return;
  }
  const dia=+document.getElementById('fDia').value;
  const hora=+document.getElementById('fHora').value;
  const todoDia=!!document.getElementById('fTodoDia')?.checked;
  const aula=getAulaProfesor(nombre,dia,hora)||document.getElementById('fAula')?.value.trim()||'Sin aula';
  const guardia=getGuardiaSugerida(dia,hora,1);
  const formObs=document.getElementById('fObs')?.value.trim()||'';
  const formFaena=!!document.getElementById('fFaena')?.checked||!!formObs;
  const tarea=getAbsenceTaskState(nombre,dia,hora,formFaena,formObs);
  const horasLectivas=todoDia?getHorasLectivasProfesorDia(nombre,dia):[];
  const extras=[];
  if(todoDia) extras.push(`Se aplicar\u00e1 a ${horasLectivas.length} ${horasLectivas.length===1?'sesi\u00f3n lectiva':'sesiones lectivas'}`);
  if(tarea.faena&&tarea.obs) extras.push(`Tarea: ${escapeHtml((tarea.obs||'').slice(0,90)+((tarea.obs||'').length>90?'...':''))}`);
  panel.innerHTML=`<strong>Aula:</strong> ${escapeHtml(aula)} | <strong>Guardia prevista:</strong> ${escapeHtml(guardia?getVisibleTeacherName(guardia):'Sin cobertura')} | <strong>Tarea:</strong> ${tarea.faena?'Disponible':'No registrada'}${extras.length?` | ${extras.join(' ? ')}`:''}`;
}function closeModal(){document.getElementById('overlay').classList.remove('open');}
function bgClose(e){if(e.target.id==='overlay')closeModal();}
function populateProfesoresAusencias(){
  renderAusenteSuggestions(false);
}
function closeAusenteSuggestions(){
  const suggestions=document.getElementById('ausenteSuggestions');
  if(!suggestions) return;
  suggestions.hidden=true;
}
function renderAusenteSuggestions(forceOpen=false){
  const input=document.getElementById('fAusente');
  const suggestions=document.getElementById('ausenteSuggestions');
  if(!input||!suggestions) return;
  const query=normalizeTeacherSearch(input.value);
  const selected=getProfesorNombreSeleccionado(input.value);
  if(!query && !selected){
    suggestions.innerHTML='';
    suggestions.hidden=true;
    return;
  }
  absenceMatches=getAbsenceMatches(input.value);
  if(selected){
    absenceActiveIndex=absenceMatches.findIndex(nombre=>nombre===selected);
  }else if(absenceActiveIndex>=absenceMatches.length){
    absenceActiveIndex=absenceMatches.length?0:-1;
  }
  if(!absenceMatches.length){
    suggestions.innerHTML='<div class="absence-suggestion-empty">No hay coincidencias.</div>';
    suggestions.hidden=!forceOpen;
    return;
  }
  suggestions.innerHTML=absenceMatches.map((nombre,index)=>{
    const dia=+document.getElementById('fDia').value;
    const hora=+document.getElementById('fHora').value;
    const aula=getAulaProfesor(nombre,dia,hora)||'Sin aula registrada';
    return `<button class="absence-suggestion${index===absenceActiveIndex?' active':''}" type="button" data-teacher-name="${escapeHtml(nombre)}">
      <span>${escapeHtml(getVisibleTeacherName(nombre))}</span>
      <span class="absence-suggestion-meta">${escapeHtml(getTeacherDisplayMeta(nombre)||aula)}</span>
    </button>`;
  }).join('');
  suggestions.hidden=!forceOpen;
}
function selectAusenteSuggestion(nombre){
  const input=document.getElementById('fAusente');
  if(!input) return;
  input.value=getVisibleTeacherName(nombre);
  absenceActiveIndex=absenceMatches.findIndex(item=>item===nombre);
  syncAulaFromProfesor(true);
  syncGuardiaPreview();
  renderAusentePreview();
  renderAbsenceDecisionBar();
  closeAusenteSuggestions();
}
function handleAusenteInput(){
  absenceActiveIndex=-1;
  syncAulaFromProfesor(false);
  syncGuardiaPreview();
  renderAusentePreview();
  renderAbsenceDecisionBar();
  renderAusenteSuggestions(true);
  setFieldError('fAusente','');
}
function handleAusenteKeydown(event){
  const input=document.getElementById('fAusente');
  if(!input) return;
  if(event.key==='ArrowDown'){
    event.preventDefault();
    absenceMatches=getAbsenceMatches(input.value);
    if(!absenceMatches.length) return;
    absenceActiveIndex=(absenceActiveIndex+1+absenceMatches.length)%absenceMatches.length;
    renderAusenteSuggestions(true);
    return;
  }
  if(event.key==='ArrowUp'){
    event.preventDefault();
    absenceMatches=getAbsenceMatches(input.value);
    if(!absenceMatches.length) return;
    absenceActiveIndex=(absenceActiveIndex-1+absenceMatches.length)%absenceMatches.length;
    renderAusenteSuggestions(true);
    return;
  }
  if(event.key==='Enter'&&absenceActiveIndex>=0&&absenceMatches[absenceActiveIndex]){
    event.preventDefault();
    selectAusenteSuggestion(absenceMatches[absenceActiveIndex]);
    return;
  }
  if(event.key==='Escape'){
    closeAusenteSuggestions();
  }
}
function syncAulaFromProfesor(force){
  const dia=+document.getElementById('fDia').value;
  const hora=+document.getElementById('fHora').value;
  const ausente=getProfesorNombreSeleccionado(document.getElementById('fAusente').value);
  const aulaInput=document.getElementById('fAula');
  const aulaReal=ausente?getAulaProfesor(ausente,dia,hora):'';
  if(force||!aulaInput.value.trim()) aulaInput.value=aulaReal;
}
function setFieldError(fieldId,message){
  const input=document.getElementById(fieldId);
  const error=document.getElementById(`${fieldId}Error`);
  if(input) input.classList.toggle('is-invalid',!!message);
  if(error) error.textContent=message||'';
}
function clearAbsenceFormErrors(){
  ['fDia','fHora','fAusente','fGuardia','fAula'].forEach(fieldId=>setFieldError(fieldId,''));
}
function findDuplicateAbsence(dia,hora,ausente){
  return data.find(item=>item.dia===dia&&item.hora===hora&&item.ausente===ausente&&item.id!==editId) || null;
}
function validateAbsenceForm(){
  const dia=+document.getElementById('fDia').value;
  const hora=+document.getElementById('fHora').value;
  const todoDia=document.getElementById('fTodoDia').checked;
  const ausenteInput=document.getElementById('fAusente');
  const aulaInput=document.getElementById('fAula');
  const ausente=getProfesorNombreSeleccionado(ausenteInput.value);
  clearAbsenceFormErrors();
  if(!ausente){
    setFieldError('fAusente','Selecciona un profesor ausente del listado.');
    return {valid:false,focus:ausenteInput};
  }
  if(!todoDia && findDuplicateAbsence(dia,hora,ausente)){
    setFieldError('fAusente','Ya existe una ausencia registrada para ese profesor en esa hora.');
    return {valid:false,focus:ausenteInput};
  }
  if(todoDia){
    const horasLectivas=getHorasLectivasProfesorDia(ausente,dia);
    if(!horasLectivas.length){
      setFieldError('fAusente','Ese profesor no tiene horas lectivas registradas ese d\u00eda.');
      return {valid:false,focus:ausenteInput};
    }
    return {valid:true,ausente,guardia:'',todoDia:true,horasLectivas};
  }
  if(!aulaInput.value.trim() && !getAulaProfesor(ausente,dia,hora)){
    setFieldError('fAula','Indica el aula o lugar de la ausencia.');
    return {valid:false,focus:aulaInput};
  }
  return {valid:true,ausente,guardia:'',todoDia:false,horasLectivas:[hora]};
}
function clearAusenteSelection(){
  const ausenteInput=document.getElementById('fAusente');
  const aulaInput=document.getElementById('fAula');
  if(!ausenteInput||!aulaInput) return;
  ausenteInput.value='';
  aulaInput.value='';
  absenceActiveIndex=-1;
  clearAbsenceFormErrors();
  renderAusentePreview();
  renderAbsenceDecisionBar();
  closeAusenteSuggestions();
  ausenteInput.focus();
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
  profesoresGuardia.innerHTML=guardias.map(nombre=>`<option value="${escapeHtml(getVisibleTeacherName(nombre))}"></option>`).join('');
  if(guardiaInput.value && !getGuardiaNombreSeleccionado(guardiaInput.value,dia,hora)) guardiaInput.value='';
}
function syncGuardiaPreview(){
  const fDia=document.getElementById('fDia');
  const fHora=document.getElementById('fHora');
  const guardiaInput=document.getElementById('fGuardia');
  const todoDiaInput=document.getElementById('fTodoDia');
  if(!fDia||!fHora||!guardiaInput||!todoDiaInput) return;
  if(todoDiaInput.checked){
    guardiaInput.value='';
    guardiaInput.placeholder='Se asignar\u00e1 autom\u00e1ticamente en cada hora';
    return;
  }
  const dia=Number(fDia.value);
  const hora=Number(fHora.value);
  const sugerida=getGuardiaSugerida(dia,hora,1)||'';
  guardiaInput.value=getVisibleTeacherName(sugerida);
  guardiaInput.placeholder=sugerida?'Asignaci\u00f3n autom\u00e1tica prevista':'Sin guardia disponible';
}
function save(){
  const dia=+document.getElementById('fDia').value;
  const hora=+document.getElementById('fHora').value;
  const validation=validateAbsenceForm();
  if(!validation.valid){
    showToast('Revisa los campos marcados antes de guardar.','error');
    if(validation.focus) validation.focus.focus();
    return;
  }
  const ausente=validation.ausente;
  const guardia=validation.guardia;
  const todoDia=validation.todoDia;
  const obs=document.getElementById('fObs').value.trim();
  const faena=!!document.getElementById('fFaena').checked||!!obs;
  const aulaManual=document.getElementById('fAula').value.trim();
  const horasObjetivo=validation.horasLectivas;
  const previousRow=editId?data.find(g=>g.id===editId):null;
  const undoState=buildUndoState(dia);

  document.getElementById('fAusente').value=getVisibleTeacherName(ausente);
  document.getElementById('fGuardia').value='';

  if(editId&&!todoDia){
    const aulaReal=getAulaProfesor(ausente,dia,hora)||aulaManual;
    const taskState=getAbsenceTaskState(ausente,dia,hora,faena,obs);
    const i=data.findIndex(g=>g.id===editId);
    data[i]={dia,hora,ausente,guardia:'',aula:aulaReal,faena:taskState.faena,obs:taskState.obs,id:editId};
    if(previousRow && (previousRow.dia!==dia || previousRow.hora!==hora)){
      reassignGuardiasForDayHours(previousRow.dia,[previousRow.hora]);
    }
    reassignGuardiasForDayHours(dia,[hora]);
    addHistoryEntry('Ausencia editada',`${formatHistoryAbsence(previousRow)} -> ${formatHistoryAbsence(data[i])}`,'edit',{undoState});
  }else{
    if(editId){
      data=data.filter(g=>g.id!==editId);
    }
    horasObjetivo.forEach(horaItem=>{
      const aulaReal=getAulaProfesor(ausente,dia,horaItem)||aulaManual;
      const taskState=getAbsenceTaskState(ausente,dia,horaItem,faena,obs);
      const existing=data.find(g=>g.dia===dia&&g.hora===horaItem&&g.ausente===ausente);
      const entry={dia,hora:horaItem,ausente,guardia:'',aula:aulaReal,faena:taskState.faena,obs:taskState.obs};
      if(existing){
        Object.assign(existing,entry);
      }else{
        data.push({...entry,id:nid++});
      }
    });
    if(editId && previousRow && (previousRow.dia!==dia || !horasObjetivo.includes(previousRow.hora))){
      reassignGuardiasForDayHours(previousRow.dia,[previousRow.hora]);
    }
    reassignGuardiasForDayHours(dia,horasObjetivo);
    if(todoDia){
      addHistoryEntry('Ausencia de d\u00eda completo',`${DIAS[dia]} \u00b7 ${ausente} \u00b7 ${horasObjetivo.map(formatHoraLabel).join(', ')}`,'create',{undoState});
    }else{
      const savedRow=data.find(g=>g.dia===dia&&g.hora===hora&&g.ausente===ausente);
      addHistoryEntry('Nueva ausencia',formatHistoryAbsence(savedRow),'create',{undoState});
    }
  }

  persist(data);
  clearAbsenceFormErrors();
  closeModal();
  if(day!==dia) setDay(dia); else renderTable();
  document.getElementById('saveTs').textContent='Guardado - '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  showToast(todoDia?`Ausencia de d\u00eda completo registrada en ${horasObjetivo.length} horas.`:'Ausencia guardada correctamente.','success');
  syncAdminState();
}
async function del(){
  if(!await askConfirm('Eliminar registro','\u00bfQuieres eliminar este registro de ausencia?','Eliminar')) return;
  const previousRow=data.find(g=>g.id===editId);
  const undoState=buildUndoState(previousRow?.dia ?? day);
  data=data.filter(g=>g.id!==editId);
  if(previousRow) reassignGuardiasForDayHours(previousRow.dia,[previousRow.hora]);
  persist(data);
  if(previousRow) addHistoryEntry('Ausencia eliminada',formatHistoryAbsence(previousRow),'delete',{undoState});
  closeModal();
  renderTable();
  showToast('Registro eliminado.','success');
  syncAdminState();
}
document.getElementById('fDia').addEventListener('change',()=>{populateProfesoresGuardia();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();renderAusenteSuggestions(true);setFieldError('fDia','');});
document.getElementById('fHora').addEventListener('change',()=>{populateProfesoresGuardia();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();renderAusenteSuggestions(true);setFieldError('fHora','');});
document.getElementById('fDia').addEventListener('change',()=>syncAulaFromProfesor(true));
document.getElementById('fHora').addEventListener('change',()=>syncAulaFromProfesor(true));
document.getElementById('fTodoDia').addEventListener('change',()=>{syncTodoDiaMode();syncGuardiaPreview();renderAbsenceDecisionBar();});
document.getElementById('fAusente').addEventListener('change',()=>{syncAulaFromProfesor(true);syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();renderAusenteSuggestions(true);setFieldError('fAusente','');});
document.getElementById('fAusente').addEventListener('input',handleAusenteInput);
document.getElementById('fAusente').addEventListener('focus',()=>renderAusenteSuggestions(true));
document.getElementById('fAusente').addEventListener('click',()=>renderAusenteSuggestions(true));
document.getElementById('fAusente').addEventListener('keydown',handleAusenteKeydown);
document.getElementById('fAusente').addEventListener('blur',()=>window.setTimeout(closeAusenteSuggestions,120));
document.getElementById('fGuardia').addEventListener('input',()=>setFieldError('fGuardia',''));
document.getElementById('fGuardia').addEventListener('change',()=>setFieldError('fGuardia',''));
document.getElementById('fAula').addEventListener('input',()=>{setFieldError('fAula','');renderAbsenceDecisionBar();});
const ausenteSuggestions=document.getElementById('ausenteSuggestions');
if(ausenteSuggestions){
  ausenteSuggestions.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-teacher-name]');
    if(!button) return;
    event.preventDefault();
    selectAusenteSuggestion(button.dataset.teacherName||'');
  });
}
const substitutionSearch=document.getElementById('substitutionSearch');
if(substitutionSearch){
  substitutionSearch.addEventListener('input',event=>{
    substitutionFilter=event.target.value||'';
    renderSubstitutionList();
  });
}
const practicasGuardiasSearch=document.getElementById('practicasGuardiasSearch');
if(practicasGuardiasSearch){
  practicasGuardiasSearch.addEventListener('input',event=>{
    practicasGuardiasFilter=event.target.value||'';
    renderPracticasGuardiasList();
  });
}
const substitutionList=document.getElementById('substitutionList');
if(substitutionList){
  substitutionList.addEventListener('click',event=>{
    const button=event.target.closest('[data-substitution-action][data-teacher-name]');
    if(!button) return;
    const teacherName=button.dataset.teacherName||'';
    if(button.dataset.substitutionAction==='assign'){
      assignTeacherSubstitution(teacherName);
      return;
    }
    if(button.dataset.substitutionAction==='clear'){
      clearTeacherSubstitution(teacherName);
    }
  });
}
const practicasGuardiasList=document.getElementById('practicasGuardiasList');
if(practicasGuardiasList){
  practicasGuardiasList.addEventListener('click',event=>{
    const button=event.target.closest('[data-practicas-guardias-toggle]');
    if(button){
      toggleTeacherPracticasGuardias(button.dataset.practicasGuardiasToggle||'');
      return;
    }
    const configButton=event.target.closest('[data-practicas-guardias-config]');
    if(configButton){
      openPracticasGuardiasTeacherConfig(configButton.dataset.practicasGuardiasConfig||'');
    }
  });
}
const practicasGuardiasConfig=document.getElementById('practicasGuardiasConfig');
if(practicasGuardiasConfig){
  practicasGuardiasConfig.addEventListener('click',event=>{
    const button=event.target.closest('[data-practicas-slot-toggle]');
    if(!button) return;
    const [profesor,dia,hora]=(button.dataset.practicasSlotToggle||'').split('|');
    toggleTeacherPracticasGuardiasSlot(profesor||'',Number(dia),Number(hora));
  });
}
const futureAbsenceAdminList=document.getElementById('futureAbsenceAdminList');
if(futureAbsenceAdminList){
  futureAbsenceAdminList.addEventListener('click',event=>{
    const deleteButton=event.target.closest('[data-future-absence-delete]');
    if(deleteButton){
      handleFutureAbsenceAdminDelete(deleteButton.dataset.futureAbsenceDelete||'');
      return;
    }
    const approveButton=event.target.closest('[data-future-absence-approve]');
    if(approveButton){
      reviewTeacherFutureAbsence(approveButton.dataset.futureAbsenceApprove||'','approved');
      return;
    }
    const rejectButton=event.target.closest('[data-future-absence-reject]');
    if(rejectButton){
      reviewTeacherFutureAbsence(rejectButton.dataset.futureAbsenceReject||'','rejected');
    }
  });
}
const futureAbsenceAdminStatusFilterInput=document.getElementById('futureAbsenceAdminStatusFilter');
if(futureAbsenceAdminStatusFilterInput){
  futureAbsenceAdminStatusFilterInput.addEventListener('change',event=>{
    futureAbsenceAdminStatusFilter=event.target.value||'all';
    renderFutureAbsenceAdminList();
  });
}
const futureAbsenceAdminTeacherFilterInput=document.getElementById('futureAbsenceAdminTeacherFilter');
if(futureAbsenceAdminTeacherFilterInput){
  futureAbsenceAdminTeacherFilterInput.addEventListener('input',event=>{
    futureAbsenceAdminTeacherFilter=event.target.value||'';
    renderFutureAbsenceAdminList();
  });
}
const teacherLoginInput=document.getElementById('teacherLoginName');
if(teacherLoginInput){
  teacherLoginInput.addEventListener('input',handleTeacherAccessInput);
  teacherLoginInput.addEventListener('change',handleTeacherAccessInput);
  teacherLoginInput.addEventListener('focus',()=>renderTeacherAccessSuggestions(true));
  teacherLoginInput.addEventListener('click',()=>renderTeacherAccessSuggestions(true));
  teacherLoginInput.addEventListener('keydown',handleTeacherAccessKeydown);
  teacherLoginInput.addEventListener('blur',()=>window.setTimeout(closeTeacherAccessSuggestions,120));
}
const teacherAccessSuggestions=document.getElementById('teacherAccessSuggestions');
if(teacherAccessSuggestions){
  teacherAccessSuggestions.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-teacher-name]');
    if(!button) return;
    event.preventDefault();
    selectTeacherAccessSuggestion(button.dataset.teacherName||'');
  });
}
const teacherAccessRecent=document.getElementById('teacherAccessRecent');
if(teacherAccessRecent){
  teacherAccessRecent.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-teacher-name]');
    if(!button) return;
    event.preventDefault();
    selectTeacherAccessSuggestion(button.dataset.teacherName||'');
  });
}
const restoreSnapshotInput=document.getElementById('restoreSnapshotInput');
if(restoreSnapshotInput){
  restoreSnapshotInput.addEventListener('change',event=>{
    const file=event.target.files?.[0];
    if(file) restoreSnapshotFromFile(file);
  });
}
function safeInitStep(fn,name){
  try{fn();}
  catch(error){
    console.error(`Init step failed: ${name}`,error);
  }
}
safeInitStep(populateProfesoresAusencias,'populateProfesoresAusencias');
safeInitStep(populateProfesoresGuardia,'populateProfesoresGuardia');
safeInitStep(syncGuardiaPreview,'syncGuardiaPreview');
safeInitStep(()=>{reassignAllGuardias();persist(data);},'reassignAllGuardias');
safeInitStep(renderPills,'renderPills');
safeInitStep(renderGuardiaBoard,'renderGuardiaBoard');
safeInitStep(renderTable,'renderTable');
safeInitStep(renderSubstitutionList,'renderSubstitutionList');
safeInitStep(renderPracticasGuardiasList,'renderPracticasGuardiasList');
safeInitStep(renderPracticasGuardiasConfig,'renderPracticasGuardiasConfig');
safeInitStep(renderFutureAbsenceAdminList,'renderFutureAbsenceAdminList');
safeInitStep(renderTeacherFutureAbsenceOwnList,'renderTeacherFutureAbsenceOwnList');
safeInitStep(syncTeacherIdentity,'syncTeacherIdentity');
safeInitStep(refreshAccessUi,'refreshAccessUi');
safeInitStep(()=>{initializeApp().catch(error=>console.error('Init step failed: initializeApp',error));},'initializeApp');
window.setInterval(()=>{hydrateTeacherFutureAbsences();pollBackendState();},BACKEND_POLL_INTERVAL_MS);
window.setInterval(()=>{
  if(isSuperAdmin){
    refreshSuperAdminOps(false);
  }
},SUPERADMIN_INFO_REFRESH_MS);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){
    hydrateTeacherSubstitutions();
    hydrateTeacherPracticasGuardias();
    hydrateTeacherFutureAbsences();
    pollBackendState();
    if(isSuperAdmin){
      refreshSuperAdminOps(true);
    }
  }
});
window.addEventListener('guardias-auth-invalid',()=>{
  if(!isAdmin&&!isSuperAdmin) return;
  isAdmin=false;
  isSuperAdmin=false;
  refreshAccessUi();
  renderTable();
  showToast('La sesi\u00f3n ha caducado.','error');
});































