// ============================================================
//  FitProgram — Antrenman Oluşturucu
//  ExerciseDB V1 API (https://oss.exercisedb.dev) kullanır.
//  API anahtarı gerektirmez, 1500+ egzersiz ve GIF sunar.
// ============================================================

const API_URL = "https://oss.exercisedb.dev/api/v1/exercises";

// Uygulama durumu
let allExercises = [];          // API'den gelen tüm egzersizler
let filteredExercises = [];     // Filtrelenmiş egzersizler
let selectedExercises = [];     // Programa eklenen egzersizler

// DOM elemanları
const exerciseListEl = document.getElementById("exerciseList");
const errorContainerEl = document.getElementById("errorContainer");
const searchInput = document.getElementById("searchInput");
const bodyPartFilter = document.getElementById("bodyPartFilter");
const equipmentFilter = document.getElementById("equipmentFilter");
const programListEl = document.getElementById("programList");
const saveProgramBtn = document.getElementById("saveProgramBtn");
const clearProgramBtn = document.getElementById("clearProgramBtn");

// ============================================================
//  1. VERİ ÇEKME
// ============================================================
async function fetchExercises() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`API yanıtı başarısız: ${response.status}`);
        }
        const data = await response.json();

        // API yanıt yapısı: { success, meta, data: [...] }
        if (!data.success || !Array.isArray(data.data)) {
            throw new Error("Beklenmeyen API yanıt formatı.");
        }

        allExercises = data.data;
        filteredExercises = [...allExercises];

        // Filtre seçeneklerini doldur
        populateFilters();
        // Egzersizleri göster
        renderExercises();
    } catch (error) {
        console.error("Egzersizler yüklenirken hata:", error);
        showError(
            "Egzersiz verileri yüklenemedi. Lütfen internet bağlantınızı kontrol edin ve sayfayı yenileyin. " +
            "Hata detayı: " + error.message
        );
        // Yükleme animasyonunu kaldır, hata mesajı göster
        exerciseListEl.innerHTML = `
            <div class="loader">
                <p>⚠️ Veriler yüklenemedi.</p>
            </div>
        `;
    }
}

// ============================================================
//  2. FİLTRELERİ DOLDURMA
// ============================================================
function populateFilters() {
    // Vücut bölgelerini topla (benzersiz)
    const bodyParts = new Set();
    const equipments = new Set();

    allExercises.forEach((ex) => {
        (ex.bodyParts || []).forEach((bp) => bodyParts.add(bp));
        (ex.equipments || []).forEach((eq) => equipments.add(eq));
    });

    // Vücut bölgesi filtresi
    bodyPartFilter.innerHTML = '<option value="">Tüm Vücut Bölgeleri</option>';
    [...bodyParts].sort().forEach((bp) => {
        const opt = document.createElement("option");
        opt.value = bp;
        opt.textContent = capitalize(bp);
        bodyPartFilter.appendChild(opt);
    });

    // Ekipman filtresi
    equipmentFilter.innerHTML = '<option value="">Tüm Ekipmanlar</option>';
    [...equipments].sort().forEach((eq) => {
        const opt = document.createElement("option");
        opt.value = eq;
        opt.textContent = capitalize(eq);
        equipmentFilter.appendChild(opt);
    });
}

// ============================================================
//  3. EGZERSİZLERİ RENDER ETME
// ============================================================
function renderExercises() {
    if (!filteredExercises.length) {
        exerciseListEl.innerHTML = `
            <div class="loader">
                <p>🔍 Aramanızla eşleşen egzersiz bulunamadı.</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    filteredExercises.forEach((ex) => {
        const card = document.createElement("div");
        card.className = "exercise-card";

        // GIF veya placeholder
        const gifUrl = ex.gifUrl || "";
        const gifHtml = gifUrl
            ? `<img src="${gifUrl}" alt="${ex.name}" loading="lazy" />`
            : `<span style="color: var(--text-muted); font-size: 0.8rem;">Görsel yok</span>`;

        // Etiketler
        const bodyParts = (ex.bodyParts || []).map((bp) => `<span class="tag">${capitalize(bp)}</span>`).join("");
        const equipments = (ex.equipments || []).map((eq) => `<span class="tag">${capitalize(eq)}</span>`).join("");
        const targetMuscles = (ex.targetMuscles || []).slice(0, 2).map((tm) => `<span class="tag">${capitalize(tm)}</span>`).join("");

        // Programda zaten var mı?
        const isAdded = selectedExercises.some((s) => s.exerciseId === ex.exerciseId);

        card.innerHTML = `
            <div class="gif-wrapper">${gifHtml}</div>
            <div class="info">
                <h3 title="${ex.name}">${ex.name}</h3>
                <div class="tags">${bodyParts} ${equipments} ${targetMuscles}</div>
                <button ${isAdded ? "disabled" : ""} data-id="${ex.exerciseId}">
                    ${isAdded ? "✓ Eklendi" : "+ Programa Ekle"}
                </button>
            </div>
        `;

        // Ekleme butonu olayı
        const btn = card.querySelector("button");
        if (!isAdded) {
            btn.addEventListener("click", () => addToProgram(ex));
        }

        fragment.appendChild(card);
    });

    exerciseListEl.innerHTML = "";
    exerciseListEl.appendChild(fragment);
}

// ============================================================
//  4. PROGRAM YÖNETİMİ
// ============================================================
function addToProgram(exercise) {
    if (selectedExercises.some((s) => s.exerciseId === exercise.exerciseId)) return;

    selectedExercises.push({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        gifUrl: exercise.gifUrl || "",
        bodyParts: exercise.bodyParts || [],
        equipments: exercise.equipments || [],
        targetMuscles: exercise.targetMuscles || [],
        instructions: exercise.instructions || [],
    });

    saveToLocalStorage();
    renderProgram();
    renderExercises(); // Buton durumlarını güncelle
}

function removeFromProgram(exerciseId) {
    selectedExercises = selectedExercises.filter((s) => s.exerciseId !== exerciseId);
    saveToLocalStorage();
    renderProgram();
    renderExercises();
}

function moveUp(index) {
    if (index <= 0) return;
    [selectedExercises[index - 1], selectedExercises[index]] = [
        selectedExercises[index],
        selectedExercises[index - 1],
    ];
    saveToLocalStorage();
    renderProgram();
}

function moveDown(index) {
    if (index >= selectedExercises.length - 1) return;
    [selectedExercises[index], selectedExercises[index + 1]] = [
        selectedExercises[index + 1],
        selectedExercises[index],
    ];
    saveToLocalStorage();
    renderProgram();
}

function clearProgram() {
    if (!selectedExercises.length) return;
    if (!confirm("Tüm programı temizlemek istediğinize emin misiniz?")) return;
    selectedExercises = [];
    saveToLocalStorage();
    renderProgram();
    renderExercises();
}

// ============================================================
//  5. PROGRAMI RENDER ETME
// ============================================================
function renderProgram() {
    if (!selectedExercises.length) {
        programListEl.innerHTML = '<li class="empty-program">Henüz egzersiz eklenmedi.</li>';
        return;
    }

    const fragment = document.createDocumentFragment();

    selectedExercises.forEach((ex, index) => {
        const li = document.createElement("li");
        li.className = "program-item";

        li.innerHTML = `
            <span class="item-name" title="${ex.name}">${ex.name}</span>
            <div class="item-actions">
                <button class="move-up" data-index="${index}" title="Yukarı taşı">↑</button>
                <button class="move-down" data-index="${index}" title="Aşağı taşı">↓</button>
                <button class="remove-btn" data-id="${ex.exerciseId}" title="Kaldır">✕</button>
            </div>
        `;

        // Olay dinleyicileri
        li.querySelector(".move-up").addEventListener("click", () => moveUp(index));
        li.querySelector(".move-down").addEventListener("click", () => moveDown(index));
        li.querySelector(".remove-btn").addEventListener("click", () => removeFromProgram(ex.exerciseId));

        fragment.appendChild(li);
    });

    programListEl.innerHTML = "";
    programListEl.appendChild(fragment);
}

// ============================================================
//  6. LOCALSTORAGE KAYIT / YÜKLEME
// ============================================================
function saveToLocalStorage() {
    try {
        localStorage.setItem("fitprogram_selected", JSON.stringify(selectedExercises));
    } catch (e) {
        console.warn("LocalStorage kayıt hatası:", e);
    }
}

function loadFromLocalStorage() {
    try {
        const stored = localStorage.getItem("fitprogram_selected");
        if (stored) {
            selectedExercises = JSON.parse(stored);
        }
    } catch (e) {
        console.warn("LocalStorage yükleme hatası:", e);
        selectedExercises = [];
    }
}

// ============================================================
//  7. PROGRAMI DIŞA AKTARMA (JSON İNDİRME)
// ============================================================
function exportProgram() {
    if (!selectedExercises.length) {
        alert("Program boş. Lütfen önce egzersiz ekleyin.");
        return;
    }

    const exportData = {
        programName: "Antrenman Programım",
        createdAt: new Date().toISOString(),
        exercises: selectedExercises.map((ex) => ({
            id: ex.exerciseId,
            name: ex.name,
            bodyParts: ex.bodyParts,
            equipments: ex.equipments,
            targetMuscles: ex.targetMuscles,
            instructions: ex.instructions,
            gifUrl: ex.gifUrl,
        })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "antrenman-programi.json";
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================
//  8. FİLTRELEME MANTIĞI
// ============================================================
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedBodyPart = bodyPartFilter.value;
    const selectedEquipment = equipmentFilter.value;

    filteredExercises = allExercises.filter((ex) => {
        // Arama filtresi (isim, hedef kaslar, ekipman)
        const matchesSearch =
            !searchTerm ||
            ex.name.toLowerCase().includes(searchTerm) ||
            (ex.targetMuscles || []).some((tm) => tm.toLowerCase().includes(searchTerm)) ||
            (ex.equipments || []).some((eq) => eq.toLowerCase().includes(searchTerm));

        // Vücut bölgesi filtresi
        const matchesBodyPart =
            !selectedBodyPart || (ex.bodyParts || []).includes(selectedBodyPart);

        // Ekipman filtresi
        const matchesEquipment =
            !selectedEquipment || (ex.equipments || []).includes(selectedEquipment);

        return matchesSearch && matchesBodyPart && matchesEquipment;
    });

    renderExercises();
}

// ============================================================
//  9. YARDIMCI FONKSİYONLAR
// ============================================================
function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showError(message) {
    errorContainerEl.innerHTML = `<div class="error-msg">${message}</div>`;
}

// ============================================================
//  10. BAŞLATMA & OLAY DİNLEYİCİLERİ
// ============================================================
function init() {
    // LocalStorage'dan programı yükle
    loadFromLocalStorage();
    renderProgram();

    // API'den egzersizleri çek
    fetchExercises();

    // Filtre olayları
    searchInput.addEventListener("input", applyFilters);
    bodyPartFilter.addEventListener("change", applyFilters);
    equipmentFilter.addEventListener("change", applyFilters);

    // Program butonları
    saveProgramBtn.addEventListener("click", exportProgram);
    clearProgramBtn.addEventListener("click", clearProgram);
}

// Uygulamayı başlat
init();