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
      try {
        console.warn('[guardias][request:error]', {
          path,
          method: (options && options.method) || 'GET',
          status: response.status
        });
      } catch (_error) {}
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
      const error = new Error(`Request failed: ${response.status}${detail ? ` - ${detail}` : ''}`);
      error.status = response.status;
      throw error;
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
    fetchGroups(){
      return request('/grupos');
    },
    updateGroupState(grupo, activo){
      return request(`/grupos/${encodeURIComponent(grupo)}/estado`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !!activo })
      });
    },
    replaceGuardias(rows){
      return request('/guardias/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    saveFullDayAbsence(payload){
      return request('/guardias', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    fetchBiblioteca(){
      return request('/biblioteca');
    },
    saveBiblioteca(row){
      return request('/biblioteca', {
        method: 'PUT',
        body: JSON.stringify(row)
      });
    },
    replaceBiblioteca(rows){
      return request('/biblioteca/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    fetchBanos(){
      return request('/banos');
    },
    saveBanos(row){
      return request('/banos', {
        method: 'PUT',
        body: JSON.stringify(row)
      });
    },
    replaceBanos(rows){
      return request('/banos/replace', {
        method: 'PUT',
        body: JSON.stringify(rows)
      });
    },
    bootstrapSpecialAssignments(payload){
      return request('/special-assignments/bootstrap', {
        method: 'POST',
        body: JSON.stringify(payload)
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
    archiveHistorial(){
      return request('/historial/archive', { method: 'POST', body: '{}' });
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
    fetchSubstitutionRequests(){ return request('/substitutions'); },
    fetchSubstitutionTitulars(){ return request('/substitutions/titulars'); },
    fetchSubstitutionCandidates(query=''){
      return request(`/substitutions/candidates${query?`?q=${encodeURIComponent(query)}`:''}`);
    },
    createSubstitutionRequest(payload){
      return request('/substitutions', { method:'POST', body:JSON.stringify(payload) });
    },
    cancelSubstitutionRequest(id,payload={}){
      return request(`/substitutions/${encodeURIComponent(id)}/cancel`, { method:'POST', body:JSON.stringify(payload) });
    },
    finishSubstitutionRequest(id,payload){
      return request(`/substitutions/${encodeURIComponent(id)}/finish`, { method:'POST', body:JSON.stringify(payload) });
    },
    linkSubstitutionUser(id,userId){
      return request(`/substitutions/${encodeURIComponent(id)}/link`, { method:'POST', body:JSON.stringify({userId}) });
    },
    provisionSubstitutionUser(id,payload){
      return request(`/substitutions/${encodeURIComponent(id)}/provision`, { method:'POST', body:JSON.stringify(payload) });
    },
    activateSubstitutionRequest(id){
      return request(`/substitutions/${encodeURIComponent(id)}/activate`, { method:'POST', body:'{}' });
    },
    rejectSubstitutionRequest(id,payload={}){
      return request(`/substitutions/${encodeURIComponent(id)}/reject`, { method:'POST', body:JSON.stringify(payload) });
    },
    fetchLegacySubstitutionAliases(){ return request('/substitutions/legacy'); },
    resolveLegacySubstitutionAlias(id,payload){
      return request(`/substitutions/legacy/${encodeURIComponent(id)}/resolve`, { method:'POST', body:JSON.stringify(payload) });
    },
    markLegacySubstitutionAliasObsolete(id,payload={}){
      return request(`/substitutions/legacy/${encodeURIComponent(id)}/obsolete`, { method:'POST', body:JSON.stringify(payload) });
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
    setOwnPatioTeacherBlock(row){
      return request('/profesorado/patio-teacher-blocks/own', {
        method: 'PUT',
        body: JSON.stringify(row)
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
    applyTeacherFutureAbsence(id, rows){
      return request(`/profesorado/future-absences/${encodeURIComponent(id)}/apply`, {
        method: 'POST',
        body: JSON.stringify({ rows })
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
    fetchOwnSchedule(date=''){
      return request(`/schedule/me${date ? `?date=${encodeURIComponent(date)}` : ''}`);
    },
    loginIndividual(username, password){
      return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
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
    changeIndividualPassword(currentPassword, newPassword){
      return request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
    },
    fetchUsers(query=''){
      return request(`/users?q=${encodeURIComponent(query)}`);
    },
    fetchProvisioningDatasets(){
      return request('/users/provisioning/datasets');
    },
    fetchProvisioningPreview(datasetId){
      return request(`/users/provisioning/preview?datasetId=${encodeURIComponent(datasetId)}`);
    },
    provisionTeachers(datasetId){
      return request('/users/provisioning', {
        method:'POST',
        body:JSON.stringify({datasetId,confirm:true})
      });
    },
    createUser(payload){
      return request('/users', { method:'POST', body:JSON.stringify(payload) });
    },
    resetUserPassword(userId){
      return request(`/users/${userId}/reset-password`, { method:'POST', body:JSON.stringify({confirm:true}) });
    },
    revokeUserSessions(userId){
      return request(`/users/${userId}/revoke-sessions`, { method:'POST', body:JSON.stringify({confirm:true}) });
    },
    setUserActive(userId,active){
      return request(`/users/${userId}/status`, { method:'PUT', body:JSON.stringify({confirm:true,active}) });
    },
    setUserRoles(userId,roles){
      return request(`/users/${userId}/roles`, { method:'PUT', body:JSON.stringify({confirm:true,roles}) });
    },
    fetchUserAudit(userId){
      return request(`/users/${userId}/audit`);
    },
    changeRolePassword(role, currentPassword, newPassword){
      return request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ role, currentPassword, newPassword })
      });
    },
    importAnnualXml(fileName, xmlBase64, academicYear){
      return request('/profesorado/annual-import/xml', {
        method: 'POST',
        body: JSON.stringify({ fileName, xmlBase64, academicYear })
      });
    }
  };
})(window);
