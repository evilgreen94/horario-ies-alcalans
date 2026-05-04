(function initGuardiasUi(global){
  let dialogResolver=null;

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

  function bgDialogClose(e){
    if(e.target.id==='dialogOverlay') closeDialog(false);
  }

  async function askConfirm(title,message,confirmText){
    const result=await openDialog({title,message,confirmText:confirmText||'Aceptar',showCancel:true});
    return result.confirmed;
  }

  async function askPassword(title,message){
    const result=await openDialog({title,message,confirmText:'Entrar',showCancel:true,input:true,inputType:'password',placeholder:'Introduce la contraseña'});
    return result.confirmed?result.value:'';
  }

  async function askText(title,message,defaultValue,placeholder,confirmText){
    const result=await openDialog({title,message,confirmText:confirmText||'Guardar',showCancel:true,input:true,inputType:'text',defaultValue:defaultValue||'',placeholder:placeholder||''});
    return result.confirmed?result.value:'';
  }

  global.GuardiasUi={
    askConfirm,
    askPassword,
    askText,
    bgDialogClose,
    closeDialog,
    openDialog,
    showToast
  };

  global.closeDialog=closeDialog;
  global.bgDialogClose=bgDialogClose;
})(window);
