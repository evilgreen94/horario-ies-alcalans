(function initGuardiasFutureAbsences(global){
  'use strict';

  const STORAGE_KEY = 'IES_Alcalans_Profesorado_Faltas_Futuras';
  const STATUS_ORDER = ['pending', 'approved', 'applied', 'rejected'];
  const VALID_STATUSES = new Set(STATUS_ORDER);
  const DEFAULT_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const DEFAULT_DOM_IDS = {
    teacherOverlay: 'teacherFutureAbsenceOverlay',
    teacherNameInput: 'teacherFutureAbsenceName',
    teacherDateInput: 'teacherFutureAbsenceDate',
    teacherNoteInput: 'teacherFutureAbsenceNote',
    teacherDayMeta: 'teacherFutureAbsenceDayMeta',
    teacherHoursWrap: 'teacherFutureAbsenceHours',
    teacherOwnList: 'teacherFutureAbsenceOwnList',
    adminOverlay: 'futureAbsenceAdminOverlay',
    adminSummary: 'futureAbsenceAdminSummary',
    adminStatusFilter: 'futureAbsenceAdminStatusFilter',
    adminTeacherFilter: 'futureAbsenceAdminTeacherFilter',
    adminList: 'futureAbsenceAdminList'
  };

  const requiredHost = {
    core: [
      'storage.readJson(key, fallback)',
      'storage.writeJson(key, value)'
    ],
    render: [
      'formatHoraLabel(hora)',
      'getHorasLectivasProfesorDia(profesor, dayIndex)'
    ],
    teacherModal: [
      'getTeacherName()',
      'getVisibleTeacherName(nombre)',
      'ensureTeacherIdentityConfirmed(actionLabel)',
      'showToast(message, type)',
      'resolveTeacherSession(profesor, dayIndex, hora) [optional]'
    ],
    adminModal: [
      'isAdmin()',
      'askConfirm(title, message, actionLabel)',
      'askText(title, message, value, placeholder, actionLabel)',
      'showToast(message, type)'
    ],
    backendCrud: [
      'storage.hasBackend()',
      'storage.fetchTeacherFutureAbsences()',
      'storage.createTeacherFutureAbsence(row)',
      'storage.updateTeacherFutureAbsence(id, row)',
      'storage.deleteTeacherFutureAbsence(id)'
    ],
    currentWeekApply: [
      'getCurrentSchoolWeekKey()',
      'getAbsenceRows()',
      'setAbsenceRows(rows)',
      'claimNextAbsenceRowId()',
      'getCurrentDay()',
      'buildUndoState(day)',
      'normalizeStoredRows(rows)',
      'reassignAllGuardias()',
      'persistGuardias(rows)',
      'renderGuardiaBoard()',
      'renderTable()',
      'getHistoryRows()',
      'setHistoryRows(rows)',
      'persistHistorial(rows)',
      'renderHistoryList()',
      'syncAdminState()',
      'getAulaProfesor(profesor, dayIndex, hora)',
      'assignGuardiasForRows(rows)'
    ],
    optional: [
      'resolveTeacherCanonicalName(nombre)',
      'clearSuperAdminError()',
      'setSuperAdminError(message)',
      'pushSuperAdminEvent(type, detail)',
      'renderSuperAdminMonitor()',
      'normalizeTeacherSearch(text)',
      'sameNormalizedText(a, b)',
      'makeTeacherUsername(nombre)',
      'escapeHtml(text)',
      'onFutureAbsenceStateChange(snapshot)',
      'domIds'
    ]
  };

  let host = {};
  let domIds = { ...DEFAULT_DOM_IDS };
  const state = createEmptyState();

  function createEmptyState(){
    return {
      rows: [],
      adminStatusFilter: 'all',
      adminTeacherFilter: '',
      syncFlags: new Set(),
      boundListeners: []
    };
  }

  function getDocument(){
    return global.document || null;
  }

  function getElement(id){
    const doc = getDocument();
    return doc ? doc.getElementById(id) : null;
  }

  function readHostValue(name){
    return host ? host[name] : undefined;
  }

  function callHost(name, ...args){
    const value = readHostValue(name);
    if(typeof value === 'function') return value(...args);
    return value;
  }

  function requireHostFunction(name, feature){
    const value = readHostValue(name);
    if(typeof value !== 'function'){
      throw new Error(`GuardiasFutureAbsences requires host.${name}() for ${feature}.`);
    }
    return value;
  }

  function requireStorageMethod(name, feature){
    const storage = readHostValue('storage');
    if(!storage || typeof storage[name] !== 'function'){
      throw new Error(`GuardiasFutureAbsences requires host.storage.${name}() for ${feature}.`);
    }
    return storage[name].bind(storage);
  }

  function cleanText(value){
    if(value == null) return '';
    return String(value).trim();
  }

  function stripDiacritics(value){
    return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeTeacherSearch(value){
    const custom = readHostValue('normalizeTeacherSearch');
    if(typeof custom === 'function') return custom(value);
    return stripDiacritics(value).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function sameNormalizedText(a, b){
    const custom = readHostValue('sameNormalizedText');
    if(typeof custom === 'function') return !!custom(a, b);
    return normalizeTeacherSearch(a) === normalizeTeacherSearch(b);
  }

  function makeTeacherUsername(value){
    const custom = readHostValue('makeTeacherUsername');
    if(typeof custom === 'function') return custom(value);
    return normalizeTeacherSearch(value).replace(/[^a-z0-9]+/g, '');
  }

  function escapeHtml(value){
    const custom = readHostValue('escapeHtml');
    if(typeof custom === 'function') return custom(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getDias(){
    return Array.isArray(readHostValue('DIAS')) ? readHostValue('DIAS') : DEFAULT_DIAS;
  }

  function getPatioSet(){
    const source = readHostValue('HORAS_PATIO');
    if(source instanceof Set) return source;
    if(Array.isArray(source)) return new Set(source.map(Number).filter(Number.isInteger));
    return new Set();
  }

  function getVisibleTeacherName(name){
    const custom = readHostValue('getVisibleTeacherName');
    return typeof custom === 'function' ? (custom(name) || cleanText(name)) : cleanText(name);
  }

  function resolveTeacherCanonicalName(name){
    const custom = readHostValue('resolveTeacherCanonicalName');
    return typeof custom === 'function' ? (custom(name) || cleanText(name)) : cleanText(name);
  }

  function formatHoraLabel(hora){
    const custom = readHostValue('formatHoraLabel');
    return typeof custom === 'function' ? custom(hora) : `Hora ${hora}`;
  }

  function getTeacherName(){
    const value = callHost('getTeacherName');
    return cleanText(value);
  }

  function isAdmin(){
    return !!callHost('isAdmin');
  }

  function notifyStateChange(){
    const listener = readHostValue('onFutureAbsenceStateChange');
    if(typeof listener === 'function'){
      listener(getSnapshot());
    }
  }

  function formatDateKey(date){
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getCurrentDateIso(){
    return new Date().toISOString().slice(0, 10);
  }

  function getSchoolWeekInfoFromDate(dateValue){
    const base = new Date(`${dateValue}T00:00:00`);
    if(Number.isNaN(base.getTime())) return null;
    const dayOfWeek = base.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(base);
    monday.setDate(base.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return {
      weekKey: formatDateKey(monday),
      dayIndex: dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek - 1 : null
    };
  }

  function normalizeHours(hours){
    const patio = getPatioSet();
    return Array.isArray(hours)
      ? [...new Set(hours.map(Number).filter(Number.isInteger).filter(hora => !patio.has(hora)))].sort((a, b) => a - b)
      : [];
  }

  function normalizeStatus(status){
    const value = cleanText(status || 'pending') || 'pending';
    return VALID_STATUSES.has(value) ? value : 'pending';
  }

  function normalizeTeacherFutureAbsence(row){
    return {
      id: cleanText(row && row.id),
      profesor: resolveTeacherCanonicalName(row && row.profesor) || cleanText(row && row.profesor),
      date: cleanText(row && row.date),
      note: cleanText(row && row.note),
      hours: normalizeHours(row && row.hours),
      status: normalizeStatus(row && row.status),
      reviewedAt: cleanText(row && row.reviewedAt),
      reviewerNote: cleanText(row && row.reviewerNote),
      appliedAt: cleanText(row && row.appliedAt),
      createdAt: cleanText(row && row.createdAt) || new Date().toISOString()
    };
  }

  function sortTeacherFutureAbsences(rows){
    return (rows || []).slice().sort((a, b) => {
      return String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.profesor || '').localeCompare(String(b.profesor || ''), 'es');
    });
  }

  function setRows(rows, options){
    const nextOptions = options || {};
    state.rows = sortTeacherFutureAbsences((rows || []).map(normalizeTeacherFutureAbsence));
    if(nextOptions.persist !== false) persistRows();
    if(nextOptions.clearSyncFlags) state.syncFlags.clear();
    if(nextOptions.render !== false) renderAll();
    notifyStateChange();
    return getRows();
  }

  function getRows(){
    return state.rows.slice();
  }

  function getSnapshot(){
    return {
      rows: getRows(),
      adminStatusFilter: state.adminStatusFilter,
      adminTeacherFilter: state.adminTeacherFilter,
      syncFlags: [...state.syncFlags]
    };
  }

  function readStorageRows(){
    const readJson = requireStorageMethod('readJson', 'local cache load');
    const loaded = readJson(STORAGE_KEY, []);
    return Array.isArray(loaded) ? loaded : [];
  }

  function persistRows(){
    const writeJson = requireStorageMethod('writeJson', 'local cache persist');
    writeJson(STORAGE_KEY, state.rows);
  }

  function loadFromLocalCache(options){
    return setRows(readStorageRows(), options);
  }

  function upsertRowLocal(row){
    const normalized = normalizeTeacherFutureAbsence(row);
    const nextRows = [normalized].concat(state.rows.filter(item => item.id !== normalized.id));
    setRows(nextRows);
    return normalized;
  }

  function removeRowLocal(id){
    const targetId = cleanText(id);
    setRows(state.rows.filter(item => item.id !== targetId));
  }

  function getFutureAbsenceStatusLabel(status){
    return status === 'approved'
      ? 'Validada'
      : status === 'rejected'
        ? 'Rechazada'
        : status === 'applied'
          ? 'Aplicada'
          : 'Pendiente';
  }

  function getFutureAbsenceStatusClass(status){
    return status === 'approved'
      ? 'future-absence-status-approved'
      : status === 'rejected'
        ? 'future-absence-status-rejected'
        : status === 'applied'
          ? 'future-absence-status-applied'
          : 'future-absence-status-pending';
  }

  function formatFutureAbsenceDateLabel(value){
    if(!value) return 'Sin fecha';
    const date = new Date(`${value}T00:00:00`);
    if(Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function getHorasLectivasProfesorDia(profesor, dayIndex){
    const resolver = requireHostFunction('getHorasLectivasProfesorDia', 'future absence schedule lookup');
    const rows = resolver(profesor, dayIndex);
    return Array.isArray(rows) ? rows.map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [];
  }

  function getFutureAbsenceHoursForEntry(item){
    const normalizedHours = normalizeHours(item && item.hours);
    if(normalizedHours.length) return normalizedHours;
    const weekInfo = getSchoolWeekInfoFromDate(item && item.date);
    if(!weekInfo || weekInfo.dayIndex == null) return [];
    return getHorasLectivasProfesorDia(item.profesor, weekInfo.dayIndex);
  }

  function isFutureAbsenceProjected(item){
    const status = normalizeStatus(item && item.status);
    return status === 'approved' || status === 'applied';
  }

  function findOverlapping(entry, options){
    const nextOptions = options || {};
    const excludeId = cleanText(nextOptions.excludeId);
    const profesor = cleanText(entry && entry.profesor);
    const date = cleanText(entry && entry.date);
    const hours = new Set(getFutureAbsenceHoursForEntry(entry));
    if(!profesor || !date || !hours.size) return null;
    return state.rows.find(item => {
      if(cleanText(item && item.id) === excludeId) return false;
      if(cleanText(item && item.status) === 'rejected') return false;
      if(cleanText(item && item.profesor) !== profesor || cleanText(item && item.date) !== date) return false;
      return getFutureAbsenceHoursForEntry(item).some(hora => hours.has(hora));
    }) || null;
  }

  function formatHourListLabel(hours){
    const rows = (hours || []).map(hora => formatHoraLabel(hora));
    return rows.length ? rows.join(', ') : 'Sin horas lectivas';
  }

  function getFutureAbsenceSortValue(item){
    const date = new Date(`${cleanText(item && item.date)}T00:00:00`);
    const time = Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
    const firstHour = getFutureAbsenceHoursForEntry(item)[0] || 99;
    return { time, firstHour };
  }

  function sortFutureAbsenceRowsForDisplay(rows){
    return (rows || []).slice().sort((a, b) => {
      const aSort = getFutureAbsenceSortValue(a);
      const bSort = getFutureAbsenceSortValue(b);
      return aSort.time - bSort.time ||
        aSort.firstHour - bSort.firstHour ||
        String(a.profesor || '').localeCompare(String(b.profesor || ''), 'es');
    });
  }

  function getFutureAbsenceTemporalMeta(item){
    const today = getCurrentDateIso();
    const dateValue = cleanText(item && item.date);
    if(!dateValue) return '';
    if(dateValue === today) return 'Hoy';
    const todayDate = new Date(`${today}T00:00:00`);
    const targetDate = new Date(`${dateValue}T00:00:00`);
    if(Number.isNaN(todayDate.getTime()) || Number.isNaN(targetDate.getTime())) return '';
    const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
    if(diffDays === 1) return 'Mañana';
    if(diffDays > 1 && diffDays <= 7) return 'Esta semana';
    if(diffDays < 0) return 'Pasada';
    return '';
  }

  function getFutureAbsenceStatusGroupLabel(status){
    return status === 'pending'
      ? 'Pendientes'
      : status === 'approved'
        ? 'Validadas'
        : status === 'applied'
          ? 'Aplicadas'
          : status === 'rejected'
            ? 'Rechazadas'
            : 'Otros avisos';
  }

  function groupFutureAbsenceRowsByStatus(rows){
    return STATUS_ORDER.map(status => ({
      status,
      label: getFutureAbsenceStatusGroupLabel(status),
      rows: sortFutureAbsenceRowsForDisplay((rows || []).filter(item => normalizeStatus(item && item.status) === status))
    })).filter(group => group.rows.length);
  }

  function renderFutureAbsenceCard(item, options){
    const nextOptions = options || {};
    const temporalMeta = getFutureAbsenceTemporalMeta(item);
    const temporalBadge = temporalMeta ? `<span class="future-absence-time-badge">${escapeHtml(temporalMeta)}</span>` : '';
    const reviewedAtLabel = item.reviewedAt
      ? new Date(item.reviewedAt).toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';
    const actionsMarkup = nextOptions.showAdminActions
      ? `<div class="substitution-item-actions">
      ${item.status === 'pending' ? `<button class="btn-substitution" type="button" data-future-absence-approve="${escapeHtml(item.id)}">Validar</button><button class="btn-substitution btn-substitution-danger" type="button" data-future-absence-reject="${escapeHtml(item.id)}">Rechazar</button>` : ''}
      <button class="btn-substitution btn-substitution-danger" type="button" data-future-absence-delete="${escapeHtml(item.id)}">Eliminar aviso</button>
    </div>`
      : '';
    return `<article class="future-absence-item">
    <div class="future-absence-item-head">
      <div>
        <div class="future-absence-item-title">${escapeHtml(nextOptions.showTeacherName ? (getVisibleTeacherName(item.profesor) || item.profesor) : formatFutureAbsenceDateLabel(item.date))}</div>
        <div class="future-absence-item-date">${escapeHtml(nextOptions.showTeacherName ? formatFutureAbsenceDateLabel(item.date) : formatHourListLabel(getFutureAbsenceHoursForEntry(item)))}</div>
      </div>
      <div class="future-absence-item-meta">
        ${temporalBadge}
        <span class="future-absence-status ${getFutureAbsenceStatusClass(item.status)}">${escapeHtml(getFutureAbsenceStatusLabel(item.status))}</span>
      </div>
    </div>
    <div class="future-absence-item-note"><strong>Horas:</strong> ${escapeHtml(formatHourListLabel(getFutureAbsenceHoursForEntry(item)))}</div>
    ${nextOptions.showTeacherName ? `<div class="future-absence-item-note"><strong>Profesor:</strong> ${escapeHtml(getVisibleTeacherName(item.profesor) || item.profesor)}</div>` : ''}
    <div class="future-absence-item-note"><strong>Observaciones:</strong> ${escapeHtml(item.note || 'Sin observaciones adicionales.')}</div>
    ${item.reviewerNote ? `<div class="future-absence-item-note"><strong>Respuesta de Jefatura:</strong> ${escapeHtml(item.reviewerNote)}</div>` : ''}
    ${reviewedAtLabel ? `<div class="future-absence-item-note"><strong>Revisada:</strong> ${escapeHtml(reviewedAtLabel)}</div>` : ''}
    ${actionsMarkup}
  </article>`;
  }

  function formatFutureAbsenceAdminSummary(rows){
    const counts = (rows || []).reduce((acc, item) => {
      const status = normalizeStatus(item && item.status);
      acc.total += 1;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0, applied: 0 });
    return `
    <span class="future-absence-chip"><strong>${counts.total}</strong> avisos</span>
    <span class="future-absence-chip"><strong>${counts.pending}</strong> pendientes</span>
    <span class="future-absence-chip"><strong>${counts.approved}</strong> validadas</span>
    <span class="future-absence-chip"><strong>${counts.rejected}</strong> rechazadas</span>
    <span class="future-absence-chip"><strong>${counts.applied}</strong> aplicadas</span>
  `;
  }

  function getAdminFilteredRows(){
    const rows = sortFutureAbsenceRowsForDisplay(state.rows);
    const teacherFilter = normalizeTeacherSearch(state.adminTeacherFilter);
    return rows.filter(item => {
      if(state.adminStatusFilter !== 'all' && item.status !== state.adminStatusFilter) return false;
      if(teacherFilter){
        const visible = getVisibleTeacherName(item.profesor) || item.profesor;
        const haystack = [item.profesor, visible, makeTeacherUsername(visible)].map(normalizeTeacherSearch);
        if(!haystack.some(value => value.includes(teacherFilter))) return false;
      }
      return true;
    });
  }

  function renderAdminList(){
    const list = getElement(domIds.adminList);
    const summary = getElement(domIds.adminSummary);
    if(!list) return;
    const rows = sortFutureAbsenceRowsForDisplay(state.rows);
    if(summary) summary.innerHTML = rows.length ? formatFutureAbsenceAdminSummary(rows) : '';
    if(!rows.length){
      list.innerHTML = '<div class="future-absence-empty">No hay faltas futuras comunicadas.</div>';
      return;
    }
    const filtered = getAdminFilteredRows();
    if(!filtered.length){
      list.innerHTML = '<div class="future-absence-empty">No hay avisos que coincidan con el filtro actual.</div>';
      return;
    }
    const groups = groupFutureAbsenceRowsByStatus(filtered);
    list.innerHTML = groups.map(group => `<section class="future-absence-group">
    <div class="future-absence-group-head">
      <h3>${escapeHtml(group.label)}</h3>
      <span class="future-absence-group-count">${group.rows.length}</span>
    </div>
    <div class="future-absence-group-list">${group.rows.map(item => renderFutureAbsenceCard(item, { showTeacherName: true, showAdminActions: isAdmin() })).join('')}</div>
  </section>`).join('');
  }

  function renderTeacherOwnList(){
    const list = getElement(domIds.teacherOwnList);
    if(!list) return;
    const teacherName = getTeacherName();
    const rows = sortFutureAbsenceRowsForDisplay(state.rows.filter(item => sameNormalizedText(item.profesor, teacherName)));
    if(!rows.length){
      list.innerHTML = '<div class="future-absence-empty">Todavía no has enviado avisos de falta futura.</div>';
      return;
    }
    const groups = groupFutureAbsenceRowsByStatus(rows);
    list.innerHTML = groups.map(group => `<section class="future-absence-group">
    <div class="future-absence-group-head">
      <h3>${escapeHtml(group.label)}</h3>
      <span class="future-absence-group-count">${group.rows.length}</span>
    </div>
    <div class="future-absence-group-list">${group.rows.map(item => renderFutureAbsenceCard(item, { showTeacherName: false, showAdminActions: false })).join('')}</div>
  </section>`).join('');
  }

  function renderAll(){
    renderAdminList();
    renderTeacherOwnList();
  }

  function getTeacherFutureAbsenceDaySelection(){
    const input = getElement(domIds.teacherDateInput);
    const dateValue = cleanText(input && input.value);
    if(!dateValue) return null;
    return getSchoolWeekInfoFromDate(dateValue);
  }

  function handleTeacherDateChange(){
    const hoursWrap = getElement(domIds.teacherHoursWrap);
    const meta = getElement(domIds.teacherDayMeta);
    if(!hoursWrap || !meta) return;
    const selection = getTeacherFutureAbsenceDaySelection();
    if(!selection || selection.dayIndex == null){
      meta.textContent = 'Selecciona una fecha lectiva para ver tus horas de clase.';
      hoursWrap.innerHTML = '<div class="teacher-future-hours-empty">No hay horas para seleccionar.</div>';
      return;
    }
    const teacherName = getTeacherName();
    const hours = getHorasLectivasProfesorDia(teacherName, selection.dayIndex);
    if(!hours.length){
      meta.textContent = `${getDias()[selection.dayIndex]} · Sin clases lectivas registradas.`;
      hoursWrap.innerHTML = '<div class="teacher-future-hours-empty">Ese día no tienes clases lectivas en el horario cargado.</div>';
      return;
    }
    meta.textContent = `${getDias()[selection.dayIndex]} · Selecciona las horas que quieres comunicar.`;
    hoursWrap.innerHTML = hours.map(hora => {
      const resolver = readHostValue('resolveTeacherSession');
      const sesion = typeof resolver === 'function' ? resolver(teacherName, selection.dayIndex, hora) : null;
      const detalle = [sesion && sesion.materia || 'Clase', sesion && sesion.grupo || '', sesion && sesion.aula || 'Sin aula'].filter(Boolean).join(' · ');
      return `<label class="teacher-future-hour-option"><input type="checkbox" data-future-hour value="${hora}" checked><span class="teacher-future-hour-copy"><span class="teacher-future-hour-title">${escapeHtml(formatHoraLabel(hora))}</span><span class="teacher-future-hour-meta">${escapeHtml(detalle)}</span></span></label>`;
    }).join('');
  }

  function openTeacherModal(){
    const teacherName = getTeacherName();
    if(!teacherName) return false;
    const nameInput = getElement(domIds.teacherNameInput);
    const dateInput = getElement(domIds.teacherDateInput);
    const noteInput = getElement(domIds.teacherNoteInput);
    if(nameInput) nameInput.value = getVisibleTeacherName(teacherName);
    if(dateInput){
      dateInput.min = getCurrentDateIso();
      dateInput.value = '';
    }
    if(noteInput) noteInput.value = '';
    handleTeacherDateChange();
    renderTeacherOwnList();
    getElement(domIds.teacherOverlay)?.classList.add('open');
    return true;
  }

  function closeTeacherModal(){
    getElement(domIds.teacherOverlay)?.classList.remove('open');
  }

  function handleTeacherOverlayBackgroundClick(event){
    if(event && event.target && event.target.id === domIds.teacherOverlay) closeTeacherModal();
  }

  async function submitTeacherAbsence(){
    const teacherName = getTeacherName();
    if(!teacherName) return null;
    const ensureTeacherIdentityConfirmed = requireHostFunction('ensureTeacherIdentityConfirmed', 'teacher future absence submit');
    const showToast = requireHostFunction('showToast', 'teacher future absence submit');
    if(!await ensureTeacherIdentityConfirmed('enviar una falta futura')) return null;
    const dateInput = getElement(domIds.teacherDateInput);
    const noteInput = getElement(domIds.teacherNoteInput);
    const dateValue = cleanText(dateInput && dateInput.value);
    const noteValue = cleanText(noteInput && noteInput.value);
    const doc = getDocument();
    const selectedHours = doc
      ? [...doc.querySelectorAll(`#${domIds.teacherHoursWrap} [data-future-hour]:checked`)].map(input => Number(input.value)).filter(Number.isInteger)
      : [];
    if(!dateValue){
      showToast('Indica la fecha de la falta prevista.', 'error');
      dateInput?.focus();
      return null;
    }
    if(!selectedHours.length){
      showToast('Selecciona al menos una hora lectiva para ese día.', 'error');
      return null;
    }
    const entry = {
      id: `future-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      profesor: teacherName,
      date: dateValue,
      note: noteValue,
      hours: selectedHours,
      status: 'pending',
      reviewerNote: '',
      reviewedAt: '',
      appliedAt: '',
      createdAt: new Date().toISOString()
    };
    const overlap = findOverlapping(entry);
    if(overlap){
      showToast(`Ya existe un aviso para ${formatFutureAbsenceDateLabel(dateValue)} en las horas ${formatHourListLabel(getFutureAbsenceHoursForEntry(overlap))}.`, 'error');
      return null;
    }
    try{
      const result = await createEntry(entry);
      closeTeacherModal();
      showToast(result && result.syncError ? 'Aviso guardado en local. Pendiente de sincronizar con el servidor.' : 'Aviso de ausencia futura enviado.', 'success');
      return result;
    }catch(error){
      console.warn('Teacher future absence create failed', error);
      showToast('No se pudo enviar el aviso.', 'error');
      return null;
    }
  }

  function syncAdminFilterInputs(){
    const statusFilter = getElement(domIds.adminStatusFilter);
    const teacherFilterInput = getElement(domIds.adminTeacherFilter);
    if(statusFilter) statusFilter.value = state.adminStatusFilter;
    if(teacherFilterInput) teacherFilterInput.value = state.adminTeacherFilter;
  }

  function setAdminFilters(filters){
    const nextFilters = filters || {};
    if(cleanText(nextFilters.status)) state.adminStatusFilter = cleanText(nextFilters.status);
    if(Object.prototype.hasOwnProperty.call(nextFilters, 'teacher')) state.adminTeacherFilter = cleanText(nextFilters.teacher);
    syncAdminFilterInputs();
    renderAdminList();
    notifyStateChange();
  }

  function openAdminModal(){
    if(!isAdmin()) return false;
    syncAdminFilterInputs();
    renderAdminList();
    getElement(domIds.adminOverlay)?.classList.add('open');
    return true;
  }

  function closeAdminModal(){
    getElement(domIds.adminOverlay)?.classList.remove('open');
  }

  function handleAdminOverlayBackgroundClick(event){
    if(event && event.target && event.target.id === domIds.adminOverlay) closeAdminModal();
  }

  function clearSuperAdminError(){
    const fn = readHostValue('clearSuperAdminError');
    if(typeof fn === 'function') fn();
  }

  function setSuperAdminError(message){
    const fn = readHostValue('setSuperAdminError');
    if(typeof fn === 'function') fn(message);
  }

  function pushSuperAdminEvent(type, detail){
    const fn = readHostValue('pushSuperAdminEvent');
    if(typeof fn === 'function') fn(type, detail);
  }

  function renderSuperAdminMonitor(){
    const fn = readHostValue('renderSuperAdminMonitor');
    if(typeof fn === 'function') fn();
  }

  async function hydrateFromBackend(){
    const hasBackend = requireStorageMethod('hasBackend', 'future absence hydration');
    if(!hasBackend()) return false;
    try{
      const fetchTeacherFutureAbsences = requireStorageMethod('fetchTeacherFutureAbsences', 'future absence hydration');
      const rows = await fetchTeacherFutureAbsences();
      if(!Array.isArray(rows)) return false;
      setRows(rows, { clearSyncFlags: true });
      clearSuperAdminError();
      pushSuperAdminEvent('Hydrate', 'Faltas futuras recargadas desde backend.');
      return true;
    }catch(error){
      console.warn('Teacher future absences hydration failed', error);
      setSuperAdminError('Fallo al hidratar faltas futuras.');
      return false;
    }
  }

  async function createEntry(entry){
    const storage = readHostValue('storage');
    const normalized = upsertRowLocal(entry);
    if(!storage || typeof storage.hasBackend !== 'function' || !storage.hasBackend()){
      return { ok: true, localOnly: true, entry: normalized };
    }
    try{
      const result = await requireStorageMethod('createTeacherFutureAbsence', 'future absence create')(normalized);
      const saved = normalizeTeacherFutureAbsence(result && result.entry || normalized);
      state.syncFlags.delete(`upsert:${saved.id}`);
      upsertRowLocal(saved);
      clearSuperAdminError();
      pushSuperAdminEvent('Future absence', `Nuevo aviso futuro registrado para ${saved.profesor}.`);
      return result || { ok: true, entry: saved };
    }catch(error){
      console.warn('Teacher future absence create backend sync failed; keeping local state', error);
      state.syncFlags.add(`upsert:${normalized.id}`);
      setSuperAdminError('Hay avisos futuros pendientes de sincronizar.');
      pushSuperAdminEvent('Pendiente backend', `Nuevo aviso futuro de ${normalized.profesor} guardado solo en local.`);
      renderSuperAdminMonitor();
      notifyStateChange();
      return { ok: true, localOnly: true, syncError: true, entry: normalized };
    }
  }

  async function updateEntry(entry){
    const storage = readHostValue('storage');
    const normalized = upsertRowLocal(entry);
    if(!storage || typeof storage.hasBackend !== 'function' || !storage.hasBackend()){
      return { ok: true, localOnly: true, entry: normalized };
    }
    try{
      const result = await requireStorageMethod('updateTeacherFutureAbsence', 'future absence update')(normalized.id, normalized);
      const saved = normalizeTeacherFutureAbsence(result && result.entry || normalized);
      state.syncFlags.delete(`upsert:${saved.id}`);
      upsertRowLocal(saved);
      clearSuperAdminError();
      pushSuperAdminEvent('Future absence', `Aviso futuro actualizado para ${saved.profesor}.`);
      return result || { ok: true, entry: saved };
    }catch(error){
      console.warn('Teacher future absence update backend sync failed; keeping local state', error);
      state.syncFlags.add(`upsert:${normalized.id}`);
      setSuperAdminError('Hay avisos futuros pendientes de sincronizar.');
      pushSuperAdminEvent('Pendiente backend', `Aviso futuro de ${normalized.profesor} guardado solo en local.`);
      renderSuperAdminMonitor();
      notifyStateChange();
      return { ok: true, localOnly: true, syncError: true, entry: normalized };
    }
  }

  async function deleteEntry(id){
    const storage = readHostValue('storage');
    const targetId = cleanText(id);
    removeRowLocal(targetId);
    if(!storage || typeof storage.hasBackend !== 'function' || !storage.hasBackend()){
      return { ok: true, localOnly: true };
    }
    try{
      state.syncFlags.delete(`upsert:${targetId}`);
      state.syncFlags.delete(`delete:${targetId}`);
      const result = await requireStorageMethod('deleteTeacherFutureAbsence', 'future absence delete')(targetId);
      clearSuperAdminError();
      pushSuperAdminEvent('Future absence', `Aviso futuro ${targetId} eliminado en backend.`);
      notifyStateChange();
      return result;
    }catch(error){
      console.warn('Teacher future absence delete backend sync failed; keeping local state', error);
      state.syncFlags.add(`delete:${targetId}`);
      setSuperAdminError('Hay eliminaciones pendientes de sincronizar.');
      pushSuperAdminEvent('Pendiente backend', `Eliminación local pendiente para aviso ${targetId}.`);
      renderSuperAdminMonitor();
      notifyStateChange();
      return { ok: true, localOnly: true, syncError: true };
    }
  }

  function buildProjectedRowsForWeek(weekKey){
    requireHostFunction('getAulaProfesor', 'future absence projection');
    requireHostFunction('assignGuardiasForRows', 'future absence projection');
    const rows = [];
    const seen = new Set();
    state.rows
      .filter(item => isFutureAbsenceProjected(item))
      .forEach(item => {
        const weekInfo = getSchoolWeekInfoFromDate(item.date);
        if(!weekInfo || weekInfo.weekKey !== weekKey || weekInfo.dayIndex == null) return;
        const horasLectivas = getFutureAbsenceHoursForEntry(item);
        horasLectivas.forEach(hora => {
          const key = `${item.id}|${hora}`;
          if(seen.has(key)) return;
          seen.add(key);
          rows.push({
            id: key,
            dia: weekInfo.dayIndex,
            hora,
            ausente: item.profesor,
            guardia: '',
            aula: callHost('getAulaProfesor', item.profesor, weekInfo.dayIndex, hora) || '',
            faena: false,
            obs: '',
            futurePlanned: true,
            futureStatus: item.status,
            futureDate: item.date,
            futureSourceId: item.id,
            reviewerNote: item.reviewerNote || ''
          });
        });
      });
    return callHost('assignGuardiasForRows', rows);
  }

  async function applyApprovedForCurrentWeek(){
    requireHostFunction('getCurrentSchoolWeekKey', 'future absence apply');
    requireHostFunction('getAbsenceRows', 'future absence apply');
    requireHostFunction('setAbsenceRows', 'future absence apply');
    requireHostFunction('claimNextAbsenceRowId', 'future absence apply');
    requireHostFunction('getCurrentDay', 'future absence apply');
    requireHostFunction('buildUndoState', 'future absence apply');
    requireHostFunction('normalizeStoredRows', 'future absence apply');
    requireHostFunction('reassignAllGuardias', 'future absence apply');
    requireHostFunction('persistGuardias', 'future absence apply');
    requireHostFunction('renderGuardiaBoard', 'future absence apply');
    requireHostFunction('renderTable', 'future absence apply');
    requireHostFunction('getHistoryRows', 'future absence apply');
    requireHostFunction('setHistoryRows', 'future absence apply');
    requireHostFunction('persistHistorial', 'future absence apply');
    requireHostFunction('renderHistoryList', 'future absence apply');
    requireHostFunction('syncAdminState', 'future absence apply');
    requireHostFunction('getAulaProfesor', 'future absence apply');
    const currentWeekKey = callHost('getCurrentSchoolWeekKey');
    const approvedRows = state.rows.filter(item => item.status === 'approved' && !item.appliedAt);
    if(!approvedRows.length) return false;
    let stateChanged = false;
    let approvalsChanged = false;
    const appliedSummaries = [];
    const undoState = callHost('buildUndoState', callHost('getCurrentDay'));
    let data = (callHost('getAbsenceRows') || []).slice();
    for(const item of approvedRows){
      const weekInfo = getSchoolWeekInfoFromDate(item.date);
      if(!weekInfo || weekInfo.weekKey !== currentWeekKey || weekInfo.dayIndex == null) continue;
      const horasLectivas = getFutureAbsenceHoursForEntry(item);
      if(!horasLectivas.length) continue;
      horasLectivas.forEach(horaItem => {
        if(data.some(row => row.dia === weekInfo.dayIndex && row.hora === horaItem && sameNormalizedText(row.ausente, item.profesor))) return;
        data.push({
          dia: weekInfo.dayIndex,
          hora: horaItem,
          ausente: item.profesor,
          guardia: '',
          aula: callHost('getAulaProfesor', item.profesor, weekInfo.dayIndex, horaItem) || '',
          faena: false,
          obs: '',
          id: callHost('claimNextAbsenceRowId')
        });
        stateChanged = true;
      });
      appliedSummaries.push(`${getVisibleTeacherName(item.profesor) || item.profesor} · ${item.date} · ${horasLectivas.map(formatHoraLabel).join(', ')}`);
      item.status = 'applied';
      item.appliedAt = new Date().toISOString();
      approvalsChanged = true;
    }
    if(stateChanged){
      data = callHost('normalizeStoredRows', data);
      callHost('setAbsenceRows', data);
      callHost('reassignAllGuardias');
      callHost('persistGuardias', data);
      callHost('renderGuardiaBoard');
      callHost('renderTable');
    }
    if(appliedSummaries.length){
      let historyRows = (callHost('getHistoryRows') || []).slice();
      historyRows.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: appliedSummaries.length === 1 ? 'Falta futura aplicada' : 'Faltas futuras aplicadas',
        detail: appliedSummaries.join(' · '),
        type: 'create',
        undoState,
        actor: 'Jefatura',
        ts: new Date().toISOString()
      });
      historyRows = historyRows.slice(0, 200);
      callHost('setHistoryRows', historyRows);
      callHost('persistHistorial', historyRows);
      callHost('renderHistoryList');
    }
    if(approvalsChanged){
      persistRows();
      renderAll();
      if(readHostValue('storage') && typeof readHostValue('storage').hasBackend === 'function' && readHostValue('storage').hasBackend() && isAdmin()){
        await Promise.allSettled(state.rows.filter(item => item.appliedAt).map(item => requireStorageMethod('updateTeacherFutureAbsence', 'future absence apply sync')(item.id, normalizeTeacherFutureAbsence(item))));
      }
    }
    if(appliedSummaries.length){
      await callHost('syncAdminState');
    }
    notifyStateChange();
    return stateChanged || approvalsChanged;
  }

  async function handleAdminDelete(id){
    if(!isAdmin() || !id) return null;
    const askConfirm = requireHostFunction('askConfirm', 'future absence admin delete');
    const showToast = requireHostFunction('showToast', 'future absence admin delete');
    if(!await askConfirm('Eliminar aviso', 'Se eliminará este aviso de ausencia futura.', 'Eliminar')) return null;
    try{
      const result = await deleteEntry(id);
      showToast(result && result.syncError ? 'Aviso eliminado en local. Pendiente de sincronizar con el servidor.' : 'Aviso eliminado.', 'success');
      return result;
    }catch(error){
      console.warn('Teacher future absence delete failed', error);
      showToast('No se pudo eliminar el aviso.', 'error');
      return null;
    }
  }

  async function reviewEntry(id, status){
    if(!isAdmin() || !id) return null;
    const askText = requireHostFunction('askText', 'future absence admin review');
    const showToast = requireHostFunction('showToast', 'future absence admin review');
    const current = state.rows.find(item => item.id === id);
    if(!current) return null;
    const reviewerNote = cleanText(await askText(
      status === 'approved' ? 'Validar falta futura' : 'Rechazar falta futura',
      `Puedes dejar una respuesta breve para ${getVisibleTeacherName(current.profesor) || current.profesor}.`,
      current.reviewerNote || '',
      'Respuesta opcional',
      status === 'approved' ? 'Validar' : 'Rechazar'
    ));
    const nextEntry = { ...current, status: normalizeStatus(status), reviewerNote, reviewedAt: new Date().toISOString() };
    try{
      const result = await updateEntry(nextEntry);
      if(status === 'approved') await applyApprovedForCurrentWeek();
      showToast(
        result && result.syncError
          ? (status === 'approved' ? 'Falta futura validada en local. Pendiente de sincronizar.' : 'Falta futura rechazada en local. Pendiente de sincronizar.')
          : (status === 'approved' ? 'Falta futura validada.' : 'Falta futura rechazada.'),
        'success'
      );
      return result;
    }catch(error){
      console.warn('Teacher future absence review failed', error);
      showToast('No se pudo actualizar el aviso.', 'error');
      return null;
    }
  }

  function getTeacherStats(nombre){
    const rows = state.rows.filter(item => sameNormalizedText(item.profesor, nombre));
    return {
      total: rows.length,
      pending: rows.filter(item => item.status === 'pending').length,
      approved: rows.filter(item => item.status === 'approved' || item.status === 'applied').length
    };
  }

  function attachDomListener(element, eventName, handler){
    if(!element || typeof element.addEventListener !== 'function') return;
    element.addEventListener(eventName, handler);
    state.boundListeners.push(() => element.removeEventListener(eventName, handler));
  }

  function detachDomListeners(){
    while(state.boundListeners.length){
      const dispose = state.boundListeners.pop();
      try{
        dispose();
      }catch(_error){}
    }
  }

  function attachDomListeners(){
    detachDomListeners();
    const adminList = getElement(domIds.adminList);
    const adminStatusFilter = getElement(domIds.adminStatusFilter);
    const adminTeacherFilter = getElement(domIds.adminTeacherFilter);
    const teacherDateInput = getElement(domIds.teacherDateInput);
    const teacherOverlay = getElement(domIds.teacherOverlay);
    const adminOverlay = getElement(domIds.adminOverlay);
    attachDomListener(adminList, 'click', event => {
      const target = event.target;
      const deleteButton = target && target.closest ? target.closest('[data-future-absence-delete]') : null;
      if(deleteButton){
        handleAdminDelete(deleteButton.dataset.futureAbsenceDelete || '');
        return;
      }
      const approveButton = target && target.closest ? target.closest('[data-future-absence-approve]') : null;
      if(approveButton){
        reviewEntry(approveButton.dataset.futureAbsenceApprove || '', 'approved');
        return;
      }
      const rejectButton = target && target.closest ? target.closest('[data-future-absence-reject]') : null;
      if(rejectButton){
        reviewEntry(rejectButton.dataset.futureAbsenceReject || '', 'rejected');
      }
    });
    attachDomListener(adminStatusFilter, 'change', event => {
      state.adminStatusFilter = cleanText(event && event.target && event.target.value) || 'all';
      renderAdminList();
      notifyStateChange();
    });
    attachDomListener(adminTeacherFilter, 'input', event => {
      state.adminTeacherFilter = cleanText(event && event.target && event.target.value);
      renderAdminList();
      notifyStateChange();
    });
    attachDomListener(teacherDateInput, 'change', handleTeacherDateChange);
    attachDomListener(teacherOverlay, 'click', handleTeacherOverlayBackgroundClick);
    attachDomListener(adminOverlay, 'click', handleAdminOverlayBackgroundClick);
    return api;
  }

  function init(nextHost, options){
    host = nextHost || {};
    domIds = { ...DEFAULT_DOM_IDS, ...(host.domIds || {}) };
    const nextOptions = options || {};
    if(nextOptions.loadFromLocalCache !== false){
      loadFromLocalCache({ render: nextOptions.renderOnInit !== false });
    }else if(nextOptions.renderOnInit !== false){
      renderAll();
    }
    if(nextOptions.bindDom !== false){
      attachDomListeners();
    }
    return api;
  }

  const api = {
    requiredHost,
    storageKey: STORAGE_KEY,
    init,
    attachDomListeners,
    detachDomListeners,
    getSnapshot,
    getRows,
    setRows,
    loadFromLocalCache,
    hydrateFromBackend,
    normalizeTeacherFutureAbsence,
    sortTeacherFutureAbsences,
    getFutureAbsenceHoursForEntry,
    getFutureAbsenceStatusLabel,
    getFutureAbsenceStatusClass,
    getFutureAbsenceTemporalMeta,
    getSchoolWeekInfoFromDate,
    findOverlapping,
    buildProjectedRowsForWeek,
    applyApprovedForCurrentWeek: applyApprovedForCurrentWeek,
    renderFutureAbsenceCard,
    renderAdminList,
    renderTeacherOwnList,
    renderAll,
    setAdminFilters,
    openTeacherModal,
    closeTeacherModal,
    handleTeacherOverlayBackgroundClick,
    handleTeacherDateChange,
    submitTeacherAbsence,
    openAdminModal,
    closeAdminModal,
    handleAdminOverlayBackgroundClick,
    createEntry,
    updateEntry,
    deleteEntry,
    handleAdminDelete,
    reviewEntry,
    getTeacherStats,
    formatFutureAbsenceDateLabel,
    formatHourListLabel
  };

  global.GuardiasFutureAbsences = api;
})(window);
