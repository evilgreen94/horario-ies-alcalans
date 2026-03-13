const HORA_MAP={1:{label:'1a',rango:'08:15-09:10'},2:{label:'2a',rango:'09:10-10:05'},3:{label:'3a',rango:'10:05-11:00'},4:{label:'4a',rango:'11:00-11:25'},5:{label:'5a',rango:'11:25-12:20'},6:{label:'6a',rango:'12:20-13:15'},7:{label:'7a',rango:'13:15-14:10'},8:{label:'8a',rango:'14:10-14:25'},9:{label:'9a',rango:'14:25-15:20'}};
const HORAS_PATIO=new Set([4,8,9]);
const DIAS=['Lunes','Martes','Mi\u00e9rcoles','Jueves','Viernes'];
const KEY='IES_Alcalans_Guardias';
const KEY_ORDEN='IES_Alcalans_Guardias_OrdenHora';
const KEY_TAREAS='IES_Alcalans_Tareas_Profesorado';
const KEY_TEACHER_USER='IES_Alcalans_Profesorado_Actual';
const KEY_SESSION_OVERRIDES='IES_Alcalans_Sesiones_Profesorado';
const KEY_BIBLIOTECA='IES_Alcalans_Biblioteca_Guardias';
const KEY_HISTORIAL='IES_Alcalans_Historial_Cambios';
const RAW_PROFESORADO=(window.PROFESORADO_SOURCE&&Array.isArray(window.PROFESORADO_SOURCE.teachers))?window.PROFESORADO_SOURCE.teachers:[];
const GRUPOS_PROFESORADO={};
const storage=window.GuardiasStorage;
function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
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
function stripDiacritics(value){return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function toTitleCase(value){return cleanText(value).toLowerCase().replace(/(^|[\s(\/-])([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00e0\u00e8\u00ec\u00f2\u00f9\u00fc\u00f1\u00e7])/g,(m,p1,p2)=>p1+p2.toUpperCase());}
const DIA_INDEX={'lunes':0,'martes':1,'miercoles':2,'mi\u00e9rcoles':2,'jueves':3,'viernes':4};
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
let isSuperAdmin=false;
let teacherName='';
let teacherDay=0;
let teacherAccessMatches=[];
let teacherAccessActiveIndex=-1;
const demo=[];
const APP_URL_PARAMS=new URLSearchParams(window.location.search||'');
const SUPERADMIN_ENABLED=APP_URL_PARAMS.get('panel')==='superadmin';
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
function loadSessionOverrides(){return storage.readJson(KEY_SESSION_OVERRIDES,{});}
function persistSessionOverrides(d){storage.writeJson(KEY_SESSION_OVERRIDES,d);}
function persistBibliotecaAssignments(d){storage.writeJson(KEY_BIBLIOTECA,d);}
function loadHistorial(){return storage.readJson(KEY_HISTORIAL,[]);}
function persistHistorial(d){storage.writeJson(KEY_HISTORIAL,d);}
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
  const partes=[formatDiaHora(row.dia,row.hora),row.ausente];
  const aula=resolveAulaRegistro(row)||row.aula||'';
  if(aula) partes.push(aula);
  if(row.guardia) partes.push(`Guardia: ${row.guardia}`);
  return partes.join(' \u00b7 ');
}
function buildUndoState(targetDay){
  return {
    data:cloneJson(data),
    biblioteca:cloneJson(bibliotecaGuardias),
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
    const d=storage.readJson(KEY_BIBLIOTECA,null);
    return d?ensureBibliotecaAssignments(d):buildDefaultBibliotecaAssignments();
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
function loadOrden(){try{const d=storage.readJson(KEY_ORDEN,null);return d?ensureOrden(d):buildInitialOrden();}catch(e){return buildInitialOrden();}}
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
function normalizeTeacherSearch(value){return stripDiacritics(value).toLowerCase();}
function getTeacherAccessMatches(value){
  const query=normalizeTeacherSearch(value);
  if(!query) return ALL_PROFESORES;
  const startsWith=[];
  const contains=[];
  ALL_PROFESORES.forEach(nombre=>{
    const normalized=normalizeTeacherSearch(nombre);
    if(normalized.startsWith(query)) startsWith.push(nombre);
    else if(normalized.includes(query)) contains.push(nombre);
  });
  return [...startsWith,...contains].slice(0,8);
}
function getGuardiaNombreSeleccionado(valor,dia,hora){
  const texto=(valor||'').trim();
  if(!texto) return '';
  return getGuardiasDisponibles(dia,hora).find(nombre=>nombre.toLowerCase()===texto.toLowerCase())||'';
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
let historialCambios=loadHistorial();
let historyFilter='all';
let dialogResolver=null;
let backendSyncInFlight=false;
let backendHydrated=false;
let backendPollingInFlight=false;
const BACKEND_POLL_INTERVAL_MS=10000;
(function(){const wd=new Date().getDay();day=(wd>=1&&wd<=5)?wd-1:0;})();
teacherName=getProfesorNombreSeleccionado(loadTeacherUser())||'';
teacherDay=day;
function serializeBibliotecaAssignments(){
  const rows=[];
  for(let dia=0;dia<5;dia++){
    for(let hora=1;hora<=9;hora++){
      if(HORAS_PATIO.has(hora)) continue;
      const profesor=bibliotecaGuardias[dia]?.[hora]||'';
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
async function syncAdminState(){
  if(!storage.hasBackend()||backendSyncInFlight) return;
  backendSyncInFlight=true;
  try{
    await Promise.all([
      storage.replaceGuardias(data),
      storage.replaceBiblioteca(serializeBibliotecaAssignments()),
      storage.replaceHistorial(historialCambios)
    ]);
  }catch(error){
    console.warn('Backend sync failed',error);
  }finally{
    backendSyncInFlight=false;
  }
}
async function syncTeacherState(){
  if(!storage.hasBackend()||backendSyncInFlight) return;
  backendSyncInFlight=true;
  try{
    await Promise.all([
      storage.replaceTareasProfesorado(serializeTeacherTasks()),
      storage.replaceSessionOverrides(serializeSessionOverrides())
    ]);
  }catch(error){
    console.warn('Teacher backend sync failed',error);
  }finally{
    backendSyncInFlight=false;
  }
}
async function hydrateFromBackend(){
  if(!storage.hasBackend()||backendHydrated) return;
  backendHydrated=true;
  try{
    const [guardiasRows,bibliotecaRows,historialRows,tareasRows,overridesRows]=await Promise.all([
      storage.fetchGuardias(),
      storage.fetchBiblioteca(),
      storage.fetchHistorial(),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides()
    ]);

    const backendHasData=
      (Array.isArray(guardiasRows)&&guardiasRows.length)||
      (Array.isArray(bibliotecaRows)&&bibliotecaRows.length)||
      (Array.isArray(historialRows)&&historialRows.length)||
      (Array.isArray(tareasRows)&&tareasRows.length)||
      (Array.isArray(overridesRows)&&overridesRows.length);

    if(Array.isArray(guardiasRows)&&guardiasRows.length){
      data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
    }

    if(Array.isArray(bibliotecaRows)){
      const nextBiblioteca={};
      for(let dia=0;dia<5;dia++) nextBiblioteca[dia]={};
      bibliotecaRows.forEach(row=>{
        if(!nextBiblioteca[row.dia]) nextBiblioteca[row.dia]={};
        nextBiblioteca[row.dia][row.hora]=row.profesor;
      });
      bibliotecaGuardias=ensureBibliotecaAssignments(nextBiblioteca);
      persistBibliotecaAssignments(bibliotecaGuardias);
    }

    if(Array.isArray(historialRows)&&historialRows.length){
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

    renderGuardiaBoard();
    renderTable();
    renderHistoryList();

    if(!backendHasData&&!storage.isBackendOnly()&&(data.length||historialCambios.length)){
      syncAdminState();
    }
  }catch(error){
    console.warn('Backend hydration failed',error);
  }
}
function isAnyOverlayOpen(){
  return ['overlay','teacherOverlay','teacherAccessOverlay','bibliotecaOverlay','historyOverlay','dialogOverlay']
    .some(id=>document.getElementById(id)?.classList.contains('open'));
}
function makeBackendSnapshot(){
  return JSON.stringify({
    data,
    biblioteca:serializeBibliotecaAssignments(),
    tareas:serializeTeacherTasks(),
    overrides:serializeSessionOverrides(),
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
  if(document.hidden||isAnyOverlayOpen()) return;

  backendPollingInFlight=true;
  try{
    const previousSnapshot=makeBackendSnapshot();
    const [guardiasRows,bibliotecaRows,historialRows,tareasRows,overridesRows]=await Promise.all([
      storage.fetchGuardias(),
      storage.fetchBiblioteca(),
      storage.fetchHistorial(),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides()
    ]);

    if(Array.isArray(guardiasRows)){
      data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
    }

    if(Array.isArray(bibliotecaRows)){
      const nextBiblioteca={};
      for(let dia=0;dia<5;dia++) nextBiblioteca[dia]={};
      bibliotecaRows.forEach(row=>{
        if(!nextBiblioteca[row.dia]) nextBiblioteca[row.dia]={};
        nextBiblioteca[row.dia][row.hora]=row.profesor;
      });
      bibliotecaGuardias=ensureBibliotecaAssignments(nextBiblioteca);
      persistBibliotecaAssignments(bibliotecaGuardias);
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

    if(previousSnapshot!==makeBackendSnapshot()){
      renderGuardiaBoard();
      renderTable();
      renderHistoryList();
    }
  }catch(error){
    console.warn('Backend polling failed',error);
  }finally{
    backendPollingInFlight=false;
  }
}
function isReportAvailable(){
  const now=formatNowParts();
  return now.hours>14 || (now.hours===14 && now.minutes>=10);
}
function updateAdminControls(){
  const btnSorteo=document.getElementById('btnSorteo');
  const btnInforme=document.getElementById('btnInforme');
  if(btnSorteo) btnSorteo.style.display=isAdmin?'':'none';
  if(btnInforme) btnInforme.style.display=isAdmin?'':'none';
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
    btnSuperAdmin.style.display=SUPERADMIN_ENABLED?'':'none';
    btnSuperAdmin.classList.toggle('on',isSuperAdmin);
    btnSuperAdmin.textContent=isSuperAdmin?'Salir Superadmin':'Superadmin';
  }
  if(adminBar) adminBar.classList.toggle('show',isAdmin);
  if(superAdminBar) superAdminBar.classList.toggle('show',isSuperAdmin);
  updateAdminControls();
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
async function loadAuthSession(){
  if(!storage.hasBackend()){
    isAdmin=false;
    isSuperAdmin=false;
    refreshAccessUi();
    return;
  }
  try{
    const session=await storage.fetchAuthSession();
    isAdmin=!!session?.isAdmin;
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
    isAdmin=!!result?.isAdmin;
    isSuperAdmin=!!result?.isSuperAdmin;
    refreshAccessUi();
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
  refreshAccessUi();
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
    const nombres=profes.map(nombre=>`<span class="guardia-mini${asignados.has(nombre)?' guardia-mini-assigned':''}${nombre===biblioteca?' guardia-mini-biblio':''}">${nombre}${nombre===biblioteca?' \u00b7 Biblioteca':''}</span>`).join('')||'<span class="sin-asignar">Sin profesorado asignado</span>';
    const nombresDecorados=banos?nombres.replace(new RegExp(`<span class="([^"]*)">${escapeRegExp(banos)}</span>`),`<span class="$1 guardia-mini-banos">${banos} \u00b7 Ba\u00f1os</span>`):nombres;
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
    `Fecha de generaci\u00f3n: ${fecha}`,
    ''
  ];
  if(!rows.length) return cabecera.concat(['No hay ausencias registradas para este d\u00eda.']).join('\n');
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
        <div><strong>Ba\u00f1os:</strong> ${escapeHtml(banos)}</div>
        <div><strong>Aula:</strong> ${escapeHtml(aula)}</div>
        <div><strong>Faena:</strong> ${faenaInfo.faena?'S\u00ed':'No'}</div>
        <div><strong>Tarea:</strong> ${escapeHtml(faenaInfo.obs||'-')}</div>
      </article>`;
  }).join(''):`<p class="empty">No hay ausencias registradas para este d\u00eda.</p>`;
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
    <div class="meta">Fecha de generaci\u00f3n: ${escapeHtml(fecha)}</div>
    <section class="grid">${cards}</section>
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
    'Se reemplazarán guardias, biblioteca, historial y tareas con el contenido del backup seleccionado.',
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
    const restoreTime=new Date(result?.restoredAt||Date.now()).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    setSuperAdminHint(`JSON restaurado a las ${restoreTime} · ${file.name} · Guardias: ${result?.counts?.guardias ?? 0}`,'success');
    showToast(`Copia restaurada. Guardias: ${result?.counts?.guardias ?? 0}.`,'success');
  }catch(error){
    console.warn('Snapshot restore failed',error);
    setSuperAdminHint(`Error al restaurar ${file?.name||'el backup JSON'}. Revisa el formato o la sesion.`,'error');
    showToast('No se pudo restaurar la copia.','error');
  }
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
      ? 'Todavia no hay cambios registrados.'
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
  persist(data);
  bibliotecaGuardias=ensureBibliotecaAssignments(cloneJson(state.biblioteca||{}));
  persistBibliotecaAssignments(bibliotecaGuardias);
  nid=computeNextId(data);
  day=typeof state.day==='number'?state.day:day;
  renderPills();
  renderGuardiaBoard();
  renderTable();
  return true;
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
  const anterior=getBibliotecaAsignada(day,hora);
  const undoState=buildUndoState(day);
  const disponibles=getProfesHora(day,hora);
  if(!nombre||!disponibles.includes(nombre)){showToast('Selecciona un profesor v\u00e1lido para esa hora.','error');return;}
  bibliotecaGuardias[day][hora]=nombre;
  persistBibliotecaAssignments(bibliotecaGuardias);
  addHistoryEntry('Biblioteca actualizada',`${formatDiaHora(day,hora)} \u00b7 ${anterior||'Sin asignar'} -> ${nombre}`,'biblioteca',{undoState});
  closeBibliotecaModal();
  renderGuardiaBoard();
  renderTable();
  document.getElementById('saveTs').textContent=`Biblioteca actualizada - ${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`;
  showToast('Biblioteca actualizada correctamente.','success');
  syncAdminState();
}
function renderTable(){
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const tb=document.getElementById('tbody');
  if(!rows.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No hay ausencias registradas para este d\u00eda.</td></tr>';}
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
        <td><div class="cell-stack"><div class="guardia-slot"><div class="chip"><div class="avatar av-red">${initials(g.ausente)}</div>${g.ausente}</div></div></div></td>
        <td>${sugerido?`<div class="cell-stack"><div class="guardia-slot"><div class="chip guardia-chip${cub?' guardia-chip-assigned':''}"><div class="avatar av-yellow">${initials(sugerido)}</div>${sugerido}</div></div></div>`:`<span class="sin-asignar">Sin asignar</span>`}</td>
        <td><div class="cell-stack"><div class="guardia-slot"><span class="aula-tag">${aula||'-'}</span></div></div></td>
        <td><div class="cell-stack"><div class="guardia-slot">${faenaInfo.faena?`<div class="faena-box"><span class="badge b-ok">Con tarea</span>${faenaInfo.obs?`<details class="faena-toggle"><summary></summary><div class="faena-text">${faenaInfo.obs}</div></details>`:''}</div>`:`<span class="badge b-nok">Sin tarea</span>`}</div></div></td>
        <td><div class="cell-stack"><div class="guardia-slot">${sugerido?`<span class="badge b-ok">${cub?'Asignada':'Turno 1'}</span>`:'<span class="badge b-nok">Sin cubrir</span>'}</div></div></td>
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
  renderTable();
  showToast('Modo Superadmin desactivado.','info');
}
function renderTeacherAccessPreview(){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  const preview=document.getElementById('teacherAccessPreview');
  if(!teacherLoginInput||!preview) return;
  const nombre=getProfesorNombreSeleccionado(teacherLoginInput.value);
  if(!nombre){
    preview.textContent='Selecciona tu nombre para entrar en tu panel.';
    return;
  }
  preview.textContent=`Entrar\u00e1s como ${nombre}. Usuario: ${makeTeacherUsername(nombre)}.`;
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
  teacherAccessMatches=getTeacherAccessMatches(teacherLoginInput.value);
  const selected=getProfesorNombreSeleccionado(teacherLoginInput.value);
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
  suggestions.innerHTML=teacherAccessMatches.map((nombre,index)=>`<button class="teacher-access-suggestion${index===teacherAccessActiveIndex?' active':''}" type="button" data-teacher-name="${escapeHtml(nombre)}">${escapeHtml(nombre)}<span class="teacher-access-suggestion-user">${escapeHtml(makeTeacherUsername(nombre))}</span></button>`).join('');
  suggestions.hidden=!(forceOpen||hasFocus);
}
function selectTeacherAccessSuggestion(nombre){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  if(!teacherLoginInput) return;
  teacherLoginInput.value=nombre;
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
  teacherLoginInput.value=resetSelection?'':(teacherName||'');
  teacherAccessActiveIndex=-1;
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
  syncTeacherState();
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
    document.getElementById('teacherSessions').innerHTML='<div class="teacher-session"><div class="teacher-session-empty">No tienes sesiones registradas para este d\u00eda.</div></div>';
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
        <div class="teacher-session-meta">${HORA_MAP[hora].rango} \u00b7 ${aula}</div>
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
function syncTodoDiaMode(){
  const todoDiaInput=document.getElementById('fTodoDia');
  const guardiaInput=document.getElementById('fGuardia');
  if(!todoDiaInput||!guardiaInput) return;
  if(todoDiaInput.checked){
    guardiaInput.value='';
    guardiaInput.disabled=true;
    guardiaInput.placeholder='La guardia se gestiona por cada hora';
    setFieldError('fGuardia','');
  }else{
    guardiaInput.disabled=false;
    guardiaInput.placeholder='Selecciona un profesor de guardia';
  }
}
function openModal(id){editId=id||null;const g=id?data.find(x=>x.id===id):null;const aula=g?resolveAulaRegistro(g):'';clearAbsenceFormErrors();document.getElementById('mTitle').textContent=g?'Editar ausencia':'Nueva ausencia';document.getElementById('btnDel').style.display=g?'':'none';document.getElementById('fDia').value=g?g.dia:day;document.getElementById('fHora').value=g?g.hora:1;document.getElementById('fAusente').value=g?g.ausente:'';document.getElementById('fGuardia').value=g?g.guardia:'';document.getElementById('fAula').value=aula;document.getElementById('fTodoDia').checked=false;document.getElementById('fFaena').checked=g?g.faena:false;document.getElementById('fObs').value=g?g.obs:'';populateProfesoresGuardia();syncAulaFromProfesor(!g||!aula);syncTodoDiaMode();document.getElementById('overlay').classList.add('open');}
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
  const guardiaInput=document.getElementById('fGuardia');
  const aulaInput=document.getElementById('fAula');
  const ausente=getProfesorNombreSeleccionado(ausenteInput.value);
  const guardiaTexto=guardiaInput.value.trim();
  const guardia=todoDia?'':getGuardiaNombreSeleccionado(guardiaTexto,dia,hora);
  clearAbsenceFormErrors();
  if(!ausente){
    setFieldError('fAusente','Selecciona un profesor ausente del listado.');
    return {valid:false,focus:ausenteInput};
  }
  if(!todoDia && findDuplicateAbsence(dia,hora,ausente)){
    setFieldError('fAusente','Ya existe una ausencia registrada para ese profesor en esa hora.');
    return {valid:false,focus:ausenteInput};
  }
  if(!todoDia && guardiaTexto && !guardia){
    setFieldError('fGuardia','Selecciona un profesor de guardia v\u00e1lido para esa hora.');
    return {valid:false,focus:guardiaInput};
  }
  if(guardia && guardia===ausente){
    setFieldError('fGuardia','El profesor ausente no puede cubrir su propia guardia.');
    return {valid:false,focus:guardiaInput};
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
  return {valid:true,ausente,guardia,todoDia:false,horasLectivas:[hora]};
}
function clearAusenteSelection(){
  const ausenteInput=document.getElementById('fAusente');
  const aulaInput=document.getElementById('fAula');
  if(!ausenteInput||!aulaInput) return;
  ausenteInput.value='';
  aulaInput.value='';
  clearAbsenceFormErrors();
  populateProfesoresAusencias();
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
  profesoresGuardia.innerHTML=guardias.map(nombre=>`<option value="${nombre}"></option>`).join('');
  if(guardiaInput.value && !getGuardiaNombreSeleccionado(guardiaInput.value,dia,hora)) guardiaInput.value='';
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
  const faena=document.getElementById('fFaena').checked;
  const obs=document.getElementById('fObs').value.trim();
  const aulaManual=document.getElementById('fAula').value.trim();
  const horasObjetivo=validation.horasLectivas;
  const previousRow=editId?data.find(g=>g.id===editId):null;
  const undoState=buildUndoState(dia);

  document.getElementById('fAusente').value=ausente;
  document.getElementById('fGuardia').value=guardia;

  if(editId&&!todoDia){
    const aulaReal=getAulaProfesor(ausente,dia,hora)||aulaManual;
    const i=data.findIndex(g=>g.id===editId);
    data[i]={dia,hora,ausente,guardia,aula:aulaReal,faena,obs,id:editId};
    addHistoryEntry('Ausencia editada',`${formatHistoryAbsence(previousRow)} -> ${formatHistoryAbsence(data[i])}`,'edit',{undoState});
  }else{
    if(editId){
      data=data.filter(g=>g.id!==editId);
    }
    horasObjetivo.forEach(horaItem=>{
      const aulaReal=getAulaProfesor(ausente,dia,horaItem)||aulaManual;
      const existing=data.find(g=>g.dia===dia&&g.hora===horaItem&&g.ausente===ausente);
      const entry={dia,hora:horaItem,ausente,guardia:'',aula:aulaReal,faena,obs};
      if(existing){
        Object.assign(existing,entry);
      }else{
        data.push({...entry,id:nid++});
      }
    });
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
  persist(data);
  if(previousRow) addHistoryEntry('Ausencia eliminada',formatHistoryAbsence(previousRow),'delete',{undoState});
  closeModal();
  renderTable();
  showToast('Registro eliminado.','success');
  syncAdminState();
}
document.getElementById('fDia').addEventListener('change',()=>{populateProfesoresGuardia();setFieldError('fDia','');});
document.getElementById('fHora').addEventListener('change',()=>{populateProfesoresGuardia();setFieldError('fHora','');});
document.getElementById('fDia').addEventListener('change',()=>syncAulaFromProfesor(true));
document.getElementById('fHora').addEventListener('change',()=>syncAulaFromProfesor(true));
document.getElementById('fTodoDia').addEventListener('change',syncTodoDiaMode);
document.getElementById('fAusente').addEventListener('change',()=>{syncAulaFromProfesor(true);setFieldError('fAusente','');});
document.getElementById('fAusente').addEventListener('input',()=>{syncAulaFromProfesor(false);setFieldError('fAusente','');});
document.getElementById('fGuardia').addEventListener('input',()=>setFieldError('fGuardia',''));
document.getElementById('fGuardia').addEventListener('change',()=>setFieldError('fGuardia',''));
document.getElementById('fAula').addEventListener('input',()=>setFieldError('fAula',''));
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
const restoreSnapshotInput=document.getElementById('restoreSnapshotInput');
if(restoreSnapshotInput){
  restoreSnapshotInput.addEventListener('change',event=>{
    const file=event.target.files?.[0];
    if(file) restoreSnapshotFromFile(file);
  });
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
safeInitStep(populateProfesoresAusencias,'populateProfesoresAusencias');
safeInitStep(populateProfesoresGuardia,'populateProfesoresGuardia');
safeInitStep(renderPills,'renderPills');
safeInitStep(renderGuardiaBoard,'renderGuardiaBoard');
safeInitStep(renderTable,'renderTable');
safeInitStep(syncTeacherIdentity,'syncTeacherIdentity');
safeInitStep(refreshAccessUi,'refreshAccessUi');
safeInitStep(()=>{loadAuthSession();},'loadAuthSession');
safeInitStep(()=>{hydrateFromBackend();},'hydrateFromBackend');
window.setInterval(()=>{pollBackendState();},BACKEND_POLL_INTERVAL_MS);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden) pollBackendState();
});
window.addEventListener('guardias-auth-invalid',()=>{
  if(!isAdmin&&!isSuperAdmin) return;
  isAdmin=false;
  isSuperAdmin=false;
  refreshAccessUi();
  renderTable();
  showToast('La sesi\u00f3n ha caducado.','error');
});
