(function initGuardiasCore(global){
  function cleanText(value){return String(value ?? '').replace(/\s+/g,' ').trim();}
  function normalizeText(text){
    if(!text) return '';
    return text
      .toString()
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ');
  }
  function sameNormalizedText(a,b){return normalizeText(a)===normalizeText(b);}
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
  function getMonthKeyFromDateKey(dateKey){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey||''))?String(dateKey).slice(0,7):'';
  }
  function getCurrentMonthKey(){
    return formatDateKey(formatNowParts().date).slice(0,7);
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
  function repairMojibakeText(value){
    if(typeof value!=='string'||!/ÃƒÆ’|Ãƒâ€š|ÃƒÂ¢|ÃƒÂ°Ã…Â¸|ÃƒÂ¯Ã‚Â¸/.test(value)) return value;
    try{
      return decodeURIComponent(escape(value));
    }catch(_error){
      return value;
    }
  }
  function repairMojibakeDeep(value){
    if(Array.isArray(value)) return value.map(repairMojibakeDeep);
    if(value&&typeof value==='object'){
      return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,repairMojibakeDeep(entry)]));
    }
    return repairMojibakeText(value);
  }

  global.GuardiasCore={
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
  };
})(window);
