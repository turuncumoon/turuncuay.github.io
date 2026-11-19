(() => {
  'use strict';
  const DATA_URLS = [
    'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json',
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
  ];
  const IMAGE_BASES = [
    'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/',
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
  ];
  const STORE = 'forge_workout_v3';
  const $ = id => document.getElementById(id);
  const state = { all: [], filtered: [], selected: [], favorites: [], level: '', search: '', muscle: '', equipment: '', onlyFavorites: false, currentModal: null, stageTimer: null, timer: 60, timerInterval: null };

  const trMap = { abdominals:'Karın', abductors:'Kalça dışı', adductors:'İç bacak', biceps:'Biceps', calves:'Baldır', chest:'Göğüs', forearms:'Ön kol', glutes:'Kalça', hamstrings:'Arka bacak', lats:'Kanat', lower_back:'Bel', middle_back:'Sırt', neck:'Boyun', quadriceps:'Ön bacak', shoulders:'Omuz', traps:'Trapez', triceps:'Triceps', cardio:'Kardiyo', strength:'Kuvvet', stretching:'Esneme', 'body only':'Vücut ağırlığı', body_only:'Vücut ağırlığı', dumbbell:'Dambıl', barbell:'Barbell', cable:'Kablo', machine:'Makine', kettlebells:'Kettlebell', bands:'Direnç bandı', beginner:'Başlangıç', intermediate:'Orta', expert:'İleri', other:'Diğer' };
  const tr = v => trMap[String(v || '').toLowerCase()] || String(v || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const muscles = e => (e.primaryMuscles || []).map(tr).join(', ') || tr(e.category || 'Fitness');
  function imageUrl(e, i, base = 0) { const p = e.images?.[i] || e.images?.[0]; return p ? IMAGE_BASES[base] + p.split('/').map(encodeURIComponent).join('/') : ''; }
  function imageTag(e, i = 0, cls = '') { const a = imageUrl(e,i,0), b = imageUrl(e,i,1); if (!a) return '<div class="stage-empty">FORGE</div>'; return `<img class="${cls}" src="${esc(a)}" data-fallback="${esc(b)}" alt="${esc(e.name)}" loading="lazy" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}else{this.style.display='none';this.parentElement.classList.add('no-image')}"/>`; }
  function notify(msg) { const el=$('toast'); if(!el) return; el.textContent=msg; el.classList.add('show'); clearTimeout(notify.t); notify.t=setTimeout(()=>el.classList.remove('show'),2400); }

  const OFFLINE = [
    ['Şınav','chest','beginner','body only'],['Bench Press','chest','beginner','barbell'],['Dambıl Bench Press','chest','beginner','dumbbell'],['Incline Dambıl Press','chest','intermediate','dumbbell'],['Pull-Up','lats','intermediate','body only'],['Lat Pulldown','lats','beginner','machine'],['Barbell Row','middle_back','intermediate','barbell'],['Seated Cable Row','middle_back','beginner','cable'],['Deadlift','hamstrings','intermediate','barbell'],['Squat','quadriceps','beginner','body only'],['Goblet Squat','quadriceps','beginner','dumbbell'],['Lunge','quadriceps','beginner','body only'],['Leg Press','quadriceps','beginner','machine'],['Romanian Deadlift','hamstrings','intermediate','barbell'],['Calf Raise','calves','beginner','body only'],['Shoulder Press','shoulders','beginner','dumbbell'],['Lateral Raise','shoulders','beginner','dumbbell'],['Biceps Curl','biceps','beginner','dumbbell'],['Hammer Curl','biceps','beginner','dumbbell'],['Triceps Pushdown','triceps','beginner','cable'],['Plank','abdominals','beginner','body only'],['Crunch','abdominals','beginner','body only'],['Mountain Climbers','abdominals','beginner','body only'],['Jumping Jacks','cardio','beginner','body only'],['Burpee','cardio','intermediate','body only'],['Glute Bridge','glutes','beginner','body only'],['Hip Thrust','glutes','intermediate','barbell']
  ].map((x,i)=>({id:'local-'+i,name:x[0],primaryMuscles:[x[1]],level:x[2],equipment:x[3],category:'strength',instructions:['Başlangıç pozisyonunu kontrollü şekilde al.','Hareketi kontrollü uygula, nefesini düzenli tut.','Başlangıç pozisyonuna dön ve tekrar et.'],images:[]}));

  async function getJSON(url) {
    const ctrl = new AbortController(), t=setTimeout(()=>ctrl.abort(),10000);
    try { const r=await fetch(url,{signal:ctrl.signal,mode:'cors'}); if(!r.ok) throw Error('HTTP '+r.status); const d=await r.json(); if(!Array.isArray(d)||!d.length) throw Error('Geçersiz veri'); return d; }
    finally { clearTimeout(t); }
  }
  async function loadExercises() {
    $('exerciseGrid').innerHTML='<div class="loading"><div class="loader"></div>Egzersizler yükleniyor...</div>';
    $('sourceStatus').textContent='Kaynak deneniyor'; let data=null;
    for(const url of DATA_URLS){ try { data=await getJSON(url); break; } catch(err){ console.warn('Egzersiz kaynağı:',url,err); } }
    state.all=data || OFFLINE;
    $('sourceStatus').textContent=data?'Canlı egzersiz kütüphanesi':'Çevrimdışı temel katalog';
    $('sourceStatus').parentElement.querySelector('.source-dot').style.background=data?'#25a77d':'#e6a23c';
    $('libraryCount').textContent=state.all.length.toLocaleString('tr-TR');
    populateFilters(); loadSaved(); applyFilters();
    if(!data) $('resultCount').textContent='Yerel katalog · 27 hareket';
  }
  function populateFilters(){
    const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y)));
    $('muscleFilter').innerHTML='<option value="">Tüm kas grupları</option>'+uniq(state.all.flatMap(e=>e.primaryMuscles||[])).map(v=>`<option value="${esc(v)}">${esc(tr(v))}</option>`).join('');
    $('equipmentFilter').innerHTML='<option value="">Tüm ekipmanlar</option>'+uniq(state.all.map(e=>e.equipment)).map(v=>`<option value="${esc(v)}">${esc(tr(v))}</option>`).join('');
  }
  function applyFilters(){
    const q=state.search.toLocaleLowerCase('tr').trim();
    state.filtered=state.all.filter(e=>{
      const txt=[e.name,...(e.primaryMuscles||[]),...(e.secondaryMuscles||[]),e.equipment].join(' ').toLocaleLowerCase('tr');
      return (!q||txt.includes(q))&&(!state.muscle||(e.primaryMuscles||[]).includes(state.muscle))&&(!state.equipment||e.equipment===state.equipment)&&(!state.level||e.level===state.level)&&(!state.onlyFavorites||state.favorites.includes(e.id));
    }); renderExercises();
  }
  function renderExercises(){
    const arr=state.filtered.slice(0,90); $('resultCount').textContent=`${state.filtered.length.toLocaleString('tr-TR')} sonuç`;
    if(!arr.length){$('exerciseGrid').innerHTML='<div class="empty-state">Bu filtrelerle eşleşen hareket bulunamadı.</div>';return;}
    $('exerciseGrid').innerHTML=arr.map(e=>{
      const added=state.selected.some(x=>x.id===e.id), fav=state.favorites.includes(e.id), img=imageUrl(e,0,0)||imageUrl(e,0,1);
      return `<article class="exercise-card" data-detail="${esc(e.id)}"><div class="card-visual ${img?'':'no-image'}">${img?imageTag(e,0):''}<span class="level-tag">${esc(tr(e.level||e.category))}</span><button class="fav-btn ${fav?'is-fav':''}" data-fav="${esc(e.id)}" type="button" aria-label="Favori">${fav?'♥':'♡'}</button></div><div class="card-body"><div class="card-title">${esc(e.name)}</div><div class="card-meta">${esc(tr(e.equipment||'other'))} · ${esc((e.primaryMuscles||[]).map(tr).join(', '))}</div><div class="card-bottom"><span class="muscle-pill">${esc(muscles(e))}</span><button class="quick-add ${added?'added':''}" data-add="${esc(e.id)}" type="button">${added?'Eklendi':'＋ Ekle'}</button></div></div></article>`;
    }).join('');
    $('exerciseGrid').querySelectorAll('[data-detail]').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('button'))return;openModal(card.dataset.detail);}));
    $('exerciseGrid').querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();addExercise(b.dataset.add);}));
    $('exerciseGrid').querySelectorAll('[data-fav]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleFavorite(b.dataset.fav);}));
  }
  function toggleFavorite(id){state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];saveProgram(false);applyFilters();}
  function addExercise(id){if(state.selected.some(x=>x.id===id)){notify('Bu hareket zaten programında.');return;}state.selected.push({id,sets:3,reps:12,rest:60,done:false});renderWorkout();renderExercises();saveProgram(false);notify('Hareket programa eklendi.');}
  function renderWorkout(){
    const list=$('workoutList');
    if(!state.selected.length){list.innerHTML='<div class="plan-empty"><div class="empty-symbol">＋</div>Programın henüz boş.<br>Soldaki listeden hareket ekleyerek başla.</div>';updateStats();return;}
    list.innerHTML=state.selected.map(item=>{const e=state.all.find(x=>x.id===item.id);if(!e)return '';return `<div class="workout-item ${item.done?'completed':''}"><div class="workout-thumb">${imageUrl(e,0)?imageTag(e,0):''}</div><div class="workout-main"><div class="workout-item-name">${esc(e.name)}</div><div class="workout-item-muscle">${esc(muscles(e))}</div></div><div class="item-actions"><button class="icon-btn" data-up="${esc(item.id)}" title="Yukarı">↑</button><button class="icon-btn" data-down="${esc(item.id)}" title="Aşağı">↓</button><button class="icon-btn" data-remove="${esc(item.id)}" title="Sil">×</button></div><div class="item-config"><label><span class="mini-label">SET</span><br><input class="mini-field" type="number" min="1" max="20" value="${item.sets}" data-key="sets" data-id="${esc(item.id)}"></label><label><span class="mini-label">TEKRAR</span><br><input class="mini-field" type="number" min="1" max="100" value="${item.reps}" data-key="reps" data-id="${esc(item.id)}"></label><label><span class="mini-label">DİNLENME SN</span><br><input class="mini-field" type="number" min="1" max="600" value="${item.rest}" data-key="rest" data-id="${esc(item.id)}"></label><button class="done-btn ${item.done?'done':''}" data-done="${esc(item.id)}" type="button">${item.done?'✓ Tamamlandı':'Tamamla'}</button></div></div>`;}).join('');
    list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.selected=state.selected.filter(x=>x.id!==b.dataset.remove);renderWorkout();renderExercises();saveProgram(false);});
    list.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>move(b.dataset.up,-1));list.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>move(b.dataset.down,1));
    list.querySelectorAll('[data-key]').forEach(i=>i.onchange=()=>{const x=state.selected.find(v=>v.id===i.dataset.id);if(x){x[i.dataset.key]=Math.max(1,Number(i.value)||1);updateStats();saveProgram(false);}});
    list.querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>{const x=state.selected.find(v=>v.id===b.dataset.done);x.done=!x.done;renderWorkout();saveProgram(false);}); updateStats();
  }
  function move(id,d){const i=state.selected.findIndex(x=>x.id===id),j=i+d;if(j<0||j>=state.selected.length)return;[state.selected[i],state.selected[j]]=[state.selected[j],state.selected[i]];renderWorkout();saveProgram(false);}
  function updateStats(){const n=state.selected.length,sets=state.selected.reduce((a,x)=>a+Number(x.sets||0),0),done=state.selected.filter(x=>x.done).length,secs=state.selected.reduce((a,x)=>a+x.sets*(x.rest+x.reps*3),0);$('selectedCount').textContent=n;$('totalSets').textContent=sets;$('planSets').textContent=sets+' set';$('exerciseSummary').textContent=n+' hareket';$('duration').textContent='◷ '+Math.round(secs/60)+' dk';$('durationMetric').textContent=Math.round(secs/60)+' dk';$('progressText').textContent=`${done} / ${n} tamamlandı`;$('progressFill').style.width=(n?done/n*100:0)+'%';}
  function saveProgram(show=true){try{localStorage.setItem(STORE,JSON.stringify({name:$('programName').value,selected:state.selected,favorites:state.favorites}));if(show)notify('Program kaydedildi.');}catch(e){if(show)notify('Tarayıcı kaydı kullanılamıyor.');}}
  function loadSaved(){try{const d=JSON.parse(localStorage.getItem(STORE)||'null');if(!d)return;$('programName').value=d.name||'Yeni Antrenman Programı';state.selected=(d.selected||[]).filter(x=>state.all.some(e=>e.id===x.id));state.favorites=d.favorites||[];renderWorkout();}catch(e){console.warn(e);}}
  function openModal(id){const e=state.all.find(x=>x.id===id);if(!e)return;state.currentModal=e;$('modalTitle').textContent=e.name;$('modalMeta').textContent=muscles(e)+' · '+tr(e.equipment||'other');$('modalTags').innerHTML=[tr(e.level||'beginner'),tr(e.category||'strength'),...(e.secondaryMuscles||[]).map(tr)].map(x=>`<span class="modal-tag">${esc(x)}</span>`).join('');const ins=e.instructions||[];$('modalInstructions').innerHTML=(ins.length?ins:['Başlangıç pozisyonunu al ve gövdeni dengede tut.','Hareketi kontrollü şekilde uygula; ani ve savrularak hareket etmekten kaçın.','Nefesini düzenli tutarak başlangıç pozisyonuna dön.']).map(x=>`<li>${esc(x)}</li>`).join('');$('modalCredit').textContent=e.images?.length?'Görseller: Free Exercise DB · İki hareket karesi otomatik geçişle gösterilir.':'Bu harekete ait görsel bulunamadı; açıklama ve teknik ipuçları kullanılabilir.';const a=imageUrl(e,0,0)||imageUrl(e,0,1),b=imageUrl(e,1,0)||imageUrl(e,1,1);$('stageView').innerHTML=a?`${imageTag(e,0,'stage-one')}${b?`<img class="stage-two" src="${esc(b)}" alt="${esc(e.name)} hareketin ikinci aşaması" onerror="this.style.display='none'">`:''}`:'<div class="stage-empty">Görsel mevcut değil</div>';$('stageCaption').textContent=b?'Başlangıç ve bitiş pozisyonları arasında animasyonlu önizleme':'Bu hareket için kaynakta görsel bulunmuyor.';$('exerciseModal').classList.add('open');document.body.style.overflow='hidden';clearInterval(state.stageTimer);state.stageTimer=null;$('stageAuto').classList.add('active');$('stageFirst').classList.remove('active');$('stageSecond').classList.remove('active');$('modalAdd').onclick=()=>addExercise(id);}
  function closeModal(){$('exerciseModal').classList.remove('open');document.body.style.overflow='';clearInterval(state.stageTimer);state.stageTimer=null;}
  function showStage(which){const imgs=$('stageView').querySelectorAll('img');imgs.forEach((im,i)=>im.style.opacity=(which==='first'?i===0:which==='second'?i===1:i===0?1:0));$('stageFirst').classList.toggle('active',which==='first');$('stageSecond').classList.toggle('active',which==='second');$('stageAuto').classList.toggle('active',which==='auto');}
  function formatTime(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function updateTimer(){ $('timerValue').textContent=formatTime(state.timer); }
  function timerStart(){if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;$('timerStart').textContent='Başlat';return;}if(state.timer<=0)state.timer=60;$('timerStart').textContent='Durdur';state.timerInterval=setInterval(()=>{state.timer--;updateTimer();if(state.timer<=0){clearInterval(state.timerInterval);state.timerInterval=null;$('timerStart').textContent='Başlat';notify('Dinlenme süresi tamamlandı!');}},1000);}

  $('searchInput').addEventListener('input',e=>{state.search=e.target.value;applyFilters();});$('muscleFilter').addEventListener('change',e=>{state.muscle=e.target.value;applyFilters();});$('equipmentFilter').addEventListener('change',e=>{state.equipment=e.target.value;applyFilters();});
  $('levelChips').querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>{state.level=b.dataset.level;state.onlyFavorites=false;$('levelChips').querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===b));$('allViewBtn').classList.toggle('active',!state.onlyFavorites);$('favoritesViewBtn').classList.remove('active');applyFilters();}));
  function favoritesView(){state.onlyFavorites=true;$('allViewBtn').classList.remove('active');$('favoritesViewBtn').classList.add('active');$('favoritesChip').classList.add('active');applyFilters();}
  function allView(){state.onlyFavorites=false;$('allViewBtn').classList.add('active');$('favoritesViewBtn').classList.remove('active');$('favoritesChip').classList.remove('active');applyFilters();}
  $('favoritesChip').onclick=favoritesView;$('favoritesViewBtn').onclick=favoritesView;$('allViewBtn').onclick=allView;$('navFavorites').onclick=favoritesView;$('navPrint').onclick=()=>window.print();
  document.querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>$(b.dataset.scroll).scrollIntoView({behavior:'smooth'}));
  $('modalClose').onclick=closeModal;$('exerciseModal').addEventListener('click',e=>{if(e.target===$('exerciseModal'))closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  $('stageAuto').onclick=()=>{showStage('auto');clearInterval(state.stageTimer);let second=false;state.stageTimer=setInterval(()=>{second=!second;showStage(second?'second':'first');$('stageAuto').classList.add('active');},1600);};$('stageFirst').onclick=()=>{clearInterval(state.stageTimer);state.stageTimer=null;showStage('first');};$('stageSecond').onclick=()=>{clearInterval(state.stageTimer);state.stageTimer=null;showStage('second');};
  $('timerStart').onclick=timerStart;$('timerReset').onclick=()=>{clearInterval(state.timerInterval);state.timerInterval=null;state.timer=60;updateTimer();$('timerStart').textContent='Başlat';};
  $('saveBtn').onclick=()=>saveProgram(true);$('printBtn').onclick=()=>window.print();$('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({name:$('programName').value,selected:state.selected,favorites:state.favorites},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='forge-antrenman-programi.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
  $('clearBtn').onclick=()=>{if(!confirm('Programındaki tüm hareketler silinsin mi?'))return;state.selected=[];renderWorkout();saveProgram(false);notify('Program temizlendi.');};$('programName').onchange=()=>saveProgram(false);
  $('todayLabel').textContent=new Intl.DateTimeFormat('tr-TR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  updateTimer();loadExercises();
})();
