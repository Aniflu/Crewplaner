// Custom dialog system — ersetzt alle nativen confirm/alert/prompt Aufrufe
(function(){
  let _overlay=null;
  let _active=false;

  function _ensureDOM(){
    if(_overlay)return;
    const s=document.createElement('style');
    s.textContent=`
#sp-dlg-ov{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:99999;}
#sp-dlg-box{background:#12122a;border-top:3px solid #e8c84a;border-radius:8px;padding:20px 24px;min-width:280px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.6);font-family:'IBM Plex Mono',monospace;}
#sp-dlg-box.sp-danger{border-top-color:#e84a4a;}
#sp-dlg-title{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#e8c84a;margin-bottom:10px;}
#sp-dlg-box.sp-danger #sp-dlg-title{color:#e84a4a;}
#sp-dlg-msg{color:#ccc;font-size:.82rem;line-height:1.5;margin-bottom:16px;}
#sp-dlg-input{width:100%;background:#1a1a2e;border:1px solid #e8c84a44;color:#e0e0e0;padding:7px 10px;border-radius:4px;font-family:inherit;font-size:.82rem;margin-bottom:16px;box-sizing:border-box;}
#sp-dlg-btns{display:flex;gap:8px;justify-content:flex-end;}
.sp-btn-cancel{background:#2a2a4a;color:#888;border:1px solid #333;padding:7px 16px;border-radius:4px;font-size:.75rem;font-family:inherit;cursor:pointer;}
.sp-btn-ok{background:#e8c84a;color:#1a1a2e;border:none;padding:7px 16px;border-radius:4px;font-size:.75rem;font-weight:700;font-family:inherit;cursor:pointer;}
.sp-btn-danger{background:#e84a4a;color:#fff;border:none;padding:7px 16px;border-radius:4px;font-size:.75rem;font-weight:700;font-family:inherit;cursor:pointer;}`;
    document.head.appendChild(s);
    _overlay=document.createElement('div');
    _overlay.id='sp-dlg-ov';
    _overlay.innerHTML='<div id="sp-dlg-box"><div id="sp-dlg-title"></div><div id="sp-dlg-msg"></div><input id="sp-dlg-input" type="text"><div id="sp-dlg-btns"></div></div>';
    _overlay.style.display='none';
    document.body.appendChild(_overlay);
  }

  function _show(opts){
    return new Promise(resolve=>{
      if(_active){resolve(opts.type==='prompt'?null:opts.type==='alert'?undefined:false);return;}
      _active=true;
      _ensureDOM();
      const box=document.getElementById('sp-dlg-box');
      const titleEl=document.getElementById('sp-dlg-title');
      const msgEl=document.getElementById('sp-dlg-msg');
      const inputEl=document.getElementById('sp-dlg-input');
      const btnsEl=document.getElementById('sp-dlg-btns');
      box.className=opts.danger?'sp-danger':'';
      titleEl.textContent=opts.title||(opts.danger?'Achtung':'Hinweis');
      msgEl.textContent=opts.msg;
      inputEl.style.display=opts.type==='prompt'?'block':'none';
      if(opts.type==='prompt')inputEl.value=opts.def||'';
      btnsEl.innerHTML='';
      const close=val=>{
        _active=false;
        _overlay.style.display='none';
        document.removeEventListener('keydown',onKey);
        resolve(val);
      };
      if(opts.type!=='alert'){
        const bc=document.createElement('button');
        bc.className='sp-btn-cancel';bc.textContent='Abbrechen';
        bc.onclick=()=>close(opts.type==='prompt'?null:false);
        btnsEl.appendChild(bc);
      }
      const bk=document.createElement('button');
      bk.className=opts.danger?'sp-btn-danger':'sp-btn-ok';
      bk.textContent=opts.label||'OK';
      bk.onclick=()=>close(opts.type==='prompt'?inputEl.value:opts.type==='alert'?undefined:true);
      btnsEl.appendChild(bk);
      _overlay.style.display='flex';
      if(opts.type==='prompt')setTimeout(()=>inputEl.focus(),0);
      else setTimeout(()=>bk.focus(),0);
      const onKey=e=>{
        if(e.key==='Escape')close(opts.type==='prompt'?null:false);
        if(e.key==='Enter'&&opts.type!=='prompt')close(opts.type==='alert'?undefined:true);
        if(e.key==='Enter'&&opts.type==='prompt')close(inputEl.value);
      };
      document.addEventListener('keydown',onKey);
      _overlay.onclick=e=>{if(e.target===_overlay)close(opts.type==='prompt'?null:false);};
    });
  }

  window.showAlert=function(msg){
    return _show({type:'alert',msg});
  };
  window.showConfirm=function(msg,label){
    const l=label||'OK';
    const danger=l==='Löschen'||l==='Zurückziehen'||l==='Ja';
    return _show({type:'confirm',msg,label:l,danger});
  };
  window.showPrompt=function(msg,def){
    return _show({type:'prompt',title:'Eingabe',msg,def:def||''});
  };
})();
