const categorias = [
  {
    cat: 0, label: 'Abaixo do peso', desc: 'Seu peso está abaixo do recomendado. Consulte um nutricionista.',
    color: '#63b3ed', badge: { bg: '#ebf8ff', text: '#2b6cb0' },
    gaugeColor: '#63b3ed', needleDeg: -80, dashOffset: 220
  },
  {
    cat: 1, label: 'Peso normal', desc: 'Parabéns! Você está na faixa de peso ideal para sua altura.',
    color: '#48bb78', badge: { bg: '#c6f6d5', text: '#276749' },
    gaugeColor: '#48bb78', needleDeg: -30, dashOffset: 150
  },
  {
    cat: 2, label: 'Sobrepeso', desc: 'Atenção aos hábitos alimentares e à prática de exercícios físicos.',
    color: '#f6ad55', badge: { bg: '#fefcbf', text: '#975a16' },
    gaugeColor: '#f6ad55', needleDeg: 10, dashOffset: 90
  },
  {
    cat: 3, label: 'Obesidade grau I', desc: 'Recomenda-se acompanhamento médico e mudanças no estilo de vida.',
    color: '#fc8181', badge: { bg: '#fff5f5', text: '#c53030' },
    gaugeColor: '#fc8181', needleDeg: 40, dashOffset: 50
  },
  {
    cat: 4, label: 'Obesidade grau II', desc: 'Procure orientação médica especializada para tratamento adequado.',
    color: '#f56565', badge: { bg: '#fff5f5', text: '#9b2c2c' },
    gaugeColor: '#f56565', needleDeg: 65, dashOffset: 20
  },
  {
    cat: 5, label: 'Obesidade grau III', desc: 'Situação crítica. Busque atendimento médico com urgência.',
    color: '#e53e3e', badge: { bg: '#fff5f5', text: '#742a2a' },
    gaugeColor: '#e53e3e', needleDeg: 80, dashOffset: 5
  }
];

function getCategoria(imc) {
  if (imc < 18.5)  return categorias[0];
  if (imc < 25)    return categorias[1];
  if (imc < 30)    return categorias[2];
  if (imc < 35)    return categorias[3];
  if (imc < 40)    return categorias[4];
  return              categorias[5];
}

// Sincroniza inputs e sliders
function syncPeso(val) {
  document.getElementById('peso').value     = val;
  document.getElementById('slider-peso').value = val;
  document.getElementById('peso-val').textContent = val + ' kg';
}
function syncAltura(val) {
  document.getElementById('altura').value      = val;
  document.getElementById('slider-altura').value = val;
  document.getElementById('altura-val').textContent = val + ' cm';
}

document.getElementById('peso').addEventListener('input', e => syncPeso(e.target.value));
document.getElementById('altura').addEventListener('input', e => syncAltura(e.target.value));
document.getElementById('slider-peso').addEventListener('input', e => syncPeso(e.target.value));
document.getElementById('slider-altura').addEventListener('input', e => syncAltura(e.target.value));

document.addEventListener('keydown', e => { if (e.key === 'Enter') calcular(); });

function calcular() {
  const peso    = parseFloat(document.getElementById('peso').value);
  const alturaCm = parseFloat(document.getElementById('altura').value);

  if (!peso || !alturaCm || peso <= 0 || alturaCm <= 0) {
    shake(document.getElementById('btn-calc'));
    return;
  }

  const altura = alturaCm / 100;
  const imc    = peso / (altura * altura);
  const cat    = getCategoria(imc);

  // Peso ideal range (18.5–24.9)
  const pesoMin = (18.5 * altura * altura).toFixed(1);
  const pesoMax = (24.9 * altura * altura).toFixed(1);

  // Update UI
  document.getElementById('imc-number').textContent = imc.toFixed(1);

  const badge = document.getElementById('imc-badge');
  badge.textContent = cat.label;
  badge.style.background = cat.badge.bg;
  badge.style.color      = cat.badge.text;

  document.getElementById('imc-desc').textContent = cat.desc;
  document.getElementById('peso-min').textContent  = pesoMin + ' kg';
  document.getElementById('peso-max').textContent  = pesoMax + ' kg';

  // Gauge
  const fill   = document.getElementById('gauge-fill');
  const needle = document.getElementById('gauge-needle');
  fill.style.stroke          = cat.gaugeColor;
  fill.style.strokeDashoffset = cat.dashOffset;
  needle.style.transform     = `rotate(${cat.needleDeg}deg)`;

  // Tabela highlight
  document.querySelectorAll('.table-row').forEach(row => {
    row.classList.toggle('active', parseInt(row.dataset.cat) === cat.cat);
  });

  // Mostrar resultado
  const resultCard = document.getElementById('result');
  resultCard.classList.add('visible');

  // Animar número
  animateNumber('imc-number', imc);
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  const start = parseFloat(el.textContent) || 0;
  const duration = 800;
  const startTime = performance.now();

  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = (start + (target - start) * ease).toFixed(1);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function shake(el) {
  el.style.animation = 'none';
  el.style.transform = 'translateX(-6px)';
  setTimeout(() => { el.style.transform = 'translateX(6px)'; }, 80);
  setTimeout(() => { el.style.transform = 'translateX(-4px)'; }, 160);
  setTimeout(() => { el.style.transform = 'translateX(4px)'; }, 240);
  setTimeout(() => { el.style.transform = ''; }, 320);
}
