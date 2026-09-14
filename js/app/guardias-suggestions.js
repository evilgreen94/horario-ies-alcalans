(function initSuggestionsModule(global){
  'use strict';

  const STATUS_LABELS={
    new:'Nueva',reviewing:'En revisión',accepted:'Aceptada',planned:'Planificada',
    implemented:'Implementada',discarded:'Descartada',duplicate:'Duplicada'
  };
  const CATEGORY_LABELS={
    usabilidad:'Usabilidad',guardias:'Guardias',sustituciones:'Sustituciones',horarios:'Horarios',
    sala_profesorado:'Sala del profesorado',movil:'Móvil',rendimiento:'Rendimiento',otro:'Otro'
  };
  let session=null;
  let submitting=false;

  const byId=id=>global.document.getElementById(id);

  async function request(url,options={}){
    const response=await global.fetch(url,{
      credentials:'same-origin',
      headers:options.body?{'Content-Type':'application/json',...(options.headers||{})}:options.headers,
      ...options
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(body.error||`Error ${response.status}`);
    return body;
  }

  function element(tag,className='',text=''){
    const node=global.document.createElement(tag);
    if(className) node.className=className;
    if(text) node.textContent=text;
    return node;
  }

  function formatDate(value){
    if(!value) return '';
    const normalized=value.includes('T')?value:`${value.replace(' ','T')}Z`;
    const date=new Date(normalized);
    return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('es-ES',{
      day:'2-digit',month:'short',year:'numeric'
    }).format(date);
  }

  function setMessage(text,isError=false){
    const target=byId('suggestionsMessage');
    target.textContent=text||'';
    target.dataset.kind=isError?'error':'success';
  }

  function addMetadata(card,item,includeAuthor=false){
    const metadata=element('div','suggestion-metadata');
    const status=element('span','suggestion-status',STATUS_LABELS[item.status]||item.status);
    status.dataset.status=item.status;
    metadata.append(
      status,
      element('span','',CATEGORY_LABELS[item.category]||item.category),
      element('span','',formatDate(item.createdAt))
    );
    if(includeAuthor&&item.author){
      const author=[item.author.displayName||item.author.username,item.author.username,item.author.sourceCode]
        .filter(Boolean).join(' · ');
      metadata.append(element('span','suggestion-author',author));
    }
    card.append(metadata);
  }

  function renderOwnSuggestions(items){
    const list=byId('ownSuggestionsList');
    list.replaceChildren();
    if(!items.length){
      list.append(element('p','suggestions-empty','Todavía no has enviado sugerencias.'));
      return;
    }
    for(const item of items){
      const card=element('article','suggestion-card');
      card.append(element('h3','',item.title));
      addMetadata(card,item);
      card.append(element('p','suggestion-description',item.description));
      if(item.implementedVersion){
        card.append(element('p','suggestion-implemented',`Implementada en ${item.implementedVersion}`));
      }
      list.append(card);
    }
  }

  function reviewField(labelText,control,wide=false){
    const wrapper=element('label',wide?'suggestion-review-wide':'',labelText);
    wrapper.append(control);
    return wrapper;
  }

  function renderReviewSuggestions(items){
    const list=byId('reviewSuggestionsList');
    list.replaceChildren();
    if(!items.length){
      list.append(element('p','suggestions-empty','No hay sugerencias con estos filtros.'));
      return;
    }
    for(const item of items){
      const card=element('article','suggestion-card suggestion-review-card');
      card.append(element('h3','',item.title));
      addMetadata(card,item,true);
      card.append(element('p','suggestion-description',item.description));

      const form=element('form','suggestion-review-form');
      const status=element('select');
      for(const [value,label] of Object.entries(STATUS_LABELS)){
        const option=element('option','',label);
        option.value=value;
        option.selected=value===item.status;
        status.append(option);
      }
      const note=element('textarea');
      note.rows=3;
      note.maxLength=2000;
      note.value=item.adminNote||'';
      const version=element('input');
      version.maxLength=64;
      version.value=item.implementedVersion||'';
      version.placeholder='Ej. 1.1.0';
      const save=element('button','btn-dialog btn-dialog-primary','Guardar revisión');
      save.type='submit';
      form.append(
        reviewField('Estado',status),
        reviewField('Versión implementada',version),
        reviewField('Nota interna de revisión',note,true),
        save
      );
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        save.disabled=true;
        setMessage('Guardando revisión…');
        try{
          await request(`/api/suggestions/${item.id}`,{
            method:'PATCH',
            body:JSON.stringify({status:status.value,adminNote:note.value,implementedVersion:version.value})
          });
          setMessage('Revisión guardada.');
          await Promise.all([
            loadReviewSuggestions(),
            session.roles.includes('teacher')?loadOwnSuggestions():Promise.resolve()
          ]);
        }catch(error){
          setMessage(error.message,true);
        }finally{
          save.disabled=false;
        }
      });
      card.append(form);
      list.append(card);
    }
  }

  async function loadOwnSuggestions(){
    const result=await request('/api/suggestions/me');
    renderOwnSuggestions(result.suggestions);
  }

  async function loadReviewSuggestions(){
    const params=new URLSearchParams();
    const status=byId('suggestionsStatusFilter').value;
    const query=byId('suggestionsSearch').value.trim();
    if(status) params.set('status',status);
    if(query) params.set('q',query);
    const result=await request(`/api/suggestions${params.size?`?${params}`:''}`);
    renderReviewSuggestions(result.suggestions);
  }

  async function loadSuggestionsPanel(){
    setMessage('Cargando…');
    byId('suggestionsAccessMessage').hidden=true;
    try{
      session=await request('/api/auth/session');
      const roles=session.authenticated&&Array.isArray(session.roles)?session.roles:[];
      const teacher=roles.includes('teacher');
      const reviewer=roles.includes('admin')||roles.includes('superadmin');
      byId('suggestionsTeacherSection').hidden=!teacher;
      byId('suggestionsReviewSection').hidden=!reviewer;
      if(!session.authenticated||session.mustChangePassword||(!teacher&&!reviewer)){
        const access=byId('suggestionsAccessMessage');
        access.textContent=session.authenticated
          ? 'Esta cuenta no tiene acceso al buzón de sugerencias.'
          : 'Inicia sesión con tu cuenta individual de ARGOS para usar el buzón.';
        access.hidden=false;
        setMessage('');
        return;
      }
      await Promise.all([
        teacher?loadOwnSuggestions():Promise.resolve(),
        reviewer?loadReviewSuggestions():Promise.resolve()
      ]);
      setMessage('');
    }catch(error){
      setMessage(error.message,true);
    }
  }

  function openSuggestionsModal(){
    byId('suggestionsOverlay').classList.add('open');
    loadSuggestionsPanel();
  }

  function closeSuggestionsModal(){
    byId('suggestionsOverlay').classList.remove('open');
    setMessage('');
  }

  function bgSuggestionsClose(event){
    if(event.target===byId('suggestionsOverlay')) closeSuggestionsModal();
  }

  byId('suggestionForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(submitting) return;
    submitting=true;
    const submit=byId('submitSuggestion');
    submit.disabled=true;
    setMessage('Enviando sugerencia…');
    try{
      await request('/api/suggestions',{
        method:'POST',
        body:JSON.stringify({
          title:byId('suggestionTitle').value,
          description:byId('suggestionDescription').value,
          category:byId('suggestionCategory').value
        })
      });
      event.currentTarget.reset();
      setMessage('Sugerencia enviada correctamente.');
      await loadOwnSuggestions();
    }catch(error){
      setMessage(error.message,true);
    }finally{
      submitting=false;
      submit.disabled=false;
    }
  });

  byId('refreshOwnSuggestions').addEventListener('click',()=>{
    loadOwnSuggestions().catch(error=>setMessage(error.message,true));
  });
  byId('suggestionsStatusFilter').addEventListener('change',()=>{
    loadReviewSuggestions().catch(error=>setMessage(error.message,true));
  });
  byId('suggestionsFilterForm').addEventListener('submit',event=>{
    event.preventDefault();
    loadReviewSuggestions().catch(error=>setMessage(error.message,true));
  });
  global.document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&byId('suggestionsOverlay').classList.contains('open')) closeSuggestionsModal();
  });

  global.openSuggestionsModal=openSuggestionsModal;
  global.closeSuggestionsModal=closeSuggestionsModal;
  global.bgSuggestionsClose=bgSuggestionsClose;
  global.GuardiasSuggestions={
    loadSuggestionsPanel,
    renderOwnSuggestions,
    renderReviewSuggestions,
    statusLabels:{...STATUS_LABELS}
  };
})(window);
