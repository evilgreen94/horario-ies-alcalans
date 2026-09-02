(function initGuardiasTeacher(global){
  const DEFAULT_KEYS={
    tareas:'IES_Alcalans_Tareas_Profesorado',
    teacherUser:'IES_Alcalans_Profesorado_Actual',
    teacherRecents:'IES_Alcalans_Profesorado_Recientes',
    teacherMoods:'IES_Alcalans_Profesorado_Estado_Animo',
    sessionOverrides:'IES_Alcalans_Sesiones_Profesorado',
    alumnosFueraAula:'IES_Alcalans_Alumnos_Fuera_Aula'
  };

  const DEFAULT_HANDLER_NAMES={
    changeAlumnosFueraAula:'changeAlumnosFueraAula',
    changeTeacherWeekOffset:'changeTeacherWeekOffset',
    closeTeacherAccess:'closeTeacherAccess',
    closeTeacherPanel:'closeTeacherPanel',
    exitTeacherMode:'exitTeacherMode',
    focusTeacherDutyHour:'focusTeacherDutyHour',
    loginTeacher:'loginTeacher',
    openTeacherAccess:'openTeacherAccess',
    openTeacherPanel:'openTeacherPanel',
    resetTeacherMood:'resetTeacherMood',
    saveTeacherTask:'saveTeacherTask',
    selectTeacherMood:'selectTeacherMood',
    setTeacherDay:'setTeacherDay'
  };

  const DEFAULT_MOOD_OPTIONS=[
    {
      id:'contento',
      emoji:'\uD83D\uDE0A',
      label:'Contento',
      tone:'warm',
      welcome:'Hoy vienes con buena cara.',
      messages:[
        'Buen animo, buena letra y que no falle el cafe.',
        'Hoy vas con chispa y se nota desde primera hora.',
        'Pinta a jornada de llevarla con una sonrisa decente.',
        'Con este animo, hasta la guardia parece amable.',
        'Hoy puedes con el grupo dificil... y con el facil tambien.',
        'Dia perfecto para que todo fluya, o al menos lo parezca.',
        'Hoy hay energia de sobra para sacar adelante la manana.',
        'Se nota que hoy vienes con el aula de tu parte.'
      ]
    },
    {
      id:'cansado',
      emoji:'\uD83D\uDE34',
      label:'Cansado',
      tone:'soft',
      welcome:'Dia de ir con calma y cafe cerca.',
      messages:[
        'Hoy toca sobrevivir con dignidad y alguna taza extra.',
        'Modo ahorro de energia, pero seguimos en pie.',
        'Conviene que la tercera hora no pida heroicidades.',
        'Si hoy no brillas, al menos que no explote nada.',
        'Dia de tirar de experiencia mas que de entusiasmo.',
        'Reducimos expectativas, mantenemos el tipo.',
        'Hoy con llegar al recreo medio entero ya se considera exito.',
        'Jornada de resistencia tranquila y oficio docente.'
      ]
    },
    {
      id:'enfadado',
      emoji:'\uD83D\uDE24',
      label:'Enfadado',
      tone:'strong',
      welcome:'Respiramos hondo y seguimos.',
      messages:[
        'Mejor contar hasta diez antes de abrir ciertos correos.',
        'Hoy viene bien una respiracion larga entre clase y clase.',
        'Que el dia no pruebe demasiado la paciencia, por favor.',
        'Si algo puede esperar, que espere.',
        'Hoy la diplomacia es tu mejor herramienta.',
        'No todo merece respuesta inmediata.',
        'Conviene elegir muy bien que batalla merece la pena.',
        'Hoy toca firmeza sin regalar energia de mas.'
      ]
    },
    {
      id:'triste',
      emoji:'\uD83D\uDE14',
      label:'Triste',
      tone:'soft',
      welcome:'Hoy toca cuidarse un poco mas.',
      messages:[
        'Vamos pasito a pasito y sin pedir mas de la cuenta.',
        'Dia de llevarlo con mimo y algo de aire entre horas.',
        'Hoy conviene tratarse con un poco mas de suavidad.',
        'Cumplir ya es suficiente hoy.',
        'Permitete ir mas lento.',
        'Lo importante hoy es llegar, no destacar.',
        'A veces sostener el dia ya es bastante.',
        'Hoy toca bajar un poco el ritmo y protegerse.'
      ]
    },
    {
      id:'guino',
      emoji:'\uD83D\uDE09',
      label:'Guino gracioso',
      tone:'playful',
      welcome:'Modo ironia elegante activado.',
      messages:[
        'Hoy toca sacar oficio, humor fino y seguir adelante.',
        'Modo supervivencia elegante activado. Que sea leve.',
        'Si el dia se pone raro, al menos que nos pille con estilo.',
        'Sonrie, que nadie sepa el caos que hay detras.',
        'Hoy improvisamos... pero con dignidad.',
        'Todo bajo control... mas o menos.',
        'Que no falte cafe, tablas y una mirada complice.',
        'Hoy se ensena, se resuelve y se disimula estupendamente.'
      ]
    },
    {
      id:'saturado',
      emoji:'\uD83E\uDD2F',
      label:'Saturado',
      tone:'neutral',
      welcome:'Demasiadas cosas en la cabeza.',
      messages:[
        'Prioriza: no todo es urgente aunque lo parezca.',
        'Hoy toca ir bloque a bloque.',
        'Si sobrevives al correo, ya es victoria.',
        'Paso corto, vista al frente.',
        'Una cosa cada vez. Literalmente.',
        'Entre reuniones, tutorias y clases, respira.',
        'Hoy conviene no abrir mas frentes de los necesarios.',
        'Haz primero lo que mas despeje la manana.'
      ]
    },
    {
      id:'motivado',
      emoji:'\uD83D\uDD25',
      label:'Motivado',
      tone:'energetic',
      welcome:'Hoy vienes con ganas de liarla, pero bien.',
      messages:[
        'Dia perfecto para probar algo nuevo en clase.',
        'Hoy puedes marcar la diferencia en el aula.',
        'Ese grupo hoy te lo ganas.',
        'Aprovecha la inercia, no siempre pasa.',
        'Hoy hay energia de proyecto interesante.',
        'Buen dia para innovar sin pedir permiso al aburrimiento.',
        'Hoy se nota vocacion y oficio a partes iguales.',
        'Pinta a clase de las que dejan huella.'
      ]
    },
    {
      id:'automatico',
      emoji:'\uD83E\uDDEA',
      label:'Modo automatico',
      tone:'neutral',
      welcome:'Hoy se tira de oficio.',
      messages:[
        'Sin emociones, pero con eficacia.',
        'Hoy funciona el piloto automatico.',
        'Cumplir el guion ya es suficiente.',
        'Ni brillante ni desastroso: correcto.',
        'Dia de rutina bien ejecutada.',
        'Hoy manda la estructura mas que la inspiracion.',
        'Clase preparada, cafe listo y adelante.',
        'No hace falta epica para sacar el dia.'
      ]
    },
    {
      id:'caotico',
      emoji:'\uD83C\uDF2A\uFE0F',
      label:'Caotico',
      tone:'playful',
      welcome:'Hoy pinta a dia movido.',
      messages:[
        'A ver que sorpresa trae cada hora.',
        'Planifica, pero con flexibilidad maxima.',
        'Hoy el horario es orientativo.',
        'Si algo sale segun lo previsto, celebralo.',
        'Dia de adaptacion continua.',
        'Entre cambios, avisos y carreras, manten el rumbo.',
        'Hoy toca improvisar con elegancia docente.',
        'Que el caos no te quite el compas.'
      ]
    },
    {
      id:'tranquilo',
      emoji:'\uD83D\uDE0C',
      label:'Tranquilo',
      tone:'warm',
      welcome:'Dia equilibrado por delante.',
      messages:[
        'Sin prisa, pero sin pausa.',
        'Hoy todo deberia ir razonablemente bien.',
        'Dia para trabajar con calma y cabeza.',
        'Aprovecha la estabilidad.',
        'Buen dia para avanzar sin ruido.',
        'Hoy el aula invita a trabajar con serenidad.',
        'Cuando todo esta en su sitio, se nota.',
        'Jornada amable para ensenar sin sobresaltos.'
      ]
    }
  ];

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function createNoopStorage(){
    return {
      readJson:function(_key,fallback){return fallback;},
      readText:function(_key,fallback){return fallback || '';},
      writeJson:function(){},
      writeText:function(){}
    };
  }

  function cloneJson(value){
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeIndex(value,min,max,fallback){
    const numeric=Number(value);
    if(!Number.isInteger(numeric)) return fallback;
    return Math.max(min,Math.min(max,numeric));
  }

  function isPromiseLike(value){
    return !!value && typeof value.then==='function';
  }

  function callOptional(fn){
    return typeof fn==='function' ? fn() : undefined;
  }

  function createTeacherController(config){
    const options=config || {};
    const core=Object.assign({},global.GuardiasCore || {},options.core || {});
    const ui=Object.assign({},global.GuardiasUi || {},options.ui || {});
    const storage=options.storage || global.storage || createNoopStorage();
    const hooks=options.hooks || {};
    const catalog=options.catalog || {};
    const keys=Object.assign({},DEFAULT_KEYS,options.keys || {});
    const handlerNames=Object.assign({},DEFAULT_HANDLER_NAMES,options.handlerNames || {});
    const moodOptions=(Array.isArray(options.moodOptions) && options.moodOptions.length ? options.moodOptions : DEFAULT_MOOD_OPTIONS).map(item=>cloneJson(item));
    const dias=Array.isArray(options.dias) && options.dias.length ? options.dias.slice() : ['Lunes','Martes','Miercoles','Jueves','Viernes'];
    const horaMap=options.horaMap || {};
    const horasPatio=options.horasPatio instanceof Set ? new Set([...options.horasPatio]) : new Set(options.horasPatio || []);
    const maxAlumnosFueraAula=Math.max(1,Number(options.maxAlumnosFueraAula) || 10);
    const groupsByCode=options.groupsByCode || {};
    const teachersByName=catalog.teachersByName || {};
    const rawTeachers=Array.isArray(catalog.rawTeachers) ? catalog.rawTeachers.slice() : [];
    const allTeachersSource=Array.isArray(catalog.allTeachers) && catalog.allTeachers.length
      ? catalog.allTeachers.slice()
      : Object.keys(teachersByName);
    const teacherNames=[...new Set(allTeachersSource.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const cleanText=typeof core.cleanText==='function' ? core.cleanText : function(value){return String(value ?? '').replace(/\s+/g,' ').trim();};
    const normalizeText=typeof core.normalizeText==='function' ? core.normalizeText : function(value){return cleanText(value).toLowerCase();};
    const sameNormalizedText=typeof core.sameNormalizedText==='function' ? core.sameNormalizedText : function(a,b){return normalizeText(a)===normalizeText(b);};
    const stripDiacritics=typeof core.stripDiacritics==='function' ? core.stripDiacritics : function(value){return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');};
    const formatDateKey=typeof core.formatDateKey==='function' ? core.formatDateKey : function(date){
      const year=date.getFullYear();
      const month=String(date.getMonth()+1).padStart(2,'0');
      const day=String(date.getDate()).padStart(2,'0');
      return `${year}-${month}-${day}`;
    };
    const formatWeekRangeLabel=typeof core.formatWeekRangeLabel==='function'
      ? core.formatWeekRangeLabel
      : function(weekKey){
        return cleanText(weekKey) || 'Semana lectiva';
      };
    const getSchoolWeekKeyFromOffset=typeof core.getSchoolWeekKeyFromOffset==='function'
      ? core.getSchoolWeekKeyFromOffset
      : function(offset){return String(offset || 0);};
    const askConfirm=typeof ui.askConfirm==='function' ? ui.askConfirm : async function(){return true;};
    const showToast=typeof ui.showToast==='function' ? ui.showToast : function(){};

    const teachersByNormalized=Object.fromEntries(Object.keys(teachersByName).map(nombre=>[normalizeText(nombre),nombre]));
    const allTeachersByNormalized=Object.fromEntries(teacherNames.map(nombre=>[normalizeText(nombre),nombre]));
    let teacherSubstitutions=normalizeTeacherSubstitutions(options.teacherSubstitutions || hooks.getTeacherSubstitutions?.() || {});

    const state={
      teacherName:'',
      teacherDay:normalizeIndex(options.initialTeacherDay ?? getCurrentDay(),0,dias.length-1,0),
      teacherWeekOffset:normalizeTeacherWeekOffset(options.initialTeacherWeekOffset ?? getCurrentWeekOffset()),
      teacherAccessMatches:[],
      teacherAccessActiveIndex:-1,
      teacherRecents:loadTeacherRecents(),
      teacherIdentityConfirmedFor:'',
      teacherMoodEntries:loadTeacherMoods(),
      teacherDutyFocusTimer:null,
      sessionOverrides:loadSessionOverrides(),
      tareasProfesorado:loadTareas(),
      alumnosFueraAula:loadAlumnosFueraAula()
    };
    const persistedTeacher=loadTeacherUser();
    if(getProfesor(persistedTeacher)) state.teacherName=persistedTeacher;

    function getCurrentDay(){
      return normalizeIndex(callOptional(hooks.getCurrentDay),0,dias.length-1,0);
    }

    function getCurrentWeekOffset(){
      return normalizeTeacherWeekOffset(callOptional(hooks.getCurrentWeekOffset));
    }

    function normalizeTeacherWeekOffset(value){
      return normalizeIndex(value,-1,3,0);
    }

    function formatHoraLabel(hora){
      const info=horaMap[hora];
      return info ? `${info.label} hora (${info.rango})` : `Hora ${hora}`;
    }

    function getCurrentDateIso(){
      return new Date().toISOString().slice(0,10);
    }

    function isCurrentWeekOffset(offset){
      return Number(offset || 0)===0;
    }

    function isTeacherCurrentWeek(){
      return isCurrentWeekOffset(state.teacherWeekOffset);
    }

    function getTeacherSelectedWeekKey(){
      return getSchoolWeekKeyFromOffset(state.teacherWeekOffset);
    }

    function getRowsForWeekOffset(offset){
      const rows=typeof hooks.getRowsForWeekOffset==='function' ? hooks.getRowsForWeekOffset(offset) : [];
      return Array.isArray(rows) ? rows : [];
    }

    function getTeacherWeekRowsForDay(targetDay){
      return getRowsForWeekOffset(state.teacherWeekOffset)
        .filter(row=>Number(row?.dia)===Number(targetDay))
        .sort((a,b)=>Number(a.hora)-Number(b.hora));
    }

    function normalizeTeacherSubstitutions(rows){
      if(Array.isArray(rows)){
        return Object.fromEntries(
          rows
            .map(row=>[resolveTeacherCanonicalName(row?.profesor),cleanText(row?.sustituto)])
            .filter(([profesor,sustituto])=>getProfesor(profesor) && cleanText(sustituto))
        );
      }
      return Object.entries(rows || {}).reduce((acc,[profesor,sustituto])=>{
        const canonical=resolveTeacherCanonicalName(profesor);
        if(getProfesor(canonical) && cleanText(sustituto)) acc[canonical]=cleanText(sustituto);
        return acc;
      },{});
    }

    function setTeacherSubstitutions(nextMap){
      teacherSubstitutions=normalizeTeacherSubstitutions(nextMap);
      syncTeacherIdentity();
      return getTeacherSubstitutions();
    }

    function getTeacherSubstitutions(){
      return {...teacherSubstitutions};
    }

    function resolveTeacherCanonicalName(nombre){
      const cleaned=cleanText(nombre);
      if(!cleaned) return '';
      return teachersByNormalized[normalizeText(cleaned)] || allTeachersByNormalized[normalizeText(cleaned)] || cleaned;
    }

    function getProfesor(nombre){
      const canonical=resolveTeacherCanonicalName(nombre);
      return canonical ? teachersByName[canonical] || null : null;
    }

    function getVisibleTeacherName(nombre){
      const canonical=resolveTeacherCanonicalName(nombre);
      return cleanText(teacherSubstitutions[canonical]) || canonical || cleanText(nombre) || '';
    }

    function getTeacherDisplayMeta(nombre){
      const canonical=resolveTeacherCanonicalName(nombre);
      const visible=getVisibleTeacherName(canonical);
      if(!visible || visible===canonical) return '';
      return `Sustituye a ${canonical}`;
    }

    function getTeacherSearchNames(nombre){
      const canonical=resolveTeacherCanonicalName(nombre);
      const visible=getVisibleTeacherName(canonical);
      return [...new Set([canonical,visible].map(cleanText).filter(Boolean))];
    }

    function makeTeacherUsername(nombre){
      return stripDiacritics(nombre)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g,'.')
        .replace(/^\.|\.$/g,'');
    }

    function getTeacherUsernames(nombre){
      return [...new Set(getTeacherSearchNames(nombre).map(makeTeacherUsername).filter(Boolean))];
    }

    function normalizeTeacherSearch(value){
      return normalizeText(value);
    }

    function getTeacherSearchTokens(value){
      return normalizeTeacherSearch(value).split(/[\s._-]+/).filter(Boolean);
    }

    function teacherMatchesQuery(nombre,query){
      const tokens=getTeacherSearchTokens(query);
      if(!tokens.length) return true;
      const candidates=[...getTeacherSearchNames(nombre).map(normalizeTeacherSearch),...getTeacherUsernames(nombre)];
      return tokens.every(token=>candidates.some(candidate=>candidate.includes(token)));
    }

    function resolveTeacherFromInputValue(value){
      const text=cleanText(value);
      if(!text) return '';
      const normalized=normalizeTeacherSearch(text);
      const exact=teacherNames.find(nombre=>
        getTeacherSearchNames(nombre).some(candidate=>normalizeTeacherSearch(candidate)===normalized) ||
        getTeacherUsernames(nombre).includes(normalized)
      );
      if(exact) return exact;
      const matches=getTeacherAccessMatches(text);
      return matches.length===1 ? matches[0] : '';
    }

    function getRawTeacherByName(nombre){
      const normalized=normalizeText(nombre);
      if(!normalized) return null;
      return rawTeachers.find(item=>normalizeText(item?.nombre)===normalized) || null;
    }

    function getHorarioProfesorDia(nombre,dia){
      return getProfesor(nombre)?.horario?.[dia] || {};
    }

    function getRawTeacherScheduledHours(nombre,dia){
      const teacher=getRawTeacherByName(resolveTeacherCanonicalName(nombre) || nombre);
      if(!teacher) return [];
      return [...new Set(
        [...(teacher.horario || []),...(teacher.guardias || [])]
          .filter(item=>Number(item?.dia)===Number(dia))
          .map(item=>Number(item?.hora ?? item?.franja))
          .filter(hora=>Number.isInteger(hora) && !horasPatio.has(hora))
      )].sort((a,b)=>a-b);
    }

    function getHorasProgramadasProfesorDia(nombre,dia){
      const sesiones=getHorarioProfesorDia(nombre,dia);
      const horas=Object.keys(sesiones)
        .map(Number)
        .filter(hora=>!horasPatio.has(hora) && sesiones[hora])
        .sort((a,b)=>a-b);
      return horas.length ? horas : getRawTeacherScheduledHours(nombre,dia);
    }

    function getHorasLectivasProfesorDia(nombre,dia){
      return getHorasProgramadasProfesorDia(nombre,dia)
        .filter(hora=>getHorarioProfesorDia(nombre,dia)?.[hora]?.tipo!=='guardia');
    }

    function getTeacherSummaryForDay(nombre,targetDay){
      const horas=getHorasLectivasProfesorDia(nombre,targetDay);
      const nextHour=horas.find(hora=>hora>=1) || null;
      return {horas,nextHour};
    }

    function getTeacherAccessMatches(value){
      const query=normalizeTeacherSearch(value);
      const recents=state.teacherRecents.filter(nombre=>teacherMatchesQuery(nombre,query));
      const recentSet=new Set(recents);
      const ranked=teacherNames
        .filter(nombre=>!recentSet.has(nombre))
        .map(nombre=>{
          const normalizedNames=getTeacherSearchNames(nombre).map(normalizeTeacherSearch);
          const usernames=getTeacherUsernames(nombre);
          const tokens=getTeacherSearchTokens(query);
          if(query && !tokens.every(token=>[...normalizedNames,...usernames].some(candidate=>candidate.includes(token)))) return null;
          let score=0;
          if(!query) score=10;
          if(normalizedNames.includes(query) || usernames.includes(query)) score+=300;
          if(query && normalizedNames.some(candidate=>candidate.startsWith(query))) score+=180;
          if(query && usernames.some(candidate=>candidate.startsWith(query))) score+=160;
          if(tokens.length && tokens.every(token=>[...normalizedNames,...usernames].some(candidate=>candidate.startsWith(token)))) score+=120;
          if(query){
            const firstToken=tokens[0] || query;
            const pos=Math.min(...[...normalizedNames,...usernames].map(candidate=>candidate.indexOf(firstToken)===-1 ? 999 : candidate.indexOf(firstToken)));
            score+=Math.max(0,60-pos);
          }
          score+=Math.min(getTeacherSummaryForDay(nombre,getCurrentDay()).horas.length,6);
          return {nombre,score};
        })
        .filter(Boolean)
        .sort((a,b)=>b.score-a.score || a.nombre.localeCompare(b.nombre,'es'))
        .map(item=>item.nombre);
      return [...recents,...ranked].slice(0,10);
    }

    function loadTeacherUser(){
      return resolveTeacherCanonicalName(storage.readText(keys.teacherUser,'')) || '';
    }

    function persistTeacherUser(nombre){
      storage.writeText(keys.teacherUser,resolveTeacherCanonicalName(nombre) || nombre || '');
    }

    function loadTeacherRecents(){
      return [...new Set(
        (storage.readJson(keys.teacherRecents,[]) || [])
          .map(resolveTeacherCanonicalName)
          .filter(nombre=>getProfesor(nombre))
      )].slice(0,6);
    }

    function persistTeacherRecents(list){
      const normalized=[...new Set((list || []).map(resolveTeacherCanonicalName).filter(nombre=>getProfesor(nombre)))].slice(0,6);
      storage.writeJson(keys.teacherRecents,normalized);
      state.teacherRecents=normalized;
    }

    function loadTeacherMoods(){
      const rows=storage.readJson(keys.teacherMoods,{});
      return rows && typeof rows==='object' && !Array.isArray(rows) ? rows : {};
    }

    function persistTeacherMoods(rows){
      const normalized=rows && typeof rows==='object' && !Array.isArray(rows) ? rows : {};
      storage.writeJson(keys.teacherMoods,normalized);
      state.teacherMoodEntries=normalized;
    }

    function makeTeacherMoodKey(nombre,dateKey){
      return `${normalizeText(resolveTeacherCanonicalName(nombre) || nombre)}|${cleanText(dateKey)}`;
    }

    function getTeacherMoodEntry(nombre,dateKey){
      return state.teacherMoodEntries[makeTeacherMoodKey(nombre,dateKey)] || null;
    }

    function getTeacherMoodOption(id){
      return moodOptions.find(option=>option.id===id) || null;
    }

    function getTeacherMoodForDate(nombre,dateKey){
      const entry=getTeacherMoodEntry(nombre,dateKey);
      return entry ? getTeacherMoodOption(entry.moodId) : null;
    }

    function getTeacherMoodForToday(nombre){
      return getTeacherMoodForDate(nombre,getCurrentDateIso());
    }

    function getTeacherMoodMessage(nombre,dateKey,moodOption){
      const messages=Array.isArray(moodOption?.messages) ? moodOption.messages.filter(Boolean) : [];
      if(!messages.length) return '';
      const seed=`${cleanText(nombre)}|${cleanText(dateKey)}|${cleanText(moodOption.id)}`;
      const hash=[...seed].reduce((acc,char)=>acc+char.charCodeAt(0),0);
      return messages[hash%messages.length];
    }

    function saveTeacherMood(nombre,moodId,dateKey){
      const option=getTeacherMoodOption(moodId);
      if(!option || !nombre || !dateKey) return;
      persistTeacherMoods({
        ...state.teacherMoodEntries,
        [makeTeacherMoodKey(nombre,dateKey)]:{
          moodId:option.id,
          ts:new Date().toISOString()
        }
      });
    }

    function clearTeacherMood(nombre,dateKey){
      const key=makeTeacherMoodKey(nombre,dateKey);
      if(!state.teacherMoodEntries[key]) return;
      const nextEntries={...state.teacherMoodEntries};
      delete nextEntries[key];
      persistTeacherMoods(nextEntries);
    }

    function loadSessionOverrides(){
      const rows=storage.readJson(keys.sessionOverrides,{});
      return rows && typeof rows==='object' && !Array.isArray(rows) ? rows : {};
    }

    function persistSessionOverrides(next){
      const normalized=next && typeof next==='object' && !Array.isArray(next) ? next : {};
      storage.writeJson(keys.sessionOverrides,normalized);
      state.sessionOverrides=normalized;
    }

    function replaceSessionOverrides(next){
      state.sessionOverrides=next && typeof next==='object' && !Array.isArray(next) ? {...next} : {};
      return cloneJson(state.sessionOverrides);
    }

    function loadTareas(){
      const rows=storage.readJson(keys.tareas,{});
      return rows && typeof rows==='object' && !Array.isArray(rows) ? rows : {};
    }

    function persistTareas(next){
      const normalized=next && typeof next==='object' && !Array.isArray(next) ? next : {};
      storage.writeJson(keys.tareas,normalized);
      state.tareasProfesorado=normalized;
    }

    function replaceTareas(next){
      state.tareasProfesorado=next && typeof next==='object' && !Array.isArray(next) ? {...next} : {};
      return cloneJson(state.tareasProfesorado);
    }

    function makeSessionKey(nombre,dia,hora){
      return `${normalizeText(resolveTeacherCanonicalName(nombre) || nombre)}|${dia}|${hora}`;
    }

    function getSessionOverride(nombre,dia,hora){
      return state.sessionOverrides[makeSessionKey(nombre,dia,hora)] || null;
    }

    function resolveTeacherSession(nombre,dia,hora){
      const base=getHorarioProfesorDia(nombre,dia)?.[hora];
      if(!base) return null;
      const override=getSessionOverride(nombre,dia,hora);
      return override ? {...base,...override} : base;
    }

    function getAulaProfesor(nombre,dia,hora){
      const sesion=resolveTeacherSession(nombre,dia,hora);
      return sesion?.aula || '';
    }

    function makeTareaKey(nombre,dia,hora){
      return `${normalizeText(resolveTeacherCanonicalName(nombre) || nombre)}|${dia}|${hora}`;
    }

    function getTareaProfesor(nombre,dia,hora){
      return state.tareasProfesorado[makeTareaKey(nombre,dia,hora)] || null;
    }

    function getAbsenceTaskState(nombre,dia,hora,fallbackFaena,fallbackObs){
      const fallbackText=cleanText(fallbackObs);
      const fallbackHasTask=!!fallbackFaena || !!fallbackText;
      const tarea=getTareaProfesor(nombre,dia,hora);
      if(tarea){
        const tareaText=cleanText(tarea.tarea);
        const tareaHasTask=!!tarea.dejada || !!tareaText;
        if(tareaHasTask || !fallbackHasTask){
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
      return getAbsenceTaskState(row?.ausente,row?.dia,row?.hora,row?.faena,row?.obs);
    }

    function resolveAulaRegistro(row){
      if(!row || typeof row!=='object') return '';
      return getAulaProfesor(row.ausente,row.dia,row.hora) || row.aula || '';
    }

    function getTeacherAssignedAbsences(nombre,dia,hora){
      return getRowsForWeekOffset(state.teacherWeekOffset)
        .filter(row=>Number(row?.dia)===Number(dia) && Number(row?.hora)===Number(hora) && sameNormalizedText(row?.guardia,nombre))
        .map(row=>({
          ...row,
          aula:resolveAulaRegistro(row),
          faenaInfo:resolveFaena(row)
        }));
    }

    function makeAlumnosFueraKey(nombre,dia,hora){
      return `${normalizeText(resolveTeacherCanonicalName(nombre) || nombre)}|${dia}|${hora}`;
    }

    function normalizeAlumnosFueraRow(row){
      const profesor=resolveTeacherCanonicalName(row?.profesor);
      const dia=Number(row?.dia);
      const hora=Number(row?.hora);
      const cantidad=Math.max(0,Number(row?.cantidad) || 0);
      if(!getProfesor(profesor) || !Number.isInteger(dia) || dia<0 || dia>4 || !Number.isInteger(hora) || hora<1 || hora>9 || horasPatio.has(hora)){
        return null;
      }
      return {
        profesor,
        dia,
        hora,
        cantidad,
        lastExitAt:cleanText(row?.lastExitAt || row?.last_exit_at),
        lastReturnAt:cleanText(row?.lastReturnAt || row?.last_return_at),
        updatedAt:cleanText(row?.updatedAt || row?.updated_at)
      };
    }

    function loadAlumnosFueraAula(){
      const rows=storage.readJson(keys.alumnosFueraAula,[]);
      return Object.fromEntries(
        (Array.isArray(rows) ? rows : [])
          .map(normalizeAlumnosFueraRow)
          .filter(Boolean)
          .map(row=>[makeAlumnosFueraKey(row.profesor,row.dia,row.hora),row])
      );
    }

    function persistAlumnosFueraAula(next){
      const normalized=Object.values(next || {}).map(normalizeAlumnosFueraRow).filter(Boolean);
      storage.writeJson(keys.alumnosFueraAula,normalized);
      state.alumnosFueraAula=Object.fromEntries(normalized.map(row=>[makeAlumnosFueraKey(row.profesor,row.dia,row.hora),row]));
    }

    function replaceAlumnosFueraAula(next){
      const rows=Array.isArray(next)
        ? next
        : Object.values(next || {});
      state.alumnosFueraAula=Object.fromEntries(
        rows
          .map(normalizeAlumnosFueraRow)
          .filter(Boolean)
          .map(row=>[makeAlumnosFueraKey(row.profesor,row.dia,row.hora),row])
      );
      return cloneJson(state.alumnosFueraAula);
    }

    function getAlumnosFueraRows(){
      return Object.values(state.alumnosFueraAula).map(normalizeAlumnosFueraRow).filter(Boolean);
    }

    function getAlumnosFueraTotal(dia,hora){
      return getAlumnosFueraRows()
        .filter(row=>row.dia===dia && row.hora===hora)
        .reduce((sum,row)=>sum+Math.max(0,Number(row.cantidad) || 0),0);
    }

    function getAlumnosFueraTeacherRow(nombre,dia,hora){
      return state.alumnosFueraAula[makeAlumnosFueraKey(nombre,dia,hora)] || null;
    }

    function getCurrentSchoolSlot(){
      const slot=typeof hooks.getCurrentSchoolSlot==='function' ? hooks.getCurrentSchoolSlot() : null;
      if(!slot) return null;
      const dia=Number(slot.dia);
      const hora=Number(slot.hora);
      if(!Number.isInteger(dia) || !Number.isInteger(hora)) return null;
      return {dia,hora};
    }

    function getAlumnosFueraSummary(){
      const slot=getCurrentSchoolSlot();
      const currentTotal=slot ? getAlumnosFueraTotal(slot.dia,slot.hora) : 0;
      const pending=getAlumnosFueraRows()
        .filter(row=>row.cantidad>0 && (!slot || row.dia!==slot.dia || row.hora!==slot.hora))
        .sort((a,b)=>a.dia-b.dia || a.hora-b.hora || a.profesor.localeCompare(b.profesor,'es'));
      return {
        max:maxAlumnosFueraAula,
        current:{slot,total:currentTotal},
        pending
      };
    }

    function getPasilloLevelClass(total){
      const value=Number(total) || 0;
      if(value>=8) return 'is-danger';
      if(value>=5) return 'is-warn';
      return 'is-ok';
    }

    function renderTvHeaderCorridor(){
      const corridorChip=document.getElementById('tvHeaderCorridor');
      const corridorValue=document.getElementById('tvHeaderCorridorValue');
      if(!corridorChip || !corridorValue) return;
      const corredor=getAlumnosFueraSummary();
      corridorValue.textContent=`${corredor.current.total}/${corredor.max}`;
      corridorChip.classList.remove('tv-header-corridor-ok','tv-header-corridor-warn','tv-header-corridor-danger');
      const level=getPasilloLevelClass(corredor.current.total).replace('is-','');
      corridorChip.classList.add(`tv-header-corridor-${level}`);
    }

    function replaceTeacherMoodEntries(next){
      state.teacherMoodEntries=next && typeof next==='object' && !Array.isArray(next) ? {...next} : {};
      return cloneJson(state.teacherMoodEntries);
    }

    function syncAppModeClasses(){
      if(typeof hooks.syncAppModeClasses==='function'){
        hooks.syncAppModeClasses();
        return;
      }
      document.body.classList.toggle('teacher-active',!!state.teacherName);
      document.body.classList.toggle('teacher-panel-open',!!document.getElementById('teacherOverlay')?.classList.contains('open'));
    }

    function renderTeacherWeekLabel(){
      const teacherWeekLabel=document.getElementById('teacherWeekLabel');
      if(teacherWeekLabel) teacherWeekLabel.textContent=formatWeekRangeLabel(getTeacherSelectedWeekKey(),state.teacherWeekOffset);
    }

    function syncTeacherIdentity(){
      const profesor=getProfesor(state.teacherName);
      const nombre=getVisibleTeacherName(profesor?.nombre || state.teacherName || '') || 'Profesorado';
      const detalle=profesor?.departamento || 'Profesorado';
      const nombreCompleto=getVisibleTeacherName(profesor?.nombreCompleto || state.teacherName || nombre) || nombre;
      const substitutionMeta=getTeacherDisplayMeta(state.teacherName);
      const teacherNameEl=document.getElementById('teacherName');
      const teacherMetaEl=document.getElementById('teacherMeta');
      const teacherBarNameEl=document.getElementById('teacherBarName');
      if(teacherNameEl) teacherNameEl.textContent=nombre;
      if(teacherMetaEl) teacherMetaEl.textContent=`${nombreCompleto} - ${detalle}${substitutionMeta ? ` - ${substitutionMeta}` : ''}`;
      if(teacherBarNameEl) teacherBarNameEl.textContent=`${nombre} - ${detalle}`;
    }

    function clearTeacherIdentityConfirmation(){
      state.teacherIdentityConfirmedFor='';
    }

    async function ensureTeacherIdentityConfirmed(actionLabel){
      const profesor=getProfesor(state.teacherName);
      if(!profesor) return false;
      if(state.teacherIdentityConfirmedFor===state.teacherName) return true;
      const nombre=getVisibleTeacherName(profesor.nombreCompleto || profesor.nombre || state.teacherName);
      const confirmed=await askConfirm(
        'Confirmar docente',
        `Vas a trabajar como ${nombre}. Comprueba que es tu panel antes de ${actionLabel}.`,
        'Confirmar docente'
      );
      if(confirmed) state.teacherIdentityConfirmedFor=state.teacherName;
      return confirmed;
    }

    function renderTeacherAccessPreview(){
      const teacherLoginInput=document.getElementById('teacherLoginName');
      const preview=document.getElementById('teacherAccessPreview');
      if(!teacherLoginInput || !preview) return;
      const nombre=resolveTeacherFromInputValue(teacherLoginInput.value);
      if(!nombre){
        preview.innerHTML='Selecciona tu nombre para entrar en tu panel.';
        return;
      }
      const profesor=getProfesor(nombre);
      const visibleName=getVisibleTeacherName(nombre);
      const summary=getTeacherSummaryForDay(nombre,getCurrentDay());
      const nextSession=summary.nextHour ? resolveTeacherSession(nombre,getCurrentDay(),summary.nextHour) : null;
      const nextLabel=summary.nextHour && nextSession
        ? `${formatHoraLabel(summary.nextHour)} - ${nextSession.materia || nextSession.detalle || 'Sesion'}`
        : 'Sin sesiones lectivas hoy';
      preview.innerHTML=`
        <div class="teacher-access-preview-title">${escapeHtml(visibleName)}</div>
        <div class="teacher-access-preview-meta">Usuario: ${escapeHtml(makeTeacherUsername(visibleName))}${profesor?.departamento ? ` · ${escapeHtml(profesor.departamento)}` : ''}${getTeacherDisplayMeta(nombre) ? ` · ${escapeHtml(getTeacherDisplayMeta(nombre))}` : ''}</div>
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
      state.teacherRecents=loadTeacherRecents();
      if(!state.teacherRecents.length){
        recentContainer.hidden=true;
        recentContainer.innerHTML='';
        return;
      }
      recentContainer.hidden=false;
      recentContainer.innerHTML=state.teacherRecents
        .map(nombre=>`<button class="teacher-access-chip" type="button" data-teacher-name="${escapeHtml(nombre)}">${escapeHtml(getVisibleTeacherName(nombre))}</button>`)
        .join('');
    }

    function closeTeacherAccessSuggestions(){
      const suggestions=document.getElementById('teacherAccessSuggestions');
      if(!suggestions) return;
      suggestions.hidden=true;
    }

    function renderTeacherAccessSuggestions(forceOpen){
      const teacherLoginInput=document.getElementById('teacherLoginName');
      const suggestions=document.getElementById('teacherAccessSuggestions');
      if(!teacherLoginInput || !suggestions) return;
      const hasFocus=document.activeElement===teacherLoginInput;
      const query=normalizeTeacherSearch(teacherLoginInput.value);
      state.teacherRecents=loadTeacherRecents();
      state.teacherAccessMatches=getTeacherAccessMatches(teacherLoginInput.value);
      const selected=resolveTeacherFromInputValue(teacherLoginInput.value);
      if(!query && !selected){
        suggestions.innerHTML='';
        suggestions.hidden=true;
        return;
      }
      if(selected){
        state.teacherAccessActiveIndex=state.teacherAccessMatches.findIndex(nombre=>nombre===selected);
      }else if(state.teacherAccessActiveIndex>=state.teacherAccessMatches.length){
        state.teacherAccessActiveIndex=state.teacherAccessMatches.length ? 0 : -1;
      }
      if(!state.teacherAccessMatches.length){
        suggestions.innerHTML='<div class="teacher-access-suggestion-empty">No hay coincidencias.</div>';
        suggestions.hidden=!(forceOpen || hasFocus);
        return;
      }
      suggestions.innerHTML=state.teacherAccessMatches.map((nombre,index)=>{
        const summary=getTeacherSummaryForDay(nombre,getCurrentDay());
        const detail=summary.horas.length ? `${summary.horas.length} sesiones hoy` : 'Sin clases hoy';
        const recentBadge=state.teacherRecents.some(item=>sameNormalizedText(item,nombre)) ? '<span class="teacher-access-suggestion-badge">Reciente</span>' : '';
        const visibleName=getVisibleTeacherName(nombre);
        return `<button class="teacher-access-suggestion${index===state.teacherAccessActiveIndex ? ' active' : ''}" type="button" data-teacher-name="${escapeHtml(nombre)}">
          <span class="teacher-access-suggestion-row">
            <span>${escapeHtml(visibleName)}</span>
            ${recentBadge}
          </span>
          <span class="teacher-access-suggestion-user">${escapeHtml(makeTeacherUsername(visibleName))}</span>
          <span class="teacher-access-suggestion-meta">${escapeHtml(getTeacherDisplayMeta(nombre) || detail)}</span>
        </button>`;
      }).join('');
      suggestions.hidden=!(forceOpen || hasFocus);
    }

    function selectTeacherAccessSuggestion(nombre){
      const teacherLoginInput=document.getElementById('teacherLoginName');
      if(!teacherLoginInput) return;
      teacherLoginInput.value=getVisibleTeacherName(nombre);
      state.teacherAccessActiveIndex=state.teacherAccessMatches.findIndex(item=>item===nombre);
      renderTeacherAccessPreview();
      closeTeacherAccessSuggestions();
      teacherLoginInput.blur();
    }

    function handleTeacherAccessInput(){
      state.teacherAccessActiveIndex=-1;
      renderTeacherAccessPreview();
      renderTeacherAccessSuggestions(true);
    }

    function handleTeacherAccessKeydown(event){
      const teacherLoginInput=document.getElementById('teacherLoginName');
      if(!teacherLoginInput) return;
      if(event.key==='ArrowDown'){
        event.preventDefault();
        state.teacherAccessMatches=getTeacherAccessMatches(teacherLoginInput.value);
        if(!state.teacherAccessMatches.length) return;
        state.teacherAccessActiveIndex=(state.teacherAccessActiveIndex+1+state.teacherAccessMatches.length)%state.teacherAccessMatches.length;
        renderTeacherAccessSuggestions(true);
        return;
      }
      if(event.key==='ArrowUp'){
        event.preventDefault();
        state.teacherAccessMatches=getTeacherAccessMatches(teacherLoginInput.value);
        if(!state.teacherAccessMatches.length) return;
        state.teacherAccessActiveIndex=(state.teacherAccessActiveIndex-1+state.teacherAccessMatches.length)%state.teacherAccessMatches.length;
        renderTeacherAccessSuggestions(true);
        return;
      }
      if(event.key==='Enter'){
        if(state.teacherAccessActiveIndex>=0 && state.teacherAccessMatches[state.teacherAccessActiveIndex]){
          event.preventDefault();
          selectTeacherAccessSuggestion(state.teacherAccessMatches[state.teacherAccessActiveIndex]);
          return;
        }
        const nombre=resolveTeacherFromInputValue(teacherLoginInput.value);
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

    function bindAccessEvents(){
      const teacherLoginInput=document.getElementById('teacherLoginName');
      if(teacherLoginInput && !teacherLoginInput.dataset.guardiasTeacherBound){
        teacherLoginInput.dataset.guardiasTeacherBound='1';
        teacherLoginInput.addEventListener('input',handleTeacherAccessInput);
        teacherLoginInput.addEventListener('change',handleTeacherAccessInput);
        teacherLoginInput.addEventListener('focus',function(){renderTeacherAccessSuggestions(true);});
        teacherLoginInput.addEventListener('click',function(){renderTeacherAccessSuggestions(true);});
        teacherLoginInput.addEventListener('keydown',handleTeacherAccessKeydown);
        teacherLoginInput.addEventListener('blur',function(){window.setTimeout(closeTeacherAccessSuggestions,120);});
      }
      const teacherAccessSuggestions=document.getElementById('teacherAccessSuggestions');
      if(teacherAccessSuggestions && !teacherAccessSuggestions.dataset.guardiasTeacherBound){
        teacherAccessSuggestions.dataset.guardiasTeacherBound='1';
        teacherAccessSuggestions.addEventListener('pointerdown',event=>{
          const button=event.target.closest('[data-teacher-name]');
          if(!button) return;
          event.preventDefault();
          selectTeacherAccessSuggestion(button.dataset.teacherName || '');
        });
      }
      const teacherAccessRecent=document.getElementById('teacherAccessRecent');
      if(teacherAccessRecent && !teacherAccessRecent.dataset.guardiasTeacherBound){
        teacherAccessRecent.dataset.guardiasTeacherBound='1';
        teacherAccessRecent.addEventListener('pointerdown',event=>{
          const button=event.target.closest('[data-teacher-name]');
          if(!button) return;
          event.preventDefault();
          selectTeacherAccessSuggestion(button.dataset.teacherName || '');
        });
      }
    }

    function openTeacherAccess(resetSelection){
      const teacherLoginInput=document.getElementById('teacherLoginName');
      const teacherAccessOverlay=document.getElementById('teacherAccessOverlay');
      if(!teacherLoginInput || !teacherAccessOverlay){
        openTeacherPanelFallback();
        return;
      }
      teacherLoginInput.value=resetSelection ? '' : getVisibleTeacherName(state.teacherName || '');
      state.teacherAccessActiveIndex=-1;
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

    function bgTeacherAccessClose(event){
      if(event.target.id==='teacherAccessOverlay') closeTeacherAccess();
    }

    function changeTeacherUser(){
      closeTeacherPanel();
      clearTeacherIdentityConfirmation();
      openTeacherAccess(true);
    }

    async function loginTeacher(){
      const teacherLoginInput=document.getElementById('teacherLoginName');
      if(!teacherLoginInput) return;
      const nombre=resolveTeacherFromInputValue(teacherLoginInput.value);
      if(!nombre){
        showToast('Selecciona tu nombre de la lista.','error');
        teacherLoginInput.focus();
        renderTeacherAccessSuggestions(true);
        return;
      }
      const profesor=getProfesor(nombre);
      const confirmed=await askConfirm(
        'Confirmar docente',
        `Vas a entrar como ${getVisibleTeacherName(profesor?.nombreCompleto || nombre)}. Revisa bien el nombre antes de continuar.`,
        'Entrar con este nombre'
      );
      if(!confirmed) return;
      state.teacherName=nombre;
      state.teacherDay=getCurrentDay();
      state.teacherWeekOffset=getCurrentWeekOffset();
      state.teacherIdentityConfirmedFor=nombre;
      persistTeacherUser(nombre);
      persistTeacherRecents([nombre,...state.teacherRecents.filter(item=>!sameNormalizedText(item,nombre))]);
      closeTeacherAccess();
      closeTeacherPanel();
      syncTeacherIdentity();
      document.getElementById('teacherOverlay')?.classList.add('open');
      document.getElementById('teacherBar')?.classList.add('show');
      syncAppModeClasses();
      renderTeacherPanel();
    }

    function openTeacherPanelFallback(){
      state.teacherName=state.teacherName || teacherNames[0] || '';
      state.teacherDay=getCurrentDay();
      state.teacherWeekOffset=getCurrentWeekOffset();
      syncTeacherIdentity();
      document.getElementById('teacherOverlay')?.classList.add('open');
      document.getElementById('teacherBar')?.classList.add('show');
      syncAppModeClasses();
      renderTeacherPanel();
    }

    function openTeacherPanel(){
      if(!getProfesor(state.teacherName)){
        openTeacherAccess();
        return;
      }
      state.teacherDay=getCurrentDay();
      state.teacherWeekOffset=getCurrentWeekOffset();
      syncTeacherIdentity();
      document.getElementById('teacherOverlay')?.classList.add('open');
      document.getElementById('teacherBar')?.classList.add('show');
      syncAppModeClasses();
      renderTeacherPanel();
    }

    function closeTeacherPanel(){
      document.getElementById('teacherOverlay')?.classList.remove('open');
      syncAppModeClasses();
    }

    function exitTeacherMode(){
      closeTeacherPanel();
      closeTeacherAccess();
      state.teacherName='';
      clearTeacherIdentityConfirmation();
      persistTeacherUser('');
      document.getElementById('teacherBar')?.classList.remove('show');
      syncTeacherIdentity();
      syncAppModeClasses();
    }

    function setTeacherDay(dia){
      state.teacherDay=normalizeIndex(dia,0,dias.length-1,state.teacherDay);
      renderTeacherPanel();
    }

    function changeTeacherWeekOffset(delta){
      state.teacherWeekOffset=normalizeTeacherWeekOffset(state.teacherWeekOffset+Number(delta || 0));
      renderTeacherPanel();
    }

    function focusTeacherDutyHour(hora){
      const card=document.querySelector(`[data-teacher-hour="${hora}"]`);
      if(!card) return;
      card.scrollIntoView({behavior:'smooth',block:'center'});
      card.classList.remove('teacher-session-duty-focus');
      void card.offsetWidth;
      card.classList.add('teacher-session-duty-focus');
      if(state.teacherDutyFocusTimer) window.clearTimeout(state.teacherDutyFocusTimer);
      state.teacherDutyFocusTimer=window.setTimeout(function(){
        card.classList.remove('teacher-session-duty-focus');
      },1800);
    }

    function selectTeacherMood(moodId){
      if(!state.teacherName) return;
      saveTeacherMood(state.teacherName,moodId,getCurrentDateIso());
      renderTeacherPanel();
    }

    function resetTeacherMood(){
      if(!state.teacherName) return;
      clearTeacherMood(state.teacherName,getCurrentDateIso());
      renderTeacherPanel();
    }

    function applyAlumnosFueraSyncResult(result){
      if(Array.isArray(result?.rows)){
        replaceAlumnosFueraAula(result.rows);
      }else if(result?.row){
        const normalized=normalizeAlumnosFueraRow(result.row);
        if(normalized){
          state.alumnosFueraAula[makeAlumnosFueraKey(normalized.profesor,normalized.dia,normalized.hora)]=normalized;
        }
      }
      renderTvHeaderCorridor();
      if(document.getElementById('teacherOverlay')?.classList.contains('open')) renderTeacherPanel();
    }

    function changeAlumnosFueraAula(dia,hora,delta){
      if(!isTeacherCurrentWeek()){
        showToast('Solo puedes registrar salidas en la semana actual.','info');
        return Promise.resolve(false);
      }
      const slot=getCurrentSchoolSlot();
      if(!slot || slot.dia!==dia || slot.hora!==hora){
        showToast('Solo se puede registrar alumnado fuera durante la hora activa.','info');
        return Promise.resolve(false);
      }
      const profesor=getProfesor(state.teacherName);
      if(!profesor || typeof hooks.syncAlumnosFueraAulaEntry!=='function') return Promise.resolve(false);
      try{
        const result=hooks.syncAlumnosFueraAulaEntry(state.teacherName,dia,hora,delta);
        if(isPromiseLike(result)){
          return result.then(function(saved){
            applyAlumnosFueraSyncResult(saved);
            return true;
          }).catch(function(error){
            console.warn('Teacher corridor sync failed',error);
            showToast('No se pudo actualizar el control de pasillo.','error');
            return false;
          });
        }
        applyAlumnosFueraSyncResult(result);
        return Promise.resolve(true);
      }catch(error){
        console.warn('Teacher corridor sync failed',error);
        showToast('No se pudo actualizar el control de pasillo.','error');
        return Promise.resolve(false);
      }
    }

    async function saveTeacherTask(dia,hora,exitAfter){
      if(!isTeacherCurrentWeek()){
        showToast('Solo puedes editar tareas en la semana actual.','info');
        return;
      }
      if(!await ensureTeacherIdentityConfirmed('guardar una tarea')) return;
      const profesor=getProfesor(state.teacherName);
      if(!profesor) return;
      const sesionBase=getHorarioProfesorDia(state.teacherName,dia)?.[hora];
      if(!sesionBase) return;
      const taskText=document.getElementById(`taskText-${dia}-${hora}`)?.value.trim() || '';
      const taskChecked=!!document.getElementById(`taskCheck-${dia}-${hora}`)?.checked || !!taskText;
      const overrideKey=makeSessionKey(state.teacherName,dia,hora);
      const nextOverride={
        materia:document.getElementById(`sessionMateria-${dia}-${hora}`)?.value.trim() || sesionBase.materia || '',
        grupo:document.getElementById(`sessionGrupo-${dia}-${hora}`)?.value.trim() || '',
        detalle:document.getElementById(`sessionDetalle-${dia}-${hora}`)?.value.trim() || sesionBase.detalle || '',
        aula:document.getElementById(`sessionAula-${dia}-${hora}`)?.value.trim() || ''
      };
      const normalizedBase={
        materia:sesionBase.materia || '',
        grupo:sesionBase.grupo || '',
        detalle:sesionBase.detalle || '',
        aula:sesionBase.aula || ''
      };
      const nextOverrides={...state.sessionOverrides};
      if(JSON.stringify(nextOverride)===JSON.stringify(normalizedBase)){
        delete nextOverrides[overrideKey];
      }else{
        nextOverrides[overrideKey]=nextOverride;
      }
      persistSessionOverrides(nextOverrides);

      const tareaKey=makeTareaKey(state.teacherName,dia,hora);
      const nextTareas={...state.tareasProfesorado};
      if(!taskChecked && !taskText){
        delete nextTareas[tareaKey];
      }else{
        nextTareas[tareaKey]={profesor:state.teacherName,dia,hora,dejada:taskChecked,tarea:taskText};
      }
      persistTareas(nextTareas);

      let syncResult=null;
      if(typeof hooks.syncTeacherTaskEntry==='function'){
        try{
          syncResult=await hooks.syncTeacherTaskEntry(
            overrideKey,
            state.sessionOverrides[overrideKey] ? {...state.sessionOverrides[overrideKey],dia,hora} : null,
            tareaKey,
            state.tareasProfesorado[tareaKey] ? {...state.tareasProfesorado[tareaKey]} : null
          );
        }catch(error){
          syncResult={syncError:error};
        }
      }
      if(exitAfter){
        if(typeof hooks.renderTable==='function') hooks.renderTable();
        showToast(syncResult?.syncError ? 'Tarea guardada en local. Pendiente de sincronizar con el servidor.' : 'Tarea guardada correctamente.','success');
        closeTeacherPanel();
        return;
      }
      renderTeacherPanel();
      if(typeof hooks.renderTable==='function') hooks.renderTable();
      showToast(syncResult?.syncError ? 'Tarea guardada en local. Pendiente de sincronizar con el servidor.' : 'Tarea guardada correctamente.','success');
    }

    function getTeacherFutureAbsences(){
      const rows=typeof hooks.getTeacherFutureAbsences==='function' ? hooks.getTeacherFutureAbsences() : [];
      return Array.isArray(rows) ? rows : [];
    }

    function sortFutureAbsenceRowsForDisplay(rows){
      if(typeof hooks.sortFutureAbsenceRowsForDisplay==='function'){
        const sorted=hooks.sortFutureAbsenceRowsForDisplay(rows);
        return Array.isArray(sorted) ? sorted : [];
      }
      return (rows || []).slice().sort((a,b)=>
        String(a?.date || '').localeCompare(String(b?.date || '')) ||
        String(a?.profesor || '').localeCompare(String(b?.profesor || ''),'es')
      );
    }

    function renderTeacherPanel(){
      const profesor=getProfesor(state.teacherName);
      if(!profesor) return;
      const moodCard=document.getElementById('teacherMoodCard');
      const moodDateKey=getCurrentDateIso();
      const moodEntry=getTeacherMoodEntry(state.teacherName,moodDateKey);
      const moodOption=moodEntry ? getTeacherMoodOption(moodEntry.moodId) : null;
      const moodMessage=moodOption ? getTeacherMoodMessage(state.teacherName,moodDateKey,moodOption) : '';
      if(typeof hooks.renderWeekLabel==='function') hooks.renderWeekLabel();
      renderTeacherWeekLabel();
      syncTeacherIdentity();

      const teacherNameEl=document.getElementById('teacherName');
      if(teacherNameEl) teacherNameEl.textContent=getVisibleTeacherName(profesor.nombre);
      const teacherMetaEl=document.getElementById('teacherMeta');
      if(teacherMetaEl){
        teacherMetaEl.textContent=`${getVisibleTeacherName(profesor.nombreCompleto || profesor.nombre)} - ${profesor.departamento}${getTeacherDisplayMeta(state.teacherName) ? ` - ${getTeacherDisplayMeta(state.teacherName)}` : ''}`;
      }

      const sesiones=getHorarioProfesorDia(state.teacherName,state.teacherDay);
      const horas=Object.keys(sesiones).map(Number).sort((a,b)=>a-b);
      const currentTeacherWeek=isTeacherCurrentWeek();
      const teacherRowsForDay=getTeacherWeekRowsForDay(state.teacherDay);
      const corredor=getAlumnosFueraSummary();
      const activeSlot=corredor.current.slot;
      const overview=document.getElementById('teacherOverview');
      const totalConTarea=currentTeacherWeek
        ? horas.filter(hora=>{const tarea=getTareaProfesor(state.teacherName,state.teacherDay,hora); return !!(tarea?.dejada || tarea?.tarea);}).length
        : 0;
      const dutyAssignments=teacherRowsForDay
        .filter(row=>sameNormalizedText(row.guardia,state.teacherName))
        .map(row=>({
          ...row,
          faenaInfo:currentTeacherWeek ? resolveFaena(row) : {faena:false,obs:''},
          aula:resolveAulaRegistro(row)
        }));
      const futureOwnRows=sortFutureAbsenceRowsForDisplay(
        getTeacherFutureAbsences().filter(item=>sameNormalizedText(item?.profesor,state.teacherName))
      );
      const pendingFutureCount=futureOwnRows.filter(item=>(item.status || 'pending')==='pending').length;
      const nextDuty=dutyAssignments.slice().sort((a,b)=>a.hora-b.hora)[0] || null;
      const teacherSummaryEl=document.getElementById('teacherSummary');
      if(teacherSummaryEl){
        teacherSummaryEl.textContent=`${dias[state.teacherDay]} · ${horas.length} sesiones · ${totalConTarea} con tarea · ${dutyAssignments.length} coberturas${currentTeacherWeek ? '' : ' · semana futura'}`;
      }
      const dutyAlert=document.getElementById('teacherDutyAlert');
      if(dutyAlert){
        if(dutyAssignments.length){
          dutyAlert.hidden=false;
          dutyAlert.innerHTML=`<div class="teacher-duty-alert-title">${currentTeacherWeek ? 'Guardia asignada' : 'Guardia prevista'}</div><div class="teacher-duty-alert-copy">${currentTeacherWeek ? 'Hoy cubres' : 'En esta semana cubres'} ${dutyAssignments.length} ${dutyAssignments.length===1 ? 'ausencia' : 'ausencias'}. Próxima cobertura: ${escapeHtml(getVisibleTeacherName(nextDuty.ausente))} en ${escapeHtml(nextDuty.aula || 'Sin aula')} (${escapeHtml(formatHoraLabel(nextDuty.hora))}). Pulsa aquí para ir a esa hora.</div>`;
          dutyAlert.onclick=function(){focusTeacherDutyHour(nextDuty.hora);};
          dutyAlert.setAttribute('role','button');
          dutyAlert.setAttribute('tabindex','0');
          dutyAlert.onkeydown=function(event){
            if(event.key==='Enter' || event.key===' '){
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

      const teacherBarNameEl=document.getElementById('teacherBarName');
      if(teacherBarNameEl) teacherBarNameEl.textContent=`${getVisibleTeacherName(profesor.nombre)} - ${profesor.departamento}`;

      if(moodCard){
        moodCard.innerHTML=moodOption
          ? `<div class="teacher-mood-copy"><div class="teacher-mood-title">${moodOption.emoji} ${escapeHtml(moodOption.welcome)}</div><div class="teacher-mood-text">Hoy te sientes ${escapeHtml(moodOption.label.toLowerCase())}. ${escapeHtml(moodMessage)}</div></div><button class="btn-teacher-panel" type="button" onclick="${handlerNames.resetTeacherMood}()">Cambiar estado</button>`
          : `<div class="teacher-mood-copy"><div class="teacher-mood-title">¿Cómo te sientes hoy?</div><div class="teacher-mood-text">Elige una opción rápida para personalizar el panel de la jornada.</div></div><div class="teacher-mood-options">${moodOptions.map(option=>`<button class="teacher-mood-option" type="button" onclick="${handlerNames.selectTeacherMood}('${escapeHtml(option.id)}')" aria-label="${escapeHtml(option.label)}"><span class="teacher-mood-option-emoji">${option.emoji}</span><span class="teacher-mood-option-label">${escapeHtml(option.label)}</span></button>`).join('')}</div>`;
        moodCard.className=`teacher-mood-card${moodOption ? ` is-${moodOption.tone}` : ''}`;
      }

      const teacherDayPills=document.getElementById('teacherDayPills');
      if(teacherDayPills){
        teacherDayPills.innerHTML=dias.map((nombreDia,index)=>`<button class="${index===state.teacherDay ? 'active' : ''}" onclick="${handlerNames.setTeacherDay}(${index})">${escapeHtml(nombreDia)}</button>`).join('');
      }

      if(overview){
        const activeTeacherRow=activeSlot ? getAlumnosFueraTeacherRow(state.teacherName,activeSlot.dia,activeSlot.hora) : null;
        const activeTeacherCount=Math.max(0,Number(activeTeacherRow?.cantidad) || 0);
        const activeTotal=corredor.current.total;
        const activeCanAdd=!!activeSlot && currentTeacherWeek && activeTotal<maxAlumnosFueraAula;
        const activeCanRemove=!!activeSlot && currentTeacherWeek && activeTeacherCount>0;
        overview.innerHTML=`
          <article class="teacher-overview-card">
            <div class="teacher-overview-label">Hoy tengo clase</div>
            <div class="teacher-overview-value">${horas.length}</div>
            <div class="teacher-overview-copy">${horas.length ? `Próxima sesión: ${escapeHtml(formatHoraLabel(horas[0]))}` : 'Sin clases lectivas registradas para este día.'}</div>
            <button class="btn-teacher-panel teacher-overview-action" type="button" onclick="document.getElementById('teacherSessions')?.scrollIntoView({behavior:'smooth',block:'start'})">Ver sesiones</button>
          </article>
          <article class="teacher-overview-card teacher-overview-card-duty">
            <div class="teacher-overview-label">Hoy estoy de guardia</div>
            <div class="teacher-overview-value">${dutyAssignments.length}</div>
            <div class="teacher-overview-copy">${nextDuty ? `Próxima cobertura: ${escapeHtml(getVisibleTeacherName(nextDuty.ausente))} · ${escapeHtml(formatHoraLabel(nextDuty.hora))}` : 'No tienes coberturas asignadas en este día.'}</div>
            <button class="btn-teacher-panel teacher-overview-action" type="button" ${nextDuty ? '' : 'disabled'} onclick="${nextDuty ? `${handlerNames.focusTeacherDutyHour}(${nextDuty.hora})` : ''}">${nextDuty ? 'Ir a mi guardia' : 'Sin guardias'}</button>
          </article>
          <article class="teacher-overview-card teacher-overview-card-corridor ${getPasilloLevelClass(activeTotal)}${activeSlot ? ' is-active' : ''}${activeTotal>=maxAlumnosFueraAula ? ' is-full' : ''}">
            <div class="teacher-overview-label">En el pasillo ahora</div>
            <div class="teacher-overview-value">${corredor.current.total}/${corredor.max}</div>
            <div class="teacher-overview-copy">${activeSlot ? `Tramo activo: ${escapeHtml(formatHoraLabel(activeSlot.hora))}.` : 'Sin tramo lectivo activo.'}${corredor.pending.length ? ` Pendientes anteriores: ${corredor.pending.length}.` : ''}${pendingFutureCount ? ` Faltas pendientes: ${pendingFutureCount}.` : ''}</div>
            <div class="teacher-corridor-stepper teacher-corridor-stepper-main">
              <button type="button" onclick="${handlerNames.changeAlumnosFueraAula}(${activeSlot?.dia ?? state.teacherDay},${activeSlot?.hora ?? 0},-1)" ${activeCanRemove ? '' : 'disabled'}>-</button>
              <strong>${activeTeacherCount}</strong>
              <button type="button" onclick="${handlerNames.changeAlumnosFueraAula}(${activeSlot?.dia ?? state.teacherDay},${activeSlot?.hora ?? 0},1)" ${activeCanAdd ? '' : 'disabled'}>+</button>
            </div>
          </article>
        `;
      }

      const teacherSessions=document.getElementById('teacherSessions');
      if(!teacherSessions) return;
      if(!horas.length){
        teacherSessions.innerHTML='<div class="teacher-session"><div class="teacher-session-empty">No tienes sesiones registradas para este día.</div></div>';
        return;
      }
      teacherSessions.innerHTML=horas.map(hora=>{
        const sesion=resolveTeacherSession(state.teacherName,state.teacherDay,hora);
        const grupo=sesion?.grupo ? groupsByCode[sesion.grupo]?.nombre || sesion.grupo : '';
        const aula=sesion?.aula || 'Sin aula';
        const tarea=currentTeacherWeek ? getTareaProfesor(state.teacherName,state.teacherDay,hora) : null;
        const checked=tarea ? !!(tarea.dejada || tarea.tarea) : false;
        const texto=tarea?.tarea || '';
        const detalleVisible=grupo || sesion?.detalle || 'Sin detalle adicional';
        const guardiaTasks=sesion?.tipo==='guardia' ? dutyAssignments.filter(item=>item.hora===hora) : [];
        const dutyBadge=guardiaTasks.length ? `<span class="badge teacher-duty-badge">${currentTeacherWeek ? 'Te toca cubrir' : 'Cobertura prevista'}</span>` : '';
        const openByDefault=(!!activeSlot && activeSlot.dia===state.teacherDay && activeSlot.hora===hora) || checked || !!texto || guardiaTasks.length;
        const guardiaTasksMarkup=guardiaTasks.length ? `<div class="teacher-guardia-tasks">${guardiaTasks.map(item=>`
          <article class="teacher-guardia-task">
            <div class="teacher-guardia-task-head">
              <div class="teacher-guardia-task-title">Cubres a ${escapeHtml(getVisibleTeacherName(item.ausente))}</div>
              <span class="badge ${item.faenaInfo.faena ? 'b-ok' : 'b-nok'}">${item.faenaInfo.faena ? 'Con tarea' : 'Sin tarea'}</span>
            </div>
            <div class="teacher-guardia-task-meta">${escapeHtml(formatHoraLabel(item.hora))} · ${escapeHtml(item.aula || 'Sin aula')}</div>
            ${item.faenaInfo.obs ? `<div class="teacher-guardia-task-text">${escapeHtml(item.faenaInfo.obs)}</div>` : ''}
          </article>
        `).join('')}</div>` : '';
        const sessionKindLabel=sesion?.tipo==='guardia' ? 'Guardia' : (sesion?.materia || sesion?.tipo || 'Sesion');
        return `<details class="teacher-session${guardiaTasks.length ? ' teacher-session-duty' : ''}" data-teacher-hour="${hora}" ${openByDefault ? 'open' : ''}>
          <summary class="teacher-session-head">
            <div class="teacher-session-summary">
              <div class="teacher-session-slot">${escapeHtml(horaMap[hora]?.label || String(hora))} hora</div>
              <div class="teacher-session-title">${escapeHtml(sessionKindLabel)}</div>
              <div class="teacher-session-meta">${escapeHtml(detalleVisible)}</div>
            </div>
            <div class="teacher-session-side">
              <div class="teacher-session-meta">${escapeHtml(horaMap[hora]?.rango || '')}</div>
              <div class="teacher-session-badges">
                ${dutyBadge}
                <span class="badge ${checked ? 'b-ok' : 'b-nok'}">${checked ? 'Con tarea' : 'Sin tarea'}</span>
                <span class="badge b-biblio">${escapeHtml(aula)}</span>
              </div>
            </div>
          </summary>
          <div class="teacher-session-content">
            <div class="teacher-session-quick">
              <div class="teacher-quick-item"><span class="teacher-quick-label">Grupo</span><span class="teacher-quick-value">${escapeHtml(grupo || 'Sin grupo')}</span></div>
              <div class="teacher-quick-item"><span class="teacher-quick-label">Aula</span><span class="teacher-quick-value">${escapeHtml(aula)}</span></div>
              <div class="teacher-quick-item"><span class="teacher-quick-label">Tarea</span><span class="teacher-quick-value">${checked ? (texto ? escapeHtml(texto.slice(0,72)+(texto.length>72 ? '...' : '')) : 'Marcada para el grupo') : 'No has dejado tarea todavía'}</span></div>
            </div>
            <div class="teacher-session-panel" id="teacherSessionPanel-${state.teacherDay}-${hora}">
              <div class="fg">
                <label>Tarea para este grupo</label>
                <textarea id="taskText-${state.teacherDay}-${hora}" placeholder="${currentTeacherWeek ? 'Indica que debe hacer el grupo' : 'Las tareas solo se registran en la semana actual'}" ${currentTeacherWeek ? '' : 'readonly'}>${escapeHtml(texto)}</textarea>
              </div>
              <label class="teacher-check">
                <input id="taskCheck-${state.teacherDay}-${hora}" type="checkbox" ${checked ? 'checked' : ''} ${currentTeacherWeek ? '' : 'disabled'}>
                <span>He dejado tarea para este grupo</span>
              </label>
              ${guardiaTasksMarkup}
              <details class="teacher-session-settings">
                <summary>${currentTeacherWeek ? 'Ajustes de la sesion' : 'Ver datos de la sesion'}</summary>
                <div class="teacher-session-edit">
                  <div class="teacher-session-grid">
                    <div class="fg">
                      <label>Materia</label>
                      <input id="sessionMateria-${state.teacherDay}-${hora}" type="text" value="${escapeHtml(sesion?.materia || '')}" ${currentTeacherWeek ? '' : 'readonly'}>
                    </div>
                    <div class="fg">
                      <label>Aula</label>
                      <input id="sessionAula-${state.teacherDay}-${hora}" type="text" value="${escapeHtml(sesion?.aula || '')}" ${currentTeacherWeek ? '' : 'readonly'}>
                    </div>
                    <div class="fg">
                      <label>Grupo</label>
                      <input id="sessionGrupo-${state.teacherDay}-${hora}" type="text" value="${escapeHtml(sesion?.grupo || '')}" ${currentTeacherWeek ? '' : 'readonly'}>
                    </div>
                    <div class="fg">
                      <label>Detalle</label>
                      <input id="sessionDetalle-${state.teacherDay}-${hora}" type="text" value="${escapeHtml(sesion?.detalle || '')}" ${currentTeacherWeek ? '' : 'readonly'}>
                    </div>
                  </div>
                </div>
              </details>
              <div class="teacher-actions">
                ${currentTeacherWeek
                  ? `<button class="teacher-save" type="button" onclick="${handlerNames.saveTeacherTask}(${state.teacherDay},${hora},false)">Guardar tarea</button><button class="teacher-save-exit" type="button" onclick="${handlerNames.saveTeacherTask}(${state.teacherDay},${hora},true)">Guardar y cerrar</button>`
                  : '<div class="teacher-meta">Vista de planificacion. La edicion se habilita en la semana actual.</div>'}
              </div>
            </div>
          </div>
        </details>`;
      }).join('');
    }

    function reloadFromStorage(){
      state.teacherRecents=loadTeacherRecents();
      state.teacherMoodEntries=loadTeacherMoods();
      state.sessionOverrides=loadSessionOverrides();
      state.tareasProfesorado=loadTareas();
      state.alumnosFueraAula=loadAlumnosFueraAula();
      const persisted=loadTeacherUser();
      state.teacherName=getProfesor(persisted) ? persisted : state.teacherName;
      return getState();
    }

    function installLegacyGlobals(target){
      const scope=target || global;
      scope[handlerNames.changeAlumnosFueraAula]=changeAlumnosFueraAula;
      scope[handlerNames.changeTeacherWeekOffset]=changeTeacherWeekOffset;
      scope[handlerNames.closeTeacherAccess]=closeTeacherAccess;
      scope[handlerNames.closeTeacherPanel]=closeTeacherPanel;
      scope[handlerNames.exitTeacherMode]=exitTeacherMode;
      scope[handlerNames.focusTeacherDutyHour]=focusTeacherDutyHour;
      scope[handlerNames.loginTeacher]=loginTeacher;
      scope[handlerNames.openTeacherAccess]=openTeacherAccess;
      scope[handlerNames.openTeacherPanel]=openTeacherPanel;
      scope[handlerNames.resetTeacherMood]=resetTeacherMood;
      scope[handlerNames.saveTeacherTask]=saveTeacherTask;
      scope[handlerNames.selectTeacherMood]=selectTeacherMood;
      scope[handlerNames.setTeacherDay]=setTeacherDay;
      scope.bgTeacherAccessClose=bgTeacherAccessClose;
      scope.changeTeacherUser=changeTeacherUser;
      return scope;
    }

    function getState(){
      return {
        teacherName:state.teacherName,
        teacherDay:state.teacherDay,
        teacherWeekOffset:state.teacherWeekOffset,
        teacherAccessMatches:state.teacherAccessMatches.slice(),
        teacherAccessActiveIndex:state.teacherAccessActiveIndex,
        teacherRecents:state.teacherRecents.slice(),
        teacherIdentityConfirmedFor:state.teacherIdentityConfirmedFor,
        teacherMoodEntries:cloneJson(state.teacherMoodEntries),
        sessionOverrides:cloneJson(state.sessionOverrides),
        tareasProfesorado:cloneJson(state.tareasProfesorado),
        alumnosFueraAula:cloneJson(state.alumnosFueraAula)
      };
    }

    return {
      bindAccessEvents,
      changeAlumnosFueraAula,
      changeTeacherUser,
      changeTeacherWeekOffset,
      clearTeacherIdentityConfirmation,
      closeTeacherAccess,
      closeTeacherPanel,
      ensureTeacherIdentityConfirmed,
      exitTeacherMode,
      focusTeacherDutyHour,
      getAlumnosFueraRows,
      getAlumnosFueraSummary,
      getAlumnosFueraTeacherRow,
      getAulaProfesor,
      getHorarioProfesorDia,
      getPasilloLevelClass,
      getProfesor,
      getState,
      getTareaProfesor,
      getTeacherAccessMatches,
      getTeacherAssignedAbsences,
      getTeacherMoodEntry,
      getTeacherMoodForDate,
      getTeacherMoodForToday,
      getTeacherMoodMessage,
      getTeacherMoodOption,
      getTeacherSelectedWeekKey,
      getTeacherSubstitutions,
      getTeacherSummaryForDay,
      getVisibleTeacherName,
      handleTeacherAccessInput,
      handleTeacherAccessKeydown,
      installLegacyGlobals,
      isTeacherCurrentWeek,
      loginTeacher,
      makeSessionKey,
      makeTeacherMoodKey,
      openTeacherAccess,
      openTeacherPanel,
      openTeacherPanelFallback,
      persistAlumnosFueraAula,
      reloadFromStorage,
      renderTeacherAccessPreview,
      renderTeacherAccessRecents,
      renderTeacherAccessSuggestions,
      renderTeacherPanel,
      renderTvHeaderCorridor,
      replaceAlumnosFueraAula,
      replaceSessionOverrides,
      replaceTareas,
      replaceTeacherMoodEntries,
      resetTeacherMood,
      resolveTeacherCanonicalName,
      resolveTeacherSession,
      saveTeacherMood,
      saveTeacherTask,
      selectTeacherAccessSuggestion,
      selectTeacherMood,
      setTeacherDay,
      setTeacherSubstitutions,
      syncTeacherIdentity,
      teacherMatchesQuery
    };
  }

  global.GuardiasTeacher={
    DEFAULT_HANDLER_NAMES,
    DEFAULT_KEYS,
    DEFAULT_MOOD_OPTIONS:DEFAULT_MOOD_OPTIONS.map(item=>cloneJson(item)),
    createTeacherController
  };
})(window);
