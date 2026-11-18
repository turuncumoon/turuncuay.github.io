const VERI = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/';
let hareketler = [];
let program = JSON.parse(localStorage.getItem('program') || 'null') || [{ ad: 'Gün 1', hareketler: [] }];

const kaydet = () => localStorage.setItem('program', JSON.stringify(program));
const bul = (id) => hareketler.find((h) => h.id === id);

fetch(VERI + 'dist/exercises.json')
  .then((r) => r.json())
  .then((veri) => {
    hareketler = veri;
    const kaslar = new Set();
    veri.forEach((h) => h.primaryMuscles.forEach((k) => kaslar.add(k)));
    [...kaslar].sort().forEach((k) => {
      document.getElementById('kasFiltre').add(new Option(k, k));
    });
    listele();
    ciz();
  });

function listele() {
  const q = document.getElementById('ara').value.toLowerCase();
  const kas = document.getElementById('kasFiltre').value;
  const sonuc = hareketler
    .filter((h) => h.name.toLowerCase().includes(q))
    .filter((h) => !kas || h.primaryMuscles.includes(kas))
    .slice(0, 80);
  const kutu = document.getElementById('liste');
  kutu.innerHTML = '';
  sonuc.forEach((h) => {
    const d = document.createElement('div');
    d.className = 'hareket';
    d.innerHTML = '<span>' + h.name + '</span>';
    d.onclick = () => onizle(h);
    const b = document.createElement('button');
    b.textContent = '+';
    b.onclick = (e) => {
      e.stopPropagation();
      program[program.length - 1].hareketler.push({ id: h.id, set: 3, tekrar: 10 });
      kaydet();
      ciz();
    };
    d.appendChild(b);
    kutu.appendChild(d);
  });
}

const GIF_API = 'https://oss.exercisedb.dev/api/v1/exercises';
const gifOnbellek = {};
let sonTik = 0;

const kelimeler = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);

async function gifBul(ad) {
  if (ad in gifOnbellek) return gifOnbellek[ad];
  const kisa = ad.split(' - ')[0];
  const hedef = kelimeler(kisa);
  let en = null;
  let enPuan = 0;
  for (const q of [kisa, hedef.slice(0, 3).join(' ')]) {
    try {
      const r = await fetch(GIF_API + '?name=' + encodeURIComponent(q) + '&limit=10');
      const j = await r.json();
      const liste = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : (j.data && j.data.exercises) || [];
      liste.forEach((e) => {
        if (!e.gifUrl) return;
        const w = kelimeler(e.name);
        const puan = hedef.filter((k) => w.includes(k)).length / Math.max(hedef.length, w.length);
        if (puan > enPuan) { enPuan = puan; en = e; }
      });
    } catch (err) { /* ağ hatası: fotoğrafa düşecek */ }
    if (enPuan >= 0.8) break;
  }
  gifOnbellek[ad] = enPuan >= 0.5 ? en : null;
  return gifOnbellek[ad];
}

async function onizle(h) {
  const sira = ++sonTik;
  const kutu = document.getElementById('onizleme');
  const foto = h.images.map((i) => '<img src="' + VERI + 'exercises/' + i + '">').join('');
  kutu.innerHTML =
    '<b>' + h.name + '</b><br>Birincil: ' + h.primaryMuscles.join(', ') +
    '<br>İkincil: ' + (h.secondaryMuscles.join(', ') || '-') +
    '<div id="gifAlani">GIF aranıyor...</div>';
  const g = await gifBul(h.name);
  if (sira !== sonTik) return;
  document.getElementById('gifAlani').innerHTML = g
    ? '<img src="' + g.gifUrl + '" alt="' + g.name + '"><small>GIF: ExerciseDB (' + g.name + ')</small>'
    : '<small>Bu hareket için GIF bulunamadı, fotoğraflar:</small>' + foto;
}

function ciz() {
  const kutu = document.getElementById('program');
  kutu.innerHTML = '';
  program.forEach((gun, gi) => {
    const d = document.createElement('div');
    d.className = 'gun';
    d.innerHTML = '<input value="' + gun.ad + '">';
    d.querySelector('input').onchange = (e) => { gun.ad = e.target.value; kaydet(); };
    gun.hareketler.forEach((s, si) => {
      const h = bul(s.id);
      const r = document.createElement('div');
      r.className = 'satir';
      r.innerHTML = '<span>' + (h ? h.name : s.id) + '</span>' +
        '<input type="number" min="1" value="' + s.set + '" title="set">' +
        '<input type="number" min="1" value="' + s.tekrar + '" title="tekrar">' +
        '<button class="gri">x</button>';
      const [setKutu, tekrarKutu] = r.querySelectorAll('input');
      setKutu.onchange = () => { s.set = +setKutu.value; kaydet(); hacimCiz(); };
      tekrarKutu.onchange = () => { s.tekrar = +tekrarKutu.value; kaydet(); };
      r.querySelector('button').onclick = () => {
        gun.hareketler.splice(si, 1);
        kaydet();
        ciz();
      };
      d.appendChild(r);
    });
    kutu.appendChild(d);
  });
  hacimCiz();
}

function hacimCiz() {
  const toplam = {};
  program.forEach((gun) => gun.hareketler.forEach((s) => {
    const h = bul(s.id);
    if (!h) return;
    h.primaryMuscles.forEach((k) => (toplam[k] = (toplam[k] || 0) + s.set));
    h.secondaryMuscles.forEach((k) => (toplam[k] = (toplam[k] || 0) + s.set / 2));
  }));
  const sirali = Object.entries(toplam).sort((a, b) => b[1] - a[1]);
  const enCok = sirali.length ? sirali[0][1] : 1;
  document.getElementById('hacim').innerHTML = sirali.map(([k, v]) =>
    '<div class="kas">' + k + ': ' + v + ' set<div class="cubuk" style="width:' + (v / enCok) * 100 + '%"></div></div>'
  ).join('') || 'Henüz hareket eklenmedi.';
}

document.getElementById('ara').oninput = listele;
document.getElementById('kasFiltre').onchange = listele;
document.getElementById('gunEkle').onclick = () => {
  program.push({ ad: 'Gün ' + (program.length + 1), hareketler: [] });
  kaydet();
  ciz();
};
document.getElementById('temizle').onclick = () => {
  if (confirm('Program silinsin mi?')) {
    program = [{ ad: 'Gün 1', hareketler: [] }];
    kaydet();
    ciz();
  }
};