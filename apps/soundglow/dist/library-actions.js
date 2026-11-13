// SPDX-License-Identifier: GPL-3.0-or-later
// Shared file/bookmark row actions. Storage and playback remain with AudioLibrary.
(function(scope){
 class LibraryActions {
  constructor(root,host){
   this.root=root;this.host=host;this.menu=document.getElementById('libraryItemMenu');this.dialog=document.getElementById('libraryItemDialog');
   this.input=document.getElementById('libraryItemName');this.confirm=document.getElementById('libraryItemConfirm');this.cancel=document.getElementById('libraryItemCancel');
   root.addEventListener('click',e=>{const row=e.target.closest('[data-library-kind]');if(!row)return;if(e.target.closest('[data-library-menu]'))this.openMenu(row);else if(e.target.closest('[data-file],[data-bookmark]'))host.open(row.dataset.libraryKind,row.dataset.libraryId);});
   root.addEventListener('contextmenu',e=>{const row=e.target.closest('[data-library-kind]');if(row){e.preventDefault();this.openMenu(row,{x:e.clientX,y:e.clientY});}});
   root.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){const row=e.target.closest('[data-library-kind]');if(row){e.preventDefault();e.stopPropagation();this.openMenu(row);}}});
   this.menu.addEventListener('click',e=>{const button=e.target.closest('[data-library-action]');if(button&&this.target)this.edit(button.dataset.libraryAction);});
   this.menu.addEventListener('keydown',e=>{
    const buttons=[...this.menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length].focus();}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.closeMenu(true);}
    if(e.key==='Tab'){this.closeMenu(true);e.stopPropagation();}
   });
   document.addEventListener('pointerdown',e=>{if(this.target&&!this.menu.contains(e.target)&&!e.target.closest('[data-library-menu]'))this.closeMenu();});
   document.addEventListener('scroll',()=>this.closeMenu(),true);window.addEventListener('resize',()=>this.closeMenu());window.addEventListener('blur',()=>this.closeMenu());
   this.dialog.addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
   this.dialog.addEventListener('close',()=>{const target=this.editTarget;this.editTarget=null;if(target)this.focusItem(target);});
   this.cancel.onclick=()=>{if(!this.busy)this.dialog.close();};this.input.oninput=()=>this.input.setCustomValidity('');
   document.getElementById('libraryItemForm').onsubmit=e=>{e.preventDefault();void this.submit();};
  }
  row({kind,id,name,detail,title,selected=false}){
   const row=document.createElement('div');row.className='library-row';row.dataset.libraryKind=kind;row.dataset.libraryId=id;
   const open=document.createElement('button');open.type='button';open.className='library-item';open.dataset[kind==='file'?'file':'bookmark']=id;open.title=title;
   if(kind==='file')open.setAttribute('aria-pressed',String(selected));
   const label=document.createElement('span');label.className='library-item-name';label.textContent=name;
   const info=document.createElement('small');info.textContent=detail;open.append(label,info);
   const actions=document.createElement('button');actions.type='button';actions.className='library-more';actions.dataset.libraryMenu='';actions.textContent='⋯';actions.title='More actions';actions.setAttribute('aria-label',`Actions for ${kind} ${name}`);actions.setAttribute('aria-haspopup','menu');actions.setAttribute('aria-expanded','false');
   row.append(open,actions);return row;
  }
  focusItem(target){
   const row=[...this.root.querySelectorAll('[data-library-kind]')].find(el=>el.dataset.libraryKind===target.kind&&el.dataset.libraryId===target.id);
   (row?.querySelector('[data-library-menu]')||document.getElementById('importAudio')).focus();
  }
  openMenu(row,point){
   const target={kind:row.dataset.libraryKind,id:row.dataset.libraryId};if(!this.host.find(target.kind,target.id))return;
   this.closeMenu();this.target=target;this.invoker=row.querySelector('[data-library-menu]');this.invoker.setAttribute('aria-expanded','true');
   const box=this.invoker.getBoundingClientRect();this.menu.style.left='0px';this.menu.style.top='0px';this.menu.showPopover();
   const size=this.menu.getBoundingClientRect();this.menu.style.left=Math.max(8,Math.min(point?.x??box.left,innerWidth-size.width-8))+'px';this.menu.style.top=Math.max(8,Math.min(point?.y??box.bottom,innerHeight-size.height-8))+'px';this.menu.querySelector('button').focus();
  }
  closeMenu(focus=false){
   const target=this.target;this.target=null;this.invoker?.setAttribute('aria-expanded','false');if(this.menu.matches(':popover-open'))this.menu.hidePopover();if(focus&&target)this.focusItem(target);
  }
  edit(action){
   const target={...this.target,action},item=this.host.find(target.kind,target.id);if(!item)return;
   this.closeMenu();this.editTarget=target;const rename=action==='rename';
   document.getElementById('libraryItemTitle').textContent=`${rename?'Rename':'Delete'} ${target.kind}`;
   document.getElementById('libraryItemDescription').textContent=rename?item.name:item.deleteDescription;
   document.getElementById('libraryItemNameField').hidden=!rename;this.input.disabled=!rename;this.input.required=rename;this.input.maxLength=item.maxNameLength;this.input.value=item.name;this.input.setCustomValidity('');
   document.getElementById('libraryItemError').textContent='';this.confirm.textContent=rename?'Save name':`Delete ${target.kind}`;this.confirm.classList.toggle('danger',!rename);
   this.dialog.showModal();if(rename){this.input.focus();this.input.select();}else this.cancel.focus();
  }
  async submit(){
   if(this.busy||!this.editTarget)return;const target=this.editTarget,name=this.input.value.trim();
   if(target.action==='rename'&&(!name||name.length>this.input.maxLength)){this.input.setCustomValidity(!name?'Enter a name.':`Use ${this.input.maxLength} characters or fewer.`);this.input.reportValidity();return;}
   this.busy=true;this.confirm.disabled=this.cancel.disabled=true;
   try{
    if(target.action==='rename')await this.host.rename(target.kind,target.id,name);
    else if(!await this.host.remove(target.kind,target.id))throw Error('Removal failed');
    this.dialog.close();
   }catch{document.getElementById('libraryItemError').textContent=`Could not ${target.action} this ${target.kind}. Please retry.`;}
   finally{this.busy=false;this.confirm.disabled=this.cancel.disabled=false;}
  }
 }
 scope.SoundglowLibraryActions=LibraryActions;
})(window);
