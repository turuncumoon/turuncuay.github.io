(() => {
  "use strict";

  // Primary CDN + official GitHub raw fallback.
  const DATA_URLS = [
    "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json",
    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
  ];
  const IMAGE_BASES = [
    "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/",
    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
  ];
  const STORAGE_KEY = "forge_workout_v1";
  const REQUEST_TIMEOUT = 12000;
  const PAGE_SIZE = 90;

  // Local emergency catalogue: the app remains usable even when the host
  // blocks external JSON/CDN requests. Exercise records are based on the
  // Unlicense Free Exercise DB vocabulary; image URLs are optional.
  const OFFLINE_EXERCISES = [
    ["Push-Up","Göğüs","beginner","body only","Push-Up"],
    ["Bench Press","Göğüs","beginner","barbell","Barbell_Bench_Press"],
    ["Dumbbell Bench Press","Göğüs","beginner","dumbbell","Dumbbell_Bench_Press"],
    ["Incline Dumbbell Press","Göğüs","intermediate","dumbbell","Incline_Dumbbell_Press"],
    ["Chest Dip","Göğüs","intermediate","body only","Chest_Dip"],
    ["Pull-Up","Kanat","intermediate","body only","Pull-Up"],
    ["Lat Pulldown","Kanat","beginner","machine","Lat_Pulldown"],
    ["Bent Over Barbell Row","Sırt","intermediate","barbell","Bent_Over_Barbell_Row"],
    ["Seated Cable Row","Sırt","beginner","cable","Seated_Cable_Rows"],
    ["Deadlift","Arka bacak","intermediate","barbell","Barbell_Deadlift"],
    ["Barbell Squat","Ön bacak","intermediate","barbell","Barbell_Squat"],
    ["Goblet Squat","Ön bacak","beginner","dumbbell","Goblet_Squat"],
    ["Walking Lunge","Ön bacak","beginner","body only","Bodyweight_Walking_Lunge"],
    ["Leg Press","Ön bacak","beginner","machine","Leg_Press"],
    ["Romanian Deadlift","Arka bacak","intermediate","barbell","Romanian_Deadlift"],
    ["Standing Calf Raises","Baldır","beginner","body only","Standing_Calf_Raises"],
    ["Dumbbell Shoulder Press","Omuz","beginner","dumbbell","Dumbbell_Shoulder_Press"],
    ["Lateral Raise","Omuz","beginner","dumbbell","Side_Lateral_Raise"],
    ["Barbell Biceps Curl","Biceps","beginner","barbell","Barbell_Curl"],
    ["Hammer Curl","Biceps","beginner","dumbbell","Hammer_Curls"],
    ["Triceps Pushdown","Triceps","beginner","cable","Triceps_Pushdown"],
    ["Overhead Triceps Extension","Triceps","beginner","dumbbell","Standing_Dumbbell_Triceps_Extension"],
    ["Plank","Karın","beginner","body only","Plank"],
    ["Crunch","Karın","beginner","body only","Crunch"],
    ["Air Bike","Karın","beginner","body only","Air_Bike"],
    ["Mountain Climbers","Karın","beginner","body only","Mountain_Climbers"],
    ["Jumping Jacks","Kardiyo","beginner","body only","Jumping_Jacks"],
    ["Burpee","Kardiyo","intermediate","body only","Burpee"],
    ["Glute Bridge","Kalça","beginner","body only","Glute_Bridge"],
    ["Hip Thrust","Kalça","intermediate","barbell","Barbell_Hip_Thrust"]
  ].map(([name, muscle, level, equipment, folder], index) => ({
    id: `forge-offline-${index + 1}`,
    name,
    level,
    equipment,
    primaryMuscles: [muscle],
    secondaryMuscles: [],
    category: "strength",
    instructions: [],
    images: [`${folder}/0.jpg`, `${folder}/1.jpg`]
  }));

  const $ = id => document.getElementById(id);
  const state = {
    all: [], filtered: [], selected: [], level: "", search: "", muscle: "", equipment: ""
  };

  const translations = {
    abdominals:"Karın", abductors:"Kalça dışı", adductors:"İç bacak", biceps:"Biceps", calves:"Baldır",
    chest:"Göğüs", forearms:"Ön kol", glutes:"Kalça", hamstrings:"Arka bacak", lats:"Kanat",
    lower_back:"Bel", middle_back:"Sırt", neck:"Boyun", quadriceps:"Ön bacak", shoulders:"Omuz",
    traps:"Trapez", triceps:"Triceps", cardio:"Kardiyo", strength:"Kuvvet", stretching:"Esneme",
    body_only:"Vücut ağırlığı", dumbbell:"Dambıl", barbell:"Barbell", cable:"Kablo", machine:"Makine",
    kettlebells:"Kettlebell", bands:"Direnç bandı", exercise_ball:"Egzersiz topu", foam_roll:"Foam roller",
    e_z_curl_bar:"EZ bar", other:"Diğer", beginner:"Başlangıç", intermediate:"Orta", expert:"İleri",
    pull:"Çekiş", push:"İtiş", plyometrics:"Pliometrik", powerlifting:"Powerlifting",
    olympic_weightlifting:"Olimpik halter"
  };

  function translate(value = "") {
    const key = String(value).toLowerCase().replaceAll(" ", "_");
    return translations[key] || String(value).replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[c]);
  }

  function imagePath(exercise, index = 0) {
    const path = exercise.images?.[index] || exercise.images?.[0];
    return path ? path.split("/").map(encodeURIComponent).join("/") : "";
  }

  function imageHTML(exercise, className = "", alt = "") {
    const path = imagePath(exercise);
    if (!path) return '<span class="img-fallback">F</span>';
    const primary = IMAGE_BASES[0] + path;
    const fallback = IMAGE_BASES[1] + path;
    return `<img class="${className}" loading="lazy" src="${escapeHTML(primary)}" data-fallback="${escapeHTML(fallback)}" alt="${escapeHTML(alt)}" onerror="if(this.dataset.fallback){this.onerror=null;this.src=this.dataset.fallback}else{this.style.display='none';this.parentElement.classList.add('no-image')}">`;
  }

  function muscles(exercise) {
    return (exercise.primaryMuscles || []).map(translate).join(", ") || translate(exercise.category || "fitness");
  }

  function toast(message) {
    const element = $("toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2300);
  }

  async function fetchJSONWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "default",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("Beklenmeyen JSON biçimi");
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadExercises() {
    const grid = $("exerciseGrid");
    const resultCount = $("resultCount");
    grid.innerHTML = '<div class="loading"><div class="spinner"></div>Egzersizler yükleniyor...</div>';
    resultCount.textContent = "Kaynağa bağlanıyor...";

    let loadedData = null;
    const errors = [];

    for (const url of DATA_URLS) {
      try {
        loadedData = await fetchJSONWithTimeout(url);
        break;
      } catch (error) {
        console.warn("Egzersiz kaynağı denenemedi:", url, error);
        errors.push(error);
      }
    }

    if (!loadedData) {
      // Do not leave the user with an empty screen: show a local starter set.
      state.all = OFFLINE_EXERCISES;
      resultCount.textContent = "Çevrimdışı katalog";
      grid.insertAdjacentHTML("beforebegin", `
        <div class="notice" id="offlineNotice" style="padding:10px 14px;text-align:left;font-size:11px">
          Dış veri kaynaklarına erişilemedi. Şimdilik uygulama içindeki 30 temel hareket gösteriliyor; tam katalog için bağlantı gerekir.
          <button class="btn small" id="retryBtn" type="button" style="margin-left:8px">Tekrar dene</button>
        </div>`);
      $("retryBtn").addEventListener("click", () => {
        $("offlineNotice")?.remove();
        loadExercises();
      });
    } else {
      state.all = loadedData;
      $("offlineNotice")?.remove();
      resultCount.textContent = `${state.all.length.toLocaleString("tr-TR")} hareket`;
    }

    $("libraryCount").textContent = state.all.length.toLocaleString("tr-TR");
    populateFilters();
    loadSaved();
    applyFilters();
  }

  function populateFilters() {
    const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    const muscleValues = unique(state.all.flatMap(e => e.primaryMuscles || []));
    const equipmentValues = unique(state.all.map(e => e.equipment));
    $("muscleFilter").innerHTML = '<option value="">Tüm kas grupları</option>' + muscleValues.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(translate(v))}</option>`).join("");
    $("equipmentFilter").innerHTML = '<option value="">Tüm ekipmanlar</option>' + equipmentValues.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(translate(v))}</option>`).join("");
  }

  function applyFilters() {
    const query = state.search.trim().toLocaleLowerCase("tr");
    state.filtered = state.all.filter(e => {
      const searchable = [e.name, ...(e.primaryMuscles || []), ...(e.secondaryMuscles || []), e.equipment, e.category].join(" ").toLocaleLowerCase("tr");
      return (!query || searchable.includes(query)) &&
        (!state.muscle || (e.primaryMuscles || []).includes(state.muscle)) &&
        (!state.equipment || e.equipment === state.equipment) &&
        (!state.level || e.level === state.level);
    });
    renderExercises();
  }

  function renderExercises() {
    const exercises = state.filtered.slice(0, PAGE_SIZE);
    $("resultCount").textContent = `${state.filtered.length.toLocaleString("tr-TR")} sonuç`;
    if (!exercises.length) {
      $("exerciseGrid").innerHTML = '<div class="notice">Aramana uygun hareket bulunamadı. Filtreleri değiştirmeyi dene.</div>';
      return;
    }
    $("exerciseGrid").innerHTML = exercises.map(e => {
      const added = state.selected.some(x => x.id === e.id);
      return `<article class="exercise">
        <div class="exercise-img">${imageHTML(e, "", e.name)}<span class="tag">${escapeHTML(translate(e.level || e.category || "fitness"))}</span></div>
        <div class="exercise-info">
          <div class="exercise-name">${escapeHTML(e.name)}</div>
          <div class="exercise-meta">${escapeHTML(muscles(e))} · ${escapeHTML(translate(e.equipment || "other"))}</div>
          <button class="add-btn ${added ? "added" : ""}" data-add="${escapeHTML(e.id)}" type="button">${added ? "✓ Eklendi" : "+ Programa ekle"}</button>
        </div></article>`;
    }).join("");
    $("exerciseGrid").querySelectorAll("[data-add]").forEach(btn => btn.addEventListener("click", () => addExercise(btn.dataset.add)));
  }

  function addExercise(id) {
    const exercise = state.all.find(e => e.id === id);
    if (!exercise || state.selected.some(x => x.id === id)) return;
    state.selected.push({ id, sets: 3, reps: 12, rest: 60 });
    renderWorkout(); renderExercises(); saveProgram(false);
    toast("Hareket programa eklendi");
  }

  function removeExercise(id) {
    state.selected = state.selected.filter(x => x.id !== id);
    renderWorkout(); renderExercises(); saveProgram(false);
  }

  function updateItem(id, key, value) {
    const item = state.selected.find(x => x.id === id);
    if (!item) return;
    const limits = { sets: 20, reps: 100, rest: 600 };
    item[key] = Math.max(1, Math.min(limits[key] || 999, Number(value) || 1));
    updateStats(); saveProgram(false);
  }

  function moveItem(id, direction) {
    const i = state.selected.findIndex(x => x.id === id), j = i + direction;
    if (i < 0 || j < 0 || j >= state.selected.length) return;
    [state.selected[i], state.selected[j]] = [state.selected[j], state.selected[i]];
    renderWorkout(); saveProgram(false);
  }

  function renderWorkout() {
    const list = $("workoutList");
    if (!state.selected.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">＋</div>Henüz hareket eklemedin.<br>Soldaki kütüphaneden egzersiz seçerek programını oluşturmaya başla.</div>';
      updateStats(); return;
    }
    list.innerHTML = state.selected.map(item => {
      const e = state.all.find(x => x.id === item.id);
      if (!e) return "";
      return `<div class="workout-item">
        <div class="workout-thumb">${imageHTML(e, "", e.name)}</div>
        <div><div class="workout-item-name">${escapeHTML(e.name)}</div><div class="workout-item-muscle">${escapeHTML(muscles(e))}</div></div>
        <div class="item-actions">
          <button class="icon-btn" title="Yukarı taşı" data-up="${escapeHTML(item.id)}" type="button">↑</button>
          <button class="icon-btn" title="Aşağı taşı" data-down="${escapeHTML(item.id)}" type="button">↓</button>
          <button class="icon-btn" title="Kaldır" data-remove="${escapeHTML(item.id)}" type="button">×</button>
        </div>
        <div class="item-config">
          <label><span class="mini-label">SET</span><br><input class="mini-field" type="number" min="1" max="20" value="${item.sets}" data-key="sets" data-id="${escapeHTML(item.id)}"></label>
          <label><span class="mini-label">TEKRAR</span><br><input class="mini-field" type="number" min="1" max="100" value="${item.reps}" data-key="reps" data-id="${escapeHTML(item.id)}"></label>
          <label><span class="mini-label">DİNLENME (SN)</span><br><input class="mini-field" type="number" min="1" max="600" value="${item.rest}" data-key="rest" data-id="${escapeHTML(item.id)}"></label>
        </div></div>`;
    }).join("");

    list.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => removeExercise(b.dataset.remove)));
    list.querySelectorAll("[data-up]").forEach(b => b.addEventListener("click", () => moveItem(b.dataset.up, -1)));
    list.querySelectorAll("[data-down]").forEach(b => b.addEventListener("click", () => moveItem(b.dataset.down, 1)));
    list.querySelectorAll("[data-key]").forEach(input => input.addEventListener("change", () => updateItem(input.dataset.id, input.dataset.key, input.value)));
    updateStats();
  }

  function updateStats() {
    const count = state.selected.length;
    const sets = state.selected.reduce((sum, x) => sum + Number(x.sets || 0), 0);
    const seconds = state.selected.reduce((sum, x) => sum + Number(x.sets || 0) * Number(x.rest || 0) + Number(x.sets || 0) * Number(x.reps || 0) * 3, 0);
    $("selectedCount").textContent = count;
    $("totalSets").textContent = sets;
    $("duration").textContent = `⏱ ~${Math.max(0, Math.round(seconds / 60))} dk`;
    $("exerciseSummary").textContent = `${count} hareket`;
  }

  function saveProgram(showMessage = false) {
    try {
      const payload = { name: $("programName").value, selected: state.selected, savedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      if (showMessage) toast("Program bu tarayıcıya kaydedildi");
    } catch (error) {
      console.error("Program kaydedilemedi:", error);
      if (showMessage) toast("Tarayıcı kaydına izin verilmiyor");
    }
  }

  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      $("programName").value = saved.name || "Yeni Antrenman Programı";
      state.selected = (saved.selected || []).filter(x => state.all.some(e => e.id === x.id));
      renderWorkout();
    } catch (error) {
      console.warn("Kayıt okunamadı:", error);
    }
  }

  function exportProgram() {
    const data = {
      program: $("programName").value,
      createdAt: new Date().toISOString(),
      exercises: state.selected.map(item => {
        const e = state.all.find(x => x.id === item.id);
        return { name: e?.name, muscles: e?.primaryMuscles, equipment: e?.equipment, sets: item.sets, reps: item.reps, restSeconds: item.rest, image: e ? IMAGE_BASES[0] + imagePath(e) : "" };
      })
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "forge-antrenman-programi.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Program JSON olarak indirildi");
  }

  // UI events
  $("searchInput").addEventListener("input", e => { state.search = e.target.value; applyFilters(); });
  $("muscleFilter").addEventListener("change", e => { state.muscle = e.target.value; applyFilters(); });
  $("equipmentFilter").addEventListener("change", e => { state.equipment = e.target.value; applyFilters(); });
  $("levelChips").querySelectorAll("[data-level]").forEach(btn => btn.addEventListener("click", () => {
    state.level = btn.dataset.level;
    $("levelChips").querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x === btn));
    applyFilters();
  }));
  $("saveBtn").addEventListener("click", () => saveProgram(true));
  $("printBtn").addEventListener("click", () => window.print());
  $("exportBtn").addEventListener("click", exportProgram);
  $("clearBtn").addEventListener("click", () => {
    if (!confirm("Programındaki tüm hareketler silinsin mi?")) return;
    state.selected = [];
    $("programName").value = "Yeni Antrenman Programı";
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { console.warn(error); }
    renderWorkout(); renderExercises(); toast("Program sıfırlandı");
  });
  $("programName").addEventListener("change", () => saveProgram(false));

  loadExercises();
})();
