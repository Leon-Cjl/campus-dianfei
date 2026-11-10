(function(){ if(document.readyState==='loading'||(window.__DF_EXPECTED_URL__&&location.href!==new URL(window.__DF_EXPECTED_URL__).href))return; var RUN=window.__DF_RUN__; if(window.__DF_DRIVER__===RUN)return; if(window.__DF_STOP_DRIVER__)window.__DF_STOP_DRIVER__(); window.__DF_DRIVER__=RUN; var stopped=false,lastState=""; var DF={state:function(s){if(s!==lastState){lastState=s;window.DF.state(RUN,s);}},result:function(s){if(window.__DF_STOP_DRIVER__)window.__DF_STOP_DRIVER__();window.DF.result(RUN,s);}}; var ROOM=window.__DF_ROOM__||'', CAMPUS=window.__DF_CAMPUS__||''; var tries=0, prev='', pageAt=0, age=0, lastTap=0, typed='', authSent=false, lastRun=0, pend=0; var T=window.__DF_TRACE=[]; var ROOM_RE=/^\d+\s*[#＃]\s*\d+$/;
 function log(s){T.push(Date.now()%100000+' '+s); if(T.length>60)T.shift();}
 // Carry only query identity, never loginData or credentials, across school SPA/document changes.
 var contextKey='df.query-context.v1',query=String(RUN).split(':')[0];
 try{var saved=JSON.parse(sessionStorage.getItem(contextKey)||'null');if(saved&&saved.query===query){CAMPUS=saved.campus||CAMPUS;typed=saved.room||'';}}catch(ignore){}
 function remember(){try{sessionStorage.setItem(contextKey,JSON.stringify({query:query,campus:CAMPUS,room:typed}));}catch(ignore){}}
 function captureIdentity(event){
   if(/SL321100/.test(location.pathname)){
     var input=document.querySelector('.recharge-num-page-list-title-input')||document.querySelector('input[type=text]');
     if(input&&ROOM_RE.test(input.value.trim())){typed=input.value.trim();remember();}
   }
   if(event.type==='click'&&/SL320000/.test(location.pathname)){
     var node=event.target,selection='';
     for(var level=0;node&&node!==document.body&&level<4;level++,node=node.parentElement){
       var text=(node.textContent||'').trim();if(text.length<=128&&/校区/.test(text)){selection=text;break;}
     }
     if(selection){CAMPUS=selection;remember();}
   }
 }
 document.addEventListener('click',captureIdentity,true);
 document.addEventListener('input',captureIdentity,true);
 function readBalance(){
   function visible(e){return e&&e.getClientRects().length>0;}
   var d={},scope=[].slice.call(document.querySelectorAll('.recharge-page')).find(visible)||document;
   scope.querySelectorAll('.ant-row').forEach(function(row){
     if(!visible(row))return;
     var title=row.querySelector('.name-title'),value=row.querySelector('.name-value');
     if(!title||!value)return;
     var label=(title.textContent||'').replace(/[\s:：]/g,''),raw=(value.textContent||'').trim();
     if(!raw)return;
     if(/^(剩余量|剩余金额|剩余余额|账户余额|余额)([（(](元|人民币|CNY|RMB)[）)])?$/.test(label))d.balance=raw;
     else if(/^(用户地址|宿舍地址)$/.test(label))d.addr=raw;
      else if(/^(表具|表具编号|表具号|表具通讯地址|表具通信地址|通讯地址|通信地址|电表编号|电表号|表号|设备编号|设备号)$/.test(label)){if(!d.meter)d.meter=raw;}
     else if(/^(状态|表具状态|设备状态)$/.test(label))d.status=raw;
     else if(/^(校区|所属校区|充值机构)$/.test(label))d.campus=raw;
     else if(/^(宿舍号|房间号|充值编号)$/.test(label)&&ROOM_RE.test(raw))d.room=raw;
   });
   // The current school RechargePage renders rechUnitName then custRechNo in this header.
   var names=scope.querySelectorAll('.recharge-page-list-title-name span');
   var unit=names.length>1?(names[0].textContent||'').trim():'';
   var number=names.length?(names[names.length-1].textContent||'').trim():'';
   d.room=d.room||(ROOM_RE.test(number)?number:'')||typed||ROOM;
   d.campus=d.campus||(/校区/.test(unit)?unit:'')||CAMPUS;
   if(!d.room){var room=[].slice.call(scope.querySelectorAll('span,div')).find(function(e){return e.children.length===0&&ROOM_RE.test((e.textContent||'').trim());});if(room)d.room=room.textContent.trim();}
   if(!d.campus){var campus=[].slice.call(scope.querySelectorAll('*')).find(function(e){return e.children.length===0&&/校区$/.test((e.textContent||'').trim())&&(e.textContent||'').trim().length<=128;});if(campus)d.campus=campus.textContent.trim();}
   window.__DF_READ_STATUS__={balanceFound:!!d.balance,missing:['campus','room','meter'].filter(function(k){return !d[k];})};
   return d;
 }
 function setVal(inp,v){var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(inp,v);   inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true}));}
 function tap(el){try{var r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+Math.min(r.height/2,20);   try{var t=new Touch({identifier:Date.now(),target:el,clientX:x,clientY:y});     el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));     el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[t]}));}catch(e){}   ['pointerdown','mousedown','pointerup','mouseup'].forEach(function(k){el.dispatchEvent(new MouseEvent(k,{bubbles:true,cancelable:true,clientX:x,clientY:y,view:window}));});   el.click();}catch(e){try{el.click();}catch(e2){}}}
 function leafEq(txt){return [].slice.call(document.querySelectorAll('*')).find(function(e){return e.children.length===0 && (e.textContent||'').trim()===txt;});}
 function step(txt,label){var lf=leafEq(txt);
   if(lf&&tries<5&&Date.now()-lastTap>=1800){var el=lf;for(var k=0;k<tries&&el.parentElement&&el.parentElement!==document.body;k++)el=el.parentElement;tries++;lastTap=Date.now();tap(el);log('tap '+label+' #'+tries);}   return (tries>=5||!lf)&&age>10000;}
 function tick(){if(stopped)return;try{   var href=location.href, path=location.pathname;
   if(href!==prev){prev=href;pageAt=Date.now();tries=0;lastTap=0;log('page '+path);} age=Date.now()-pageAt;
   if(!authSent&&/^\/SL3/.test(path)&&sessionStorage.getItem('loginData')){authSent=true;DF.state('authenticated');} var pop=document.querySelector('.za-alert__button'); if(pop&&!/SL200000/.test(path)){pop.click();}
   if(/SL200000/.test(path)||/sso\./.test(location.host)){DF.state('login');return;}
   if(/^\/SL3/.test(path)&&!sessionStorage.getItem('loginData')){DF.state('need-login');return;}
   if(/SL321110/.test(path)){var d=readBalance();
   if(d.balance&&!window.__DF_READ_STATUS__.missing.length){DF.result(JSON.stringify(d));}else{DF.state(d.balance?'balance-incomplete':'working');}return;
   }
   if(/SL321100/.test(path)){     var inp=document.querySelector('.recharge-num-page-list-title-input')||document.querySelector('input[type=text]');  
   if(!ROOM){ if(inp&&ROOM_RE.test(inp.value.trim())){typed=inp.value.trim();remember();} DF.state('room'); return; }     var btn=document.querySelector('.recharge-num-page-list-button')||[].slice.call(document.querySelectorAll('button')).find(function(b){return /下一步/.test(b.textContent||'');});
   if(inp&&btn){ if(inp.value!==ROOM){setVal(inp,ROOM);lastTap=Date.now()-1550;log('fill room');}       else if(tries<5&&Date.now()-lastTap>=1800){tries++;lastTap=Date.now();tap(btn.querySelector('span')||btn);log('tap next #'+tries);} }     DF.state(tries>=5&&age>10000?'room':'working');     return;
   }
   if(/SL321000/.test(path)||/SL320000/.test(path)){  
   if(!CAMPUS){DF.state('pick');return;}     DF.state(step(CAMPUS,'campus')?'pick':'working');     return;
   }
   if(/SL300000/.test(path)){DF.state(step('校园充值','recharge')?'other':'working');return;}
   if(path==='/'||path===''){DF.state('working');return;}   DF.state('other'); }catch(e){}} function kick(){if(stopped||pend)return;var w=Math.max(0,100-(Date.now()-lastRun));pend=setTimeout(function(){pend=0;lastRun=Date.now();tick();},w);} var timer=setInterval(kick,600); var mo=null; try{mo=new MutationObserver(kick);mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){} window.__DF_STOP_DRIVER__=function(){stopped=true;clearInterval(timer);if(pend)clearTimeout(pend);if(mo)mo.disconnect();document.removeEventListener('click',captureIdentity,true);document.removeEventListener('input',captureIdentity,true);}; tick();})();
