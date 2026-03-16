const HORA_MAP={1:{label:'1a',rango:'08:15-09:10'},2:{label:'2a',rango:'09:10-10:05'},3:{label:'3a',rango:'10:05-11:00'},4:{label:'4a',rango:'11:00-11:25'},5:{label:'5a',rango:'11:25-12:20'},6:{label:'6a',rango:'12:20-13:15'},7:{label:'7a',rango:'13:15-14:10'},8:{label:'8a',rango:'14:10-14:25'},9:{label:'9a',rango:'14:25-15:20'}};
const HORAS_PATIO=new Set([4,8,9]);
const DIAS=['Lunes','Martes','Mi\u00e9rcoles','Jueves','Viernes'];
const KEY='IES_Alcalans_Guardias';
const KEY_ORDEN='IES_Alcalans_Guardias_OrdenHora';
const KEY_TAREAS='IES_Alcalans_Tareas_Profesorado';
const KEY_TEACHER_USER='IES_Alcalans_Profesorado_Actual';
const KEY_TEACHER_RECENTS='IES_Alcalans_Profesorado_Recientes';
const KEY_TEACHER_SUBSTITUTIONS='IES_Alcalans_Profesorado_Sustituciones';
const KEY_SESSION_OVERRIDES='IES_Alcalans_Sesiones_Profesorado';
const KEY_HISTORIAL='IES_Alcalans_Historial_Cambios';
const KEY_WEEK='IES_Alcalans_School_Week_Key';
const RAW_PROFESORADO=(window.PROFESORADO_SOURCE&&Array.isArray(window.PROFESORADO_SOURCE.teachers))?window.PROFESORADO_SOURCE.teachers:[];
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
function getCurrentSchoolWeekKey(){
  const now=formatNowParts().date;
  const day=now.getDay();
  const mondayOffset=day===0?-6:1-day;
  const monday=new Date(now);
  monday.setHours(0,0,0,0);
  monday.setDate(monday.getDate()+mondayOffset);
  return monday.toISOString().slice(0,10);
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
let substitutionFilter='';
const demo=[];
const APP_URL_PARAMS=new URLSearchParams(window.location.search||'');
const SUPERADMIN_ENABLED=APP_URL_PARAMS.get('panel')==='superadmin';
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
function loadSessionOverrides(){return storage.readJson(KEY_SESSION_OVERRIDES,{});}
function persistSessionOverrides(d){storage.writeJson(KEY_SESSION_OVERRIDES,d);}
function loadHistorial(){return storage.readJson(KEY_HISTORIAL,[]);}
function persistHistorial(d){storage.writeJson(KEY_HISTORIAL,d);}
function loadWeekKey(){return storage.readText(KEY_WEEK,'');}
function persistWeekKey(value){storage.writeText(KEY_WEEK,value||'');}
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
  return partes.join(' \u00b7 ');
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
function loadOrden(){try{const d=storage.readJson(KEY_ORDEN,null);return d?ensureOrden(d):buildInitialOrden();}catch(e){return buildInitialOrden();}}
function getOrdenHora(dia,hora){return (ordenGuardias[dia]?.[hora]||[]).slice().sort((a,b)=>a.numero-b.numero);}
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
function getSpecialAssignments(dia,hora){
  const orderedNames=seededShuffle(getOrdenHora(dia,hora).map(item=>item.nombre),`${new Date().toISOString().slice(0,10)}|${dia}|${hora}`);
  const biblioteca=orderedNames[0]||'';
  const banos=orderedNames.find(nombre=>nombre!==biblioteca)||'';
  const specialCount=(biblioteca?1:0)+(banos?1:0);
  const uncoveredIfReserved=data.filter(row=>row.dia===dia&&row.hora===hora).length>Math.max(orderedNames.length-specialCount,0);
  return {
    biblioteca: uncoveredIfReserved?'':biblioteca,
    banos: uncoveredIfReserved?'':banos
  };
}
function getBibliotecaAsignada(dia,hora){return getSpecialAssignments(dia,hora).biblioteca||'';}
function getBanosAsignado(dia,hora){return getSpecialAssignments(dia,hora).banos||'';}
function getOrdenHoraDisponible(dia,hora,excluidos){
  const excluidosSet=new Set((excluidos||[]).filter(Boolean));
  return getOrdenHora(dia,hora).filter(item=>!excluidosSet.has(item.nombre));
}
function reassignGuardiasForSlot(dia,hora){
  const rows=data.filter(row=>row.dia===dia&&row.hora===hora).sort((a,b)=>(a.id||0)-(b.id||0));
  if(!rows.length) return;
  const ausentes=new Set(rows.map(row=>row.ausente).filter(Boolean));
  const biblioteca=getBibliotecaAsignada(dia,hora);
  const banos=getBanosAsignado(dia,hora);
  const orderedNames=getOrdenHora(dia,hora).map(item=>item.nombre).filter(nombre=>!ausentes.has(nombre));
  const principales=orderedNames.filter(nombre=>nombre!==biblioteca&&nombre!==banos);
  const assigned=new Set();
  rows.forEach(row=>{
    const siguientePrincipal=principales.find(nombre=>!assigned.has(nombre));
    if(siguientePrincipal){
      row.guardia=siguientePrincipal;
      assigned.add(siguientePrincipal);
      return;
    }
    if(banos&&orderedNames.includes(banos)&&!assigned.has(banos)){
      row.guardia=banos;
      assigned.add(banos);
      return;
    }
    if(biblioteca&&orderedNames.includes(biblioteca)&&!assigned.has(biblioteca)){
      row.guardia=biblioteca;
      assigned.add(biblioteca);
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
function getGuardiaSugerida(dia,hora,turno){
  return getOrdenHoraDisponible(dia,hora,[getBibliotecaAsignada(dia,hora),getBanosAsignado(dia,hora)])[turno-1]?.nombre||'';
}
function getProfesHora(dia,hora){return HORARIO_GUARDIAS[dia]?.[hora]||[];}
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
  const tarea=getTareaProfesor(nombre,dia,hora);
  if(tarea){
    return {
      faena:!!tarea.dejada,
      obs:tarea.tarea||''
    };
  }
  return {
    faena:!!fallbackFaena,
    obs:fallbackObs||''
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
let sessionOverrides=loadSessionOverrides();
resetWeeklyLocalStateIfNeeded();
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
const BACKEND_POLL_INTERVAL_MS=10000;
(function(){const wd=new Date().getDay();day=(wd>=1&&wd<=5)?wd-1:0;})();
teacherRecents=loadTeacherRecents();
teacherSubstitutions=loadTeacherSubstitutions();
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
async function syncAdminState(){
  if(!storage.hasBackend()||backendSyncInFlight) return;
  backendSyncInFlight=true;
  try{
    await Promise.all([
      storage.replaceGuardias(data),
      storage.replaceBiblioteca(serializeBibliotecaAssignments()),
      storage.replaceHistorial(historialCambios),
      storage.replaceTeacherSubstitutions(serializeTeacherSubstitutions())
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
  }catch(error){
    console.warn('Teacher substitutions hydration failed',error);
  }
}
async function hydrateFromBackend(){
  if(!storage.hasBackend()||backendHydrated) return;
  if(!isAdmin&&!isSuperAdmin) return;
  backendHydrated=true;
  try{
    const [guardiasResult,historialResult,tareasResult,overridesResult,substitutionsResult]=await Promise.allSettled([
      storage.fetchGuardias(),
      storage.fetchHistorial(),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides(),
      storage.fetchTeacherSubstitutions()
    ]);
    const guardiasRows=guardiasResult.status==='fulfilled'?guardiasResult.value:null;
    const historialRows=historialResult.status==='fulfilled'?historialResult.value:null;
    const tareasRows=tareasResult.status==='fulfilled'?tareasResult.value:null;
    const overridesRows=overridesResult.status==='fulfilled'?overridesResult.value:null;
    const substitutionsRows=substitutionsResult.status==='fulfilled'?substitutionsResult.value:null;

    const backendHasData=
      (Array.isArray(guardiasRows)&&guardiasRows.length)||
      (Array.isArray(historialRows)&&historialRows.length)||
      (Array.isArray(tareasRows)&&tareasRows.length)||
      (Array.isArray(overridesRows)&&overridesRows.length)||
      (Array.isArray(substitutionsRows)&&substitutionsRows.length);

    if(Array.isArray(guardiasRows)&&guardiasRows.length){
      data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
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
    if(Array.isArray(substitutionsRows)){
      teacherSubstitutions=Object.fromEntries(substitutionsRows.map(row=>[row.profesor,row.sustituto]).filter(([profesor,sustituto])=>getProfesor(profesor)&&cleanText(sustituto)));
      persistTeacherSubstitutions(teacherSubstitutions);
    }

    reassignAllGuardias();
    persist(data);
    renderGuardiaBoard();
    renderTable();
    renderHistoryList();
    renderSubstitutionList();

    if(!backendHasData&&!storage.isBackendOnly()&&(data.length||historialCambios.length)){
      syncAdminState();
    }
  }catch(error){
    console.warn('Backend hydration failed',error);
  }
}
function isAnyOverlayOpen(){
  return ['overlay','teacherOverlay','teacherAccessOverlay','historyOverlay','dialogOverlay']
    .some(id=>document.getElementById(id)?.classList.contains('open'));
}
function makeBackendSnapshot(){
  return JSON.stringify({
    data,
    biblioteca:serializeBibliotecaAssignments(),
    tareas:serializeTeacherTasks(),
    overrides:serializeSessionOverrides(),
    substitutions:serializeTeacherSubstitutions(),
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
  try{
    const previousSnapshot=makeBackendSnapshot();
    const [guardiasResult,historialResult,tareasResult,overridesResult,substitutionsResult]=await Promise.allSettled([
      storage.fetchGuardias(),
      storage.fetchHistorial(),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides(),
      storage.fetchTeacherSubstitutions()
    ]);
    const guardiasRows=guardiasResult.status==='fulfilled'?guardiasResult.value:null;
    const historialRows=historialResult.status==='fulfilled'?historialResult.value:null;
    const tareasRows=tareasResult.status==='fulfilled'?tareasResult.value:null;
    const overridesRows=overridesResult.status==='fulfilled'?overridesResult.value:null;
    const substitutionsRows=substitutionsResult.status==='fulfilled'?substitutionsResult.value:null;

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

    reassignAllGuardias();
    persist(data);
    if(previousSnapshot!==makeBackendSnapshot()){
      renderGuardiaBoard();
      renderTable();
      renderHistoryList();
      renderSubstitutionList();
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
function isWeeklyReportAvailable(){
  const { hours, minutes, date }=formatNowParts();
  const weekday=date.getDay();
  if(weekday===6||weekday===0) return true;
  return weekday===5&&(hours>14||(hours===14&&minutes>=10));
}
function updateAdminControls(){
  const btnSorteo=document.getElementById('btnSorteo');
  const btnInforme=document.getElementById('btnInforme');
  const btnInformeSemanal=document.getElementById('btnInformeSemanal');
  if(btnSorteo) btnSorteo.style.display=isAdmin?'':'none';
  if(btnInforme) btnInforme.style.display=isAdmin?'':'none';
  if(btnInformeSemanal) btnInformeSemanal.style.display=isAdmin&&isWeeklyReportAvailable()?'':'none';
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
async function initializeApp(){
  await loadAuthSession();
  await hydrateTeacherSubstitutions();
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
    const banos=getBanosAsignado(day,hora)||'';
    const asignados=new Set(data.filter(g=>g.dia===day&&g.hora===hora&&g.guardia&&g.guardia.trim()).map(g=>g.guardia.trim()));
    const nombres=profes.map(nombre=>{
      const classes=[
        'guardia-mini',
        asignados.has(nombre)?'guardia-mini-assigned':'',
        nombre===biblioteca?'guardia-mini-biblio':'',
        nombre===banos?'guardia-mini-banos':''
      ].filter(Boolean).join(' ');
      const suffix=nombre===biblioteca?' \u00b7 Biblioteca':(nombre===banos?' \u00b7 Ba\u00f1os':'');
      return `<span class="${classes}">${escapeHtml(getVisibleTeacherName(nombre))}${suffix}</span>`;
    }).join('')||'<span class="sin-asignar">Sin profesorado asignado</span>';
    cards.push(`<article class="guardia-card${firstMobileCard?' is-open':''}">
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
          <div class="meta-card"><span class="meta-k">Baños</span><span class="meta-v">${escapeHtml(banos)}</span></div>
        </div>
        ${faenaInfo.obs?`<div class="task-box"><div class="task-title">Indicaciones para el grupo</div><div class="task-text">${escapeHtml(faenaInfo.obs)}</div></div>`:''}
      </article>`;
  }).join(''):`<p class="empty">No hay ausencias registradas para este día.</p>`;
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
          <div class="title-kicker">IES Alcalans · Guardias</div>
          <h1>Informe diario · ${escapeHtml(DIAS[day])}</h1>
          <div class="subtitle">Fecha de generación: ${escapeHtml(fecha)}</div>
        </div>
      </div>
      <section class="summary">
        <article class="summary-card"><span class="summary-k">Ausencias</span><span class="summary-v">${totalAusencias}</span><span class="summary-note">Registros del día</span></article>
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
  const daySections=DIAS.map((diaNombre,diaIndex)=>{
    const rows=data
      .filter(row=>row.dia===diaIndex)
      .sort((a,b)=>a.hora-b.hora||String(a.ausente||'').localeCompare(String(b.ausente||''),'es'));
    if(!rows.length){
      return `<section class="day-block"><h2>${escapeHtml(diaNombre)}</h2><p class="empty">No hay ausencias registradas.</p></section>`;
    }
    const grouped=new Map();
    rows.forEach(row=>{
      const key=row.ausente||'Profesorado sin identificar';
      if(!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(row.hora);
    });
    const items=[...grouped.entries()]
      .map(([ausente,horas])=>({
        ausente,
        horas:[...new Set(horas)].sort((a,b)=>a-b)
      }))
      .sort((a,b)=>a.ausente.localeCompare(b.ausente,'es'))
      .map(item=>`
        <article class="item">
          <div class="item-head">${escapeHtml(item.ausente)}</div>
          <div><strong>Horas:</strong> ${escapeHtml(item.horas.map(hora=>HORA_MAP[hora]?.rango||`Hora ${hora}`).join(' | '))}</div>
        </article>
      `)
      .join('');
    return `<section class="day-block"><h2>${escapeHtml(diaNombre)}</h2><div class="grid">${items}</div></section>`;
  }).join('');

  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Informe semanal de guardias</title>
    <style>
      body{font-family:Arial,sans-serif;color:#1f2937;margin:32px}
      h1{margin:0 0 6px;font-size:28px}
      h2{margin:0 0 14px;font-size:20px}
      .meta{margin-bottom:24px;color:#6b7280}
      .day-block{margin-bottom:28px;page-break-inside:avoid}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .item{border:1px solid #dbe3ee;border-radius:12px;padding:16px;break-inside:avoid}
      .item-head{font-weight:700;font-size:16px;margin-bottom:10px}
      .item div{margin:4px 0}
      .empty{font-size:16px}
      @media print{body{margin:16px}.grid{gap:12px}}
    </style>
  </head>
  <body>
    <h1>Informe semanal de guardias</h1>
    <div class="meta">Fecha de generaciÃ³n: ${escapeHtml(fecha)}</div>
    ${daySections}
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
    'Se reemplazarÃ¡n guardias, biblioteca, historial y tareas con el contenido del backup seleccionado.',
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
    setSuperAdminHint(`JSON restaurado a las ${restoreTime} Â· ${file.name} Â· Guardias: ${result?.counts?.guardias ?? 0}`,'success');
    showToast(`Copia restaurada. Guardias: ${result?.counts?.guardias ?? 0}.`,'success');
  }catch(error){
    console.warn('Snapshot restore failed',error);
    setSuperAdminHint(`Error al restaurar ${file?.name||'el backup JSON'}. Revisa el formato o la sesion.`,'error');
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
    const wd=new Date().getDay();
    day=(wd>=1&&wd<=5)?wd-1:0;
    teacherDay=day;
    renderPills();
    renderGuardiaBoard();
    renderTable();
    renderHistoryList();
    renderSubstitutionList();
    if(document.getElementById('teacherOverlay')?.classList.contains('open')){
      renderTeacherPanel();
    }
    if(storage.hasBackend()&&(isAdmin||isSuperAdmin)){
      backendHydrated=false;
      hydrateFromBackend();
    }
    showToast('Nueva semana lectiva iniciada. El calendario se ha reiniciado.','info');
  }
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
function renderSubstitutionList(){
  const list=document.getElementById('substitutionList');
  if(!list) return;
  const teachers=getFilteredSubstitutionTeachers();
  if(!teachers.length){
    list.innerHTML='<div class="history-empty">No hay profesores que coincidan con la bÃºsqueda.</div>';
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
async function assignTeacherSubstitution(nombre){
  if(!isAdmin||!getProfesor(nombre)) return;
  const current=teacherSubstitutions[nombre]||'';
  const value=cleanText(await askText('Asignar sustituto',`Introduce el nombre del sustituto para ${getVisibleTeacherName(nombre)===nombre?nombre:getVisibleTeacherName(nombre)}.`,current,'Nombre del sustituto','Guardar'));
  if(!value) return;
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
  if(!await askConfirm('Restaurar titular',`Se restaurarÃ¡ el nombre original de ${nombre}.`,'Restaurar')) return;
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
  const rows=data.filter(g=>g.dia===day).sort((a,b)=>a.hora-b.hora);
  const tb=document.getElementById('tbody');
  if(!rows.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No hay ausencias registradas para este dia.</td></tr>';}
  else{
    tb.innerHTML=rows.map(g=>{
      const h=HORA_MAP[g.hora]||{label:g.hora+'a',rango:''};
      const cub=g.guardia&&g.guardia.trim();
      const sugerido=cub||getGuardiaSugerida(day,g.hora,1);
      const faenaInfo=resolveFaena(g);
      const aula=resolveAulaRegistro(g)||'-';
      const ausenteNombre=getVisibleTeacherName(g.ausente);
      const guardiaNombre=sugerido?getVisibleTeacherName(sugerido):'';
      const guardiaEstado=sugerido?(cub?'':'Guardia prevista'):'Sin cobertura';
      const guardiaBadgeClass=sugerido?(cub?'b-ok status-pill':'status-pill teacher-duty-badge'):'b-nok status-pill';
      const guardiaChipClass=sugerido?(cub?'guardia-chip guardia-chip-assigned chip-strong':'guardia-chip guardia-chip-suggested chip-strong'):'';
      return `<tr>
        <td>
          <div class="cell-stack cell-stack-hour">
            <div class="hora-num">${HORA_MAP[g.hora].label} hora</div>
            <div class="hora-range">${h.rango.replace('-', ' - ')}</div>
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <div class="cell-label">Ausente</div>
            <div class="guardia-slot">
              <div class="chip chip-absence chip-strong"><div class="avatar av-red">${initials(ausenteNombre)}</div>${escapeHtml(ausenteNombre)}</div>
            </div>
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
              ${faenaInfo.faena?`<div class="faena-status"><span class="badge b-ok">Con tarea</span>${faenaInfo.obs?`<details class="faena-toggle"><summary></summary><div class="faena-text">${escapeHtml(faenaInfo.obs)}</div></details>`:''}</div>`:`<span class="badge b-nok">Sin tarea</span>`}
            </div>
          </div>
        </td>
        <td>
          <div class="cell-stack cell-stack-compact">
            <div class="cell-label">Estado</div>
            <div class="guardia-slot"><span class="badge ${guardiaBadgeClass}">${sugerido?(cub?'Cubierta':'Pendiente de confirmar'):'Sin cubrir'}</span></div>
          </div>
        </td>
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
    preview.innerHTML='Selecciona tu nombre para entrar en tu panel.';
    return;
  }
  const profesor=getProfesor(nombre);
  const visibleName=getVisibleTeacherName(nombre);
  const summary=getTeacherSummaryForDay(nombre,day);
  const nextSession=summary.nextHour?resolveTeacherSession(nombre,day,summary.nextHour):null;
  const nextLabel=summary.nextHour&&nextSession?`${formatHoraLabel(summary.nextHour)} - ${nextSession.materia||nextSession.detalle||'Sesion'}`:'Sin sesiones lectivas hoy';
  preview.innerHTML=`
    <div class="teacher-access-preview-title">${escapeHtml(visibleName)}</div>
    <div class="teacher-access-preview-meta">Usuario: ${escapeHtml(makeTeacherUsername(visibleName))}${profesor?.departamento?` Â· ${escapeHtml(profesor.departamento)}`:''}${getTeacherDisplayMeta(nombre)?` Â· ${escapeHtml(getTeacherDisplayMeta(nombre))}`:''}</div>
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
  syncTeacherState();
  if(exitAfter){
    renderTable();
    showToast('Tarea guardada correctamente.','success');
    exitTeacherMode();
    return;
  }
  renderTeacherPanel();
  renderTable();
  showToast('Tarea guardada correctamente.','success');
}
function renderTeacherPanel(){
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  syncTeacherIdentity();
  document.getElementById('teacherName').textContent=getVisibleTeacherName(profesor.nombre);
  document.getElementById('teacherMeta').textContent=`${getVisibleTeacherName(profesor.nombreCompleto||profesor.nombre)} - ${profesor.departamento}${getTeacherDisplayMeta(teacherName)?` - ${getTeacherDisplayMeta(teacherName)}`:''}`;
  const sesiones=getHorarioProfesorDia(teacherName,teacherDay);
  const horas=Object.keys(sesiones).map(Number).sort((a,b)=>a-b);
  const totalConTarea=horas.filter(hora=>{const tarea=getTareaProfesor(teacherName,teacherDay,hora);return !!(tarea?.dejada||tarea?.tarea);}).length;
  const dutyAssignments=horas.flatMap(hora=>getTeacherAssignedAbsences(teacherName,teacherDay,hora));
  document.getElementById('teacherSummary').textContent=`${DIAS[teacherDay]} · ${horas.length} sesiones · ${totalConTarea} con tarea · ${dutyAssignments.length} coberturas`;
  const dutyAlert=document.getElementById('teacherDutyAlert');
  if(dutyAlert){
    if(dutyAssignments.length){
      const nextDuty=dutyAssignments.slice().sort((a,b)=>a.hora-b.hora)[0];
      dutyAlert.hidden=false;
      dutyAlert.innerHTML=`<div class="teacher-duty-alert-title">Guardia asignada</div><div class="teacher-duty-alert-copy">Hoy cubres ${dutyAssignments.length} ${dutyAssignments.length===1?'ausencia':'ausencias'}. Próxima cobertura: ${escapeHtml(getVisibleTeacherName(nextDuty.ausente))} en ${escapeHtml(nextDuty.aula||'Sin aula')} (${escapeHtml(formatHoraLabel(nextDuty.hora))}).</div>`;
    }else{
      dutyAlert.hidden=true;
      dutyAlert.innerHTML='';
    }
  }
  document.getElementById('teacherBarName').textContent=`${getVisibleTeacherName(profesor.nombre)} - ${profesor.departamento}`;
  document.getElementById('teacherDayPills').innerHTML=DIAS.map((nombreDia,index)=>`<button class="${index===teacherDay?'active':''}" onclick="setTeacherDay(${index})">${nombreDia}</button>`).join('');
  if(!horas.length){
    document.getElementById('teacherSessions').innerHTML='<div class="teacher-session"><div class="teacher-session-empty">No tienes sesiones registradas para este d\u00eda.</div></div>';
    return;
  }
  document.getElementById('teacherSessions').innerHTML=horas.map(hora=>{
    const sesion=resolveTeacherSession(teacherName,teacherDay,hora);
    const grupo=sesion.grupo?GRUPOS_PROFESORADO[sesion.grupo]?.nombre||sesion.grupo:'';
    const aula=sesion.aula||'Sin aula';
    const tarea=getTareaProfesor(teacherName,teacherDay,hora);
    const checked=tarea?!!(tarea.dejada||tarea.tarea):false;
    const texto=tarea?.tarea||'';
    const detalleVisible=grupo||sesion.detalle||'Sin detalle adicional';
    const guardiaTasks=sesion.tipo==='guardia'?getTeacherAssignedAbsences(teacherName,teacherDay,hora):[];
    const dutyBadge=guardiaTasks.length?`<span class="badge teacher-duty-badge">Te toca cubrir</span>`:'';
    const guardiaTasksMarkup=guardiaTasks.length?`<div class="teacher-guardia-tasks">${guardiaTasks.map(item=>`
      <article class="teacher-guardia-task">
        <div class="teacher-guardia-task-head">
          <div class="teacher-guardia-task-title">Cubres a ${escapeHtml(getVisibleTeacherName(item.ausente))}</div>
          <span class="badge ${item.faenaInfo.faena?'b-ok':'b-nok'}">${item.faenaInfo.faena?'Con tarea':'Sin tarea'}</span>
        </div>
        <div class="teacher-guardia-task-meta">${escapeHtml(formatHoraLabel(item.hora))} Â· ${escapeHtml(item.aula||'Sin aula')}</div>
        ${item.faenaInfo.obs?`<div class="teacher-guardia-task-text">${escapeHtml(item.faenaInfo.obs)}</div>`:''}
      </article>
    `).join('')}</div>`:'';
    return `<div class="teacher-session${guardiaTasks.length?' teacher-session-duty':''}">
      <div class="teacher-session-head">
        <div class="teacher-session-summary">
          <div class="teacher-session-slot">${HORA_MAP[hora].label} hora</div>
          <div class="teacher-session-title">${sesion.materia||sesion.tipo}</div>
          <div class="teacher-session-meta">${detalleVisible}</div>
        </div>
        <div class="teacher-session-side">
          <div class="teacher-session-meta">${HORA_MAP[hora].rango}</div>
          <div class="teacher-session-badges">
            ${dutyBadge}
            <span class="badge ${checked?'b-ok':'b-nok'}">${checked?'Con tarea':'Sin tarea'}</span>
            <span class="badge b-biblio">${aula}</span>
          </div>
        </div>
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
      ${guardiaTasksMarkup}
      <div class="teacher-actions">
        <button class="teacher-save" type="button" onclick="saveTeacherTask(${teacherDay},${hora},false)">Guardar tarea</button>
        <button class="teacher-save-exit" type="button" onclick="saveTeacherTask(${teacherDay},${hora},true)">Guardar y salir</button>
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
function openModal(id){editId=id||null;const g=id?data.find(x=>x.id===id):null;const aula=g?resolveAulaRegistro(g):'';const faenaInfo=g?resolveFaena(g):{faena:false,obs:''};clearAbsenceFormErrors();document.getElementById('mTitle').textContent=g?'Editar ausencia':'Nueva ausencia';document.getElementById('btnDel').style.display=g?'':'none';document.getElementById('fDia').value=g?g.dia:day;document.getElementById('fHora').value=g?g.hora:1;document.getElementById('fAusente').value=g?getVisibleTeacherName(g.ausente):'';document.getElementById('fGuardia').value=g?getVisibleTeacherName(g.guardia):'';document.getElementById('fAula').value=aula;document.getElementById('fTodoDia').checked=false;document.getElementById('fFaena').checked=faenaInfo.faena;document.getElementById('fObs').value=faenaInfo.obs||'';populateProfesoresGuardia();syncAulaFromProfesor(!g||!aula);syncTodoDiaMode();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();closeAusenteSuggestions();document.getElementById('overlay').classList.add('open');}
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
  preview.textContent=`${getVisibleTeacherName(nombre)} Â· ${DIAS[dia]} Â· ${horas.length} sesiones lectivas Â· ${aula}`;
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
  const tarea=getAbsenceTaskState(nombre,dia,hora,false,'');
  const horasLectivas=todoDia?getHorasLectivasProfesorDia(nombre,dia):[];
  const extras=[];
  if(todoDia) extras.push(`Se aplicara a ${horasLectivas.length} ${horasLectivas.length===1?'sesion lectiva':'sesiones lectivas'}`);
  if(tarea.faena&&tarea.obs) extras.push(`Tarea: ${escapeHtml((tarea.obs||'').slice(0,90)+((tarea.obs||'').length>90?'...':''))}`);
  panel.innerHTML=`<strong>Aula:</strong> ${escapeHtml(aula)} | <strong>Guardia prevista:</strong> ${escapeHtml(guardia?getVisibleTeacherName(guardia):'Sin cobertura')} | <strong>Tarea:</strong> ${tarea.faena?'Disponible':'No registrada'}${extras.length?` | ${extras.join(' | ')}`:''}`;
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
    guardiaInput.placeholder='Se asignarÃ¡ automÃ¡ticamente en cada hora';
    return;
  }
  const dia=Number(fDia.value);
  const hora=Number(fHora.value);
  const sugerida=getGuardiaSugerida(dia,hora,1)||'';
  guardiaInput.value=getVisibleTeacherName(sugerida);
  guardiaInput.placeholder=sugerida?'AsignaciÃ³n automÃ¡tica prevista':'Sin guardia disponible';
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
safeInitStep(syncTeacherIdentity,'syncTeacherIdentity');
safeInitStep(refreshAccessUi,'refreshAccessUi');
safeInitStep(()=>{initializeApp().catch(error=>console.error('Init step failed: initializeApp',error));},'initializeApp');
window.setInterval(()=>{pollBackendState();},BACKEND_POLL_INTERVAL_MS);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){
    hydrateTeacherSubstitutions();
    pollBackendState();
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














