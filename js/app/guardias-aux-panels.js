(function(global){
  'use strict';

  const DEFAULT_HORA_MAP={
    1:{label:'1a',rango:'08:15-09:10'},
    2:{label:'2a',rango:'09:10-10:05'},
    3:{label:'3a',rango:'10:05-11:00'},
    4:{label:'4a',rango:'11:00-11:25'},
    5:{label:'5a',rango:'11:25-12:20'},
    6:{label:'6a',rango:'12:20-13:15'},
    7:{label:'7a',rango:'13:15-14:10'},
    8:{label:'8a',rango:'14:10-14:25'},
    9:{label:'9a',rango:'14:25-15:20'}
  };
  const DEFAULT_HORAS_PATIO=new Set([4,8,9]);
  const DEFAULT_DIAS=['Lunes','Martes','Miercoles','Jueves','Viernes'];
  const STORAGE_KEYS={
    teacherSubstitutions:'IES_Alcalans_Profesorado_Sustituciones',
    teacherPracticasGuardias:'IES_Alcalans_Profesorado_Practicas_Guardias',
    teacherPracticasGuardiasTramos:'IES_Alcalans_Profesorado_Practicas_Guardias_Tramos',
    history:'IES_Alcalans_Historial_Cambios',
    tvAnnouncement:'IES_Alcalans_TV_Announcement'
  };
  const LIMITS=[
    {
      scope:'history.undo',
      reason:'La restauracion real del estado depende del nucleo: filas, orden, persistencia y rerender principal.',
      requiredHost:['restoreUndoState']
    },
    {
      scope:'practicasGuardias.reassignment',
      reason:'Habilitar practicas cambia la rotacion de guardias; el modulo no recalcula el tablero si el host no inyecta ese flujo.',
      requiredHost:['refreshOrdenGuardias','reassignAllGuardias','persistData']
    },
    {
      scope:'tvPanel.assignments',
      reason:'Las tarjetas TV y la vista de impresion no pueden reconstruir coberturas por si solas sin los calculos del dominio principal.',
      requiredHost:['assignGuardiasForRows','getBibliotecaAsignada','getBanosAsignado','resolveAulaRegistro']
    }
  ];

  function noop(){}
  function cleanTextFallback(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function stripDiacriticsFallback(value){return cleanTextFallback(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function normalizeTextFallback(value){return stripDiacriticsFallback(value).toLowerCase();}
  function sameNormalizedTextFallback(a,b){return normalizeTextFallback(a)===normalizeTextFallback(b);}
  function formatNowPartsFallback(){
    const date=new Date();
    return {hours:date.getHours(),minutes:date.getMinutes(),date};
  }
  function formatWeekRangeLabelFallback(weekKey,weekOffset){
    return cleanTextFallback(weekKey)||`Semana ${cleanTextFallback(weekOffset||0)}`;
  }
  function getCurrentMonthKeyFallback(){
    const now=new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }
  function getMonthKeyFromDateKeyFallback(value){
    const match=/^\d{4}-\d{2}/.exec(cleanTextFallback(value));
    return match?match[0]:'';
  }
  function getSchoolWeekDateFromKeyFallback(weekKey){
    const value=cleanTextFallback(weekKey);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date=new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())?null:date;
  }
  function cloneJson(value){return JSON.parse(JSON.stringify(value));}
  function escapeHtml(value){
    return String(value==null?'':value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function isFn(value){return typeof value==='function';}
  function asSet(value){
    if(value instanceof Set) return value;
    return new Set(Array.isArray(value)?value:[...DEFAULT_HORAS_PATIO]);
  }
  function getValue(source,fallback){
    if(isFn(source)) return source();
    return source==null?fallback:source;
  }
  function setVia(setter,value){
    if(!isFn(setter)) return value;
    setter(value);
    return value;
  }
  function requireFn(name,value){
    if(!isFn(value)) throw new Error(`GuardiasAuxPanels requires host function "${name}".`);
    return value;
  }
  function createSharedHost(options){
    const core=options.core||global.GuardiasCore||{};
    const ui=options.ui||global.GuardiasUi||{};
    return {
      global:options.global||global,
      document:options.document||global.document,
      window:options.window||global,
      storage:options.storage||global.GuardiasStorage||null,
      keys:{...STORAGE_KEYS,...(options.keys||{})},
      horaMap:options.horaMap||DEFAULT_HORA_MAP,
      horasPatio:asSet(options.horasPatio),
      dias:options.dias||DEFAULT_DIAS,
      cleanText:isFn(options.cleanText)?options.cleanText:(isFn(core.cleanText)?core.cleanText:cleanTextFallback),
      normalizeText:isFn(options.normalizeText)?options.normalizeText:(isFn(core.normalizeText)?core.normalizeText:normalizeTextFallback),
      stripDiacritics:isFn(options.stripDiacritics)?options.stripDiacritics:(isFn(core.stripDiacritics)?core.stripDiacritics:stripDiacriticsFallback),
      sameNormalizedText:isFn(options.sameNormalizedText)?options.sameNormalizedText:(isFn(core.sameNormalizedText)?core.sameNormalizedText:sameNormalizedTextFallback),
      formatNowParts:isFn(options.formatNowParts)?options.formatNowParts:(isFn(core.formatNowParts)?core.formatNowParts:formatNowPartsFallback),
      formatWeekRangeLabel:isFn(options.formatWeekRangeLabel)?options.formatWeekRangeLabel:(isFn(core.formatWeekRangeLabel)?core.formatWeekRangeLabel:formatWeekRangeLabelFallback),
      getCurrentMonthKey:isFn(options.getCurrentMonthKey)?options.getCurrentMonthKey:(isFn(core.getCurrentMonthKey)?core.getCurrentMonthKey:getCurrentMonthKeyFallback),
      getMonthKeyFromDateKey:isFn(options.getMonthKeyFromDateKey)?options.getMonthKeyFromDateKey:(isFn(core.getMonthKeyFromDateKey)?core.getMonthKeyFromDateKey:getMonthKeyFromDateKeyFallback),
      getSchoolWeekDateFromKey:isFn(options.getSchoolWeekDateFromKey)?options.getSchoolWeekDateFromKey:(isFn(core.getSchoolWeekDateFromKey)?core.getSchoolWeekDateFromKey:getSchoolWeekDateFromKeyFallback),
      askConfirm:isFn(options.askConfirm)?options.askConfirm:(isFn(ui.askConfirm)?ui.askConfirm:async()=>false),
      askText:isFn(options.askText)?options.askText:(isFn(ui.askText)?ui.askText:async()=> ''),
      showToast:isFn(options.showToast)?options.showToast:(isFn(ui.showToast)?ui.showToast:noop)
    };
  }

  function createTvAnnouncementsDomain(options){
    const shared=createSharedHost(options||{});
    const storage=shared.storage;
    const stateRef={current:normalizeTvAnnouncementState(shared,getValue(options.getState,options.initialState||{}))};
    let marqueeRaf=0;
    let resizeHandler=null;

    function getState(){
      const external=getValue(options.getState,null);
      if(external!=null){
        stateRef.current=normalizeTvAnnouncementState(shared,external);
      }
      return stateRef.current;
    }
    function setState(nextState){
      const normalized=normalizeTvAnnouncementState(shared,nextState);
      stateRef.current=normalized;
      setVia(options.setState,normalized);
      return normalized;
    }
    function load(){
      const initial=storage&&isFn(storage.readJson)
        ? storage.readJson(shared.keys.tvAnnouncement,{})
        : {};
      return setState(initial);
    }
    function persistLocal(nextState){
      const normalized=normalizeTvAnnouncementState(shared,nextState);
      if(storage&&isFn(storage.writeJson)){
        storage.writeJson(shared.keys.tvAnnouncement,normalized);
      }
      return setState(normalized);
    }
    function stopMarquee(){
      if(marqueeRaf){
        shared.window.cancelAnimationFrame(marqueeRaf);
        marqueeRaf=0;
      }
    }
    function startMarquee(container){
      stopMarquee();
      const track=container&&container.querySelector('.tv-announcement-track');
      const firstSegment=track&&track.querySelector('.tv-announcement-segment');
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
        if(offset<=-resetOffset) offset=startOffset;
        track.style.transform=`translateX(${offset}px)`;
        marqueeRaf=shared.window.requestAnimationFrame(step);
      }
      track.style.transform=`translateX(${startOffset}px)`;
      marqueeRaf=shared.window.requestAnimationFrame(step);
    }
    async function persistState(nextState,successMessage){
      try{
        const payload={
          ...normalizeTvAnnouncementState(shared,nextState),
          updatedAt:new Date().toISOString(),
          updatedBy:shared.cleanText(getValue(options.updatedBy,'Jefatura'))
        };
        let saved=payload;
        if(isFn(options.saveRemote)){
          saved=await options.saveRemote(payload);
        }
        persistLocal(saved);
        render();
        if(isFn(options.renderTvPanel)) options.renderTvPanel();
        if(isFn(options.notifyRealtimeSync)) options.notifyRealtimeSync('tv-announcement');
        if(successMessage) shared.showToast(successMessage,'success');
        return true;
      }catch(error){
        console.error('GuardiasAuxPanels.persistTvAnnouncementState failed',error);
        shared.showToast('No se pudo actualizar el aviso para la sala del profesorado.','error');
        return false;
      }
    }
    function render(){
      const elements=getTvAnnouncementElements(shared.document,options.elements);
      const tvAnnouncement=getState();
      const activeItems=(tvAnnouncement.items||[]).filter(item=>item.active&&item.text);
      const active=activeItems.length>0;
      if(shared.document&&shared.document.body){
        shared.document.body.classList.toggle('tv-announcement-active',active);
      }
      if(elements.input&&shared.document.activeElement!==elements.input) elements.input.value='';
      if(elements.priorityInput&&shared.document.activeElement!==elements.priorityInput) elements.priorityInput.value='normal';
      if(elements.status){
        elements.status.textContent=active
          ? `${activeItems.length} aviso${activeItems.length===1?'':'s'} activo${activeItems.length===1?'':'s'}${tvAnnouncement.updatedAt?` · ${new Date(tvAnnouncement.updatedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`:''}`
          : 'No hay aviso activo.';
      }
      if(elements.list){
        const items=tvAnnouncement.items||[];
        elements.list.innerHTML=items.length?items.map((item,index)=>`
          <div class="tv-admin-item">
            <div class="tv-admin-item-main">
              <span class="tv-admin-priority tv-admin-priority-${item.priority}">${item.priority==='urgent'?'Urgente':item.priority==='important'?'Importante':'Normal'}</span>
              <div class="tv-admin-item-text">${escapeHtml(item.text)}</div>
              <div class="tv-admin-item-meta">${item.active?'Activo en TV':'Guardado sin activar'}</div>
            </div>
            <div class="tv-admin-item-actions">
              <button class="btn-substitution" type="button" data-tv-announcement-action="toggle" data-tv-announcement-id="${escapeHtml(item.id)}">${item.active?'Desactivar':'Activar'}</button>
              <button class="btn-substitution" type="button" data-tv-announcement-action="move-up" data-tv-announcement-id="${escapeHtml(item.id)}" ${index===0?'disabled':''}>Subir</button>
              <button class="btn-substitution" type="button" data-tv-announcement-action="move-down" data-tv-announcement-id="${escapeHtml(item.id)}" ${index===items.length-1?'disabled':''}>Bajar</button>
              <button class="btn-substitution btn-substitution-danger" type="button" data-tv-announcement-action="remove" data-tv-announcement-id="${escapeHtml(item.id)}">Eliminar</button>
            </div>
          </div>
        `).join(''):'<div class="future-absence-empty">No hay avisos guardados.</div>';
      }
      if(!elements.bar||!elements.textNode) return;
      elements.bar.hidden=!active;
      if(!active){
        stopMarquee();
        delete elements.textNode.dataset.tickerText;
        elements.textNode.innerHTML='';
        return;
      }
      const tickerText=activeItems
        .map(item=>`${item.priority==='urgent'?'URGENTE':item.priority==='important'?'IMPORTANTE':'AVISO'} · ${item.text}`)
        .join('  •  ');
      if(elements.textNode.dataset.tickerText===tickerText&&elements.textNode.querySelector('.tv-announcement-track')) return;
      elements.textNode.dataset.tickerText=tickerText;
      elements.textNode.innerHTML=`
        <div class="tv-announcement-track">
          <span class="tv-announcement-segment">${escapeHtml(tickerText)}</span>
          <span class="tv-announcement-segment" aria-hidden="true">${escapeHtml(tickerText)}</span>
        </div>
      `;
      startMarquee(elements.textNode);
    }
    async function add(){
      const elements=getTvAnnouncementElements(shared.document,options.elements);
      const text=shared.cleanText(elements.input&&elements.input.value).replace(/\s+/g,' ').trim();
      const priority=['urgent','important','normal'].includes(elements.priorityInput&&elements.priorityInput.value)
        ? elements.priorityInput.value
        : 'normal';
      if(!text){
        shared.showToast('Escribe un aviso antes de anadirlo.','error');
        if(elements.input) elements.input.focus();
        return;
      }
      const tvAnnouncement=getState();
      const items=[...(tvAnnouncement.items||[])];
      items.push(normalizeTvAnnouncementItem(shared,{
        id:`aviso-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        text,
        priority,
        active:true
      },items.length));
      const ok=await persistState({items},'Aviso añadido y activado en la sala del profesorado.');
      if(ok&&elements.input) elements.input.value='';
    }
    async function deactivateAll(){
      const tvAnnouncement=getState();
      const items=(tvAnnouncement.items||[]).map(item=>({...item,active:false}));
      await persistState({items},'Todos los avisos han quedado desactivados.');
    }
    async function toggleItem(id){
      const tvAnnouncement=getState();
      const items=(tvAnnouncement.items||[]).map(item=>item.id===id?{...item,active:!item.active}:item);
      await persistState({items},'Estado del aviso actualizado.');
    }
    async function removeItem(id){
      const tvAnnouncement=getState();
      const items=(tvAnnouncement.items||[]).filter(item=>item.id!==id);
      await persistState({items},'Aviso eliminado.');
    }
    async function moveItem(id,direction){
      const tvAnnouncement=getState();
      const items=[...(tvAnnouncement.items||[])];
      const index=items.findIndex(item=>item.id===id);
      if(index===-1) return;
      const nextIndex=index+Number(direction||0);
      if(nextIndex<0||nextIndex>=items.length) return;
      [items[index],items[nextIndex]]=[items[nextIndex],items[index]];
      await persistState({items},'Orden de avisos actualizado.');
    }
    function bindAdminList(element){
      const list=element||getTvAnnouncementElements(shared.document,options.elements).list;
      if(!list) return noop;
      const onClick=event=>{
        const button=event.target.closest('[data-tv-announcement-action][data-tv-announcement-id]');
        if(!button) return;
        const action=button.dataset.tvAnnouncementAction||'';
        const id=button.dataset.tvAnnouncementId||'';
        if(action==='toggle') toggleItem(id);
        if(action==='remove') removeItem(id);
        if(action==='move-up') moveItem(id,-1);
        if(action==='move-down') moveItem(id,1);
      };
      list.addEventListener('click',onClick);
      return ()=>list.removeEventListener('click',onClick);
    }
    function bindResize(){
      if(resizeHandler) return resizeHandler;
      resizeHandler=()=>{
        const elements=getTvAnnouncementElements(shared.document,options.elements);
        if(elements.bar&&elements.bar.hidden) return;
        if(elements.textNode) startMarquee(elements.textNode);
      };
      shared.window.addEventListener('resize',resizeHandler);
      return resizeHandler;
    }
    function unbindResize(){
      if(!resizeHandler) return;
      shared.window.removeEventListener('resize',resizeHandler);
      resizeHandler=null;
    }
    if(getValue(options.autoLoad,false)) load();
    return {
      getState,
      setState,
      load,
      persistLocal,
      persistState,
      render,
      add,
      deactivateAll,
      toggleItem,
      removeItem,
      moveItem,
      startMarquee,
      stopMarquee,
      bindAdminList,
      bindResize,
      unbindResize
    };
  }

  function createTvPanelDomain(options){
    const shared=createSharedHost(options||{});
    const urlParams=new URLSearchParams(shared.window.location.search||'');
    const forcedTvHora=Number(urlParams.get('forceTvHora'));
    const forcedTvDia=Number(urlParams.get('forceTvDia'));
    const getDay=()=>Number(getValue(options.getDay,0))||0;
    const getWeekOffset=()=>Number(getValue(options.getWeekOffset,0))||0;
    const getRowsForWeekOffset=requireFn('getRowsForWeekOffset',options.getRowsForWeekOffset);
    const getVisibleTeacherName=requireFn('getVisibleTeacherName',options.getVisibleTeacherName);
    const resolveAulaRegistro=requireFn('resolveAulaRegistro',options.resolveAulaRegistro);
    const assignGuardiasForRows=requireFn('assignGuardiasForRows',options.assignGuardiasForRows);
    const getBibliotecaAsignada=requireFn('getBibliotecaAsignada',options.getBibliotecaAsignada);
    const getBanosAsignado=requireFn('getBanosAsignado',options.getBanosAsignado);
    const getPatioCoverageSummary=isFn(options.getPatioCoverageSummary)?options.getPatioCoverageSummary:null;
    const getPatioSectors=isFn(options.getPatioSectors)?options.getPatioSectors:()=>Array.isArray(options.patioSectors)?options.patioSectors:[];
    const getPatioExtraPosts=isFn(options.getPatioExtraPosts)?options.getPatioExtraPosts:null;
    const getPrintScheduleSnapshot=isFn(options.getPrintScheduleSnapshot)?options.getPrintScheduleSnapshot:()=>null;

    function getCurrentSchoolSlot(){
      if(Number.isInteger(forcedTvHora)&&forcedTvHora>=1&&forcedTvHora<=9){
        const todayIndex=getTodaySchoolDayIndex();
        const safeDay=Number.isInteger(forcedTvDia)&&forcedTvDia>=0&&forcedTvDia<=4
          ? forcedTvDia
          : (todayIndex==null?0:todayIndex);
        return {dia:safeDay,hora:forcedTvHora,forced:true};
      }
      const now=shared.formatNowParts();
      const total=(now.hours*60)+now.minutes;
      const weekday=now.date.getDay();
      if(weekday<1||weekday>5) return null;
      const found=Object.entries(shared.horaMap).find((entry)=>{
        const info=entry[1]||{};
        const range=String(info.rango||'');
        const pieces=range.split('-');
        const start=pieces[0]||'';
        const end=pieces[1]||'';
        const startParts=start.split(':').map(Number);
        const endParts=end.split(':').map(Number);
        const sh=startParts[0];
        const sm=startParts[1];
        const eh=endParts[0];
        const em=endParts[1];
        if(!Number.isInteger(sh)||!Number.isInteger(sm)||!Number.isInteger(eh)||!Number.isInteger(em)) return false;
        return total>=sh*60+sm&&total<eh*60+em;
      });
      if(!found) return null;
      const hora=Number(found[0]);
      return {dia:weekday-1,hora};
    }
    function getTodaySchoolDayIndex(){
      const weekday=shared.formatNowParts().date.getDay();
      return weekday>=1&&weekday<=5?weekday-1:null;
    }
    function getUpcomingSchoolSlotsForToday(limit){
      const max=Math.max(0,Number(limit||2));
      if(Number.isInteger(forcedTvHora)&&forcedTvHora>=1&&forcedTvHora<=9) return [];
      const now=shared.formatNowParts();
      const total=(now.hours*60)+now.minutes;
      const weekday=now.date.getDay();
      if(weekday<1||weekday>5) return [];
      const upcoming=[];
      Object.keys(shared.horaMap).map(Number).sort((a,b)=>a-b).forEach(hora=>{
        if(upcoming.length>=max) return;
        const start=String(shared.horaMap[hora]&&shared.horaMap[hora].rango||'').split('-')[0]||'';
        const parts=start.split(':').map(Number);
        const sh=parts[0];
        const sm=parts[1];
        if(!Number.isInteger(sh)||!Number.isInteger(sm)) return;
        if(total<sh*60+sm) upcoming.push({dia:weekday-1,hora});
      });
      return upcoming;
    }
    function getDateForSchoolWeekDay(weekKey,dayIndex){
      const monday=shared.getSchoolWeekDateFromKey(weekKey);
      if(!(monday instanceof Date)||Number.isNaN(monday.getTime())||!Number.isInteger(dayIndex)) return null;
      const targetDate=new Date(monday);
      targetDate.setDate(monday.getDate()+dayIndex);
      return targetDate;
    }
    function formatPrintableDateLabel(date){
      if(!(date instanceof Date)||Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'});
    }
    function getTvRouteUrl(){
      if(shared.window.location.protocol==='file:') return 'guardias.html?view=tv';
      const url=new URL(shared.window.location.href);
      url.searchParams.set('view','tv');
      url.pathname='/';
      return `${url.pathname}${url.search}`;
    }
    function getPrintRouteUrl(targetDay,targetWeekOffset){
      const safeDay=Number.isInteger(Number(targetDay))?Math.max(0,Math.min(shared.dias.length-1,Number(targetDay))):getDay();
      const safeWeekOffset=Number.isInteger(Number(targetWeekOffset))?Math.max(-1,Math.min(3,Number(targetWeekOffset))):getWeekOffset();
      if(shared.window.location.protocol==='file:') return `guardias.html?view=print&day=${safeDay}&weekOffset=${safeWeekOffset}`;
      const url=new URL(shared.window.location.href);
      url.searchParams.set('view','print');
      url.searchParams.set('day',String(safeDay));
      url.searchParams.set('weekOffset',String(safeWeekOffset));
      url.pathname='/';
      return `${url.pathname}${url.search}`;
    }
    function getMainRouteUrl(){
      if(shared.window.location.protocol==='file:') return 'guardias.html';
      const url=new URL(shared.window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('day');
      url.searchParams.delete('weekOffset');
      if(url.pathname.toLowerCase().endsWith('/tv')) url.pathname=url.pathname.slice(0,-3)||'/';
      if(url.pathname.toLowerCase().endsWith('/print')) url.pathname=url.pathname.slice(0,-6)||'/';
      return `${url.pathname}${url.search}${url.hash}`;
    }
    function openTvPanel(){
      shared.window.location.href=getTvRouteUrl();
    }
    function closeTvPanel(){
      shared.window.location.href=getMainRouteUrl();
    }
    function openPrintableSchedule(){
      if(getValue(options.isAdmin,false)!==true) return;
      const destination=getPrintRouteUrl(getDay(),getWeekOffset());
      shared.window.location.href=destination;
    }
    function getTvSlotAssignments(slot,rowsSource){
      if(!slot) return [];
      const currentRows=Array.isArray(rowsSource)?rowsSource:[];
      const slotRows=currentRows
        .filter(row=>row.dia===slot.dia&&row.hora===slot.hora)
        .sort((a,b)=>String(a&&a.id||'').localeCompare(String(b&&b.id||'')));
      const fallbackAssignmentsById=new Map(
        assignGuardiasForRows(currentRows)
          .filter(row=>row.dia===slot.dia&&row.hora===slot.hora)
          .map(row=>[String(row&&row.id||''),row])
      );
      const rows=slotRows
        .map(row=>{
          if(shared.cleanText(row.guardia)) return row;
          const fallback=fallbackAssignmentsById.get(String(row&&row.id||''));
          return fallback&&shared.cleanText(fallback.guardia)?{...row,guardia:fallback.guardia}:row;
        })
        .sort((a,b)=>String(getVisibleTeacherName(a.guardia||'')).localeCompare(getVisibleTeacherName(b.guardia||''),'es'));
      const assignments=rows.map(row=>({
        teacher:getVisibleTeacherName(row.guardia||'')||'Sin cubrir',
        location:resolveAulaRegistro(row)||'Sin ubicacion',
        meta:getVisibleTeacherName(row.ausente||'')?`Cubre a ${getVisibleTeacherName(row.ausente)}`:'',
        tone:'general'
      }));
      const assignedTeachers=new Set(assignments.map(item=>shared.cleanText(item.teacher)).filter(Boolean));
      const biblioteca=getBibliotecaAsignada(slot.dia,slot.hora,currentRows);
      const banos=getBanosAsignado(slot.dia,slot.hora,currentRows);
      if(biblioteca&&!assignedTeachers.has(shared.cleanText(getVisibleTeacherName(biblioteca)))){
        assignments.push({teacher:getVisibleTeacherName(biblioteca),location:'Biblioteca',meta:'Puesto de apoyo',tone:'biblioteca'});
      }
      if(banos&&!assignedTeachers.has(shared.cleanText(getVisibleTeacherName(banos)))){
        assignments.push({teacher:getVisibleTeacherName(banos),location:'Banos',meta:'Puesto de apoyo',tone:'banos'});
      }
      if(assignments.length) return assignments.slice();
      const fallbackAssignments=[];
      if(biblioteca) fallbackAssignments.push({teacher:getVisibleTeacherName(biblioteca),location:'Biblioteca',meta:'Puesto de apoyo',tone:'biblioteca'});
      if(banos) fallbackAssignments.push({teacher:getVisibleTeacherName(banos),location:'Banos',meta:'Puesto de apoyo',tone:'banos'});
      return fallbackAssignments;
    }
    function getPrintableSlotsForDay(targetDay,rowsSource){
      return Object.keys(shared.horaMap)
        .map(Number)
        .filter(hora=>!shared.horasPatio.has(hora))
        .map(hora=>({
          hora,
          info:shared.horaMap[hora],
          assignments:getTvSlotAssignments({dia:targetDay,hora},rowsSource)
        }));
    }
    function normalizePrintSnapshot(raw){
      if(!raw||typeof raw!=='object'||!Array.isArray(raw.slots)) return null;
      const safeSlots=raw.slots.map(slot=>{
        const hora=Number(slot?.hora);
        if(!Number.isInteger(hora)||!shared.horaMap[hora]) return null;
        const info=slot.info&&typeof slot.info==='object'?slot.info:shared.horaMap[hora];
        return {
          hora,
          info:{
            label:shared.cleanText(info.label)||shared.horaMap[hora].label,
            rango:shared.cleanText(info.rango)||shared.horaMap[hora].rango
          },
          assignments:(Array.isArray(slot.assignments)?slot.assignments:[]).map(item=>({
            teacher:shared.cleanText(item?.teacher),
            location:shared.cleanText(item?.location),
            meta:shared.cleanText(item?.meta),
            tone:shared.cleanText(item?.tone)||'general'
          }))
        };
      }).filter(Boolean);
      if(!safeSlots.length) return null;
      return {
        slots:safeSlots,
        dayLabel:shared.cleanText(raw.dayLabel),
        dateLabel:shared.cleanText(raw.dateLabel),
        weekLabel:shared.cleanText(raw.weekLabel),
        createdAt:shared.cleanText(raw.createdAt)
      };
    }
    function normalizePatioExtraPost(item,index){
      const row=item&&typeof item==='object'&&!Array.isArray(item)?item:{label:item};
      const label=shared.cleanText(row.label||row.name||row.title||row.puesto||row.post||row.id||`Extra ${index+1}`);
      if(!label) return null;
      const responsible=shared.cleanText(row.responsable||row.teacher||row.profesor||row.assignedTo||row.person||row.coveredBy);
      const coveredRaw=row.covered;
      const fallbackCovered=row.isCovered;
      const covered=typeof coveredRaw==='boolean'
        ? coveredRaw
        : (typeof fallbackCovered==='boolean'?fallbackCovered:!!responsible);
      return {
        id:shared.cleanText(row.id||row.code||row.slug||label).toLowerCase(),
        label,
        responsible,
        covered,
        note:shared.cleanText(row.note||row.notes||row.meta||row.description)
      };
    }
    function normalizePatioExtraPosts(items){
      return [...new Map((Array.isArray(items)?items:[])
        .map(normalizePatioExtraPost)
        .filter(Boolean)
        .map(item=>[item.id,item])).values()];
    }
    function resolvePatioExtraPosts(slot,summary){
      const direct=getPatioExtraPosts?getPatioExtraPosts(slot.dia,slot.hora):null;
      if(Array.isArray(direct)) return normalizePatioExtraPosts(direct);
      const summaryExtras=summary?.extraPosts||summary?.extras||summary?.puestosExtra;
      return normalizePatioExtraPosts(summaryExtras);
    }
    function renderTvPatioPanel(container,slot,renderOptions){
      const localOptions=renderOptions||{};
      const sectors=getPatioSectors();
      const summary=getPatioCoverageSummary?getPatioCoverageSummary(slot.dia,slot.hora):null;
      const states=summary&&Array.isArray(summary.states)?summary.states:[];
      const extraPosts=resolvePatioExtraPosts(slot,summary);
      if(!summary||!sectors.length){
        container.innerHTML='<div class="tv-empty">No hay configuración de patio disponible para este tramo.</div>';
        return;
      }
      const legendMarkup=sectors.map(sector=>{
        const state=states.find(item=>item.sectorId===sector.id)||null;
        const covered=!!state?.covered;
        const stateClass=state?.statusKind==='blocked'?'is-blocked':state?.statusKind==='partial'?'is-partial':covered?'is-covered':'is-pending';
        return `<div class="tv-patio-legend-item ${stateClass}">
          <span class="tv-patio-legend-dot">${escapeHtml(sector.shortLabel||sector.id||'')}</span>
          <div class="tv-patio-legend-copy">
            <div class="tv-patio-legend-row">
              <span class="tv-patio-legend-text">${escapeHtml(sector.label||sector.id||'Sector')}</span>
              <span class="tv-patio-legend-state">${escapeHtml(state?.statusLabel||(covered?'Cubierto':'Pendiente'))}</span>
            </div>
            <div class="tv-patio-legend-person">${escapeHtml(state?.responsable||state?.note||'Rotación sin asignar')}</div>
          </div>
        </div>`;
      }).join('');
      const extrasMarkup=extraPosts.length?`<div class="tv-patio-extras">
        <div class="tv-patio-extras-head">
          <span class="tv-patio-extras-title">Puestos extra</span>
          <span class="tv-patio-extras-count">${extraPosts.length}</span>
        </div>
        <div class="tv-patio-extras-list">
          ${extraPosts.map(item=>`<div class="tv-patio-extra ${item.statusKind==='blocked'?'is-blocked':item.statusKind==='partial'?'is-partial':item.covered?'is-covered':'is-pending'}">
            <div class="tv-patio-extra-row">
              <span class="tv-patio-extra-name">${escapeHtml(item.label)}</span>
              <span class="tv-patio-extra-state">${escapeHtml(item.statusLabel||(item.covered?'Cubierto':'Pendiente'))}</span>
            </div>
            <div class="tv-patio-extra-person">${escapeHtml(item.responsible||item.note||'Sin asignar')}</div>
          </div>`).join('')}
        </div>
      </div>`:'';
      if(localOptions.compact){
        container.innerHTML=`<div class="tv-patio-shell tv-patio-shell-preview">
          <div class="tv-patio-status ${summary.pending?'is-pending':'is-covered'}">${summary.covered}/${summary.total} sectores cubiertos</div>
          <div class="tv-patio-side">
            <div class="tv-patio-legend">${legendMarkup}</div>
            ${extrasMarkup}
          </div>
        </div>`;
        return;
      }
      container.innerHTML=`<div class="tv-patio-shell">
        <div class="tv-patio-status ${summary.pending?'is-pending':'is-covered'}">${summary.covered}/${summary.total} sectores cubiertos</div>
        <div class="tv-patio-layout">
          <div class="tv-patio-side">
            <div class="tv-patio-legend">${legendMarkup}</div>
            ${extrasMarkup}
          </div>
          <div class="tv-patio-map">
            ${sectors.map(sector=>{
            const state=states.find(item=>item.sectorId===sector.id)||null;
            const covered=!!state?.covered;
            const stateClass=state?.statusKind==='blocked'?'is-blocked':state?.statusKind==='partial'?'is-partial':covered?'is-covered':'is-pending';
            return `<article class="tv-patio-sector ${sector.mapClass||''} ${stateClass}">
              <div class="tv-patio-sector-top">
                <span class="tv-patio-sector-badge">${escapeHtml(sector.shortLabel||sector.id||'')}</span>
                <span class="tv-patio-sector-state">${escapeHtml(state?.statusLabel||(covered?'Cubierto':'Pendiente'))}</span>
              </div>
              <div class="tv-patio-sector-name">${escapeHtml(sector.label||sector.id||'Sector')}</div>
              <div class="tv-patio-sector-person">${escapeHtml(state?.responsable||state?.note||'Rotación sin asignar')}</div>
            </article>`;
          }).join('')}
          </div>
        </div>
      </div>`;
    }
    function renderTvSlotPanel(containerId,slot,badgeId,rowsSource,renderOptions){
      const localOptions=renderOptions||{};
      const container=shared.document.getElementById(containerId);
      const badge=shared.document.getElementById(badgeId);
      if(!container||!badge) return;
      if(!slot){
        badge.textContent=localOptions.emptyBadge||'Sin tramo lectivo';
        container.innerHTML=`<div class="tv-empty">${escapeHtml(localOptions.emptyMessage||'No hay un tramo lectivo activo ahora mismo.')}</div>`;
        return;
      }
      badge.textContent=`${shared.horaMap[slot.hora].label} hora · ${shared.horaMap[slot.hora].rango.replace('-', ' - ')}`;
      if(shared.horasPatio.has(slot.hora)){
        renderTvPatioPanel(container,slot,{compact:!localOptions.isCurrentSlot});
        return;
      }
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
      const shell=shared.document.getElementById((options.elements&&options.elements.shellId)||'tvShell');
      const grid=shared.document.querySelector('.tv-grid');
      const nextPanel=shared.document.querySelector('.tv-panel-next');
      const laterPanel=shared.document.querySelector('.tv-panel-later');
      if(!shell) return;
      const rowsSource=getRowsForWeekOffset(0);
      const currentSlot=getCurrentSchoolSlot();
      const currentIsPatio=!!(currentSlot&&shared.horasPatio.has(currentSlot.hora));
      const upcomingSlots=getUpcomingSchoolSlotsForToday(2);
      const nextSlot=upcomingSlots[0]||null;
      const laterSlot=upcomingSlots[1]||null;
      if(grid) grid.classList.toggle('tv-grid-patio-focus',currentIsPatio);
      if(nextPanel) nextPanel.hidden=currentIsPatio;
      if(laterPanel) laterPanel.hidden=currentIsPatio;
      renderTvSlotPanel((options.elements&&options.elements.currentPanelId)||'tvCurrentPanel',currentSlot,(options.elements&&options.elements.currentBadgeId)||'tvCurrentSlotBadge',rowsSource,{
        isCurrentSlot:true,
        emptyBadge:'Sin tramo lectivo',
        emptyMessage:getTodaySchoolDayIndex()==null
          ? 'Hoy no hay jornada lectiva. El panel volvera a activarse en el proximo dia de clase.'
          : 'Ahora mismo no hay un tramo lectivo activo.'
      });
      renderTvSlotPanel((options.elements&&options.elements.nextPanelId)||'tvNextPanel',nextSlot,(options.elements&&options.elements.nextBadgeId)||'tvNextSlotBadge',rowsSource,{
        isCurrentSlot:false,
        emptyBadge:'Sin siguiente tramo',
        emptyMessage:getTodaySchoolDayIndex()==null
          ? 'No hay siguiente tramo programado para hoy.'
          : 'No queda ningun tramo lectivo por delante en la jornada de hoy.'
      });
      renderTvSlotPanel((options.elements&&options.elements.laterPanelId)||'tvLaterPanel',laterSlot,(options.elements&&options.elements.laterBadgeId)||'tvLaterSlotBadge',rowsSource,{
        isCurrentSlot:false,
        emptyBadge:'Sin siguiente tramo',
        emptyMessage:getTodaySchoolDayIndex()==null
          ? 'No hay mas tramos programados para hoy.'
          : 'No queda un tercer tramo visible en la jornada de hoy.'
      });
    }
    function renderPrintSchedule(){
      const shell=shared.document.getElementById((options.elements&&options.elements.printShellId)||'printShell');
      if(!shell) return;
      const printMode=!!getValue(options.printMode,false);
      if(!printMode){
        shell.innerHTML='';
        return;
      }
      const weekKey=requireFn('getSelectedWeekKey',options.getSelectedWeekKey)();
      const day=getDay();
      const weekOffset=getWeekOffset();
      const targetDate=getDateForSchoolWeekDay(weekKey,day);
      const rowsSource=getRowsForWeekOffset(weekOffset);
      const snapshot=normalizePrintSnapshot(getPrintScheduleSnapshot());
      const slots=snapshot?.slots||getPrintableSlotsForDay(day,rowsSource);
      const generatedAt=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
      const snapshotCreated=snapshot?.createdAt?new Date(snapshot.createdAt):null;
      const snapshotTime=snapshotCreated instanceof Date&&!Number.isNaN(snapshotCreated.getTime())
        ? snapshotCreated.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
        : generatedAt;
      const dayLabel=snapshot?.dayLabel||shared.dias[day]||'Jornada lectiva';
      const dateLabel=snapshot?.dateLabel||formatPrintableDateLabel(targetDate);
      const weekLabel=snapshot?.weekLabel||shared.formatWeekRangeLabel(weekKey,weekOffset);
      shell.innerHTML=`
        <div class="print-toolbar no-print">
          <div class="print-toolbar-copy">
            <strong>Vista imprimible de contingencia</strong>
            <span>Instantanea estatica generada a las ${escapeHtml(snapshotTime)}.</span>
          </div>
          <div class="print-toolbar-actions">
            <button class="btn-add btn-add-secondary" type="button" data-guardias-aux-print="native">Imprimir horario</button>
            <a class="btn-add btn-add-ghost print-close-link" href="${escapeHtml(getMainRouteUrl())}">Volver</a>
          </div>
        </div>
        <section class="print-sheet">
          <header class="print-sheet-head">
            <div>
              <div class="print-sheet-kicker">IES Alcalans · Parte de guardias</div>
              <h1 class="print-sheet-title">Horario de contingencia</h1>
              <div class="print-sheet-meta">Generado a las ${escapeHtml(snapshotTime)}</div>
            </div>
            <div class="print-sheet-date">
              <div class="print-sheet-day">${escapeHtml(dayLabel)}</div>
              <div class="print-sheet-date-text">${escapeHtml(dateLabel)}</div>
              <div class="print-sheet-week">${escapeHtml(weekLabel)}</div>
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
          <footer class="print-sheet-note">El profesorado que no te tasca assignada ha de controlar els banys i els corredors.</footer>
        </section>
      `;
    }
    function syncTvExitLink(){
      const exitLink=shared.document.getElementById((options.elements&&options.elements.exitLinkId)||'tvExitBtn');
      if(!exitLink) return;
      exitLink.setAttribute('href',getMainRouteUrl());
    }
    function bindPrintActions(element){
      const root=element||shared.document.getElementById((options.elements&&options.elements.printShellId)||'printShell');
      if(!root) return noop;
      const onClick=event=>{
        const button=event.target.closest('[data-guardias-aux-print="native"]');
        if(button) shared.window.print();
      };
      root.addEventListener('click',onClick);
      return ()=>root.removeEventListener('click',onClick);
    }
    return {
      getCurrentSchoolSlot,
      getTodaySchoolDayIndex,
      getUpcomingSchoolSlotsForToday,
      getDateForSchoolWeekDay,
      formatPrintableDateLabel,
      getTvRouteUrl,
      getPrintRouteUrl,
      getMainRouteUrl,
      openTvPanel,
      closeTvPanel,
      openPrintableSchedule,
      getTvSlotAssignments,
      getPrintableSlotsForDay,
      renderTvSlotPanel,
      renderTvPanel,
      renderPrintSchedule,
      syncTvExitLink,
      bindPrintActions
    };
  }

  function createHistoryDomain(options){
    const shared=createSharedHost(options||{});
    const storage=shared.storage;
    let filter=shared.cleanText(getValue(options.initialFilter,'all'))||'all';
    let entriesRef=Array.isArray(getValue(options.getEntries,options.initialEntries))?getValue(options.getEntries,options.initialEntries):[];

    function getEntries(){
      const external=getValue(options.getEntries,null);
      if(Array.isArray(external)) entriesRef=external;
      return entriesRef;
    }
    function setEntries(nextEntries){
      entriesRef=Array.isArray(nextEntries)?nextEntries:[];
      setVia(options.setEntries,entriesRef);
      return entriesRef;
    }
    function load(){
      const rows=storage&&isFn(storage.readJson)?storage.readJson(shared.keys.history,[]):[];
      return setEntries(Array.isArray(rows)?rows:[]);
    }
    function persist(nextEntries){
      const rows=setEntries(nextEntries);
      if(storage&&isFn(storage.writeJson)) storage.writeJson(shared.keys.history,rows);
      return rows;
    }
    function addEntry(title,detail,type,entryOptions){
      const nextEntries=[{
        id:`hist-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        title,
        detail,
        type:type||'other',
        undoState:entryOptions&&entryOptions.undoState||null,
        actor:shared.cleanText(getValue(options.historyActor,'Jefatura'))||'Jefatura',
        ts:new Date().toISOString()
      },...getEntries()].slice(0,200);
      persist(nextEntries);
      if(isFn(options.syncAdminState)) options.syncAdminState();
      return nextEntries[0];
    }
    function formatTimestamp(value){
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
    function getLastUndoableEntry(){
      return getEntries().find(entry=>entry&&entry.undoState&&entry.type!=='undo')||null;
    }
    function buildUndoState(dayOverride){
      if(isFn(options.buildUndoState)) return options.buildUndoState(dayOverride);
      const getData=requireFn('getData',options.getData);
      const getDay=requireFn('getDay',options.getDay);
      const state={data:cloneJson(getData()),day:typeof dayOverride==='number'?dayOverride:getDay()};
      if(isFn(options.getOrden)) state.orden=cloneJson(options.getOrden());
      return state;
    }
    function renderList(){
      const historyList=shared.document.getElementById((options.elements&&options.elements.listId)||'historyList');
      const undoButton=shared.document.getElementById((options.elements&&options.elements.undoButtonId)||'btnUndoHistory');
      if(!historyList) return;
      if(undoButton) undoButton.disabled=!getLastUndoableEntry();
      const visibles=filter==='all'
        ? getEntries()
        : getEntries().filter(entry=>(entry&&entry.type||'other')===filter);
      const filterButtons=shared.document.querySelectorAll(((options.elements&&options.elements.filtersSelector)||'#historyFilters .history-filter'));
      filterButtons.forEach(button=>{
        button.classList.toggle('active',button.dataset.filter===filter);
      });
      if(!visibles.length){
        historyList.innerHTML=`<div class="history-empty">${filter==='all'?'Todavía no hay cambios registrados.':'No hay cambios de este tipo en el historial.'}</div>`;
        if(isFn(options.renderAdminWorkspace)) options.renderAdminWorkspace();
        return;
      }
      historyList.innerHTML=visibles.map(entry=>`<article class="history-item">
        <div class="history-item-head">
          <div class="history-item-title">${escapeHtml(entry.title||'Cambio')}</div>
          <div class="history-item-time">${escapeHtml(formatTimestamp(entry.ts))}</div>
        </div>
        <div class="history-item-body">${escapeHtml(entry.detail||'')}</div>
      </article>`).join('');
      if(isFn(options.renderAdminWorkspace)) options.renderAdminWorkspace();
    }
    function setFilter(nextFilter){
      filter=shared.cleanText(nextFilter)||'all';
      renderList();
    }
    function openModal(){
      if(getValue(options.isAdmin,false)!==true) return;
      renderList();
      shared.document.getElementById((options.elements&&options.elements.overlayId)||'historyOverlay')?.classList.add('open');
    }
    function closeModal(){
      shared.document.getElementById((options.elements&&options.elements.overlayId)||'historyOverlay')?.classList.remove('open');
    }
    function bgClose(event){
      if(event&&event.target&&event.target.id===((options.elements&&options.elements.overlayId)||'historyOverlay')) closeModal();
    }
    async function clear(){
      if(getValue(options.isAdmin,false)!==true) return;
      if(!await shared.askConfirm('Borrar historial','Se eliminaran todas las entradas del historial de cambios.','Borrar')) return;
      persist([]);
      renderList();
      shared.showToast('Historial borrado.','success');
      if(isFn(options.syncAdminState)) options.syncAdminState();
    }
    async function undoLastChange(){
      if(getValue(options.isAdmin,false)!==true) return;
      const entry=getLastUndoableEntry();
      if(!entry){
        shared.showToast('No hay cambios para deshacer.','info');
        return;
      }
      if(!await shared.askConfirm('Deshacer último cambio',`Se revertirá: ${entry.title}.`,'Deshacer')) return;
      const restoreUndoState=requireFn('restoreUndoState',options.restoreUndoState);
      const currentState=buildUndoState(entry.undoState&&typeof entry.undoState.day==='number'?entry.undoState.day:getValue(options.getDay,0));
      if(!restoreUndoState(entry.undoState)){
        shared.showToast('No se pudo deshacer el cambio.','error');
        return;
      }
      entry.undoState=null;
      entry.reverted=true;
      persist(getEntries());
      addEntry('Cambio deshecho',`Se revirtio: ${entry.title}`,'undo',{undoState:currentState});
      renderList();
      if(isFn(options.onUndoApplied)) options.onUndoApplied();
      shared.showToast('Último cambio deshecho.','success');
    }
    function bindFilters(root){
      const container=root||shared.document;
      const onClick=event=>{
        const button=event.target.closest('[data-filter]');
        if(button&&button.closest((options.elements&&options.elements.filtersContainerSelector)||'#historyFilters')){
          setFilter(button.dataset.filter||'all');
        }
      };
      container.addEventListener('click',onClick);
      return ()=>container.removeEventListener('click',onClick);
    }
    if(getValue(options.autoLoad,false)) load();
    return {
      getEntries,
      setEntries,
      load,
      persist,
      addEntry,
      formatTimestamp,
      getLastUndoableEntry,
      renderList,
      getFilter:()=>filter,
      setFilter,
      openModal,
      closeModal,
      bgClose,
      clear,
      undoLastChange,
      bindFilters
    };
  }

  function createSubstitutionsDomain(options){
    const shared=createSharedHost(options||{});
    const storage=shared.storage;
    let filter='';
    let substitutionsRef=normalizeSubstitutionMap(shared,getValue(options.getSubstitutions,options.initialSubstitutions||{}),options);

    function getSubstitutions(){
      const external=getValue(options.getSubstitutions,null);
      if(external&&typeof external==='object'){
        substitutionsRef=normalizeSubstitutionMap(shared,external,options);
      }
      return substitutionsRef;
    }
    function setSubstitutions(nextMap){
      substitutionsRef=normalizeSubstitutionMap(shared,nextMap,options);
      setVia(options.setSubstitutions,substitutionsRef);
      return substitutionsRef;
    }
    function load(){
      const rows=storage&&isFn(storage.readJson)?storage.readJson(shared.keys.teacherSubstitutions,[]):[];
      return setSubstitutions(rows);
    }
    function persist(nextMap){
      const map=setSubstitutions(nextMap);
      if(storage&&isFn(storage.writeJson)){
        storage.writeJson(shared.keys.teacherSubstitutions,Object.entries(map).map((entry)=>({profesor:entry[0],sustituto:entry[1]})));
      }
      return map;
    }
    function normalizeTeacherSearch(value){
      if(isFn(options.normalizeTeacherSearch)) return options.normalizeTeacherSearch(value);
      return shared.normalizeText(value);
    }
    function teacherMatchesQuery(nombre,query){
      if(isFn(options.teacherMatchesQuery)) return options.teacherMatchesQuery(nombre,query);
      const normalizedQuery=normalizeTeacherSearch(query);
      if(!normalizedQuery) return true;
      const visible=requireFn('getVisibleTeacherName',options.getVisibleTeacherName)(nombre);
      return [nombre,visible].map(normalizeTeacherSearch).some(candidate=>candidate.includes(normalizedQuery));
    }
    function validateName(nombre,rawValue){
      if(isFn(options.validateSubstitutionName)) return options.validateSubstitutionName(nombre,rawValue);
      const value=shared.cleanText(rawValue);
      if(!value) return 'Indica un nombre para el sustituto.';
      const normalizedValue=normalizeTeacherSearch(value);
      const normalizedOwner=normalizeTeacherSearch(nombre);
      if(normalizedValue===normalizedOwner) return 'El sustituto no puede tener exactamente el mismo nombre que el titular.';
      const teachers=Array.isArray(getValue(options.allTeachers,[]))?getValue(options.allTeachers,[]):[];
      const canonicalConflict=teachers.find(otherName=>otherName!==nombre&&normalizeTeacherSearch(otherName)===normalizedValue);
      if(canonicalConflict) return `Ese nombre coincide con el docente registrado ${canonicalConflict}.`;
      const aliasConflict=Object.entries(getSubstitutions()).find((entry)=>entry[0]!==nombre&&normalizeTeacherSearch(entry[1])===normalizedValue);
      if(aliasConflict) return `Ese nombre ya está asignado como sustituto de ${aliasConflict[0]}.`;
      return '';
    }
    function getFilteredTeachers(){
      const teachers=Array.isArray(getValue(options.allTeachers,[]))?getValue(options.allTeachers,[]):[];
      const query=normalizeTeacherSearch(filter);
      return teachers.filter(nombre=>!query||teacherMatchesQuery(nombre,query));
    }
    function renderList(){
      const list=shared.document.getElementById((options.elements&&options.elements.listId)||'substitutionList');
      if(!list) return;
      const teachers=getFilteredTeachers();
      if(!teachers.length){
        list.innerHTML='<div class="history-empty">No hay docentes que coincidan con la búsqueda.</div>';
        return;
      }
      const visibleName=requireFn('getVisibleTeacherName',options.getVisibleTeacherName);
      const map=getSubstitutions();
      list.innerHTML=teachers.map(nombre=>{
        const sustituto=visibleName(nombre)!==nombre?visibleName(nombre):'';
        const meta=sustituto?`Titular: ${nombre}`:'Sin sustituto activo';
        return `<article class="substitution-item">
          <div>
            <div class="substitution-item-title">${escapeHtml(sustituto||nombre)}</div>
            <div class="substitution-item-meta">${escapeHtml(meta)}</div>
          </div>
          <div class="substitution-item-actions">
            <button class="btn-substitution" type="button" data-substitution-action="assign" data-teacher-name="${escapeHtml(nombre)}">${map[nombre]?'Editar sustituto':'Asignar sustituto'}</button>
            ${map[nombre]?`<button class="btn-substitution btn-substitution-danger" type="button" data-substitution-action="clear" data-teacher-name="${escapeHtml(nombre)}">Restaurar titular</button>`:''}
          </div>
        </article>`;
      }).join('');
    }
    function setFilter(nextFilter){
      filter=shared.cleanText(nextFilter);
      renderList();
    }
    function openModal(){
      if(getValue(options.isAdmin,false)!==true) return;
      filter='';
      const input=shared.document.getElementById((options.elements&&options.elements.searchId)||'substitutionSearch');
      if(input) input.value='';
      renderList();
      shared.document.getElementById((options.elements&&options.elements.overlayId)||'substitutionOverlay')?.classList.add('open');
    }
    function closeModal(){
      shared.document.getElementById((options.elements&&options.elements.overlayId)||'substitutionOverlay')?.classList.remove('open');
    }
    function bgClose(event){
      if(event&&event.target&&event.target.id===((options.elements&&options.elements.overlayId)||'substitutionOverlay')) closeModal();
    }
    async function assign(nombre){
      const getTeacher=requireFn('getTeacher',options.getTeacher);
      if(getValue(options.isAdmin,false)!==true||!getTeacher(nombre)) return;
      const current=getSubstitutions()[nombre]||'';
      const visible=requireFn('getVisibleTeacherName',options.getVisibleTeacherName);
      const value=shared.cleanText(await shared.askText('Asignar sustituto',`Introduce el nombre del sustituto para ${visible(nombre)===nombre?nombre:visible(nombre)}.`,current,'Nombre del sustituto','Guardar'));
      if(!value) return;
      const validationError=validateName(nombre,value);
      if(validationError){
        shared.showToast(validationError,'error');
        return;
      }
      const nextMap={...getSubstitutions(),[nombre]:value};
      persist(nextMap);
      if(isFn(options.onSubstitutionsChanged)) options.onSubstitutionsChanged(nombre,nextMap);
      renderList();
      shared.showToast('Sustituto asignado correctamente.','success');
      if(isFn(options.syncAdminState)) options.syncAdminState();
    }
    async function clear(nombre){
      const map=getSubstitutions();
      if(getValue(options.isAdmin,false)!==true||!map[nombre]) return;
      if(!await shared.askConfirm('Restaurar titular',`Se restaurara el nombre original de ${nombre}.`,'Restaurar')) return;
      const nextMap={...map};
      delete nextMap[nombre];
      persist(nextMap);
      if(isFn(options.onSubstitutionsChanged)) options.onSubstitutionsChanged(nombre,nextMap);
      renderList();
      shared.showToast('Titular restaurado.','success');
      if(isFn(options.syncAdminState)) options.syncAdminState();
    }
    function bindSearchInput(element){
      const input=element||shared.document.getElementById((options.elements&&options.elements.searchId)||'substitutionSearch');
      if(!input) return noop;
      const onInput=event=>setFilter(event.target.value||'');
      input.addEventListener('input',onInput);
      return ()=>input.removeEventListener('input',onInput);
    }
    function bindList(element){
      const list=element||shared.document.getElementById((options.elements&&options.elements.listId)||'substitutionList');
      if(!list) return noop;
      const onClick=event=>{
        const button=event.target.closest('[data-substitution-action][data-teacher-name]');
        if(!button) return;
        const teacherName=button.dataset.teacherName||'';
        if(button.dataset.substitutionAction==='assign') assign(teacherName);
        if(button.dataset.substitutionAction==='clear') clear(teacherName);
      };
      list.addEventListener('click',onClick);
      return ()=>list.removeEventListener('click',onClick);
    }
    if(getValue(options.autoLoad,false)) load();
    return {
      getSubstitutions,
      setSubstitutions,
      load,
      persist,
      validateName,
      getFilteredTeachers,
      renderList,
      getFilter:()=>filter,
      setFilter,
      openModal,
      closeModal,
      bgClose,
      assign,
      clear,
      bindSearchInput,
      bindList
    };
  }

  function createPracticasGuardiasDomain(options){
    const shared=createSharedHost(options||{});
    const storage=shared.storage;
    let filter='';
    let configTeacher='';
    let enabledRef=normalizePracticasEnabled(shared,getValue(options.getEnabledTeachers,options.initialEnabledTeachers||[]),options);
    let manualSlotsRef=normalizePracticasManualSlots(shared,getValue(options.getManualSlots,options.initialManualSlots||[]),options);

    function normalizeTeacherSearch(value){
      if(isFn(options.normalizeTeacherSearch)) return options.normalizeTeacherSearch(value);
      return shared.normalizeText(value);
    }
    function teacherMatchesQuery(nombre,query){
      if(isFn(options.teacherMatchesQuery)) return options.teacherMatchesQuery(nombre,query);
      const normalizedQuery=normalizeTeacherSearch(query);
      if(!normalizedQuery) return true;
      const visible=isFn(options.getVisibleTeacherName)?options.getVisibleTeacherName(nombre):nombre;
      return [nombre,visible].map(normalizeTeacherSearch).some(candidate=>candidate.includes(normalizedQuery));
    }
    function getEnabledTeachers(){
      const external=getValue(options.getEnabledTeachers,null);
      if(Array.isArray(external)) enabledRef=normalizePracticasEnabled(shared,external,options);
      return enabledRef;
    }
    function setEnabledTeachers(nextList){
      enabledRef=normalizePracticasEnabled(shared,nextList,options);
      setVia(options.setEnabledTeachers,enabledRef);
      return enabledRef;
    }
    function getManualSlots(){
      const external=getValue(options.getManualSlots,null);
      if(Array.isArray(external)) manualSlotsRef=normalizePracticasManualSlots(shared,external,options);
      return manualSlotsRef;
    }
    function setManualSlots(nextRows){
      manualSlotsRef=normalizePracticasManualSlots(shared,nextRows,options);
      setVia(options.setManualSlots,manualSlotsRef);
      return manualSlotsRef;
    }
    function getTeacher(name){
      return requireFn('getTeacher',options.getTeacher)(name);
    }
    function resolveTeacherCanonicalName(name){
      return isFn(options.resolveTeacherCanonicalName)?options.resolveTeacherCanonicalName(name):shared.cleanText(name);
    }
    function makeSlotKey(profesor,dia,hora){
      if(isFn(options.makePracticasGuardiasSlotKey)) return options.makePracticasGuardiasSlotKey(profesor,dia,hora);
      return `${shared.normalizeText(resolveTeacherCanonicalName(profesor)||profesor)}|${dia}|${hora}`;
    }
    function normalizeSlot(row){
      const profesor=resolveTeacherCanonicalName(row&&row.profesor);
      const dia=Number(row&&row.dia);
      const hora=Number(row&&row.hora);
      if(!getTeacher(profesor)||!Number.isInteger(dia)||dia<0||dia>4||!Number.isInteger(hora)||hora<1||hora>9||shared.horasPatio.has(hora)) return null;
      return {profesor,dia,hora};
    }
    function loadEnabled(){
      const rows=storage&&isFn(storage.readJson)?storage.readJson(shared.keys.teacherPracticasGuardias,[]):[];
      return setEnabledTeachers(rows);
    }
    function persistEnabled(nextList){
      const normalized=setEnabledTeachers(nextList);
      if(storage&&isFn(storage.writeJson)){
        storage.writeJson(shared.keys.teacherPracticasGuardias,normalized.map(profesor=>({profesor})));
      }
      return normalized;
    }
    function loadManual(){
      const rows=storage&&isFn(storage.readJson)?storage.readJson(shared.keys.teacherPracticasGuardiasTramos,[]):[];
      return setManualSlots(rows);
    }
    function persistManual(nextRows){
      const normalized=setManualSlots(nextRows);
      if(storage&&isFn(storage.writeJson)) storage.writeJson(shared.keys.teacherPracticasGuardiasTramos,normalized);
      return normalized;
    }
    function getEnabledSet(){
      return new Set(getEnabledTeachers().map(resolveTeacherCanonicalName).filter(Boolean));
    }
    function getManualSet(){
      return new Set(getManualSlots().map(row=>makeSlotKey(row.profesor,row.dia,row.hora)));
    }
    function isTeacherEnabled(nombre){
      return getEnabledSet().has(resolveTeacherCanonicalName(nombre));
    }
    function isPracticasSessionEligible(session){
      if(isFn(options.isPracticasSessionEligible)) return options.isPracticasSessionEligible(session);
      if(!session||session.tipo==='guardia') return false;
      const text=[session.materia,session.grupo,session.detalle,session.aula].map(shared.cleanText).filter(Boolean).join(' · ');
      return /(\bCFB\b|\bCFM\b|\bGM\b|\bGS\b|\bFPB\b|INTERMODULAR|FCT|PRACTIC)/i.test(text);
    }
    function getCandidateTeachers(){
      const getHorarioProfesorDia=requireFn('getHorarioProfesorDia',options.getHorarioProfesorDia);
      const allTeachers=Array.isArray(getValue(options.allTeachers,[]))?getValue(options.allTeachers,[]):[];
      return allTeachers
        .filter(nombre=>shared.dias.some((unused,dia)=>Object.values(getHorarioProfesorDia(nombre,dia)||{}).length))
        .filter(nombre=>shared.dias.some((unused,dia)=>Object.values(getHorarioProfesorDia(nombre,dia)||{}).some(isPracticasSessionEligible)))
        .sort((a,b)=>a.localeCompare(b,'es'));
    }
    function getFreedSlots(nombre){
      const getHorarioProfesorDia=requireFn('getHorarioProfesorDia',options.getHorarioProfesorDia);
      let total=0;
      for(let dia=0;dia<5;dia++){
        total+=Object.values(getHorarioProfesorDia(nombre,dia)||{}).filter(isPracticasSessionEligible).length;
      }
      return total;
    }
    function getManualSlotsCount(nombre){
      return getManualSlots().filter(row=>shared.sameNormalizedText(row.profesor,nombre)).length;
    }
    function getFilteredTeachers(){
      const query=normalizeTeacherSearch(filter);
      return getCandidateTeachers().filter(nombre=>!query||teacherMatchesQuery(nombre,query));
    }
    function getTeacherManualSlots(nombre){
      return getManualSlots().filter(row=>shared.sameNormalizedText(row.profesor,nombre)).sort((a,b)=>a.dia-b.dia||a.hora-b.hora);
    }
    function renderList(){
      const list=shared.document.getElementById((options.elements&&options.elements.listId)||'practicasGuardiasList');
      const summary=shared.document.getElementById((options.elements&&options.elements.summaryId)||'practicasGuardiasSummary');
      if(!list) return;
      const teachers=getFilteredTeachers();
      const enabledSet=getEnabledSet();
      if(summary){
        summary.innerHTML=`<span class="future-absence-chip"><strong>${enabledSet.size}</strong> habilitados</span><span class="future-absence-chip"><strong>${getCandidateTeachers().length}</strong> candidatos</span>`;
      }
      if(!teachers.length){
        list.innerHTML='<div class="history-empty">No hay profesorado de ciclos que coincida con la búsqueda.</div>';
        return;
      }
      const visible=isFn(options.getVisibleTeacherName)?options.getVisibleTeacherName:(nombre=>nombre);
      list.innerHTML=teachers.map(nombre=>{
        const enabled=enabledSet.has(nombre);
        const slots=getFreedSlots(nombre);
        const manualCount=getManualSlotsCount(nombre);
        return `<article class="substitution-item">
          <div>
            <div class="substitution-item-title">${escapeHtml(visible(nombre))}</div>
            <div class="substitution-item-meta">${escapeHtml(`${enabled?'Disponible para entrar en la rotación':'Fuera de la rotación'} · ${slots} horas potenciales por prácticas · ${manualCount} tramos manuales`)}</div>
          </div>
          <div class="substitution-item-actions">
            <button class="btn-substitution${enabled?' btn-substitution-danger':''}" type="button" data-practicas-guardias-toggle="${escapeHtml(nombre)}">${enabled?'Quitar de guardias':'Habilitar guardias'}</button>
            <button class="btn-substitution" type="button" data-practicas-guardias-config="${escapeHtml(nombre)}">Configurar horas</button>
          </div>
        </article>`;
      }).join('');
    }
    function renderConfig(){
      const panel=shared.document.getElementById((options.elements&&options.elements.configId)||'practicasGuardiasConfig');
      if(!panel) return;
      const nombre=configTeacher;
      if(!nombre||!getTeacher(nombre)){
        panel.innerHTML='<div class="history-empty">Selecciona un docente y pulsa en "Configurar horas" para habilitar tramos concretos.</div>';
        return;
      }
      const manualSet=getManualSet();
      const rows=[];
      const resolveTeacherSession=requireFn('resolveTeacherSession',options.resolveTeacherSession);
      for(let dia=0;dia<5;dia++){
        const chips=[];
        for(let hora=1;hora<=9;hora++){
          if(shared.horasPatio.has(hora)) continue;
          const session=resolveTeacherSession(nombre,dia,hora);
          const eligible=isPracticasSessionEligible(session);
          const manual=manualSet.has(makeSlotKey(nombre,dia,hora));
          const classes=['practicas-slot-chip',manual?'is-manual':'',eligible?'is-eligible':''].filter(Boolean).join(' ');
          const stateLabel=manual?'Manual':(eligible?'Prácticas':'No activo');
          chips.push(`<button class="${classes}" type="button" data-practicas-slot-toggle="${escapeHtml(nombre)}|${dia}|${hora}" title="${escapeHtml(`${shared.dias[dia]} · ${formatHoraLabel(shared.horaMap,hora)} · ${stateLabel}`)}">${escapeHtml(shared.horaMap[hora].label)}<span>${escapeHtml(stateLabel)}</span></button>`);
        }
        rows.push(`<div class="practicas-config-row"><div class="practicas-config-day">${escapeHtml(shared.dias[dia])}</div><div class="practicas-config-slots">${chips.join('')}</div></div>`);
      }
      const manualList=getTeacherManualSlots(nombre);
      const manualText=manualList.length
        ? manualList.map(row=>`${shared.dias[row.dia]} ${formatHoraLabel(shared.horaMap,row.hora)}`).join(' · ')
        : 'Sin tramos manuales.';
      const visible=isFn(options.getVisibleTeacherName)?options.getVisibleTeacherName:(name=>name);
      panel.innerHTML=`<article class="practicas-config-card">
        <div class="practicas-config-head">
          <div>
            <div class="substitution-item-title">${escapeHtml(visible(nombre))}</div>
            <div class="substitution-item-meta">Activa aquí tramos manuales aunque no entren por prácticas de forma general.</div>
          </div>
          <div class="substitution-item-actions">
            <button class="btn-substitution" type="button" data-practicas-guardias-config-close="1">Cerrar detalle</button>
          </div>
        </div>
        <div class="practicas-config-legend">
          <span class="future-absence-chip"><strong>Prácticas</strong> hora elegible por horario</span>
          <span class="future-absence-chip"><strong>Manual</strong> hora forzada por Jefatura</span>
        </div>
        <div class="practicas-config-grid">${rows.join('')}</div>
        <div class="substitution-item-meta">Tramos manuales activos: ${escapeHtml(manualText)}</div>
      </article>`;
    }
    function openModal(){
      if(getValue(options.isAdmin,false)!==true) return;
      filter='';
      configTeacher='';
      const input=shared.document.getElementById((options.elements&&options.elements.searchId)||'practicasGuardiasSearch');
      if(input) input.value='';
      renderList();
      renderConfig();
      shared.document.getElementById((options.elements&&options.elements.overlayId)||'practicasGuardiasOverlay')?.classList.add('open');
    }
    function closeModal(){
      shared.document.getElementById((options.elements&&options.elements.overlayId)||'practicasGuardiasOverlay')?.classList.remove('open');
    }
    function bgClose(event){
      if(event&&event.target&&event.target.id===((options.elements&&options.elements.overlayId)||'practicasGuardiasOverlay')) closeModal();
    }
    function openTeacherConfig(nombre){
      if(getValue(options.isAdmin,false)!==true||!getTeacher(nombre)) return;
      configTeacher=nombre;
      renderConfig();
    }
    function closeTeacherConfig(){
      configTeacher='';
      renderConfig();
    }
    function setFilter(nextFilter){
      filter=shared.cleanText(nextFilter);
      renderList();
    }
    function afterPracticeMutation(){
      if(isFn(options.onPracticasChanged)){
        options.onPracticasChanged({
          enabledTeachers:getEnabledTeachers(),
          manualSlots:getManualSlots()
        });
        return;
      }
      if(isFn(options.refreshOrdenGuardias)) options.refreshOrdenGuardias();
      if(isFn(options.reassignAllGuardias)) options.reassignAllGuardias();
      if(isFn(options.persistData)) options.persistData();
      if(isFn(options.renderGuardiaBoard)) options.renderGuardiaBoard();
      if(isFn(options.renderTable)) options.renderTable();
      if(isFn(options.syncAdminState)) options.syncAdminState();
    }
    async function toggleTeacher(nombre){
      if(getValue(options.isAdmin,false)!==true||!getTeacher(nombre)) return;
      const enabled=isTeacherEnabled(nombre);
      const nextList=enabled
        ? getEnabledTeachers().filter(item=>item!==nombre)
        : [...getEnabledTeachers(),nombre];
      persistEnabled(nextList);
      afterPracticeMutation();
      renderList();
      renderConfig();
      shared.showToast(enabled?'Docente retirado de la rotación por prácticas.':'Docente habilitado para entrar en guardias por prácticas.','success');
    }
    async function toggleSlot(nombre,dia,hora){
      if(getValue(options.isAdmin,false)!==true||!getTeacher(nombre)||shared.horasPatio.has(hora)) return;
      const key=makeSlotKey(nombre,dia,hora);
      const current=getManualSet();
      let nextRows;
      if(current.has(key)){
        nextRows=getManualSlots().filter(row=>makeSlotKey(row.profesor,row.dia,row.hora)!==key);
      }else{
        nextRows=[...getManualSlots(),{profesor:nombre,dia,hora}];
      }
      persistManual(nextRows);
      afterPracticeMutation();
      renderList();
      renderConfig();
      shared.showToast(current.has(key)?'Tramo manual retirado de guardias.':'Tramo manual habilitado para guardias.','success');
    }
    function bindSearchInput(element){
      const input=element||shared.document.getElementById((options.elements&&options.elements.searchId)||'practicasGuardiasSearch');
      if(!input) return noop;
      const onInput=event=>setFilter(event.target.value||'');
      input.addEventListener('input',onInput);
      return ()=>input.removeEventListener('input',onInput);
    }
    function bindList(element){
      const list=element||shared.document.getElementById((options.elements&&options.elements.listId)||'practicasGuardiasList');
      if(!list) return noop;
      const onClick=event=>{
        const button=event.target.closest('[data-practicas-guardias-toggle]');
        if(button){
          toggleTeacher(button.dataset.practicasGuardiasToggle||'');
          return;
        }
        const configButton=event.target.closest('[data-practicas-guardias-config]');
        if(configButton) openTeacherConfig(configButton.dataset.practicasGuardiasConfig||'');
      };
      list.addEventListener('click',onClick);
      return ()=>list.removeEventListener('click',onClick);
    }
    function bindConfig(element){
      const panel=element||shared.document.getElementById((options.elements&&options.elements.configId)||'practicasGuardiasConfig');
      if(!panel) return noop;
      const onClick=event=>{
        const closeButton=event.target.closest('[data-practicas-guardias-config-close]');
        if(closeButton){
          closeTeacherConfig();
          return;
        }
        const button=event.target.closest('[data-practicas-slot-toggle]');
        if(!button) return;
        const parts=(button.dataset.practicasSlotToggle||'').split('|');
        toggleSlot(parts[0]||'',Number(parts[1]),Number(parts[2]));
      };
      panel.addEventListener('click',onClick);
      return ()=>panel.removeEventListener('click',onClick);
    }
    if(getValue(options.autoLoad,false)){
      loadEnabled();
      loadManual();
    }
    return {
      normalizeSlot,
      makeSlotKey,
      getEnabledTeachers,
      setEnabledTeachers,
      getManualSlots,
      setManualSlots,
      loadEnabled,
      persistEnabled,
      loadManual,
      persistManual,
      getEnabledSet,
      getManualSet,
      isTeacherEnabled,
      getCandidateTeachers,
      getFreedSlots,
      getManualSlotsCount,
      getFilteredTeachers,
      getTeacherManualSlots,
      renderList,
      renderConfig,
      getFilter:()=>filter,
      setFilter,
      getConfigTeacher:()=>configTeacher,
      openModal,
      closeModal,
      bgClose,
      openTeacherConfig,
      closeTeacherConfig,
      toggleTeacher,
      toggleSlot,
      bindSearchInput,
      bindList,
      bindConfig
    };
  }

  function normalizeTvAnnouncementItem(shared,value,index){
    const row=value&&typeof value==='object'?value:{};
    const text=shared.cleanText(row.text).replace(/\s+/g,' ').trim();
    const priority=['urgent','important','normal'].includes(shared.cleanText(row.priority))?shared.cleanText(row.priority):'normal';
    return {
      id:shared.cleanText(row.id)||`aviso-${Date.now()}-${index}`,
      text,
      priority,
      active:!!row.active&&!!text
    };
  }
  function normalizeTvAnnouncementState(shared,value){
    const row=value&&typeof value==='object'?value:{};
    const itemsSource=Array.isArray(row.items)
      ? row.items
      : ((row.text||row.active)?[{text:row.text,active:row.active,priority:row.priority}]:[]);
    return {
      items:itemsSource.map((item,index)=>normalizeTvAnnouncementItem(shared,item,index)).filter(item=>item.text),
      updatedAt:shared.cleanText(row.updatedAt),
      updatedBy:shared.cleanText(row.updatedBy)
    };
  }
  function getTvAnnouncementElements(documentRef,elements){
    const ids=elements||{};
    return {
      bar:documentRef&&documentRef.getElementById(ids.barId||'tvAnnouncement'),
      textNode:documentRef&&documentRef.getElementById(ids.textId||'tvAnnouncementText'),
      input:documentRef&&documentRef.getElementById(ids.inputId||'tvAnnouncementInput'),
      priorityInput:documentRef&&documentRef.getElementById(ids.priorityId||'tvAnnouncementPriority'),
      status:documentRef&&documentRef.getElementById(ids.statusId||'tvAnnouncementStatus'),
      list:documentRef&&documentRef.getElementById(ids.listId||'tvAnnouncementList')
    };
  }
  function normalizeSubstitutionMap(shared,input,options){
    const resolveTeacherCanonicalName=isFn(options.resolveTeacherCanonicalName)?options.resolveTeacherCanonicalName:(value=>shared.cleanText(value));
    const getTeacher=isFn(options.getTeacher)?options.getTeacher:()=>null;
    if(Array.isArray(input)){
      return Object.fromEntries(
        input
          .map(row=>[resolveTeacherCanonicalName(row&&row.profesor),shared.cleanText(row&&row.sustituto)])
          .filter(entry=>getTeacher(entry[0])&&shared.cleanText(entry[1]))
      );
    }
    return Object.entries(input||{}).reduce((acc,entry)=>{
      const canonical=resolveTeacherCanonicalName(entry[0]);
      if(getTeacher(canonical)&&shared.cleanText(entry[1])) acc[canonical]=shared.cleanText(entry[1]);
      return acc;
    },{});
  }
  function normalizePracticasEnabled(shared,input,options){
    const resolveTeacherCanonicalName=isFn(options.resolveTeacherCanonicalName)?options.resolveTeacherCanonicalName:(value=>shared.cleanText(value));
    const getTeacher=isFn(options.getTeacher)?options.getTeacher:()=>null;
    const source=Array.isArray(input)?input:[];
    return [...new Set(source.map(row=>resolveTeacherCanonicalName(typeof row==='string'?row:row&&row.profesor)).filter(nombre=>getTeacher(nombre)))]
      .sort((a,b)=>a.localeCompare(b,'es'));
  }
  function normalizePracticasManualSlots(shared,input,options){
    const rows=Array.isArray(input)?input:[];
    const normalize=createPracticasManualSlotNormalizer(shared,options);
    return [...new Map(rows.map(normalize).filter(Boolean).map(row=>[`${row.profesor}|${row.dia}|${row.hora}`,row])).values()]
      .sort((a,b)=>a.profesor.localeCompare(b.profesor,'es')||a.dia-b.dia||a.hora-b.hora);
  }
  function createPracticasManualSlotNormalizer(shared,options){
    const resolveTeacherCanonicalName=isFn(options.resolveTeacherCanonicalName)?options.resolveTeacherCanonicalName:(value=>shared.cleanText(value));
    const getTeacher=isFn(options.getTeacher)?options.getTeacher:()=>null;
    return function normalize(row){
      const profesor=resolveTeacherCanonicalName(row&&row.profesor);
      const dia=Number(row&&row.dia);
      const hora=Number(row&&row.hora);
      if(!getTeacher(profesor)||!Number.isInteger(dia)||dia<0||dia>4||!Number.isInteger(hora)||hora<1||hora>9||shared.horasPatio.has(hora)) return null;
      return {profesor,dia,hora};
    };
  }
  function formatHoraLabel(horaMap,hora){
    const info=horaMap[hora];
    return info?`${info.label} hora (${info.rango})`:`Hora ${hora}`;
  }
  function createSuite(options){
    const shared=createSharedHost(options||{});
    return {
      shared,
      createTvAnnouncementsDomain:(overrides)=>createTvAnnouncementsDomain({...options,...shared,...(overrides||{})}),
      createTvPanelDomain:(overrides)=>createTvPanelDomain({...options,...shared,...(overrides||{})}),
      createHistoryDomain:(overrides)=>createHistoryDomain({...options,...shared,...(overrides||{})}),
      createSubstitutionsDomain:(overrides)=>createSubstitutionsDomain({...options,...shared,...(overrides||{})}),
      createPracticasGuardiasDomain:(overrides)=>createPracticasGuardiasDomain({...options,...shared,...(overrides||{})})
    };
  }

  global.GuardiasAuxPanels={
    version:'0.1.0',
    constants:{
      HORA_MAP:DEFAULT_HORA_MAP,
      HORAS_PATIO:[...DEFAULT_HORAS_PATIO],
      DIAS:DEFAULT_DIAS,
      STORAGE_KEYS
    },
    limits:LIMITS,
    createSharedHost,
    createTvAnnouncementsDomain,
    createTvPanelDomain,
    createHistoryDomain,
    createSubstitutionsDomain,
    createPracticasGuardiasDomain,
    createSuite
  };
})(window);
