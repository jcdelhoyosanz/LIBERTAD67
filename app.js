'use strict';
(()=>{
const $=id=>document.getElementById(id), KEY='libertad67_v1', MS=60000;
const defaults=()=>({version:1,settings:{goal:5,weight:0.5,wake:'07:00',rollover:'02:00',baseline:23,official:'2026-10-22'},events:[],stockEvents:[],packs:[],initialWeighingDone:false,goalHistory:{}});
let db;try{const raw=localStorage.getItem(KEY);db=raw?JSON.parse(raw):defaults();if(!db||!Array.isArray(db.events)||!Array.isArray(db.stockEvents)||!Array.isArray(db.packs)||!db.settings)throw Error('Invalid');}catch(e){db=defaults();alert('No se pudieron leer los datos anteriores. No se sobrescribirán hasta guardar una operación. Si tenías datos, importa una copia de seguridad.');}
db.goalHistory ||= {};
// Una jornada seguida en directo se distingue de una con registros solo retroactivos.
db.trackedDays ||= {};
// Jornada inicial de observación: no se evalúa como jornada de reducción.
db.referenceDay ||= '2026-10-22';
let active='today', selectedDay=null, tick=null, toastTimer=null, busy=false;
const pad=n=>String(n).padStart(2,'0'), uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
const fmt=(n,k=1)=>Number(n).toLocaleString('es-ES',{minimumFractionDigits:k,maximumFractionDigits:k});
const dayISO=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const localDate=s=>{let [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)};
const adjDay=(s,n)=>{let d=localDate(s);d.setDate(d.getDate()+n);return dayISO(d)};
const mins=s=>{let [h,m]=s.split(':').map(Number);return h*60+m};
const dayKey=(time)=>{let d=new Date(time), roll=mins(db.settings.rollover);if(d.getHours()*60+d.getMinutes()<roll)d.setDate(d.getDate()-1);return dayISO(d)};
const dayStart=(key)=>{let d=localDate(key);let [h,m]=db.settings.rollover.split(':').map(Number);d.setHours(h,m,0,0);return +d};
const today=()=>dayKey(Date.now());
const afterStart=(key)=>key>=db.settings.official;
const dayGoal=(key)=>db.goalHistory[key]??db.settings.goal;
const isReferenceDay=key=>key===db.referenceDay;
const referenceCount=()=>db.referenceDay<today()&&db.trackedDays[db.referenceDay]===true&&eventsFor(db.referenceDay).length>0?eventsFor(db.referenceDay).length:null;
const comparisonBaseline=()=>referenceCount();
const eventsFor=key=>db.events.filter(e=>dayKey(e.at)===key).sort((a,b)=>a.at-b.at);
const grams=ev=>ev.reduce((x,e)=>x+e.weight,0);
const save=()=>{localStorage.setItem(KEY,JSON.stringify(db))};
const notify=s=>{const n=$('message');n.textContent=s;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,5500)};
const newEvent=(at)=>({id:uid(),at,weight:+db.settings.weight,goal:+db.settings.goal});
const sorted=()=>[...db.events].sort((a,b)=>a.at-b.at);
const intervals=ev=>{const all=sorted();return ev.map(e=>{const idx=all.findIndex(x=>x.id===e.id);return idx>0?(e.at-all[idx-1].at)/MS:null})};
const violations=ev=>intervals(ev).filter(x=>x!==null&&x<60).length;
const meanInterval=ev=>{let aa=intervals(ev).filter(x=>x!==null);return aa.length?Math.round(aa.reduce((a,b)=>a+b,0)/aa.length):null};
const stamp=at=>new Date(at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const clock=at=>new Date(at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
const dateLong=key=>localDate(key).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
function ask(title,text,opts={}){return new Promise(resolve=>{const d=$('dialog'),inp=$('dialogInput');$('dialogTitle').textContent=title;$('dialogText').textContent=text;$('dialogLabel').textContent=opts.label||'';$('dialogLabel').hidden=!opts.label;inp.hidden=!opts.label;inp.value=opts.value??'';inp.type=opts.type||'text';inp.min=opts.min||'';inp.max=opts.max||'';inp.step=opts.step||'any';$('dialogOk').textContent=opts.ok||'CONFIRMAR';d.querySelector('button[value="cancel"]').textContent=opts.cancel||'CANCELAR';if(typeof d.showModal!=='function'){resolve(null);notify('Tu navegador no admite esta ventana. Usa Chrome actualizado.');return;}const done=()=>{d.removeEventListener('close',done);resolve(d.returnValue==='ok'?(opts.label?inp.value:true):null)};d.addEventListener('close',done);d.showModal();if(opts.label)inp.focus();});}
function awardsFor(key){
 if(isReferenceDay(key))return [];
 const ev=eventsFor(key),closed=key<today(),tracked=db.trackedDays[key]===true;
 const iv=ev.slice(1).map((e,i)=>(e.at-ev[i].at)/MS);
 // Los intervalos para premios deben estar dentro de la misma jornada y no ser pausas nocturnas prolongadas.
 const qualifying=iv.map(x=>x>=60&&x<=240);
 let ret=[];
 if(closed&&tracked&&ev.length){
   const baseline=comparisonBaseline(),actual=ev.length;
   const tiers=[[75,'Dominio personal','💎'],[50,'Gran avance','🥇'],[25,'Buen camino','🥈'],[10,'Primer paso','🥉']];
   const winner=baseline?tiers.find(([pct])=>actual<=baseline*(1-pct/100)):null;
   if(winner)ret.push({key:key+'-pct'+winner[0],title:winner[1],emoji:winner[2],day:key});
   if(grams(ev)<=dayGoal(key)){
     let seven=true;
     for(let i=0;i<7;i++){
       const d=adjDay(key,-i),records=eventsFor(d);
       if(isReferenceDay(d)||d<db.settings.official||d>=today()||db.trackedDays[d]!==true||!records.length||grams(records)>dayGoal(d))seven=false;
     }
     if(seven)ret.push({key:key+'-week',title:'Semana de progreso',emoji:'🏆',day:key});
   }
 }
 // Premios por intervalos: solo con dos cigarrillos de la misma jornada.
 // Registros retroactivos anteriores al seguimiento no pueden crear premios.
 if(tracked&&key>=db.settings.official&&qualifying.some(Boolean))
   ret.push({key:key+'-interval1',title:'Una hora de control',emoji:'⭐',day:key});
 let run=0,best=0;
 qualifying.forEach(ok=>{run=ok?run+1:0;best=Math.max(best,run)});
 if(tracked&&best>=5)ret.push({key:key+'-interval5',title:'Buen ritmo',emoji:'🌟',day:key});
 if(closed&&tracked&&iv.length>0&&qualifying.every(Boolean))
   ret.push({key:key+'-intervalall',title:'Día sin prisas',emoji:'🏅',day:key});
 return ret;
}
function awards(){let a=[];for(let d=db.settings.official;d<=today();d=adjDay(d,1)){a.push(...awardsFor(d));if(a.length>5000)break;}return a;}
function renderToday(){let key=today(),ev=eventsFor(key),g=grams(ev),goal=dayGoal(key), pct=goal>0?g/goal*100:0,all=sorted(),last=all.at(-1),elapsed=last?(Date.now()-last.at)/MS:null;
$('referenceBanner').hidden=!isReferenceDay(key);$('dateLabel').textContent=dateLong(key).toUpperCase()+' · CIERRE '+db.settings.rollover;$('cigs').textContent=ev.length;$('grams').innerHTML=fmt(g,2)+' <small>g</small>';$('goalBar').style.width=Math.min(pct,100)+'%';$('goalBar').style.background=pct>100?'#ff8585':pct>=75?'#f3be74':'#8fe1ac';$('goalText').textContent=`Objetivo ${fmt(goal,2)} g · Restan ${fmt(Math.max(0,goal-g),2)} g`;$('goalPct').textContent=fmt(pct,0)+' %';$('tar').innerHTML=`${fmt(ev.length*9.9)}–${fmt(ev.length*21,0)} <small>mg</small>`;$('nic').innerHTML=`${fmt(ev.length*.9)}–${fmt(ev.length*1.8)} <small>mg</small>`;
$('lastTime').textContent=last?'Último: '+stamp(last.at):'Ningún cigarrillo registrado';$('sinceTime').textContent=last?(elapsed>=60?`${Math.floor(elapsed)} min desde el último`:`Faltan ${Math.ceil(60-elapsed)} min para 60 min`):'—';
let alert=$('intervalAlert');alert.className='signal';if(!last)alert.textContent='Intervalo recomendado: al menos 60 minutos.';else if(all.length===1)alert.textContent=`Primer cigarrillo registrado. Han pasado ${Math.floor(Math.max(0,elapsed))} ${Math.floor(Math.max(0,elapsed))===1?'minuto':'minutos'} desde el registro; aún no hay intervalos entre cigarrillos que evaluar.`;else if(elapsed<30){alert.classList.add('red');alert.textContent=`🔴 Último cigarrillo hace ${Math.floor(Math.max(0,elapsed))} minutos. Intervalo muy corto.`}else if(elapsed<60){alert.classList.add('amber');alert.textContent=`🟠 Han pasado ${Math.floor(elapsed)} minutos. Espera ${Math.ceil(60-elapsed)} para llegar a una hora.`}else alert.textContent=`🟢 Llevas ${Math.floor(elapsed)} minutos sin fumar. Tú decides si realmente quieres otro.`;
if(isReferenceDay(key)){
  $('goalText').textContent='DÍA DE REFERENCIA · Sin objetivo de reducción';
  $('goalPct').textContent='Medición';
  $('goalBar').style.width='0%';
}
const wake=mins(db.settings.wake),roll=mins(db.settings.rollover),now=new Date(),nowM=now.getHours()*60+now.getMinutes(),rollRel=roll<=wake?roll+1440:roll,nowRel=nowM<roll?nowM+1440:nowM;const frac=Math.min(1,Math.max(0,(nowRel-wake)/(rollRel-wake)));const expected=goal*frac;let pace=$('paceAlert');pace.className='signal';if(isReferenceDay(key)){pace.textContent='📋 Hoy es una jornada de observación: los intervalos se registran, pero no se evalúa el ritmo respecto a un objetivo.';}else if(key<db.settings.official){pace.textContent='El seguimiento comenzará el '+db.settings.official.split('-').reverse().join('/')+'.';}else if(nowRel<wake){pace.textContent='La jornada activa todavía no ha comenzado. El ritmo proporcional comienza a las '+db.settings.wake+'.'}else if(g<=expected+db.settings.weight*.5){pace.textContent=`🟢 Ritmo diario dentro del objetivo proporcional (${fmt(expected,2)} g hasta ahora).`}else if(g<=expected+db.settings.weight*2){pace.classList.add('amber');pace.textContent=`🟠 Vas algo por delante del ritmo previsto (${fmt(expected,2)} g).`}else{pace.classList.add('red');pace.textContent=`🔴 Vas por delante del ritmo previsto (${fmt(expected,2)} g). Antes del próximo, pregúntate si te apetece de verdad.`}
const baseline=comparisonBaseline();let reduction=baseline?(1-ev.length/baseline)*100:null;$('reduction').textContent=isReferenceDay(key)?'Día de referencia':key<db.settings.official?'Pendiente de inicio':!baseline?'Pendiente de referencia':key===today()?'Se calcula al cierre':(reduction>=0?'−':'+')+fmt(Math.abs(reduction),0)+' %';$('motivation').textContent=isReferenceDay(key)?'Hoy solo medimos tu consumo habitual. Registra todo sin intentar alcanzar una cifra: mañana empezarán las reducciones.':key<db.settings.official?'Mañana comienza tu primera jornada. Lo importante será registrar sin juzgarte.':!baseline?'Primero necesitamos cerrar la jornada de referencia para calcular las reducciones.':ev.length===0?'Cada cigarrillo que decides no encender cuenta.':elapsed<30?'No necesitas recuperar nada. Puedes decidir esperar antes del siguiente.':pct>=90?'Estás cerca de tu objetivo diario. El próximo cigarrillo es una decisión, no una obligación.':elapsed>=60?'Has conseguido espaciar el consumo. ¡Eso también es progreso!':'Puedes dar un margen mayor entre cigarrillos.';
let badges=awards();$('badgeCount').textContent=badges.length+' medallas';$('badgeLatest').textContent=badges.length?`${badges.at(-1).emoji} ${badges.at(-1).title} · ${badges.at(-1).day}`:'Tus primeros reconocimientos aparecerán aquí.';
const off=key<db.settings.official;$('smoke').disabled=off;$('retro').disabled=off;$('undo').disabled=off;$('smoke').textContent=off?'COMENZAMOS EL '+db.settings.official.split('-').reverse().join('/'):'＋ HE FUMADO UN CIGARRILLO';
}
function listRow(left,right,action){let div=document.createElement('div');div.className='entry';let span=document.createElement('span');span.textContent=left;div.appendChild(span);if(right){let small=document.createElement('small');small.textContent=right;span.appendChild(small)}if(action){let b=document.createElement('button');b.textContent=action.label;b.onclick=action.click;div.appendChild(b)}return div}
function renderHistory(){
 const t=today(),closed=[];
 for(let d=adjDay(t,-30);d<t;d=adjDay(d,1))if(afterStart(d))closed.push({day:d,ev:eventsFor(d)});
 // Días naturales cerrados desde el inicio oficial: incluidos los de cero cigarrillos.
 const avg=(n,id,detail)=>{const days=closed.slice(-n);$(id).textContent=(days.length?fmt(days.reduce((x,d)=>x+d.ev.length,0)/days.length,1):'—')+' cig./día';$(detail).textContent=days.length?`Calculada sobre ${days.length} ${days.length===1?'jornada cerrada':'jornadas cerradas'} (incluye días sin registros).`:'Aún no hay jornadas cerradas.';};
 avg(7,'avg7','avg7Detail');avg(30,'avg30','avg30Detail');
 const chart=$('chart');chart.replaceChildren();const view=closed.slice(-13).concat(afterStart(t)?[{day:t,ev:eventsFor(t),open:true}]:[]);
 const weight=db.settings.weight||.5,limit=Math.max(1,...view.map(d=>d.ev.length),...view.map(d=>Math.ceil(dayGoal(d.day)/weight)));
 const yMax=Math.max(2,Math.ceil(limit*1.1));$('chartScale').textContent=`Escala: 0–${yMax} cigarrillos · línea discontinua = objetivo (excepto referencia) · azul = jornada en curso · gris = referencia`;
 view.forEach(d=>{let wrap=document.createElement('div');wrap.className='barwrap';let plot=document.createElement('div');plot.className='barplot';const target=isReferenceDay(d.day)?0:Math.max(0,dayGoal(d.day)/weight);let targetLine=document.createElement('div');targetLine.className='targetline';targetLine.style.bottom=(Math.min(1,target/yMax)*100)+'%';if(!isReferenceDay(d.day))plot.append(targetLine);
 let bar=document.createElement('div');bar.className='bar'+(d.open?' current':'')+(isReferenceDay(d.day)?' reference':'');bar.style.height=(d.ev.length/yMax*100)+'%';bar.setAttribute('aria-label',`${d.day}: ${d.ev.length} cigarrillos; ${isReferenceDay(d.day)?'día de referencia':'objetivo '+fmt(target,1)+' cigarrillos'}${d.open?', jornada abierta':''}`);bar.title=bar.getAttribute('aria-label');plot.append(bar);
 let label=document.createElement('small');label.textContent=d.day.slice(8)+(d.open?'*':'');wrap.append(plot,label);chart.append(wrap)});
 if(!view.length)chart.textContent='El gráfico aparecerá cuando comience la primera jornada.';
 const rows=$('dayRows');rows.replaceChildren();for(let d=adjDay(t,-6);d<=t;d=adjDay(d,1)){if(!afterStart(d))continue;const e=eventsFor(d);rows.append(listRow(`${d} · ${e.length} cig. · ${fmt(grams(e),2)} g${isReferenceDay(d)?' · REFERENCIA':''}${d===t?' · En curso':''}`,`${violations(e)} intervalos inferiores a 60 min · Media: ${meanInterval(e)??'—'} min`,{label:'VER',click:()=>{selectedDay=d;$('dayPick').value=d;renderSelected()}}))}
 if(!selectedDay||selectedDay>t||selectedDay<db.settings.official)selectedDay=t;$('dayPick').min=db.settings.official;$('dayPick').max=t;$('dayPick').value=selectedDay;renderSelected();const a=awards();$('badges').replaceChildren();if(!a.length)$('badges').textContent='Aún no hay medallas registradas.';else a.slice(-70).reverse().forEach(x=>$('badges').append(listRow(x.emoji+' '+x.title,x.day)));
}
function renderSelected(){let key=selectedDay||today(),ev=eventsFor(key);const el=$('eventRows');el.replaceChildren();if(!ev.length){el.textContent='No hay cigarrillos registrados esta jornada.';return}for(let e of ev)el.append(listRow(clock(e.at)+' · '+fmt(e.weight,2)+' g','Registro del '+stamp(e.at),{label:'ELIMINAR',click:async()=>{if(await ask('Eliminar registro','¿Eliminar este cigarrillo? También se recalcularán los intervalos.')===true){db.events=db.events.filter(x=>x.id!==e.id);save();renderAll()}}}));}
const stockTotal=()=>db.stockEvents.reduce((a,b)=>a+b.delta,0)-grams(db.events);
const packOpen=()=>db.packs.find(p=>p.opened&&!p.closed);
function renderStock(){const total=stockTotal(),unopened=db.packs.filter(p=>!p.opened).length,current=packOpen();$('stockGrams').textContent=(total < -0.001?'⚠ ':'')+fmt(total,2)+' g';$('unopened').textContent=String(unopened);$('openPack').disabled=!unopened;$('packStats').textContent=current?`Paquete abierto: ${stamp(current.opened)}. Duración hasta hoy: ${fmt((Date.now()-current.opened)/86400000,1)} días.`:'No hay paquete abierto registrado.';
const se=$('stockEvents');se.replaceChildren();[...db.stockEvents].sort((a,b)=>b.at-a.at).slice(0,20).forEach(s=>se.append(listRow(`${s.type} · ${s.delta>=0?'+':''}${fmt(s.delta,2)} g`,stamp(s.at))));const history=$('packHistory');history.replaceChildren();const closed=db.packs.filter(p=>p.opened&&p.closed).sort((a,b)=>b.closed-a.closed);closed.slice(0,10).forEach(p=>history.append(listRow(`${fmt((p.closed-p.opened)/86400000,1)} días`,`${stamp(p.opened)} → ${stamp(p.closed)}`)));if(closed.length)history.prepend(listRow('Media últimos 5 paquetes',fmt(closed.slice(0,5).reduce((s,p)=>s+(p.closed-p.opened)/86400000,0)/Math.min(5,closed.length),1)+' días'));if(!closed.length)history.textContent='La duración real se calculará al estrenar un nuevo paquete.';}
function renderSettings(){const s=db.settings;for(const k of ['goal','weight','wake','rollover','baseline','official'])$(k).value=s[k];$('referenceInfo').textContent=db.referenceDay===today()?'22/10/2026 · Jornada de referencia en curso. Sin premios ni objetivo de reducción. Los cambios del objetivo se guardan hoy mismo, aunque la referencia no se evalúa.':comparisonBaseline()!==null?`Referencia real del ${db.referenceDay}: ${referenceCount()} cigarrillos (${fmt(grams(eventsFor(db.referenceDay)),2)} g). Las reducciones posteriores se comparan con este dato.`:`Jornada de referencia: ${db.referenceDay}. Aún no se ha cerrado con registros; no se conceden medallas por reducción.`;}
function renderAll(){renderToday();if(active==='history')renderHistory();if(active==='stock')renderStock();if(active==='settings')renderSettings();}
function tab(t){active=t;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==t);renderAll();}
async function addCig(at,retro=false){if(!db.initialWeighingDone){await onboarding();if(!db.initialWeighingDone){notify('Antes de registrar, confirma el pesaje inicial en COMPRAS.');return;}}if(!Number.isFinite(at)||dayKey(at)<db.settings.official){notify('El seguimiento comienza el '+db.settings.official.split('-').reverse().join('/')+'. No se registran cigarrillos anteriores.');return;}if(at>Date.now()+MS){notify('No se permiten registros futuros.');return;}if(db.events.some(e=>Math.abs(e.at-at)<15000)){notify('Ya existe un registro a esta hora.');return;}const all=sorted(),prev=[...all].reverse().find(e=>e.at<at),next=all.find(e=>e.at>at);let iv=prev?(at-prev.at)/MS:null;let following=next?(next.at-at)/MS:null;
if((iv!==null&&iv<60)||(following!==null&&following<60)){let n=iv!==null&&iv<60?Math.max(0,Math.floor(iv)):Math.max(0,Math.floor(following));let msg=iv!==null&&iv<60?`Han pasado solo ${n} ${n===1?'minuto':'minutos'} desde el anterior.`:`Quedarían solo ${n} ${n===1?'minuto':'minutos'} hasta el siguiente registrado.`;let res=await ask('⚠ Intervalo corto',msg+' ¿Registrarlo igualmente?',{ok:'REGISTRAR',cancel:'ESPERAR'});if(!res)return;}
const k=dayKey(at);if(!(k in db.goalHistory))db.goalHistory[k]=db.settings.goal;db.events.push(newEvent(at));if(!retro&&k===today())db.trackedDays[k]=true;save();renderAll();notify('Cigarrillo registrado.');}
$('smoke').onclick=()=>addCig(Date.now());$('undo').onclick=async()=>{let e=sorted().at(-1);if(!e){notify('No hay cigarrillos registrados.');return}if(dayKey(e.at)!==today()){notify('El último registro pertenece a otra jornada. Elimínalo desde HISTORIAL.');return}if(await ask('Deshacer último',`¿Eliminar el cigarrillo de las ${stamp(e.at)}?`)===true){db.events=db.events.filter(x=>x.id!==e.id);save();renderAll();notify('Registro deshecho.')}};
$('retro').onclick=async()=>{const key=today(),date=key;let val=await ask('Registrar cigarrillo olvidado','Introduce fecha y hora reales (formato AAAA-MM-DDTHH:MM).',{label:'Fecha y hora',type:'datetime-local',value:`${date}T12:00`});if(!val)return;const at=new Date(val).getTime();if(!Number.isFinite(at)){notify('Fecha no válida.');return}await addCig(at,true)};
$('dayPick').onchange=e=>{selectedDay=e.target.value;renderSelected()};$('resetDay').onclick=async()=>{const key=selectedDay||today();let count=eventsFor(key).length;if(!count){notify('Esta jornada no contiene registros.');return}if(await ask('BORRAR REGISTROS',`Se eliminarán los ${count} registros del ${key}, sin posibilidad de recuperarlos salvo mediante copia de seguridad. ¿Confirmas?`,{ok:'BORRAR'})){db.events=db.events.filter(e=>dayKey(e.at)!==key);save();renderAll();notify('Jornada vaciada.')}};
$('buy').onclick=async()=>{if(await ask('Comprar paquete','Añadir 30 g al inventario y un paquete sin abrir. ¿Confirmas?')){let at=Date.now();db.packs.push({id:uid(),bought:at,opened:null,closed:null});db.stockEvents.push({id:uid(),at,type:'Compra de paquete',delta:30});save();renderAll();notify('Paquete comprado: +30 g.')}};
$('openPack').onclick=async()=>{if(!db.packs.some(p=>!p.opened)){notify('No tienes paquetes sin abrir registrados.');return}if(await ask('Estrenar paquete','Se cerrará el paquete abierto (si existe) y se abrirá uno comprado. No se sumarán otros 30 g. ¿Confirmas?')){const at=Date.now();let current=packOpen();if(current)current.closed=at;db.packs.find(p=>!p.opened).opened=at;save();renderAll();notify('Paquete nuevo abierto.')}};
$('adjust').onclick=async()=>{const v=await ask('Ajustar existencias','Introduce el peso REAL TOTAL de tabaco disponible, incluido el de paquetes sin abrir, sin envoltorios.',{label:'Gramos totales',value:fmt(Math.max(0,stockTotal()),2)});if(v===null)return;let n=Number(v.replace(',','.'));if(!Number.isFinite(n)||n<0||n>10000){notify('Introduce un peso válido.');return}if(await ask('Confirmar ajuste',`Existencias actuales: ${fmt(stockTotal(),2)} g. Nuevo total: ${fmt(n,2)} g. ¿Guardar?`)){db.stockEvents.push({id:uid(),at:Date.now(),type:'Ajuste de inventario',delta:n-stockTotal()});if(!db.initialWeighingDone&&db.events.length===0){db.initialWeighingDone=true;}save();renderAll();notify('Inventario ajustado.')}};
$('initialPack').onclick=async()=>{let v=await ask('Paquete abierto hoy','Introduce la fecha y hora aproximadas de apertura de tu paquete actual. No se añadirán gramos automáticamente.',{label:'Fecha y hora',type:'datetime-local',value:'2026-10-21T12:00'});if(!v)return;let at=new Date(v).getTime();if(!Number.isFinite(at)||at>Date.now()){notify('La fecha de apertura debe ser pasada.');return}let current=packOpen();if(current){if(!await ask('Modificar apertura','Ya hay un paquete abierto. ¿Cambiar su fecha de apertura?'))return;current.opened=at;}else db.packs.push({id:uid(),bought:at,opened:at,closed:null,initial:true});save();renderAll();notify('Fecha de apertura guardada. Mañana pesaremos lo que queda.');};
$('saveSettings').onclick=async()=>{const goal=Number($('goal').value),weight=Number($('weight').value),baseline=Number($('baseline').value),wake=$('wake').value,rollover=$('rollover').value,official=$('official').value;
if(!(goal>=.5&&goal<=30&&weight>=.1&&weight<=2&&Number.isInteger(baseline)&&baseline>=1&&baseline<=100&&/^\d\d:\d\d$/.test(wake)&&/^\d\d:\d\d$/.test(rollover)&&/^\d{4}-\d{2}-\d{2}$/.test(official))){notify('Revisa los valores de configuración.');return}if(db.events.length&&(rollover!==db.settings.rollover||official!==db.settings.official)){notify('No se puede cambiar la hora de cierre ni el inicio oficial tras registrar consumo: alteraría el historial.');return}const k=today();db.settings={goal,weight,baseline,wake,rollover,official};if(k>=official){db.goalHistory[k]=goal;}save();renderAll();notify(isReferenceDay(k)?'Configuración guardada: '+fmt(goal,2)+' g para las siguientes jornadas. Hoy continúa siendo día de referencia, sin objetivo de reducción.':'Objetivo actualizado AHORA a '+fmt(goal,2)+' g para la jornada actual. Las jornadas cerradas mantienen su objetivo histórico.');};
$('export').onclick=()=>{let payload=JSON.stringify(db,null,2),blob=new Blob([payload],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='LIBERTAD67-copia-'+dayISO(new Date())+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);notify('Copia de seguridad preparada. Guárdala fuera del navegador.')};
$('import').onchange=async e=>{let f=e.target.files?.[0];if(!f)return;try{if(f.size>5e6)throw Error('Archivo demasiado grande');const incoming=JSON.parse(await f.text());if(incoming.version!==1||!Array.isArray(incoming.events)||!Array.isArray(incoming.stockEvents)||!Array.isArray(incoming.packs)||!incoming.settings||!/^\d{4}-\d{2}-\d{2}$/.test(incoming.settings.official))throw Error('Formato incompatible');if(await ask('IMPORTAR COPIA','Se sustituirán todos los datos actuales de LIBERTAD 67 por los del archivo. Haz antes una exportación si quieres conservarlos.',{ok:'IMPORTAR'})){db=incoming;db.goalHistory ||= {};
// Una jornada seguida en directo se distingue de una con registros solo retroactivos.
db.trackedDays ||= {};save();selectedDay=null;renderAll();notify('Copia importada correctamente.')}}catch(err){notify('Error al importar: '+err.message)}finally{e.target.value=''}};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
async function onboarding(){if(busy||today()<db.settings.official||db.initialWeighingDone)return;
if(db.stockEvents.some(e=>e.type==='Pesaje inicial')||(db.events.length===0&&db.stockEvents.some(e=>e.type==='Ajuste de inventario'))){db.initialWeighingDone=true;save();return;}
busy=true;
const v=await ask('⚖ PRIMER DÍA · PESAR TABACO','Antes de liar el primer cigarrillo, pesa el tabaco que te queda del paquete abierto, sin el envoltorio. Lo registraremos como existencias iniciales.',{label:'Peso de tabaco restante (g)',type:'number',min:'0',max:'30',step:'0.01',value:'' ,ok:'GUARDAR PESO'});if(v===null){busy=false;notify('Pendiente: pesa el tabaco desde COMPRAS → AJUSTAR EXISTENCIAS.');return}let weight=Number(v.replace(',','.'));if(!Number.isFinite(weight)||weight<0||weight>30){busy=false;notify('El peso del paquete abierto debe estar entre 0 y 30 gramos.');return}let delta=weight-stockTotal();db.stockEvents.push({id:uid(),at:Date.now(),type:'Pesaje inicial',delta});db.initialWeighingDone=true;busy=false;save();renderAll();notify('Inventario inicial: '+fmt(weight,2)+' g. ¡Comienza LIBERTAD 67!');}
function syncDay(){
 const k=today();if(k<db.settings.official)return;
 let changed=false;
 if(!(k in db.goalHistory)){db.goalHistory[k]=db.settings.goal;changed=true;}
 if(db.lastSeenDay && db.lastSeenDay!==k && db.lastSeenDay>=db.settings.official && !(db.lastSeenDay in db.goalHistory)){db.goalHistory[db.lastSeenDay]=db.settings.goal;changed=true;}
 if(db.lastSeenDay!==k){db.lastSeenDay=k;changed=true;}
 if(changed)save();
}
function refresh(){syncDay();renderToday();if(active==='stock')renderStock();if(today()>=db.settings.official&&!db.initialWeighingDone&&document.visibilityState==='visible'&&!$('dialog').open)onboarding()}
syncDay();renderAll();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});window.addEventListener('focus',refresh);setInterval(()=>{if(document.visibilityState==='visible'){if(db.lastSeenDay!==today())refresh();else renderToday()}},30000);setTimeout(onboarding,700);
})();
