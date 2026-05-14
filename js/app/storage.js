(function initGuardiasStorage(global){
  const backendBaseUrl = global.GUARDIAS_API_BASE_URL || (global.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
  const searchParams = new URLSearchParams(global.location.search || '');
  const defaultMode = global.location.protocol === 'file:' ? 'hybrid' : 'backend-only';
  const requestedMode = String(global.GUARDIAS_STORAGE_MODE || searchParams.get('storage') || defaultMode).trim().toLowerCase();
  const storageMode = requestedMode === 'backend-only' ? 'backend-only' : 'hybrid';
  const localCacheEnabled = storageMode !== 'backend-only';

  function readJson(key, fallback){
    if (!localCacheEnabled) return fallback;
    try{
      const raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_error){
      return fallback;
    }
  }

  function writeJson(key, value){
    if (!localCacheEnabled) return;
    try{
      global.localStorage.setItem(key, JSON.stringify(value));
    }catch(_error){}
  }

  function writeText(key, value){
    if (!localCacheEnabled) return;
    try{
      global.localStorage.setItem(key, value || '');
    }catch(_error){}
  }

  function readText(key, fallback){
    if (!localCacheEnabled) return fallback;
    try{
      return global.localStorage.getItem(key) || fallback;
    }catch(_error){
      return fallback;
    }
  }

  async function request(path, options){
    if (!backendBaseUrl) {
      throw new Error('Backend API base URL is not configured');
    }

    const response = await fetch(`${backendBaseUrl}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    });

    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login') {
        global.dispatchEvent(new CustomEvent('guardias-auth-invalid'));
      }
      let detail = '';
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const body = await response.json();
          detail = body?.error || body?.message || '';
        } else {
          detail = await response.text();
        }
      } catch (_error) {}
      throw new Error(`Request failed: ${response.status}${detail ? ` - ${detail}` : ''}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  global.GuardiasStorage = {
    backendBaseUrl,
    storageMode,
    readJson,
    writeJson,
    readText,
    writeText,
    request,
    isBackendOnly(){
      return storageMode === 'backend-only';
    },
    usesLocalCache(){
      return localCacheEnabled;
    },
    hasBackend(){
      return !!backendBaseUrl;
    },
    fetchGuardias(){
      return request('/guardias');
    },
    fetchGuardiaMonthlyLoad(){
      return request('/guardias/monthly-load');
    },
    replaceGuardias(rows){
      return request('/guardias/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchBiblioteca(){
      return request('/biblioteca');
    },
    replaceBiblioteca(rows){
      return request('/biblioteca/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchHistorial(){
      return request('/historial');
    },
    replaceHistorial(rows){
      return request('/historial/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchTareasProfesorado(){
      return request('/profesorado/tareas');
    },
    replaceTareasProfesorado(rows){
      return request('/profesorado/tareas/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    saveTeacherTaskEntry(row){
      return request('/profesorado/tareas', {
        method: 'POST',
        body: JSON.stringify(row)
      });
    },
    deleteTeacherTaskEntry(id){
      return request(`/profesorado/tareas/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    },
    fetchSessionOverrides(){
      return request('/profesorado/session-overrides');
    },
    replaceSessionOverrides(rows){
      return request('/profesorado/session-overrides/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    saveSessionOverrideEntry(row){
      return request('/profesorado/session-overrides', {
        method: 'POST',
        body: JSON.stringify(row)
      });
    },
    deleteSessionOverrideEntry(id){
      return request(`/profesorado/session-overrides/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    },
    fetchAlumnosFueraAula(){
      return request('/profesorado/alumnos-fuera-aula');
    },
    saveAlumnosFueraAulaEntry(row){
      return request('/profesorado/alumnos-fuera-aula', {
        method: 'POST',
        body: JSON.stringify(row)
      });
    },
    registrarSalidaAlumno(row){
      return request('/profesorado/alumnos-fuera-aula/salida', {
        method: 'POST',
        body: JSON.stringify(row)
      });
    },
    registrarRetornoAlumno(row){
      return request('/profesorado/alumnos-fuera-aula/retorno', {
        method: 'POST',
        body: JSON.stringify(row)
      });
    },
    fetchTeacherSubstitutions(){
      return request('/profesorado/substitutions');
    },
    replaceTeacherSubstitutions(rows){
      return request('/profesorado/substitutions/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchTeacherPracticasGuardias(){
      return request('/profesorado/practicas-guardias');
    },
    replaceTeacherPracticasGuardias(rows){
      return request('/profesorado/practicas-guardias/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchTeacherPracticasGuardiasTramos(){
      return request('/profesorado/practicas-guardias-tramos');
    },
    replaceTeacherPracticasGuardiasTramos(rows){
      return request('/profesorado/practicas-guardias-tramos/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchPatioGuardias(){
      return request('/profesorado/patio-guardias');
    },
    replacePatioGuardias(rows){
      return request('/profesorado/patio-guardias/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchPatioTeacherBlocks(){
      return request('/profesorado/patio-teacher-blocks');
    },
    replacePatioTeacherBlocks(rows){
      return request('/profesorado/patio-teacher-blocks/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchTeacherFutureAbsences(){
      return request('/profesorado/future-absences');
    },
    fetchTvAnnouncement(){
      return request('/avisos/tv');
    },
    saveTvAnnouncement(row){
      return request('/avisos/tv', {
        method: 'PUT',
        body: JSON.stringify(row)
      });
    },
    createTeacherFutureAbsence(row){
      return request('/profesorado/future-absences', {
        method: 'POST',
        body: JSON.stringify(row)
      });
    },
    updateTeacherFutureAbsence(id, row){
      return request(`/profesorado/future-absences/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(row)
      });
    },
    deleteTeacherFutureAbsence(id){
      return request(`/profesorado/future-absences/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    },
    fetchAuthSession(){
      return request('/auth/session');
    },
    loginRole(role, password){
      return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ role, password })
      });
    },
    logoutRole(){
      return request('/auth/logout', {
        method: 'POST'
      });
    },
    restoreSnapshot(payload){
      return request('/export/restore', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    fetchSuperAdminInfo(){
      return request('/export/info');
    },
    changeRolePassword(role, currentPassword, newPassword){
      return request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ role, currentPassword, newPassword })
      });
    },
    importAnnualXml(fileName, xmlText){
      return request('/profesorado/annual-import/xml', {
        method: 'POST',
        body: JSON.stringify({ fileName, xmlText })
      });
    }
  };
})(window);
