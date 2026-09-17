const HORA_MAP={1:{label:'1a',rango:'08:15-09:10'},2:{label:'2a',rango:'09:10-10:05'},3:{label:'3a',rango:'10:05-11:00'},4:{label:'4a',rango:'11:00-11:25'},5:{label:'5a',rango:'11:25-12:20'},6:{label:'6a',rango:'12:20-13:15'},7:{label:'7a',rango:'13:15-14:10'},8:{label:'8a',rango:'14:10-14:25'},9:{label:'9a',rango:'14:25-15:20'}};
const HORAS_PATIO=new Set([4,8]);
const DATASET_PERIODS=Array.isArray(window.PROFESORADO_SOURCE?.periods)?window.PROFESORADO_SOURCE.periods:[];
if(DATASET_PERIODS.length){
  Object.keys(HORA_MAP).forEach(key=>delete HORA_MAP[key]);
  HORAS_PATIO.clear();
  DATASET_PERIODS.forEach(period=>{
    const position=Number(period.position);
    if(!Number.isInteger(position)) return;
    HORA_MAP[position]={label:period.label||period.key||String(position),rango:`${period.startsAt}-${period.endsAt}`};
    if(period.type==='break') HORAS_PATIO.add(position);
  });
}
const ALL_HORAS=Object.keys(HORA_MAP).map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
const DIAS=['Lunes','Martes','Mi\u00e9rcoles','Jueves','Viernes'];
const KEY='IES_Alcalans_Guardias';
const KEY_ORDEN='IES_Alcalans_Guardias_OrdenHora';
const KEY_TAREAS='IES_Alcalans_Tareas_Profesorado';
const KEY_TEACHER_USER='IES_Alcalans_Profesorado_Actual';
const KEY_TEACHER_RECENTS='IES_Alcalans_Profesorado_Recientes';
const KEY_TEACHER_SUBSTITUTIONS='IES_Alcalans_Profesorado_Sustituciones';
const KEY_TEACHER_PRACTICAS_GUARDIAS='IES_Alcalans_Profesorado_Practicas_Guardias';
const KEY_TEACHER_PRACTICAS_GUARDIAS_TRAMOS='IES_Alcalans_Profesorado_Practicas_Guardias_Tramos';
const KEY_PATIO_GUARDIAS='IES_Alcalans_Patio_Guardias';
const KEY_PATIO_TEACHER_BLOCKS='IES_Alcalans_Patio_Teacher_Blocks';
const KEY_PATIO_CONFIG_VERSION='IES_Alcalans_Patio_Config_Version';
const KEY_PRINT_SNAPSHOT='IES_Alcalans_Print_Schedule_Snapshot';
const KEY_TEACHER_FUTURE_ABSENCES='IES_Alcalans_Profesorado_Faltas_Futuras';
const KEY_TEACHER_MOODS='IES_Alcalans_Profesorado_Estado_Animo';
const KEY_SESSION_OVERRIDES='IES_Alcalans_Sesiones_Profesorado';
const KEY_ALUMNOS_FUERA_AULA='IES_Alcalans_Alumnos_Fuera_Aula';
const KEY_HISTORIAL='IES_Alcalans_Historial_Cambios';
const KEY_WEEK='IES_Alcalans_School_Week_Key';
const KEY_ANNUAL_DATASET='IES_Alcalans_Annual_Dataset_Id';
const KEY_TV_ANNOUNCEMENT='IES_Alcalans_TV_Announcement';
const KEY_GUARDIA_MONTHLY_LOAD='IES_Alcalans_Guardias_Monthly_Load';
const KEY_GROUP_STATES='IES_Alcalans_Grupos_Estado';
const MAX_ALUMNOS_FUERA_AULA=10;
const PATIO_PRIMARY_HORA=4;
const PATIO_AUTO_HORARIOS={'11:00-11:25':4,'14:10-14:25':8};
const PATIO_RENDER_HORAS=new Set(HORAS_PATIO);
const PATIO_SECTORS=[
  {id:'0',label:"0 · Porta d'entrada de cristall",shortLabel:'0',mapClass:'patio-sector-0'},
  {id:'0.1',label:'0.1 · Biblioteca (dins)',shortLabel:'0.1',mapClass:'patio-sector-01'},
  {id:'1',label:'1 · Taules fusta fons',shortLabel:'1',mapClass:'patio-sector-1'},
  {id:'2',label:'2 · Corredor Biblioteca',shortLabel:'2',mapClass:'patio-sector-2'},
  {id:'3',label:"3 · Rampa accés al centre portes d'emergència",shortLabel:'3',mapClass:'patio-sector-3'},
  {id:'4',label:'4 · Banys exteriors',shortLabel:'4',mapClass:'patio-sector-4'},
  {id:'5',label:'5 · Barracons',shortLabel:'5',mapClass:'patio-sector-5'}
];
const PATIO_SECTORS_BY_ID=Object.fromEntries(PATIO_SECTORS.map((sector,index)=>[
  sector.id,
  {...sector,type:'sector',capacity:1,isPhysical:true,order:index}
]));
const CANONICAL_BREAK_DUTIES=Array.isArray(window.PROFESORADO_SOURCE?.breakDuties)?window.PROFESORADO_SOURCE.breakDuties:[];
const RAW_PATIO_GUARDIAS_SOURCE=window.PATIO_GUARDIAS_SOURCE||null;
const {
  cleanText,
  formatDateKey,
  formatNowParts,
  formatWeekRangeLabel,
  getCurrentMonthKey,
  getCurrentSchoolWeekKey,
  getMonthKeyFromDateKey,
  getSchoolWeekDateFromKey,
  getSchoolWeekKeyFromOffset,
  normalizeText,
  repairMojibakeDeep,
  repairMojibakeText,
  sameNormalizedText,
  stripDiacritics
}=window.GuardiasCore;
const {
  askConfirm,
  askPassword,
  askText,
  bgDialogClose,
  closeDialog,
  openDialog,
  showToast
}=window.GuardiasUi;
const RAW_PROFESORADO=(window.PROFESORADO_SOURCE&&Array.isArray(window.PROFESORADO_SOURCE.teachers))?window.PROFESORADO_SOURCE.teachers:[];
const ANNUAL_DATASET_ID=cleanText(window.PROFESORADO_SOURCE?.datasetId||'unavailable');
const GRUPOS_PROFESORADO={};
const storage=window.GuardiasStorage;
function escapeHtml(value){
  return String(repairMojibakeText(value))
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function getCurrentSchoolSlot(){
  if(Number.isInteger(FORCE_TV_HORA)&&esHoraValida(FORCE_TV_HORA)){
    const forcedDay=Number.isInteger(FORCE_TV_DIA)&&FORCE_TV_DIA>=0&&FORCE_TV_DIA<=4
      ? FORCE_TV_DIA
      : (()=>{const weekday=formatNowParts().date.getDay(); return weekday>=1&&weekday<=5?weekday-1:0;})();
    return {dia:forcedDay,hora:FORCE_TV_HORA,forced:true};
  }
  const {hours,minutes,date}=formatNowParts();
  const total=hours*60+minutes;
  const weekday=date.getDay();
  if(weekday<1||weekday>5) return null;
  const found=Object.entries(HORA_MAP).find(([,info])=>{
    const [start,end]=String(info.rango||'').split('-');
    const [sh,sm]=start.split(':').map(Number);
    const [eh,em]=end.split(':').map(Number);
    if(!Number.isInteger(sh)||!Number.isInteger(sm)||!Number.isInteger(eh)||!Number.isInteger(em)) return false;
    return total>=sh*60+sm&&total<eh*60+em;
  });
  if(!found) return null;
  const hora=Number(found[0]);
  return {dia:weekday-1,hora};
}
const DIA_INDEX={'lunes':0,'martes':1,'miercoles':2,'mi\u00e9rcoles':2,'jueves':3,'viernes':4};
const HORA_INDEX=Object.fromEntries(Object.entries(HORA_MAP).map(([hora,info])=>[info.rango,+hora]));
function esHoraValida(hora){return Number.isInteger(Number(hora))&&Object.hasOwn(HORA_MAP,Number(hora));}
function logInvalidAbsenceHour(context,details={}){
  try{
    console.warn(`[ausencias] ${context}`,details);
  }catch(_error){
    console.warn(`[ausencias] ${context}`);
  }
}
function normalizaHora(franja){
  const hora=HORA_INDEX[cleanText(franja)] ?? null;
  return esHoraValida(hora)?hora:null;
}
function formatTeacherName(value){return cleanText(value).toLowerCase().split(/([\s(\/-]+)/).map(token=>/^[\s(\/-]+$/.test(token)?token:token.charAt(0).toUpperCase()+token.slice(1)).join('');}
function resolveDiaIndex(value){return {'lunes':0,'martes':1,'miercoles':2,'jueves':3,'viernes':4}[stripDiacritics(value).toLowerCase()] ?? null;}
function isGuardiaTexto(texto){return cleanText(texto).toLowerCase().includes('guardia');}
function parseSesion(item){
  const texto=cleanText(item.texto);
  const aula=cleanText(item.aula);
  const partes=texto.split('|').map(parte=>cleanText(parte)).filter(Boolean);
  const canonicalType=cleanText(item.sessionType).toLowerCase();
  const coverage=item.automaticCoverageRequired!==false;
  if(canonicalType&&Object.hasOwn(item,'grupo')&&Object.hasOwn(item,'materia')){
    return {tipo:canonicalType==='class'?'clase':canonicalType,materia:cleanText(item.materia),grupo:cleanText(item.grupo),detalle:texto,aula,automaticCoverageRequired:coverage};
  }
  if(canonicalType==='guardia'||isGuardiaTexto(texto)) return {tipo:'guardia',materia:'Guardia',detalle:'Guardia',grupo:'',aula:aula||'',automaticCoverageRequired:false};
  if(canonicalType&&canonicalType!=='class') return {tipo:canonicalType,materia:partes[0]||texto||'Sesión',detalle:texto||'Sesión',grupo:'',aula:aula||'',automaticCoverageRequired:coverage};
  if(partes.length>=3) return {tipo:'clase',materia:partes[0],grupo:partes[1],detalle:texto,aula:aula||partes[2]||'',automaticCoverageRequired:coverage};
  if(partes.length===2) return {tipo:'clase',materia:partes[0],grupo:'',detalle:texto,aula:aula||partes[1]||'',automaticCoverageRequired:coverage};
  return {tipo:'clase',materia:partes[0]||texto||'Sesión',grupo:'',detalle:texto||'Sesión',aula:aula||'',automaticCoverageRequired:coverage};
}
function buildProfesoradoData(){
  const profesoresBase={};
  const guardiasPorHora={};
  for(let dia=0;dia<5;dia++){
    guardiasPorHora[dia]={};
    for(const hora of ALL_HORAS) guardiasPorHora[dia][hora]=[];
  }
  RAW_PROFESORADO.forEach((teacher,index)=>{
    const nombre=formatTeacherName(teacher.nombre)||`Profesor ${index+1}`;
    const horario={};
    const gruposProfesor=new Set();
    (teacher.horario||[]).forEach(item=>{
      const dia=resolveDiaIndex(item.dia);
      const hora=esHoraValida(item.slot)?Number(item.slot):normalizaHora(item.franja);
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
      const hora=esHoraValida(item.slot)?Number(item.slot):normalizaHora(item.franja);
      if(dia==null||hora==null) return;
      if(HORAS_PATIO.has(hora)) return;
      const key=`${dia}-${hora}`;
      if(guardiasUnicas.has(key)) return;
      guardiasUnicas.add(key);
      guardiasPorHora[dia][hora].push(nombre);
    });
    profesoresBase[nombre]={nombre,nombreCompleto:nombre,sourceCode:cleanText(teacher.sourceCode),departamento:'Profesorado',grupos:[...gruposProfesor],horario};
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
const PROFESORES_BASE_BY_NORMALIZED=Object.fromEntries(Object.keys(PROFESORES_BASE).map(nombre=>[normalizeText(nombre),nombre]));
const ALL_PROFESORES_BY_NORMALIZED=Object.fromEntries(ALL_PROFESORES.map(nombre=>[normalizeText(nombre),nombre]));
const TEACHER_MOOD_OPTIONS = [
  {
    id: 'contento',
    emoji: '\uD83D\uDE0A',
    label: 'Contento',
    tone: 'warm',
    welcome: 'Hoy vienes con buena cara.',
    messages: [
      'Buen ánimo, buena letra y que no falle el café.',
      'Hoy vas con chispa y se nota desde primera hora.',
      'Pinta a jornada de llevarla con una sonrisa decente.',
      'Con este ánimo, hasta la guardia parece amable.',
      'Hoy puedes con el grupo difícil... y con el fácil también.',
      'Día perfecto para que todo fluya, o al menos lo parezca.',
      'Hoy hay energía de sobra para sacar adelante la mañana.',
      'Se nota que hoy vienes con el aula de tu parte.'
    ]
  },
  {
    id: 'cansado',
    emoji: '\uD83D\uDE34',
    label: 'Cansado',
    tone: 'soft',
    welcome: 'Día de ir con calma y café cerca.',
    messages: [
      'Hoy toca sobrevivir con dignidad y alguna taza extra.',
      'Modo ahorro de energía, pero seguimos en pie.',
      'Conviene que la tercera hora no pida heroicidades.',
      'Si hoy no brillas, al menos que no explote nada.',
      'Día de tirar de experiencia más que de entusiasmo.',
      'Reducimos expectativas, mantenemos el tipo.',
      'Hoy con llegar al recreo medio entero ya se considera éxito.',
      'Jornada de resistencia tranquila y oficio docente.'
    ]
  },
  {
    id: 'enfadado',
    emoji: '\uD83D\uDE24',
    label: 'Enfadado',
    tone: 'strong',
    welcome: 'Respiramos hondo y seguimos.',
    messages: [
      'Mejor contar hasta diez antes de abrir ciertos correos.',
      'Hoy viene bien una respiración larga entre clase y clase.',
      'Que el día no pruebe demasiado la paciencia, por favor.',
      'Si algo puede esperar, que espere.',
      'Hoy la diplomacia es tu mejor herramienta.',
      'No todo merece respuesta inmediata.',
      'Conviene elegir muy bien qué batalla merece la pena.',
      'Hoy toca firmeza sin regalar energía de más.'
    ]
  },
  {
    id: 'triste',
    emoji: '\uD83D\uDE14',
    label: 'Triste',
    tone: 'soft',
    welcome: 'Hoy toca cuidarse un poco más.',
    messages: [
      'Vamos pasito a pasito y sin pedir más de la cuenta.',
      'Día de llevarlo con mimo y algo de aire entre horas.',
      'Hoy conviene tratarse con un poco más de suavidad.',
      'Cumplir ya es suficiente hoy.',
      'Permítete ir más lento.',
      'Lo importante hoy es llegar, no destacar.',
      'A veces sostener el día ya es bastante.',
      'Hoy toca bajar un poco el ritmo y protegerse.'
    ]
  },
  {
    id: 'guino',
    emoji: '\uD83D\uDE09',
    label: 'Guiño gracioso',
    tone: 'playful',
    welcome: 'Modo ironía elegante activado.',
    messages: [
      'Hoy toca sacar oficio, humor fino y seguir adelante.',
      'Modo supervivencia elegante activado. Que sea leve.',
      'Si el día se pone raro, al menos que nos pille con estilo.',
      'Sonríe, que nadie sepa el caos que hay detrás.',
      'Hoy improvisamos... pero con dignidad.',
      'Todo bajo control... más o menos.',
      'Que no falte café, tablas y una mirada cómplice.',
      'Hoy se enseña, se resuelve y se disimula estupendamente.'
    ]
  },
  {
    id: 'saturado',
    emoji: '\uD83E\uDD2F',
    label: 'Saturado',
    tone: 'neutral',
    welcome: 'Demasiadas cosas en la cabeza.',
    messages: [
      'Prioriza: no todo es urgente aunque lo parezca.',
      'Hoy toca ir bloque a bloque.',
      'Si sobrevives al correo, ya es victoria.',
      'Paso corto, vista al frente.',
      'Una cosa cada vez. Literalmente.',
      'Entre reuniones, tutorías y clases, respira.',
      'Hoy conviene no abrir más frentes de los necesarios.',
      'Haz primero lo que más despeje la mañana.'
    ]
  },
  {
    id: 'motivado',
    emoji: '\uD83D\uDD25',
    label: 'Motivado',
    tone: 'energetic',
    welcome: 'Hoy vienes con ganas de liarla, pero bien.',
    messages: [
      'Día perfecto para probar algo nuevo en clase.',
      'Hoy puedes marcar la diferencia en el aula.',
      'Ese grupo hoy te lo ganas.',
      'Aprovecha la inercia, no siempre pasa.',
      'Hoy hay energía de proyecto interesante.',
      'Buen día para innovar sin pedir permiso al aburrimiento.',
      'Hoy se nota vocación y oficio a partes iguales.',
      'Pinta a clase de las que dejan huella.'
    ]
  },
  {
    id: 'automatico',
    emoji: '\uD83E\uDDEA',
    label: 'Modo automático',
    tone: 'neutral',
    welcome: 'Hoy se tira de oficio.',
    messages: [
      'Sin emociones, pero con eficacia.',
      'Hoy funciona el piloto automático.',
      'Cumplir el guion ya es suficiente.',
      'Ni brillante ni desastroso: correcto.',
      'Día de rutina bien ejecutada.',
      'Hoy manda la estructura más que la inspiración.',
      'Clase preparada, café listo y adelante.',
      'No hace falta épica para sacar el día.'
    ]
  },
  {
    id: 'caotico',
    emoji: '\uD83C\uDF2A\uFE0F',
    label: 'Caótico',
    tone: 'playful',
    welcome: 'Hoy pinta a día movido.',
    messages: [
      'A ver qué sorpresa trae cada hora.',
      'Planifica, pero con flexibilidad máxima.',
      'Hoy el horario es orientativo.',
      'Si algo sale según lo previsto, celébralo.',
      'Día de adaptación continua.',
      'Entre cambios, avisos y carreras, mantén el rumbo.',
      'Hoy toca improvisar con elegancia docente.',
      'Que el caos no te quite el compás.'
    ]
  },
  {
    id: 'tranquilo',
    emoji: '\uD83D\uDE0C',
    label: 'Tranquilo',
    tone: 'warm',
    welcome: 'Día equilibrado por delante.',
    messages: [
      'Sin prisa, pero sin pausa.',
      'Hoy todo debería ir razonablemente bien.',
      'Día para trabajar con calma y cabeza.',
      'Aprovecha la estabilidad.',
      'Buen día para avanzar sin ruido.',
      'Hoy el aula invita a trabajar con serenidad.',
      'Cuando todo está en su sitio, se nota.',
      'Jornada amable para enseñar sin sobresaltos.'
    ]
  }
];
let isAdmin=false,day=0,editId=null;
let editAbsenceGroupIds=[];
let isSuperAdmin=false;
let currentAuthSession=null;
let canAdmin=false;
let canSuperAdmin=false;
let authenticatedTeacherSourceCode='';
let teacherName='';
let teacherDay=0;
let teacherAccessMatches=[];
let teacherAccessActiveIndex=-1;
let teacherRecents=[];
let teacherIdentityConfirmedFor='';
let teacherMoodEntries={};
let absenceMatches=[];
let absenceActiveIndex=-1;
let teacherSubstitutions={};
let teacherSubstitutionDetails={};
let teacherPracticasGuardias=[];
let teacherPracticasGuardiasTramos=[];
let patioGuardias=[];
let patioTeacherBlocks=[];
let bibliotecaGuardias=[];
let banosGuardias=[];
let practicasGuardiasFilter='';
let practicasGuardiasConfigTeacher='';
let substitutionFilter='';
let teacherDutyFocusTimer=null;
let teacherFutureAbsences=[];
let futureAbsenceAdminStatusFilter='all';
let futureAbsenceAdminTeacherFilter='';
let groupStateFilter='';
let weekOffset=0;
let teacherWeekOffset=0;
let adminTableFilter='all';
let absenceSelectedHours=[];
let selectedAbsenceIds=new Set();
const demo=[];
const APP_URL_PARAMS=new URLSearchParams(window.location.search||'');
const APP_PATHNAME=(window.location.pathname||'').toLowerCase();
window.GUARDIAS_CLIENT_VERSION='argos-1.0.1-unified-auth';
const TV_MODE=APP_URL_PARAMS.get('view')==='tv'||APP_PATHNAME.endsWith('/tv');
const PRINT_MODE=APP_URL_PARAMS.get('view')==='print'||APP_PATHNAME.endsWith('/print');
const SUPERADMIN_ENABLED=APP_URL_PARAMS.get('panel')==='superadmin';
const IS_LOCAL_DEV_HOST=['localhost','127.0.0.1','::1',''].includes(window.location.hostname);
const requestedDay=Number(APP_URL_PARAMS.get('day'));
const requestedWeekOffset=Number(APP_URL_PARAMS.get('weekOffset'));
const FORCE_TV_HORA=Number(APP_URL_PARAMS.get('forceTvHora'));
const FORCE_TV_DIA=Number(APP_URL_PARAMS.get('forceTvDia'));
let superAdminRoutePrompted=false;
const SUPERADMIN_DISCOVERY_STORAGE_KEY='argos-superadmin-discovery-user';
const SUPERADMIN_DISCOVERY_REQUIRED_ACTIVATIONS=7;
const SUPERADMIN_DISCOVERY_RESET_MS=5000;
let superAdminDiscoveryCount=0;
let superAdminDiscoveryLastActivation=0;
let superAdminAccessDiscovered=false;
function clearSuperAdminDiscovery(){
  superAdminDiscoveryCount=0;
  superAdminDiscoveryLastActivation=0;
  superAdminAccessDiscovered=false;
  try{window.sessionStorage.removeItem(SUPERADMIN_DISCOVERY_STORAGE_KEY);}catch(_error){}
}
function restoreSuperAdminDiscovery(){
  superAdminDiscoveryCount=0;
  superAdminDiscoveryLastActivation=0;
  superAdminAccessDiscovered=false;
  try{
    const storedUserId=window.sessionStorage.getItem(SUPERADMIN_DISCOVERY_STORAGE_KEY);
    if(canSuperAdmin&&currentAuthSession?.authenticated&&storedUserId===String(currentAuthSession.userId)){
      superAdminAccessDiscovered=true;
    }else if(storedUserId){
      window.sessionStorage.removeItem(SUPERADMIN_DISCOVERY_STORAGE_KEY);
    }
  }catch(_error){}
}
function recordArgosDiscoveryActivation(){
  if(!currentAuthSession?.authenticated||!canSuperAdmin){
    superAdminDiscoveryCount=0;
    superAdminDiscoveryLastActivation=0;
    return false;
  }
  const now=Date.now();
  if(now-superAdminDiscoveryLastActivation>SUPERADMIN_DISCOVERY_RESET_MS) superAdminDiscoveryCount=0;
  superAdminDiscoveryLastActivation=now;
  superAdminDiscoveryCount+=1;
  if(superAdminDiscoveryCount<SUPERADMIN_DISCOVERY_REQUIRED_ACTIVATIONS) return false;
  superAdminDiscoveryCount=0;
  superAdminDiscoveryLastActivation=0;
  superAdminAccessDiscovered=true;
  try{window.sessionStorage.setItem(SUPERADMIN_DISCOVERY_STORAGE_KEY,String(currentAuthSession.userId));}catch(_error){}
  refreshAccessUi();
  const displayName=cleanText(currentAuthSession.displayName);
  showToast(`Modo Superadmin activado${displayName?`\nBienvenido, ${displayName}.`:''}`,'success');
  return true;
}
const teacherState={
  get teacherName(){return teacherName;},
  set teacherName(value){teacherName=value||'';},
  get teacherDay(){return teacherDay;},
  set teacherDay(value){teacherDay=Number.isInteger(Number(value))?Number(value):0;},
  get teacherAccessMatches(){return teacherAccessMatches;},
  set teacherAccessMatches(value){teacherAccessMatches=Array.isArray(value)?value:[];},
  get teacherAccessActiveIndex(){return teacherAccessActiveIndex;},
  set teacherAccessActiveIndex(value){teacherAccessActiveIndex=Number.isInteger(Number(value))?Number(value):-1;},
  get teacherRecents(){return teacherRecents;},
  set teacherRecents(value){teacherRecents=Array.isArray(value)?value:[];},
  get teacherIdentityConfirmedFor(){return teacherIdentityConfirmedFor;},
  set teacherIdentityConfirmedFor(value){teacherIdentityConfirmedFor=String(value||'');},
  get teacherMoodEntries(){return teacherMoodEntries;},
  set teacherMoodEntries(value){teacherMoodEntries=value&&typeof value==='object'&&!Array.isArray(value)?value:{};},
  get teacherSubstitutions(){return teacherSubstitutions;},
  set teacherSubstitutions(value){teacherSubstitutions=value&&typeof value==='object'&&!Array.isArray(value)?value:{};},
  get teacherPracticasGuardias(){return teacherPracticasGuardias;},
  set teacherPracticasGuardias(value){teacherPracticasGuardias=Array.isArray(value)?value:[];},
  get teacherPracticasGuardiasTramos(){return teacherPracticasGuardiasTramos;},
  set teacherPracticasGuardiasTramos(value){teacherPracticasGuardiasTramos=Array.isArray(value)?value:[];},
  get teacherDutyFocusTimer(){return teacherDutyFocusTimer;},
  set teacherDutyFocusTimer(value){teacherDutyFocusTimer=value??null;},
  get teacherFutureAbsences(){return teacherFutureAbsences;},
  set teacherFutureAbsences(value){teacherFutureAbsences=Array.isArray(value)?value:[];},
  get futureAbsenceAdminStatusFilter(){return futureAbsenceAdminStatusFilter;},
  set futureAbsenceAdminStatusFilter(value){futureAbsenceAdminStatusFilter=String(value||'all')||'all';},
  get futureAbsenceAdminTeacherFilter(){return futureAbsenceAdminTeacherFilter;},
  set futureAbsenceAdminTeacherFilter(value){futureAbsenceAdminTeacherFilter=String(value||'');},
  get teacherWeekOffset(){return teacherWeekOffset;},
  set teacherWeekOffset(value){teacherWeekOffset=Number.isInteger(Number(value))?Number(value):0;}
};
function getTeacherStateSnapshot(){
  return {
    teacherName:teacherState.teacherName,
    teacherDay:teacherState.teacherDay,
    teacherAccessMatches:[...teacherState.teacherAccessMatches],
    teacherAccessActiveIndex:teacherState.teacherAccessActiveIndex,
    teacherRecents:[...teacherState.teacherRecents],
    teacherIdentityConfirmedFor:teacherState.teacherIdentityConfirmedFor,
    teacherMoodEntries:cloneJson(teacherState.teacherMoodEntries),
    teacherSubstitutions:{...teacherState.teacherSubstitutions},
    teacherPracticasGuardias:[...teacherState.teacherPracticasGuardias],
    teacherPracticasGuardiasTramos:cloneJson(teacherState.teacherPracticasGuardiasTramos),
    teacherFutureAbsences:cloneJson(teacherState.teacherFutureAbsences),
    futureAbsenceAdminStatusFilter:teacherState.futureAbsenceAdminStatusFilter,
    futureAbsenceAdminTeacherFilter:teacherState.futureAbsenceAdminTeacherFilter,
    teacherWeekOffset:teacherState.teacherWeekOffset
  };
}
function applyTeacherStatePatch(patch={}){
  if(Object.prototype.hasOwnProperty.call(patch,'teacherName')) teacherState.teacherName=patch.teacherName;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherDay')) teacherState.teacherDay=patch.teacherDay;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherAccessMatches')) teacherState.teacherAccessMatches=patch.teacherAccessMatches;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherAccessActiveIndex')) teacherState.teacherAccessActiveIndex=patch.teacherAccessActiveIndex;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherRecents')) teacherState.teacherRecents=patch.teacherRecents;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherIdentityConfirmedFor')) teacherState.teacherIdentityConfirmedFor=patch.teacherIdentityConfirmedFor;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherMoodEntries')) teacherState.teacherMoodEntries=patch.teacherMoodEntries;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherSubstitutions')) teacherState.teacherSubstitutions=patch.teacherSubstitutions;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherPracticasGuardias')) teacherState.teacherPracticasGuardias=patch.teacherPracticasGuardias;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherPracticasGuardiasTramos')) teacherState.teacherPracticasGuardiasTramos=patch.teacherPracticasGuardiasTramos;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherDutyFocusTimer')) teacherState.teacherDutyFocusTimer=patch.teacherDutyFocusTimer;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherFutureAbsences')) teacherState.teacherFutureAbsences=patch.teacherFutureAbsences;
  if(Object.prototype.hasOwnProperty.call(patch,'futureAbsenceAdminStatusFilter')) teacherState.futureAbsenceAdminStatusFilter=patch.futureAbsenceAdminStatusFilter;
  if(Object.prototype.hasOwnProperty.call(patch,'futureAbsenceAdminTeacherFilter')) teacherState.futureAbsenceAdminTeacherFilter=patch.futureAbsenceAdminTeacherFilter;
  if(Object.prototype.hasOwnProperty.call(patch,'teacherWeekOffset')) teacherState.teacherWeekOffset=patch.teacherWeekOffset;
  return getTeacherStateSnapshot();
}
window.GuardiasTeacherState={
  getSnapshot:getTeacherStateSnapshot,
  patch:applyTeacherStatePatch,
  state:teacherState
};
document.body.classList.toggle('tv-mode',TV_MODE);
document.body.classList.toggle('print-mode',PRINT_MODE);
document.body.classList.toggle('superadmin-route',SUPERADMIN_ENABLED);
if(PRINT_MODE){
  if(Number.isInteger(requestedDay)&&requestedDay>=0&&requestedDay<DIAS.length) day=requestedDay;
  if(Number.isInteger(requestedWeekOffset)&&requestedWeekOffset>=-1&&requestedWeekOffset<=3) weekOffset=requestedWeekOffset;
}
function syncAppModeClasses(){
  document.body.classList.toggle('admin-active',isAdmin);
  document.body.classList.toggle('teacher-active',!!teacherName);
  document.body.classList.toggle('teacher-panel-open',!!document.getElementById('teacherOverlay')?.classList.contains('open'));
}
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
  if(teacherNameEl) teacherNameEl.textContent=nombre;
  if(teacherMetaEl) teacherMetaEl.textContent=`${nombreCompleto} - ${detalle}${substitutionMeta?` - ${substitutionMeta}`:''}`;
  if(teacherBarNameEl) teacherBarNameEl.textContent=`${nombre} - ${detalle}`;
}
function clearTeacherIdentityConfirmation(){
  teacherIdentityConfirmedFor='';
}
async function ensureTeacherIdentityConfirmed(actionLabel){
  const profesor=getProfesor(teacherName);
  if(!currentAuthSession?.authenticated||!currentAuthSession.userId||!authenticatedTeacherSourceCode||!profesor){
    showToast(`Necesitas una identidad docente autenticada para ${actionLabel}.`,'error');
    return false;
  }
  return cleanText(profesor.sourceCode).toUpperCase()===authenticatedTeacherSourceCode;
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
function loadTeacherUser(){return resolveTeacherCanonicalName(storage.readText(KEY_TEACHER_USER,''))||'';}
function persistTeacherUser(nombre){storage.writeText(KEY_TEACHER_USER,resolveTeacherCanonicalName(nombre)||nombre||'');}
function loadTeacherRecents(){return [...new Set(storage.readJson(KEY_TEACHER_RECENTS,[]).map(resolveTeacherCanonicalName).filter(nombre=>getProfesor(nombre)))].slice(0,6);}
function persistTeacherRecents(list){storage.writeJson(KEY_TEACHER_RECENTS,[...new Set((list||[]).map(resolveTeacherCanonicalName).filter(nombre=>getProfesor(nombre)))].slice(0,6));}
function makeTeacherMoodKey(nombre,dateKey){
  return `${normalizeText(resolveTeacherCanonicalName(nombre)||nombre)}|${cleanText(dateKey)}`;
}
function getTeacherMoodEntry(nombre,dateKey){
  return teacherMoodEntries[makeTeacherMoodKey(nombre,dateKey)]||null;
}
function getTeacherMoodOption(id){
  return TEACHER_MOOD_OPTIONS.find(option=>option.id===id)||null;
}
function getTeacherMoodForDate(nombre,dateKey){
  const entry=getTeacherMoodEntry(nombre,dateKey);
  return entry?getTeacherMoodOption(entry.moodId):null;
}
function getTeacherMoodForToday(nombre){
  return getTeacherMoodForDate(nombre,getCurrentDateIso());
}
function getTeacherMoodMessage(nombre,dateKey,moodOption){
  const messages=Array.isArray(moodOption?.messages)?moodOption.messages.filter(Boolean):[];
  if(!messages.length) return '';
  const seed=`${cleanText(nombre)}|${cleanText(dateKey)}|${cleanText(moodOption.id)}`;
  const hash=[...seed].reduce((acc,char)=>acc+char.charCodeAt(0),0);
  return messages[hash%messages.length];
}
function saveTeacherMood(nombre,moodId,dateKey){
  const option=getTeacherMoodOption(moodId);
  if(!option||!nombre||!dateKey) return;
  teacherMoodEntries={
    ...teacherMoodEntries,
    [makeTeacherMoodKey(nombre,dateKey)]:{
      moodId:option.id,
      ts:new Date().toISOString()
    }
  };
  persistTeacherMoods(teacherMoodEntries);
}
function clearTeacherMood(nombre,dateKey){
  const key=makeTeacherMoodKey(nombre,dateKey);
  if(!teacherMoodEntries[key]) return;
  const nextEntries={...teacherMoodEntries};
  delete nextEntries[key];
  teacherMoodEntries=nextEntries;
  persistTeacherMoods(teacherMoodEntries);
}
function loadTeacherSubstitutions(){
  const rows=storage.readJson(KEY_TEACHER_SUBSTITUTIONS,[]);
  if(Array.isArray(rows)){
    return Object.fromEntries(rows.map(row=>[resolveTeacherCanonicalName(row.profesor),cleanText(row.sustituto)]).filter(([profesor,sustituto])=>getProfesor(profesor)&&cleanText(sustituto)));
  }
  return Object.entries(rows||{}).reduce((acc,[profesor,sustituto])=>{
    const canonical=resolveTeacherCanonicalName(profesor);
    if(getProfesor(canonical)&&cleanText(sustituto)) acc[canonical]=cleanText(sustituto);
    return acc;
  },{});
}
function persistTeacherSubstitutions(map){
  storage.writeJson(KEY_TEACHER_SUBSTITUTIONS,Object.entries(map||{}).map(([profesor,sustituto])=>({profesor,sustituto})));
}
function applyTeacherSubstitutionRows(rows){
  const normalized=Array.isArray(rows)?rows:[];
  teacherSubstitutions=Object.fromEntries(normalized.map(row=>[resolveTeacherCanonicalName(row.profesor),cleanText(row.sustituto)]).filter(([profesor,sustituto])=>getProfesor(profesor)&&cleanText(sustituto)));
  teacherSubstitutionDetails=Object.fromEntries(normalized.map(row=>{
    const profesor=resolveTeacherCanonicalName(row.profesor);
    return [profesor,{assignmentId:row.assignmentId||null,status:row.status||'active',startsOn:row.startsOn||'',endsOn:row.endsOn||'',titular:row.titular||{displayName:profesor},substitute:row.substitute||{displayName:cleanText(row.sustituto)}}];
  }).filter(([profesor,item])=>getProfesor(profesor)&&cleanText(item.substitute?.displayName)));
  persistTeacherSubstitutions(teacherSubstitutions);
  return teacherSubstitutions;
}
function loadTeacherPracticasGuardias(){
  return [...new Set(storage.readJson(KEY_TEACHER_PRACTICAS_GUARDIAS,[]).map(row=>resolveTeacherCanonicalName(typeof row==='string'?row:row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
}
function persistTeacherPracticasGuardias(list){
  storage.writeJson(KEY_TEACHER_PRACTICAS_GUARDIAS,[...new Set((list||[]).map(resolveTeacherCanonicalName).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es')).map(profesor=>({profesor})));
}
function normalizePracticasGuardiasSlot(row){
  const profesor=resolveTeacherCanonicalName(row?.profesor);
  const dia=Number(row?.dia);
  const hora=Number(row?.hora);
  if(!getProfesor(profesor)||!Number.isInteger(dia)||dia<0||dia>4||!esHoraValida(hora)||HORAS_PATIO.has(hora)) return null;
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
function normalizePatioGuardiaRow(row){
  const weekKey=cleanText(row?.weekKey);
  const dia=Number(row?.dia);
  const hora=Number(row?.hora);
  const positionId=cleanText(row?.positionId||row?.sectorId).toLowerCase();
  const mappedSector=PATIO_SECTORS_BY_ID[positionId]||null;
  const positionType=cleanText(row?.positionType||(mappedSector?'sector':'extra')).toLowerCase()==='extra'?'extra':'sector';
  const positionLabel=cleanText(row?.positionLabel||mappedSector?.label||row?.label);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)||!Number.isInteger(dia)||dia<0||dia>4||!esHoraValida(hora)||!positionId) return null;
  return {
    weekKey,
    dia,
    hora,
    positionId,
    positionType,
    positionLabel,
    sectorId:positionType==='sector'?positionId:'',
    covered:!!row?.covered,
    responsable:cleanText(row?.responsable),
    note:cleanText(row?.note)
  };
}
function makePatioGuardiaKey(weekKey,dia,hora,positionId){
  return `${cleanText(weekKey)}|${Number(dia)}|${Number(hora)}|${cleanText(positionId).toLowerCase()}`;
}
function loadPatioGuardias(){
  const rows=storage.readJson(KEY_PATIO_GUARDIAS,[]);
  return [...new Map((Array.isArray(rows)?rows:[]).map(normalizePatioGuardiaRow).filter(Boolean).map(row=>[makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId),row])).values()]
    .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.positionId.localeCompare(b.positionId,'es'));
}
function persistPatioGuardias(rows){
  const normalized=[...new Map((rows||[]).map(normalizePatioGuardiaRow).filter(Boolean).map(row=>[makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId),row])).values()]
    .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.positionId.localeCompare(b.positionId,'es'));
  storage.writeJson(KEY_PATIO_GUARDIAS,normalized);
}
function normalizePatioTeacherBlockRow(row){
  const weekKey=cleanText(row?.weekKey);
  const dia=Number(row?.dia);
  const hora=Number(row?.hora);
  const profesor=resolveTeacherCanonicalName(row?.profesor);
  const sourceCode=cleanText(row?.sourceCode||row?.source_code).toUpperCase();
  const reason=cleanText(row?.reason||row?.motivo||'equipo-docente').toLowerCase()||'equipo-docente';
  const note=cleanText(row?.note||row?.nota);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)||!Number.isInteger(dia)||dia<0||dia>4||!Number.isInteger(hora)||!PATIO_RENDER_HORAS.has(hora)||!getProfesor(profesor)) return null;
  return {weekKey,dia,hora,profesor,sourceCode,reason,note};
}
function makePatioTeacherBlockKey(weekKey,dia,hora,profesor){
  return `${cleanText(weekKey)}|${Number(dia)}|${Number(hora)}|${normalizeText(resolveTeacherCanonicalName(profesor)||profesor)}`;
}
function loadPatioTeacherBlocks(){
  const rows=storage.readJson(KEY_PATIO_TEACHER_BLOCKS,[]);
  return [...new Map((Array.isArray(rows)?rows:[]).map(normalizePatioTeacherBlockRow).filter(Boolean).map(row=>[makePatioTeacherBlockKey(row.weekKey,row.dia,row.hora,row.profesor),row])).values()]
    .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.profesor.localeCompare(b.profesor,'es'));
}
function persistPatioTeacherBlocks(rows){
  const normalized=[...new Map((rows||[]).map(normalizePatioTeacherBlockRow).filter(Boolean).map(row=>[makePatioTeacherBlockKey(row.weekKey,row.dia,row.hora,row.profesor),row])).values()]
    .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.profesor.localeCompare(b.profesor,'es'));
  storage.writeJson(KEY_PATIO_TEACHER_BLOCKS,normalized);
}
function loadTeacherFutureAbsences(){return storage.readJson(KEY_TEACHER_FUTURE_ABSENCES,[]);}
function persistTeacherFutureAbsences(rows){storage.writeJson(KEY_TEACHER_FUTURE_ABSENCES,Array.isArray(rows)?rows:[]);}
function loadTeacherMoods(){return storage.readJson(KEY_TEACHER_MOODS,{});}
function persistTeacherMoods(rows){storage.writeJson(KEY_TEACHER_MOODS,rows&&typeof rows==='object'?rows:{});}
function getTvAnnouncementPriorityWeight(priority){
  return priority==='urgent'?0:priority==='important'?1:2;
}
function normalizeTvAnnouncementItem(value,index=0){
  const row=value&&typeof value==='object'?value:{};
  const text=cleanText(row.text).replace(/\s+/g,' ').trim();
  const priority=['urgent','important','normal'].includes(cleanText(row.priority))?cleanText(row.priority):'normal';
  return {
    id:cleanText(row.id)||`aviso-${Date.now()}-${index}`,
    text,
    priority,
    active:!!row.active&&!!text
  };
}
function normalizeTvAnnouncementState(value){
  const row=value&&typeof value==='object'?value:{};
  const itemsSource=Array.isArray(row.items)
    ? row.items
    : ((row.text||row.active)?[{text:row.text,active:row.active,priority:row.priority}]:[]);
  const items=itemsSource
    .map((item,index)=>normalizeTvAnnouncementItem(item,index))
    .filter(item=>item.text);
  return {
    items,
    updatedAt:cleanText(row.updatedAt),
    updatedBy:cleanText(row.updatedBy)
  };
}
function loadTvAnnouncement(){return normalizeTvAnnouncementState(storage.readJson(KEY_TV_ANNOUNCEMENT,{}));}
function persistTvAnnouncement(value){storage.writeJson(KEY_TV_ANNOUNCEMENT,normalizeTvAnnouncementState(value));}
function normalizeGuardiaMonthlyLoadState(value){
  const row=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const monthKey=/^\d{4}-\d{2}$/.test(cleanText(row.monthKey))?cleanText(row.monthKey):getCurrentMonthKey();
  const sourceByDate=row.byDate&&typeof row.byDate==='object'&&!Array.isArray(row.byDate)?row.byDate:{};
  const byDate={};
  Object.entries(sourceByDate).forEach(([dateKey,dayCounts])=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||''))) return;
    if(getMonthKeyFromDateKey(dateKey)!==monthKey) return;
    if(!dayCounts||typeof dayCounts!=='object'||Array.isArray(dayCounts)) return;
    const normalizedDay={};
    Object.entries(dayCounts).forEach(([teacher,count])=>{
      const canonical=resolveTeacherCanonicalName(teacher);
      const numericCount=Math.max(0,Math.round(Number(count)||0));
      if(!canonical||!numericCount) return;
      normalizedDay[canonical]=numericCount;
    });
    if(Object.keys(normalizedDay).length) byDate[dateKey]=normalizedDay;
  });
  const counts={};
  Object.values(byDate).forEach(dayCounts=>{
    Object.entries(dayCounts).forEach(([teacher,count])=>{
      counts[teacher]=(counts[teacher]||0)+(Number(count)||0);
    });
  });
  return {monthKey,byDate,counts};
}
function loadGuardiaMonthlyLoad(){return normalizeGuardiaMonthlyLoadState(storage.readJson(KEY_GUARDIA_MONTHLY_LOAD,{}));}
function persistGuardiaMonthlyLoad(value){storage.writeJson(KEY_GUARDIA_MONTHLY_LOAD,normalizeGuardiaMonthlyLoadState(value));}
function normalizeGroupStateRow(row){
  const grupo=cleanText(row?.grupo);
  if(!grupo) return null;
  return {
    grupo,
    activo:row?.activo!==false&&row?.activo!==0&&row?.activo!=='0',
    updatedAt:cleanText(row?.updatedAt||row?.updated_at)
  };
}
function getDetectedGroupNames(){
  return Object.keys(GRUPOS_PROFESORADO).sort((a,b)=>a.localeCompare(b,'es'));
}
function mergeGroupStatesWithDetected(rows){
  const merged=new Map();
  (Array.isArray(rows)?rows:[]).map(normalizeGroupStateRow).filter(Boolean).forEach(row=>{
    merged.set(normalizeText(row.grupo),row);
  });
  getDetectedGroupNames().forEach(grupo=>{
    const key=normalizeText(grupo);
    if(!merged.has(key)){
      merged.set(key,{grupo,activo:true,updatedAt:''});
    }
  });
  return [...merged.values()].sort((a,b)=>a.grupo.localeCompare(b.grupo,'es'));
}
function loadGroupStates(){
  return mergeGroupStatesWithDetected(storage.readJson(KEY_GROUP_STATES,[]));
}
function persistGroupStates(rows){
  storage.writeJson(KEY_GROUP_STATES,mergeGroupStatesWithDetected(rows));
}
function getGroupStateByName(grupo){
  const key=normalizeText(grupo);
  return groupStates.find(row=>normalizeText(row?.grupo)===key)||null;
}
function isGroupCurrentlyActive(grupo){
  const state=getGroupStateByName(grupo);
  return state?state.activo!==false:true;
}
function loadSessionOverrides(){return storage.readJson(KEY_SESSION_OVERRIDES,{});}
function persistSessionOverrides(d){storage.writeJson(KEY_SESSION_OVERRIDES,d);}
function makeAlumnosFueraKey(nombre,dia,hora){return `${normalizeText(resolveTeacherCanonicalName(nombre)||nombre)}|${dia}|${hora}`;}
function normalizeAlumnosFueraRow(row){
  const profesor=resolveTeacherCanonicalName(row?.profesor);
  const dia=Number(row?.dia);
  const hora=Number(row?.hora);
  const cantidad=Math.max(0,Number(row?.cantidad)||0);
  if(!getProfesor(profesor)||!Number.isInteger(dia)||dia<0||dia>4||!esHoraValida(hora)||HORAS_PATIO.has(hora)) return null;
  return {
    profesor,
    dia,
    hora,
    cantidad,
    lastExitAt:cleanText(row?.lastExitAt||row?.last_exit_at),
    lastReturnAt:cleanText(row?.lastReturnAt||row?.last_return_at),
    updatedAt:cleanText(row?.updatedAt||row?.updated_at)
  };
}
function loadAlumnosFueraAula(){
  const rows=storage.readJson(KEY_ALUMNOS_FUERA_AULA,[]);
  return Object.fromEntries((Array.isArray(rows)?rows:[]).map(normalizeAlumnosFueraRow).filter(Boolean).map(row=>[makeAlumnosFueraKey(row.profesor,row.dia,row.hora),row]));
}
function persistAlumnosFueraAula(rows){
  storage.writeJson(KEY_ALUMNOS_FUERA_AULA,Object.values(rows||{}).map(normalizeAlumnosFueraRow).filter(Boolean));
}
function loadHistorial(){return storage.readJson(KEY_HISTORIAL,[]);}
function persistHistorial(d){storage.writeJson(KEY_HISTORIAL,d);}
function loadWeekKey(){return storage.readText(KEY_WEEK,'');}
function persistWeekKey(value){storage.writeText(KEY_WEEK,value||'');}
function loadAnnualDatasetId(){return storage.readText(KEY_ANNUAL_DATASET,'');}
function persistAnnualDatasetId(value){storage.writeText(KEY_ANNUAL_DATASET,value||'');}
function getPatioConfigVersion(){
  const raw=JSON.stringify(RAW_PATIO_GUARDIAS_SOURCE||{});
  let hash=0;
  for(let index=0;index<raw.length;index++){
    hash=((hash<<5)-hash)+raw.charCodeAt(index);
    hash|=0;
  }
  return `patio-${raw.length}-${Math.abs(hash)}`;
}
function resetPatioLocalStateIfNeeded(){
  if(storage.isBackendOnly()) return false;
  const nextVersion=getPatioConfigVersion();
  const currentVersion=storage.readText(KEY_PATIO_CONFIG_VERSION,'');
  if(currentVersion===nextVersion) return false;
  storage.writeText(KEY_PATIO_GUARDIAS,'');
  storage.writeText(KEY_PATIO_TEACHER_BLOCKS,'');
  storage.writeText(KEY_PATIO_CONFIG_VERSION,nextVersion);
  return true;
}
function resetAnnualLocalStateIfNeeded(){
  if(storage.isBackendOnly()) return false;
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
    KEY_ALUMNOS_FUERA_AULA,
    KEY_HISTORIAL,
    KEY_PATIO_GUARDIAS,
    KEY_PATIO_TEACHER_BLOCKS,
    KEY_PATIO_CONFIG_VERSION,
    KEY_WEEK,
    KEY_GUARDIA_MONTHLY_LOAD,
    KEY_GROUP_STATES
  ].forEach(key=>storage.writeText(key,''));
  persistAnnualDatasetId(ANNUAL_DATASET_ID);
  return true;
}
function resetWeeklyLocalStateIfNeeded(){
  if(storage.isBackendOnly()) return false;
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
  storage.writeText(KEY_ALUMNOS_FUERA_AULA,'');
  storage.writeText(KEY_PATIO_GUARDIAS,'');
  storage.writeText(KEY_PATIO_TEACHER_BLOCKS,'');
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
function formatTimeShort(value){
  if(!value) return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
}
function getAlumnosFueraRows(){
  return Object.values(alumnosFueraAula).map(normalizeAlumnosFueraRow).filter(Boolean);
}
function getAlumnosFueraTotal(dia,hora){
  return getAlumnosFueraRows()
    .filter(row=>row.dia===dia&&row.hora===hora)
    .reduce((sum,row)=>sum+Math.max(0,Number(row.cantidad)||0),0);
}
function getAlumnosFueraTeacherRow(nombre,dia,hora){
  return alumnosFueraAula[makeAlumnosFueraKey(nombre,dia,hora)]||null;
}
function getAlumnosFueraSummary(){
  const slot=getCurrentSchoolSlot();
  const currentTotal=slot?getAlumnosFueraTotal(slot.dia,slot.hora):0;
  const pending=getAlumnosFueraRows()
    .filter(row=>row.cantidad>0&&(!slot||row.dia!==slot.dia||row.hora!==slot.hora))
    .sort((a,b)=>a.dia-b.dia||a.hora-b.hora||a.profesor.localeCompare(b.profesor,'es'));
  return {
    max:MAX_ALUMNOS_FUERA_AULA,
    current:{slot,total:currentTotal},
    pending
  };
}
function getPasilloLevelClass(total){
  const value=Number(total)||0;
  if(value>=8) return 'is-danger';
  if(value>=5) return 'is-warn';
  return 'is-ok';
}
function renderTvHeaderCorridor(){
  const corridorChip=document.getElementById('tvHeaderCorridor');
  const corridorValue=document.getElementById('tvHeaderCorridorValue');
  if(!corridorChip||!corridorValue) return;
  const corredor=getAlumnosFueraSummary();
  corridorValue.textContent=`${corredor.current.total}/${corredor.max}`;
  corridorChip.classList.remove('tv-header-corridor-ok','tv-header-corridor-warn','tv-header-corridor-danger');
  const level=getPasilloLevelClass(corredor.current.total).replace('is-','');
  corridorChip.classList.add(`tv-header-corridor-${level}`);
}
let tvAnnouncementMarqueeRaf=0;
function stopTvAnnouncementMarquee(){
  if(tvAnnouncementMarqueeRaf){
    cancelAnimationFrame(tvAnnouncementMarqueeRaf);
    tvAnnouncementMarqueeRaf=0;
  }
}
function startTvAnnouncementMarquee(container){
  stopTvAnnouncementMarquee();
  const track=container?.querySelector('.tv-announcement-track');
  const firstSegment=track?.querySelector('.tv-announcement-segment');
  if(!track||!firstSegment) return;
  const containerWidth=container.clientWidth||0;
  const segmentWidth=firstSegment.offsetWidth||0;
  if(!containerWidth||!segmentWidth){
    track.style.transform='translateX(0)';
    return;
  }
  const gap=68;
  const resetOffset=segmentWidth+gap;
  const startOffset=containerWidth;
  const pixelsPerSecond=72;
  let offset=startOffset;
  let lastTime=performance.now();
  function step(now){
    const deltaSec=Math.max(0,(now-lastTime)/1000);
    lastTime=now;
    offset-=pixelsPerSecond*deltaSec;
    if(offset<=-resetOffset){
      offset=startOffset;
    }
    track.style.transform=`translateX(${offset}px)`;
    tvAnnouncementMarqueeRaf=requestAnimationFrame(step);
  }
  track.style.transform=`translateX(${startOffset}px)`;
  tvAnnouncementMarqueeRaf=requestAnimationFrame(step);
}
function renderTvAnnouncement(){
  const bar=document.getElementById('tvAnnouncement');
  const textNode=document.getElementById('tvAnnouncementText');
  const input=document.getElementById('tvAnnouncementInput');
  const priorityInput=document.getElementById('tvAnnouncementPriority');
  const status=document.getElementById('tvAnnouncementStatus');
  const list=document.getElementById('tvAnnouncementList');
  const activeItems=(tvAnnouncement.items||[]).filter(item=>item.active&&item.text);
  const active=activeItems.length>0;
  document.body.classList.toggle('tv-announcement-active',active);
  if(input&&document.activeElement!==input) input.value='';
  if(priorityInput&&document.activeElement!==priorityInput) priorityInput.value='normal';
  if(status){
    status.textContent=active
      ?`${activeItems.length} aviso${activeItems.length===1?'':'s'} activo${activeItems.length===1?'':'s'}${tvAnnouncement.updatedAt?` · ${new Date(tvAnnouncement.updatedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`:''}`
      :'No hay aviso activo.';
  }
  if(list){
    const items=tvAnnouncement.items||[];
    list.innerHTML=items.length?items.map((item,index)=>`
      <div class="tv-admin-item">
        <div class="tv-admin-item-main">
          <span class="tv-admin-priority tv-admin-priority-${item.priority}">${item.priority==='urgent'?'Urgente':item.priority==='important'?'Importante':'Normal'}</span>
          <div class="tv-admin-item-text">${escapeHtml(item.text)}</div>
          <div class="tv-admin-item-meta">${item.active?'Activo en TV':'Guardado sin activar'}</div>
        </div>
        <div class="tv-admin-item-actions">
          <button class="btn-substitution" type="button" onclick="toggleTvAnnouncementItem('${escapeHtml(item.id)}')">${item.active?'Desactivar':'Activar'}</button>
          <button class="btn-substitution" type="button" onclick="moveTvAnnouncementItem('${escapeHtml(item.id)}',-1)" ${index===0?'disabled':''}>Subir</button>
          <button class="btn-substitution" type="button" onclick="moveTvAnnouncementItem('${escapeHtml(item.id)}',1)" ${index===items.length-1?'disabled':''}>Bajar</button>
          <button class="btn-substitution btn-substitution-danger" type="button" onclick="removeTvAnnouncementItem('${escapeHtml(item.id)}')">Eliminar</button>
        </div>
      </div>
    `).join(''):'<div class="future-absence-empty">No hay avisos guardados.</div>';
  }
  if(!bar||!textNode) return;
  bar.hidden=!active;
  if(!active){
    stopTvAnnouncementMarquee();
    delete textNode.dataset.tickerText;
    textNode.innerHTML='';
    return;
  }
  const tickerText=activeItems
    .map(item=>`${item.priority==='urgent'?'URGENTE':item.priority==='important'?'IMPORTANTE':'AVISO'} · ${item.text}`)
    .join('  •  ');
  if(textNode.dataset.tickerText===tickerText&&textNode.querySelector('.tv-announcement-track')){
    return;
  }
  textNode.dataset.tickerText=tickerText;
  textNode.innerHTML=`
    <div class="tv-announcement-track">
      <span class="tv-announcement-segment">${escapeHtml(tickerText)}</span>
      <span class="tv-announcement-segment" aria-hidden="true">${escapeHtml(tickerText)}</span>
    </div>
  `;
  startTvAnnouncementMarquee(textNode);
}
function syncTvExitLink(){
  const exitLink=document.getElementById('tvExitBtn');
  if(!exitLink) return;
  exitLink.setAttribute('href',getMainRouteUrl());
}
window.addEventListener('resize',()=>{
  if(document.getElementById('tvAnnouncement')?.hidden) return;
  const textNode=document.getElementById('tvAnnouncementText');
  if(textNode) startTvAnnouncementMarquee(textNode);
});
function getAlumnosFueraAdminRows(){
  return getAlumnosFueraRows()
    .filter(row=>row.cantidad>0||row.lastExitAt||row.lastReturnAt)
    .sort((a,b)=>a.dia-b.dia||a.hora-b.hora||String(b.lastExitAt||b.updatedAt||'').localeCompare(String(a.lastExitAt||a.updatedAt||''))||a.profesor.localeCompare(b.profesor,'es'));
}
async function hydrateAlumnosFueraAula(){
  if(!storage.hasBackend()) return false;
  try{
    const rows=await storage.fetchAlumnosFueraAula();
    const list=Array.isArray(rows)?rows:rows?.rows;
    if(!Array.isArray(list)) return false;
    const nextState=Object.fromEntries(list.map(normalizeAlumnosFueraRow).filter(Boolean).map(row=>[makeAlumnosFueraKey(row.profesor,row.dia,row.hora),row]));
    const changed=JSON.stringify(alumnosFueraAula)!==JSON.stringify(nextState);
    alumnosFueraAula=nextState;
    persistAlumnosFueraAula(alumnosFueraAula);
    return changed;
  }catch(error){
    console.warn('Alumnos fuera hydration failed',error);
    return false;
  }
}
function formatHistoryAbsence(row){
  if(!row) return '';
  const partes=[formatDiaHora(row.dia,row.hora),getVisibleTeacherName(row.ausente)];
  const aula=resolveAulaRegistro(row)||row.aula||'';
  if(aula) partes.push(aula);
  if(row.guardia) partes.push(`Guardia: ${getVisibleTeacherName(row.guardia)}`);
  return partes.join(' · ');
}
function buildUndoState(targetDay,options={}){
  const state={
    data:cloneJson(data),
    day:typeof targetDay==='number'?targetDay:day
  };
  if(options.includeOrden){
    state.orden=cloneJson(ordenGuardias);
  }
  return state;
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
function getOpenWorkflowOverlayIds(){
  return ['overlay','teacherOverlay','teacherAccessOverlay','historyOverlay','substitutionOverlay','practicasGuardiasOverlay','futureAbsenceAdminOverlay']
    .filter(id=>document.getElementById(id)?.classList.contains('open'));
}
function closeWorkflowOverlays(ids){
  (ids||getOpenWorkflowOverlayIds()).forEach(id=>{
    if(id==='overlay'){
      editId=null;
      closeAusenteSuggestions();
      clearAbsenceFormErrors();
      closeModal();
      return;
    }
    if(id==='teacherOverlay'){
      closeTeacherPanel();
      return;
    }
    if(id==='teacherAccessOverlay'){
      closeTeacherAccess();
      return;
    }
    if(id==='historyOverlay'){
      closeHistoryModal();
      return;
    }
    if(id==='substitutionOverlay'){
      closeSubstitutionModal();
      return;
    }
    if(id==='practicasGuardiasOverlay'){
      closePracticasGuardiasModal();
      return;
    }
    if(id==='futureAbsenceAdminOverlay'){
      closeFutureAbsenceAdminModal();
    }
  });
}
function shuffle(arr){const copy=[...arr];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
function makeOrdenHora(dia,hora){return shuffle(getProfesHora(dia,hora)).map((nombre,index)=>({nombre,numero:index+1}));}
function buildInitialOrden(){const orden={};for(let dia=0;dia<5;dia++){orden[dia]={};for(const hora of ALL_HORAS){orden[dia][hora]=makeOrdenHora(dia,hora);}}persistOrden(orden);return orden;}
function ensureOrden(base){
  const orden={...base};
  for(let dia=0;dia<5;dia++){
    if(!orden[dia]) orden[dia]={};
    for(const hora of ALL_HORAS){
      const esperados=getProfesHora(dia,hora);
      const actuales=Array.isArray(orden[dia][hora])?orden[dia][hora]:[];
      const nombresNormalizados=new Set(actuales.map(item=>normalizeText(item.nombre)));
      const invalido=actuales.length!==esperados.length||esperados.some(nombre=>!nombresNormalizados.has(normalizeText(nombre)));
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
  const blockedNames=getDayLongAbsentTeacherSet(dia,rowsSource);
  const orderedNames=getBalancedGuardiaOrder(dia,hora,{excludeNames:[...blockedNames],rowsSource})
    .filter(item=>isProfesorDisponible(item.nombre,dia,hora,{rowsSource,ignoreAssignedGuardiasAtSlot:true}))
    .map(item=>item.nombre);
  const coverageNeeds=(rowsSource||[])
    .filter(row=>row.dia===dia&&row.hora===hora&&rowNeedsCoverage(row))
    .length;
  const remainingNames=orderedNames.slice(Math.min(coverageNeeds,orderedNames.length));
  return {
    biblioteca:remainingNames[0]||'',
    banos:remainingNames[1]||''
  };
}
function normalizeBibliotecaRow(row){
  const dia=Number(row?.dia);
  const hora=Number(row?.hora);
  const profesor=resolveTeacherCanonicalName(row?.profesor)||cleanText(row?.profesor);
  if(!Number.isInteger(dia)||dia<0||dia>4||!esHoraValida(hora)||HORAS_PATIO.has(hora)||!profesor) return null;
  return {dia,hora,profesor};
}
function setBibliotecaGuardias(rows){
  bibliotecaGuardias=[...new Map(
    (Array.isArray(rows)?rows:[])
      .map(normalizeBibliotecaRow)
      .filter(Boolean)
      .map(row=>[`${row.dia}|${row.hora}`,row])
  ).values()].sort((a,b)=>a.dia-b.dia||a.hora-b.hora||a.profesor.localeCompare(b.profesor,'es'));
  updateSpecialAssignmentsBootstrapButton();
}
function normalizeBanosRow(row){
  const dia=Number(row?.dia);
  const hora=Number(row?.hora);
  const profesor=resolveTeacherCanonicalName(row?.profesor)||cleanText(row?.profesor);
  if(!Number.isInteger(dia)||dia<0||dia>4||!esHoraValida(hora)||HORAS_PATIO.has(hora)||!profesor) return null;
  return {dia,hora,profesor};
}
function setBanosGuardias(rows){
  banosGuardias=[...new Map(
    (Array.isArray(rows)?rows:[])
      .map(normalizeBanosRow)
      .filter(Boolean)
      .map(row=>[`${row.dia}|${row.hora}`,row])
  ).values()].sort((a,b)=>a.dia-b.dia||a.hora-b.hora||a.profesor.localeCompare(b.profesor,'es'));
  updateSpecialAssignmentsBootstrapButton();
}
function getBibliotecaAsignada(dia,hora,rowsSource=data){
  const targetDia=Number(dia);
  const targetHora=Number(hora);
  const persisted=bibliotecaGuardias.find(row=>row.dia===targetDia&&row.hora===targetHora);
  if(persisted) return persisted.profesor;
  if(!storage.hasBackend()) return getSpecialAssignments(targetDia,targetHora,rowsSource).biblioteca||'';
  return '';
}
function getBanosAsignado(dia,hora,rowsSource=data){
  const targetDia=Number(dia);
  const targetHora=Number(hora);
  const persisted=banosGuardias.find(row=>row.dia===targetDia&&row.hora===targetHora);
  if(persisted) return persisted.profesor;

  if(!storage.hasBackend()){
    const biblioteca=getBibliotecaAsignada(targetDia,targetHora,rowsSource);
    const proposal=getSpecialAssignments(targetDia,targetHora,rowsSource);
    if(proposal.banos&&proposal.banos!==biblioteca) return proposal.banos;
    if(proposal.biblioteca&&proposal.biblioteca!==biblioteca) return proposal.biblioteca;
  }

  return '';
}
function allocateEffectiveSpecialAssignments(remainingNames,plannedBiblioteca='',plannedBanos=''){
  const pool=(Array.isArray(remainingNames)?remainingNames:[]).filter(Boolean);
  const capacity=(plannedBiblioteca?1:0)+(plannedBanos?1:0);

  function take(preferredNames){
    for(const preferred of preferredNames){
      if(!preferred) continue;
      const index=pool.findIndex(nombre=>sameNormalizedText(nombre,preferred));
      if(index!==-1) return pool.splice(index,1)[0];
    }
    return pool.shift()||'';
  }

  if(!capacity||!pool.length){
    return {biblioteca:'',banos:''};
  }

  const biblioteca=take([plannedBiblioteca,plannedBanos]);
  const banos=capacity>=2&&pool.length
    ?take([plannedBanos,plannedBiblioteca])
    :'';

  return {biblioteca,banos};
}

function getEffectiveSpecialAssignments(dia,hora,rowsSource=data){
  const plannedBiblioteca=getBibliotecaAsignada(dia,hora,rowsSource);
  const plannedBanos=getBanosAsignado(dia,hora,rowsSource);

  if(!plannedBiblioteca&&!plannedBanos){
    return {biblioteca:'',banos:''};
  }

  const weekKey=getCurrentSchoolWeekKey();
  const remainingNames=getBalancedGuardiaOrder(dia,hora,{rowsSource,weekKey})
    .map(item=>item.nombre)
    .filter(nombre=>isProfesorDisponible(nombre,dia,hora,{
      rowsSource,
      weekKey,
      ignoreAssignedGuardiasAtSlot:false
    }));

  return allocateEffectiveSpecialAssignments(
    remainingNames,
    plannedBiblioteca,
    plannedBanos
  );
}

function buildGuardiaCoverageCounter(options={}){
  const {excludeDia=null,excludeHora=null,dayOnly=null}=options;
  const rowsSource=Array.isArray(options.rowsSource)?options.rowsSource:data;
  const counter={};
  rowsSource.forEach(row=>{
    if(excludeDia===row.dia&&excludeHora===row.hora) return;
    if(dayOnly!=null&&row.dia!==dayOnly) return;
    if(!rowNeedsCoverage(row)) return;
    const nombre=resolveTeacherCanonicalName(row.guardia)||cleanText(row.guardia);
    if(!nombre) return;
    counter[nombre]=(counter[nombre]||0)+1;
  });
  return counter;
}
function getSchoolWeekDateKeys(weekKey){
  return [0,1,2,3,4].map(dayIndex=>getDateForSchoolWeekDay(weekKey,dayIndex)).filter(Boolean);
}
function buildMonthlyGuardiaCoverageCounter(options={}){
  const rowsSource=Array.isArray(options.rowsSource)?options.rowsSource:data;
  const excludeDia=Number.isInteger(options.excludeDia)?options.excludeDia:null;
  const excludeHora=Number.isInteger(options.excludeHora)?options.excludeHora:null;
  const weekKey=cleanText(options.weekKey)||getCurrentSchoolWeekKey();
  const monthKey=getMonthKeyFromDateKey(`${weekKey}-01`)||getCurrentMonthKey();
  const counter={};
  const currentWeekDates=new Set(getSchoolWeekDateKeys(weekKey));
  Object.entries(guardiaMonthlyLoad.byDate||{}).forEach(([dateKey,dayCounts])=>{
    if(currentWeekDates.has(dateKey)) return;
    if(getMonthKeyFromDateKey(dateKey)!==monthKey) return;
    Object.entries(dayCounts||{}).forEach(([teacher,count])=>{
      const canonical=resolveTeacherCanonicalName(teacher);
      const numericCount=Math.max(0,Number(count)||0);
      if(!canonical||!numericCount) return;
      counter[canonical]=(counter[canonical]||0)+numericCount;
    });
  });
  rowsSource.forEach(row=>{
    if(excludeDia===row.dia&&excludeHora===row.hora) return;
    const teacher=resolveTeacherCanonicalName(row.guardia)||cleanText(row.guardia);
    if(!teacher) return;
    const dateKey=getDateForSchoolWeekDay(weekKey,row.dia);
    if(!dateKey||getMonthKeyFromDateKey(dateKey)!==monthKey) return;
    counter[teacher]=(counter[teacher]||0)+1;
  });
  return counter;
}
function buildSlotTieBreakerMap(dia,hora,options={}){
  const weekKey=cleanText(options.weekKey)||getCurrentSchoolWeekKey();
  const slotDateKey=getDateForSchoolWeekDay(weekKey,dia)||`${weekKey}|${dia}`;
  const ordered=seededShuffle(
    getOrdenHora(dia,hora).map(item=>item.nombre),
    `${slotDateKey}|${hora}|guardias-mes`
  );
  return new Map(ordered.map((nombre,index)=>[nombre,index]));
}
function isTeacherAbsentAllDay(nombre,dia,rowsSource=data){
  const scheduledHours=getHorasProgramadasProfesorDia(nombre,dia);
  if(!scheduledHours.length) return false;
  const absentHours=new Set(
    (rowsSource||[])
      .filter(row=>row.dia===dia&&sameNormalizedText(row.ausente,nombre))
      .map(row=>Number(row.hora))
      .filter(Number.isInteger)
  );
  return scheduledHours.every(hora=>absentHours.has(hora));
}
function getAbsentTeacherSetForSlot(dia,hora,rowsSource=data){
  const blocked=new Set(getDayLongAbsentTeacherSet(dia,rowsSource));
  (rowsSource||[])
    .filter(row=>row.dia===dia&&row.hora===hora)
    .forEach(row=>{
      const canonical=resolveTeacherCanonicalName(row?.ausente);
      if(canonical) blocked.add(canonical);
    });
  return blocked;
}
function getDayLongAbsentTeacherSet(dia,rowsSource=data){
  const teacherNames=[...new Set(
    Object.keys(HORARIO_GUARDIAS[dia]||{}).flatMap(hora=>getProfesHora(dia,Number(hora)))
  )];
  return new Set(teacherNames.filter(nombre=>isTeacherAbsentAllDay(nombre,dia,rowsSource)));
}
function getBalancedGuardiaOrder(dia,hora,options={}){
  const {
    excludeNames=[],
    excludeDia=dia,
    excludeHora=hora,
    dayOnly=dia,
    weekKey=getCurrentSchoolWeekKey()
  }=options;
  const rowsSource=Array.isArray(options.rowsSource)?options.rowsSource:data;
  const blocked=new Set([
    ...(excludeNames||[]).filter(Boolean),
    ...getAbsentTeacherSetForSlot(dia,hora,rowsSource)
  ]);
  const monthCounter=buildMonthlyGuardiaCoverageCounter({excludeDia,excludeHora,rowsSource,weekKey});
  const totalCounter=buildGuardiaCoverageCounter({excludeDia,excludeHora,rowsSource});
  const dayCounter=buildGuardiaCoverageCounter({excludeDia,excludeHora,dayOnly,rowsSource});
  const tieBreaker=buildSlotTieBreakerMap(dia,hora,{weekKey});
  const baseOrder=getOrdenHora(dia,hora)
    .map((item,index)=>({...item,index}))
    .filter(item=>!blocked.has(item.nombre));
  return baseOrder.sort((a,b)=>
    (monthCounter[a.nombre]||0)-(monthCounter[b.nombre]||0)||
    (totalCounter[a.nombre]||0)-(totalCounter[b.nombre]||0)||
    (dayCounter[a.nombre]||0)-(dayCounter[b.nombre]||0)||
    (tieBreaker.get(a.nombre)??999)-(tieBreaker.get(b.nombre)??999)||
    a.numero-b.numero||
    a.index-b.index
  );
}
function getOrdenHoraDisponible(dia,hora,excluidos){
  const excluidosSet=new Set((excluidos||[]).filter(Boolean));
  return getBalancedGuardiaOrder(dia,hora,{excludeNames:[...excluidosSet]})
    .filter(item=>isProfesorDisponible(item.nombre,dia,hora,{ignoreAssignedGuardiasAtSlot:false}))
    .map(item=>({nombre:item.nombre,numero:item.numero}));
}
function assignGuardiasForRows(rowsSource){
  const rows=(rowsSource||[]).map(row=>({...row}));
  for(let diaIndex=0;diaIndex<5;diaIndex++){
    for(const hora of ALL_HORAS){
      if(HORAS_PATIO.has(hora)) continue;
      reassignGuardiasForSlot(diaIndex,hora,rows);
    }
  }
  return rows;
}
function reassignGuardiasForSlot(dia,hora,rowsSource=data){
  const rows=rowsSource.filter(row=>row.dia===dia&&row.hora===hora).sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
  if(!rows.length) return;
  const rowsNeedingCoverage=rows.filter(row=>rowNeedsCoverage(row));
  rows.filter(row=>!rowNeedsCoverage(row)).forEach(row=>{row.guardia='';});
  if(!rowsNeedingCoverage.length) return;
  const ausentes=new Set(rows.map(row=>resolveTeacherCanonicalName(row.ausente)).filter(Boolean));
  const weekKey=getCurrentSchoolWeekKey();
  const monthCounter=buildMonthlyGuardiaCoverageCounter({excludeDia:dia,excludeHora:hora,rowsSource,weekKey});
  const totalCounter=buildGuardiaCoverageCounter({excludeDia:dia,excludeHora:hora,rowsSource});
  const dayCounter=buildGuardiaCoverageCounter({excludeDia:dia,excludeHora:hora,dayOnly:dia,rowsSource});
  const tieBreaker=buildSlotTieBreakerMap(dia,hora,{weekKey});
  const orderedNames=getBalancedGuardiaOrder(dia,hora,{excludeNames:[...ausentes],rowsSource,weekKey}).map(item=>item.nombre);
  const shouldLogAssignments=rowsSource===data;
  function logGuardiaDecision(event,details){
    if(!shouldLogAssignments) return;
    console.info(`[guardias] ${event}`,details);
  }
  const availabilityByTeacher=new Map(
    orderedNames.map(nombre=>[
      nombre,
      getProfesorDisponibilidadDetalle(nombre,dia,hora,{
        rowsSource,
        weekKey,
        ignoreAssignedGuardiasAtSlot:true
      })
    ])
  );
  const disponiblesOrdenados=orderedNames.filter(nombre=>availabilityByTeacher.get(nombre)?.available);
  const principales=disponiblesOrdenados;
  const assigned=new Set();
  const availableNames=new Map(disponiblesOrdenados.map(nombre=>[normalizeText(nombre),nombre]));
  function scoreNombre(nombre){
    return [(monthCounter[nombre]||0),(totalCounter[nombre]||0),(dayCounter[nombre]||0)];
  }
  function assignNombre(nombre){
    assigned.add(nombre);
    monthCounter[nombre]=(monthCounter[nombre]||0)+1;
    totalCounter[nombre]=(totalCounter[nombre]||0)+1;
    dayCounter[nombre]=(dayCounter[nombre]||0)+1;
  }
  rowsNeedingCoverage.forEach(row=>{
    const persistedGuardia=resolveTeacherCanonicalName(row.guardia)||cleanText(row.guardia);
    const persistedKey=normalizeText(persistedGuardia);
    if(persistedKey&&availableNames.has(persistedKey)&&!assigned.has(availableNames.get(persistedKey))){
      row.guardia=availableNames.get(persistedKey);
      assignNombre(row.guardia);
      logGuardiaDecision('asignado',{
        dia,
        hora,
        ausente:row.ausente,
        guardia:row.guardia,
        source:'persistida-valida'
      });
      return;
    }
    row.guardia='';
    const candidatosPrincipales=principales
      .filter(nombre=>!assigned.has(nombre))
      .sort((a,b)=>{
        const [aMonth,aTotal,aDay]=scoreNombre(a);
        const [bMonth,bTotal,bDay]=scoreNombre(b);
        return aMonth-bMonth||aTotal-bTotal||aDay-bDay||(tieBreaker.get(a)??999)-(tieBreaker.get(b)??999)||principales.indexOf(a)-principales.indexOf(b);
      });
    orderedNames.forEach(nombre=>{
      const detail=availabilityByTeacher.get(nombre)||{available:false,reason:'sin-evaluacion',nombre};
      logGuardiaDecision('candidato',{dia,hora,ausente:row.ausente,candidato:nombre});
      logGuardiaDecision('disponible',{dia,hora,candidato:nombre,available:detail.available,motivo:detail.reason});
      if(!detail.available){
        logGuardiaDecision('motivo de descarte',{dia,hora,candidato:nombre,motivo:detail.reason});
        return;
      }
      if(assigned.has(nombre)){
        logGuardiaDecision('motivo de descarte',{dia,hora,candidato:nombre,motivo:'ya-asignado-en-este-reparto'});
      }
    });
    const siguientePrincipal=candidatosPrincipales[0];
    if(siguientePrincipal){
      row.guardia=siguientePrincipal;
      assignNombre(siguientePrincipal);
      logGuardiaDecision('asignado',{
        dia,
        hora,
        ausente:row.ausente,
        guardia:siguientePrincipal,
        source:'reparto-principal'
      });
      return;
    }
    row.guardia='';
    logGuardiaDecision('asignado',{
      dia,
      hora,
      ausente:row.ausente,
      guardia:'',
      source:'sin-disponibles'
    });
  });
}
function reassignGuardiasForDayHours(dia,horas){
  [...new Set((horas||[]).map(Number).filter(Number.isInteger))].forEach(hora=>reassignGuardiasForSlot(dia,hora));
}
function getSchoolDayGuardiaHours(){
  return Object.keys(HORA_MAP).map(Number).filter(hora=>!HORAS_PATIO.has(hora));
}
function reassignAllGuardias(){
  for(let dia=0;dia<5;dia++){
    for(const hora of ALL_HORAS){
      if(HORAS_PATIO.has(hora)) continue;
      reassignGuardiasForSlot(dia,hora);
    }
  }
}
function makeAbsenceSyncKey(row){
  return `${Number(row?.dia)}|${Number(row?.hora)}|${normalizeText(row?.ausente)}`;
}
function dedupeAbsenceRowsByLogic(rows,options={}){
  const preferLast=options.preferLast!==false;
  const duplicates=[];
  const byKey=new Map();
  (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
    if(!row||typeof row!=='object') return;
    const key=makeAbsenceSyncKey(row);
    if(!key) return;
    const existing=byKey.get(key);
    if(!existing){
      byKey.set(key,{row:{...row},index});
      return;
    }
    duplicates.push({
      key,
      keptId:preferLast?Number(row?.id):Number(existing.row?.id),
      droppedId:preferLast?Number(existing.row?.id):Number(row?.id)
    });
    const preferred=preferLast?{...row}:{...existing.row};
    const fallback=preferLast?existing.row:row;
    if(!Number.isInteger(Number(preferred.id))&&Number.isInteger(Number(fallback?.id))){
      preferred.id=Number(fallback.id);
    }
    byKey.set(key,{row:preferred,index:preferLast?index:existing.index});
  });
  if(duplicates.length){
    console.warn('[guardias] duplicate local absence rows deduped',duplicates);
  }
  return [...byKey.values()]
    .sort((a,b)=>a.index-b.index)
    .map(item=>item.row);
}
function mergeGuardiasForBackendSync(localRows,remoteRows){
  const merged=new Map();
  (Array.isArray(remoteRows)?remoteRows:[]).forEach(row=>{
    const key=makeAbsenceSyncKey(row);
    if(!key||pendingDeletedAbsenceKeys.has(key)) return;
    merged.set(key,{...row,faena:!!row.faena});
  });
  (Array.isArray(localRows)?localRows:[]).forEach(row=>{
    const key=makeAbsenceSyncKey(row);
    if(!key) return;
    const existing=merged.get(key);
    merged.set(key,{
      ...(existing||{}),
      ...row,
      id:existing?.id ?? row.id,
      faena:!!row.faena
    });
  });
  const usedIds=new Set();
  return [...merged.values()]
    .sort((a,b)=>Number(a.dia)-Number(b.dia)||Number(a.hora)-Number(b.hora)||String(a.ausente||'').localeCompare(String(b.ausente||''),'es'))
    .map(row=>{
      const next={...row};
      const id=Number(next.id);
      if(Number.isInteger(id)&&id>0&&!usedIds.has(id)){
        usedIds.add(id);
      }else{
        next.id=null;
      }
      return next;
    });
}
function getGuardiaSugerida(dia,hora,turno,rowsSource=data){
  return getBalancedGuardiaOrder(dia,hora,{
    rowsSource,
    weekKey:getCurrentSchoolWeekKey()
  })
    .filter(item=>isProfesorDisponible(item.nombre,dia,hora,{rowsSource,ignoreAssignedGuardiasAtSlot:false}))
    [turno-1]?.nombre||'';
}

function getOperationalCoverageName(row,rowsSource=data){
  const persisted=cleanText(row?.guardia);
  if(persisted) return persisted;
  if(storage.hasBackend()) return '';
  if(!rowNeedsCoverage(row)) return '';
  return getGuardiaSugerida(row.dia,row.hora,1,rowsSource);
}
function isPracticasSessionEligible(sesion){
  if(!sesion||sesion.tipo==='guardia') return false;
  const texto=[sesion.materia,sesion.grupo,sesion.detalle,sesion.aula].map(cleanText).filter(Boolean).join(' · ');
  return /(\bCFB\b|\bCFM\b|\bGM\b|\bGS\b|\bFPB\b|INTERMODULAR|FCT|PRACTIC)/i.test(texto);
}
function makePracticasGuardiasSlotKey(profesor,dia,hora){return `${normalizeText(resolveTeacherCanonicalName(profesor)||profesor)}|${dia}|${hora}`;}
function getTeacherPracticasGuardiasSet(){
  return new Set(teacherPracticasGuardias.map(nombre=>resolveTeacherCanonicalName(nombre)).filter(Boolean));
}
function getTeacherPracticasGuardiasTramosSet(){
  return new Set(teacherPracticasGuardiasTramos.map(row=>makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora)));
}
function isTeacherPracticasGuardiasEnabled(nombre){
  return getTeacherPracticasGuardiasSet().has(resolveTeacherCanonicalName(nombre));
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
function getGuardiaBaseTeachersForSlot(dia,hora){
  return [...new Set((HORARIO_GUARDIAS[dia]?.[hora]||[]).map(resolveTeacherCanonicalName).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'es'));
}
function getProfesHora(dia,hora){
  return [...new Set([...getGuardiaBaseTeachersForSlot(dia,hora),...getPracticasGuardiaTeachersForSlot(dia,hora)])]
    .sort((a,b)=>a.localeCompare(b,'es'));
}
function resolveTeacherCanonicalName(nombre){
  const cleaned=cleanText(nombre);
  if(!cleaned) return '';
  return PROFESORES_BASE_BY_NORMALIZED[normalizeText(cleaned)]||ALL_PROFESORES_BY_NORMALIZED[normalizeText(cleaned)]||cleaned;
}
function getProfesor(nombre){
  const canonical=resolveTeacherCanonicalName(nombre);
  return canonical?PROFESORES_BASE[canonical]||null:null;
}
function getProfesorBySourceCode(sourceCode){
  const normalized=cleanText(sourceCode).toUpperCase();
  if(!normalized) return null;
  const raw=RAW_PROFESORADO.find(teacher=>cleanText(teacher?.sourceCode).toUpperCase()===normalized);
  return raw?getProfesor(formatTeacherName(raw.nombre)):null;
}
function getVisibleTeacherName(nombre){
  const canonical=resolveTeacherCanonicalName(nombre);
  return cleanText(teacherSubstitutions[canonical])||canonical||cleanText(nombre)||'';
}
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
    return `Ese nombre coincide con el docente registrado ${canonicalConflict}.`;
  }

  const aliasConflict=Object.entries(teacherSubstitutions).find(([otherNombre,sustituto])=>
    otherNombre!==nombre&&normalizeTeacherSearch(sustituto)===normalizedValue
  );
  if(aliasConflict){
    return `Ese nombre ya está asignado como sustituto de ${aliasConflict[0]}.`;
  }

  return '';
}
function getGuardiasDisponibles(dia,hora,rowsSource=data){
  return getProfesHora(+dia,+hora)
    .filter(nombre=>isProfesorDisponible(nombre,+dia,+hora,{rowsSource,ignoreAssignedGuardiasAtSlot:false}));
}
function getProfesorDisponibilidadDetalle(profesor,dia,hora,options={}){
  const nombre=resolveTeacherCanonicalName(profesor);
  const safeDia=Number(dia);
  const safeHora=Number(hora);
  const rowsSource=Array.isArray(options.rowsSource)?options.rowsSource:data;
  const weekKey=cleanText(options.weekKey)||getCurrentSchoolWeekKey();
  const ignoreAssignedGuardiasAtSlot=options.ignoreAssignedGuardiasAtSlot===true;
  const session=resolveTeacherSession(nombre,safeDia,safeHora);
  const scheduledHours=getHorasProgramadasProfesorDia(nombre,safeDia);
  const scheduledInCenter=scheduledHours.includes(safeHora);
  const baseGuardiaCandidate=getGuardiaBaseTeachersForSlot(safeDia,safeHora).some(candidate=>sameNormalizedText(candidate,nombre));
  const blockedByAbsence=(rowsSource||[]).some(row=>row.dia===safeDia&&row.hora===safeHora&&sameNormalizedText(row.ausente,nombre));
  const blockedAllDay=isTeacherAbsentAllDay(nombre,safeDia,rowsSource);
  const blockedByManualFlag=!!getPatioTeacherBlock(nombre,safeDia,safeHora,weekKey);
  const assignedGuardiaAtSlot=!ignoreAssignedGuardiasAtSlot&&(rowsSource||[]).some(row=>
    row.dia===safeDia&&
    row.hora===safeHora&&
    rowNeedsCoverage(row)&&
    sameNormalizedText(row.guardia,nombre)
  );
  const hasTeachingSession=!!session&&session.tipo!=='guardia';
  if(!nombre||!getProfesor(nombre)){
    return {available:false,reason:'profesor-desconocido',nombre};
  }
  if(!scheduledInCenter){
    return {available:false,reason:'no-trabaja-en-ese-tramo',nombre,scheduledHours};
  }
  if(!baseGuardiaCandidate){
    return {available:false,reason:'sin-disponibilidad-real-en-ese-tramo',nombre};
  }
  if(blockedByAbsence||blockedAllDay){
    return {available:false,reason:blockedAllDay?'ausente-todo-el-dia':'ausente-en-ese-tramo',nombre};
  }
  if(blockedByManualFlag){
    return {available:false,reason:'bloqueado-o-no-disponible',nombre};
  }
  if(hasTeachingSession){
    return {available:false,reason:'ya-tiene-sesion-asignada',nombre,sessionType:session?.tipo||''};
  }
  if(assignedGuardiaAtSlot){
    return {available:false,reason:'ya-tiene-otra-guardia',nombre};
  }
  return {
    available:true,
    reason:'guardia-programada',
    nombre,
    sessionType:session?.tipo||'',
    scheduledHours
  };
}
function isProfesorDisponible(profesor,dia,hora,options={}){
  return getProfesorDisponibilidadDetalle(profesor,dia,hora,options).available;
}
function makePatioPositionDefinition(position,orderIndex=0){
  const rawId=typeof position==='string'?position:position?.id;
  const id=cleanText(rawId).toLowerCase();
  if(!id) return null;
  const mappedSector=PATIO_SECTORS_BY_ID[id]||null;
  const explicitType=cleanText(typeof position==='string'?'':position?.type).toLowerCase();
  const type=explicitType==='extra'?'extra':(mappedSector?'sector':'extra');
  return {
    id,
    type,
    label:cleanText(typeof position==='string'?'':position?.label)||mappedSector?.label||id,
    shortLabel:cleanText(typeof position==='string'?'':position?.shortLabel)||mappedSector?.shortLabel||id,
    mapClass:mappedSector?.mapClass||'',
    order:orderIndex,
    capacity:Math.max(1,Math.round(Number(typeof position==='string'?'':position?.capacity||position?.cupo||position?.slots||position?.capacityCount)||1)),
    isPhysical:type==='sector'
  };
}
function getPatioSectorDefinition(sectorId){
  return PATIO_GUARDIAS_CONFIG.positionsById[cleanText(sectorId).toLowerCase()]||PATIO_SECTORS_BY_ID[cleanText(sectorId).toLowerCase()]||null;
}
function buildAutoPatioGuardiasForWeek(weekKey=getSelectedWeekKey()){
  if(PATIO_GUARDIAS_CONFIG.enabled!==true) return [];
  const rows=[];
  for(let dayIndex=0;dayIndex<5;dayIndex++){
    PATIO_RENDER_HORAS.forEach(hora=>{
      const slot=getPatioSlotConfigForWeek(dayIndex,hora,weekKey);
      (slot.rotation||[]).forEach(item=>{
        const position=PATIO_GUARDIAS_CONFIG.positionsById[item.positionId]||makePatioPositionDefinition({id:item.positionId,type:'extra',label:item.positionId});
        rows.push({
          weekKey:cleanText(weekKey),
          dia:dayIndex,
          hora,
          positionId:item.positionId,
          positionType:position?.type||'extra',
          positionLabel:position?.label||item.positionId,
          sectorId:position?.isPhysical?item.positionId:'',
          covered:!!item.responsable,
          responsable:item.responsable||'',
          note:'',
          auto:true
        });
      });
    });
  }
  return rows;
}
function getResolvedPatioGuardiasForWeek(weekKey=getSelectedWeekKey()){
  const resolved=new Map();
  buildAutoPatioGuardiasForWeek(weekKey).forEach(row=>{
    resolved.set(makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId),row);
  });
  patioGuardias
    .filter(row=>row.weekKey===cleanText(weekKey))
    .forEach(row=>{
      resolved.set(makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId),row);
    });
  return [...resolved.values()].sort((a,b)=>a.dia-b.dia||a.hora-b.hora||a.positionId.localeCompare(b.positionId,'es'));
}
function getPatioGuardiaRowsForSlot(dia,hora,weekKey=getSelectedWeekKey()){
  const safeWeekKey=cleanText(weekKey);
  return getResolvedPatioGuardiasForWeek(safeWeekKey)
    .filter(row=>row.weekKey===safeWeekKey&&row.dia===Number(dia)&&row.hora===Number(hora))
    .sort((a,b)=>a.positionId.localeCompare(b.positionId,'es'));
}
function getPatioSectorStateRaw(dia,hora,sectorId,weekKey=getSelectedWeekKey()){
  const normalizedId=cleanText(sectorId).toLowerCase();
  const sector=getPatioSectorDefinition(normalizedId);
  return getPatioGuardiaRowsForSlot(dia,hora,weekKey).find(row=>row.positionId===normalizedId)||{
    weekKey:cleanText(weekKey),
    dia:Number(dia),
    hora:Number(hora),
    positionId:normalizedId,
    positionType:sector?.type||'sector',
    positionLabel:sector?.label||normalizedId,
    sectorId:normalizedId,
    covered:false,
    responsable:'',
    note:''
  };
}
function hasPatioManualOverride(dia,hora,positionId,weekKey=getSelectedWeekKey()){
  const key=makePatioGuardiaKey(weekKey,dia,hora,positionId);
  return patioGuardias.some(row=>makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId)===key);
}
function getPatioTeacherBlock(profesor,dia,hora,weekKey=getSelectedWeekKey()){
  const key=makePatioTeacherBlockKey(weekKey,dia,hora,profesor);
  return patioTeacherBlocks.find(row=>makePatioTeacherBlockKey(row.weekKey,row.dia,row.hora,row.profesor)===key)||null;
}
function getPatioTeacherAssignmentsForSlot(dia,hora,weekKey=getSelectedWeekKey()){
  return (getPatioSlotConfigForWeek(dia,hora,weekKey).rotation||[]).map(item=>({
    positionId:item.positionId,
    teachers:normalizePatioTeachersForDay(item.teachers||[]),
    teacherSourceCodes:(item.teacherSourceCodes||[]).map(value=>cleanText(value).toUpperCase()).filter(Boolean),
    responsable:cleanText(item.responsable)
  }));
}
function getPatioUnallocatedDutiesForSlot(dia,hora,weekKey=getSelectedWeekKey()){
  return (getPatioSlotConfigForWeek(dia,hora,weekKey).duties||[]).filter(duty=>!duty.positionId&&!duty.fixedPost);
}
function getTeacherPatioAssignmentsForSlot(profesor,dia,hora,weekKey=getSelectedWeekKey()){
  const canonical=resolveTeacherCanonicalName(profesor);
  if(!canonical) return [];
  const sourceCode=cleanText(getProfesor(canonical)?.sourceCode).toUpperCase();
  const slot=getPatioSlotConfigForWeek(dia,hora,weekKey);
  const positioned=(slot.rotation||[])
    .map(item=>({...item,teachers:normalizePatioTeachersForDay(item.teachers||[])}))
    .filter(item=>sourceCode
      ?(item.teacherSourceCodes||[]).includes(sourceCode)
      :item.teachers.includes(canonical))
    .map(item=>{
      const canonicalDuty=(slot.duties||[]).find(duty=>
        duty.positionId===item.positionId&&sourceCode&&duty.sourceCode===sourceCode
      );
      return {
        ...item,
        label:getPatioSectorDefinition(item.positionId)?.label||item.positionId,
        dutyLabel:canonicalDuty?.label||item.dutyLabel||'',
        kind:canonicalDuty?.kind||item.kind||'',
        sourceCode:canonicalDuty?.sourceCode||item.sourceCode||''
      };
    });
  const unallocated=(slot.duties||[]).filter(duty=>!duty.positionId)
    .filter(item=>sourceCode&&item.sourceCode===sourceCode)
    .map(item=>({
      positionId:'',
      teachers:[canonical],
      responsable:canonical,
      label:item.fixedPost||'Sin puesto asignado',
      dutyLabel:item.label,
      kind:item.kind,
      sourceCode:item.sourceCode,
      fixedPost:item.fixedPost||'',
      unallocated:!item.fixedPost
    }));
  return [...positioned,...unallocated];
}
function resolvePatioTeacherBlockNote(block){
  if(!block) return '';
  return block.reason==='equipo-docente'?'Equipo docente':(block.note||'No disponible');
}
function getPatioDisplayState(baseState,dia,hora,weekKey=getSelectedWeekKey()){
  const state=normalizePatioGuardiaRow(baseState);
  if(!state) return null;
  const manualOverride=hasPatioManualOverride(dia,hora,state.positionId,weekKey);
  const assignment=getPatioTeacherAssignmentsForSlot(dia,hora,weekKey).find(item=>item.positionId===state.positionId)||null;
  const assignedTeachers=assignment?.teachers||[];
  const blockedTeachers=assignedTeachers.filter(nombre=>!!getPatioTeacherBlock(nombre,dia,hora,weekKey));
  const availableTeachers=assignedTeachers.filter(nombre=>!getPatioTeacherBlock(nombre,dia,hora,weekKey));
  const reasons=blockedTeachers.map(nombre=>`${getVisibleTeacherName(nombre)} · ${resolvePatioTeacherBlockNote(getPatioTeacherBlock(nombre,dia,hora,weekKey))}`);
  let covered=!!state.covered;
  let responsable=state.responsable||'';
  let note=state.note||'';
  let statusKind=covered?'covered':'pending';
  let statusLabel=covered?'Cubierto':'Pendiente';
  if(assignedTeachers.length&&!manualOverride){
    covered=availableTeachers.length>0;
    responsable=availableTeachers.map(getVisibleTeacherName).join(' · ');
    note=[reasons.length?`No disponible: ${reasons.join(' · ')}`:'',state.note||''].filter(Boolean).join(' · ');
    if(blockedTeachers.length&&availableTeachers.length===0){
      statusKind='blocked';
      statusLabel='Equipo docente';
    }else if(blockedTeachers.length){
      statusKind='partial';
      statusLabel='Parcial';
      covered=true;
    }else{
      statusKind=covered?'covered':'pending';
      statusLabel=covered?'Cubierto':'Pendiente';
    }
  }
  return {
    ...state,
    covered,
    responsable,
    note,
    statusKind,
    statusLabel,
    assignedTeachers,
    blockedTeachers,
    availableTeachers,
    manualOverride
  };
}
function getPatioSectorState(dia,hora,sectorId,weekKey=getSelectedWeekKey()){
  return getPatioDisplayState(getPatioSectorStateRaw(dia,hora,sectorId,weekKey),Number(dia),Number(hora),weekKey)||getPatioSectorStateRaw(dia,hora,sectorId,weekKey);
}
function replacePatioSectorState(nextRow){
  const normalized=normalizePatioGuardiaRow(nextRow);
  if(!normalized) return;
  const key=makePatioGuardiaKey(normalized.weekKey,normalized.dia,normalized.hora,normalized.positionId);
  patioGuardias=[
    ...patioGuardias.filter(row=>makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId)!==key),
    normalized
  ].sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.positionId.localeCompare(b.positionId,'es'));
  persistPatioGuardias(patioGuardias);
}
function getPatioCoverageSummary(dia,hora,weekKey=getSelectedWeekKey()){
  const states=getPatioPhysicalPositionsForSlot(dia,hora,weekKey).map(position=>getPatioSectorState(dia,hora,position.id,weekKey));
  const covered=states.filter(item=>item.covered).length;
  const unresolved=getPatioUnallocatedDutiesForSlot(dia,hora,weekKey).length;
  return {total:states.length,covered,pending:Math.max(states.length-covered,0),unresolved,states};
}
function normalizePatioExtraPost(item,index){
  const row=item&&typeof item==='object'&&!Array.isArray(item)?item:{label:item};
  const label=cleanText(row.label||row.name||row.title||row.puesto||row.post||row.id||`Extra ${index+1}`);
  if(!label) return null;
  const responsable=cleanText(row.responsable||row.teacher||row.profesor||row.assignedTo||row.person||row.coveredBy);
  const covered=typeof row.covered==='boolean'
    ? row.covered
    : (typeof row.isCovered==='boolean'?row.isCovered:!!responsable);
  return {
    id:cleanText(row.id||row.code||row.slug||label).toLowerCase(),
    label,
    responsable,
    covered,
    note:cleanText(row.note||row.notes||row.meta||row.description),
    statusKind:cleanText(row.statusKind),
    statusLabel:cleanText(row.statusLabel)
  };
}
function normalizePatioExtraPosts(items){
  return [...new Map((Array.isArray(items)?items:[])
    .map(normalizePatioExtraPost)
    .filter(Boolean)
    .map(item=>[item.id,item])).values()];
}
function getPatioExtraPostsSummaryExtras(summary){
  if(!summary||typeof summary!=='object') return [];
  return normalizePatioExtraPosts(summary.extraPosts||summary.extras||summary.puestosExtra);
}
function getPatioExtraPostsForSlot(dia,hora,weekKey=getSelectedWeekKey()){
  const slotRows=getPatioGuardiaRowsForSlot(dia,hora,weekKey);
  const configured=getPatioExtraPositionsForSlot(dia,hora,weekKey).map(position=>{
    const rawState=slotRows.find(row=>row.positionId===position.id)||{
      weekKey:cleanText(weekKey),
      dia:Number(dia),
      hora:Number(hora),
      positionId:position.id,
      positionType:position.type||'extra',
      positionLabel:position.label||position.id,
      sectorId:'',
      covered:false,
      responsable:'',
      note:''
    };
    const state=getPatioDisplayState(rawState,Number(dia),Number(hora),weekKey);
    return {
      id:position.id,
      label:position.label,
      responsable:state?.responsable||'',
      covered:state?.covered||!!state?.responsable,
      note:state?.note||'',
      statusKind:state?.statusKind||'pending',
      statusLabel:state?.statusLabel||'Pendiente'
    };
  });
  const unresolved=getPatioUnallocatedDutiesForSlot(dia,hora,weekKey).map(duty=>({
    id:`unallocated-${duty.kind}-${duty.sourceCode}`,
    label:duty.kind==='library'?'Biblioteca patio':'Guardia de patio',
    responsable:getVisibleTeacherName(duty.teacherName),
    covered:false,
    note:duty.label,
    statusKind:'pending',
    statusLabel:'Sin puesto'
  }));
  const fixed=(getPatioSlotConfigForWeek(dia,hora,weekKey).duties||[])
    .filter(duty=>!duty.positionId&&duty.fixedPost)
    .map(duty=>({
      id:`fixed-${duty.kind}-${duty.sourceCode}`,
      label:duty.kind==='library'?'Biblioteca patio':duty.label,
      responsable:getVisibleTeacherName(duty.teacherName),
      covered:true,
      note:duty.label,
      statusKind:'covered',
      statusLabel:`Puesto fijo: ${duty.fixedPost}`
    }));
  return normalizePatioExtraPosts([...configured,...fixed,...unresolved]);
}
function isSchoolSlotActiveNow(targetDay,targetHora){
  const {hours,minutes,date}=formatNowParts();
  const weekday=date.getDay();
  if(weekday<1||weekday>5||weekday-1!==Number(targetDay)) return false;
  const info=HORA_MAP[targetHora];
  if(!info) return false;
  const [start,end]=String(info.rango||'').split('-');
  const [sh,sm]=start.split(':').map(Number);
  const [eh,em]=end.split(':').map(Number);
  if(!Number.isInteger(sh)||!Number.isInteger(sm)||!Number.isInteger(eh)||!Number.isInteger(em)) return false;
  const total=hours*60+minutes;
  return total>=sh*60+sm&&total<eh*60+em;
}
async function togglePatioSectorCoverage(sectorId,dia=day,hora=PATIO_PRIMARY_HORA){
  if(!isAdmin||!isCurrentWeekOffset(weekOffset)) return;
  const current=getPatioSectorStateRaw(dia,hora,sectorId,getSelectedWeekKey());
  replacePatioSectorState({...current,covered:!current.covered});
  renderGuardiaBoard();
  renderTable();
  syncAdminState({manual:true,origin:'patio-sector',reason:'toggle-coverage'});
}
async function editPatioSectorResponsible(sectorId,dia=day,hora=PATIO_PRIMARY_HORA){
  if(!isAdmin||!isCurrentWeekOffset(weekOffset)) return;
  const sector=getPatioSectorDefinition(sectorId);
  if(!sector) return;
  const current=getPatioSectorStateRaw(dia,hora,sectorId,getSelectedWeekKey());
  const value=cleanText(await askText('Cobertura de patio',`Indica quién cubre ${sector.label}. Puedes dejarlo en blanco si solo quieres marcarlo como cubierto.`,current.responsable,'Profesor o anotación breve','Guardar'));
  replacePatioSectorState({...current,responsable:value,covered:current.covered||!!value});
  renderGuardiaBoard();
  syncAdminState({manual:true,origin:'patio-sector',reason:'edit-responsable'});
}
function getPatioCardTitle(hora){
  return hora===8?`${HORA_MAP[hora].label} hora · Patio bachiller`:`${HORA_MAP[hora].label} hora · Patio`;
}
function renderPatioCard(hora=PATIO_PRIMARY_HORA){
  const summary=getPatioCoverageSummary(day,hora,getSelectedWeekKey());
  const physicalPositions=getPatioPhysicalPositionsForSlot(day,hora,getSelectedWeekKey());
  const extraPosts=getPatioExtraPostsForSlot(day,hora,getSelectedWeekKey());
  const canEdit=isAdmin&&isCurrentWeekOffset(weekOffset);
  const isCurrent=isSchoolSlotActiveNow(day,hora);
  const cardClasses=['guardia-card','guardia-card-patio','is-open'];
  if(isCurrent) cardClasses.push('guardia-card-current');
  const statusClass=summary.pending||summary.unresolved?'patio-status-pending':'patio-status-covered';
  const statusLabel=summary.unresolved?`${summary.unresolved} sin puesto`:`${summary.covered}/${summary.total} sectores`;
  const sectorsMarkup=physicalPositions.map(sector=>{
    const state=summary.states.find(item=>item.sectorId===sector.id)||getPatioSectorState(day,hora,sector.id,getSelectedWeekKey());
    const label=state.statusLabel||(state.covered?'Cubierto':'Pendiente');
    return `
      <article class="patio-sector ${sector.mapClass} ${state.statusKind==='blocked'?'is-blocked':state.statusKind==='partial'?'is-partial':state.covered?'is-covered':'is-pending'}">
        <button class="patio-sector-main" type="button" ${canEdit?`onclick="togglePatioSectorCoverage('${sector.id}',${day},${hora})"`:'disabled'}>
          <span class="patio-sector-badge">${escapeHtml(sector.shortLabel||sector.id)}</span>
          <span class="patio-sector-name">${escapeHtml(sector.label)}</span>
          <span class="patio-sector-status">${label}</span>
        </button>
        <div class="patio-sector-meta">
          <span class="patio-sector-person">${escapeHtml(state.responsable||state.note||'Rotación sin asignar')}</span>
          ${canEdit?`<button class="btn-mini patio-sector-edit" type="button" onclick="editPatioSectorResponsible('${sector.id}',${day},${hora})">Anotar</button>`:''}
        </div>
      </article>
    `;
  }).join('');
  const legendMarkup=physicalPositions.map(sector=>{
    const state=summary.states.find(item=>item.sectorId===sector.id)||getPatioSectorState(day,hora,sector.id,getSelectedWeekKey());
    const label=state.statusLabel||(state.covered?'Cubierto':'Pendiente');
    return `
      <div class="patio-legend-item ${state.statusKind==='blocked'?'is-blocked':state.statusKind==='partial'?'is-partial':state.covered?'is-covered':'is-pending'}">
        <span class="patio-legend-dot">${escapeHtml(sector.shortLabel||sector.id)}</span>
        <div class="patio-legend-copy">
          <div class="patio-legend-row">
            <span class="patio-legend-text">${escapeHtml(sector.label)}</span>
            <span class="patio-legend-state">${label}</span>
          </div>
          <div class="patio-legend-person">${escapeHtml(state.responsable||state.note||'Rotación sin asignar')}</div>
        </div>
        ${canEdit?`<button class="btn-mini patio-legend-edit" type="button" onclick="editPatioSectorResponsible('${sector.id}',${day},${hora})">Anotar</button>`:''}
      </div>
    `;
  }).join('');
  const extrasTitle=extraPosts.some(item=>item.statusLabel==='Sin puesto')?'Obligaciones sin puesto':'Puestos extra';
  const extrasMarkup=extraPosts.length?`<div class="patio-extras">
    <div class="patio-extras-head">
      <span class="patio-extras-title">${escapeHtml(extrasTitle)}</span>
      <span class="patio-extras-count">${extraPosts.length}</span>
    </div>
    <div class="patio-extras-list">
      ${extraPosts.map(item=>`
        <div class="patio-extra ${item.statusKind==='blocked'?'is-blocked':item.statusKind==='partial'?'is-partial':item.covered?'is-covered':'is-pending'}">
          <div class="patio-extra-row">
            <span class="patio-extra-name">${escapeHtml(item.label)}</span>
            <span class="patio-extra-state">${escapeHtml(item.statusLabel||(item.covered?'Cubierto':'Pendiente'))}</span>
          </div>
          <div class="patio-extra-person">${escapeHtml(item.responsable||item.note||'Sin asignar')}</div>
        </div>
      `).join('')}
    </div>
  </div>`:'';
  return `<article class="${cardClasses.join(' ')}">
    <div class="guardia-card-toggle guardia-card-toggle-static">
      <span class="guardia-card-head">
        <span class="guardia-num">${escapeHtml(getPatioCardTitle(hora))}</span>
        <span class="guardia-count"><span class="patio-status ${statusClass}">${escapeHtml(statusLabel)}</span></span>
      </span>
    </div>
    <div class="guardia-card-body">
      <div class="patio-card-copy">${escapeHtml(HORA_MAP[hora].rango.replace('-', ' - '))} · cobertura manual por sectores. Esta guardia no entra en el reparto automático.</div>
      <div class="patio-layout">
        <div class="patio-side">
          <div class="patio-legend">${legendMarkup}</div>
          ${extrasMarkup}
        </div>
        <div class="patio-map">${sectorsMarkup}</div>
      </div>
    </div>
  </article>`;
}
function getAusenteInputElement(){
  return document.getElementById('fAusente');
}
function clearAusenteSelection(input=getAusenteInputElement()){
  if(input) delete input.dataset.selectedTeacher;
}
function setAusenteSelection(nombre,input=getAusenteInputElement()){
  if(!input) return;
  const canonical=resolveTeacherCanonicalName(nombre);
  if(canonical){
    input.dataset.selectedTeacher=canonical;
    input.value=getVisibleTeacherName(canonical);
    return;
  }
  clearAusenteSelection(input);
}
function resolveTeacherFromInputValue(value){
  const texto=(value||'').trim();
  if(!texto) return '';
  const normalized=normalizeTeacherSearch(texto);
  const exact=ALL_PROFESORES.find(nombre=>
    getTeacherSearchNames(nombre).some(candidate=>normalizeTeacherSearch(candidate)===normalized)||
    getTeacherUsernames(nombre).includes(normalized)
  );
  if(exact) return exact;
  const matches=getAbsenceMatches(texto);
  return matches.length===1?matches[0]:'';
}
function getProfesorNombreSeleccionado(valor,options={}){
  const input=options.input||null;
  if(options.allowSelectedInput&&input){
    const selected=resolveTeacherCanonicalName(input.dataset?.selectedTeacher||'');
    if(selected) return selected;
  }
  return resolveTeacherFromInputValue(valor);
}
function normalizeTeacherSearch(value){return normalizeText(value);}
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
function getGuardiaNombreSeleccionado(valor,dia,hora,rowsSource=data,options={}){
  const texto=(valor||'').trim();
  if(!texto) return '';
  const normalized=normalizeTeacherSearch(texto);
  const candidateRows=Array.isArray(rowsSource)?rowsSource:[];
  const filteredRows=options.excludeRow
    ? candidateRows.filter(item=>item!==options.excludeRow&&String(item?.id??'')!==String(options.excludeRow?.id??''))
    : candidateRows;
  return getGuardiasDisponibles(dia,hora,filteredRows).find(nombre=>
    getTeacherSearchNames(nombre).some(candidate=>normalizeTeacherSearch(candidate)===normalized)||
    getTeacherUsernames(nombre).includes(normalized)
  )||'';
}
function getHorarioProfesorDia(nombre,dia){return getProfesor(nombre)?.horario?.[dia]||{};}
function getRawTeacherByName(nombre){
  const normalized=normalizeText(nombre);
  if(!normalized) return null;
  return (RAW_PROFESORADO||[]).find(item=>normalizeText(item?.nombre)===normalized)||null;
}
function getRawTeacherScheduledHours(nombre,dia){
  const teacher=getRawTeacherByName(resolveTeacherCanonicalName(nombre)||nombre);
  if(!teacher) return [];
  const sesiones=[...(teacher.horario||[]),...(teacher.guardias||[])];
  return [...new Set(
    sesiones
      .filter(item=>resolveDiaIndex(item?.dia)===Number(dia))
      .map(item=>normalizaHora(item?.franja))
      .filter(hora=>esHoraValida(hora)&&!HORAS_PATIO.has(hora))
  )].sort((a,b)=>a-b);
}
const NON_COVERABLE_SESSION_TOKENS=[
  'reunion',
  'reunión',
  'atencion a familias',
  'atención a familias',
  'familias',
  'tutoria individualizada',
  'tutoría individualizada',
  'tutoria individual',
  'tutoría individual',
  'guardia de patio',
  'patio'
];
function isTeacherSessionCubrible(session,hora){
  if(!session||!Number.isInteger(Number(hora))||HORAS_PATIO.has(Number(hora))) return false;
  if(session.grupo&&!isGroupCurrentlyActive(session.grupo)) return false;
  if(session.tipo==='guardia') return true;
  const combined=normalizeText([session.materia,session.grupo,session.detalle,session.aula].filter(Boolean).join(' '));
  if(!combined) return false;
  return !NON_COVERABLE_SESSION_TOKENS.some(token=>combined.includes(normalizeText(token)));
}
function getSesionesCubriblesProfesor(nombre,dia){
  const sesionesDia=getHorarioProfesorDia(nombre,dia)||{};
  const sesiones=Object.keys(sesionesDia)
    .map(Number)
    .filter(hora=>esHoraValida(hora))
    .filter(hora=>isTeacherSessionCubrible(resolveTeacherSession(nombre,dia,hora),hora))
    .sort((a,b)=>a-b)
    .map(hora=>{
      const sesion=resolveTeacherSession(nombre,dia,hora);
      return {
        profesor:nombre,
        dia,
        hora,
        tipo:sesion?.tipo||'',
        materia:sesion?.materia||'',
        grupo:sesion?.grupo||'',
        detalle:sesion?.detalle||'',
        aula:sesion?.aula||''
      };
    });
  if(sesiones.length) return sesiones;
  return getRawTeacherScheduledHours(nombre,dia)
    .filter(hora=>esHoraValida(hora)&&!HORAS_PATIO.has(hora))
    .map(hora=>({profesor:nombre,dia,hora,tipo:'clase',materia:'',grupo:'',detalle:'',aula:getAulaProfesor(nombre,dia,hora)||''}));
}
function getHorasCubriblesProfesorDia(nombre,dia){
  return getSesionesCubriblesProfesor(nombre,dia)
    .map(item=>Number(item.hora))
    .filter(esHoraValida);
}
function tieneSesionCubrible(profesor,dia,hora){
  return esHoraValida(hora)&&isTeacherSessionCubrible(resolveTeacherSession(profesor,dia,hora),hora);
}
function getHorasProgramadasProfesorDia(nombre,dia){
  const sesiones=getHorarioProfesorDia(nombre,dia);
  const horas=Object.keys(sesiones)
    .map(Number)
    .filter(hora=>esHoraValida(hora)&&!HORAS_PATIO.has(hora)&&sesiones[hora])
    .sort((a,b)=>a-b);
  return horas.length?horas:getRawTeacherScheduledHours(nombre,dia);
}
function getHorasLectivasProfesorDia(nombre,dia){
  return getHorasCubriblesProfesorDia(nombre,dia)
    .filter(hora=>getHorarioProfesorDia(nombre,dia)?.[hora]?.tipo!=='guardia');
}
function getAulaProfesor(nombre,dia,hora){
  const sesion=resolveTeacherSession(nombre,dia,hora);
  return sesion?.aula||'';
}
function makeTeacherUsername(nombre){
  return stripDiacritics(nombre).toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');
}
function getPatioConfigDayKey(dayIndex){
  return ['lunes','martes','miercoles','jueves','viernes'][dayIndex]||'';
}
function resolvePatioTeacherCanonicalName(nombre){
  const exact=resolveTeacherCanonicalName(nombre);
  if(getProfesor(exact)) return exact;
  const normalized=normalizeText(cleanText(nombre));
  if(!normalized) return '';
  const candidates=ALL_PROFESORES.filter(candidate=>{
    const candidateNormalized=normalizeText(candidate);
    return candidateNormalized===normalized||
      candidateNormalized.startsWith(`${normalized} `)||
      candidateNormalized.includes(` ${normalized} `)||
      normalized.startsWith(candidateNormalized);
  });
  return candidates.length===1?candidates[0]:(getProfesor(exact)?exact:'');
}
function normalizePatioTeachersForDay(list){
  return [...new Set((Array.isArray(list)?list:[]).map(resolvePatioTeacherCanonicalName).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
}
function resolveUniqueTeacherSourceCode(nombre){
  const normalized=normalizeText(cleanText(nombre));
  if(!normalized) return '';
  const matches=[...new Set(RAW_PROFESORADO
    .filter(teacher=>normalizeText(formatTeacherName(teacher?.nombre)||teacher?.nombre)===normalized)
    .map(teacher=>cleanText(teacher?.sourceCode).toUpperCase())
    .filter(Boolean))];
  return matches.length===1?matches[0]:'';
}
function normalizePatioDayLabel(value){
  return stripDiacritics(cleanText(value)).toLowerCase();
}
function makePatioSlotKey(dayIndex,hora){
  return `${Number(dayIndex)}|${Number(hora)}`;
}
function normalizePatioSlotTeachers(source,dayIndex,hora,legacyDays={}){
  return normalizePatioTeachersForDay(
    source?.teachers||
    source?.profesores||
    source?.guardias||
    legacyDays[dayIndex]||
    legacyDays[getPatioConfigDayKey(dayIndex)]||
    legacyDays[String(dayIndex)]||
    []
  );
}
function normalizePatioSlotPositions(source,defaultPositions){
  const rawList=Array.isArray(source?.positions)
    ? source.positions
    : Array.isArray(source?.puestos)
      ? source.puestos
      : defaultPositions;
  const normalized=rawList
    .map((position,index)=>makePatioPositionDefinition(position,index))
    .filter(Boolean);
  return [...new Map(normalized.map(position=>[position.id,position])).values()];
}
function normalizePatioSlotAssignments(source,positions){
  const rawList=Array.isArray(source?.assignments)
    ? source.assignments
    : Array.isArray(source?.asignaciones)
      ? source.asignaciones
      : Array.isArray(source?.rotation)
        ? source.rotation
        : Array.isArray(source?.rotacion)
          ? source.rotacion
          : [];
  const positionsById=Object.fromEntries((positions||[]).map(position=>[position.id,position]));
  return rawList.map((item,index)=>{
    const row=item&&typeof item==='object'&&!Array.isArray(item)?item:{positionId:item};
    const positionId=cleanText(row.positionId||row.id||row.sectorId||row.puestoId||row.position).toLowerCase();
    if(!positionId||!positionsById[positionId]) return null;
    const teachersSource=Array.isArray(row.teachers)
      ? row.teachers
      : Array.isArray(row.responsables)
        ? row.responsables
        : Array.isArray(row.profesores)
          ? row.profesores
          : cleanText(row.responsable||row.profesor)
            ? [row.responsable||row.profesor]
            : [];
    const teachers=normalizePatioTeachersForDay(teachersSource);
    return {
      positionId,
      teachers,
      teacherSourceCodes:teachers.map(resolveUniqueTeacherSourceCode).filter(Boolean),
      responsable:teachers.join(' · '),
      order:index
    };
  }).filter(Boolean);
}
function resolveCanonicalPatioDutyTeacher(row){
  const sourceCode=cleanText(row?.sourceCode).toUpperCase();
  if(!sourceCode) return null;
  const rawTeacher=RAW_PROFESORADO.find(teacher=>cleanText(teacher?.sourceCode).toUpperCase()===sourceCode);
  if(!rawTeacher) return null;
  const teacherName=cleanText(rawTeacher.nombre);
  if(!teacherName) return null;
  return {sourceCode,teacherName};
}
function normalizePatioSlotDuties(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>{
    const identity=resolveCanonicalPatioDutyTeacher(row);
    const kind=['patio','library','other'].includes(cleanText(row?.kind).toLowerCase())?cleanText(row.kind).toLowerCase():'other';
    const label=cleanText(row?.label)||(kind==='library'?'BIBLIOTECA PATI':'GUÀRDIES PATI');
    const positionId=cleanText(row?.positionId).toLowerCase();
    const fixedPost=cleanText(row?.fixedPost);
    return identity?{...identity,kind,label,positionId,fixedPost}:null;
  }).filter(Boolean);
}
function normalizePatioSlotConfig(source,dayIndex,hora,legacyDays={},defaultPositions=PATIO_SECTORS){
  const positions=normalizePatioSlotPositions(source,defaultPositions);
  const duties=normalizePatioSlotDuties(source?.duties);
  const assignments=normalizePatioSlotAssignments(source,positions);
  return {
    dayIndex,
    hora,
    tramo:cleanText(source?.tramo||source?.horario||HORA_MAP[hora]?.rango||''),
    teachers:normalizePatioSlotTeachers(source,dayIndex,hora,legacyDays),
    duties,
    positions,
    assignments,
    physicalPositionIds:positions.filter(position=>position.isPhysical).map(position=>position.id),
    extraPositionIds:positions.filter(position=>!position.isPhysical).map(position=>position.id),
    positionIds:positions.map(position=>position.id)
  };
}
function normalizePatioPeriodConfig(period,index=0,options={}){
  const {
    defaultPositions=PATIO_SECTORS,
    legacyDays={},
    fallbackId='periodo',
    fallbackLabel='Periodo'
  }=options;
  const base=period&&typeof period==='object'&&!Array.isArray(period)?period:{};
  const id=cleanText(base.id||`${fallbackId}-${index+1}`)||`${fallbackId}-${index+1}`;
  const label=cleanText(base.label||base.nombre||`${fallbackLabel} ${index+1}`)||`${fallbackLabel} ${index+1}`;
  const start=/^\d{4}-\d{2}-\d{2}$/.test(cleanText(base.start))?cleanText(base.start):'';
  const end=/^\d{4}-\d{2}-\d{2}$/.test(cleanText(base.end))?cleanText(base.end):'';
  const sourceSlots=base.slots&&typeof base.slots==='object'&&!Array.isArray(base.slots)?base.slots:{};
  const slots={};
  for(let dayIndex=0;dayIndex<5;dayIndex++){
    PATIO_RENDER_HORAS.forEach(hora=>{
      const slotKey=makePatioSlotKey(dayIndex,hora);
      const daySlots=base.days?.[getPatioConfigDayKey(dayIndex)]?.slots||base.days?.[dayIndex]?.slots||{};
      const slotSource=sourceSlots[slotKey]||daySlots[slotKey]||daySlots[String(hora)]||{};
      slots[slotKey]=normalizePatioSlotConfig(slotSource,dayIndex,hora,legacyDays,defaultPositions);
    });
  }
  return {id,label,start,end,slots,rotation:{}};
}
function buildLegacyPatioPeriods(source){
  const teachersBySlot={};
  const dayMap={lunes:0,martes:1,miercoles:2,jueves:3,viernes:4};
  source.forEach(entry=>{
    const profesor=resolveTeacherCanonicalName(repairMojibakeText(entry?.profesor));
    if(!profesor||!getProfesor(profesor)) return;
    const guardias=Array.isArray(entry?.guardias)?entry.guardias:[];
    guardias.forEach(guardia=>{
      const hora=PATIO_AUTO_HORARIOS[cleanText(repairMojibakeText(guardia?.horario))];
      if(!hora) return;
      const dayIndex=dayMap[normalizePatioDayLabel(repairMojibakeText(guardia?.dia))];
      if(!Number.isInteger(dayIndex)) return;
      const key=makePatioSlotKey(dayIndex,hora);
      if(!Array.isArray(teachersBySlot[key])) teachersBySlot[key]=[];
      if(!teachersBySlot[key].includes(profesor)) teachersBySlot[key].push(profesor);
    });
  });
  return [
    normalizePatioPeriodConfig({
      id:'legacy',
      label:'Legacy',
      slots:Object.fromEntries(
        Object.entries(teachersBySlot).map(([slotKey,teachers])=>[
          slotKey,
          {teachers,positions:PATIO_SECTORS}
        ])
      )
    },0,{fallbackId:'legacy',fallbackLabel:'Legacy'})
  ];
}
function buildObjectFallbackPatioPeriods(base){
  const defaultPositions=(Array.isArray(base.positions)?base.positions:(Array.isArray(base.sectors)?base.sectors:[]))
    .map((position,index)=>makePatioPositionDefinition(position,index))
    .filter(Boolean);
  const legacyDays=base.teachersByDay&&typeof base.teachersByDay==='object'&&!Array.isArray(base.teachersByDay)?base.teachersByDay:{};
  const sourceSlots=base.teachersBySlot&&typeof base.teachersBySlot==='object'&&!Array.isArray(base.teachersBySlot)?base.teachersBySlot:{};
  return [
    normalizePatioPeriodConfig({
      id:'default',
      label:cleanText(base.label||'Periodo patio')||'Periodo patio',
      start:base.start,
      end:base.end,
      slots:Object.fromEntries(Object.entries(sourceSlots).map(([slotKey,teachers])=>[
        slotKey,
        Array.isArray(teachers)?{teachers,positions:defaultPositions.length?defaultPositions:PATIO_SECTORS}:teachers
      ]))
    },0,{
      defaultPositions:defaultPositions.length?defaultPositions:PATIO_SECTORS,
      legacyDays,
      fallbackId:'periodo',
      fallbackLabel:'Periodo'
    })
  ];
}
function assignPatioRotationForSlot(slot,previousRotation,rotationSeed){
  const positions=Array.isArray(slot?.positions)?slot.positions:[];
  const explicitAssignments=Array.isArray(slot?.assignments)?slot.assignments.filter(item=>item?.positionId):[];
  if(explicitAssignments.length){
    return positions.map(position=>{
      const match=explicitAssignments.find(item=>item.positionId===position.id);
      const teachers=match?.teachers||[];
      return {
        positionId:position.id,
        teachers,
        teacherSourceCodes:match?.teacherSourceCodes||teachers.map(resolveUniqueTeacherSourceCode).filter(Boolean),
        responsable:match?.responsable||teachers.join(' · '),
        kind:match?.kind||'',
        dutyLabel:match?.dutyLabel||'',
        sourceCode:match?.sourceCode||'',
        repeated:false
      };
    });
  }
  const teachers=normalizePatioTeachersForDay(slot?.teachers);
  const previousByTeacher=new Map(
    (Array.isArray(previousRotation)?previousRotation:[])
      .flatMap(item=>{
        const sourceTeachers=Array.isArray(item?.teachers)&&item.teachers.length
          ? item.teachers
          : (cleanText(item?.responsable)?[item.responsable]:[]);
        return sourceTeachers.map(teacher=>[teacher,item.positionId]);
      })
  );
  const orderedTeachers=seededShuffle(teachers,rotationSeed).sort((a,b)=>{
    const aKnown=previousByTeacher.has(a)?0:1;
    const bKnown=previousByTeacher.has(b)?0:1;
    return aKnown-bKnown||a.localeCompare(b,'es');
  });
  const remainingUnits=positions.flatMap(position=>
    Array.from({length:Math.max(1,Number(position.capacity)||1)},()=>position.id)
  );
  const assignedByPosition=new Map(positions.map(position=>[position.id,[]]));
  orderedTeachers.forEach(teacher=>{
    if(!remainingUnits.length) return;
    const previousPositionId=previousByTeacher.get(teacher)||'';
    let positionIndex=remainingUnits.findIndex(positionId=>positionId!==previousPositionId);
    if(positionIndex===-1) positionIndex=0;
    const [positionId]=remainingUnits.splice(positionIndex,1);
    assignedByPosition.get(positionId)?.push(teacher);
  });
  return positions.map(position=>{
    const assignedTeachers=assignedByPosition.get(position.id)||[];
    return {
      positionId:position.id,
      teachers:assignedTeachers,
      teacherSourceCodes:assignedTeachers.map(resolveUniqueTeacherSourceCode).filter(Boolean),
      responsable:assignedTeachers.join(' · '),
      repeated:false
    };
  });
}
function withPatioPeriodRotations(periods){
  const previousBySlot={};
  return periods.map((period,periodIndex)=>{
    const slots={};
    const rotation={};
    Object.entries(period.slots||{}).forEach(([slotKey,slot])=>{
      const previousRotation=previousBySlot[slotKey]||[];
      const nextRotation=assignPatioRotationForSlot(slot,previousRotation,`patio-period|${period.id}|${slotKey}|${periodIndex}`);
      slots[slotKey]={...slot,rotation:nextRotation};
      rotation[slotKey]=nextRotation;
      previousBySlot[slotKey]=nextRotation;
    });
    return {...period,slots,rotation};
  });
}
function normalizePatioGuardiasConfig(source){
  const safeSource=repairMojibakeDeep(source);
  if(Array.isArray(safeSource)){
    const periods=withPatioPeriodRotations(buildLegacyPatioPeriods(safeSource));
    const positions=[...new Map(PATIO_SECTORS.map((sector,index)=>[sector.id,makePatioPositionDefinition(sector,index)])).values()];
    return {
      enabled:true,
      refreshMonths:2,
      rotationStart:'2026-09-01',
      periods,
      positions,
      positionsById:Object.fromEntries(positions.map(position=>[position.id,position]))
    };
  }
  const base=safeSource&&typeof safeSource==='object'&&!Array.isArray(safeSource)?safeSource:{};
  const refreshMonths=Math.max(1,Math.min(12,Math.round(Number(base.refreshMonths)||2)));
  const rotationStart=/^\d{4}-\d{2}-\d{2}$/.test(cleanText(base.rotationStart))?cleanText(base.rotationStart):'2026-09-01';
  const rawPeriods=Array.isArray(base.periods)&&base.periods.length
    ?base.periods
    :buildObjectFallbackPatioPeriods(base);
  const periods=withPatioPeriodRotations(rawPeriods.map((period,index)=>normalizePatioPeriodConfig(period,index,{
    defaultPositions:Array.isArray(base.positions)&&base.positions.length?base.positions:(Array.isArray(base.sectors)&&base.sectors.length?base.sectors:PATIO_SECTORS),
    legacyDays:base.teachersByDay&&typeof base.teachersByDay==='object'&&!Array.isArray(base.teachersByDay)?base.teachersByDay:{},
    fallbackId:'periodo',
    fallbackLabel:'Periodo'
  })));
  const positions=[...new Map(periods.flatMap(period=>Object.values(period.slots||{}).flatMap(slot=>slot.positions||[])).map(position=>[position.id,position])).values()]
    .sort((a,b)=>a.order-b.order||a.label.localeCompare(b.label,'es'));
  return {
    enabled:base.enabled!==false,
    refreshMonths,
    rotationStart,
    periods,
    positions,
    positionsById:Object.fromEntries(positions.map(position=>[position.id,position]))
  };
}
const PATIO_GUARDIAS_CONFIG=normalizePatioGuardiasConfig(RAW_PATIO_GUARDIAS_SOURCE);
function getPatioPeriodForWeek(weekKey=getSelectedWeekKey()){
  const targetDate=getSchoolWeekDateFromKey(cleanText(weekKey))||new Date();
  const isoDate=formatDateKey(targetDate);
  const periods=Array.isArray(PATIO_GUARDIAS_CONFIG.periods)?PATIO_GUARDIAS_CONFIG.periods:[];
  const matches=periods.filter(period=>{
    if(period.start&&isoDate<period.start) return false;
    if(period.end&&isoDate>period.end) return false;
    return true;
  }).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||''))||a.id.localeCompare(b.id,'es'));
  return matches[0]||null;
}
function getPatioSlotConfigForWeek(dia,hora,weekKey=getSelectedWeekKey()){
  const period=getPatioPeriodForWeek(weekKey);
  const configuredSlot=period?.slots?.[makePatioSlotKey(dia,hora)]||normalizePatioSlotConfig({},dia,hora,{},[]);
  const duties=normalizePatioSlotDuties(CANONICAL_BREAK_DUTIES.filter(duty=>
    Number(duty?.weekday)===Number(dia)&&Number(duty?.slot)===Number(hora)
  ));
  return window.GuardiasPatioDutyMerge.mergePatioSlot(configuredSlot,duties,PATIO_SECTORS_BY_ID);
}
function getPatioPhysicalPositionsForSlot(dia,hora,weekKey=getSelectedWeekKey()){
  const slot=getPatioSlotConfigForWeek(dia,hora,weekKey);
  const physicalPositions=(slot.positions||[]).filter(position=>position.isPhysical);
  return physicalPositions;
}
function getPatioExtraPositionsForSlot(dia,hora,weekKey=getSelectedWeekKey()){
  return (getPatioSlotConfigForWeek(dia,hora,weekKey).positions||[]).filter(position=>!position.isPhysical);
}
function makeSessionKey(nombre,dia,hora){return `${normalizeText(resolveTeacherCanonicalName(nombre)||nombre)}|${dia}|${hora}`;}
function getSessionOverride(nombre,dia,hora){return sessionOverrides[makeSessionKey(nombre,dia,hora)]||null;}
function resolveTeacherSession(nombre,dia,hora){
  const base=getHorarioProfesorDia(nombre,dia)?.[hora];
  if(!base) return null;
  const override=getSessionOverride(nombre,dia,hora);
  return override?{...base,...override}:base;
}
function sessionNeedsAutomaticCoverage(session){
  if(!session||typeof session!=='object') return false;
  if(session.automaticCoverageRequired===false) return false;
  if(session.tipo!=='clase') return false;

  const grupo=cleanText(session.grupo);
  if(!grupo) return false;

  return isGroupCurrentlyActive(grupo);
}
function doesAbsenceNeedCoverage(ausente,dia,hora){
  return sessionNeedsAutomaticCoverage(
    resolveTeacherSession(ausente,dia,hora)
  );
}
function rowNeedsCoverage(row){
  if(!row||typeof row!=='object') return false;
  return doesAbsenceNeedCoverage(row.ausente,row.dia,row.hora);
}
function resolveAulaRegistro(row){
  if(!row||typeof row!=='object') return '';
  return getAulaProfesor(row.ausente,row.dia,row.hora)||row.aula||'';
}
function normalizeStoredRows(rows){
  if(!Array.isArray(rows)) return [];
  let changed=false;
  const normalized=dedupeAbsenceRowsByLogic(rows).flatMap(row=>{
    if(!row||typeof row!=='object'){
      changed=true;
      return [];
    }
    const hora=Number(row.hora);
    if(!esHoraValida(hora)){
      logInvalidAbsenceHour('skip hora inválida',{profesor:row.ausente||'',hora,origen:'normalizeStoredRows'});
      changed=true;
      return [];
    }
    const ausente=getProfesorNombreSeleccionado(row.ausente);
    if(!ausente){
      changed=true;
      return [];
    }
    const guardiaValida=rowNeedsCoverage(row)&&row.guardia
      ?getGuardiaNombreSeleccionado(row.guardia,row.dia,row.hora,rows,{excludeRow:row})
      :'';
    const aulaReal=getAulaProfesor(ausente,row.dia,row.hora);
    const aula=aulaReal||'';
    const normalizedRow={
      ...row,
      hora,
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
function makeTareaKey(nombre,dia,hora){return `${normalizeText(resolveTeacherCanonicalName(nombre)||nombre)}|${dia}|${hora}`;}
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
    .filter(row=>row.dia===dia&&row.hora===hora&&sameNormalizedText(row.guardia,nombre))
    .map(row=>({
      ...row,
      faenaInfo:resolveFaena(row),
      aula:resolveAulaRegistro(row)
    }));
}
resetAnnualLocalStateIfNeeded();
resetWeeklyLocalStateIfNeeded();
resetPatioLocalStateIfNeeded();
let sessionOverrides=loadSessionOverrides();
let alumnosFueraAula=loadAlumnosFueraAula();
let groupStates=loadGroupStates();
let data=normalizeStoredRows(load());
let nid=data.reduce((m,g)=>Math.max(m,g.id),0)+1;
let ordenGuardias=loadOrden();
let tareasProfesorado=loadTareas();
let historialCambios=loadHistorial();
let tvAnnouncement=loadTvAnnouncement();
let guardiaMonthlyLoad=loadGuardiaMonthlyLoad();
let historyFilter='all';
let backendSyncInFlight=false;
let backendSyncPendingAdmin=false;
let backendSyncPendingTeacher=false;
let backendSyncPendingPatioTeacherBlocks=false;
let backendHydrated=false;
let backendHydrationPromise=null;
let backendPollingInFlight=false;
const effectiveGuardiaDayStates=new Map();
let pendingDeletedAbsenceKeys=new Set();
let absenceSaveInFlight=false;
let futureAbsenceSyncFlags=new Set();
let superAdminEvents=[];
let lastBackendSnapshot='';
let lastAdminPersistedHash='';
let adminSyncTimer=null;
let adminSyncScheduledDeferred=null;
let lastRenderedGuardiasUiSnapshot='';
let pendingAdminSyncRequest=null;
let realtimeSyncChannel=null;
let superAdminOpsInfo=null;
let superAdminOpsLoading=false;
let superAdminOpsLastFetchAt='';
let superAdminUsers=[];
let superAdminUsersTimer=null;
let superAdminProvisioningPreview=null;
let superAdminProvisioningCredentials=[];
const superAdminStatus={
  lastAdminSyncAt:'',
  lastTeacherSyncAt:'',
  lastPollAt:'',
  lastHydrateAt:'',
  lastError:'',
  lastErrorAt:''
};
const BACKEND_POLL_INTERVAL_MS=IS_LOCAL_DEV_HOST?10000:45000;
const SUPERADMIN_INFO_REFRESH_MS=30000;
const ADMIN_SYNC_DEBOUNCE_MS=800;
const REALTIME_SYNC_KEY='IES_Alcalans_Realtime_Sync';
const REALTIME_SYNC_CHANNEL='ies-alcalans-guardias-sync';
(function(){const wd=new Date().getDay();day=(wd>=1&&wd<=5)?wd-1:0;})();
teacherRecents=loadTeacherRecents();
teacherSubstitutions=loadTeacherSubstitutions();
teacherPracticasGuardias=loadTeacherPracticasGuardias();
teacherPracticasGuardiasTramos=loadTeacherPracticasGuardiasTramos();
patioGuardias=loadPatioGuardias();
patioTeacherBlocks=loadPatioTeacherBlocks();
refreshOrdenGuardias();
teacherFutureAbsences=loadTeacherFutureAbsences();
teacherMoodEntries=loadTeacherMoods();
teacherName='';
teacherDay=day;
applyTeacherStatePatch({
  teacherRecents,
  teacherSubstitutions,
  teacherPracticasGuardias,
  teacherPracticasGuardiasTramos,
  teacherFutureAbsences,
  teacherMoodEntries,
  teacherName,
  teacherDay
});
initRealtimeSync();
// Future-absence runtime adapters.
// Business logic lives exclusively in guardias-future-absences.js.
let hydrateTeacherFutureAbsences;
let normalizeTeacherFutureAbsence;
let sortTeacherFutureAbsences;
let getFutureAbsenceStatusLabel;
let getFutureAbsenceStatusClass;
let getFutureAbsenceHoursForEntry;
let findOverlappingFutureAbsence;
let formatHourListLabel;
let buildProjectedRowsForWeek;
let renderFutureAbsenceAdminList;
let renderTeacherFutureAbsenceOwnList;
let handleTeacherFutureAbsenceDateChange;
let openTeacherFutureAbsenceModal;
let closeTeacherFutureAbsenceModal;
let bgTeacherFutureAbsenceClose;
let submitTeacherFutureAbsence;
let openFutureAbsenceAdminModal;
let closeFutureAbsenceAdminModal;
let bgFutureAbsenceAdminClose;
let handleFutureAbsenceAdminDelete;
let reviewTeacherFutureAbsence;
let updateTeacherFutureAbsenceEntry;
let applyApprovedFutureAbsencesForCurrentWeek;
let createTeacherFutureAbsenceEntry;
let deleteTeacherFutureAbsenceEntry;
let getTeacherFutureAbsenceStats;

const futureAbsencesDomain=window.GuardiasFutureAbsences?.init({
  storage,
  DIAS,
  HORAS_PATIO,
  getTeacherName:()=>teacherState.teacherName,
  getVisibleTeacherName,
  ensureTeacherIdentityConfirmed,
  showToast,
  resolveTeacherSession,
  askConfirm,
  askText,
  isAdmin:()=>isAdmin,
  normalizeTeacherSearch,
  sameNormalizedText,
  makeTeacherUsername,
  escapeHtml,
  getHorasLectivasProfesorDia,
  getCurrentSchoolWeekKey,
  getAbsenceRows:()=>data,
  setAbsenceRows:rows=>{data=rows;},
  claimNextAbsenceRowId:()=>nid++,
  getCurrentDay:()=>day,
  buildUndoState,
  normalizeStoredRows,
  renderGuardiaBoard:()=>renderGuardiaBoard(),
  renderTable:()=>renderTable(),
  getHistoryRows:()=>historialCambios,
  setHistoryRows:rows=>{historialCambios=rows;},
  persistHistorial:rows=>persistHistorial(rows),
  renderHistoryList:()=>renderHistoryList(),
  getAulaProfesor,
  assignGuardiasForRows,
  clearSuperAdminError,
  setSuperAdminError,
  pushSuperAdminEvent,
  renderSuperAdminMonitor,
  onFutureAbsenceStateChange:snapshot=>{
    applyTeacherStatePatch({
      teacherFutureAbsences:snapshot.rows.slice(),
      futureAbsenceAdminStatusFilter:snapshot.adminStatusFilter,
      futureAbsenceAdminTeacherFilter:snapshot.adminTeacherFilter
    });
    futureAbsenceSyncFlags=new Set(snapshot.syncFlags);
  }
},{
  loadFromLocalCache:false,
  renderOnInit:false,
  bindDom:false
})||null;
if(futureAbsencesDomain){
  // The extracted domain is the sole runtime implementation of future absences.
  // Bind it before any initial render, clock tick or backend hydration can run.
  hydrateTeacherFutureAbsences=()=>futureAbsencesDomain.hydrateFromBackend();
  normalizeTeacherFutureAbsence=row=>futureAbsencesDomain.normalizeTeacherFutureAbsence(row);
  sortTeacherFutureAbsences=rows=>futureAbsencesDomain.sortTeacherFutureAbsences(rows);
  getFutureAbsenceStatusLabel=status=>futureAbsencesDomain.getFutureAbsenceStatusLabel(status);
  getFutureAbsenceStatusClass=status=>futureAbsencesDomain.getFutureAbsenceStatusClass(status);
  getFutureAbsenceHoursForEntry=item=>futureAbsencesDomain.getFutureAbsenceHoursForEntry(item);
  findOverlappingFutureAbsence=(entry,options={})=>futureAbsencesDomain.findOverlapping(entry,options);
  formatHourListLabel=hours=>futureAbsencesDomain.formatHourListLabel(hours);
  buildProjectedRowsForWeek=weekKey=>futureAbsencesDomain.buildProjectedRowsForWeek(weekKey);
  renderFutureAbsenceAdminList=()=>futureAbsencesDomain.setAdminFilters({
    status:futureAbsenceAdminStatusFilter,
    teacher:futureAbsenceAdminTeacherFilter
  });
  renderTeacherFutureAbsenceOwnList=()=>futureAbsencesDomain.renderTeacherOwnList();
  handleTeacherFutureAbsenceDateChange=()=>futureAbsencesDomain.handleTeacherDateChange();
  openTeacherFutureAbsenceModal=()=>futureAbsencesDomain.openTeacherModal();
  closeTeacherFutureAbsenceModal=()=>futureAbsencesDomain.closeTeacherModal();
  bgTeacherFutureAbsenceClose=e=>futureAbsencesDomain.handleTeacherOverlayBackgroundClick(e);
  submitTeacherFutureAbsence=()=>futureAbsencesDomain.submitTeacherAbsence();
  openFutureAbsenceAdminModal=()=>futureAbsencesDomain.openAdminModal();
  closeFutureAbsenceAdminModal=()=>futureAbsencesDomain.closeAdminModal();
  bgFutureAbsenceAdminClose=e=>futureAbsencesDomain.handleAdminOverlayBackgroundClick(e);
  handleFutureAbsenceAdminDelete=id=>futureAbsencesDomain.handleAdminDelete(id);
  reviewTeacherFutureAbsence=(id,status)=>futureAbsencesDomain.reviewEntry(id,status);
  updateTeacherFutureAbsenceEntry=entry=>futureAbsencesDomain.updateEntry(entry);
  applyApprovedFutureAbsencesForCurrentWeek=()=>futureAbsencesDomain.applyApprovedForCurrentWeek();
  createTeacherFutureAbsenceEntry=entry=>futureAbsencesDomain.createEntry(entry);
  deleteTeacherFutureAbsenceEntry=id=>futureAbsencesDomain.deleteEntry(id);
  getTeacherFutureAbsenceStats=nombre=>futureAbsencesDomain.getTeacherStats(nombre);

  futureAbsencesDomain.setRows(teacherFutureAbsences,{render:false});
  futureAbsencesDomain.setAdminFilters({
    status:futureAbsenceAdminStatusFilter,
    teacher:futureAbsenceAdminTeacherFilter
  });
}
const auxPanelsSuite=window.GuardiasAuxPanels?.createSuite({
  core:window.GuardiasCore,
  ui:window.GuardiasUi,
  storage,
  horaMap:HORA_MAP,
  horasPatio:HORAS_PATIO,
  dias:DIAS,
  cleanText,
  normalizeText,
  sameNormalizedText,
  formatNowParts,
  formatWeekRangeLabel,
  getCurrentMonthKey,
  getMonthKeyFromDateKey,
  getSchoolWeekDateFromKey
})||null;
const tvAnnouncementsDomain=auxPanelsSuite?.createTvAnnouncementsDomain({
  getState:()=>tvAnnouncement,
  setState:nextState=>{tvAnnouncement=nextState;},
  saveRemote:payload=>storage.hasBackend()?storage.saveTvAnnouncement(payload):payload,
  renderTvPanel:()=>renderTvPanel(),
  notifyRealtimeSync,
  updatedBy:'Jefatura'
})||null;
const tvPanelDomain=auxPanelsSuite?.createTvPanelDomain({
  isAdmin:()=>isAdmin,
  getDay:()=>day,
  getWeekOffset:()=>weekOffset,
  getRowsForWeekOffset,
  getVisibleTeacherName,
  buildTvAbsenceAssignment,
  getEffectiveSpecialAssignments,
  rowNeedsCoverage,
  getEffectiveGuardiaSlot,
  getPatioCoverageSummary:(dia,hora)=>getPatioCoverageSummary(dia,hora,getCurrentSchoolWeekKey()),
  getPatioSectors:(dia,hora)=>getPatioPhysicalPositionsForSlot(dia,hora,getCurrentSchoolWeekKey()),
  getPatioExtraPosts:(dia,hora)=>getPatioExtraPostsForSlot(dia,hora,getCurrentSchoolWeekKey()),
  getSelectedWeekKey,
  getPrintScheduleSnapshot:()=>storage.readJson(KEY_PRINT_SNAPSHOT,null),
  getTvRouteUrl,
  getPrintRouteUrl,
  getMainRouteUrl,
  printMode:()=>PRINT_MODE
})||null;
const historyDomain=auxPanelsSuite?.createHistoryDomain({
  getEntries:()=>historialCambios,
  setEntries:rows=>{historialCambios=rows;},
  isAdmin:()=>isAdmin,
  getData:()=>data,
  getDay:()=>day,
  getOrden:()=>ordenGuardias,
  buildUndoState,
  restoreUndoState,
  renderAdminWorkspace:()=>renderAdminWorkspace(),
  syncAdminState:()=>syncAdminState(),
  onUndoApplied:()=>renderTable()
})||null;
const substitutionsDomain=auxPanelsSuite?.createSubstitutionsDomain({
  getSubstitutions:()=>teacherState.teacherSubstitutions,
  setSubstitutions:nextMap=>{applyTeacherStatePatch({teacherSubstitutions:{...nextMap}});},
  isAdmin:()=>isAdmin,
  allTeachers:ALL_PROFESORES,
  getTeacher:getProfesor,
  getVisibleTeacherName,
  resolveTeacherCanonicalName,
  normalizeTeacherSearch,
  teacherMatchesQuery,
  validateSubstitutionName:validateTeacherSubstitutionName,
  onSubstitutionsChanged:(nombre,nextMap)=>{
    applyTeacherStatePatch({teacherSubstitutions:{...nextMap}});
    if(sameNormalizedText(teacherState.teacherName,nombre)){
      persistTeacherUser(nextMap[nombre]?getVisibleTeacherName(nombre):nombre);
    }
    syncTeacherIdentity();
    renderGuardiaBoard();
    renderTable();
    if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
  },
  syncAdminState:()=>syncAdminState()
})||null;
const practicasGuardiasDomain=auxPanelsSuite?.createPracticasGuardiasDomain({
  getEnabledTeachers:()=>teacherState.teacherPracticasGuardias,
  setEnabledTeachers:nextList=>{applyTeacherStatePatch({teacherPracticasGuardias:[...nextList]});},
  getManualSlots:()=>teacherState.teacherPracticasGuardiasTramos,
  setManualSlots:nextRows=>{applyTeacherStatePatch({teacherPracticasGuardiasTramos:[...nextRows]});},
  isAdmin:()=>isAdmin,
  allTeachers:ALL_PROFESORES,
  getTeacher:getProfesor,
  getVisibleTeacherName,
  resolveTeacherCanonicalName,
  normalizeTeacherSearch,
  teacherMatchesQuery,
  makePracticasGuardiasSlotKey,
  getHorarioProfesorDia,
  resolveTeacherSession,
  isPracticasSessionEligible,
  onPracticasChanged:()=>{
    refreshOrdenGuardias();
    reassignAllGuardias();
    persist(data);
    renderGuardiaBoard();
    renderTable();
    syncAdminState({manual:true,origin:'practicas-domain',reason:'manual-practicas-change'});
  }
})||null;
function serializeBibliotecaAssignments(){
  return bibliotecaGuardias.map(row=>({
    dia:Number(row.dia),
    hora:Number(row.hora),
    profesor:String(row.profesor||'').trim()
  }));
}
function serializeBanosAssignments(){
  return banosGuardias.map(row=>({
    dia:Number(row.dia),
    hora:Number(row.hora),
    profesor:String(row.profesor||'').trim()
  }));
}

function buildSpecialAssignmentsBootstrapPayload(rowsSource=data){
  const persistedBiblioteca=serializeBibliotecaAssignments();
  const persistedBanos=serializeBanosAssignments();

  const biblioteca=persistedBiblioteca.length
    ? persistedBiblioteca.map(row=>({...row}))
    : [];

  const banos=persistedBanos.length
    ? persistedBanos.map(row=>({...row}))
    : [];

  const bibliotecaBySlot=new Map(
    biblioteca.map(row=>[`${row.dia}|${row.hora}`,row.profesor])
  );

  const banosBySlot=new Map(
    banos.map(row=>[`${row.dia}|${row.hora}`,row.profesor])
  );

  for(let dia=0;dia<5;dia++){
    for(const hora of ALL_HORAS){
      if(HORAS_PATIO.has(hora)) continue;

      const key=`${dia}|${hora}`;
      const proposal=getSpecialAssignments(dia,hora,rowsSource);

      if(!persistedBiblioteca.length){
        let profesor=proposal.biblioteca||'';
        const persistedBanosTeacher=banosBySlot.get(key)||'';

        if(profesor&&profesor===persistedBanosTeacher){
          profesor=proposal.banos||'';
        }

        if(profesor&&profesor!==persistedBanosTeacher){
          const row={dia,hora,profesor};
          biblioteca.push(row);
          bibliotecaBySlot.set(key,profesor);
        }
      }

      if(!persistedBanos.length){
        const bibliotecaProfesor=bibliotecaBySlot.get(key)||'';

        let profesor='';
        if(proposal.banos&&proposal.banos!==bibliotecaProfesor){
          profesor=proposal.banos;
        }else if(proposal.biblioteca&&proposal.biblioteca!==bibliotecaProfesor){
          profesor=proposal.biblioteca;
        }

        if(profesor){
          const row={dia,hora,profesor};
          banos.push(row);
          banosBySlot.set(key,profesor);
        }
      }
    }
  }

  return {biblioteca,banos};
}

function updateSpecialAssignmentsBootstrapButton(){
  const button=document.getElementById('btnInitSpecialAssignments');
  if(!button) return;

  const bibliotecaReady=bibliotecaGuardias.length>0;
  const banosReady=banosGuardias.length>0;
  const complete=bibliotecaReady&&banosReady;

  button.disabled=!isAdmin||!storage.hasBackend()||complete;

  if(complete){
    button.textContent='Puestos semanales inicializados';
  }else if(bibliotecaReady&&!banosReady){
    button.textContent='Completar puestos semanales';
  }else{
    button.textContent='Inicializar puestos semanales';
  }
}

async function initializeSpecialAssignments(){
  if(!isAdmin) return;

  if(!storage.hasBackend()){
    window.alert('Esta operación requiere conexión con el servidor.');
    return;
  }

  const ready=await ensureBackendReadyForMutations();
  if(!ready){
    window.alert('No se ha podido cargar el estado actual del servidor.');
    return;
  }

  const payload=buildSpecialAssignmentsBootstrapPayload(data);

  if(!payload.biblioteca.length&&!payload.banos.length){
    window.alert('No hay ninguna propuesta de Biblioteca o Baños que inicializar.');
    return;
  }

  const completingBiblioteca=
    bibliotecaGuardias.length>0&&banosGuardias.length===0;

  const message=completingBiblioteca
    ? 'Biblioteca ya está fijada. Se conservará exactamente y se inicializarán los puestos de Baños. ¿Continuar?'
    : 'Se fijará el reparto semanal de Biblioteca y Baños. Después no cambiará por refrescos, ausencias ni recálculos automáticos. ¿Continuar?';

  if(!window.confirm(message)) return;

  try{
    const result=await storage.bootstrapSpecialAssignments(payload);

    if(Array.isArray(result?.biblioteca)){
      setBibliotecaGuardias(result.biblioteca);
    }

    if(Array.isArray(result?.banos)){
      setBanosGuardias(result.banos);
    }

    lastBackendSnapshot=makeBackendSnapshot();
    renderGuardiasUiIfChanged(true);
    renderSuperAdminMonitor();

    pushSuperAdminEvent(
      'Puestos semanales',
      'Biblioteca y Baños han quedado fijados como estado operativo.'
    );

    window.alert('Puestos semanales inicializados correctamente.');
  }catch(error){
    console.error('Special assignments bootstrap failed',error);
    setSuperAdminError('No se han podido inicializar los puestos semanales.');
    renderSuperAdminMonitor();
    window.alert(
      `No se han podido inicializar los puestos semanales: ${String(error?.message||error)}`
    );
  }
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
function serializeAlumnosFueraAula(){
  return Object.values(alumnosFueraAula).map(row=>({
    id:makeAlumnosFueraKey(row.profesor,row.dia,row.hora),
    profesor:row.profesor,
    dia:row.dia,
    hora:row.hora,
    cantidad:Math.max(0,Number(row.cantidad)||0),
    lastExitAt:row.lastExitAt||'',
    lastReturnAt:row.lastReturnAt||'',
    updatedAt:row.updatedAt||''
  }));
}
function serializeTeacherSubstitutions(){
  return Object.entries(teacherSubstitutions).map(([profesor,sustituto])=>({profesor,sustituto}));
}
function serializePatioGuardias(){
  return patioGuardias.map(row=>({
    weekKey:row.weekKey,
    dia:row.dia,
    hora:row.hora,
    positionId:row.positionId,
    positionType:row.positionType||'sector',
    positionLabel:row.positionLabel||'',
    sectorId:row.sectorId,
    covered:!!row.covered,
    responsable:row.responsable||'',
    note:row.note||''
  }));
}
function serializePatioTeacherBlocks(){
  return patioTeacherBlocks.map(row=>({
    weekKey:row.weekKey,
    dia:row.dia,
    hora:row.hora,
    profesor:row.profesor,
    sourceCode:row.sourceCode||'',
    reason:row.reason||'equipo-docente',
    note:row.note||''
  }));
}
function serializeTeacherPracticasGuardias(){
  return teacherPracticasGuardias.map(profesor=>({profesor}));
}
function serializeTeacherPracticasGuardiasTramos(){
  return teacherPracticasGuardiasTramos.map(row=>({profesor:row.profesor,dia:row.dia,hora:row.hora}));
}
async function hydrateTvAnnouncement(){
  if(!storage.hasBackend()) return false;
  try{
    const row=await storage.fetchTvAnnouncement();
    tvAnnouncement=normalizeTvAnnouncementState(row);
    persistTvAnnouncement(tvAnnouncement);
    renderTvAnnouncement();
    return true;
  }catch(error){
    console.warn('TV announcement hydration failed',error);
    return false;
  }
}
function handleRealtimeSyncSignal(payload){
  if(!storage.hasBackend()) return;
  const source=cleanText(payload?.source);
  if(source==='self') return;
  pollBackendState(true);
}
function notifyRealtimeSync(type){
  const payload={type:cleanText(type)||'update',ts:Date.now(),source:'self'};
  try{
    if('BroadcastChannel' in window){
      if(!realtimeSyncChannel) realtimeSyncChannel=new BroadcastChannel(REALTIME_SYNC_CHANNEL);
      realtimeSyncChannel.postMessage(payload);
    }
  }catch(error){
    console.warn('Realtime sync broadcast failed',error);
  }
  try{
    window.localStorage.setItem(REALTIME_SYNC_KEY,JSON.stringify({...payload,source:'storage'}));
  }catch(_error){}
}
function initRealtimeSync(){
  if(!storage.hasBackend()) return;
  try{
    if('BroadcastChannel' in window){
      realtimeSyncChannel=new BroadcastChannel(REALTIME_SYNC_CHANNEL);
      realtimeSyncChannel.addEventListener('message',event=>handleRealtimeSyncSignal(event.data));
    }
  }catch(error){
    console.warn('Realtime sync channel init failed',error);
  }
  window.addEventListener('storage',event=>{
    if(event.key!==REALTIME_SYNC_KEY||!event.newValue) return;
    try{
      handleRealtimeSyncSignal(JSON.parse(event.newValue));
    }catch(_error){}
  });
}
function formatStatusTimestamp(value){
  if(!value) return 'Sin registro';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return 'Sin registro';
  return date.toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function getAdminFilteredRows(rows){
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const hasCoverage=row=>!!getOperationalCoverageName(row,rowsSource);

  switch(adminTableFilter){
    case 'uncovered':
      return rows.filter(row=>rowNeedsCoverage(row)&&!hasCoverage(row));
    case 'pending':
      return rows.filter(row=>row.futurePlanned&&row.futureStatus==='pending');
    case 'notask':
      return rows.filter(row=>!row.futurePlanned&&!resolveFaena(row).faena);
    case 'attention':
      return rows.filter(row=>
        (row.futurePlanned&&row.futureStatus==='pending')||
        (rowNeedsCoverage(row)&&!hasCoverage(row))||
        (!row.futurePlanned&&!resolveFaena(row).faena)
      );
    default:
      return rows;
  }
}
function getAdminDayInsight(rows){
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const hasCoverage=row=>!!getOperationalCoverageName(row,rowsSource);

  const uncovered=rows.filter(row=>rowNeedsCoverage(row)&&!hasCoverage(row));
  const withoutTask=rows.filter(row=>!row.futurePlanned&&!resolveFaena(row).faena);
  const pendingFuture=rows.filter(row=>row.futurePlanned&&row.futureStatus==='pending');
  const covered=rows.filter(row=>rowNeedsCoverage(row)&&hasCoverage(row));
  const corredor=getAlumnosFueraSummary();

  return {uncovered,withoutTask,pendingFuture,covered,corredor};
}
function setAdminTableFilter(filter){
  adminTableFilter=filter||'all';
  renderAdminWorkspace();
  renderTable();
}
async function toggleGroupState(grupo){
  const current=getGroupStateByName(grupo);
  const nextActivo=!(current?.activo!==false);
  const nextRow={grupo:cleanText(grupo),activo:nextActivo,updatedAt:new Date().toISOString()};
  groupStates=mergeGroupStatesWithDetected([
    ...groupStates.filter(row=>normalizeText(row?.grupo)!==normalizeText(grupo)),
    nextRow
  ]);
  persistGroupStates(groupStates);
  renderGroupStatesPanel();
  renderGuardiaBoard();
  renderTable();
  renderAbsenceHourChoices();
  renderAbsenceDecisionBar();
  if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
  if(!storage.hasBackend()){
    showToast(`Grupo ${nextActivo?'activado':'desactivado'} solo en local.`, 'info');
    return;
  }
  try{
    const saved=await storage.updateGroupState(grupo,nextActivo);
    groupStates=mergeGroupStatesWithDetected([
      ...groupStates.filter(row=>normalizeText(row?.grupo)!==normalizeText(grupo)),
      saved
    ]);
    persistGroupStates(groupStates);
    renderGroupStatesPanel();
    renderGuardiaBoard();
    renderTable();
    showToast(`Grupo ${nextActivo?'activado':'desactivado'}.`, 'success');
  }catch(error){
    console.warn('Group state update failed',error);
    await hydrateGroupStates();
    showToast('No se pudo actualizar el estado del grupo.','error');
  }
}
function renderAdminPasilloList(){
  const pasilloList=document.getElementById('adminPasilloList');
  if(!pasilloList) return;
  const pasilloRows=getAlumnosFueraAdminRows();
  pasilloList.innerHTML=pasilloRows.length
    ?pasilloRows.map(row=>`
      <article class="admin-pasillo-item${row.cantidad>0?' is-pending':''}">
        <div>
          <div class="admin-pasillo-k">Tramo</div>
          <div class="admin-pasillo-v">${escapeHtml(formatDiaHora(row.dia,row.hora))}</div>
        </div>
        <div>
          <div class="admin-pasillo-k">Profesor</div>
          <div class="admin-pasillo-v">${escapeHtml(getVisibleTeacherName(row.profesor))}</div>
        </div>
        <div>
          <div class="admin-pasillo-k">Pendientes</div>
          <div class="admin-pasillo-v">${row.cantidad}</div>
        </div>
        <div>
          <div class="admin-pasillo-k">Registro</div>
          <div class="admin-pasillo-meta">${row.lastExitAt?`Salida ${escapeHtml(formatTimeShort(row.lastExitAt))}`:'Sin salida registrada'}${row.lastReturnAt?` \u00b7 Vuelta ${escapeHtml(formatTimeShort(row.lastReturnAt))}`:''}</div>
        </div>
      </article>
    `).join('')
    :'<div class="admin-activity-empty">No hay salidas registradas en el pasillo.</div>';
}
function renderGroupStatesPanel(){
  const summary=document.getElementById('groupStatesSummary');
  const list=document.getElementById('groupStatesList');
  const search=document.getElementById('groupStatesSearch');
  if(!summary||!list) return;
  const rows=mergeGroupStatesWithDetected(groupStates);
  const query=normalizeText(groupStateFilter);
  const filtered=rows.filter(row=>!query||normalizeText(row.grupo).includes(query));
  const activeCount=rows.filter(row=>row.activo).length;
  const inactiveCount=Math.max(rows.length-activeCount,0);
  if(search&&search.value!==groupStateFilter) search.value=groupStateFilter;
  summary.textContent=rows.length
    ?`${activeCount} activos · ${inactiveCount} inactivos`
    :'No hay grupos detectados en el horario anual.';
  list.innerHTML=filtered.length
    ?filtered.map(row=>`
      <article class="group-state-item ${row.activo?'is-active':'is-inactive'}">
        <div class="group-state-copy">
          <div class="group-state-title">${escapeHtml(row.grupo)}</div>
          <div class="group-state-meta">${row.activo?'Genera guardias y cobertura':'Ignorado en ausencias, guardias y panel TV'}</div>
        </div>
        <div class="group-state-actions">
          <span class="badge ${row.activo?'b-ok':'b-nok'}">${row.activo?'Activo':'Inactivo'}</span>
          <button class="btn-substitution${row.activo?' btn-substitution-danger':''}" type="button" data-group-state-toggle="${escapeHtml(row.grupo)}" ${!isAdmin?'disabled':''}>
            ${row.activo?'Desactivar':'Activar'}
          </button>
        </div>
      </article>
    `).join('')
    :'<div class="admin-activity-empty">No hay grupos que coincidan con el filtro.</div>';
}
function renderAdminWorkspace(){
  const overviewGrid=document.getElementById('adminOverviewGrid');
  const filterChips=document.getElementById('adminFilterChips');
  const pasilloList=document.getElementById('adminPasilloList');
  if(!overviewGrid||!filterChips||!pasilloList) return;
  const rows=getSelectedRowsForDay(day);
  const insight=getAdminDayInsight(rows);
  overviewGrid.innerHTML=[
    {
      label:'Sin cubrir',
      value:insight.uncovered.length,
      note:insight.uncovered.length?'Conviene confirmar guardia en estas ausencias.':'Todas las ausencias tienen cobertura prevista.',
      className:insight.uncovered.length?'admin-overview-card admin-overview-card-danger':'admin-overview-card'
    },
    {
      label:'Sin tarea',
      value:insight.withoutTask.length,
      note:insight.withoutTask.length?'Hay grupos sin instrucciones registradas.':'Toda la faena del d\u00eda est\u00e1 registrada.',
      className:insight.withoutTask.length?'admin-overview-card admin-overview-card-warn':'admin-overview-card'
    },
    {
      label:'Futuras pendientes',
      value:insight.pendingFuture.length,
      note:insight.pendingFuture.length?'Ausencias futuras pendientes de validar en esta vista.':'No hay ausencias futuras pendientes en este d\u00eda.',
      className:insight.pendingFuture.length?'admin-overview-card admin-overview-card-warn':'admin-overview-card'
    },
    {
      label:'Pasillo',
      value:`${insight.corredor.current.total}/${insight.corredor.max}` ,
      note:insight.corredor.pending.length?`${insight.corredor.pending.length} registros pendientes de confirmar retorno.`:(insight.corredor.current.slot?`Control activo en ${formatHoraLabel(insight.corredor.current.slot.hora)}.`:'Sin tramo lectivo activo.'),
      className:insight.corredor.current.total>=insight.corredor.max?'admin-overview-card admin-overview-card-danger':(insight.corredor.pending.length?'admin-overview-card admin-overview-card-warn':'admin-overview-card')
    }
  ].map(card=>`<article class="${card.className}"><div class="admin-overview-label">${card.label}</div><div class="admin-overview-value">${card.value}</div><div class="admin-overview-note">${card.note}</div></article>`).join('');
  const filterOptions=[
    {id:'all',label:'Todas',count:rows.length},
    {id:'attention',label:'Requieren atenci\u00f3n',count:insight.uncovered.length+insight.withoutTask.length+insight.pendingFuture.length},
    {id:'uncovered',label:'Sin cubrir',count:insight.uncovered.length},
    {id:'notask',label:'Sin tarea',count:insight.withoutTask.length},
    {id:'pending',label:'Pendientes',count:insight.pendingFuture.length}
  ];
  filterChips.innerHTML=filterOptions.map(item=>`<button class="admin-filter-chip${adminTableFilter===item.id?' active':''}" type="button" onclick="setAdminTableFilter('${item.id}')"><span class="admin-filter-chip-label">${item.label}</span><span class="admin-filter-chip-count">${item.count}</span></button>`).join('');
  renderAdminPasilloList();
  renderGroupStatesPanel();
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
    return {label:'Carga alta',className:'superadmin-pill-error',note:'El servidor presenta una carga elevada. Evita iniciar tareas pesadas en este momento.'};
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
async function refreshSuperAdminUsers(){
  if(!isSuperAdmin||!storage.hasBackend()) return;
  clearTimeout(superAdminUsersTimer);
  superAdminUsersTimer=setTimeout(async()=>{
    const list=document.getElementById('superAdminUserList');
    try{
      const query=document.getElementById('superAdminUserSearch')?.value||'';
      const result=await storage.fetchUsers(query);
      superAdminUsers=Array.isArray(result?.users)?result.users:[];
      if(list) list.innerHTML=superAdminUsers.length?superAdminUsers.map(user=>`
        <article class="superadmin-user-row">
          <div class="superadmin-user-main"><div><strong>${escapeHtml(user.displayName||user.username)}</strong><div class="superadmin-user-meta">${escapeHtml(user.username)} · ${escapeHtml((user.roles||[]).join(', ')||'sin rol')} · ${escapeHtml((user.sourceCodes||[]).join(', '))}</div></div><span class="superadmin-pill ${user.active?'superadmin-pill-ok':'superadmin-pill-warn'}">${user.active?'Activa':'Desactivada'}</span></div>
          <div class="superadmin-user-actions">
            <button class="btn-add btn-add-secondary" type="button" onclick="resetUserPasswordFlow(${Number(user.id)})">Resetear contraseña</button>
            <button class="btn-add btn-add-secondary" type="button" onclick="revokeUserSessionsFlow(${Number(user.id)})">Revocar sesiones</button>
            <button class="btn-add btn-add-secondary" type="button" onclick="setUserRolesFlow(${Number(user.id)})">Gestionar roles</button>
            <button class="btn-add btn-add-secondary" type="button" onclick="showUserAuditFlow(${Number(user.id)})">Ver auditoría</button>
            <button class="btn-add btn-add-secondary" type="button" onclick="setUserActiveFlow(${Number(user.id)},${user.active?'false':'true'})">${user.active?'Desactivar':'Activar'}</button>
          </div>
        </article>`).join(''):'<div class="superadmin-user-meta">No hay cuentas que coincidan.</div>';
    }catch(error){if(list) list.textContent=error.message||'No se pudieron cargar los usuarios.';}
  },180);
}
async function createUserFlow(){
  if(!isSuperAdmin) return;
  const username=window.prompt('Nombre de usuario'); if(!username) return;
  const displayName=window.prompt('Nombre visible'); if(!displayName) return;
  const role=window.prompt('Rol inicial: teacher, admin o superadmin','teacher'); if(!role) return;
  try{
    const result=await storage.createUser({username,displayName,roles:[role]});
    window.prompt('Contraseña temporal (se muestra una sola vez). El usuario deberá cambiarla al iniciar sesión.',result.temporaryPassword||'');
    refreshSuperAdminUsers();
  }catch(error){showToast(error.message||'No se pudo crear la cuenta.','error');}
}
function clearTeacherProvisioningState(){
  superAdminProvisioningPreview=null;
  superAdminProvisioningCredentials=[];
  const result=document.getElementById('superAdminCredentialResult');
  const rows=document.getElementById('superAdminCredentialRows');
  if(result) result.hidden=true;
  if(rows) rows.replaceChildren();
}
function renderTeacherProvisioningPreview(){
  const preview=superAdminProvisioningPreview;
  const summary=document.getElementById('superAdminProvisioningSummary');
  const rows=document.getElementById('superAdminProvisioningRows');
  const confirm=document.getElementById('superAdminProvisioningConfirm');
  if(!summary||!rows||!confirm) return;
  if(!preview){summary.textContent='Seleccione un dataset.';rows.replaceChildren();confirm.disabled=true;return;}
  const totals=preview.totals||{};
  const stats=[
    ['Identidades',totals.teacherIdentities||0],['Ya vinculadas',totals.alreadyLinked||0],
    ['READY',totals.ready||0],['Conflictos',totals.conflicts||0],
    ['Inválidas',totals.invalid||0],['Cuentas huérfanas',totals.orphanedAccounts||0]
  ];
  summary.innerHTML=stats.map(([label,value])=>`<div class="superadmin-provisioning-stat"><strong>${Number(value)}</strong>${escapeHtml(label)}</div>`).join('');
  const entries=[...(preview.rows||[]),...(preview.orphanedAccounts||[])];
  rows.innerHTML=entries.length?entries.map(row=>{
    const ready=row.classification==='READY'||row.classification==='ALREADY_LINKED';
    return `<div class="superadmin-provisioning-row"><strong>${escapeHtml(row.displayName||'')}</strong><span>${escapeHtml(row.sourceCode||'—')}</span><span>${escapeHtml(row.username||'—')}</span><span class="superadmin-provisioning-status ${ready?'is-ready':'is-blocked'}">${escapeHtml(row.classification||'')}<br><small>${escapeHtml(row.reason||'')}</small></span></div>`;
  }).join(''):'<div class="superadmin-user-meta">El dataset no contiene identidades docentes.</div>';
  confirm.disabled=!(Number(totals.ready)>0)||Number(totals.conflicts)>0||Number(totals.invalid)>0;
}
async function openTeacherProvisioningFlow(){
  if(!isSuperAdmin||!storage.hasBackend()) return;
  const panel=document.getElementById('superAdminProvisioning');
  const select=document.getElementById('superAdminProvisioningDataset');
  if(!panel||!select) return;
  clearTeacherProvisioningState();
  panel.hidden=false;
  select.disabled=true;
  select.innerHTML='<option value="">Cargando datasets…</option>';
  try{
    const result=await storage.fetchProvisioningDatasets();
    const datasets=Array.isArray(result?.datasets)?result.datasets:[];
    select.innerHTML=datasets.map(dataset=>`<option value="${Number(dataset.id)}">${escapeHtml(dataset.academicYear)} · ${escapeHtml(dataset.label)} · ${escapeHtml(dataset.status)} · ${Number(dataset.teacherCount)} docentes</option>`).join('');
    select.disabled=!datasets.length;
    if(datasets.length) await previewTeacherProvisioning();
    else renderTeacherProvisioningPreview();
  }catch(error){showToast(error.message||'No se pudieron cargar los datasets.','error');}
}
function closeTeacherProvisioningFlow(){
  clearTeacherProvisioningState();
  const panel=document.getElementById('superAdminProvisioning');
  if(panel) panel.hidden=true;
}
async function previewTeacherProvisioning(){
  superAdminProvisioningCredentials=[];
  renderProvisioningCredentials();
  const datasetId=Number(document.getElementById('superAdminProvisioningDataset')?.value);
  if(!datasetId){superAdminProvisioningPreview=null;renderTeacherProvisioningPreview();return;}
  try{
    superAdminProvisioningPreview=await storage.fetchProvisioningPreview(datasetId);
    renderTeacherProvisioningPreview();
  }catch(error){superAdminProvisioningPreview=null;renderTeacherProvisioningPreview();showToast(error.message||'No se pudo preparar la vista previa.','error');}
}
function renderProvisioningCredentials(){
  const panel=document.getElementById('superAdminCredentialResult');
  const rows=document.getElementById('superAdminCredentialRows');
  if(!panel||!rows) return;
  panel.hidden=!superAdminProvisioningCredentials.length;
  rows.innerHTML=superAdminProvisioningCredentials.map(item=>`<div class="superadmin-credential-row"><strong>${escapeHtml(item.display_name)}</strong><span>${escapeHtml(item.source_code)}</span><span>${escapeHtml(item.username)}</span><code>${escapeHtml(item.temporary_password)}</code></div>`).join('');
}
async function executeTeacherProvisioning(){
  const preview=superAdminProvisioningPreview;
  if(!preview||!isSuperAdmin) return;
  if(!await askConfirm('Crear cuentas del profesorado',`Se crearán ${Number(preview.totals?.ready||0)} vínculos/cuentas READY. Las credenciales nuevas se mostrarán una sola vez.`,'Crear cuentas')) return;
  try{
    const result=await storage.provisionTeachers(preview.dataset.id);
    await previewTeacherProvisioning();
    superAdminProvisioningCredentials=Array.isArray(result?.credentials)?result.credentials:[];
    renderProvisioningCredentials();
    showToast(`Provisión completada: ${Number(result?.summary?.created||0)} cuentas creadas y ${Number(result?.summary?.linked||0)} enlazadas.`,'success');
    refreshSuperAdminUsers();
  }catch(error){showToast(error.message||'No se pudo completar la provisión.','error');}
}
function provisioningCsvCell(value){
  let text=String(value||'');
  if(/^[=+\-@]/.test(text)) text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}
function downloadProvisioningCredentialsCsv(){
  if(!superAdminProvisioningCredentials.length) return;
  const header=['display_name','source_code','username','temporary_password'];
  const lines=[header,...superAdminProvisioningCredentials.map(item=>header.map(key=>item[key]))]
    .map(row=>row.map(provisioningCsvCell).join(','));
  const blob=new Blob([`\uFEFF${lines.join('\r\n')}\r\n`],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=`argos-credenciales-temporales-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
async function resetUserPasswordFlow(userId){
  if(!await askConfirm('Resetear contraseña','Se invalidarán todas las sesiones y se generará una contraseña temporal.','Resetear')) return;
  try{
    const result=await storage.resetUserPassword(userId);
    window.prompt('Contraseña temporal (se muestra una sola vez).',result.temporaryPassword||'');
    refreshSuperAdminUsers();
  }catch(error){showToast(error.message||'No se pudo resetear la contraseña.','error');}
}
async function revokeUserSessionsFlow(userId){
  if(!await askConfirm('Revocar sesiones','Las sesiones actuales de esta cuenta dejarán de ser válidas.','Revocar')) return;
  try{await storage.revokeUserSessions(userId);showToast('Sesiones revocadas.','success');refreshSuperAdminUsers();}
  catch(error){showToast(error.message||'No se pudieron revocar las sesiones.','error');}
}
async function setUserActiveFlow(userId,active){
  if(!await askConfirm(active?'Activar cuenta':'Desactivar cuenta',active?'La cuenta podrá volver a iniciar sesión.':'La cuenta perderá acceso inmediatamente.',active?'Activar':'Desactivar')) return;
  try{await storage.setUserActive(userId,active);refreshSuperAdminUsers();}
  catch(error){showToast(error.message||'No se pudo cambiar el estado.','error');}
}
async function setUserRolesFlow(userId){
  const user=superAdminUsers.find(item=>Number(item.id)===Number(userId));
  if(!user) return;
  const value=window.prompt('Roles separados por coma: teacher, admin, superadmin',(user.roles||[]).join(','));
  if(!value) return;
  const roles=value.split(',').map(item=>item.trim()).filter(Boolean);
  if(!await askConfirm('Cambiar roles',`Roles nuevos: ${roles.join(', ')}`,'Confirmar')) return;
  try{await storage.setUserRoles(userId,roles);refreshSuperAdminUsers();}
  catch(error){showToast(error.message||'No se pudieron cambiar los roles.','error');}
}
async function showUserAuditFlow(userId){
  try{
    const result=await storage.fetchUserAudit(userId);
    const summary=(result.events||[]).slice(0,20).map(event=>`${event.created_at} · ${event.action} · ${event.outcome}`).join('\n')||'Sin eventos.';
    window.alert(summary);
  }catch(error){showToast(error.message||'No se pudo consultar la auditoría.','error');}
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
function buildSuperAdminIncidentItems(){
  const items=[];
  if(superAdminStatus.lastError){
    items.push({
      level:'error',
      title:'Aviso activo del sistema',
      meta:`${formatStatusTimestamp(superAdminStatus.lastErrorAt)} · ${superAdminStatus.lastError}`
    });
  }
  superAdminEvents
    .filter(item=>/error|pendiente/i.test(String(item.type||''))||/error|fallo|pendiente/i.test(String(item.message||'')))
    .slice(0,6)
    .forEach(item=>{
      items.push({
        level:/error|fallo/i.test(`${item.type||''} ${item.message||''}`)?'error':'warn',
        title:item.type||'Incidencia',
        meta:`${formatStatusTimestamp(item.ts)} · ${item.message||'Sin detalle'}`
      });
    });
  if(!items.length){
    items.push({
      level:'ok',
      title:'Sin incidencias activas',
      meta:'No hay errores recientes ni avisos pendientes de sincronización.'
    });
  }
  return items.slice(0,6);
}
function renderSuperAdminMonitor(){
  const grid=document.getElementById('superAdminMonitorGrid');
  const log=document.getElementById('superAdminMonitorLog');
  const opsList=document.getElementById('superAdminOpsList');
  const incidentList=document.getElementById('superAdminIncidentList');
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
      note:`Última carga: ${formatStatusTimestamp(superAdminStatus.lastHydrateAt)}`
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
      note:superAdminOpsInfo?`Estado app: ${appStateSummary||'sin extras'} · consulta ${formatStatusTimestamp(superAdminStatus.lastPollAt)}`:`${syncPending} avisos futuros pendientes de backend`
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
  if(incidentList){
    incidentList.innerHTML=buildSuperAdminIncidentItems()
      .map(item=>`<article class="superadmin-incident-item${item.level==='error'?' is-error':item.level==='warn'?' is-warn':''}"><div class="superadmin-incident-title">${escapeHtml(item.title)}</div><div class="superadmin-incident-meta">${escapeHtml(item.meta)}</div></article>`)
      .join('');
  }
  log.innerHTML=superAdminEvents.length
    ?superAdminEvents.map(item=>`<div class="superadmin-monitor-log-item"><strong>${escapeHtml(item.type)}</strong> · ${escapeHtml(formatStatusTimestamp(item.ts))}<br>${escapeHtml(item.message)}</div>`).join('')
    :'<div class="superadmin-monitor-log-item">Sin eventos de sincronización registrados todavía.</div>';
}
function drainPendingBackendSync(){
  renderSuperAdminMonitor();
  if(backendSyncPendingAdmin){
    backendSyncPendingAdmin=false;
    syncAdminState({
      manual:true,
      origin:pendingAdminSyncRequest?.origin||'manual-queued',
      reason:pendingAdminSyncRequest?.reason||'queued-save'
    });
    return true;
  }
  if(backendSyncPendingTeacher){
    backendSyncPendingTeacher=false;
    syncTeacherState();
    return true;
  }
  if(backendSyncPendingPatioTeacherBlocks){
    backendSyncPendingPatioTeacherBlocks=false;
    syncPatioTeacherBlocksState();
    return true;
  }
  return false;
}
async function ensureBackendReadyForMutations(){
  if(!storage.hasBackend()) return true;
  if(backendHydrated) return true;
  await hydrateFromBackend();
  return backendHydrated;
}
function waitForBackendSyncIdle(timeoutMs=8000){
  if(!backendSyncInFlight) return Promise.resolve(true);
  return new Promise(resolve=>{
    const startedAt=Date.now();
    const timer=window.setInterval(()=>{
      if(!backendSyncInFlight){
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      if(Date.now()-startedAt>=timeoutMs){
        window.clearInterval(timer);
        resolve(false);
      }
    },100);
  });
}
function createDeferredPromise(){
  let resolve;
  let reject;
  const promise=new Promise((res,rej)=>{
    resolve=res;
    reject=rej;
  });
  return {promise,resolve,reject};
}
function settleAdminSyncDeferred(method,payload){
  if(!adminSyncScheduledDeferred) return;
  const deferred=adminSyncScheduledDeferred;
  adminSyncScheduledDeferred=null;
  deferred[method](payload);
}
function serializeGuardiasForReplace(rows=data){
  return dedupeAbsenceRowsByLogic(rows)
    .filter(Boolean)
    .filter(row=>{
      const hora=Number(row?.hora);
      if(esHoraValida(hora)) return true;
      logInvalidAbsenceHour('skip hora inválida',{profesor:row?.ausente||'',hora,origen:'serializeGuardiasForReplace'});
      return false;
    })
    .map(row=>({
      dia:Number(row.dia),
      hora:Number(row.hora),
      ausente:String(row.ausente||'').trim(),
      guardia:String(row.guardia||'').trim(),
      aula:String(row.aula||'').trim(),
      faena:!!row.faena,
      obs:String(row.obs||'').trim()
    }))
    .sort((a,b)=>
      a.dia-b.dia||
      a.hora-b.hora||
      normalizeText(a.ausente).localeCompare(normalizeText(b.ausente),'es')||
      normalizeText(a.guardia).localeCompare(normalizeText(b.guardia),'es')||
      a.aula.localeCompare(b.aula,'es')||
      a.obs.localeCompare(b.obs,'es')
    );
}
function buildAdminSyncPayload(){
  return {
    guardias:serializeGuardiasForReplace(data),
    historial:historialCambios.map(entry=>({
      id:entry.id,
      title:entry.title,
      detail:entry.detail,
      type:entry.type,
      actor:entry.actor,
      ts:entry.ts,
      undoState:entry.undoState||null
    })),
    patioGuardias:serializePatioGuardias(),
    patioTeacherBlocks:serializePatioTeacherBlocks(),
    gruposEstado:groupStates.map(row=>({grupo:row.grupo,activo:!!row.activo})),
    substitutions:serializeTeacherSubstitutions(),
    practicasGuardias:serializeTeacherPracticasGuardias(),
    practicasGuardiasTramos:serializeTeacherPracticasGuardiasTramos()
  };
}
function buildAdminSyncHash(payload=buildAdminSyncPayload()){
  return JSON.stringify(payload);
}
function markAdminStatePersisted(){
  lastAdminPersistedHash=buildAdminSyncHash();
}
function scheduleAdminStateSync(delayMs=ADMIN_SYNC_DEBOUNCE_MS){
  if(!storage.hasBackend()) return Promise.resolve({ok:true,localOnly:true});
  if(adminSyncTimer) window.clearTimeout(adminSyncTimer);
  if(!adminSyncScheduledDeferred){
    adminSyncScheduledDeferred=createDeferredPromise();
  }
  console.info('[save origin]',pendingAdminSyncRequest?.origin||'unknown');
  console.info('[save reason]',pendingAdminSyncRequest?.reason||'unspecified');
  adminSyncTimer=window.setTimeout(async ()=>{
    adminSyncTimer=null;
    try{
      const result=await runAdminStateSync();
      settleAdminSyncDeferred('resolve',result);
    }catch(error){
      settleAdminSyncDeferred('reject',error);
    }
  },Math.max(0,Number(delayMs)||0));
  console.info('[guardias] admin sync scheduled');
  return adminSyncScheduledDeferred.promise;
}
function clearScheduledAdminSync(){
  if(adminSyncTimer){
    window.clearTimeout(adminSyncTimer);
    adminSyncTimer=null;
  }
}
async function syncAdminStateConfirmed(options={}){
  const origin=options.origin||'manual-confirmed';
  const reason=options.reason||'confirmed-save';
  if(!storage.hasBackend()) return syncAdminState({immediate:true,manual:true,origin,reason});
  const idle=await waitForBackendSyncIdle();
  if(!idle){
    pendingAdminSyncRequest={origin,reason};
    backendSyncPendingAdmin=true;
    return {ok:true,queued:true};
  }
  return syncAdminState({immediate:true,manual:true,origin,reason});
}
async function refreshGuardiasFromBackend(options={}){
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  const guardiasRows=await storage.fetchGuardias();
  if(Array.isArray(guardiasRows)){
    data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
    nid=computeNextId(data);
    persist(data);
    if(options.render!==false){
      renderTable();
      renderGuardiaBoard();
    }
    return {ok:true,rows:data};
  }
  return {ok:false,rows:[]};
}
async function runAdminStateSync(){
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  if(backendSyncInFlight){
    backendSyncPendingAdmin=true;
    return {ok:true,queued:true};
  }
  backendSyncInFlight=true;
  renderSuperAdminMonitor();
  try{
    let guardiasForSync=data;
    try{
      const remoteGuardias=await storage.fetchGuardias();
      guardiasForSync=mergeGuardiasForBackendSync(data,remoteGuardias);
      data=normalizeStoredRows(guardiasForSync);
      nid=computeNextId(data);
      persist(data);
    }catch(mergeError){
      console.warn('Guardias merge before sync failed; syncing local state only',mergeError);
    }
    const payload=buildAdminSyncPayload();
    const payloadHash=buildAdminSyncHash(payload);
    if(payloadHash===lastAdminPersistedHash){
      console.info('[save skipped same payload]',{origin:pendingAdminSyncRequest?.origin||'unknown',reason:pendingAdminSyncRequest?.reason||'unspecified'});
      lastBackendSnapshot=makeBackendSnapshot();
      pendingDeletedAbsenceKeys.clear();
      pendingAdminSyncRequest=null;
      return {ok:true,skipped:true,unchanged:true};
    }
    const syncStartedAt=performance.now();
    const persistedGuardias=await storage.replaceGuardias(payload.guardias);
    const auxiliaryResults=await Promise.allSettled([
      storage.replacePatioGuardias(payload.patioGuardias),
      storage.replacePatioTeacherBlocks(payload.patioTeacherBlocks),
      storage.replaceTeacherPracticasGuardias(payload.practicasGuardias),
      storage.replaceTeacherPracticasGuardiasTramos(payload.practicasGuardiasTramos)
    ]);
    const auxiliaryFailures=auxiliaryResults
      .map((result,index)=>({result,index}))
      .filter(item=>item.result.status==='rejected')
      .map(item=>({
        domain:['patio-guardias','patio-bloqueos','practicas-guardias','practicas-tramos'][item.index]||`domain-${item.index}`,
        error:item.result.reason
      }));
    if(Array.isArray(persistedGuardias)){
      data=normalizeStoredRows(persistedGuardias.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
    }
    await refreshGuardiasFromBackend({render:false});
    try{
      if(canAdmin||canSuperAdmin){
        guardiaMonthlyLoad=normalizeGuardiaMonthlyLoadState(
          await storage.fetchGuardiaMonthlyLoad()
        );
        persistGuardiaMonthlyLoad(guardiaMonthlyLoad);
      }
    }catch(monthlyLoadError){
      console.warn('Monthly guardia load refresh failed',monthlyLoadError);
    }
    if(!auxiliaryFailures.length) markAdminStatePersisted();
    else lastAdminPersistedHash='';
    lastBackendSnapshot=makeBackendSnapshot();
    pendingDeletedAbsenceKeys.clear();
    superAdminStatus.lastAdminSyncAt=new Date().toISOString();
    if(auxiliaryFailures.length){
      const failedDomains=auxiliaryFailures.map(item=>item.domain).join(', ');
      console.warn('[guardias] admin sync partial failure',auxiliaryFailures);
      setSuperAdminError(`Guardias guardadas, pero falló la sincronización auxiliar: ${failedDomains}.`);
      pushSuperAdminEvent('Sincronización parcial de Jefatura',`Las guardias se han guardado, pero quedan apartados pendientes: ${failedDomains}.`);
    }else{
      clearSuperAdminError();
    }
    console.info('[guardias] admin sync persisted', {
      guardias: payload.guardias.length,
      ms: Math.round(performance.now()-syncStartedAt),
      auxiliaryFailures: auxiliaryFailures.length
    });
    if(!auxiliaryFailures.length){
      pushSuperAdminEvent('Sincronización de Jefatura','Guardias, historial, sustituciones y ajustes de prácticas sincronizados con el servidor.');
    }
    notifyRealtimeSync('admin-sync');
    pendingAdminSyncRequest=null;
    return {ok:true,partialAuxFailures:auxiliaryFailures};
  }catch(error){
    console.warn('Backend sync failed',error);
    setSuperAdminError('Fallo en la sincronización de Jefatura.');
    pushSuperAdminEvent('Error de sincronización',`Jefatura: ${String(error?.message||error)}`);
    pendingAdminSyncRequest=null;
    return {ok:false,syncError:true,error};
  }finally{
    backendSyncInFlight=false;
    drainPendingBackendSync();
  }
}
async function syncAdminState(options={}){
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  if(options.manual!==true){
    console.info('[save skipped auto]',{origin:options.origin||'auto',reason:options.reason||'automatic-sync-blocked'});
    return {ok:true,skipped:true,auto:true};
  }
  pendingAdminSyncRequest={
    origin:options.origin||'manual',
    reason:options.reason||'manual-save'
  };
  if(options.immediate){
    clearScheduledAdminSync();
    try{
      const result=await runAdminStateSync();
      settleAdminSyncDeferred('resolve',result);
      return result;
    }catch(error){
      settleAdminSyncDeferred('reject',error);
      throw error;
    }
  }
  return scheduleAdminStateSync(options.delayMs);
}
async function syncTeacherState(){
  if(!storage.hasBackend()) return;
  if(backendSyncInFlight){
    backendSyncPendingTeacher=true;
    return;
  }
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
    pushSuperAdminEvent('Sincronización del profesorado','Tareas y ajustes del profesorado sincronizados con el servidor.');
  }catch(error){
    console.warn('Teacher backend sync failed',error);
    setSuperAdminError('Fallo en la sincronización de profesorado.');
    pushSuperAdminEvent('Error de sincronización',`Profesorado: ${String(error?.message||error)}`);
  }finally{
    backendSyncInFlight=false;
    drainPendingBackendSync();
  }
}
async function syncPatioTeacherBlocksState(entry){
  if(!storage.hasBackend()) return {ok:true,localOnly:true};
  if(backendSyncInFlight){
    backendSyncPendingPatioTeacherBlocks=true;
    return {ok:true,queued:true};
  }
  backendSyncInFlight=true;
  renderSuperAdminMonitor();
  try{
    await storage.setOwnPatioTeacherBlock(entry);
    lastBackendSnapshot=makeBackendSnapshot();
    superAdminStatus.lastTeacherSyncAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Sincronización del profesorado','Bloqueos de patio por equipo docente sincronizados con el servidor.');
    notifyRealtimeSync('patio-blocks-sync');
    return {ok:true};
  }catch(error){
    console.warn('Patio teacher block backend sync failed',error);
    backendSyncPendingPatioTeacherBlocks=true;
    setSuperAdminError('Fallo en la sincronización del bloqueo de patio.');
    pushSuperAdminEvent('Error de sincronización',`Patio: ${String(error?.message||error)}`);
    return {ok:true,localOnly:true,syncError:true};
  }finally{
    backendSyncInFlight=false;
    drainPendingBackendSync();
  }
}
async function syncTeacherTaskEntry(overrideKey,overrideRow,tareaKey,tareaRow){
  const backendOnly=!!storage.isBackendOnly?.();
  if(!storage.hasBackend()) return backendOnly?{ok:false,error:new Error('Backend unavailable')}:{ok:true,localOnly:true};
  if(backendSyncInFlight){
    const idle=await waitForBackendSyncIdle();
    if(!idle) return {ok:false,error:new Error('Backend synchronization is busy')};
  }
  backendSyncInFlight=true;
  renderSuperAdminMonitor();
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
    pushSuperAdminEvent('Sincronización del profesorado','Tarea y ajustes del profesorado sincronizados con el servidor.');
    return {ok:true};
  }catch(error){
    console.warn('Teacher task backend sync failed',error);
    if(!backendOnly) backendSyncPendingTeacher=true;
    setSuperAdminError('Fallo en la sincronización de tarea de profesorado.');
    pushSuperAdminEvent('Error de sincronización',`Profesorado: ${String(error?.message||error)}`);
    return backendOnly
      ?{ok:false,error,status:Number(error?.status)||0}
      :{ok:true,localOnly:true,syncError:true};
  }finally{
    backendSyncInFlight=false;
    drainPendingBackendSync();
  }
}
async function syncAlumnosFueraAulaEntry(profesor,dia,hora,delta){
  const key=makeAlumnosFueraKey(profesor,dia,hora);
  const previous=getAlumnosFueraTeacherRow(profesor,dia,hora);
  const currentAmount=Math.max(0,Number(previous?.cantidad)||0);
  const total=getAlumnosFueraTotal(dia,hora);
  if(delta>0&&!storage.hasBackend()&&total>=MAX_ALUMNOS_FUERA_AULA){
    showToast('Limite de alumnos fuera alcanzado. No pueden salir mas ahora.','error');
    renderTeacherPanel();
    renderTable();
    return;
  }
  const nextAmount=Math.max(0,currentAmount+delta);
  const nowIso=new Date().toISOString();
  const nextRow={
    profesor,
    dia,
    hora,
    cantidad:nextAmount,
    lastExitAt:delta>0?nowIso:(previous?.lastExitAt||''),
    lastReturnAt:delta<0?nowIso:(previous?.lastReturnAt||''),
    updatedAt:nowIso
  };
  if(nextAmount>0){
    alumnosFueraAula[key]=nextRow;
  }else if(previous){
    alumnosFueraAula[key]=nextRow;
  }
  persistAlumnosFueraAula(alumnosFueraAula);
  renderTeacherPanel();
  renderTable();
  renderAdminWorkspace();
  if(!storage.hasBackend()){
    showToast(delta>0?'Salida registrada en local.':'Retorno registrado en local.','success');
    return;
  }
  try{
    const actionPayload={profesor,dia,hora};
    const result=delta>0
      ?await storage.registrarSalidaAlumno(actionPayload)
      :await storage.registrarRetornoAlumno(actionPayload);
    if(result?.rows||Array.isArray(result)){
      const rows=Array.isArray(result)?result:result.rows;
      rows.map(normalizeAlumnosFueraRow).filter(Boolean).forEach(row=>{
        alumnosFueraAula[makeAlumnosFueraKey(row.profesor,row.dia,row.hora)]=row;
      });
      persistAlumnosFueraAula(alumnosFueraAula);
    }else if(result?.entry){
      const saved=normalizeAlumnosFueraRow(result.entry);
      if(saved) alumnosFueraAula[makeAlumnosFueraKey(saved.profesor,saved.dia,saved.hora)]=saved;
      persistAlumnosFueraAula(alumnosFueraAula);
    }
    renderTeacherPanel();
    renderTable();
    renderAdminWorkspace();
    showToast(delta>0?'Salida registrada.':'Retorno registrado.','success');
  }catch(error){
    if(delta>0){
      await hydrateAlumnosFueraAula();
      persistAlumnosFueraAula(alumnosFueraAula);
      renderTeacherPanel();
      renderTable();
      renderAdminWorkspace();
      const message=String(error?.message||'');
      showToast(message.includes('No se pueden superar')?'No pueden salir mas alumnos ahora.':'No se pudo registrar la salida. Revisa conexion o servidor.','error');
      console.warn('Alumnos fuera add failed',error);
      return;
    }
    console.warn('Alumnos fuera sync failed',error);
    showToast('Cambio guardado en local. Pendiente de sincronizar.','info');
  }
}
async function hydrateTeacherSubstitutions(){
  if(!storage.hasBackend()) return;
  try{
    const rows=await storage.fetchTeacherSubstitutions();
    if(!Array.isArray(rows)) return;
    applyTeacherSubstitutionRows(rows);
    syncTeacherIdentity();
    renderGuardiaBoard();
    renderTable();
    renderSubstitutionList();
    if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
    superAdminStatus.lastHydrateAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Actualización','Sustituciones del profesorado recargadas desde el servidor.');
  }catch(error){
    console.warn('Teacher substitutions hydration failed',error);
    setSuperAdminError('Fallo al hidratar sustituciones.');
  }
}
async function hydrateGroupStates(){
  if(!storage.hasBackend()) return;
  try{
    const rows=await storage.fetchGroups();
    if(!Array.isArray(rows)) return;
    groupStates=mergeGroupStatesWithDetected(rows);
    persistGroupStates(groupStates);
    renderGroupStatesPanel();
    renderGuardiaBoard();
    renderTable();
    renderAbsenceHourChoices();
    renderAbsenceDecisionBar();
    if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
    superAdminStatus.lastHydrateAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Actualización','Estado de grupos recargado desde el servidor.');
  }catch(error){
    console.warn('Group states hydration failed',error);
    setSuperAdminError('Fallo al hidratar grupos activos/inactivos.');
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
    teacherPracticasGuardias=[...new Set(rows.map(row=>resolveTeacherCanonicalName(row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
    teacherPracticasGuardiasTramos=[...new Map(tramos.map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora),row])).values()]
      .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
    persistTeacherPracticasGuardias(teacherPracticasGuardias);
    persistTeacherPracticasGuardiasTramos(teacherPracticasGuardiasTramos);
    refreshOrdenGuardias();
    renderGuardiaBoard();
    renderTable();
    renderPracticasGuardiasList();
    renderPracticasGuardiasConfig();
  }catch(error){
    console.warn('Teacher practicas guardias hydration failed',error);
  }
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
function mergeActualAndProjectedRows(actualRows,projectedRows){
  const merged=Array.isArray(actualRows)?actualRows.slice():[];
  const existingKeys=new Set(merged.map(row=>makeAbsenceSyncKey(row)).filter(Boolean));
  (Array.isArray(projectedRows)?projectedRows:[]).forEach(row=>{
    const key=makeAbsenceSyncKey(row);
    if(!key||existingKeys.has(key)) return;
    existingKeys.add(key);
    merged.push(row);
  });
  return merged.sort((a,b)=>Number(a.dia)-Number(b.dia)||Number(a.hora)-Number(b.hora)||String(a.ausente||'').localeCompare(String(b.ausente||''),'es'));
}
function isAbsenceRowVisibleByGroup(row){
  if(!row||typeof row!=='object') return false;
  const session=resolveTeacherSession(row.ausente,row.dia,row.hora);
  return !session?.grupo||isGroupCurrentlyActive(session.grupo);
}
function getRowsForWeekOffset(offset){
  const weekKey=getSchoolWeekKeyFromOffset(offset);
  const projectedRows=buildProjectedRowsForWeek(weekKey);
  const rows=isCurrentWeekOffset(offset)?mergeActualAndProjectedRows(data,projectedRows):projectedRows;
  return rows.filter(isAbsenceRowVisibleByGroup);
}
function getSelectedRowsForDay(targetDay){
  return getRowsForWeekOffset(weekOffset).filter(row=>row.dia===targetDay).sort((a,b)=>a.hora-b.hora);
}
function getTeacherWeekRowsForDay(targetDay){
  return getRowsForWeekOffset(teacherWeekOffset).filter(row=>row.dia===targetDay).sort((a,b)=>a.hora-b.hora);
}
function getTvRouteUrl(){
  if(window.location.protocol==='file:') return 'guardias.html?view=tv';
  const url=new URL(window.location.href);
  url.searchParams.set('view','tv');
  url.pathname='/';
  return `${url.pathname}${url.search}`;
}
function getPrintRouteUrl(targetDay=day,targetWeekOffset=weekOffset){
  const safeDay=Number.isInteger(Number(targetDay))?Math.max(0,Math.min(DIAS.length-1,Number(targetDay))):day;
  const safeWeekOffset=Number.isInteger(Number(targetWeekOffset))?Math.max(-1,Math.min(3,Number(targetWeekOffset))):weekOffset;
  if(window.location.protocol==='file:') return `guardias.html?view=print&day=${safeDay}&weekOffset=${safeWeekOffset}`;
  const url=new URL(window.location.href);
  url.searchParams.set('view','print');
  url.searchParams.set('day',String(safeDay));
  url.searchParams.set('weekOffset',String(safeWeekOffset));
  url.pathname='/';
  return `${url.pathname}${url.search}`;
}
function buildPrintScheduleSnapshot(
  targetDay=day,
  targetWeekOffset=weekOffset
){
  const rowsSource=getRowsForWeekOffset(targetWeekOffset);

  const slots=Object.keys(HORA_MAP)
    .map(Number)
    .filter(hora=>!HORAS_PATIO.has(hora))
    .map(hora=>{
      const info=HORA_MAP[hora]||{label:`${hora}a`,rango:''};

      if(storage.hasBackend()){
        const effectiveSlot=getEffectiveGuardiaSlot(
          targetDay,
          hora,
          targetWeekOffset
        );

        return {
          hora,
          info:{label:info.label,rango:info.rango},
          assignments:effectiveSlot
            ?buildAuthoritativeSlotAssignments(effectiveSlot)
            :[{
              teacher:'Estado no disponible',
              location:'Guardias',
              meta:'No se recibió el estado operativo del servidor',
              tone:'general'
            }]
        };
      }

      const assignedRows=assignGuardiasForRows(rowsSource)
        .filter(row=>Number(row.dia)===Number(targetDay));

      const hourRows=assignedRows
        .filter(row=>Number(row.hora)===hora&&rowNeedsCoverage(row))
        .sort((a,b)=>
          String(getVisibleTeacherName(a.guardia||''))
            .localeCompare(getVisibleTeacherName(b.guardia||''),'es')
        );

      const assignments=hourRows.map(row=>({
        teacher:getVisibleTeacherName(row.guardia||'')||'Sin cubrir',
        location:resolveAulaRegistro(row)||'Sin ubicación',
        meta:getVisibleTeacherName(row.ausente||'')
          ?`Cubre a ${getVisibleTeacherName(row.ausente)}`
          :'',
        tone:'general'
      }));

      const assignedTeachers=new Set(
        assignments.map(item=>cleanText(item.teacher)).filter(Boolean)
      );

      const {biblioteca,banos}=getEffectiveSpecialAssignments(
        targetDay,
        hora,
        assignedRows
      );

      if(
        biblioteca&&
        !assignedTeachers.has(cleanText(getVisibleTeacherName(biblioteca)))
      ){
        assignments.push({
          teacher:getVisibleTeacherName(biblioteca),
          location:'Biblioteca',
          meta:'Puesto de apoyo',
          tone:'biblioteca'
        });
      }

      if(
        banos&&
        !assignedTeachers.has(cleanText(getVisibleTeacherName(banos)))
      ){
        assignments.push({
          teacher:getVisibleTeacherName(banos),
          location:'Baños',
          meta:'Puesto de apoyo',
          tone:'banos'
        });
      }

      return {
        hora,
        info:{label:info.label,rango:info.rango},
        assignments
      };
    });

  const weekKey=getSchoolWeekKeyFromOffset(targetWeekOffset);

  return {
    version:2,
    createdAt:new Date().toISOString(),
    day:targetDay,
    weekOffset:targetWeekOffset,
    weekKey,
    dayLabel:DIAS[targetDay]||'Jornada lectiva',
    weekLabel:formatWeekRangeLabel(weekKey,targetWeekOffset),
    dateLabel:formatPrintableDateLabel(
      getDateForSchoolWeekDay(weekKey,targetDay)
    ),
    slots
  };
}

function getMainRouteUrl(){
  if(window.location.protocol==='file:') return 'guardias.html';
  const url=new URL(window.location.href);
  url.searchParams.delete('panel');
  url.searchParams.delete('view');
  url.searchParams.delete('day');
  url.searchParams.delete('weekOffset');
  if(url.pathname.toLowerCase().endsWith('/tv')){
    url.pathname=url.pathname.slice(0,-3)||'/';
  }
  if(url.pathname.toLowerCase().endsWith('/print')){
    url.pathname=url.pathname.slice(0,-6)||'/';
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
function openTvPanel(){
  window.location.href=getTvRouteUrl();
}
function closeTvPanel(){
  window.location.href=getMainRouteUrl();
}
async function openPrintableSchedule(){
  if(!isAdmin) return;

  await refreshEffectiveGuardiaDayState(
    day,
    weekOffset,
    {render:false}
  );

  const destination=getPrintRouteUrl(day,weekOffset);

  try{
    window.sessionStorage.setItem(
      KEY_PRINT_SNAPSHOT,
      JSON.stringify(buildPrintScheduleSnapshot(day,weekOffset))
    );
  }catch(_error){}

  window.location.href=destination;
}
async function persistTvAnnouncementState(nextState,successMessage){
  try{
    const payload={
      ...normalizeTvAnnouncementState(nextState),
      updatedAt:new Date().toISOString(),
      updatedBy:'Jefatura'
    };
    if(storage.hasBackend()){
      tvAnnouncement=normalizeTvAnnouncementState(await storage.saveTvAnnouncement(payload));
    }else{
      tvAnnouncement=payload;
    }
    persistTvAnnouncement(tvAnnouncement);
    renderTvAnnouncement();
    renderTvPanel();
    notifyRealtimeSync('tv-announcement');
    if(successMessage) showToast(successMessage,'success');
    return true;
  }catch(error){
    console.error('persistTvAnnouncementState failed',error);
    showToast('No se pudo actualizar el aviso para la sala de profesores.','error');
    return false;
  }
}
async function addTvAnnouncement(){
  const input=document.getElementById('tvAnnouncementInput');
  const priorityInput=document.getElementById('tvAnnouncementPriority');
  const text=cleanText(input?.value||'').replace(/\s+/g,' ').trim();
  const priority=['urgent','important','normal'].includes(priorityInput?.value)?priorityInput.value:'normal';
  if(!text){
    showToast('Escribe un aviso antes de añadirlo.','error');
    input?.focus();
    return;
  }
  const items=[...(tvAnnouncement.items||[])];
  items.push(normalizeTvAnnouncementItem({
    id:`aviso-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    text,
    priority,
    active:true
  },items.length));
  const ok=await persistTvAnnouncementState({items},'Aviso añadido y activado en sala de profesores.');
  if(ok&&input) input.value='';
}
async function deactivateAllTvAnnouncements(){
  const items=(tvAnnouncement.items||[]).map(item=>({...item,active:false}));
  await persistTvAnnouncementState({items},'Todos los avisos han quedado desactivados.');
}
async function toggleTvAnnouncementItem(id){
  const items=(tvAnnouncement.items||[]).map(item=>item.id===id?{...item,active:!item.active}:item);
  await persistTvAnnouncementState({items},'Estado del aviso actualizado.');
}
async function removeTvAnnouncementItem(id){
  const items=(tvAnnouncement.items||[]).filter(item=>item.id!==id);
  await persistTvAnnouncementState({items},'Aviso eliminado.');
}
async function moveTvAnnouncementItem(id,direction){
  const items=[...(tvAnnouncement.items||[])];
  const index=items.findIndex(item=>item.id===id);
  if(index===-1) return;
  const nextIndex=index+Number(direction||0);
  if(nextIndex<0||nextIndex>=items.length) return;
  [items[index],items[nextIndex]]=[items[nextIndex],items[index]];
  await persistTvAnnouncementState({items},'Orden de avisos actualizado.');
}
function getDateForSchoolWeekDay(weekKey,dayIndex){
  const monday=getSchoolWeekDateFromKey(weekKey);
  if(!monday||!Number.isInteger(dayIndex)) return null;
  const targetDate=new Date(monday);
  targetDate.setDate(monday.getDate()+dayIndex);
  return targetDate;
}
function formatPrintableDateLabel(date){
  if(!(date instanceof Date)||Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'});
}
function getPrintableSlotsForDay(targetDay,rowsSource){
  return Object.keys(HORA_MAP)
    .map(Number)
    .filter(hora=>!HORAS_PATIO.has(hora))
    .map(hora=>({
      hora,
      info:HORA_MAP[hora],
      assignments:getTvSlotAssignments({dia:targetDay,hora},rowsSource)
    }));
}
function getTodaySchoolDayIndex(){
  const weekday=formatNowParts().date.getDay();
  return weekday>=1&&weekday<=5?weekday-1:null;
}
function getUpcomingSchoolSlotsForToday(limit=2){
  const {hours,minutes,date}=formatNowParts();
  const weekday=date.getDay();
  if(weekday<1||weekday>5) return [];
  const total=hours*60+minutes;
  const upcoming=[];
  for(const hora of Object.keys(HORA_MAP).map(Number).sort((a,b)=>a-b)){
    if(HORAS_PATIO.has(hora)) continue;
    const [start]=String(HORA_MAP[hora].rango||'').split('-');
    const [sh,sm]=start.split(':').map(Number);
    if(!Number.isInteger(sh)||!Number.isInteger(sm)) continue;
    if(total<sh*60+sm){
      upcoming.push({dia:weekday-1,hora});
      if(upcoming.length>=limit) break;
    }
  }
  return upcoming;
}
function buildAuthoritativeSlotAssignments(effectiveSlot){
  if(!effectiveSlot) return [];

  const assignments=[];

  (Array.isArray(effectiveSlot.coverage)?effectiveSlot.coverage:[]).forEach(item=>{
    const covered=item?.status==='covered'&&cleanText(item?.teacher);

    assignments.push({
      teacher:covered?cleanText(item.teacher):'Sin cubrir',
      location:[
        cleanText(item?.group)?`Grupo ${cleanText(item.group)}`:'Grupo no indicado',
        cleanText(item?.room)?`Aula ${cleanText(item.room)}`:'Aula no indicada'
      ].join(' · '),
      meta:[
        item?.status==='covered'?'Cubierta':'Pendiente',
        cleanText(item?.absentTeacher)?`Ausente: ${cleanText(item.absentTeacher)}`:'',
        cleanText(item?.subject)
      ].filter(Boolean).join(' · '),
      tone:'general'
    });
  });

  if(cleanText(effectiveSlot?.biblioteca?.teacher)){
    assignments.push({
      teacher:cleanText(effectiveSlot.biblioteca.teacher),
      location:'Biblioteca',
      meta:'Puesto de apoyo',
      tone:'biblioteca'
    });
  }

  if(cleanText(effectiveSlot?.banos?.teacher)){
    assignments.push({
      teacher:cleanText(effectiveSlot.banos.teacher),
      location:'Baños',
      meta:'Puesto de apoyo',
      tone:'banos'
    });
  }

  (Array.isArray(effectiveSlot?.unassignedGuards)?effectiveSlot.unassignedGuards:[])
    .forEach(item=>{
      const teacher=cleanText(item?.teacher);
      if(!teacher) return;

      assignments.push({
        teacher,
        location:'Guardia disponible',
        meta:'Sin asignación',
        tone:'general'
      });
    });

  return assignments;
}

function getTvSlotAssignments(slot,rowsSource){
  if(!slot) return [];

  const effectiveSlot=getEffectiveGuardiaSlot(
    slot.dia,
    slot.hora,
    weekOffset
  );

  if(effectiveSlot){
    return buildAuthoritativeSlotAssignments(effectiveSlot);
  }

  if(storage.hasBackend()){
    return [{
      teacher:'Estado no disponible',
      location:'Guardias',
      meta:'Esperando estado operativo del servidor',
      tone:'general'
    }];
  }

  const rows=(rowsSource||[])
    .filter(row=>row.dia===slot.dia&&row.hora===slot.hora&&rowNeedsCoverage(row))
    .sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));

  const assignments=rows.map(buildTvAbsenceAssignment);
  const assignedTeachers=new Set(
    assignments.map(item=>cleanText(item.teacher)).filter(Boolean)
  );

  const {biblioteca,banos}=getEffectiveSpecialAssignments(
    slot.dia,
    slot.hora,
    rowsSource
  );

  if(biblioteca&&!assignedTeachers.has(cleanText(getVisibleTeacherName(biblioteca)))){
    assignments.push({
      teacher:getVisibleTeacherName(biblioteca),
      location:'Biblioteca',
      meta:'Puesto de apoyo',
      tone:'biblioteca'
    });
  }

  if(banos&&!assignedTeachers.has(cleanText(getVisibleTeacherName(banos)))){
    assignments.push({
      teacher:getVisibleTeacherName(banos),
      location:'Baños',
      meta:'Puesto de apoyo',
      tone:'banos'
    });
  }

  return assignments;
}

function renderTvSlotPanel(containerId,slot,badgeId,rowsSource,options={}){
  const container=document.getElementById(containerId);
  const badge=document.getElementById(badgeId);
  if(!container||!badge) return;
  if(!slot){
    badge.textContent=options.emptyBadge||'Sin tramo lectivo';
    container.innerHTML=`<div class="tv-empty">${escapeHtml(options.emptyMessage||'No hay un tramo lectivo activo ahora mismo.')}</div>`;
    return;
  }
  badge.textContent=`${HORA_MAP[slot.hora].label} hora · ${HORA_MAP[slot.hora].rango.replace('-', ' - ')}`;
  const assignments=getTvSlotAssignments(slot,rowsSource);
  if(!assignments.length){
    container.innerHTML='<div class="tv-empty">No hay guardias registradas para este tramo.</div>';
    return;
  }
  container.innerHTML=`<div class="tv-cards">${assignments.map(item=>`
    <article class="tv-card tv-card-${item.tone}">
      <div class="tv-card-teacher">${escapeHtml(item.teacher)}</div>
      <div class="tv-card-location">${escapeHtml(item.location)}</div>
      ${item.meta?`<div class="tv-card-meta">${escapeHtml(item.meta)}</div>`:''}
    </article>
  `).join('')}</div>`;
}
function renderTvPanel(){
  const shell=document.getElementById('tvShell');
  if(!shell) return;
  const rowsSource=getRowsForWeekOffset(0);
  const currentSlot=getCurrentSchoolSlot();
  const upcomingSlots=getUpcomingSchoolSlotsForToday(2);
  const nextSlot=upcomingSlots[0]||null;
  const laterSlot=upcomingSlots[1]||null;
  renderTvSlotPanel('tvCurrentPanel',currentSlot,'tvCurrentSlotBadge',rowsSource,{
    emptyBadge:'Sin tramo lectivo',
    emptyMessage:getTodaySchoolDayIndex()==null
      ?'Hoy no hay jornada lectiva. El panel volverá a activarse en el próximo día de clase.'
      :'Ahora mismo no hay un tramo lectivo activo.'
  });
  renderTvSlotPanel('tvNextPanel',nextSlot,'tvNextSlotBadge',rowsSource,{
    emptyBadge:'Sin siguiente tramo',
    emptyMessage:getTodaySchoolDayIndex()==null
      ?'No hay siguiente tramo programado para hoy.'
      :'No queda ningún tramo lectivo por delante en la jornada de hoy.'
  });
  renderTvSlotPanel('tvLaterPanel',laterSlot,'tvLaterSlotBadge',rowsSource,{
    emptyBadge:'Sin siguiente tramo',
    emptyMessage:getTodaySchoolDayIndex()==null
      ?'No hay más tramos programados para hoy.'
      :'No queda un tercer tramo visible en la jornada de hoy.'
  });
}
function renderPrintSchedule(){
  const shell=document.getElementById('printShell');
  if(!shell) return;
  if(!PRINT_MODE){
    shell.innerHTML='';
    return;
  }
  const weekKey=getSelectedWeekKey();
  const targetDate=getDateForSchoolWeekDay(weekKey,day);
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const slots=getPrintableSlotsForDay(day,rowsSource);
  const generatedAt=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  shell.innerHTML=`
    <div class="print-toolbar no-print">
      <div class="print-toolbar-copy">
        <strong>Vista imprimible de contingencia</strong>
        <span>Revisa el parte y lanza la impresi&oacute;n en A4 horizontal.</span>
      </div>
      <div class="print-toolbar-actions">
        <button class="btn-add btn-add-secondary" type="button" onclick="window.print()">Imprimir horario</button>
        <a class="btn-add btn-add-ghost print-close-link" href="${escapeHtml(getMainRouteUrl())}">Volver</a>
      </div>
    </div>
    <section class="print-sheet">
      <header class="print-sheet-head">
        <div>
          <div class="print-sheet-kicker">IES Alcalans · Parte de guardias</div>
          <h1 class="print-sheet-title">Horario de contingencia</h1>
          <div class="print-sheet-meta">Generado a las ${escapeHtml(generatedAt)}</div>
        </div>
        <div class="print-sheet-date">
          <div class="print-sheet-day">${escapeHtml(DIAS[day]||'Jornada lectiva')}</div>
          <div class="print-sheet-date-text">${escapeHtml(formatPrintableDateLabel(targetDate))}</div>
          <div class="print-sheet-week">${escapeHtml(formatWeekRangeLabel(weekKey,weekOffset))}</div>
        </div>
      </header>
      <div class="print-slot-grid">
        ${slots.map(slot=>{
          const visibleAssignments=slot.assignments.length?slot.assignments:[{teacher:'',location:'',meta:''}];
          return `
            <article class="print-slot-card">
              <div class="print-slot-head">
                <div class="print-slot-hour">${escapeHtml(slot.info.label)} hora</div>
                <div class="print-slot-range">${escapeHtml(slot.info.rango.replace('-', ' - '))}</div>
              </div>
              <div class="print-slot-list">
                ${visibleAssignments.map(item=>`
                  <div class="print-assignment${item.teacher||item.location||item.meta?'':' print-assignment-empty'}">
                    <div class="print-assignment-main">
                      <span class="print-assignment-teacher">${escapeHtml(item.teacher||' ')}</span>
                      <span class="print-assignment-location">${escapeHtml(item.location||' ')}</span>
                    </div>
                    <div class="print-assignment-meta">${escapeHtml(item.meta||' ')}</div>
                  </div>
                `).join('')}
              </div>
            </article>
          `;
        }).join('')}
      </div>
      <footer class="print-sheet-note">El profesorado que no t&eacute; tasca assignada ha de controlar els banys i els corredors.</footer>
    </section>
  `;
}
function hasSuccessfulBackendRead(results){
  return Array.isArray(results)&&results.some(result=>result?.status==='fulfilled');
}
function formatLocalDateKey(date){
  if(!(date instanceof Date)||Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')
  ].join('-');
}

function normalizeEffectiveGuardiaDayState(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.slots)) return null;
  const dia=Number(raw.dia);
  if(!Number.isInteger(dia)||dia<0||dia>4) return null;
  return {
    ...raw,
    dia,
    date:cleanText(raw.date),
    slots:raw.slots.filter(slot=>
      slot&&Number(slot.dia)===dia&&Number.isInteger(Number(slot.hora))
    )
  };
}

function getEffectiveGuardiaDateKey(targetDay=day,targetWeekOffset=weekOffset){
  const safeDay=Number(targetDay);
  if(!Number.isInteger(safeDay)||safeDay<0||safeDay>4) return '';
  const weekKey=getSchoolWeekKeyFromOffset(targetWeekOffset);
  const targetDate=getDateForSchoolWeekDay(weekKey,safeDay);
  return formatLocalDateKey(targetDate);
}

function getEffectiveGuardiaDayState(targetDay=day,targetWeekOffset=weekOffset){
  const dateKey=getEffectiveGuardiaDateKey(targetDay,targetWeekOffset);
  return dateKey?(effectiveGuardiaDayStates.get(dateKey)||null):null;
}

function getEffectiveGuardiaSlot(dia,hora,targetWeekOffset=weekOffset){
  const state=getEffectiveGuardiaDayState(Number(dia),targetWeekOffset);
  if(!state||Number(state.dia)!==Number(dia)) return null;
  return state.slots.find(slot=>Number(slot.hora)===Number(hora))||null;
}

async function refreshEffectiveGuardiaDayState(
  targetDay=day,
  targetWeekOffset=weekOffset,
  options={}
){
  if(!storage.hasBackend()) return null;

  const dateKey=getEffectiveGuardiaDateKey(targetDay,targetWeekOffset);
  if(!dateKey) return null;

  try{
    const raw=await storage.fetchEffectiveGuardiaSlots(dateKey);
    const normalized=normalizeEffectiveGuardiaDayState(raw);

    if(
      !normalized||
      normalized.date!==dateKey||
      Number(normalized.dia)!==Number(targetDay)
    ){
      throw new Error('Estado efectivo de guardias inválido para la fecha solicitada.');
    }

    const previous=effectiveGuardiaDayStates.get(dateKey)||null;
    const changed=JSON.stringify(previous)!==JSON.stringify(normalized);

    effectiveGuardiaDayStates.set(dateKey,normalized);

    if(options.render===true&&changed){
      renderGuardiaBoard();
      renderTable();
      renderTvPanel();
    }

    return normalized;
  }catch(error){
    console.warn('[guardias] effective slot state refresh failed',{
      date:dateKey,
      error
    });
    return null;
  }
}

async function hydrateFromBackend(){
  if(!storage.hasBackend()) return;
  if(backendHydrated) return;
  if(backendHydrationPromise) return backendHydrationPromise;
  backendHydrationPromise=(async()=>{
    try{
    const backendReadResults=await Promise.allSettled([
      storage.fetchGuardias(),
      storage.fetchBiblioteca(),
      storage.fetchBanos(),
      isAdmin?storage.fetchHistorial():Promise.resolve(null),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides(),
      storage.fetchAlumnosFueraAula(),
      storage.fetchTeacherSubstitutions(),
      storage.fetchTeacherPracticasGuardias(),
      storage.fetchTeacherPracticasGuardiasTramos(),
      storage.fetchPatioGuardias(),
      storage.fetchPatioTeacherBlocks(),
      storage.fetchTvAnnouncement(),
      (canAdmin||canSuperAdmin)
        ?storage.fetchGuardiaMonthlyLoad()
        :Promise.resolve(null),
      storage.fetchGroups()
    ]);
    if(!hasSuccessfulBackendRead(backendReadResults)) throw new Error('No se pudo completar ninguna lectura del backend.');
    const [guardiasResult,bibliotecaResult,banosResult,historialResult,tareasResult,overridesResult,alumnosFueraResult,substitutionsResult,practicasGuardiasResult,practicasGuardiasTramosResult,patioGuardiasResult,patioTeacherBlocksResult,tvAnnouncementResult,guardiaMonthlyLoadResult,groupStatesResult]=backendReadResults;
    const guardiasRows=guardiasResult.status==='fulfilled'?guardiasResult.value:null;
    const bibliotecaRows=bibliotecaResult.status==='fulfilled'?bibliotecaResult.value:null;
    const banosRows=banosResult.status==='fulfilled'?banosResult.value:null;
    const historialRows=historialResult.status==='fulfilled'?historialResult.value:null;
    const tareasRows=tareasResult.status==='fulfilled'?tareasResult.value:null;
    const overridesRows=overridesResult.status==='fulfilled'?overridesResult.value:null;
    const alumnosFueraRows=alumnosFueraResult.status==='fulfilled'?alumnosFueraResult.value:null;
    const substitutionsRows=substitutionsResult.status==='fulfilled'?substitutionsResult.value:null;
    const practicasGuardiasRows=practicasGuardiasResult.status==='fulfilled'?practicasGuardiasResult.value:null;
    const practicasGuardiasTramosRows=practicasGuardiasTramosResult.status==='fulfilled'?practicasGuardiasTramosResult.value:null;
    const patioGuardiasRows=patioGuardiasResult.status==='fulfilled'?patioGuardiasResult.value:null;
    const patioTeacherBlocksRows=patioTeacherBlocksResult.status==='fulfilled'?patioTeacherBlocksResult.value:null;
    const tvAnnouncementRow=tvAnnouncementResult.status==='fulfilled'?tvAnnouncementResult.value:null;
    const guardiaMonthlyLoadRow=guardiaMonthlyLoadResult.status==='fulfilled'?guardiaMonthlyLoadResult.value:null;
    const groupStateRows=groupStatesResult.status==='fulfilled'?groupStatesResult.value:null;

    const backendHasData=
      (Array.isArray(guardiasRows)&&guardiasRows.length)||
      (Array.isArray(bibliotecaRows)&&bibliotecaRows.length)||
      (Array.isArray(banosRows)&&banosRows.length)||
      (Array.isArray(historialRows)&&historialRows.length)||
      (Array.isArray(tareasRows)&&tareasRows.length)||
      (Array.isArray(overridesRows)&&overridesRows.length)||
      ((Array.isArray(alumnosFueraRows)?alumnosFueraRows:alumnosFueraRows?.rows||[]).length)||
      (Array.isArray(substitutionsRows)&&substitutionsRows.length)||
      (Array.isArray(practicasGuardiasRows)&&practicasGuardiasRows.length)||
      (Array.isArray(practicasGuardiasTramosRows)&&practicasGuardiasTramosRows.length)||
      (Array.isArray(patioGuardiasRows)&&patioGuardiasRows.length)||
      (Array.isArray(patioTeacherBlocksRows)&&patioTeacherBlocksRows.length)||
      (Array.isArray(groupStateRows)&&groupStateRows.length)||
      (tvAnnouncementRow&&typeof tvAnnouncementRow==='object'&&(Array.isArray(tvAnnouncementRow.items)?tvAnnouncementRow.items.length:!!cleanText(tvAnnouncementRow.text)))||
      (guardiaMonthlyLoadRow&&typeof guardiaMonthlyLoadRow==='object'&&Object.keys(guardiaMonthlyLoadRow.byDate||{}).length);

    if(Array.isArray(guardiasRows)){
      data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
    }

    if(Array.isArray(bibliotecaRows)){
      setBibliotecaGuardias(bibliotecaRows);
    }

    if(Array.isArray(banosRows)){
      setBanosGuardias(banosRows);
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
    {
      const rows=Array.isArray(alumnosFueraRows)?alumnosFueraRows:alumnosFueraRows?.rows;
      if(Array.isArray(rows)){
        alumnosFueraAula=Object.fromEntries(rows.map(normalizeAlumnosFueraRow).filter(Boolean).map(row=>[makeAlumnosFueraKey(row.profesor,row.dia,row.hora),row]));
        persistAlumnosFueraAula(alumnosFueraAula);
      }
    }
    if(Array.isArray(substitutionsRows)){
      applyTeacherSubstitutionRows(substitutionsRows);
    }
    if(Array.isArray(practicasGuardiasRows)){
      teacherPracticasGuardias=[...new Set(practicasGuardiasRows.map(row=>resolveTeacherCanonicalName(row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
      persistTeacherPracticasGuardias(teacherPracticasGuardias);
    }
    if(Array.isArray(practicasGuardiasTramosRows)){
      teacherPracticasGuardiasTramos=[...new Map(practicasGuardiasTramosRows.map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora),row])).values()]
        .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
      persistTeacherPracticasGuardiasTramos(teacherPracticasGuardiasTramos);
    }
    if(Array.isArray(patioGuardiasRows)){
      patioGuardias=[...new Map(patioGuardiasRows.map(normalizePatioGuardiaRow).filter(Boolean).map(row=>[makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId),row])).values()]
        .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.positionId.localeCompare(b.positionId,'es'));
      persistPatioGuardias(patioGuardias);
    }
    if(Array.isArray(patioTeacherBlocksRows)){
      patioTeacherBlocks=[...new Map(patioTeacherBlocksRows.map(normalizePatioTeacherBlockRow).filter(Boolean).map(row=>[makePatioTeacherBlockKey(row.weekKey,row.dia,row.hora,row.profesor),row])).values()]
        .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.profesor.localeCompare(b.profesor,'es'));
      persistPatioTeacherBlocks(patioTeacherBlocks);
    }
    if(tvAnnouncementRow&&typeof tvAnnouncementRow==='object'){
      tvAnnouncement=normalizeTvAnnouncementState(tvAnnouncementRow);
      persistTvAnnouncement(tvAnnouncement);
    }
    if(guardiaMonthlyLoadRow&&typeof guardiaMonthlyLoadRow==='object'){
      guardiaMonthlyLoad=normalizeGuardiaMonthlyLoadState(guardiaMonthlyLoadRow);
      persistGuardiaMonthlyLoad(guardiaMonthlyLoad);
    }
    if(Array.isArray(groupStateRows)){
      groupStates=mergeGroupStatesWithDetected(groupStateRows);
      persistGroupStates(groupStates);
    }
    await refreshEffectiveGuardiaDayState(day,weekOffset,{render:false});
    const needsBootstrapSync=!backendHasData&&!storage.isBackendOnly()&&(data.length||historialCambios.length);
    refreshOrdenGuardias();
    lastBackendSnapshot=makeBackendSnapshot();
    if(!needsBootstrapSync) markAdminStatePersisted();
    else lastAdminPersistedHash='';
    backendHydrated=true;
    superAdminStatus.lastHydrateAt=new Date().toISOString();
    clearSuperAdminError();
    pushSuperAdminEvent('Actualización','Estado principal recargado desde el servidor.');
    renderGuardiasUiIfChanged(true);
    renderHistoryList();
    renderSubstitutionList();
    renderPracticasGuardiasList();
    renderPracticasGuardiasConfig();
    renderGroupStatesPanel();
    renderFutureAbsenceAdminList();
    renderTvAnnouncement();
    if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();

    if(needsBootstrapSync){
      syncAdminState({origin:'hydrate',reason:'bootstrap-sync'});
    }
    }catch(error){
      backendHydrated=false;
      console.warn('Backend hydration failed',error);
      setSuperAdminError('Fallo al hidratar el estado principal.');
      pushSuperAdminEvent('Error de carga',String(error?.message||error));
    }finally{
      backendHydrationPromise=null;
    }
  })();
  return backendHydrationPromise;
}
function isAnyOverlayOpen(){
  return ['overlay','teacherOverlay','teacherAccessOverlay','historyOverlay','substitutionOverlay','practicasGuardiasOverlay','futureAbsenceAdminOverlay','dialogOverlay']
    .some(id=>document.getElementById(id)?.classList.contains('open'));
}
function isOverlayOpen(id){
  return !!document.getElementById(id)?.classList.contains('open');
}
function shouldHydrateTeacherFutureAbsencesOnInterval(){
  return isOverlayOpen('teacherOverlay')||isOverlayOpen('futureAbsenceAdminOverlay')||isAdmin||isSuperAdmin;
}
function shouldHydrateAlumnosFueraAulaOnInterval(){
  return isOverlayOpen('teacherOverlay')||isAdmin||isSuperAdmin;
}
function makeBackendSnapshot(){
  return JSON.stringify({
    data,
    biblioteca:serializeBibliotecaAssignments(),
    banos:serializeBanosAssignments(),
    tareas:serializeTeacherTasks(),
    overrides:serializeSessionOverrides(),
    alumnosFuera:serializeAlumnosFueraAula(),
    guardiaMonthlyLoad,
    patioGuardias:serializePatioGuardias(),
    patioTeacherBlocks:serializePatioTeacherBlocks(),
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
function makeGuardiasUiSnapshot(){
  const rows=getSelectedRowsForDay(day);
  const filteredRows=getAdminFilteredRows(rows);
  return JSON.stringify({
    weekOffset,
    day,
    adminTableFilter,
    teacherWeekOffset,
    teacherDay,
    biblioteca:serializeBibliotecaAssignments(),
    banos:serializeBanosAssignments(),
    rows:filteredRows.map(row=>({
      id:row.id,
      dia:row.dia,
      hora:row.hora,
      ausente:row.ausente,
      guardia:row.guardia||'',
      aula:resolveAulaRegistro(row),
      faena:!!resolveFaena(row).faena,
      obs:resolveFaena(row).obs||'',
      futurePlanned:!!row.futurePlanned,
      futureStatus:row.futureStatus||''
    }))
  });
}
function renderGuardiasUiIfChanged(force=false){
  const nextSnapshot=makeGuardiasUiSnapshot();
  if(!force&&nextSnapshot===lastRenderedGuardiasUiSnapshot) return false;
  console.info('[render triggered]',{force,reason:force?'forced-or-initial':'visible-state-changed'});
  lastRenderedGuardiasUiSnapshot=nextSnapshot;
  renderGuardiaBoard();
  renderTable();
  return true;
}
async function pollBackendState(force=false){
  if(!storage.hasBackend()||backendPollingInFlight||backendSyncInFlight) return;
  if(!force&&(document.hidden||isAnyOverlayOpen())) return;

  backendPollingInFlight=true;
  renderSuperAdminMonitor();
  try{
    const previousSnapshot=makeBackendSnapshot();
    const backendReadResults=await Promise.allSettled([
      storage.fetchGuardias(),
      storage.fetchBiblioteca(),
      storage.fetchBanos(),
      isAdmin?storage.fetchHistorial():Promise.resolve(null),
      storage.fetchTareasProfesorado(),
      storage.fetchSessionOverrides(),
      storage.fetchAlumnosFueraAula(),
      storage.fetchTeacherSubstitutions(),
      storage.fetchTeacherPracticasGuardias(),
      storage.fetchTeacherPracticasGuardiasTramos(),
      storage.fetchPatioGuardias(),
      storage.fetchPatioTeacherBlocks(),
      storage.fetchTvAnnouncement(),
      (canAdmin||canSuperAdmin)
        ?storage.fetchGuardiaMonthlyLoad()
        :Promise.resolve(null),
      storage.fetchGroups()
    ]);
    if(!hasSuccessfulBackendRead(backendReadResults)) throw new Error('No se pudo completar ninguna lectura del backend.');
    const [guardiasResult,bibliotecaResult,banosResult,historialResult,tareasResult,overridesResult,alumnosFueraResult,substitutionsResult,practicasGuardiasResult,practicasGuardiasTramosResult,patioGuardiasResult,patioTeacherBlocksResult,tvAnnouncementResult,guardiaMonthlyLoadResult,groupStatesResult]=backendReadResults;
    const guardiasRows=guardiasResult.status==='fulfilled'?guardiasResult.value:null;
    const bibliotecaRows=bibliotecaResult.status==='fulfilled'?bibliotecaResult.value:null;
    const banosRows=banosResult.status==='fulfilled'?banosResult.value:null;
    const historialRows=historialResult.status==='fulfilled'?historialResult.value:null;
    const tareasRows=tareasResult.status==='fulfilled'?tareasResult.value:null;
    const overridesRows=overridesResult.status==='fulfilled'?overridesResult.value:null;
    const alumnosFueraRows=alumnosFueraResult.status==='fulfilled'?alumnosFueraResult.value:null;
    const substitutionsRows=substitutionsResult.status==='fulfilled'?substitutionsResult.value:null;
    const practicasGuardiasRows=practicasGuardiasResult.status==='fulfilled'?practicasGuardiasResult.value:null;
    const practicasGuardiasTramosRows=practicasGuardiasTramosResult.status==='fulfilled'?practicasGuardiasTramosResult.value:null;
    const patioGuardiasRows=patioGuardiasResult.status==='fulfilled'?patioGuardiasResult.value:null;
    const patioTeacherBlocksRows=patioTeacherBlocksResult.status==='fulfilled'?patioTeacherBlocksResult.value:null;
    const tvAnnouncementRow=tvAnnouncementResult.status==='fulfilled'?tvAnnouncementResult.value:null;
    const guardiaMonthlyLoadRow=guardiaMonthlyLoadResult.status==='fulfilled'?guardiaMonthlyLoadResult.value:null;
    const groupStateRows=groupStatesResult.status==='fulfilled'?groupStatesResult.value:null;

    if(Array.isArray(guardiasRows)){
      data=normalizeStoredRows(guardiasRows.map(row=>({...row,faena:!!row.faena})));
      nid=computeNextId(data);
      persist(data);
    }

    if(Array.isArray(bibliotecaRows)){
      setBibliotecaGuardias(bibliotecaRows);
    }

    if(Array.isArray(banosRows)){
      setBanosGuardias(banosRows);
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
    {
      const rows=Array.isArray(alumnosFueraRows)?alumnosFueraRows:alumnosFueraRows?.rows;
      if(Array.isArray(rows)){
        alumnosFueraAula=Object.fromEntries(rows.map(normalizeAlumnosFueraRow).filter(Boolean).map(row=>[makeAlumnosFueraKey(row.profesor,row.dia,row.hora),row]));
        persistAlumnosFueraAula(alumnosFueraAula);
      }
    }
    if(Array.isArray(substitutionsRows)){
      applyTeacherSubstitutionRows(substitutionsRows);
    }
    if(Array.isArray(practicasGuardiasRows)){
      teacherPracticasGuardias=[...new Set(practicasGuardiasRows.map(row=>resolveTeacherCanonicalName(row?.profesor)).filter(nombre=>getProfesor(nombre)))].sort((a,b)=>a.localeCompare(b,'es'));
      persistTeacherPracticasGuardias(teacherPracticasGuardias);
    }
    if(Array.isArray(practicasGuardiasTramosRows)){
      teacherPracticasGuardiasTramos=[...new Map(practicasGuardiasTramosRows.map(normalizePracticasGuardiasSlot).filter(Boolean).map(row=>[makePracticasGuardiasSlotKey(row.profesor,row.dia,row.hora),row])).values()]
        .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
      persistTeacherPracticasGuardiasTramos(teacherPracticasGuardiasTramos);
    }
    if(Array.isArray(patioGuardiasRows)){
      patioGuardias=[...new Map(patioGuardiasRows.map(normalizePatioGuardiaRow).filter(Boolean).map(row=>[makePatioGuardiaKey(row.weekKey,row.dia,row.hora,row.positionId),row])).values()]
        .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.positionId.localeCompare(b.positionId,'es'));
      persistPatioGuardias(patioGuardias);
    }
    if(Array.isArray(patioTeacherBlocksRows)){
      patioTeacherBlocks=[...new Map(patioTeacherBlocksRows.map(normalizePatioTeacherBlockRow).filter(Boolean).map(row=>[makePatioTeacherBlockKey(row.weekKey,row.dia,row.hora,row.profesor),row])).values()]
        .sort((a,b)=>a.weekKey.localeCompare(b.weekKey)||a.dia-b.dia||a.hora-b.hora||a.profesor.localeCompare(b.profesor,'es'));
      persistPatioTeacherBlocks(patioTeacherBlocks);
    }
    if(tvAnnouncementRow&&typeof tvAnnouncementRow==='object'){
      tvAnnouncement=normalizeTvAnnouncementState(tvAnnouncementRow);
      persistTvAnnouncement(tvAnnouncement);
    }
    if(guardiaMonthlyLoadRow&&typeof guardiaMonthlyLoadRow==='object'){
      guardiaMonthlyLoad=normalizeGuardiaMonthlyLoadState(guardiaMonthlyLoadRow);
      persistGuardiaMonthlyLoad(guardiaMonthlyLoad);
    }
    if(Array.isArray(groupStateRows)){
      groupStates=mergeGroupStatesWithDetected(groupStateRows);
      persistGroupStates(groupStates);
    }
    await refreshEffectiveGuardiaDayState(day,weekOffset,{render:true});
    refreshOrdenGuardias();
    lastBackendSnapshot=makeBackendSnapshot();
    markAdminStatePersisted();
    superAdminStatus.lastPollAt=new Date().toISOString();
    clearSuperAdminError();
    if(previousSnapshot!==makeBackendSnapshot()){
      pushSuperAdminEvent('Consulta','Se detectaron cambios remotos y se actualizaron en este dispositivo.');
      renderGuardiasUiIfChanged();
      renderHistoryList();
      renderSubstitutionList();
      renderPracticasGuardiasList();
      renderPracticasGuardiasConfig();
      renderGroupStatesPanel();
      renderTvAnnouncement();
      if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
    }else{
      pushSuperAdminEvent('Consulta','Comprobación remota sin cambios.');
    }
  }catch(error){
    console.warn('Backend polling failed',error);
    setSuperAdminError('Fallo en la comprobación periódica del backend.');
    pushSuperAdminEvent('Error de consulta',String(error?.message||error));
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
  const btnTeacher=document.getElementById('btnTeacher');
  const btnAdmin=document.getElementById('btnAdmin');
  const btnSuperAdmin=document.getElementById('btnSuperAdmin');
  const btnLogout=document.getElementById('btnLogout');
  const adminBar=document.getElementById('adminBar');
  const superAdminBar=document.getElementById('superAdminBar');
  document.body.classList.toggle('superadmin-active',isSuperAdmin);
  if(btnTeacher) btnTeacher.textContent=currentAuthSession?.authenticated?(teacherName?'Mi perfil':'Mi cuenta'):'Acceso personal';
  if(btnAdmin){
    btnAdmin.style.display=canAdmin?'':'none';
    btnAdmin.classList.toggle('on',isAdmin);
    btnAdmin.textContent=isAdmin?(teacherName?'Mi perfil':'Salir de Jefatura'):'Jefatura';
  }
  if(btnSuperAdmin){
    btnSuperAdmin.style.display=(canSuperAdmin&&(SUPERADMIN_ENABLED||superAdminAccessDiscovered))?'':'none';
    btnSuperAdmin.classList.toggle('on',isSuperAdmin);
    btnSuperAdmin.textContent=isSuperAdmin?'Salir de administración técnica':'Administración técnica';
  }
  if(btnLogout) btnLogout.style.display=currentAuthSession?.authenticated?'':'none';
  if(adminBar) adminBar.classList.toggle('show',isAdmin);
  if(superAdminBar) superAdminBar.classList.toggle('show',isSuperAdmin);
  syncAppModeClasses();
  updateAdminControls();
  renderAdminWorkspace();
  renderSuperAdminMonitor();
  if(isSuperAdmin){
    refreshSuperAdminOps(false);
    refreshSuperAdminUsers();
  }
}
function setSuperAdminHint(message,type){
  const hint=document.getElementById('superAdminHint');
  if(!hint) return;
  hint.textContent=message||'';
  hint.classList.remove('is-success','is-error','is-info');
  if(type) hint.classList.add(`is-${type}`);
}
async function loadAuthSession(){
  if(!storage.hasBackend()){
    currentAuthSession=null;
    canAdmin=false;
    canSuperAdmin=false;
    clearSuperAdminDiscovery();
    isAdmin=false;
    isSuperAdmin=false;
    refreshAccessUi();
    return;
  }
  try{
    const session=await storage.fetchAuthSession();
    currentAuthSession=session?.authenticated&&session?.userId?session:null;
    const roles=Array.isArray(currentAuthSession?.roles)?currentAuthSession.roles:[];
    canAdmin=roles.includes('admin');
    canSuperAdmin=roles.includes('superadmin');
    restoreSuperAdminDiscovery();
    isAdmin=false;
    isSuperAdmin=SUPERADMIN_ENABLED&&canSuperAdmin;
    teacherName='';
    authenticatedTeacherSourceCode='';
    teacherIdentityConfirmedFor='';
    if(roles.includes('teacher')) await loadAuthenticatedTeacherIdentity(true);
    refreshAccessUi();
    renderTable();
  }catch(error){
    console.warn('Session load failed',error);
    currentAuthSession=null;
    canAdmin=false;
    canSuperAdmin=false;
    clearSuperAdminDiscovery();
    isAdmin=false;
    isSuperAdmin=false;
    refreshAccessUi();
    renderTable();
  }
}
async function loadAuthenticatedTeacherIdentity(silent=false){
  teacherName='';
  authenticatedTeacherSourceCode='';
  teacherIdentityConfirmedFor='';
  if(!currentAuthSession?.authenticated||!currentAuthSession.userId) return false;
  try{
    const result=await storage.fetchOwnSchedule();
    const profesor=getProfesorBySourceCode(result?.teacher?.sourceCode);
    if(!profesor) throw new Error('El perfil autenticado no aparece en el dataset horario activo.');
    authenticatedTeacherSourceCode=cleanText(result.teacher.sourceCode).toUpperCase();
    teacherName=profesor.nombre;
    teacherIdentityConfirmedFor=teacherName;
    syncTeacherIdentity();
    return true;
  }catch(error){
    if(!silent) showToast(error?.status===404?'Tu cuenta no tiene un perfil docente activo.':'No se pudo cargar tu perfil docente.','error');
    return false;
  }
}
async function logoutCurrentRole(){
  clearSuperAdminDiscovery();
  clearTeacherProvisioningState();
  if(storage.hasBackend()){
    try{
      await storage.logoutRole();
    }catch(error){
      console.warn('Logout failed',error);
    }
  }
  closeTeacherPanel();
  closeTeacherAccess();
  currentAuthSession=null;
  canAdmin=false;
  canSuperAdmin=false;
  isAdmin=false;
  isSuperAdmin=false;
  teacherName='';
  authenticatedTeacherSourceCode='';
  teacherIdentityConfirmedFor='';
  document.getElementById('teacherBar')?.classList.remove('show');
  backendHydrated=false;
  if(SUPERADMIN_ENABLED){
    window.location.href=getMainRouteUrl();
    return;
  }
  refreshAccessUi();
  renderTable();
  showToast('Sesi\u00f3n cerrada.','info');
}
async function ensureSuperAdminRouteAccess(){
  if(!SUPERADMIN_ENABLED||superAdminRoutePrompted) return true;
  superAdminRoutePrompted=true;
  if(canSuperAdmin){isSuperAdmin=true;refreshAccessUi();return true;}
  if(!currentAuthSession?.authenticated){
    openTeacherAccess();
    showToast('Accede con una cuenta Superadmin.','info');
  }else{
    showToast('Esta cuenta no tiene permiso de Superadmin.','error');
  }
  return true;
}
async function initializeApp(){
  await loadAuthSession();
  if(!await ensureSuperAdminRouteAccess()) return;
  await hydrateGroupStates();
  await hydrateTeacherSubstitutions();
  await hydrateTeacherPracticasGuardias();
  await hydrateTeacherFutureAbsences();
  await hydrateAlumnosFueraAula();
  await hydrateFromBackend();
}
async function changeRolePasswordFlow(role){
  const roleLabel=role==='superadmin'?'Administración técnica':'Jefatura';
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
    saveTs.textContent='Vista de planificación. La edición sigue reservada a la semana actual.';
  }
}
function renderPills(){
  document.getElementById('dNombre').textContent=DIAS[day];
  const appMobileDay=document.getElementById('appMobileDay');
  if(appMobileDay) appMobileDay.textContent=`Guardias - ${DIAS[day]}`;
  document.getElementById('dayPills').innerHTML=DIAS.map((d,i)=>`<button class="day-pill${i===day?' active':''}" onclick="setDay(${i})">${d}</button>`).join('');
  renderWeekLabel();
}
function renderGuardiaBoard(){
  const grid=document.getElementById('guardiaGrid');
  const cards=[];
  let firstMobileCard=true;
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const coverageCounter=buildGuardiaCoverageCounter({rowsSource});

  for(const hora of ALL_HORAS){
    if(PATIO_RENDER_HORAS.has(hora)){
      cards.push(renderPatioCard(hora));
      firstMobileCard=false;
      continue;
    }

    if(HORAS_PATIO.has(hora)) continue;

    let nombres='';
    let teacherAssignedHere=false;
    let visibleTeacherCount=0;

    if(storage.hasBackend()){
      const effectiveSlot=getEffectiveGuardiaSlot(day,hora,weekOffset);

      if(!effectiveSlot){
        nombres='<span class="sin-asignar">Estado operativo no disponible</span>';
      }else{
        const assignments=buildAuthoritativeSlotAssignments(effectiveSlot);
        visibleTeacherCount=Number(effectiveSlot?.diagnostics?.eligibleGuards)||0;

        teacherAssignedHere=!!(
          teacherName&&assignments.some(item=>
            cleanText(item.teacher)&&
            item.teacher!=='Sin cubrir'&&
            sameNormalizedText(item.teacher,teacherName)
          )
        );

        nombres=assignments.map(item=>{
          if(item.teacher==='Sin cubrir'){
            return `<span class="sin-asignar">Sin cubrir · ${escapeHtml(item.location)}</span>`;
          }

          const canonical=resolveTeacherCanonicalName(item.teacher)||item.teacher;
          const coverageCount=coverageCounter[canonical]||0;

          const isBiblioteca=item.location==='Biblioteca';
          const isBanos=item.location==='Baños';
          const isFree=item.location==='Guardia disponible';
          const isCoverage=!isBiblioteca&&!isBanos&&!isFree;

          const classes=[
            'guardia-mini',
            isCoverage?'guardia-mini-assigned':'',
            teacherName&&sameNormalizedText(item.teacher,teacherName)
              ?'guardia-mini-current'
              :'',
            isBiblioteca?'guardia-mini-biblio':'',
            isBanos?'guardia-mini-banos':''
          ].filter(Boolean).join(' ');

          const suffix=isBiblioteca
            ?' · Biblioteca'
            :(isBanos
              ?' · Baños'
              :(isFree?' · Disponible':` · ${item.location}`));

          const title=[
            item.teacher,
            item.meta,
            (canAdmin||canSuperAdmin)
              ?`${coverageCount} ${coverageCount===1?'guardia':'guardias'} acumuladas`
              :''
          ].filter(Boolean).join(' · ');

          const loadBadge=(canAdmin||canSuperAdmin)
            ?`<small class="guardia-mini-count">Carga: ${coverageCount}</small>`
            :'';

          return `<span class="${classes}" title="${escapeHtml(title)}">${escapeHtml(item.teacher)}${escapeHtml(suffix)}${loadBadge}</span>`;
        }).join('')||'<span class="sin-asignar">Sin profesorado de guardia en este tramo</span>';
      }
    }else{
      const ordenHora=getOrdenHora(day,hora);
      const profes=ordenHora.map(item=>item.nombre);
      visibleTeacherCount=profes.length;

      const {biblioteca,banos}=getEffectiveSpecialAssignments(
        day,
        hora,
        rowsSource
      );

      teacherAssignedHere=!!(
        teacherName&&
        rowsSource.some(row=>
          row.dia===day&&
          row.hora===hora&&
          sameNormalizedText(row.guardia,teacherName)
        )
      );

      const asignados=new Set(
        rowsSource
          .filter(g=>g.dia===day&&g.hora===hora&&cleanText(g.guardia))
          .map(g=>cleanText(g.guardia))
      );

      nombres=profes.map(nombre=>{
        const coverageCount=coverageCounter[nombre]||0;

        const classes=[
          'guardia-mini',
          asignados.has(nombre)?'guardia-mini-assigned':'',
          teacherAssignedHere&&sameNormalizedText(nombre,teacherName)
            ?'guardia-mini-current'
            :'',
          nombre===biblioteca?'guardia-mini-biblio':'',
          nombre===banos?'guardia-mini-banos':''
        ].filter(Boolean).join(' ');

        const suffix=nombre===biblioteca
          ?' · Biblioteca'
          :(nombre===banos?' · Baños':'');

        const counterLabel=(canAdmin||canSuperAdmin)
          ?` · ${coverageCount} ${coverageCount===1?'guardia':'guardias'}`
          :'';

        const loadBadge=(canAdmin||canSuperAdmin)
          ?`<small class="guardia-mini-count">Carga: ${coverageCount}</small>`
          :'';

        return `<span class="${classes}" title="${escapeHtml(`${getVisibleTeacherName(nombre)}${counterLabel}`)}">${escapeHtml(getVisibleTeacherName(nombre))}${suffix}${loadBadge}</span>`;
      }).join('')||'<span class="sin-asignar">Sin profesorado asignado</span>';
    }

    const cardClasses=['guardia-card'];
    if(firstMobileCard) cardClasses.push('is-open');
    if(teacherAssignedHere) cardClasses.push('guardia-card-current');

    cards.push(`<article class="${cardClasses.join(' ')}">
      <button class="guardia-card-toggle" type="button" onclick="toggleGuardiaCard(this)">
        <span class="guardia-card-head">
          <span class="guardia-num">${HORA_MAP[hora].label} hora</span>
          <span class="guardia-count">${visibleTeacherCount} profesores</span>
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
async function setDay(i){
  day=i;
  renderPills();
  renderGuardiaBoard();
  renderTable();
  await refreshEffectiveGuardiaDayState(day,weekOffset,{render:true});
}
function isMobileAbsenceLayout(){
  return window.innerWidth<=900;
}
function getAbsenceSessionDisplay(row){
  const session=resolveTeacherSession(row.ausente,row.dia,row.hora);
  return {
    grupo:cleanText(session?.grupo),
    aula:cleanText(session?.aula)||'Aula no indicada',
    materia:cleanText(session?.materia)
  };
}
function getAbsenceCoverageDisplay(row){
  const session=getAbsenceSessionDisplay(row);
  const guardia=getVisibleTeacherName(row.guardia||'');
  const canonicalAbsent=typeof resolveTeacherCanonicalName==='function'?resolveTeacherCanonicalName(row.ausente||''):String(row.ausente||'');
  const substitution=typeof teacherSubstitutionDetails!=='undefined'?(teacherSubstitutionDetails[canonicalAbsent]||null):null;
  return {
    ...session,
    ausente:substitution?.substitute?.displayName||getVisibleTeacherName(row.ausente||''),
    titular:substitution?.titular?.displayName||'',
    substitution,
    guardia,
    estado:guardia?'Cubierta':'Pendiente'
  };
}
function buildTvAbsenceAssignment(row){
  const display=getAbsenceCoverageDisplay(row);
  return {
    teacher:display.guardia||'Sin cubrir',
    location:[display.grupo?`Grupo ${display.grupo}`:'Grupo no indicado',display.aula==='Aula no indicada'?display.aula:`Aula ${display.aula}`].join(' · '),
    meta:[display.estado,display.ausente?`Ausente: ${display.ausente}`:'',display.titular?`Titular: ${display.titular}`:'',display.materia].filter(Boolean).join(' · '),
    tone:'general'
  };
}
function renderAbsenceSessionDetails(model){
  const substitution=model.substitution?`<span class="cell-meta">Sustitución activa: ${escapeHtml(model.substitution.substitute?.displayName||'')} por ${escapeHtml(model.substitution.titular?.displayName||'titular')}</span>`:'';
  return `<div class="guardia-slot"><span class="aula-tag">${escapeHtml(model.grupo?`Grupo ${model.grupo}`:'Grupo no indicado')}</span><span class="aula-tag">${escapeHtml(model.aula==='Aula no indicada'?model.aula:`Aula ${model.aula}`)}</span></div>${model.materia?`<span class="cell-meta">${escapeHtml(model.materia)}</span>`:''}${substitution}`;
}
function buildAbsenceDisplayModel(g,rowsSource){
  const h=HORA_MAP[g.hora]||{label:g.hora+'a',rango:''};
  const cub=g.guardia&&g.guardia.trim();
  const needsCoverage=rowNeedsCoverage(g);
  const sugerido=needsCoverage?getOperationalCoverageName(g,rowsSource):'';
  const faenaInfo=resolveFaena(g);
  const {grupo,aula,materia,substitution}=getAbsenceCoverageDisplay(g);
  const ausenteNombre=substitution?.substitute?.displayName||getVisibleTeacherName(g.ausente);
  const guardiaNombre=sugerido?getVisibleTeacherName(sugerido):'';
  const ausenteMood=getTeacherMoodForToday(g.ausente);
  const guardiaMood=sugerido?getTeacherMoodForToday(sugerido):null;
  const guardiaEstado=!needsCoverage?'No requiere cobertura':(g.futurePlanned?(g.futureStatus==='approved'||g.futureStatus==='applied'?(cub?'Guardia planificada':'Cobertura prevista'):'Pendiente de validar'):(sugerido?(cub?'':'Guardia prevista'):'Sin cobertura'));
  const guardiaBadgeClass=g.futurePlanned
    ?(g.futureStatus==='approved'||g.futureStatus==='applied'?'b-ok status-pill':'status-pill teacher-duty-badge')
    :(!needsCoverage?'b-ok status-pill':(sugerido?(cub?'b-ok status-pill':'status-pill teacher-duty-badge'):'b-nok status-pill'));
  const guardiaChipClass=sugerido?`${cub?'guardia-chip guardia-chip-assigned chip-strong':'guardia-chip guardia-chip-suggested chip-strong'}${guardiaMood?` chip-mood chip-mood-${guardiaMood.tone}`:''}`:'';
  const ausenteChipClass=`chip chip-absence chip-strong${ausenteMood?` chip-mood chip-mood-${ausenteMood.tone}`:''}`;
  const statusText=g.futurePlanned
    ?(g.futureStatus==='approved'?'Validada':g.futureStatus==='applied'?'Aplicada':g.futureStatus==='pending'?'Pendiente':'Planificada')
    :(!needsCoverage?'No requiere cobertura':(sugerido?(cub?'Cubierta':'Pendiente de confirmar'):'Sin cubrir'));
  const planningMeta=g.futurePlanned?`<span class="badge future-plan-badge ${g.futureStatus==='pending'?'future-plan-badge-pending':'future-plan-badge-approved'}">${g.futureStatus==='pending'?'Ausencia futura pendiente':'Ausencia futura validada'}</span>`:'';
  const rowClasses=[
    g.futurePlanned?'future-planned-row':'',
    (needsCoverage&&!sugerido)?'admin-row-urgent':(!faenaInfo.faena||g.futureStatus==='pending')?'admin-row-warning':''
  ].filter(Boolean).join(' ');
  return {
    h,
    cub,
    needsCoverage,
    sugerido,
    faenaInfo,
    aula,
    grupo,
    materia,
    substitution,
    ausenteNombre,
    guardiaNombre,
    ausenteMood,
    guardiaMood,
    guardiaEstado,
    guardiaBadgeClass,
    guardiaChipClass,
    ausenteChipClass,
    statusText,
    planningMeta,
    rowClasses
  };
}
function renderMobileAbsenceGroups(filteredRows,rows,editableWeek){
  if(!filteredRows.length){
    const emptyMessage=rows.length
      ? 'No hay ausencias que coincidan con el filtro actual.'
      : `No hay ausencias registradas para ${editableWeek?'este día':'esta vista futura'}.`;
    return `<tr class="empty-row"><td colspan="7">${emptyMessage}</td></tr>`;
  }
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const groupedRows=new Map();
  filteredRows
    .slice()
    .sort((a,b)=>a.hora-b.hora||String(getVisibleTeacherName(a.ausente)).localeCompare(String(getVisibleTeacherName(b.ausente)),'es'))
    .forEach(row=>{
      const key=String(row.hora);
      if(!groupedRows.has(key)){
        const horaInfo=HORA_MAP[row.hora]||{label:`${row.hora}a`,rango:''};
        groupedRows.set(key,{
          hora:Number(row.hora),
          horaInfo,
          rows:[]
        });
      }
      groupedRows.get(key).rows.push(row);
    });
  return [...groupedRows.values()].map((group,index)=>{
    const summaryParts=[
      `${group.rows.length} ${group.rows.length===1?'falta':'faltas'}`
    ];
    const uncoveredCount=group.rows.filter(row=>{
      const model=buildAbsenceDisplayModel(row,rowsSource);
      return model.needsCoverage&&!model.sugerido;
    }).length;
    if(uncoveredCount) summaryParts.push(`${uncoveredCount} sin cubrir`);
    const itemMarkup=group.rows.map(row=>{
      const model=buildAbsenceDisplayModel(row,rowsSource);
      const numericId=Number(row.id);
      const canEditRow=isAdmin&&editableWeek&&Number.isInteger(numericId);
      const taskMarkup=row.futurePlanned
        ?`<span class="badge ${row.futureStatus==='pending'?'teacher-duty-badge':'b-ok'}">${row.futureStatus==='pending'?'Pendiente':'Planificada'}</span>`
        :(model.faenaInfo.faena
          ?`<div class="faena-status"><span class="badge b-ok">Con tarea</span>${model.faenaInfo.obs?`<div class="mobile-absence-task-note">${escapeHtml(model.faenaInfo.obs)}</div>`:''}</div>`
          :'<span class="badge b-nok">Sin tarea</span>');
      const coverageMarkup=model.sugerido
        ?`<div class="chip ${model.guardiaChipClass}"><div class="avatar av-yellow">${initials(model.guardiaNombre)}</div>${escapeHtml(model.guardiaNombre)}${model.guardiaMood?`<span class="chip-mood-tag" title="${escapeHtml(model.guardiaMood.label)}">${model.guardiaMood.emoji}</span>`:''}</div>`
        :`<span class="sin-asignar">${model.needsCoverage?'Sin asignar':'No aplica'}</span>`;
      const actionMarkup=canEditRow
        ?`<div class="mobile-absence-actions"><button class="btn-edit" type="button" onclick="openModal(${numericId})">Editar</button><label class="row-selector"><input type="checkbox" ${selectedAbsenceIds.has(numericId)?'checked':''} onchange="toggleAbsenceSelection(${numericId}, this.checked)"><span>Seleccionar</span></label></div>`
        :'';
      return `<article class="mobile-absence-item ${model.rowClasses}">
        <div class="mobile-absence-item-head">
          <div class="mobile-absence-item-hour">
            <div class="${model.ausenteChipClass}"><div class="avatar av-red">${initials(model.ausenteNombre)}</div>${escapeHtml(model.ausenteNombre)}${model.ausenteMood?`<span class="chip-mood-tag" title="${escapeHtml(model.ausenteMood.label)}">${model.ausenteMood.emoji}</span>`:''}</div>
            ${row.futurePlanned?`<span class="mobile-absence-item-range">Planificada para ${escapeHtml(formatFutureAbsenceDateLabel(row.futureDate))}</span>`:''}
          </div>
          <span class="badge ${model.guardiaBadgeClass}">${model.statusText}</span>
        </div>
        <div class="mobile-absence-item-grid">
          <div class="mobile-absence-detail">
            <span class="mobile-absence-detail-label">Cobertura</span>
            ${coverageMarkup}
            <span class="mobile-absence-detail-meta">${escapeHtml(model.guardiaEstado)}</span>
          </div>
          <div class="mobile-absence-detail">
            <span class="mobile-absence-detail-label">Grupo y aula</span>
            ${renderAbsenceSessionDetails(model)}
          </div>
          <div class="mobile-absence-detail">
            <span class="mobile-absence-detail-label">Tarea</span>
            ${taskMarkup}
          </div>
        </div>
        ${actionMarkup}
      </article>`;
    }).join('');
    return `<tr class="mobile-group-row">
      <td colspan="7">
        <details class="mobile-absence-group"${index===0?' open':''}>
          <summary class="mobile-absence-summary">
            <div class="mobile-absence-summary-main">
              <div class="mobile-absence-hour-badge">${escapeHtml(group.horaInfo.label)} hora${group.horaInfo.rango?` · ${escapeHtml(group.horaInfo.rango.replace('-', ' - '))}`:''}</div>
              <div class="mobile-absence-summary-meta">${summaryParts.join(' · ')}</div>
            </div>
            <div class="mobile-absence-hours">${group.rows.map(row=>`<span class="mobile-absence-hour-pill">${escapeHtml(getVisibleTeacherName(row.ausente))}</span>`).join('')}</div>
          </summary>
          <div class="mobile-absence-group-body">
            ${itemMarkup}
          </div>
        </details>
      </td>
    </tr>`;
  }).join('');
}
async function changeWeekOffset(delta){
  const openPanels=getOpenWorkflowOverlayIds();
  if(openPanels.length){
    const confirmed=await askConfirm(
      'Cambiar de semana',
      'Tienes paneles o formularios abiertos. Al cambiar de semana se cerrarán y verás la nueva vista.',
      'Cambiar de semana'
    );
    if(!confirmed) return;
    closeWorkflowOverlays(openPanels);
  }
  weekOffset=Math.max(-1,Math.min(3,weekOffset+delta));
  renderPills();
  updateAdminControls();
  renderGuardiaBoard();
  renderTable();
  await refreshEffectiveGuardiaDayState(day,weekOffset,{render:true});
}
async function sortearGuardiasDia(){
  if(!isAdmin||!isCurrentWeekOffset(weekOffset)){
    showToast('Solo puedes sortear la semana actual desde Jefatura.','info');
    return;
  }
  const undoState=buildUndoState(day,{includeOrden:true});
  const confirmed=await askConfirm(
    'Confirmar sorteo',
    `Se generará un nuevo orden para ${DIAS[day]}. El orden anterior quedará guardado en historial para poder deshacerlo.`,
    'Sortear y guardar'
  );
  if(!confirmed) return;
  for(const hora of ALL_HORAS){
    ordenGuardias[day][hora]=makeOrdenHora(day,hora);
  }
  persistOrden(ordenGuardias);
  addHistoryEntry('Sorteo del día',`Nuevo orden generado para ${DIAS[day]}.`,'edit',{undoState});
  renderHistoryList();
  renderGuardiaBoard();
  renderTable();
}
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
    const sugerido=rowNeedsCoverage(g)
      ?(getOperationalCoverageName(g,data)||'Sin asignar')
      :'No requiere cobertura';

    const effectiveSlot=storage.hasBackend()
      ?getEffectiveGuardiaSlot(day,g.hora,weekOffset)
      :null;

    const effectiveSpecial=storage.hasBackend()
      ?null
      :getEffectiveSpecialAssignments(day,g.hora,data);

    const biblioteca=storage.hasBackend()
      ?(cleanText(effectiveSlot?.biblioteca?.teacher)||'Sin asignar')
      :(effectiveSpecial?.biblioteca||'Sin asignar');

    const banos=storage.hasBackend()
      ?(cleanText(effectiveSlot?.banos?.teacher)||'Sin asignar')
      :(effectiveSpecial?.banos||'Sin asignar');
    const faenaInfo=resolveFaena(g);
    const aula=resolveAulaRegistro(g)||'-';
    return [
      `${h.rango.replace('-', ' - ')}`,
      `Ausente: ${getVisibleTeacherName(g.ausente)}`,
      `Guardia: ${getVisibleTeacherName(sugerido)}`,
      `Biblioteca: ${biblioteca}`,
      `Ba\u00f1os: ${banos}`,
      `Aula: ${aula}`,
      `Tarea: ${faenaInfo.faena?'S\u00ed':'No'}`,
      `${faenaInfo.obs?`Tarea: ${faenaInfo.obs}`:'Tarea: -'}`
    ].join('\n');
  }).join('\n\n');
  return cabecera.concat([cuerpo]).join('\n');
}
function buildDailyReportHtml(){
  const rows=getSelectedRowsForDay(day).sort((a,b)=>a.hora-b.hora||String(a.ausente||'').localeCompare(String(b.ausente||''),'es'));
  const fecha=formatNowParts().date.toLocaleDateString('es-ES');
  const totalAusencias=rows.length;
  const rowsNeedingCoverage=rows.filter(row=>rowNeedsCoverage(row));
  const totalCubiertas=rowsNeedingCoverage.filter(g=>cleanText(g.guardia)).length;
  const tableRows=Array.from({length:9},(_,index)=>index+1).map(hora=>{
    const hourRows=rows.filter(g=>Number(g.hora)===hora);
    const h=HORA_MAP[hora]||{label:`${hora}a`,rango:''};
    if(!hourRows.length){
      return `<tr class="hour-empty">
        <td class="hour-cell"><strong>${escapeHtml(h.label)} hora</strong><span>${escapeHtml((h.rango||'').replace('-', ' - '))}</span></td>
        <td colspan="5">Sin ausencias registradas</td>
      </tr>`;
    }
    return hourRows.map((g,index)=>{
      const guardia=cleanText(g.guardia);
      const needsCoverage=rowNeedsCoverage(g);
      const estado=!needsCoverage?'No requiere cobertura':(guardia?'Cubierta':'Sin asignar');
      const estadoClass=!needsCoverage?'state-neutral':(guardia?'state-ok':'state-bad');
      const hCell=index===0
        ?`<td class="hour-cell" rowspan="${hourRows.length}"><strong>${escapeHtml(h.label)} hora</strong><span>${escapeHtml((h.rango||'').replace('-', ' - '))}</span></td>`
        :'';
      return `<tr>
        ${hCell}
        <td>${escapeHtml(getVisibleTeacherName(g.ausente))}</td>
        <td>${escapeHtml(resolveAulaRegistro(g)||'Sin aula')}</td>
        <td>${escapeHtml(needsCoverage?(guardia?getVisibleTeacherName(guardia):'Sin asignar'):'No aplica')}</td>
        <td><span class="state ${estadoClass}">${escapeHtml(estado)}</span></td>
        <td>${escapeHtml(resolveFaena(g).faena?'Con tarea':'Sin tarea')}</td>
      </tr>`;
    }).join('');
  }).join('');
  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Horario diario de guardias</title>
    <style>
      :root{color-scheme:light}
      *{box-sizing:border-box}
      @page{size:A3 landscape;margin:12mm}
      body{font-family:Arial,sans-serif;color:#111827;margin:0;background:#fff}
      .sheet{width:100%;padding:18px 20px}
      .topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:14px;border-bottom:2px solid #111827;padding-bottom:12px}
      .title-kicker{font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px}
      h1{margin:0;font-size:27px;line-height:1.1}
      .subtitle{font-size:13px;color:#475569;margin-top:5px}
      .summary{display:flex;gap:10px;align-items:center;font-size:13px;font-weight:700}
      .summary span{border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;background:#f8fafc}
      table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}
      th{background:#1f2937;color:#fff;text-align:left;font-size:12px;text-transform:uppercase;padding:9px 10px;border:1px solid #111827}
      td{padding:9px 10px;border:1px solid #cbd5e1;vertical-align:middle;font-weight:600}
      tbody tr:nth-child(even) td{background:#f8fafc}
      .hour-cell{width:13%;background:#eef2f7!important}
      .hour-cell strong{display:block;font-size:16px;margin-bottom:4px}
      .hour-cell span{display:block;font-size:12px;color:#475569;font-weight:700}
      .col-ausente{width:23%}.col-aula{width:13%}.col-guardia{width:23%}.col-estado{width:13%}.col-tarea{width:15%}
      .state{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800;white-space:nowrap}
      .state-ok{background:#dcfce7;color:#166534;border:1px solid #86efac}
      .state-bad{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
      .state-neutral{background:#e2e8f0;color:#334155;border:1px solid #cbd5e1}
      .hour-empty td{color:#64748b;font-weight:600}
      @media print{.sheet{padding:0}.topbar{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="topbar">
        <div>
          <div class="title-kicker">IES Alcalans · Guardias</div>
          <h1>Horario de guardias · ${escapeHtml(DIAS[day])}</h1>
          <div class="subtitle">Fecha de generación: ${escapeHtml(fecha)}</div>
        </div>
        <div class="summary">
          <span>Ausencias: ${totalAusencias}</span>
          <span>Cubiertas: ${totalCubiertas}/${rowsNeedingCoverage.length}</span>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th class="col-ausente">Profesor ausente</th>
            <th class="col-aula">Aula</th>
            <th class="col-guardia">Profesor de guardia asignado</th>
            <th class="col-estado">Estado</th>
            <th class="col-tarea">Tarea</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
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
      return `<section class="day-block"><div class="day-head"><h2>${escapeHtml(diaNombre)}</h2><span class="day-count">Sin incidencias</span></div><p class="empty empty-left">No hay ausencias registradas para este día.</p></section>`;
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
          <div class="item-row"><span class="item-k">Horas</span><span class="item-v">${escapeHtml(item.horas.map(hora=>`${formatHoraLabel(hora)} (${HORA_MAP[hora]?.rango||''})`).join(' · '))}</span></div>
          <div class="item-row"><span class="item-k">Cobertura</span><span class="item-v">${escapeHtml(item.guardias.length?item.guardias.join(' · '):'Sin asignar')}</span></div>
          <div class="item-row"><span class="item-k">Aula</span><span class="item-v">${escapeHtml(item.aulas.length?item.aulas.join(' · '):'Sin aula')}</span></div>
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
          <div class="hero-kicker">IES Alcalans · Guardias</div>
          <h1>Informe semanal de guardias</h1>
          <div class="hero-meta">Fecha de generación: ${escapeHtml(fecha)}</div>
        </div>
      </section>
      <section class="summary">
        <article class="summary-card"><span class="summary-k">Ausencias</span><span class="summary-v">${totalAusencias}</span><span class="summary-note">Registros semanales</span></article>
        <article class="summary-card"><span class="summary-k">Coberturas</span><span class="summary-v">${totalCoberturas}</span><span class="summary-note">Guardias asignadas</span></article>
        <article class="summary-card"><span class="summary-k">Con tarea</span><span class="summary-v">${totalConTarea}</span><span class="summary-note">Tarea disponible</span></article>
        <article class="summary-card"><span class="summary-k">Días activos</span><span class="summary-v">${diasConIncidencia}</span><span class="summary-note">Con incidencias registradas</span></article>
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
  openPdfReport(`${storage.backendBaseUrl}/report/daily.pdf?day=${day}`,'Informe diario');
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
  openPdfReport(`${storage.backendBaseUrl}/report/weekly.pdf`,'Informe semanal');
}
async function openPdfReport(url,title){
  const reportWindow=window.open('','_blank','width=980,height=720');
  if(reportWindow){
    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;margin:32px;color:#111827"><h1 style="font-size:20px;margin:0 0 8px">Generando PDF...</h1><p style="margin:0;color:#475569">Preparando ${escapeHtml(title.toLowerCase())}.</p></body></html>`);
    reportWindow.document.close();
  }

  try{
    const response=await fetch(url,{credentials:'include'});
    const contentType=response.headers.get('content-type')||'';
    if(!response.ok||!contentType.includes('application/pdf')){
      let detail='';
      try{
        detail=contentType.includes('application/json')
          ?(await response.json())?.error||''
          :await response.text();
      }catch(_error){}
      throw new Error(detail||`El servidor ha respondido ${response.status}.`);
    }

    const blob=await response.blob();
    const blobUrl=URL.createObjectURL(blob);
    if(reportWindow){
      reportWindow.location.href=blobUrl;
      window.setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
    }else{
      const link=document.createElement('a');
      link.href=blobUrl;
      link.target='_blank';
      link.rel='noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
    }
  }catch(error){
    const message=error?.message||'No se pudo generar el PDF.';
    if(reportWindow&&!reportWindow.closed){
      reportWindow.document.open();
      reportWindow.document.write(`<!doctype html><html><head><title>Error PDF</title></head><body style="font-family:Arial,sans-serif;margin:32px;color:#111827"><h1 style="font-size:20px;margin:0 0 8px">No se pudo generar el PDF</h1><p style="margin:0;color:#475569">${escapeHtml(message)}</p></body></html>`);
      reportWindow.document.close();
    }
    showToast(message,'error');
  }
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
function triggerAnnualXmlImport(){
  if(!isAdmin) return;
  const input=document.getElementById('annualImportXmlInput');
  if(!input) return;
  input.value='';
  input.click();
}
async function importAnnualXmlFile(file){
  if(!file||!isAdmin||!storage.hasBackend()) return;
  const confirmed=await askConfirm(
    'Importar XML anual',
    'El XML se validará y guardará como un nuevo dataset canónico en SQLite. No se activará automáticamente.',
    'Importar XML'
  );
  if(!confirmed) return;
  const academicYear=window.prompt('Curso académico obligatorio (AAAA/AA)', '2026/27');
  if(!academicYear) return;
  const saveTs=document.getElementById('saveTs');
  const previousStatus=saveTs?.textContent||'';
  try{
    if(saveTs) saveTs.textContent=`Importando ${file.name}...`;
    const xmlBase64=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
      reader.onerror=()=>reject(reader.error||new Error('No se pudo leer el XML.'));
      reader.readAsDataURL(file);
    });
    const result=await storage.importAnnualXml(file.name,xmlBase64,academicYear);
    const summary=`XML validado en SQLite · ${result?.teachers ?? 0} profesores · ${result?.sessions ?? 0} sesiones · dataset ${result?.datasetId || '-'}`;
    if(saveTs) saveTs.textContent=summary;
    showToast('Dataset validado. Debe activarlo una cuenta superadmin para usarlo.','success');
  }catch(error){
    console.warn('Annual XML import failed',error);
    if(saveTs) saveTs.textContent=previousStatus||'No se pudo importar el XML anual.';
    showToast('No se pudo importar el XML anual.','error');
  }
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
    renderAdminWorkspace();
    return;
  }
  historyList.innerHTML=visibles.map(entry=>`<article class="history-item">
    <div class="history-item-head">
      <div class="history-item-title">${escapeHtml(entry.title||'Cambio')}</div>
      <div class="history-item-time">${escapeHtml(formatHistoryTimestamp(entry.ts))}</div>
    </div>
    <div class="history-item-body">${escapeHtml(entry.detail||'')}</div>
  </article>`).join('');
  renderAdminWorkspace();
}
function setHistoryFilter(filter){
  historyFilter=filter||'all';
  renderHistoryList();
}
function restoreUndoState(state){
  if(!state) return false;
  data=normalizeStoredRows(cloneJson(state.data||[]));
  if(state.orden){
    ordenGuardias=ensureOrden(cloneJson(state.orden));
    persistOrden(ordenGuardias);
  }
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
  const now=new Date();
  document.getElementById('clock').textContent=now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  const tvHeaderDay=document.getElementById('tvHeaderDay');
  if(tvHeaderDay){
    const weekday=now.getDay();
    tvHeaderDay.textContent=weekday>=1&&weekday<=5?DIAS[weekday-1]:'Hoy';
  }
  syncTvExitLink();
  renderTvHeaderCorridor();
  renderTvPanel();
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
  return teacherPracticasGuardiasTramos.filter(row=>sameNormalizedText(row.profesor,nombre)).length;
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
    .filter(row=>sameNormalizedText(row.profesor,nombre))
    .sort((a,b)=>a.dia-b.dia||a.hora-b.hora);
}
function renderSubstitutionList(){
  const list=document.getElementById('substitutionList');
  if(!list) return;
  const teachers=getFilteredSubstitutionTeachers();
  if(!teachers.length){
    list.innerHTML='<div class="history-empty">No hay docentes que coincidan con la b\u00fasqueda.</div>';
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
    panel.innerHTML='<div class="history-empty">Selecciona un docente y pulsa en "Configurar horas" para habilitar tramos concretos.</div>';
    return;
  }
  const manualSet=getTeacherPracticasGuardiasTramosSet();
  const rows=[];
  for(let dia=0;dia<5;dia++){
    const chips=[];
    for(const hora of ALL_HORAS){
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
    ?manualSlots.map(row=>`${DIAS[row.dia]} ${formatHoraLabel(row.hora)}`).join(' · ')
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
async function assignTeacherSubstitution(nombre){
  await openStructuredSubstitutionModal();
}
async function clearTeacherSubstitution(nombre){
  await openStructuredSubstitutionModal();
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
  syncAdminState({manual:true,origin:'practicas-guardias',reason:'toggle-teacher'});
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
  syncAdminState({manual:true,origin:'practicas-guardias',reason:'toggle-slot'});
}
async function clearHistory(){
  if(!isAdmin) return;
  if(!await askConfirm('Borrar historial','Se eliminaran todas las entradas del historial de cambios.','Borrar')) return;
  historialCambios=[];
  persistHistorial(historialCambios);
  renderHistoryList();
  showToast('Historial borrado.','success');
  syncAdminState({manual:true,origin:'history',reason:'clear-history'});
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
  const saveTs=document.getElementById('saveTs');
  if(saveTs) saveTs.textContent='Deshecho - '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  showToast('\u00daltimo cambio deshecho.','success');
  await syncAdminStateConfirmed({origin:'history',reason:'undo-last-change'});
}
function getVisibleSelectableAbsenceRows(rows){
  if(!isAdmin||!isCurrentWeekOffset(weekOffset)) return [];
  return (rows||[]).filter(row=>Number.isInteger(Number(row?.id)));
}
function pruneSelectedAbsenceIds(validIds){
  const allowed=validIds instanceof Set ? validIds : new Set((validIds||[]).map(value=>Number(value)).filter(Number.isInteger));
  selectedAbsenceIds=new Set([...selectedAbsenceIds].filter(id=>allowed.has(id)));
}
function updateAbsenceBatchBar(filteredRows){
  const batchBar=document.getElementById('tableBatchBar');
  const selectAll=document.getElementById('batchSelectAll');
  const summary=document.getElementById('tableBatchSummary');
  const deleteButton=document.getElementById('btnDeleteSelectedAbsences');
  if(!batchBar||!selectAll||!summary||!deleteButton) return;
  const selectableRows=getVisibleSelectableAbsenceRows(filteredRows);
  const selectableIds=new Set(selectableRows.map(row=>Number(row.id)));
  pruneSelectedAbsenceIds(selectableIds);
  if(!selectableRows.length){
    batchBar.style.display='none';
    selectAll.checked=false;
    selectAll.indeterminate=false;
    summary.textContent='0 seleccionadas';
    deleteButton.disabled=true;
    return;
  }
  const selectedCount=selectableRows.filter(row=>selectedAbsenceIds.has(Number(row.id))).length;
  batchBar.style.display=selectedCount>1?'':'none';
  selectAll.checked=selectedCount>0&&selectedCount===selectableRows.length;
  selectAll.indeterminate=selectedCount>0&&selectedCount<selectableRows.length;
  summary.textContent=`${selectedCount} ${selectedCount===1?'seleccionada':'seleccionadas'} de ${selectableRows.length}`;
  deleteButton.disabled=selectedCount===0;
}
function toggleAbsenceSelection(id,checked){
  const numericId=Number(id);
  if(!Number.isInteger(numericId)) return;
  if(checked) selectedAbsenceIds.add(numericId);
  else selectedAbsenceIds.delete(numericId);
  updateAbsenceBatchBar(getAdminFilteredRows(getSelectedRowsForDay(day)));
}
function toggleSelectAllAbsences(checked){
  const selectableRows=getVisibleSelectableAbsenceRows(getAdminFilteredRows(getSelectedRowsForDay(day)));
  selectableRows.forEach(row=>{
    const numericId=Number(row.id);
    if(checked) selectedAbsenceIds.add(numericId);
    else selectedAbsenceIds.delete(numericId);
  });
  renderTable();
}
async function deleteSelectedAbsences(){
  const filteredRows=getAdminFilteredRows(getSelectedRowsForDay(day));
  const selectedRows=getVisibleSelectableAbsenceRows(filteredRows).filter(row=>selectedAbsenceIds.has(Number(row.id)));
  if(!selectedRows.length){
    showToast('Selecciona al menos una ausencia.','info');
    return;
  }
  const count=selectedRows.length;
  if(!await askConfirm('Eliminar ausencias',`Se eliminar${count===1?'á':'án'} ${count} ${count===1?'ausencia seleccionada':'ausencias seleccionadas'}.`,'Eliminar')) return;
  if(!await ensureBackendReadyForMutations()){
    showToast('Todavía no se ha cargado el estado guardado. Espera un momento y vuelve a intentarlo.','error');
    return;
  }
  const selectedIds=new Set(selectedRows.map(row=>Number(row.id)));
  const undoState=buildUndoState(day);
  selectedRows.forEach(row=>pendingDeletedAbsenceKeys.add(makeAbsenceSyncKey(row)));
  data=data.filter(row=>!selectedIds.has(Number(row.id)));
  const affectedHoursByDay=new Map();
  selectedRows.forEach(row=>{
    const diaKey=Number(row.dia);
    if(!affectedHoursByDay.has(diaKey)) affectedHoursByDay.set(diaKey,new Set());
    affectedHoursByDay.get(diaKey).add(Number(row.hora));
  });
  affectedHoursByDay.forEach((hours,diaKey)=>reassignGuardiasForDayHours(diaKey,[...hours]));
  persist(data);
  selectedAbsenceIds=new Set();
  if(editId&&selectedIds.has(Number(editId))) closeModal();
  const historyDetail=selectedRows.slice(0,3).map(row=>formatHistoryAbsence(row)).join(' | ');
  addHistoryEntry(
    count===1?'Ausencia eliminada':'Ausencias eliminadas',
    count===1?historyDetail:`${count} registros eliminados${historyDetail?`: ${historyDetail}${count>3?'...':''}`:''}`,
    'delete',
    {undoState}
  );
  renderTable();
  try{
    const syncResult=await syncAdminStateConfirmed({origin:'absence-batch-delete',reason:'delete-selected-absences'});
    if(syncResult?.syncError){
      showToast('Las ausencias se han eliminado en local, pero no se han podido sincronizar con el servidor.','error');
    }else if(syncResult?.partialAuxFailures?.length){
      showToast('Ausencias eliminadas y guardadas, pero ha fallado parte de la sincronización auxiliar.','info');
    }else if(syncResult?.queued){
      showToast('Ausencias eliminadas en local. Sincronización en cola.','info');
    }else{
      showToast(count===1?'Registro eliminado.':'Ausencias eliminadas.','success');
    }
  }catch(syncError){
    console.error('Absences deleted but sync trigger failed',syncError);
    showToast('Las ausencias se han eliminado en local, pero no se ha podido lanzar la sincronización.','error');
  }
}
window.toggleAbsenceSelection=toggleAbsenceSelection;
window.toggleSelectAllAbsences=toggleSelectAllAbsences;
window.deleteSelectedAbsences=deleteSelectedAbsences;
function renderTable(){
  const rows=getSelectedRowsForDay(day);
  const filteredRows=getAdminFilteredRows(rows);
  const editableWeek=isCurrentWeekOffset(weekOffset);
  const tb=document.getElementById('tbody');
  pruneSelectedAbsenceIds(new Set(getVisibleSelectableAbsenceRows(filteredRows).map(row=>Number(row.id))));
  if(isMobileAbsenceLayout()){
    tb.innerHTML=renderMobileAbsenceGroups(filteredRows,rows,editableWeek);
  }else if(!filteredRows.length){
    const emptyMessage=rows.length
      ? 'No hay ausencias que coincidan con el filtro actual.'
      : `No hay ausencias registradas para ${editableWeek?'este día':'esta vista futura'}.`;
    tb.innerHTML=`<tr class="empty-row"><td colspan="7">${emptyMessage}</td></tr>`;
  } else{
    const rowsSource=getRowsForWeekOffset(weekOffset);
    tb.innerHTML=filteredRows.map(g=>{
      const model=buildAbsenceDisplayModel(g,rowsSource);
      const numericId=Number(g.id);
      const canEditRow=isAdmin&&editableWeek&&Number.isInteger(numericId);
      const actionContent=canEditRow
        ? `<div class="table-actions"><button class="btn-edit" onclick="openModal(${numericId})">Editar</button><label class="row-selector"><input type="checkbox" ${selectedAbsenceIds.has(numericId)?'checked':''} onchange="toggleAbsenceSelection(${numericId}, this.checked)"><span>Seleccionar</span></label></div>`
        : '<span class="cell-meta">Solo lectura</span>';
      return `<tr class="${model.rowClasses}">
        <td>
          <div class="cell-stack cell-stack-hour">
            <div class="hora-num">${HORA_MAP[g.hora].label} hora</div>
            <div class="hora-range">${model.h.rango.replace('-', ' - ')}</div>
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <div class="cell-label">Ausente</div>
            ${model.planningMeta}
            <div class="guardia-slot">
              <div class="${model.ausenteChipClass}"><div class="avatar av-red">${initials(model.ausenteNombre)}</div>${escapeHtml(model.ausenteNombre)}${model.ausenteMood?`<span class="chip-mood-tag" title="${escapeHtml(model.ausenteMood.label)}">${model.ausenteMood.emoji}</span>`:''}</div>
            </div>
            ${g.futurePlanned?`<div class="cell-meta">Planificada para ${escapeHtml(formatFutureAbsenceDateLabel(g.futureDate))}</div>`:''}
          </div>
        </td>
        <td>
          ${model.sugerido?`<div class="cell-stack"><div class="cell-label">Cubre</div><div class="guardia-slot"><div class="chip ${model.guardiaChipClass}"><div class="avatar av-yellow">${initials(model.guardiaNombre)}</div>${escapeHtml(model.guardiaNombre)}${model.guardiaMood?`<span class="chip-mood-tag" title="${escapeHtml(model.guardiaMood.label)}">${model.guardiaMood.emoji}</span>`:''}</div></div><div class="cell-meta">${model.guardiaEstado}</div></div>`:`<div class="cell-stack"><div class="cell-label">Cubre</div><span class="sin-asignar">${model.needsCoverage?'Sin asignar':'No aplica'}</span><div class="cell-meta">${model.needsCoverage?'No hay docentes disponibles en este turno.':'Esta sesión no requiere cobertura automática.'}</div></div>`}
        </td>
        <td>
          <div class="cell-stack cell-stack-compact">
            <div class="cell-label">Grupo y aula</div>
            ${renderAbsenceSessionDetails(model)}
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <div class="cell-label">Tarea</div>
            <div class="guardia-slot">
              ${g.futurePlanned?`<span class="badge ${g.futureStatus==='pending'?'teacher-duty-badge':'b-ok'}">${g.futureStatus==='pending'?'Pendiente':'Planificada'}</span>`:(model.faenaInfo.faena?`<div class="faena-status"><span class="badge b-ok">Con tarea</span>${model.faenaInfo.obs?`<details class="faena-toggle"><summary></summary><div class="faena-text">${escapeHtml(model.faenaInfo.obs)}</div></details>`:''}</div>`:`<span class="badge b-nok">Sin tarea</span>`)}
            </div>
          </div>
        </td>
        <td>
          <div class="cell-stack cell-stack-compact">
            <div class="cell-label">Estado</div>
            <div class="guardia-slot"><span class="badge ${model.guardiaBadgeClass}">${model.statusText}</span></div>
          </div>
        </td>
        <td style="${isAdmin?'':'display:none'}">${actionContent}</td>
      </tr>`;
    }).join('');
  }
  const aus=rows.length;
  const rowsSource=getRowsForWeekOffset(weekOffset);
  const rowsNeedingCoverage=rows.filter(row=>rowNeedsCoverage(row));
  const asig=rowsNeedingCoverage.filter(g=>!!getOperationalCoverageName(g,rowsSource)).length;
  const thAcc=document.getElementById('thAcc');
  if(thAcc){
    thAcc.style.display=isAdmin?'':'none';
    thAcc.textContent='Acciones';
  }
  updateAbsenceBatchBar(filteredRows);
  document.getElementById('sAus').textContent=aus;
  document.getElementById('sAsig').textContent=asig;
  document.getElementById('sSin').textContent=Math.max(rowsNeedingCoverage.length-asig,0);
  const corredorStat=document.getElementById('sCorredor');
  if(corredorStat){
    const corredor=getAlumnosFueraSummary();
    corredorStat.textContent=`${corredor.current.total} / ${corredor.max}`;
    const statCard=corredorStat.closest('.stat');
    if(statCard){
      statCard.classList.remove('stat-pasillo-ok','stat-pasillo-warn','stat-pasillo-danger');
      statCard.classList.add(`stat-pasillo-${getPasilloLevelClass(corredor.current.total).replace('is-','')}`);
    }
  }
  renderTvHeaderCorridor();
  renderTvPanel();
  renderPrintSchedule();
  renderAdminWorkspace();
}
async function toggleAdmin(){
  if(!canAdmin){
    showToast('Tu cuenta no tiene permiso de Jefatura.','error');
    return;
  }
  const entering=!isAdmin;
  isAdmin=entering;
  if(entering) closeTeacherPanel();
  renderTable();
  refreshAccessUi();
  if(!entering&&teacherName) await openTeacherPanel();
  showToast(isAdmin?'Vista de Jefatura activada.':'Vista personal activada.','info');
}
async function toggleSuperAdmin(){
  if(!canSuperAdmin) return;
  if(isSuperAdmin){
    window.location.href=getMainRouteUrl();
    return;
  }
  if(!SUPERADMIN_ENABLED){
    if(!superAdminAccessDiscovered) return;
    const url=new URL(window.location.href);
    url.searchParams.set('panel','superadmin');
    window.location.href=`${url.pathname}${url.search}${url.hash}`;
    return;
  }
  isSuperAdmin=true;
  isAdmin=false;
  closeTeacherPanel();
  renderTable();
  refreshAccessUi();
  showToast('Administración técnica activada.','info');
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
    <div class="teacher-access-preview-meta">Antes de entrar, confirma que este nombre es el tuyo.</div>
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
    const recentBadge=teacherRecents.some(item=>sameNormalizedText(item,nombre))?'<span class="teacher-access-suggestion-badge">Reciente</span>':'';
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
  const passwordInput=document.getElementById('teacherLoginPassword');
  const teacherAccessOverlay=document.getElementById('teacherAccessOverlay');
  if(currentAuthSession?.authenticated){
    if(teacherName) return openTeacherPanel();
    showToast('Tu cuenta no tiene un perfil docente activo.','info');
    return false;
  }
  if(!teacherLoginInput||!passwordInput||!teacherAccessOverlay) return false;
  if(resetSelection!==false) teacherLoginInput.value='';
  passwordInput.value='';
  const preview=document.getElementById('teacherAccessPreview');
  if(preview) preview.textContent='La identidad y los permisos se comprobarán en el servidor.';
  teacherAccessOverlay.classList.add('open');
  teacherLoginInput.focus();
  return true;
}
function closeTeacherAccess(){
  const teacherAccessOverlay=document.getElementById('teacherAccessOverlay');
  if(teacherAccessOverlay) teacherAccessOverlay.classList.remove('open');
}
function bgTeacherAccessClose(e){if(e.target.id==='teacherAccessOverlay')closeTeacherAccess();}
function changeTeacherUser(){
  showToast('La identidad docente procede de tu sesión ARGOS.','info');
}
async function loginTeacher(){
  const teacherLoginInput=document.getElementById('teacherLoginName');
  const passwordInput=document.getElementById('teacherLoginPassword');
  if(!teacherLoginInput||!passwordInput||!storage.hasBackend()) return;
  const username=cleanText(teacherLoginInput.value);
  const password=passwordInput.value;
  if(!username||!password){showToast('Introduce usuario y contraseña.','error');return;}
  let result;
  try{
    result=await storage.loginIndividual(username,password);
    passwordInput.value='';
    if(result?.mustChangePassword){
      const newPassword=await askPassword('Cambio de contraseña obligatorio','Introduce una nueva contraseña de al menos 12 caracteres.');
      if(!newPassword) throw new Error('Debes cambiar la contraseña temporal antes de continuar.');
      const repeated=await askPassword('Confirmar nueva contraseña','Repite la nueva contraseña.');
      if(newPassword!==repeated) throw new Error('Las contraseñas nuevas no coinciden.');
      await storage.changeIndividualPassword(password,newPassword);
    }
    const session=await storage.fetchAuthSession();
    currentAuthSession=session?.authenticated&&session?.userId?session:null;
    const roles=Array.isArray(currentAuthSession?.roles)?currentAuthSession.roles:[];
    canAdmin=roles.includes('admin');
    canSuperAdmin=roles.includes('superadmin');
    restoreSuperAdminDiscovery();
    isAdmin=false;
    isSuperAdmin=SUPERADMIN_ENABLED&&canSuperAdmin;
    await loadAuthenticatedTeacherIdentity(!roles.includes('teacher'));
  }catch(error){
    passwordInput.value='';
    showToast(error?.status===401?'Credenciales incorrectas.':(error?.message||'No se pudo iniciar la sesión.'),'error');
    return;
  }
  teacherDay=day;
  teacherWeekOffset=weekOffset;
  closeTeacherAccess();
  refreshAccessUi();
  backendHydrated=false;
  await hydrateFromBackend();
  if(teacherName) openTeacherPanel();
  else showToast('Sesión iniciada. Esta cuenta no tiene perfil docente.','info');
}
function openTeacherPanelFallback(){
  return openTeacherAccess();
}
async function openTeacherPanel(){
  if(!currentAuthSession?.authenticated) return openTeacherAccess();
  if(!getProfesor(teacherName)&&!await loadAuthenticatedTeacherIdentity(false)) return false;
  isAdmin=false;
  isSuperAdmin=false;
  teacherDay=day;
  teacherWeekOffset=weekOffset;
  syncTeacherIdentity();
  document.getElementById('teacherOverlay').classList.add('open');
  document.getElementById('teacherBar').classList.add('show');
  refreshAccessUi();
  syncAppModeClasses();
  renderTeacherPanel();
  return true;
}
function closeTeacherPanel(){document.getElementById('teacherOverlay').classList.remove('open');syncAppModeClasses();}
function bgTeacherClose(event){if(event?.target?.id==='teacherOverlay') closeTeacherPanel();}
function exitTeacherMode(){
  closeTeacherPanel();
  syncAppModeClasses();
}
function setTeacherDay(dia){teacherDay=dia;renderTeacherPanel();}
function changeTeacherWeekOffset(delta){
  teacherWeekOffset=Math.max(-1,Math.min(3,teacherWeekOffset+delta));
  renderTeacherPanel();
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
function selectTeacherMood(moodId){
  if(!teacherName) return;
  const dateKey=getCurrentDateIso();
  saveTeacherMood(teacherName,moodId,dateKey);
  renderTeacherPanel();
}
function resetTeacherMood(){
  if(!teacherName) return;
  clearTeacherMood(teacherName,getCurrentDateIso());
  renderTeacherPanel();
}
function changeAlumnosFueraAula(dia,hora,delta){
  if(!isTeacherCurrentWeek()){
    showToast('Solo puedes registrar salidas en la semana actual.','info');
    return;
  }
  const slot=getCurrentSchoolSlot();
  if(!slot||slot.dia!==dia||slot.hora!==hora){
    showToast('Solo se puede registrar alumnado fuera durante la hora activa.','info');
    return;
  }
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  syncAlumnosFueraAulaEntry(teacherName,dia,hora,delta);
}
async function saveTeacherTask(dia,hora,exitAfter){
  if(!isTeacherCurrentWeek()){
    showToast('Solo puedes editar tareas en la semana actual.','info');
    return;
  }
  if(!await ensureTeacherIdentityConfirmed('guardar una tarea')) return;
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
  const previousOverrides={...sessionOverrides};
  const previousTareas={...tareasProfesorado};
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
  if(syncResult?.ok===false){
    sessionOverrides=previousOverrides;
    tareasProfesorado=previousTareas;
    persistSessionOverrides(sessionOverrides);
    persistTareas(tareasProfesorado);
    showToast(getTeacherTaskWriteFailureMessage(syncResult.error||syncResult),'error');
    return syncResult;
  }
  if(exitAfter){
    renderTable();
    showToast(syncResult?.syncError?'Tarea guardada en local. Pendiente de sincronizar con el servidor.':'Tarea guardada correctamente.','success');
    closeTeacherPanel();
    return syncResult;
  }
  renderTeacherPanel();
  renderTable();
  showToast(syncResult?.syncError?'Tarea guardada en local. Pendiente de sincronizar con el servidor.':'Tarea guardada correctamente.','success');
  return syncResult;
}
function getTeacherTaskWriteFailureMessage(error){
  const status=Number(error?.status)||0;
  if(status===401) return 'No se ha podido guardar la tarea. La sesión no es válida; accede de nuevo o contacta con Jefatura de Estudios.';
  if(status===403) return 'No se ha podido guardar la tarea porque no tienes autorización.';
  return 'No se ha podido guardar la tarea. Comprueba la conexión e inténtalo de nuevo.';
}
async function toggleTeacherPatioTeamMeeting(dia,hora){
  if(!isTeacherCurrentWeek()){
    showToast('Solo puedes marcar equipo docente en la semana actual.','info');
    return;
  }
  if(!await ensureTeacherIdentityConfirmed('marcar equipo docente')) return;
  const assignments=getTeacherPatioAssignmentsForSlot(teacherName,dia,hora,getTeacherSelectedWeekKey());
  if(!assignments.length){
    showToast('No tienes guardia de patio asignada en este tramo.','info');
    return;
  }
  const current=getPatioTeacherBlock(teacherName,dia,hora,getTeacherSelectedWeekKey());
  if(current){
    patioTeacherBlocks=patioTeacherBlocks.filter(row=>makePatioTeacherBlockKey(row.weekKey,row.dia,row.hora,row.profesor)!==makePatioTeacherBlockKey(current.weekKey,current.dia,current.hora,current.profesor));
  }else{
    patioTeacherBlocks=[
      ...patioTeacherBlocks,
      {
        weekKey:getTeacherSelectedWeekKey(),
        dia,
        hora,
        profesor:teacherName,
        sourceCode:authenticatedTeacherSourceCode,
        reason:'equipo-docente',
        note:''
      }
    ];
  }
  persistPatioTeacherBlocks(patioTeacherBlocks);
  renderTeacherPanel();
  renderGuardiaBoard();
  renderTable();
  const syncResult=await syncPatioTeacherBlocksState({
    weekKey:getTeacherSelectedWeekKey(),
    dia,
    hora,
    profesor:teacherName,
    sourceCode:authenticatedTeacherSourceCode,
    reason:'equipo-docente',
    note:'',
    active:!current
  });
  showToast(
    current
      ? 'Bloqueo de patio retirado.'
      : (syncResult?.syncError?'Equipo docente guardado en local. Pendiente de sincronizar.':'Equipo docente marcado para esta guardia de patio.'),
    current?'success':(syncResult?.syncError?'info':'success')
  );
}
function renderTeacherPanel(){
  const profesor=getProfesor(teacherName);
  if(!profesor) return;
  const moodCard=document.getElementById('teacherMoodCard');
  const moodDateKey=getCurrentDateIso();
  const moodEntry=getTeacherMoodEntry(teacherName,moodDateKey);
  const moodOption=moodEntry?getTeacherMoodOption(moodEntry.moodId):null;
  const moodMessage=moodOption?getTeacherMoodMessage(teacherName,moodDateKey,moodOption):'';
  renderWeekLabel();
  syncTeacherIdentity();
  document.getElementById('teacherName').textContent=getVisibleTeacherName(profesor.nombre);
  document.getElementById('teacherMeta').textContent=`${getVisibleTeacherName(profesor.nombreCompleto||profesor.nombre)} - ${profesor.departamento}${getTeacherDisplayMeta(teacherName)?` - ${getTeacherDisplayMeta(teacherName)}`:''}`;
  const sesiones=getHorarioProfesorDia(teacherName,teacherDay);
  const horasLectivas=Object.keys(sesiones).map(Number).sort((a,b)=>a-b);
  const patioHoras=Array.from(PATIO_RENDER_HORAS).filter(hora=>getTeacherPatioAssignmentsForSlot(teacherName,teacherDay,hora,getTeacherSelectedWeekKey()).length||!!getPatioTeacherBlock(teacherName,teacherDay,hora,getTeacherSelectedWeekKey()));
  const horas=[...new Set([...horasLectivas,...patioHoras])].sort((a,b)=>a-b);
  const currentTeacherWeek=isTeacherCurrentWeek();
  const teacherRowsForDay=getTeacherWeekRowsForDay(teacherDay);
  const corredor=getAlumnosFueraSummary();
  const activeSlot=corredor.current.slot;
  const overview=document.getElementById('teacherOverview');
  const totalConTarea=currentTeacherWeek?horasLectivas.filter(hora=>{const tarea=getTareaProfesor(teacherName,teacherDay,hora);return !!(tarea?.dejada||tarea?.tarea);}).length:0;
  const dutyAssignments=teacherRowsForDay
    .filter(row=>sameNormalizedText(row.guardia,teacherName))
    .map(row=>({
      ...row,
      faenaInfo:currentTeacherWeek?resolveFaena(row):{faena:false,obs:''},
      aula:resolveAulaRegistro(row)
    }));
  const futureOwnRows=sortFutureAbsenceRowsForDisplay(teacherFutureAbsences.filter(item=>sameNormalizedText(item.profesor,teacherName)));
  const pendingFutureCount=futureOwnRows.filter(item=>(item.status||'pending')==='pending').length;
  const nextFutureAbsence=futureOwnRows.find(item=>['pending','approved','applied'].includes(item.status||'pending'))||null;
  const nextDuty=dutyAssignments.slice().sort((a,b)=>a.hora-b.hora)[0]||null;
  const teacherSummaryEl=document.getElementById('teacherSummary');
  if(teacherSummaryEl) teacherSummaryEl.textContent=`${DIAS[teacherDay]} \u00b7 ${horas.length} sesiones \u00b7 ${totalConTarea} con tarea \u00b7 ${dutyAssignments.length} coberturas${currentTeacherWeek?'':` \u00b7 semana futura`}`;
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
  if(moodCard){
    moodCard.innerHTML=moodOption
      ?`<div class="teacher-mood-copy"><div class="teacher-mood-title">${moodOption.emoji} ${escapeHtml(moodOption.welcome)}</div><div class="teacher-mood-text">Hoy te sientes ${escapeHtml(moodOption.label.toLowerCase())}. ${escapeHtml(moodMessage)}</div></div><button class="btn-teacher-panel" type="button" onclick="resetTeacherMood()">Cambiar estado</button>`
      :`<div class="teacher-mood-copy"><div class="teacher-mood-title">¿Cómo te sientes hoy?</div><div class="teacher-mood-text">Elige una opción rápida y seguimos. Es solo un guiño del panel para arrancar el día.</div></div><div class="teacher-mood-options">${TEACHER_MOOD_OPTIONS.map(option=>`<button class="teacher-mood-option" type="button" onclick="selectTeacherMood('${option.id}')" aria-label="${escapeHtml(option.label)}"><span class="teacher-mood-option-emoji">${option.emoji}</span><span class="teacher-mood-option-label">${escapeHtml(option.label)}</span></button>`).join('')}</div>`;
    moodCard.className=`teacher-mood-card${moodOption?` is-${moodOption.tone}`:''}`;
  }
  document.getElementById('teacherDayPills').innerHTML=DIAS.map((nombreDia,index)=>`<button class="${index===teacherDay?'active':''}" onclick="setTeacherDay(${index})">${nombreDia}</button>`).join('');
  if(overview){
    const activeTeacherRow=activeSlot?getAlumnosFueraTeacherRow(teacherName,activeSlot.dia,activeSlot.hora):null;
    const activeTeacherCount=Math.max(0,Number(activeTeacherRow?.cantidad)||0);
    const activeTotal=corredor.current.total;
    const activeCanAdd=!!activeSlot&&currentTeacherWeek&&activeTotal<MAX_ALUMNOS_FUERA_AULA;
    const activeCanRemove=!!activeSlot&&currentTeacherWeek&&activeTeacherCount>0;
    overview.innerHTML=`
      <article class="teacher-overview-card">
        <div class="teacher-overview-label">Hoy tengo clase</div>
        <div class="teacher-overview-value">${horasLectivas.length}</div>
        <div class="teacher-overview-copy">${horasLectivas.length?`Próxima sesión: ${escapeHtml(formatHoraLabel(horasLectivas[0]))}`:'Sin clases lectivas registradas para este día.'}</div>
        <button class="btn-teacher-panel teacher-overview-action" type="button" onclick="document.getElementById('teacherSessions')?.scrollIntoView({behavior:'smooth',block:'start'})">Ver sesiones</button>
      </article>
      <article class="teacher-overview-card teacher-overview-card-duty">
        <div class="teacher-overview-label">Hoy estoy de guardia</div>
        <div class="teacher-overview-value">${dutyAssignments.length}</div>
        <div class="teacher-overview-copy">${nextDuty?`Próxima cobertura: ${escapeHtml(getVisibleTeacherName(nextDuty.ausente))} · ${escapeHtml(formatHoraLabel(nextDuty.hora))}`:'No tienes coberturas asignadas en este día.'}</div>
        <button class="btn-teacher-panel teacher-overview-action" type="button" ${nextDuty?'':'disabled'} onclick="${nextDuty?`focusTeacherDutyHour(${nextDuty.hora})`:''}">${nextDuty?'Ir a mi guardia':'Sin guardias'}</button>
      </article>
      <article class="teacher-overview-card teacher-overview-card-corridor ${getPasilloLevelClass(activeTotal)}${activeSlot?' is-active':''}${activeTotal>=MAX_ALUMNOS_FUERA_AULA?' is-full':''}">
        <div class="teacher-overview-label">En el pasillo ahora</div>
        <div class="teacher-overview-value">${corredor.current.total}/${corredor.max}</div>
        <div class="teacher-overview-copy">${activeSlot?`Tramo activo: ${escapeHtml(formatHoraLabel(activeSlot.hora))}.`:'Sin tramo lectivo activo.'}${corredor.pending.length?` Pendientes anteriores: ${corredor.pending.length}.`:''}${pendingFutureCount?` Faltas pendientes: ${pendingFutureCount}.`:''}</div>
        <div class="teacher-corridor-stepper teacher-corridor-stepper-main">
          <button type="button" onclick="changeAlumnosFueraAula(${activeSlot?.dia ?? teacherDay},${activeSlot?.hora ?? 0},-1)" ${activeCanRemove?'':'disabled'}>-</button>
          <strong>${activeTeacherCount}</strong>
          <button type="button" onclick="changeAlumnosFueraAula(${activeSlot?.dia ?? teacherDay},${activeSlot?.hora ?? 0},1)" ${activeCanAdd?'':'disabled'}>+</button>
        </div>
      </article>
    `;
  }
  if(!horas.length){
    document.getElementById('teacherSessions').innerHTML='<div class="teacher-session"><div class="teacher-session-empty">No tienes sesiones registradas para este d\u00eda.</div></div>';
    return;
  }
  document.getElementById('teacherSessions').innerHTML=horas.map(hora=>{
    const patioAssignments=getTeacherPatioAssignmentsForSlot(teacherName,teacherDay,hora,getTeacherSelectedWeekKey());
    const unallocatedPatioAssignments=patioAssignments.filter(item=>item.unallocated);
    const hasLibraryBreakDuty=patioAssignments.some(item=>item.kind==='library');
    const patioBlock=getPatioTeacherBlock(teacherName,teacherDay,hora,getTeacherSelectedWeekKey());
    const sesion=patioAssignments.length&&!sesiones?.[hora]
      ?{
        tipo:'patio',
        materia:hasLibraryBreakDuty?'Biblioteca patio':(hora===8?'Patio bachiller':'Guardia de patio'),
        detalle:patioAssignments.map(item=>item.dutyLabel||item.label).join(' · '),
        grupo:'',
        aula:unallocatedPatioAssignments.length?'Sin puesto asignado':(hasLibraryBreakDuty?'Biblioteca':'Patio')
      }
      :resolveTeacherSession(teacherName,teacherDay,hora);
    const grupo=sesion.grupo?GRUPOS_PROFESORADO[sesion.grupo]?.nombre||sesion.grupo:'';
    const aula=sesion.aula||'Sin aula';
    const tarea=currentTeacherWeek?getTareaProfesor(teacherName,teacherDay,hora):null;
    const checked=tarea?!!(tarea.dejada||tarea.tarea):false;
    const texto=tarea?.tarea||'';
    const detalleVisible=grupo||sesion.detalle||'Sin detalle adicional';
    const guardiaTasks=sesion.tipo==='guardia'?dutyAssignments.filter(item=>item.hora===hora):[];
    const dutyBadge=guardiaTasks.length?`<span class="badge teacher-duty-badge">${currentTeacherWeek?'Te toca cubrir':'Cobertura prevista'}</span>`:'';
    const patioBadge=patioAssignments.length?`<span class="badge ${patioBlock||unallocatedPatioAssignments.length?'b-warn':'b-ok'}">${patioBlock?'Equipo docente':hasLibraryBreakDuty?'Biblioteca patio':unallocatedPatioAssignments.length?'Patio sin puesto':'Patio asignado'}</span>`:'';
    const openByDefault=(!!activeSlot&&activeSlot.dia===teacherDay&&activeSlot.hora===hora)||checked||!!texto||guardiaTasks.length||patioAssignments.length||!!patioBlock;
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
    if(sesion.tipo==='patio'){
      return `<details class="teacher-session teacher-session-patio${patioBlock?' is-blocked':''}" data-teacher-hour="${hora}" ${openByDefault?'open':''}>
        <summary class="teacher-session-head">
          <div class="teacher-session-summary">
            <div class="teacher-session-slot">${HORA_MAP[hora].label} hora</div>
            <div class="teacher-session-title">${escapeHtml(sessionKindLabel)}</div>
            <div class="teacher-session-meta">${escapeHtml(detalleVisible)}</div>
          </div>
          <div class="teacher-session-side">
            <div class="teacher-session-meta">${HORA_MAP[hora].rango}</div>
            <div class="teacher-session-badges">
              ${patioBadge}
              <span class="badge b-biblio">${escapeHtml(aula)}</span>
            </div>
          </div>
        </summary>
        <div class="teacher-session-content">
          <div class="teacher-session-quick">
            <div class="teacher-quick-item"><span class="teacher-quick-label">Puestos</span><span class="teacher-quick-value">${escapeHtml(patioAssignments.map(item=>item.label).join(' · ')||'Sin puesto')}</span></div>
            <div class="teacher-quick-item"><span class="teacher-quick-label">Estado</span><span class="teacher-quick-value">${escapeHtml(patioBlock?'No disponible por equipo docente':'Disponible para patio')}</span></div>
            <div class="teacher-quick-item"><span class="teacher-quick-label">Semana</span><span class="teacher-quick-value">${escapeHtml(currentTeacherWeek?'Semana actual':'Vista de planificación')}</span></div>
          </div>
          <div class="teacher-patio-panel ${patioBlock?'is-blocked':'is-active'}">
            <div class="teacher-patio-copy">
              <div class="teacher-patio-title">${patioBlock?'Equipo docente activado':'Guardia de patio activa'}</div>
              <div class="teacher-patio-text">${escapeHtml(patioBlock?'Este tramo deja de contarte para patio y el puesto se refleja como no disponible en el mapa.':'Si en este tramo tienes equipo docente, marca el bloqueo para liberar tu puesto en el mapa de patio.')}</div>
            </div>
            <button class="btn-teacher-panel teacher-patio-toggle" type="button" onclick="toggleTeacherPatioTeamMeeting(${teacherDay},${hora})" ${currentTeacherWeek?'':'disabled'}>${patioBlock?'Quitar equipo docente':'Marcar equipo docente'}</button>
          </div>
        </div>
      </details>`;
    }
    return `<details class="teacher-session${guardiaTasks.length?' teacher-session-duty':''}" data-teacher-hour="${hora}" ${openByDefault?'open':''}>
      <summary class="teacher-session-head">
        <div class="teacher-session-summary">
          <div class="teacher-session-slot">${HORA_MAP[hora].label} hora</div>
          <div class="teacher-session-title">${sessionKindLabel}</div>
          <div class="teacher-session-meta">${detalleVisible}</div>
        </div>
        <div class="teacher-session-side">
          <div class="teacher-session-meta">${HORA_MAP[hora].rango}</div>
          <div class="teacher-session-badges">
            ${dutyBadge}
            ${patioBadge}
            <span class="badge ${checked?'b-ok':'b-nok'}">${checked?'Con tarea':'Sin tarea'}</span>
            <span class="badge b-biblio">${aula}</span>
          </div>
        </div>
      </summary>
      <div class="teacher-session-content">
      <div class="teacher-session-quick">
        <div class="teacher-quick-item"><span class="teacher-quick-label">Grupo</span><span class="teacher-quick-value">${escapeHtml(grupo||'Sin grupo')}</span></div>
        <div class="teacher-quick-item"><span class="teacher-quick-label">Aula</span><span class="teacher-quick-value">${escapeHtml(aula)}</span></div>
        <div class="teacher-quick-item"><span class="teacher-quick-label">Tarea</span><span class="teacher-quick-value">${checked?(texto?escapeHtml(texto.slice(0,72)+(texto.length>72?'...':'')):'Marcada para el grupo'):'No has dejado tarea todavía'}</span></div>
      </div>
      <div class="teacher-session-panel" id="teacherSessionPanel-${teacherDay}-${hora}">
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
        <button class="teacher-save-exit" type="button" onclick="saveTeacherTask(${teacherDay},${hora},true)">Guardar y cerrar</button>`:`<div class="teacher-meta">Vista de planificación. La edición se habilita en la semana actual.</div>`}
      </div>
      </div>
      </div>
    </details>`;
  }).join('');
}
function syncTodoDiaMode(){
  const todoDiaInput=document.getElementById('fTodoDia');
  const guardiaInput=document.getElementById('fGuardia');
  const hoursGrid=document.getElementById('fHorasMulti');
  if(!todoDiaInput||!guardiaInput) return;
  guardiaInput.disabled=true;
  guardiaInput.placeholder='La guardia se asigna automaticamente';
  if(hoursGrid){
    hoursGrid.querySelectorAll('[data-absence-hour]').forEach(button=>{
      button.disabled=!!todoDiaInput.checked;
    });
  }
  setFieldError('fGuardia','');
}
function getAbsenceSelectedHours(){
  return [...new Set((absenceSelectedHours||[]).map(Number).filter(esHoraValida))].sort((a,b)=>a-b);
}
function setAbsenceSelectedHours(hours){
  const invalidHours=(hours||[]).map(Number).filter(hora=>!esHoraValida(hora));
  invalidHours.forEach(hora=>logInvalidAbsenceHour('skip hora inválida',{profesor:getCurrentAbsenceTeacher()||'',hora}));
  absenceSelectedHours=[...new Set((hours||[]).map(Number).filter(esHoraValida))].sort((a,b)=>a-b);
}
function getAbsencePrimaryHour(){
  const selected=getAbsenceSelectedHours();
  if(selected.length&&esHoraValida(selected[0])) return selected[0];
  const fallback=Number(document.getElementById('fHora')?.value||1);
  return esHoraValida(fallback)?fallback:1;
}
function getCurrentAbsenceTeacher(){
  const input=document.getElementById('fAusente');
  return input?getProfesorNombreSeleccionado(input.value,{input,allowSelectedInput:true}):'';
}
function getCurrentAbsenceScheduledHours(){
  const nombre=getCurrentAbsenceTeacher();
  const dia=Number(document.getElementById('fDia')?.value||day);
  return nombre?getHorasCubriblesProfesorDia(nombre,dia):[];
}
function getCurrentAbsenceEditGroupRows(){
  const groupIds=new Set((editAbsenceGroupIds||[]).map(Number).filter(Number.isInteger));
  return groupIds.size?data.filter(row=>groupIds.has(Number(row?.id))):[];
}
function getAbsenceEditRowsForBaseRow(row){
  if(!row) return [];
  return data
    .filter(item=>item&&item.dia===row.dia&&sameNormalizedText(item.ausente,row.ausente))
    .sort((a,b)=>Number(a.hora)-Number(b.hora)||Number(a.id)-Number(b.id));
}
function syncAbsencePrimaryHour(){
  const hiddenHour=document.getElementById('fHora');
  if(hiddenHour) hiddenHour.value=String(getAbsencePrimaryHour());
}
function renderAbsenceHourChoices(){
  const container=document.getElementById('fHorasMulti');
  const todoDiaInput=document.getElementById('fTodoDia');
  if(!container) return;
  const selectedTeacher=getCurrentAbsenceTeacher();
  const scheduledHours=selectedTeacher?getCurrentAbsenceScheduledHours():[];
  const scheduledSet=new Set(scheduledHours);
  const preservedUnavailable=new Set(getCurrentAbsenceEditGroupRows().map(row=>Number(row.hora)).filter(Number.isInteger));
  let normalizedSelected=getAbsenceSelectedHours();
  if(selectedTeacher&&scheduledHours.length){
    normalizedSelected=normalizedSelected.filter(hora=>scheduledSet.has(hora)||preservedUnavailable.has(hora));
    if(!normalizedSelected.length) normalizedSelected=[scheduledHours[0]];
    setAbsenceSelectedHours(normalizedSelected);
  }else if(!normalizedSelected.length){
    const fallbackHour=Number(document.getElementById('fHora')?.value||1);
    setAbsenceSelectedHours([esHoraValida(fallbackHour)?fallbackHour:1]);
  }
  syncAbsencePrimaryHour();
  const selectedSet=new Set(getAbsenceSelectedHours());
  container.innerHTML=Object.entries(HORA_MAP).map(([hora,info])=>`
    <button
      class="absence-hour-chip${selectedSet.has(Number(hora))?' is-selected':''}${selectedTeacher&&(!scheduledSet.has(Number(hora))&&!selectedSet.has(Number(hora)))?' is-unavailable':''}"
      type="button"
      data-absence-hour="${hora}"
      ${todoDiaInput?.checked||!!(selectedTeacher&&(!scheduledSet.has(Number(hora))&&!selectedSet.has(Number(hora))))?'disabled':''}
      title="${selectedTeacher&&(!scheduledSet.has(Number(hora))&&!selectedSet.has(Number(hora)))?'Ese docente no tiene una sesión cubrible registrada en esta hora.':''}">
      ${escapeHtml(`${info.label} hora`)}
      <span>${escapeHtml(info.rango.replace('-', ' - '))}</span>
    </button>
  `).join('');
}
function getTeacherCurrentMonthGuardiaCount(nombre){
  const canonical=resolveTeacherCanonicalName(nombre)||cleanText(nombre);
  if(!canonical) return 0;
  const monthKey=getCurrentMonthKey();
  if(cleanText(guardiaMonthlyLoad.monthKey)!==monthKey){
    return buildMonthlyGuardiaCoverageCounter({weekKey:getCurrentSchoolWeekKey()})[canonical]||0;
  }
  return Number(guardiaMonthlyLoad.counts?.[canonical]||0);
}
function getTeacherCurrentWeekAbsenceRows(nombre){
  return data.filter(row=>sameNormalizedText(row.ausente,nombre));
}
function renderTeacherAdminStats(nombre,dia){
  const container=document.getElementById('teacherAdminStats');
  if(!container) return;
  if(!nombre){
    container.innerHTML='';
    return;
  }
  const scheduledHours=getHorasCubriblesProfesorDia(nombre,dia);
  const weekAbsenceRows=getTeacherCurrentWeekAbsenceRows(nombre);
  const futureStats=getTeacherFutureAbsenceStats(nombre);
  const currentMonthGuardias=getTeacherCurrentMonthGuardiaCount(nombre);
  const plannedGuardiasWeek=[0,1,2,3,4]
    .flatMap(dayIndex=>Object.keys(getHorarioProfesorDia(nombre,dayIndex)||{}).map(Number).filter(hora=>getHorarioProfesorDia(nombre,dayIndex)?.[hora]?.tipo==='guardia'))
    .length;
  const absenceHoursWeek=weekAbsenceRows.length;
  const statCards=[
    {
      label:'Guardias mes',
      value:String(currentMonthGuardias),
      note:'Coberturas acumuladas en el mes actual'
    },
    {
      label:'Ausencias semana',
      value:String(absenceHoursWeek),
      note:absenceHoursWeek===1?'1 hora registrada esta semana':`${absenceHoursWeek} horas registradas esta semana`
    },
    {
      label:'Horario de hoy',
      value:String(scheduledHours.length),
      note:scheduledHours.length?scheduledHours.map(formatHoraLabel).join(', '):'Sin sesiones cubribles hoy'
    },
    {
      label:'Ausencias futuras',
      value:String(futureStats.total),
      note:futureStats.total?`${futureStats.pending} pendientes · ${futureStats.approved} validadas/aplicadas`:'Sin avisos futuros'
    },
    {
      label:'Guardias previstas',
      value:String(plannedGuardiasWeek),
      note:'Tramos de guardia en su horario semanal'
    }
  ];
  container.innerHTML=statCards.map(item=>`
    <article class="teacher-admin-stat">
      <div class="teacher-admin-stat-label">${escapeHtml(item.label)}</div>
      <div class="teacher-admin-stat-value">${escapeHtml(item.value)}</div>
      <div class="teacher-admin-stat-note">${escapeHtml(item.note)}</div>
    </article>
  `).join('');
}
function openModal(id){if(!isCurrentWeekOffset(weekOffset)){showToast('La edición solo está disponible en la semana actual.','info');return;}editId=id||null;const g=id?data.find(x=>x.id===id):null;const editRows=g?getAbsenceEditRowsForBaseRow(g):[];editAbsenceGroupIds=editRows.map(row=>Number(row.id)).filter(Number.isInteger);const faenaInfo=g?resolveFaena(g):{faena:false,obs:''};clearAbsenceFormErrors();document.getElementById('mTitle').textContent=g?(editRows.length>1?`Editar ausencia (${editRows.length} horas)`:'Editar ausencia'):'Nueva ausencia';document.getElementById('btnDel').style.display=g?'':'none';document.getElementById('fDia').value=g?g.dia:day;document.getElementById('fHora').value=g?g.hora:1;setAusenteSelection(g?g.ausente:'');if(!g){document.getElementById('fAusente').value='';editAbsenceGroupIds=[];}document.getElementById('fGuardia').value=g?getVisibleTeacherName(g.guardia):'';document.getElementById('fTodoDia').checked=false;setAbsenceSelectedHours(g?(editRows.length?editRows.map(row=>row.hora):[g.hora]):[]);document.getElementById('fFaena').checked=faenaInfo.faena;document.getElementById('fObs').value=faenaInfo.obs||'';renderAbsenceHourChoices();populateProfesoresGuardia();syncTodoDiaMode();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();closeAusenteSuggestions();document.getElementById('overlay').classList.add('open');}
function renderAusentePreview(){
  const input=document.getElementById('fAusente');
  const preview=document.getElementById('ausentePreview');
  if(!input||!preview) return;
  const nombre=getProfesorNombreSeleccionado(input.value,{input,allowSelectedInput:true});
  if(!nombre){
    preview.textContent='Empieza a escribir para localizar al docente.';
    renderTeacherAdminStats('',+document.getElementById('fDia').value);
    return;
  }
  const dia=+document.getElementById('fDia').value;
  const hora=getAbsencePrimaryHour();
  const aula=getAulaProfesor(nombre,dia,hora)||'Sin aula registrada';
  const horas=getHorasCubriblesProfesorDia(nombre,dia);
  const editRows=getCurrentAbsenceEditGroupRows();
  preview.textContent=`${getVisibleTeacherName(nombre)} \u00b7 ${DIAS[dia]} \u00b7 ${horas.length} sesiones cubribles \u00b7 ${aula}${editRows.length>1?` \u00b7 Editando ${editRows.length} horas ya registradas`:''}`;
  renderTeacherAdminStats(nombre,dia);
}
function renderAbsenceDecisionBar(){
  const panel=document.getElementById('absenceDecisionBar');
  if(!panel) return;
  const input=document.getElementById('fAusente');
  if(!input){
    panel.textContent='Selecciona primero al docente y después las horas para ver la ubicación, la cobertura prevista y la tarea disponible.';
    return;
  }
  const nombre=getProfesorNombreSeleccionado(input.value,{input,allowSelectedInput:true});
  if(!nombre){
    panel.textContent='Selecciona primero al docente y después las horas para ver la ubicación, la cobertura prevista y la tarea disponible.';
    return;
  }
  const dia=+document.getElementById('fDia').value;
  const hora=getAbsencePrimaryHour();
  const todoDia=!!document.getElementById('fTodoDia')?.checked;
  const selectedHours=getAbsenceSelectedHours();
  const aula=getAulaProfesor(nombre,dia,hora)||'Sin aula';
  const guardia=getGuardiaSugerida(dia,hora,1);
  const formObs=document.getElementById('fObs')?.value.trim()||'';
  const formFaena=!!document.getElementById('fFaena')?.checked||!!formObs;
  const tarea=getAbsenceTaskState(nombre,dia,hora,formFaena,formObs);
  const horasLectivas=todoDia?getHorasCubriblesProfesorDia(nombre,dia):[];
  const editRows=getCurrentAbsenceEditGroupRows();
  const extras=[];
  if(todoDia) extras.push(`Se aplicar\u00e1 a ${horasLectivas.length} ${horasLectivas.length===1?'sesión cubrible':'sesiones cubribles'}`);
  else if(selectedHours.length>1) extras.push(`Se aplicar\u00e1 a ${selectedHours.length} horas: ${selectedHours.map(formatHoraLabel).join(', ')}`);
  if(editRows.length>1) extras.push(`Editando ${editRows.length} horas ya registradas`);
  if(tarea.faena&&tarea.obs) extras.push(`Tarea: ${escapeHtml((tarea.obs||'').slice(0,90)+((tarea.obs||'').length>90?'...':''))}`);
  panel.innerHTML=`
    <div class="absence-decision-grid">
      <div class="absence-decision-item"><span class="absence-decision-k">Aula</span><strong>${escapeHtml(aula)}</strong></div>
      <div class="absence-decision-item"><span class="absence-decision-k">Guardia prevista</span><strong>${escapeHtml(guardia?getVisibleTeacherName(guardia):'Sin cobertura')}</strong></div>
      <div class="absence-decision-item"><span class="absence-decision-k">Tarea</span><strong>${tarea.faena?'Disponible':'No registrada'}</strong></div>
    </div>
    ${extras.length?`<div class="absence-decision-extra">${extras.join(' · ')}</div>`:''}
  `;
}function closeModal(){editId=null;editAbsenceGroupIds=[];document.getElementById('overlay').classList.remove('open');}
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
  const selected=getProfesorNombreSeleccionado(input.value,{input,allowSelectedInput:true});
  if(!query && !selected){
    suggestions.innerHTML='';
    suggestions.hidden=true;
    return;
  }
  if(selected&&input.dataset.selectedTeacher){
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
  setAusenteSelection(nombre,input);
  absenceActiveIndex=absenceMatches.findIndex(item=>item===nombre);
  renderAbsenceHourChoices();
  syncGuardiaPreview();
  renderAusentePreview();
  renderAbsenceDecisionBar();
  closeAusenteSuggestions();
}
function handleAusenteInput(){
  const input=document.getElementById('fAusente');
  clearAusenteSelection(input);
  absenceActiveIndex=-1;
  const uniqueMatch=input?resolveTeacherFromInputValue(input.value):'';
  if(uniqueMatch){
    setAusenteSelection(uniqueMatch,input);
    absenceMatches=[uniqueMatch];
    absenceActiveIndex=0;
  }
  renderAbsenceHourChoices();
  syncGuardiaPreview();
  renderAusentePreview();
  renderAbsenceDecisionBar();
  if(uniqueMatch) closeAusenteSuggestions();
  else renderAusenteSuggestions(true);
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
function setFieldError(fieldId,message){
  const input=document.getElementById(fieldId);
  const error=document.getElementById(`${fieldId}Error`);
  if(input) input.classList.toggle('is-invalid',!!message);
  if(error) error.textContent=message||'';
}
function clearAbsenceFormErrors(){
  ['fDia','fHora','fHorasMulti','fAusente','fGuardia'].forEach(fieldId=>setFieldError(fieldId,''));
}
function findDuplicateAbsence(dia,hora,ausente){
  const ignoredIds=new Set((editAbsenceGroupIds||[]).map(Number).filter(Number.isInteger));
  if(Number.isInteger(Number(editId))) ignoredIds.add(Number(editId));
  return data.find(item=>item.dia===dia&&item.hora===hora&&sameNormalizedText(item.ausente,ausente)&&!ignoredIds.has(Number(item.id))) || null;
}
function validateAbsenceForm(){
  const dia=+document.getElementById('fDia').value;
  const hora=getAbsencePrimaryHour();
  const todoDia=document.getElementById('fTodoDia').checked;
  const selectedHours=getAbsenceSelectedHours();
  const ausenteInput=document.getElementById('fAusente');
  const ausente=getProfesorNombreSeleccionado(ausenteInput.value,{input:ausenteInput,allowSelectedInput:true})||resolveTeacherFromInputValue(ausenteInput.value);
  if(ausente) setAusenteSelection(ausente,ausenteInput);
  clearAbsenceFormErrors();
  if(!ausente){
    setFieldError('fAusente','Selecciona un docente ausente del listado o escribe un nombre que deje una coincidencia única.');
    return {valid:false,focus:ausenteInput};
  }
  if(!esHoraValida(hora)){
    logInvalidAbsenceHour('skip hora inválida',{profesor:ausente,hora});
    setFieldError('fHora','La hora seleccionada no es válida.');
    return {valid:false,focus:document.getElementById('fHora')};
  }
  if(todoDia){
    const horasLectivas=getHorasCubriblesProfesorDia(ausente,dia);
    if(!horasLectivas.length){
      setFieldError('fAusente','Ese docente no tiene sesiones cubribles registradas ese día.');
      return {valid:false,focus:ausenteInput};
    }
    return {valid:true,ausente,guardia:'',todoDia:true,horasLectivas:horasLectivas.filter(esHoraValida)};
  }
  const horasProgramadas=new Set(getHorasCubriblesProfesorDia(ausente,dia));
  const preservedUnavailable=new Set(getCurrentAbsenceEditGroupRows().map(row=>Number(row.hora)).filter(Number.isInteger));
  const invalidHour=selectedHours.find(horaItem=>!horasProgramadas.has(horaItem)&&!preservedUnavailable.has(horaItem));
  if(invalidHour!=null){
    setFieldError('fHorasMulti',`Ese docente no tiene una sesión cubrible registrada en ${formatHoraLabel(invalidHour)}.`);
    return {valid:false,focus:ausenteInput};
  }
  const horasObjetivo=(selectedHours.length>1?selectedHours:[hora]).map(Number).filter(esHoraValida);
  if(!horasObjetivo.length){
    logInvalidAbsenceHour('skip hora inválida',{profesor:ausente,hora});
    setFieldError('fHora','No hay ninguna hora válida para guardar.');
    return {valid:false,focus:document.getElementById('fHora')};
  }
  const duplicateHour=horasObjetivo.find(horaItem=>findDuplicateAbsence(dia,horaItem,ausente));
  if(duplicateHour!=null){
    setFieldError(selectedHours.length>1?'fHorasMulti':'fAusente',`Ya existe una ausencia registrada para ese docente en ${formatHoraLabel(duplicateHour)}.`);
    return {valid:false,focus:ausenteInput};
  }
  return {valid:true,ausente,guardia:'',todoDia:false,horasLectivas:horasObjetivo};
}
function resolveAbsenceAulaForSave(ausente,dia,hora,existingRow=null){
  return getAulaProfesor(ausente,dia,hora)||(existingRow?resolveAulaRegistro(existingRow):'')||cleanText(existingRow?.aula)||'';
}
function validateAbsenceFormSafe(){
  const validation=validateAbsenceForm();
  if(validation.valid) return validation;
  return {
    ...validation,
    message:
      validation.message||
      document.getElementById('fAusenteError')?.textContent||
      document.getElementById('fHorasMultiError')?.textContent||
      document.getElementById('fDiaError')?.textContent||
      document.getElementById('fGuardiaError')?.textContent||
      'Revisa los campos marcados antes de guardar.'
  };
}
function populateProfesoresGuardia(){
  const fDia=document.getElementById('fDia');
  const fHora=document.getElementById('fHora');
  const profesoresGuardia=document.getElementById('profesoresGuardia');
  const guardiaInput=document.getElementById('fGuardia');
  if(!fDia||!fHora||!profesoresGuardia||!guardiaInput) return;
  const dia=fDia.value;
  const hora=String(getAbsencePrimaryHour());
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
  const hora=getAbsencePrimaryHour();
  const sugerida=getGuardiaSugerida(dia,hora,1)||'';
  guardiaInput.value=getVisibleTeacherName(sugerida);
  guardiaInput.placeholder=sugerida?'Asignaci\u00f3n autom\u00e1tica prevista':'Sin guardia disponible';
}
function setAbsenceSavingState(isSaving){
  const saveButton=document.getElementById('btnSaveAbsence');
  const cancelButton=document.getElementById('btnCancelAbsence');
  const deleteButton=document.getElementById('btnDel');
  if(saveButton){
    saveButton.disabled=!!isSaving;
    saveButton.textContent=isSaving?'Guardando...':'Guardar';
  }
  if(cancelButton) cancelButton.disabled=!!isSaving;
  if(deleteButton) deleteButton.disabled=!!isSaving;
}
async function saveAbsence(){
  if(absenceSaveInFlight){
    showToast('Ya se está guardando una ausencia. Espera a que termine.','info');
    return;
  }
  absenceSaveInFlight=true;
  setAbsenceSavingState(true);
  try{
    if(!await ensureBackendReadyForMutations()){
      showToast('Todavía no se ha cargado el estado guardado. Espera un momento y vuelve a intentarlo.','error');
      return;
    }
    data=normalizeStoredRows(data);
    const dia=+document.getElementById('fDia').value;
    const hora=getAbsencePrimaryHour();
    const validation=validateAbsenceFormSafe();
    if(!validation.valid){
      showToast(validation.message||'Revisa los campos marcados antes de guardar.','error');
      if(validation.focus) validation.focus.focus();
      return;
    }
    const ausente=validation.ausente;
    const todoDia=validation.todoDia;
    const obs=document.getElementById('fObs').value.trim();
    const faena=!!document.getElementById('fFaena').checked||!!obs;
    const horasObjetivo=validation.horasLectivas;
    const previousRow=editId?data.find(g=>g&&g.id===editId):null;
    const undoState=buildUndoState(dia);

    document.getElementById('fAusente').value=getVisibleTeacherName(ausente);
    document.getElementById('fGuardia').value='';

    const previousRows=editId?(getCurrentAbsenceEditGroupRows().length?getCurrentAbsenceEditGroupRows():(previousRow?[previousRow]:[])):[];
    const previousIds=new Set(previousRows.map(row=>Number(row.id)).filter(Number.isInteger));
    const previousByHour=new Map(previousRows.map(row=>[Number(row.hora),row]));
    if(todoDia){
      const fullDayResult=await storage.saveFullDayAbsence({
        tipo:'dia_completo',
        profesor:ausente,
        dia,
        faena,
        obs,
        replaceIds:[...previousIds]
      });
      const savedRows=Array.isArray(fullDayResult?.rows)?fullDayResult.rows:[];
      data=await refreshGuardiasFromBackend({render:false});
      clearAbsenceFormErrors();
      closeModal();
      const saveTs=document.getElementById('saveTs');
      if(saveTs) saveTs.textContent='Guardado - '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
      try{
        if(day!==dia) setDay(dia); else renderTable();
      }catch(renderError){
        console.error('Full day absence saved but render failed',renderError);
        showToast('La ausencia se ha guardado, pero la vista no se ha podido actualizar. Recarga la página antes de continuar.','error');
      }
      if(editId){
        addHistoryEntry(
          savedRows.length>1||previousRows.length>1?'Ausencias editadas':'Ausencia editada',
          `${getVisibleTeacherName(ausente)} · ${DIAS[dia]} · ${savedRows.map(row=>formatHoraLabel(row.hora)).join(', ')}`,
          'edit',
          {undoState}
        );
      }else{
        addHistoryEntry('Ausencia de día completo',`${DIAS[dia]} · ${ausente} · ${savedRows.map(row=>formatHoraLabel(row.hora)).join(', ')}`,'create',{undoState});
      }
      showToast(`Ausencia de día completo registrada en ${savedRows.length} horas.`,'success');
      return;
    }
    const horaNum=Number(hora);
    if(!Number.isInteger(horaNum)||horaNum<1||horaNum>9){
      console.warn('[frontend] ausencia individual cancelada por hora inválida',{profesor:ausente,dia,hora});
      showToast('La ausencia no se puede guardar porque la hora seleccionada no es válida.','error');
      return;
    }
    const targetKeys=new Set(horasObjetivo.map(horaItem=>makeAbsenceSyncKey({dia,hora:horaItem,ausente})));
    if(previousIds.size){
      data=data.filter(row=>!previousIds.has(Number(row.id)));
      previousRows.forEach(row=>{
        const oldKey=makeAbsenceSyncKey(row);
        if(oldKey&&!targetKeys.has(oldKey)) pendingDeletedAbsenceKeys.add(oldKey);
      });
    }
    const savedRows=[];
    horasObjetivo.forEach(horaItem=>{
      if(!esHoraValida(horaItem)){
        logInvalidAbsenceHour('skip hora inválida',{profesor:ausente,hora:horaItem});
        return;
      }
      const reuseRow=previousByHour.get(Number(horaItem))||null;
      const taskState=getAbsenceTaskState(ausente,dia,horaItem,faena,obs);
      const aulaReal=resolveAbsenceAulaForSave(ausente,dia,horaItem,reuseRow);
      const entry={dia,hora:horaItem,ausente,guardia:'',aula:aulaReal,faena:taskState.faena,obs:taskState.obs,id:Number.isInteger(Number(reuseRow?.id))?Number(reuseRow.id):nid++};
      data.push(entry);
      savedRows.push(entry);
    });
    if(!savedRows.length){
      showToast('No hay horas válidas para guardar esta ausencia.','error');
      return;
    }
    data=dedupeAbsenceRowsByLogic(data);
    const affectedHoursByDay=new Map();
    [...previousRows,...savedRows].forEach(row=>{
      const diaKey=Number(row.dia);
      if(!affectedHoursByDay.has(diaKey)) affectedHoursByDay.set(diaKey,new Set());
      affectedHoursByDay.get(diaKey).add(Number(row.hora));
    });
    if(!storage.hasBackend()){
      affectedHoursByDay.forEach((hours,diaKey)=>
        reassignGuardiasForDayHours(diaKey,[...hours])
      );
    }
    if(editId){
      addHistoryEntry(
        savedRows.length>1||previousRows.length>1?'Ausencias editadas':'Ausencia editada',
        savedRows.length>1
          ? `${getVisibleTeacherName(ausente)} \u00b7 ${DIAS[dia]} \u00b7 ${savedRows.map(row=>formatHoraLabel(row.hora)).join(', ')}`
          : `${formatHistoryAbsence(previousRow)} -> ${formatHistoryAbsence(savedRows[0])}`,
        'edit',
        {undoState}
      );
    }else if(todoDia){
      addHistoryEntry('Ausencia de d\u00eda completo',`${DIAS[dia]} \u00b7 ${ausente} \u00b7 ${horasObjetivo.map(formatHoraLabel).join(', ')}`,'create',{undoState});
    }else if(savedRows.length>1){
      addHistoryEntry('Ausencias registradas',`${getVisibleTeacherName(ausente)} \u00b7 ${DIAS[dia]} \u00b7 ${savedRows.map(row=>formatHoraLabel(row.hora)).join(', ')}`,'create',{undoState});
    }else{
      addHistoryEntry('Nueva ausencia',formatHistoryAbsence(savedRows[0]),'create',{undoState});
    }

    persist(data);
    clearAbsenceFormErrors();
    closeModal();
    const saveTs=document.getElementById('saveTs');
    if(saveTs) saveTs.textContent='Guardado - '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    try{
      if(day!==dia) setDay(dia); else renderTable();
    }catch(renderError){
      console.error('Absence saved but render failed',renderError);
      showToast('La ausencia se ha guardado, pero la vista no se ha podido actualizar. Recarga la página antes de continuar.','error');
    }

    try{
      const syncResult=await syncAdminStateConfirmed({origin:'absence-save',reason:editId?'edit-absence':'create-absence'});
      if(syncResult?.syncError){
        showToast('La ausencia se ha guardado en local, pero no se ha podido sincronizar con el servidor.','error');
      }else if(syncResult?.partialAuxFailures?.length){
        try{
          await refreshGuardiasFromBackend({render:false});
          if(day!==dia) setDay(dia); else renderTable();
        }catch(refreshError){
          console.warn('Guardias refresh after partial save failed',refreshError);
        }
        showToast('La ausencia se ha guardado, aunque ha fallado parte de la sincronización auxiliar.','info');
      }else if(syncResult?.queued){
        showToast('Ausencia guardada en local. Sincronización en cola.','info');
      }else{
        try{
          await refreshGuardiasFromBackend({render:false});
          if(day!==dia) setDay(dia); else renderTable();
        }catch(refreshError){
          console.warn('Guardias refresh after save failed',refreshError);
        }
        showToast(todoDia?`Ausencia de d\u00eda completo registrada en ${horasObjetivo.length} horas.`:'Ausencia guardada correctamente.','success');
      }
    }catch(syncError){
      console.error('Absence saved but sync trigger failed',syncError);
      showToast('La ausencia se ha guardado en local, pero no se ha podido lanzar la sincronización.','error');
    }
  }catch(error){
    console.error('saveAbsence failed',error);
    showToast('No se pudo guardar la ausencia. Inténtalo de nuevo.','error');
  }finally{
    absenceSaveInFlight=false;
    setAbsenceSavingState(false);
  }
}
function save(){return saveAbsence();}
async function del(){
  const previousRows=getCurrentAbsenceEditGroupRows().length?getCurrentAbsenceEditGroupRows():(editId?data.filter(g=>g.id===editId):[]);
  const deleteCount=previousRows.length||1;
  if(!await askConfirm(deleteCount>1?'Eliminar registros':'Eliminar registro',deleteCount>1?`Se eliminarán ${deleteCount} registros de ausencia de este docente en el día seleccionado.`:'\u00bfQuieres eliminar este registro de ausencia?','Eliminar')) return;
  if(!await ensureBackendReadyForMutations()){
    showToast('Todavía no se ha cargado el estado guardado. Espera un momento y vuelve a intentarlo.','error');
    return;
  }
  const previousRow=previousRows[0]||data.find(g=>g.id===editId);
  const undoState=buildUndoState(previousRow?.dia ?? day);
  const previousIds=new Set(previousRows.map(row=>Number(row.id)).filter(Number.isInteger));
  previousRows.forEach(row=>{
    pendingDeletedAbsenceKeys.add(makeAbsenceSyncKey(row));
    if(Number.isInteger(Number(row.id))) selectedAbsenceIds.delete(Number(row.id));
  });
  data=data.filter(g=>!previousIds.has(Number(g.id)));
  const affectedHoursByDay=new Map();
  previousRows.forEach(row=>{
    const diaKey=Number(row.dia);
    if(!affectedHoursByDay.has(diaKey)) affectedHoursByDay.set(diaKey,new Set());
    affectedHoursByDay.get(diaKey).add(Number(row.hora));
  });
  affectedHoursByDay.forEach((hours,diaKey)=>reassignGuardiasForDayHours(diaKey,[...hours]));
  persist(data);
  if(previousRows.length>1) addHistoryEntry('Ausencias eliminadas',`${getVisibleTeacherName(previousRow?.ausente||'')} \u00b7 ${DIAS[previousRow?.dia??day]} \u00b7 ${previousRows.map(row=>formatHoraLabel(row.hora)).join(', ')}`,'delete',{undoState});
  else if(previousRow) addHistoryEntry('Ausencia eliminada',formatHistoryAbsence(previousRow),'delete',{undoState});
  closeModal();
  renderTable();
  try{
    const syncResult=await syncAdminStateConfirmed({origin:'absence-delete',reason:'delete-absence'});
    if(syncResult?.syncError){
      showToast('El registro se ha eliminado en local, pero no se ha podido sincronizar con el servidor.','error');
    }else if(syncResult?.partialAuxFailures?.length){
      showToast('El registro se ha eliminado y guardado, pero ha fallado parte de la sincronización auxiliar.','info');
    }else if(syncResult?.queued){
      showToast('Registro eliminado en local. Sincronización en cola.','info');
    }else{
      showToast('Registro eliminado.','success');
    }
  }catch(syncError){
    console.error('Absence deleted but sync trigger failed',syncError);
    showToast('El registro se ha eliminado en local, pero no se ha podido lanzar la sincronización.','error');
  }
}
if(tvAnnouncementsDomain){
  renderTvAnnouncement=()=>tvAnnouncementsDomain.render();
  addTvAnnouncement=()=>tvAnnouncementsDomain.add();
  deactivateAllTvAnnouncements=()=>tvAnnouncementsDomain.deactivateAll();
  toggleTvAnnouncementItem=id=>tvAnnouncementsDomain.toggleItem(id);
  removeTvAnnouncementItem=id=>tvAnnouncementsDomain.removeItem(id);
  moveTvAnnouncementItem=(id,direction)=>tvAnnouncementsDomain.moveItem(id,direction);
}
if(tvPanelDomain){
  openTvPanel=()=>tvPanelDomain.openTvPanel();
  closeTvPanel=()=>tvPanelDomain.closeTvPanel();
  openPrintableSchedule=()=>tvPanelDomain.openPrintableSchedule();
  renderTvPanel=()=>tvPanelDomain.renderTvPanel();
  renderPrintSchedule=()=>tvPanelDomain.renderPrintSchedule();
}
let structuredSubstitutionRequests=[];
let structuredSubstitutionTitulars=[];
let structuredSubstitutionCandidates=[];
let structuredLegacyAliases=[];

function substitutionStatusLabel(status){
  return ({pending:'Pendiente de activación',pending_provisioning:'Pendiente de provisión',active:'Activa',finished:'Finalizada',cancelled:'Cancelada',rejected:'Rechazada'})[status]||status||'—';
}
function formatSubstitutionDate(value){
  if(!value) return 'sin fecha';
  const parts=String(value).split('-');
  return parts.length===3?`${parts[2]}/${parts[1]}/${parts[0]}`:String(value);
}
async function loadStructuredSubstitutions(){
  const reads=[storage.fetchSubstitutionRequests(),storage.fetchSubstitutionTitulars(),storage.fetchSubstitutionCandidates()];
  if(isSuperAdmin) reads.push(storage.fetchLegacySubstitutionAliases());
  const [requests,titulars,candidates,legacy]=await Promise.all(reads);
  structuredSubstitutionRequests=Array.isArray(requests?.requests)?requests.requests:[];
  structuredSubstitutionTitulars=Array.isArray(titulars?.titulars)?titulars.titulars:[];
  structuredSubstitutionCandidates=Array.isArray(candidates?.users)?candidates.users:[];
  structuredLegacyAliases=Array.isArray(legacy?.aliases)?legacy.aliases:[];
  const titularSelect=document.getElementById('substitutionTitular');
  if(titularSelect) titularSelect.innerHTML=structuredSubstitutionTitulars.map(item=>`<option value="${Number(item.assignmentId)}">${escapeHtml(item.displayName)} · ${escapeHtml(item.sourceCode||'sin código')}</option>`).join('');
  const candidateSelect=document.getElementById('substitutionCandidate');
  if(candidateSelect) candidateSelect.innerHTML=`<option value="">Persona aún no provisionada</option>${structuredSubstitutionCandidates.map(item=>`<option value="${Number(item.id)}">${escapeHtml(item.displayName||item.username)} · ${escapeHtml(item.username)}${item.active?'':' · inactiva'}</option>`).join('')}`;
  renderStructuredSubstitutionList();
}
function renderStructuredSubstitutionList(){
  const list=document.getElementById('substitutionList');
  if(!list) return;
  const query=normalizeText(document.getElementById('substitutionSearch')?.value||'');
  const rows=structuredSubstitutionRequests.filter(item=>!query||normalizeText(`${item.titular?.displayName||''} ${item.candidate?.displayName||''} ${item.candidate?.username||''} ${item.status||''}`).includes(query));
  list.innerHTML=rows.length?rows.map(item=>{
    const pending=['pending','pending_provisioning'].includes(item.status);
    const adminActions=isAdmin?`${pending?`<button class="btn-substitution btn-substitution-danger" type="button" onclick="cancelStructuredSubstitution(${Number(item.id)})">Cancelar</button>`:''}${item.status==='active'?`<button class="btn-substitution" type="button" onclick="finishStructuredSubstitution(${Number(item.id)})">Finalizar</button>`:''}`:'';
    const superActions=isSuperAdmin?`${pending?`<button class="btn-substitution" type="button" onclick="linkStructuredSubstitution(${Number(item.id)})">Enlazar cuenta</button>`:''}${item.status==='pending_provisioning'?`<button class="btn-substitution" type="button" onclick="provisionStructuredSubstitution(${Number(item.id)})">Provisionar</button>`:''}${item.status==='pending'?`<button class="btn-substitution" type="button" onclick="activateStructuredSubstitution(${Number(item.id)})">Activar</button>`:''}${pending?`<button class="btn-substitution btn-substitution-danger" type="button" onclick="rejectStructuredSubstitution(${Number(item.id)})">Rechazar</button>`:''}`:'';
    return `<article class="substitution-item">
      <div><div class="substitution-item-title">${escapeHtml(item.titular?.displayName||'Titular desconocido')} → ${escapeHtml(item.candidate?.displayName||item.candidate?.username||'Sin identidad')}</div>
      <div class="substitution-item-meta">${escapeHtml(substitutionStatusLabel(item.status))} · ${escapeHtml(formatSubstitutionDate(item.startsOn))} – ${escapeHtml(formatSubstitutionDate(item.plannedEndsOn))}</div></div>
      <div class="substitution-item-actions">${adminActions}${superActions}</div>
    </article>`;
  }).join(''):'<div class="history-empty">No hay solicitudes que coincidan.</div>';
  const legacySection=document.getElementById('legacySubstitutionSection');
  const legacyList=document.getElementById('legacySubstitutionList');
  if(legacySection) legacySection.hidden=!isSuperAdmin;
  if(legacyList&&isSuperAdmin){
    const unresolved=structuredLegacyAliases.filter(item=>item.status==='unresolved');
    legacyList.innerHTML=unresolved.length?unresolved.map(item=>`<article class="substitution-item"><div><div class="substitution-item-title">${escapeHtml(item.titularName)} → ${escapeHtml(item.substituteName)}</div><div class="substitution-item-meta">Alias legacy sin efecto operativo</div></div><div class="substitution-item-actions"><button class="btn-substitution" type="button" onclick="resolveStructuredLegacyAlias(${Number(item.id)})">Reconciliar</button><button class="btn-substitution btn-substitution-danger" type="button" onclick="obsoleteStructuredLegacyAlias(${Number(item.id)})">Obsoleto</button></div></article>`).join(''):'<div class="history-empty">No hay aliases legacy pendientes.</div>';
  }
}
async function openStructuredSubstitutionModal(){
  if(!isAdmin&&!isSuperAdmin) return;
  const form=document.getElementById('substitutionRequestForm');
  if(form) form.hidden=!isAdmin;
  const start=document.getElementById('substitutionStartsOn');
  const end=document.getElementById('substitutionEndsOn');
  const today=new Date().toISOString().slice(0,10);
  if(start&&!start.value) start.value=today;
  if(end&&!end.value){const date=new Date(`${today}T12:00:00`);date.setDate(date.getDate()+14);end.value=date.toISOString().slice(0,10);}
  document.getElementById('substitutionOverlay')?.classList.add('open');
  try{await loadStructuredSubstitutions();}catch(error){showToast(error.message||'No se pudieron cargar las sustituciones.','error');}
}
async function createSubstitutionRequest(){
  if(!isAdmin) return;
  const payload={
    titularAssignmentId:Number(document.getElementById('substitutionTitular')?.value),
    substituteUserId:document.getElementById('substitutionCandidate')?.value||null,
    proposedDisplayName:cleanText(document.getElementById('substitutionCandidateName')?.value),
    proposedUsername:cleanText(document.getElementById('substitutionCandidateUsername')?.value),
    startsOn:document.getElementById('substitutionStartsOn')?.value,
    plannedEndsOn:document.getElementById('substitutionEndsOn')?.value
  };
  try{await storage.createSubstitutionRequest(payload);await loadStructuredSubstitutions();showToast('Solicitud de sustitución creada.','success');}catch(error){showToast(error.message||'No se pudo crear la solicitud.','error');}
}
async function cancelStructuredSubstitution(id){
  if(!isAdmin||!await askConfirm('Cancelar solicitud','La solicitud quedará conservada como cancelada.','Cancelar')) return;
  try{await storage.cancelSubstitutionRequest(id,{});await loadStructuredSubstitutions();showToast('Solicitud cancelada.','success');}catch(error){showToast(error.message,'error');}
}
async function finishStructuredSubstitution(id){
  if(!isAdmin) return;
  const request=structuredSubstitutionRequests.find(item=>Number(item.id)===Number(id));
  const lastEffectiveOn=cleanText(await askText('Finalizar sustitución','Indica el último día efectivo, que permanece incluido.',request?.plannedEndsOn||'','AAAA-MM-DD','Finalizar'));
  if(!lastEffectiveOn) return;
  try{await storage.finishSubstitutionRequest(id,{lastEffectiveOn});await loadStructuredSubstitutions();showToast('Sustitución finalizada.','success');}catch(error){showToast(error.message,'error');}
}
async function linkStructuredSubstitution(id){
  if(!isSuperAdmin) return;
  const userId=Number(cleanText(await askText('Enlazar cuenta','Indica el ID de una cuenta existente. Se garantizará únicamente el rol teacher.','','ID de usuario','Enlazar')));
  if(!Number.isInteger(userId)||userId<=0) return showToast('ID de usuario no válido.','error');
  try{await storage.linkSubstitutionUser(id,userId);await loadStructuredSubstitutions();showToast('Identidad enlazada.','success');}catch(error){showToast(error.message,'error');}
}
async function provisionStructuredSubstitution(id){
  if(!isSuperAdmin) return;
  const request=structuredSubstitutionRequests.find(item=>Number(item.id)===Number(id));
  const username=cleanText(await askText('Provisionar sustituto','Indica el nombre de usuario. Solo se concederá teacher.',request?.candidate?.username||'','Usuario','Continuar'));
  if(!username) return;
  const displayName=cleanText(await askText('Nombre visible','Indica el nombre completo de la persona.',request?.candidate?.displayName||'','Nombre visible','Provisionar'));
  if(!displayName) return;
  try{const result=await storage.provisionSubstitutionUser(id,{username,displayName});await loadStructuredSubstitutions();window.alert(`Credencial temporal (se muestra una sola vez)\nUsuario: ${result.user.username}\nContraseña: ${result.temporaryPassword}`);}catch(error){showToast(error.message,'error');}
}
async function activateStructuredSubstitution(id){
  if(!isSuperAdmin||!await askConfirm('Activar sustitución','Se creará la asignación docente efectiva dentro del intervalo indicado.','Activar')) return;
  try{await storage.activateSubstitutionRequest(id);await loadStructuredSubstitutions();await pollBackendState(true);showToast('Sustitución activada.','success');}catch(error){showToast(error.message,'error');}
}
async function rejectStructuredSubstitution(id){
  if(!isSuperAdmin||!await askConfirm('Rechazar solicitud','La solicitud quedará conservada como rechazada.','Rechazar')) return;
  try{await storage.rejectSubstitutionRequest(id,{});await loadStructuredSubstitutions();showToast('Solicitud rechazada.','success');}catch(error){showToast(error.message,'error');}
}
async function resolveStructuredLegacyAlias(id){
  if(!isSuperAdmin) return;
  const titularAssignmentId=Number(cleanText(await askText('Reconciliar alias','Indica el ID de la asignación titular. No se inferirá por nombre.','','ID titular','Continuar')));
  if(!Number.isInteger(titularAssignmentId)||titularAssignmentId<=0) return;
  const substituteUserIdText=cleanText(await askText('Identidad sustituta','ID de usuario existente, o deja vacío para provisionar después.','','ID opcional','Continuar'));
  const startsOn=cleanText(await askText('Inicio','Fecha de inicio real.','','AAAA-MM-DD','Continuar'));
  const plannedEndsOn=cleanText(await askText('Fin previsto','Último día incluido.','','AAAA-MM-DD','Reconciliar'));
  try{await storage.resolveLegacySubstitutionAlias(id,{titularAssignmentId,substituteUserId:substituteUserIdText?Number(substituteUserIdText):null,startsOn,plannedEndsOn});await loadStructuredSubstitutions();showToast('Alias reconciliado como solicitud pendiente.','success');}catch(error){showToast(error.message,'error');}
}
async function obsoleteStructuredLegacyAlias(id){
  if(!isSuperAdmin||!await askConfirm('Marcar obsoleto','El alias se conservará sin efecto operativo.','Marcar')) return;
  try{await storage.markLegacySubstitutionAliasObsolete(id,{});await loadStructuredSubstitutions();showToast('Alias marcado como obsoleto.','success');}catch(error){showToast(error.message,'error');}
}

if(historyDomain){
  renderHistoryList=()=>{historyDomain.setFilter(historyFilter);return historyDomain.renderList();};
  setHistoryFilter=filter=>{historyFilter=filter||'all';historyDomain.setFilter(historyFilter);};
  openHistoryModal=async()=>{
    try{
      const rows=await storage.fetchHistorial();
      historialCambios=Array.isArray(rows)?rows:[];
      historyDomain.setEntries(historialCambios);
      persistHistorial(historialCambios);
    }catch(error){console.warn('Operational history refresh failed',error);}
    historyDomain.openModal();
  };
  closeHistoryModal=()=>historyDomain.closeModal();
  bgHistoryClose=e=>historyDomain.bgClose(e);
  clearHistory=()=>historyDomain.clear();
  undoLastHistoryChange=()=>historyDomain.undoLastChange();
}
if(substitutionsDomain){
  renderSubstitutionList=()=>renderStructuredSubstitutionList();
  openSubstitutionModal=()=>openStructuredSubstitutionModal();
  closeSubstitutionModal=()=>substitutionsDomain.closeModal();
  bgSubstitutionClose=e=>substitutionsDomain.bgClose(e);
  assignTeacherSubstitution=()=>openStructuredSubstitutionModal();
  clearTeacherSubstitution=()=>openStructuredSubstitutionModal();
}
if(practicasGuardiasDomain){
  renderPracticasGuardiasList=()=>{practicasGuardiasDomain.setFilter(practicasGuardiasFilter);return practicasGuardiasDomain.renderList();};
  openPracticasGuardiasModal=()=>practicasGuardiasDomain.openModal();
  closePracticasGuardiasModal=()=>practicasGuardiasDomain.closeModal();
  bgPracticasGuardiasClose=e=>practicasGuardiasDomain.bgClose(e);
  openPracticasGuardiasTeacherConfig=nombre=>{practicasGuardiasConfigTeacher=nombre||'';return practicasGuardiasDomain.openTeacherConfig(practicasGuardiasConfigTeacher);};
  closePracticasGuardiasTeacherConfig=()=>{practicasGuardiasConfigTeacher='';return practicasGuardiasDomain.closeTeacherConfig();};
  renderPracticasGuardiasConfig=()=>{
    if(practicasGuardiasConfigTeacher){
      return practicasGuardiasDomain.openTeacherConfig(practicasGuardiasConfigTeacher);
    }
    return practicasGuardiasDomain.closeTeacherConfig();
  };
  toggleTeacherPracticasGuardias=nombre=>practicasGuardiasDomain.toggleTeacher(nombre);
  toggleTeacherPracticasGuardiasSlot=(nombre,dia,hora)=>practicasGuardiasDomain.toggleSlot(nombre,dia,hora);
}

document.getElementById('fDia').addEventListener('change',()=>{renderAbsenceHourChoices();populateProfesoresGuardia();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();renderAusenteSuggestions(true);setFieldError('fDia','');});
document.getElementById('fHora').addEventListener('change',()=>{
  const rawHour=Number(document.getElementById('fHora').value);
  if(!esHoraValida(rawHour)){
    logInvalidAbsenceHour('skip hora inválida',{profesor:getCurrentAbsenceTeacher()||'',hora:rawHour});
    setFieldError('fHora','La hora seleccionada no es válida.');
    setAbsenceSelectedHours([1]);
  }else{
    setAbsenceSelectedHours([rawHour]);
    setFieldError('fHora','');
  }
  syncAbsencePrimaryHour();renderAbsenceHourChoices();populateProfesoresGuardia();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();renderAusenteSuggestions(true);
});
document.getElementById('fTodoDia').addEventListener('change',()=>{syncTodoDiaMode();renderAbsenceHourChoices();syncGuardiaPreview();renderAbsenceDecisionBar();});
document.getElementById('fAusente').addEventListener('change',()=>{renderAbsenceHourChoices();syncGuardiaPreview();renderAusentePreview();renderAbsenceDecisionBar();renderAusenteSuggestions(true);setFieldError('fAusente','');});
document.getElementById('fAusente').addEventListener('input',handleAusenteInput);
document.getElementById('fAusente').addEventListener('focus',()=>renderAusenteSuggestions(true));
document.getElementById('fAusente').addEventListener('click',()=>renderAusenteSuggestions(true));
document.getElementById('fAusente').addEventListener('keydown',handleAusenteKeydown);
document.getElementById('fAusente').addEventListener('blur',()=>window.setTimeout(closeAusenteSuggestions,120));
document.getElementById('fGuardia').addEventListener('input',()=>setFieldError('fGuardia',''));
document.getElementById('fGuardia').addEventListener('change',()=>setFieldError('fGuardia',''));
const ausenteSuggestions=document.getElementById('ausenteSuggestions');
if(ausenteSuggestions){
  ausenteSuggestions.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-teacher-name]');
    if(!button) return;
    event.preventDefault();
    selectAusenteSuggestion(button.dataset.teacherName||'');
  });
}
const absenceHoursGrid=document.getElementById('fHorasMulti');
if(absenceHoursGrid){
  absenceHoursGrid.addEventListener('click',event=>{
    const button=event.target.closest('[data-absence-hour]');
    if(!button||button.disabled) return;
    const hora=Number(button.dataset.absenceHour);
    if(!esHoraValida(hora)){
      logInvalidAbsenceHour('skip hora inválida',{profesor:getCurrentAbsenceTeacher()||'',hora});
      setFieldError('fHorasMulti','La hora seleccionada no es válida.');
      return;
    }
    const current=new Set(getAbsenceSelectedHours());
    if(current.has(hora)) current.delete(hora); else current.add(hora);
    const next=[...current].filter(esHoraValida).sort((a,b)=>a-b);
    const fallbackHour=Number(document.getElementById('fHora')?.value||hora);
    setAbsenceSelectedHours(next.length?next:[esHoraValida(fallbackHour)?fallbackHour:1]);
    syncAbsencePrimaryHour();
    renderAbsenceHourChoices();
    populateProfesoresGuardia();
    syncGuardiaPreview();
    renderAusentePreview();
    renderAbsenceDecisionBar();
    setFieldError('fHorasMulti','');
  });
}
const batchSelectAllInput=document.getElementById('batchSelectAll');
if(batchSelectAllInput){
  batchSelectAllInput.addEventListener('change',event=>{
    toggleSelectAllAbsences(!!event.target.checked);
  });
}
const deleteSelectedAbsencesButton=document.getElementById('btnDeleteSelectedAbsences');
if(deleteSelectedAbsencesButton){
  deleteSelectedAbsencesButton.addEventListener('click',()=>{ deleteSelectedAbsences(); });
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
const groupStatesSearch=document.getElementById('groupStatesSearch');
if(groupStatesSearch){
  groupStatesSearch.addEventListener('input',event=>{
    groupStateFilter=event.target.value||'';
    renderGroupStatesPanel();
  });
}
const groupStatesList=document.getElementById('groupStatesList');
if(groupStatesList){
  groupStatesList.addEventListener('click',event=>{
    const button=event.target.closest('[data-group-state-toggle]');
    if(!button) return;
    toggleGroupState(button.dataset.groupStateToggle||'');
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
  teacherLoginInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loginTeacher();}});
}
document.getElementById('teacherLoginPassword')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loginTeacher();}});
const restoreSnapshotInput=document.getElementById('restoreSnapshotInput');
if(restoreSnapshotInput){
  restoreSnapshotInput.addEventListener('change',event=>{
    const file=event.target.files?.[0];
    if(file) restoreSnapshotFromFile(file);
  });
}
const annualImportXmlInput=document.getElementById('annualImportXmlInput');
if(annualImportXmlInput){
  annualImportXmlInput.addEventListener('change',event=>{
    const file=event.target.files?.[0];
    if(file) importAnnualXmlFile(file);
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
safeInitStep(renderPills,'renderPills');
safeInitStep(()=>{renderGuardiasUiIfChanged(true);},'renderGuardiasUi');
safeInitStep(renderTvAnnouncement,'renderTvAnnouncement');
safeInitStep(renderSubstitutionList,'renderSubstitutionList');
safeInitStep(renderPracticasGuardiasList,'renderPracticasGuardiasList');
safeInitStep(renderPracticasGuardiasConfig,'renderPracticasGuardiasConfig');
safeInitStep(renderGroupStatesPanel,'renderGroupStatesPanel');
safeInitStep(renderFutureAbsenceAdminList,'renderFutureAbsenceAdminList');
safeInitStep(renderTeacherFutureAbsenceOwnList,'renderTeacherFutureAbsenceOwnList');
safeInitStep(syncTeacherIdentity,'syncTeacherIdentity');
safeInitStep(refreshAccessUi,'refreshAccessUi');
safeInitStep(syncAppModeClasses,'syncAppModeClasses');
safeInitStep(()=>{initializeApp().catch(error=>console.error('Init step failed: initializeApp',error));},'initializeApp');
let lastRenderedSchoolSlotKey=JSON.stringify(getCurrentSchoolSlot());
let lastAbsenceLayoutMobile=isMobileAbsenceLayout();
window.addEventListener('resize',()=>{
  const nextAbsenceLayoutMobile=isMobileAbsenceLayout();
  if(nextAbsenceLayoutMobile===lastAbsenceLayoutMobile) return;
  lastAbsenceLayoutMobile=nextAbsenceLayoutMobile;
  renderTable();
});
window.setInterval(()=>{
  const nextKey=JSON.stringify(getCurrentSchoolSlot());
  if(nextKey===lastRenderedSchoolSlotKey) return;
  lastRenderedSchoolSlotKey=nextKey;
  renderTable();
  if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
},60000);
window.setInterval(()=>{
  hydrateGroupStates();
  if(shouldHydrateTeacherFutureAbsencesOnInterval()) hydrateTeacherFutureAbsences();
  if(shouldHydrateAlumnosFueraAulaOnInterval()){
    hydrateAlumnosFueraAula().then(changed=>{
      if(changed){
        renderTable();
        if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
      }
    });
  }
  pollBackendState();
},BACKEND_POLL_INTERVAL_MS);
window.setInterval(()=>{
  if(isSuperAdmin){
    refreshSuperAdminOps(false);
  }
},SUPERADMIN_INFO_REFRESH_MS);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){
    hydrateGroupStates();
    hydrateTeacherSubstitutions();
    hydrateTeacherPracticasGuardias();
    hydrateTeacherFutureAbsences();
    pollBackendState(true);
    if(isSuperAdmin){
      refreshSuperAdminOps(true);
    }
  }
});
window.addEventListener('guardias-auth-invalid',()=>{
  if(!currentAuthSession?.authenticated&&!isAdmin&&!isSuperAdmin) return;
  currentAuthSession=null;
  canAdmin=false;
  canSuperAdmin=false;
  isAdmin=false;
  isSuperAdmin=false;
  teacherName='';
  authenticatedTeacherSourceCode='';
  teacherIdentityConfirmedFor='';
  closeTeacherPanel();
  document.getElementById('teacherBar')?.classList.remove('show');
  refreshAccessUi();
  renderTable();
  showToast('La sesi\u00f3n ha caducado.','error');
});

if(window.PROFESORADO_SOURCE_ERROR){
  const banner=document.createElement('div');
  banner.setAttribute('role','alert');
  banner.style.cssText='position:sticky;top:0;z-index:9999;padding:12px 18px;background:#8b1e1e;color:white;font-weight:800;text-align:center';
  banner.textContent=window.PROFESORADO_SOURCE_ERROR;
  document.body.prepend(banner);
}




