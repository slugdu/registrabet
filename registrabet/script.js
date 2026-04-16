// teste xls deploy123
// // ============================================================
// REGISTRABET — Plataforma de Gestão de Banca Profissional
// Stack: Vanilla JS ES6+, Chart.js 4, LocalStorage
// v2.0 — Evolução com BI, Estratégias, Money Line, Filtros
// ============================================================

// ============================================================
// SUPABASE — integração com banco em nuvem
// ============================================================

const SUPABASE_URL = 'https://wwfwnnnwmuphdiredbmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GGPLXFWCyJp86ZyE6xYAMA_kuaDWfjR';

if (!window.supabase) {
  document.getElementById('auth-splash').innerHTML =
    '<p style="color:#f87171;font-size:14px;text-align:center;padding:24px">' +
    '⚠️ Falha ao carregar o SDK do Supabase.<br>Verifique sua conexão e recarregue a página.</p>';
  throw new Error('[Registrabet] window.supabase não está definido — CDN falhou ao carregar.');
}
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    detectSessionFromUrl: true, // processa tokens da URL automaticamente (#access_token / ?code=)
    persistSession:       true, // mantém a sessão no localStorage entre recargas
    autoRefreshToken:     true  // renova o token antes de expirar
  }
});

// ── Diagnóstico — rode no console do navegador: await debugSupabase()
window.debugSupabase = async function() {
  console.group('🔍 Diagnóstico Supabase');

  const { data: { user }, error: authErr } = await supabaseClient.auth.getUser();
  if (authErr || !user) {
    console.error('❌ Usuário não autenticado:', authErr);
    console.groupEnd(); return;
  }
  console.log('✅ Usuário autenticado:', user.id, user.email);

  const { count, error: countErr } = await supabaseClient
    .from('bets').select('*', { count: 'exact', head: true });
  if (countErr) {
    console.error('❌ Erro ao contar bets (possível RLS bloqueando):', countErr);
  } else {
    console.log('📊 Total de bets visíveis para este usuário:', count);
  }

  const { data, error: fetchErr } = await supabaseClient
    .from('bets').select('id, date, market, user_id').limit(3);
  if (fetchErr) {
    console.error('❌ Erro no SELECT:', fetchErr);
  } else {
    console.log('📋 Amostra (3 primeiros):', data);
  }

  console.log('💾 localStorage tem', DB.getBets().length, `aposta(s) (chave: ${STORAGE_KEY})`);
  console.groupEnd();
};

async function getUser() {
  const { data } = await supabaseClient.auth.getUser();
  return data.user;
}

async function saveBetToCloud(bet) {
  const user = await getUser();

  if (!user) {
    console.log('Usuário não logado — aposta salva apenas localmente.');
    return;
  }

  const { data, error } = await supabaseClient.from('bets').insert([{
    user_id:   user.id,
    date:      bet.date,
    league:    bet.league,
    home_team: bet.homeTeam,
    away_team: bet.awayTeam,
    market:    bet.market,
    odds:      bet.odds,
    stake:     bet.stake,
    status:    bet.status,
    profit:    bet.profit
  }]).select().single();

  if (error) {
    console.error('Supabase insert error:', error);
  } else {
    // Persiste o UUID gerado pelo Supabase no localStorage para uso nos UPDATEs
    const bets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const i = bets.findIndex(b => b.id === bet.id);
    if (i !== -1) {
      bets[i].supabase_id = data.id;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
    }
    console.log('Aposta salva no Supabase, uuid:', data.id);
  }
}

async function updateBetInCloud(bet) {
  const user = await getUser();

  if (!user) {
    console.log('Usuário não logado — update apenas local.');
    return;
  }

  const { error } = await supabaseClient.from('bets').update({
    date:      bet.date,
    league:    bet.league,
    home_team: bet.homeTeam,
    away_team: bet.awayTeam,
    market:    bet.market,
    odds:      bet.odds,
    stake:     bet.stake,
    status:    bet.status,
    profit:    bet.profit
  }).eq('id', bet.supabase_id);

  if (error) console.error('Supabase update error:', error);
  else       console.log('Aposta atualizada no Supabase, uuid:', bet.supabase_id);
}

// ============================================================
// AUTH — estado global
// ============================================================

let currentUser    = null; // objeto User do Supabase quando logado
let appInitialized = false; // garante que initApp() rode apenas uma vez

// ---- Helpers de UI ----

function hideSplash() {
  document.getElementById('auth-splash')?.classList.add('hidden');
}

function showAuthScreen() {
  const el = document.getElementById('auth-screen');
  el?.classList.remove('hidden');
  el?.classList.add('flex');
}

function hideAuthScreen() {
  const el = document.getElementById('auth-screen');
  el?.classList.add('hidden');
  el?.classList.remove('flex');
}

function showAppChrome() {
  // Exibe botão Sair e email no header
  const logoutBtn = document.getElementById('btn-logout');
  logoutBtn?.classList.remove('hidden');
  logoutBtn?.classList.add('flex');
  const label = document.getElementById('auth-user-label');
  if (label && currentUser?.email) {
    label.textContent = currentUser.email;
    label.classList.remove('hidden');
  }
}

function hideAppChrome() {
  document.getElementById('btn-logout')?.classList.add('hidden');
  document.getElementById('btn-logout')?.classList.remove('flex');
  document.getElementById('auth-user-label')?.classList.add('hidden');
}

// ---- Alternância login / cadastro ----

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('form-login')?.classList.toggle('hidden', !isLogin);
  document.getElementById('form-signup')?.classList.toggle('hidden', isLogin);
  document.getElementById('tab-login')?.classList.toggle('active', isLogin);
  document.getElementById('tab-signup')?.classList.toggle('active', !isLogin);
  clearAuthMessage();
}

// ---- Feedback visual ----

function showAuthMessage(msg, type = 'error') {
  const el = document.getElementById('auth-error');
  if (!el) return;
  const styles = {
    error:   'bg-red-500/10 border border-red-500/20 text-red-400',
    success: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
    info:    'bg-blue-500/10 border border-blue-500/20 text-blue-400'
  };
  el.className = `mb-4 px-4 py-3 rounded-xl text-sm text-center ${styles[type] || styles.error}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearAuthMessage() {
  const el = document.getElementById('auth-error');
  if (el) { el.className = 'hidden mb-4 px-4 py-3 rounded-xl text-sm text-center'; el.textContent = ''; }
}

function setAuthBtnLoading(btnId, loading, defaultLabel) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled     = loading;
  btn.textContent  = loading ? 'Aguarde...' : defaultLabel;
  btn.style.opacity = loading ? '0.65' : '1';
}

// ---- Ações de autenticação ----

async function handleSignIn(e) {
  e.preventDefault();
  clearAuthMessage();
  setAuthBtnLoading('btn-login', true, 'Entrar');

  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  setAuthBtnLoading('btn-login', false, 'Entrar');

  if (error) {
    const msgs = {
      'Invalid login credentials': 'Email ou senha incorretos.',
      'Email not confirmed':       'Confirme seu email antes de entrar.',
      'Too many requests':         'Muitas tentativas. Aguarde um momento.'
    };
    showAuthMessage(msgs[error.message] || error.message, 'error');
  }
  // Sucesso → onAuthStateChange('SIGNED_IN') assume o controle
}

async function handleSignUp(e) {
  e.preventDefault();
  clearAuthMessage();

  const password = document.getElementById('auth-password-signup').value;
  if (password.length < 6) {
    showAuthMessage('A senha deve ter pelo menos 6 caracteres.', 'error');
    return;
  }

  setAuthBtnLoading('btn-signup', true, 'Criar conta');

  const email = document.getElementById('auth-email-signup').value.trim();
  const { error } = await supabaseClient.auth.signUp({ email, password });

  setAuthBtnLoading('btn-signup', false, 'Criar conta');

  if (error) {
    showAuthMessage(error.message, 'error');
  } else {
    showAuthMessage('✉️ Verifique seu email para confirmar o cadastro.', 'success');
  }
}

async function handleSignOut() {
  await supabaseClient.auth.signOut();
  // onAuthStateChange('SIGNED_OUT') cuida do restante
}

// ---- Migração silenciosa de dados locais ----

async function checkMigration(userId) {
  const migrationKey = `migration_done_${userId}`;
  if (Settings.get()[migrationKey]) return; // já feita para este usuário

  const unsynced = DB.getBets().filter(b => !b.supabase_id && !b._cloud_synced);
  if (!unsynced.length) {
    Settings.save({ [migrationKey]: true });
    return;
  }

  // Aguarda o dashboard renderizar antes de exibir o dialog
  setTimeout(() => migrateLocalData(userId, migrationKey, unsynced), 800);
}

async function migrateLocalData(userId, migrationKey, unsynced) {
  const confirmed = confirm(
    `Detectamos ${unsynced.length} aposta(s) salva(s) neste navegador.\n\n` +
    `Deseja sincronizá-las com sua conta na nuvem?\n\n` +
    `(Apostas já existentes no banco serão ignoradas automaticamente)`
  );
  if (!confirmed) return;

  toast('Sincronizando apostas com a nuvem...', 'info');

  // Busca fingerprints do banco para deduplicação sem alterar schema
  const { data: cloudBets, error: fetchErr } = await supabaseClient
    .from('bets')
    .select('date, odds, stake, market')
    .eq('user_id', userId);

  if (fetchErr) {
    toast('Erro ao verificar apostas existentes.', 'error');
    console.error('Migration fetch error:', fetchErr);
    return;
  }

  // Fingerprint: date|odds|stake|market
  const existing = new Set(
    (cloudBets || []).map(b => `${b.date}|${b.odds}|${b.stake}|${b.market}`)
  );

  // Filtra apenas apostas realmente novas
  const toInsert = unsynced.filter(
    b => !existing.has(`${b.date}|${b.odds}|${b.stake}|${b.market}`)
  );

  const skipped = unsynced.length - toInsert.length;

  if (!toInsert.length) {
    toast(`Nenhuma aposta nova. ${skipped} já sincronizada(s).`, 'success');
    Settings.save({ [migrationKey]: true });
    return;
  }

  const payload = toInsert.map(b => ({
    user_id:   userId,
    date:      b.date,
    league:    b.league,
    home_team: b.homeTeam,
    away_team: b.awayTeam,
    market:    b.market,
    odds:      b.odds,
    stake:     b.stake,
    status:    b.status,
    profit:    b.profit
  }));

  const { data: inserted, error: insertErr } = await supabaseClient
    .from('bets')
    .insert(payload)
    .select('id');

  if (insertErr) {
    console.error('Migration insert error:', insertErr);
    toast('Erro na sincronização. Dados locais mantidos.', 'error');
    return;
  }

  // Persiste supabase_id + flag no localStorage
  const allBets = DB.getBets();
  toInsert.forEach((b, idx) => {
    const i = allBets.findIndex(ab => ab.id === b.id);
    if (i !== -1) {
      allBets[i]._cloud_synced = true;
      if (inserted?.[idx]?.id) allBets[i].supabase_id = inserted[idx].id;
    }
  });
  DB.saveBets(allBets);
  Settings.save({ [migrationKey]: true });

  const msg = skipped > 0
    ? `${toInsert.length} sincronizada(s), ${skipped} já existia(m) — ignorada(s).`
    : `${toInsert.length} aposta(s) sincronizada(s) com sucesso!`;
  toast(msg, 'success');
}

// ---- Carregamento de apostas do Supabase ----
// Busca todos os bets do usuário no banco e faz merge inteligente
// com o localStorage, sem sobrescrever dados locais nem duplicar.

// Converte uma row do Supabase (snake_case) para o formato interno do app (camelCase)
function rowToBet(row) {
  return {
    id:            row.id,
    supabase_id:   row.id,
    _cloud_synced: true,
    date:          row.date,
    league:        row.league    || '',
    homeTeam:      row.home_team || '',
    awayTeam:      row.away_team || '',
    market:        row.market    || '',
    odds:          parseFloat(row.odds),
    stake:         parseFloat(row.stake),
    status:        row.status,
    profit:        row.profit ?? Calc.betProfit({
                     odds: row.odds, stake: row.stake, status: row.status
                   })
  };
}

async function loadBetsFromCloud(userId) {
  console.log('[Cloud] Buscando apostas para user:', userId);

  const { data, error } = await supabaseClient
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) {
    console.error('[Cloud] Erro na query:', error);
    return false;
  }
  if (!data?.length) {
    console.warn('[Cloud] Nenhuma aposta encontrada no banco para este usuário.');
    return false;
  }
  console.log(`[Cloud] ${data.length} aposta(s) retornada(s) do banco.`);

  const local = DB.getBets();

  // ── CENÁRIO 1: localStorage vazio ──────────────────────────────────────────
  // Nenhum merge necessário — converte e salva tudo diretamente.
  if (!local.length) {
    DB.saveBets(data.map(rowToBet));
    console.log(`[Supabase] ${data.length} aposta(s) carregada(s) (dispositivo novo).`);
    return true;
  }

  // ── CENÁRIO 2: localStorage com dados — merge sem duplicação ───────────────
  // Índice rápido por supabase_id (bets já vinculados ao banco)
  const existingIds = new Set(local.map(b => b.supabase_id).filter(Boolean));

  // Índice por fingerprint (bets locais sem supabase_id — migrados manualmente)
  const fingerprintIdx = new Map(
    local.map((b, i) => [`${b.date}|${b.odds}|${b.stake}|${b.market}`, i])
  );

  const newBets = [];

  data.forEach(row => {
    // Já existe localmente via supabase_id → nenhuma ação
    if (existingIds.has(row.id)) return;

    const fp = `${row.date}|${row.odds}|${row.stake}|${row.market}`;
    const localIdx = fingerprintIdx.get(fp);

    if (localIdx !== undefined) {
      // Mesmo bet, sem supabase_id ainda → apenas vincula o UUID
      if (!local[localIdx].supabase_id) {
        local[localIdx].supabase_id   = row.id;
        local[localIdx]._cloud_synced = true;
      }
      return;
    }

    // Bet novo (outro dispositivo) → converte e adiciona
    newBets.push(rowToBet(row));
  });

  DB.saveBets([...local, ...newBets]);
  if (newBets.length)
    console.log(`[Supabase] ${newBets.length} aposta(s) nova(s) carregada(s) do banco.`);
  return true;
}

// ---- Boot do app para usuário autenticado ----
// Centraliza o fluxo usado por INITIAL_SESSION, SIGNED_IN e USER_UPDATED.
// Evita duplicação e garante que o app só renderize com dados prontos.

async function _bootUser(user) {
  // Evita re-boot se já estiver rodando para o mesmo usuário
  if (currentUser?.id === user.id && appInitialized) {
    refreshCurrent();
    return;
  }

  // Define a chave do localStorage ANTES de qualquer acesso ao DB
  // Garante que cada usuário leia/escreva apenas seus próprios dados
  setStorageKey(user.id);

  currentUser = user;
  showAppChrome();

  // Exibe/mantém o splash enquanto sincroniza — sem flash de tela vazia
  document.getElementById('auth-splash')?.classList.remove('hidden');
  hideAuthScreen();

  await loadBetsFromCloud(user.id);

  if (!appInitialized) { initApp(); appInitialized = true; }
  else refreshCurrent();

  hideSplash();
}

// ---- Inicialização da camada de auth ----

function initAuth() {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth]', event, session?.user?.email ?? '—');

    // INITIAL_SESSION: estado atual ao carregar a página.
    // Captura tokens de URL (confirmação de e-mail, magic link, recovery).
    if (event === 'INITIAL_SESSION') {
      if (session?.user) {
        await _bootUser(session.user);
      } else {
        hideSplash();
        showAuthScreen();
      }
      return;
    }

    // SIGNED_IN: login manual ou redirect de confirmação de e-mail.
    if (event === 'SIGNED_IN') {
      if (session?.user) {
        await _bootUser(session.user);
        checkMigration(session.user.id);
      }
      return;
    }

    // USER_UPDATED: disparado pelo Supabase em alguns fluxos de confirmação
    // de e-mail no lugar de SIGNED_IN — precisamos tratar igualmente.
    if (event === 'USER_UPDATED') {
      if (session?.user) {
        await _bootUser(session.user);
        checkMigration(session.user.id);
      }
      return;
    }

    // TOKEN_REFRESHED: renovação silenciosa do token — apenas atualiza referência.
    if (event === 'TOKEN_REFRESHED') {
      if (session?.user) currentUser = session.user;
      return;
    }

    // SIGNED_OUT: logout ou sessão expirada.
    if (event === 'SIGNED_OUT') {
      // Limpa os dados locais do usuário que saiu
      localStorage.removeItem(STORAGE_KEY);
      // Reseta a chave para o fallback genérico (inerte até o próximo login)
      STORAGE_KEY = 'bettrack_v1';
      currentUser = null;
      appInitialized = false; // permite re-inicializar no próximo login
      hideAppChrome();
      showAuthScreen();
      return;
    }
  });
}

// ============================================================
// CONSTANTS
// ============================================================

// STORAGE_KEY é dinâmico por usuário — definido em _bootUser via setStorageKey()
// Fallback 'bettrack_v1' usado apenas fora do contexto autenticado (nunca lido em produção)
let   STORAGE_KEY  = 'bettrack_v1';
const SETTINGS_KEY = 'registrabet_settings'; // chave separada — não afetada ao limpar apostas

function setStorageKey(userId) {
  STORAGE_KEY = `bets_${userId}`;
}

// Configurações persistentes (banca, preferências)
const Settings = {
  get()          { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } },
  save(data)     { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...this.get(), ...data })); },
  getBankroll()  { return parseFloat(this.get().initial_bankroll || 0); },
  setBankroll(v) { this.save({ initial_bankroll: parseFloat(v) || 0 }); }
};

const LEAGUES = [
  'Brasileirão Série A', 'Brasileirão Série B', 'Brasileirão Série C',
  'Copa do Brasil', 'Supercopa do Brasil', 'Paulistão', 'Carioca', 'Mineiro',
  'Premier League', 'Championship', 'FA Cup',
  'La Liga', 'Copa del Rey', 'Segunda División',
  'Bundesliga', '2. Bundesliga', 'DFB-Pokal',
  'Serie A', 'Serie B', 'Coppa Italia',
  'Ligue 1', 'Ligue 2', 'Coupe de France',
  'Champions League', 'Europa League', 'Conference League',
  'Libertadores', 'Sul-Americana', 'Recopa Sul-Americana',
  'MLS', 'Liga MX', 'Primeira Liga', 'Eredivisie',
  'Pro League', 'Super Lig', 'Ekstraklasa',
  'NBA', 'NFL', 'MLB', 'NHL', 'UFC/MMA', 'Tênis', 'CS:GO', 'LoL'
];

const MARKETS = [
  '1X2', 'Resultado Final', 'Dupla Chance',
  'Over 0.5', 'Over 1.5', 'Over 2.5', 'Over 3.5', 'Over 4.5',
  'Under 0.5', 'Under 1.5', 'Under 2.5', 'Under 3.5', 'Under 4.5',
  'Ambas Marcam', 'BTTS - Sim', 'BTTS - Não',
  'Handicap Asiático', 'Draw No Bet', 'Asian Handicap',
  'Escanteios Over 8.5', 'Escanteios Over 9.5', 'Escanteios Over 10.5',
  'Cartões Over', 'Cartões Under',
  'Primeiro Gol', 'Último Gol', 'Placar Exato',
  'Anytime Goalscorer', 'Vencedor',
  'Total de Gols', 'Spread', 'HT/FT',
  'Próximo Gol', 'Gol nos 1os 10min', 'Moneyline'
];

const STATUS_CONFIG = {
  green:      { label: 'Green ✓',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  red:        { label: 'Red ✗',      cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  half_green: { label: 'Meio Green', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  half_red:   { label: 'Meio Red',   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  void:       { label: 'Void',       cls: 'bg-slate-600/30 text-slate-400 border-slate-600/50' },
  pending:    { label: 'Pendente',   cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' }
};

// ============================================================
// RETROCOMPATIBILIDADE — helper central de exibição de evento
//
// REGRA: Novos registros usam homeTeam + awayTeam (ou eventDescription
// para múltiplas). Registros antigos têm apenas event (string livre).
// Esta função unifica os dois formatos sem jamais retornar 'undefined'.
// ============================================================

function getEventDisplay(bet) {
  if (!bet) return '—';
  // Novo formato: times separados
  if (bet.homeTeam && bet.awayTeam) return `${bet.homeTeam} × ${bet.awayTeam}`;
  // Novo formato: múltipla com descrição livre
  if (bet.eventDescription)         return bet.eventDescription;
  // Legado: campo event (texto livre)
  if (bet.event)                     return bet.event;
  return '—';
}

// ============================================================
// FILTRO DE TEMPO GLOBAL
// Todas as funções de renderização usam activeBets() em vez de
// DB.getBets() diretamente, garantindo que o filtro afete
// KPIs, gráficos e tabelas instantaneamente.
// ============================================================

let timeFilter = 'all'; // 'all' | '7d' | '30d' | 'month'

function activeBets() {
  const all = DB.getBets();
  if (timeFilter === 'all') return all;
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayMs = +today;
  if (timeFilter === '7d') {
    const cutoff = todayMs - 6 * 86400000;
    return all.filter(b => new Date(b.date) >= cutoff);
  }
  if (timeFilter === '30d') {
    const cutoff = todayMs - 29 * 86400000;
    return all.filter(b => new Date(b.date) >= cutoff);
  }
  if (timeFilter === 'month') {
    const m = now.getMonth(), y = now.getFullYear();
    return all.filter(b => { const d = new Date(b.date); return d.getMonth() === m && d.getFullYear() === y; });
  }
  return all;
}

function setTimeFilter(value) {
  timeFilter = value;
  // Atualizar visual dos botões
  ['all','month','30d','7d'].forEach(k => {
    document.getElementById(`tf-${k}`)?.classList.toggle('active', k === value);
  });
  refreshCurrent();
}

// ============================================================
// DATABASE LAYER
// ============================================================

const DB = {
  getBets() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  },

  saveBets(bets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
  },

  addBet(data) {
    const bets = this.getBets();
    const bet  = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ...data,
      profit: Calc.betProfit(data)
    };
    bets.push(bet);
    this.saveBets(bets);
    saveBetToCloud(bet); // sincroniza com Supabase (fire-and-forget)
    return bet;
  },

  updateBet(id, data) {
    const bets = this.getBets();
    const i    = bets.findIndex(b => b.id === id);
    if (i === -1) return null;
    bets[i] = { ...bets[i], ...data, profit: Calc.betProfit(data) };
    this.saveBets(bets);
    updateBetInCloud(bets[i]); // sincroniza update com Supabase (fire-and-forget)
    return bets[i];
  },

  // bet: objeto completo da aposta (deve ser passado pelo caller ANTES do optimistic removal)
  async deleteBet(bet) {
    // Remove do Supabase se a aposta tiver supabase_id e houver usuário logado
    if (bet?.supabase_id && currentUser) {
      const { error } = await supabaseClient
        .from('bets')
        .delete()
        .eq('id', bet.supabase_id)
        .eq('user_id', currentUser.id);

      if (error) {
        console.error('[Cloud] Erro ao deletar aposta:', error);
        throw error; // propaga para o caller fazer rollback
      }
      console.log('[Cloud] Aposta deletada do Supabase:', bet.supabase_id);
    }

    // Remove do localStorage (idempotente — ok se já foi removido no optimistic)
    this.saveBets(this.getBets().filter(b => b.id !== bet.id));
  },

  clear() { localStorage.removeItem(STORAGE_KEY); }
};

// ============================================================
// MIGRAÇÃO SILENCIOSA DE DADOS LEGADOS
// Se uma aposta antiga tiver campo 'strategy', o valor é
// anexado ao nome do mercado: "Resultado Final - Funil".
// Executado uma vez na inicialização, sem alterar outros campos.
// ============================================================
function migrateBets() {
  const bets = DB.getBets();
  let changed = false;
  const migrated = bets.map(bet => {
    if (bet.strategy && bet.strategy.trim() && !bet._migrated) {
      const mkt   = (bet.market || '').trim();
      const strat = bet.strategy.trim();
      changed = true;
      return { ...bet, market: mkt ? `${mkt} - ${strat}` : strat, _migrated: true };
    }
    return bet;
  });
  if (changed) DB.saveBets(migrated);
}

// ============================================================
// CALCULATIONS ENGINE
// ============================================================

const Calc = {
  betProfit({ odds, stake, status }) {
    const o = parseFloat(odds), s = parseFloat(stake);
    if (isNaN(o) || isNaN(s)) return 0;
    switch (status) {
      case 'green':      return +( s * (o - 1)).toFixed(2);
      case 'red':        return +(-s).toFixed(2);
      case 'half_green': return +( s * (o - 1) / 2).toFixed(2);
      case 'half_red':   return +(-s / 2).toFixed(2);
      default:           return 0;
    }
  },

  settled(bets) {
    return bets.filter(b => b.status !== 'pending' && b.status !== 'void');
  },

  totalProfit(bets) {
    return +(bets.reduce((s, b) => s + (b.profit || 0), 0)).toFixed(2);
  },

  totalStaked(bets) {
    return +(this.settled(bets).reduce((s, b) => s + parseFloat(b.stake), 0)).toFixed(2);
  },

  roi(bets) {
    const staked = this.totalStaked(bets);
    if (staked === 0) return 0;
    return +(this.totalProfit(bets) / staked * 100).toFixed(2);
  },

  winrate(bets) {
    const c = bets.filter(b => ['green','red','half_green','half_red'].includes(b.status));
    if (!c.length) return 0;
    const wins = c.filter(b => b.status === 'green').length
               + c.filter(b => b.status === 'half_green').length * 0.5;
    return +(wins / c.length * 100).toFixed(1);
  },

  avgOdds(bets) {
    const s = this.settled(bets);
    if (!s.length) return 0;
    return +(s.reduce((sum, b) => sum + parseFloat(b.odds), 0) / s.length).toFixed(2);
  },

  // [ATUALIZADO] usa getEventDisplay para retrocompat no label
  bankEvolution(bets) {
    const sorted = [...bets]
      .filter(b => b.status !== 'pending')
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let cum = 0;
    const points = [{ label: 'Início', value: 0 }];
    sorted.forEach((bet, i) => {
      cum = +(cum + (bet.profit || 0)).toFixed(2);
      points.push({ label: `#${i + 1} ${getEventDisplay(bet)}`, value: cum, date: bet.date });
    });
    return points;
  },

  drawdown(bets) {
    const evo = this.bankEvolution(bets);
    let peak = 0;
    return evo.map(p => {
      if (p.value > peak) peak = p.value;
      const dd = peak === 0 ? 0 : +(((p.value - peak) / Math.max(Math.abs(peak), 1)) * 100).toFixed(2);
      return { label: p.label, value: dd };
    });
  },

  byLeague(bets)  { return this._groupBy(bets, 'league'); },
  byMarket(bets)  { return this._groupBy(bets, 'market'); },

  // [NOVO] Agrupa por estratégia
  byStrategy(bets) {
    const s = this.settled(bets).filter(b => b.strategy && b.strategy.trim());
    if (!s.length) return [];
    return this._groupBy(s, 'strategy');
  },

  // [NOVO] Agrupa por tipo de aposta (Simples vs Múltipla)
  byBetType(bets) {
    const s = this.settled(bets);
    const groups = { simples: [], multipla: [] };
    s.forEach(b => {
      const key = b.betType === 'multipla' ? 'multipla' : 'simples';
      groups[key].push(b);
    });
    return Object.entries(groups)
      .filter(([, g]) => g.length > 0)
      .map(([name, group]) => ({
        name,
        label: name === 'multipla' ? 'Múltipla' : 'Simples',
        profit:  this.totalProfit(group),
        roi:     this.roi(group),
        count:   group.length,
        winrate: this.winrate(group)
      }));
  },

  _groupBy(bets, field) {
    const s = this.settled(bets);
    const groups      = {};
    const displayNames = {};  // chave normalizada → nome original para exibição
    s.forEach(b => {
      const raw = b[field] || 'Desconhecido';
      // Normalização de Mercado: "Over 2.5" e "over 2.5" agrupam juntos.
      // Mantém o primeiro nome encontrado como rótulo visual.
      const key = field === 'market' ? raw.toLowerCase().trim() : raw;
      if (!groups[key]) { groups[key] = []; displayNames[key] = raw; }
      groups[key].push(b);
    });
    return Object.entries(groups).map(([key, group]) => ({
      name:    displayNames[key],
      profit:  this.totalProfit(group),
      roi:     this.roi(group),
      count:   group.length,
      winrate: this.winrate(group)
    })).sort((a, b) => b.profit - a.profit);
  },

  byOddsRange(bets) {
    const ranges = [
      { label: '1.01–1.49', min: 1.01, max: 1.499 },
      { label: '1.50–1.80', min: 1.50, max: 1.800 },
      { label: '1.81–2.20', min: 1.81, max: 2.200 },
      { label: '2.21–3.00', min: 2.21, max: 3.000 },
      { label: '3.01+',     min: 3.01, max: Infinity }
    ];
    const s = this.settled(bets);
    return ranges.map(r => {
      const group = s.filter(b => { const o = parseFloat(b.odds); return o >= r.min && o <= r.max; });
      return { label: r.label, count: group.length, profit: this.totalProfit(group), roi: this.roi(group), winrate: this.winrate(group) };
    });
  },

  byMonth(bets) {
    const s = this.settled(bets);
    const groups = {};
    s.forEach(b => {
      const key = b.date ? b.date.slice(0, 7) : 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });
    return Object.entries(groups)
      .filter(([k]) => k !== 'unknown')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, group]) => ({
        month,
        profit:  this.totalProfit(group),
        roi:     this.roi(group),
        count:   group.length,
        staked:  this.totalStaked(group),
        winrate: this.winrate(group)
      }));
  }
};

// ============================================================
// INSIGHTS ENGINE
// ============================================================

const Insights = {
  MIN_BETS: 10,

  generate(bets) {
    const settled = Calc.settled(bets);
    if (settled.length < this.MIN_BETS) {
      return [{
        icon: '📊',
        text: `Registre pelo menos ${this.MIN_BETS} apostas encerradas para gerar insights. Você tem ${settled.length} no momento.`,
        type: 'neutral'
      }];
    }

    const insights = [];
    const roi      = Calc.roi(bets);
    const winrate  = Calc.winrate(bets);
    const byMarket = Calc.byMarket(bets);
    const byLeague = Calc.byLeague(bets);
    const byOdds   = Calc.byOddsRange(bets);

    if (roi > 10)
      insights.push({ icon: '🚀', text: `ROI de ${roi}% — performance excepcional! Mantenha a consistência.`, type: 'positive' });
    else if (roi > 0)
      insights.push({ icon: '✅', text: `ROI positivo de ${roi}%. Você está lucrando consistentemente.`, type: 'positive' });
    else if (roi < -15)
      insights.push({ icon: '🚨', text: `ROI de ${roi}% — situação crítica. Revise toda a estratégia imediatamente.`, type: 'negative' });
    else if (roi < 0)
      insights.push({ icon: '⚠️', text: `ROI negativo de ${roi}%. Analise os padrões de prejuízo.`, type: 'negative' });

    const mktPos = byMarket.filter(m => m.roi > 0 && m.count >= 5);
    if (mktPos.length)
      insights.push({ icon: '🎯', text: `Melhor mercado: "${mktPos[0].name}" com ROI ${mktPos[0].roi}% em ${mktPos[0].count} apostas.`, type: 'positive' });

    const mktNeg = byMarket.filter(m => m.roi < -5 && m.count >= 5);
    if (mktNeg.length) {
      const w = mktNeg[mktNeg.length - 1];
      insights.push({ icon: '⚠️', text: `ROI negativo em "${w.name}": ${w.roi}% (${w.count} apostas). Considere evitar.`, type: 'negative' });
    }

    const lgPos = byLeague.filter(l => l.roi > 0 && l.count >= 5);
    if (lgPos.length)
      insights.push({ icon: '🏆', text: `Melhor liga: ${lgPos[0].name} com ROI ${lgPos[0].roi}%, WR ${lgPos[0].winrate}%.`, type: 'positive' });

    const lgNeg = byLeague.filter(l => l.roi < -10 && l.count >= 5);
    if (lgNeg.length) {
      const w = lgNeg[lgNeg.length - 1];
      insights.push({ icon: '📉', text: `Prejuízo em ${w.name}: ROI ${w.roi}%. Reconsidere apostas nesta liga.`, type: 'negative' });
    }

    const oddsPos = byOdds.filter(r => r.roi > 0 && r.count >= 5).sort((a, b) => b.roi - a.roi);
    if (oddsPos.length)
      insights.push({ icon: '💡', text: `Faixa mais lucrativa: ${oddsPos[0].label} com ROI ${oddsPos[0].roi}%.`, type: 'positive' });

    if (winrate < 35)
      insights.push({ icon: '⚠️', text: `Winrate de ${winrate}% — muito abaixo do esperado.`, type: 'negative' });
    else if (winrate > 65)
      insights.push({ icon: '✅', text: `Winrate de ${winrate}% — consistência acima da média.`, type: 'positive' });

    // [NOVO] Insight Múltiplas vs Simples
    const byType = Calc.byBetType(bets);
    const simples  = byType.find(t => t.name === 'simples');
    const multipla = byType.find(t => t.name === 'multipla');
    if (simples && multipla && simples.count >= 5 && multipla.count >= 5) {
      if (multipla.roi > simples.roi + 5)
        insights.push({ icon: '🎰', text: `Múltiplas rendem mais que Simples: ${multipla.roi}% vs ${simples.roi}% de ROI. Continue explorando combinadas.`, type: 'positive' });
      else if (simples.roi > multipla.roi + 5)
        insights.push({ icon: '💡', text: `Apostas Simples superam Múltiplas: ${simples.roi}% vs ${multipla.roi}% de ROI. Foque nas simples.`, type: 'positive' });
      else
        insights.push({ icon: '⚖️', text: `Simples (${simples.roi}%) e Múltiplas (${multipla.roi}%) têm ROI similar. Resultados equilibrados.`, type: 'neutral' });
    }

    const pending = bets.filter(b => b.status === 'pending').length;
    if (pending > 0)
      insights.push({ icon: '⏳', text: `${pending} aposta${pending > 1 ? 's' : ''} pendente${pending > 1 ? 's' : ''} aguardando resultado.`, type: 'neutral' });

    return insights.slice(0, 7);
  }
};

// ============================================================
// AUTOCOMPLETE COMPONENT
// ============================================================

class AutocompleteInput {
  constructor(inputEl, staticSuggestions = [], { getExtra = () => [], maxItems = 8 } = {}) {
    this.input    = inputEl;
    this.static   = staticSuggestions;
    this.getExtra = getExtra;
    this.maxItems = maxItems;
    this.dropdown = null;
    this.activeIdx = -1;
    this._init();
  }

  _init() {
    if (getComputedStyle(this.input.parentElement).position === 'static')
      this.input.parentElement.style.position = 'relative';

    this.dropdown = document.createElement('div');
    this.dropdown.className = [
      'absolute top-full left-0 right-0 mt-1 z-[60]',
      'bg-[#0d1b2e] border border-slate-700 rounded-xl',
      'shadow-2xl overflow-hidden hidden'
    ].join(' ');
    this.input.parentElement.appendChild(this.dropdown);

    this.input.addEventListener('input',   () => this._show());
    this.input.addEventListener('focus',   () => this._show());
    this.input.addEventListener('keydown', (e) => this._onKey(e));
    this._outsideClick = (e) => { if (!this.input.parentElement.contains(e.target)) this._hide(); };
    document.addEventListener('click', this._outsideClick);
  }

  destroy() {
    document.removeEventListener('click', this._outsideClick);
  }

  _allSuggestions() {
    return [...new Set([...this.static, ...this.getExtra()])];
  }

  _show() {
    const val = this.input.value.toLowerCase().trim();
    const all = this._allSuggestions();
    const filtered = val
      ? all.filter(s => s.toLowerCase().includes(val) && s.toLowerCase() !== val.toLowerCase())
      : all;
    if (!filtered.length) { this._hide(); return; }

    const items = filtered.slice(0, this.maxItems);
    this.dropdown.innerHTML = items.map((item, i) =>
      `<div class="ac-item px-4 py-2.5 cursor-pointer text-sm text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-2" data-value="${item}" data-i="${i}">
        <i data-lucide="search" class="w-3 h-3 text-slate-600 shrink-0"></i>
        <span>${this._hl(item, val)}</span>
      </div>`
    ).join('');

    this.dropdown.querySelectorAll('.ac-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.input.value = el.dataset.value;
        this._hide();
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    this.dropdown.classList.remove('hidden');
    this.activeIdx = -1;
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [this.dropdown] });
  }

  _hl(text, query) {
    if (!query) return text;
    const i = text.toLowerCase().indexOf(query);
    if (i === -1) return text;
    return text.slice(0, i)
      + `<mark class="bg-transparent text-emerald-400 font-semibold">${text.slice(i, i + query.length)}</mark>`
      + text.slice(i + query.length);
  }

  _hide() { this.dropdown.classList.add('hidden'); this.activeIdx = -1; }

  _onKey(e) {
    const items = [...this.dropdown.querySelectorAll('.ac-item')];
    if (!items.length && e.key !== 'Escape') return;
    if (e.key === 'ArrowDown')      { e.preventDefault(); this.activeIdx = Math.min(this.activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); this.activeIdx = Math.max(this.activeIdx - 1, -1); }
    else if (e.key === 'Enter' && this.activeIdx >= 0) { e.preventDefault(); this.input.value = items[this.activeIdx].dataset.value; this._hide(); }
    else if (e.key === 'Escape')    { this._hide(); }
    else return;
    items.forEach((el, i) => el.classList.toggle('bg-slate-800', i === this.activeIdx));
  }
}

// ============================================================
// CHART INSTANCES MANAGER
// ============================================================

const Charts = {
  instances: {},

  destroy(key) {
    if (this.instances[key]) { this.instances[key].destroy(); delete this.instances[key]; }
  },

  defaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1b2e',
          borderColor: '#1e3a5f',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          padding: 10
        }
      }
    };
  },

  // [ATUALIZADO] Money Line com gradiente dinâmico verde/vermelho no zero
  bankEvolution(bets) {
    const canvasId = 'chart-bank';
    const wrapper  = document.getElementById(canvasId)?.parentElement;
    this.destroy('bank');

    const data = Calc.bankEvolution(bets);
    if (data.length <= 1) {
      if (wrapper) wrapper.innerHTML = this._empty('Registre apostas para ver a evolução da banca');
      return;
    }

    if (!document.getElementById(canvasId)) {
      const c = document.createElement('canvas'); c.id = canvasId;
      wrapper.innerHTML = ''; wrapper.appendChild(c);
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    const d   = this.defaults();

    // Plugin: recria o gradiente após o layout ser calculado (sabe a posição do zero)
    const moneyLineGradient = {
      id: 'moneyLineGradient',
      afterLayout(chart) {
        const { ctx: c, chartArea, scales: { y } } = chart;
        if (!chartArea) return;
        const { top, bottom } = chartArea;
        const h = bottom - top;
        if (h <= 0) return;

        // Posição em px do valor 0 no eixo Y (clamped entre top e bottom)
        const zeroY  = Math.max(top, Math.min(bottom, y.getPixelForValue(0)));
        const ratio  = (zeroY - top) / h; // 0 = topo, 1 = base

        const grad = c.createLinearGradient(0, top, 0, bottom);
        // Zona acima do zero → verde
        grad.addColorStop(0,                          'rgba(16,185,129,0.22)');
        grad.addColorStop(Math.max(0, ratio - 0.001), 'rgba(16,185,129,0.04)');
        // Zona abaixo do zero → vermelho
        if (ratio < 1) {
          grad.addColorStop(ratio, 'rgba(239,68,68,0.04)');
          grad.addColorStop(1,     'rgba(239,68,68,0.22)');
        }
        chart.data.datasets[0].backgroundColor = grad;
      }
    };

    this.instances['bank'] = new Chart(ctx, {
      type: 'line',
      plugins: [moneyLineGradient],
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.value),
          backgroundColor: 'rgba(16,185,129,0.08)', // sobrescrito pelo plugin
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius:      data.length > 30 ? 0 : 3,
          pointHoverRadius: 6,
          // [NOVO] Chart.js 4 — cor do segmento baseada no sinal do valor
          segment: {
            borderColor: ctx => ctx.p1.parsed.y >= 0 ? '#10b981' : '#ef4444',
            pointBackgroundColor: ctx => ctx.p1.parsed.y >= 0 ? '#10b981' : '#ef4444',
          }
        }]
      },
      options: {
        ...d,
        plugins: {
          ...d.plugins,
          tooltip: { ...d.plugins.tooltip, callbacks: { label: ctx => `Profit: ${fmtProfit(ctx.parsed.y)}` } }
        },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(30,58,95,0.5)' },
            ticks: { color: '#64748b', callback: v => fmtMini(v) }
          }
        }
      }
    });
  },

  drawdown(bets) {
    const canvasId = 'chart-drawdown';
    const wrapper  = document.getElementById(canvasId)?.parentElement;
    this.destroy('drawdown');

    const data = Calc.drawdown(bets);
    if (data.length <= 1) {
      if (wrapper) wrapper.innerHTML = this._empty('Sem dados de drawdown');
      return;
    }

    if (!document.getElementById(canvasId)) {
      const c = document.createElement('canvas'); c.id = canvasId;
      wrapper.innerHTML = ''; wrapper.appendChild(c);
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    const d   = this.defaults();
    this.instances['drawdown'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(p => p.label),
        datasets: [{ data: data.map(p => p.value), borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 0 }]
      },
      options: {
        ...d,
        plugins: { ...d.plugins, tooltip: { ...d.plugins.tooltip, callbacks: { label: ctx => `Drawdown: ${ctx.parsed.y}%` } } },
        scales: {
          x: { display: false },
          y: { grid: { color: 'rgba(30,58,95,0.5)' }, ticks: { color: '#64748b', callback: v => `${v}%` } }
        }
      }
    });
  },

  monthly(data) {
    const canvasId = 'chart-monthly';
    const wrapper  = document.getElementById(canvasId)?.parentElement;
    this.destroy('monthly');

    if (data.length < 2) {
      if (wrapper) wrapper.innerHTML = this._empty('Dados insuficientes para o gráfico mensal');
      return;
    }

    if (!document.getElementById(canvasId)) {
      const c = document.createElement('canvas'); c.id = canvasId;
      wrapper.innerHTML = ''; wrapper.appendChild(c);
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    const d   = this.defaults();
    this.instances['monthly'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(m => fmtMonth(m.month)),
        datasets: [{
          data: data.map(m => m.profit),
          backgroundColor: data.map(m => m.profit >= 0 ? 'rgba(16,185,129,0.65)' : 'rgba(239,68,68,0.65)'),
          borderColor:     data.map(m => m.profit >= 0 ? '#10b981' : '#ef4444'),
          borderWidth: 1, borderRadius: 5
        }]
      },
      options: {
        ...d,
        plugins: { ...d.plugins, tooltip: { ...d.plugins.tooltip, callbacks: { label: ctx => `Profit: ${fmtProfit(ctx.parsed.y)}` } } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { display: false } },
          y: { grid: { color: 'rgba(30,58,95,0.5)' }, ticks: { color: '#64748b', callback: v => fmtMini(v) } }
        }
      }
    });
  },

  _empty(msg) {
    return `<div class="flex flex-col items-center justify-center h-full text-slate-700 text-sm gap-2 py-8">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
      <span>${msg}</span></div>`;
  }
};

// ============================================================
// FORMATTERS
// ============================================================

function fmtMoney(v) {
  return (parseFloat(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtProfit(v) {
  const n = parseFloat(v) || 0;
  const str = Math.abs(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (n >= 0 ? '+' : '−') + str;
}

function fmtMini(v) {
  const n = parseFloat(v) || 0, abs = Math.abs(n), sign = n < 0 ? '−' : '';
  if (abs >= 1000) return `${sign}R$${(abs / 1000).toFixed(1)}k`;
  return `${sign}R$${abs.toFixed(0)}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtMonth(s) {
  if (!s) return '—';
  const [y, m] = s.split('-');
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function toast(msg, type = 'info') {
  const cfg = { success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white', info: 'bg-slate-700 text-slate-100' };
  const el  = document.createElement('div');
  el.className = `fixed bottom-5 right-5 z-[999] px-4 py-3 rounded-xl text-sm font-medium shadow-xl transition-all duration-300 ${cfg[type] || cfg.info}`;
  el.style.cssText = 'transform:translateY(12px);opacity:0;';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; el.style.opacity = '1'; }));
  setTimeout(() => { el.style.transform = 'translateY(12px)'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2800);
}

// ============================================================
// UI STATE
// ============================================================

let currentSection = 'dashboard';
let editingBetId   = null;
let sortField      = 'date';
let sortDir        = 'desc';
let monthFilter    = '';

// ============================================================
// RENDER: DASHBOARD
// ============================================================

function renderDashboard() {
  const bets    = activeBets();          // respeita filtro de tempo
  const settled = Calc.settled(bets);
  const profit  = Calc.totalProfit(bets);
  const staked  = Calc.totalStaked(bets);
  const roi     = Calc.roi(bets);
  const wr      = Calc.winrate(bets);
  const avgOdds = Calc.avgOdds(bets);

  const bankrollInit = Settings.getBankroll();
  const bankrollCurr = +(bankrollInit + profit).toFixed(2);

  setKPI('kpi-profit',   'Profit / Loss',  fmtProfit(profit),      profit >= 0 ? 'emerald' : 'red',          'trending-up',  `${settled.length} apostas encerradas`);
  setKPI('kpi-staked',   'Total Apostado', fmtMoney(staked),       'blue',                                   'wallet',       `${bets.length} apostas no total`);
  setKPI('kpi-roi',      'ROI',            `${roi}%`,              roi >= 0 ? 'emerald' : 'red',             'percent',      'Retorno sobre o investido');
  setKPI('kpi-winrate',  'Winrate',        `${wr}%`,               wr >= 50 ? 'emerald' : 'orange',          'crosshair',    'Taxa de acerto');
  setKPI('kpi-bankroll', 'Banca Atual',    fmtMoney(bankrollCurr), bankrollCurr >= bankrollInit ? 'teal' : 'red', 'piggy-bank',
         bankrollInit > 0 ? `Inicial: ${fmtMoney(bankrollInit)}` : 'Configure em Configurações');
  setKPI('kpi-odds',     'Odd Média',      String(avgOdds),        'purple',                                 'bar-chart-2',  'Odds médias das apostas');

  // Destaques de mercado
  const mkData  = Calc.byMarket(bets).filter(m => m.count >= 3);
  const bestMkt = mkData[0] || null;
  const worstMkt = mkData.length > 1 ? [...mkData].sort((a, b) => a.roi - b.roi)[0] : null;
  const mkCard = (el, mkt, color, icon, label) => {
    if (!el) return;
    el.innerHTML = mkt
      ? `<div class="flex items-start justify-between h-full">
           <div class="flex-1 min-w-0">
             <p class="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">${icon} ${label}</p>
             <p class="text-sm font-bold ${color} leading-tight mb-1.5 truncate" title="${mkt.name}">${mkt.name}</p>
             <p class="text-[11px] text-slate-600">ROI ${mkt.roi}% · ${mkt.count} apostas</p>
           </div>
           <div class="text-right shrink-0 ml-2">
             <p class="text-sm font-bold ${color}">${fmtProfit(mkt.profit)}</p>
             <p class="text-[11px] text-slate-600">WR ${mkt.winrate}%</p>
           </div>
         </div>`
      : `<p class="text-slate-700 text-xs text-center py-4">Mín. 3 apostas encerradas.</p>`;
  };
  mkCard(document.getElementById('kpi-best-market'),  bestMkt,  'text-emerald-400', '🏆', 'Melhor Mercado');
  mkCard(document.getElementById('kpi-worst-market'), worstMkt, 'text-red-400',     '📉', 'Pior Mercado');

  // Insights
  const insightData = Insights.generate(bets);
  const colors = { positive: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', negative: 'bg-red-500/10 border-red-500/20 text-red-300', neutral: 'bg-slate-700/40 border-slate-700/60 text-slate-300' };
  const insightsList = document.getElementById('insights-list');
  if (insightsList) insightsList.innerHTML = insightData.map(ins =>
    `<div class="flex items-start gap-3 p-3 rounded-xl border ${colors[ins.type]}">
      <span class="text-lg leading-none mt-0.5">${ins.icon}</span>
      <p class="text-sm leading-relaxed">${ins.text}</p>
    </div>`
  ).join('');

  requestAnimationFrame(() => {
    Charts.bankEvolution(bets);
    Charts.drawdown(bets);
    lucide.createIcons();
  });
}

function setKPI(id, label, value, color, icon, sub) {
  const colors = { emerald:'text-emerald-400', red:'text-red-400', blue:'text-blue-400', orange:'text-orange-400', teal:'text-teal-400', purple:'text-purple-400' };
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
    <div class="flex items-start justify-between h-full">
      <div class="flex-1">
        <p class="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-2">${label}</p>
        <p class="text-xl font-bold ${colors[color] || 'text-slate-100'} leading-none mb-1.5">${value}</p>
        <p class="text-[11px] text-slate-600">${sub}</p>
      </div>
      <div class="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center shrink-0 ml-2">
        <i data-lucide="${icon}" class="w-3.5 h-3.5 text-slate-500"></i>
      </div>
    </div>`;
}

// ============================================================
// RENDER: BETS LIST
// ============================================================

function renderBetsList() {
  const bets = activeBets();
  const sorted = [...bets].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (['odds','stake','profit'].includes(sortField)) { va = parseFloat(va)||0; vb = parseFloat(vb)||0; return sortDir === 'desc' ? vb - va : va - vb; }
    return sortDir === 'desc' ? String(vb||'').localeCompare(String(va||'')) : String(va||'').localeCompare(String(vb||''));
  });

  const tbody = document.getElementById('bets-tbody');
  if (!tbody) return;
  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-20 text-center">
      <div class="flex flex-col items-center gap-3 text-slate-600">
        <i data-lucide="inbox" class="w-10 h-10 opacity-30"></i>
        <p class="text-sm">Nenhuma aposta no período selecionado.</p>
      </div>
    </td></tr>`;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = sorted.map(bet => {
    const sc      = STATUS_CONFIG[bet.status] || STATUS_CONFIG.pending;
    const pc      = bet.profit > 0 ? 'text-emerald-400' : bet.profit < 0 ? 'text-red-400' : 'text-slate-500';
    const pfmt    = (bet.status === 'pending' || bet.status === 'void') ? '—' : fmtProfit(bet.profit);
    const evtDisp = getEventDisplay(bet);
    return `<tr class="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors group">
      <td class="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">${fmtDate(bet.date)}</td>
      <td class="px-3 py-3 text-slate-400 text-xs max-w-[90px] truncate" title="${bet.league}">${bet.league}</td>
      <td class="px-3 py-3 text-slate-200 text-xs max-w-[160px] truncate" title="${evtDisp}">${evtDisp}</td>
      <td class="px-3 py-3 text-slate-400 text-xs max-w-[110px] truncate" title="${bet.market}">${bet.market}</td>
      <td class="px-3 py-3 font-mono text-xs text-slate-300">${parseFloat(bet.odds).toFixed(2)}</td>
      <td class="px-3 py-3 font-mono text-xs text-slate-300">${fmtMoney(bet.stake)}</td>
      <td class="px-3 py-3"><span class="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${sc.cls}">${sc.label}</span></td>
      <td class="px-3 py-3 font-mono font-semibold text-xs ${pc}">${pfmt}</td>
      <td class="px-3 py-3">
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="openEditModal('${bet.id}')" class="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-blue-400 transition-colors"><i data-lucide="pencil" class="w-3 h-3"></i></button>
          <button onclick="confirmDelete('${bet.id}')" class="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
  lucide.createIcons();
}

// ============================================================
// RENDER: ANALYSIS
// ============================================================

function renderAnalysis() {
  const bets     = activeBets();
  const byLeague = Calc.byLeague(bets);
  const byMarket = Calc.byMarket(bets);
  const byOdds   = Calc.byOddsRange(bets);

  const top3L   = byLeague.slice(0, 3);
  const worst3L = [...byLeague].reverse().filter(l => l.profit < 0).slice(0, 3);
  const top3M   = byMarket.filter(m => m.count >= 3).slice(0, 3);
  const noData  = '<p class="text-slate-600 text-sm py-4 text-center">Dados insuficientes. Mín.: 3 apostas encerradas.</p>';

  const elTopLeagues   = document.getElementById('top-leagues');
  const elWorstLeagues = document.getElementById('worst-leagues');
  const elTopMarkets   = document.getElementById('top-markets');
  const elOddsRanges   = document.getElementById('odds-ranges');

  if (elTopLeagues)   elTopLeagues.innerHTML   = top3L.length   ? top3L.map((l, i) => leagueCard(l, i, 'emerald')).join('') : noData;
  if (elWorstLeagues) elWorstLeagues.innerHTML = worst3L.length  ? worst3L.map((l, i) => leagueCard(l, i, 'red')).join('')  : '<p class="text-slate-600 text-sm py-4 text-center">Nenhuma liga com prejuízo. 🎉</p>';
  if (elTopMarkets)   elTopMarkets.innerHTML   = top3M.length   ? top3M.map((m, i) => marketCard(m, i)).join('')            : noData;

  if (elOddsRanges) elOddsRanges.innerHTML = byOdds.map(r => `
    <div class="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-semibold text-slate-200">${r.label}</span>
        <span class="text-[10px] text-slate-600 bg-slate-700/60 px-1.5 py-0.5 rounded-full">${r.count}</span>
      </div>
      ${r.count > 0 ? `
        <div class="space-y-1.5">
          <div class="flex justify-between text-xs"><span class="text-slate-500">ROI</span><span class="${r.roi>=0?'text-emerald-400':'text-red-400'} font-semibold">${r.roi}%</span></div>
          <div class="w-full h-1 bg-slate-700 rounded-full overflow-hidden"><div class="h-full rounded-full ${r.roi>=0?'bg-emerald-500':'bg-red-500'}" style="width:${Math.min(Math.abs(r.roi),100)}%"></div></div>
          <div class="flex justify-between text-xs mt-1"><span class="text-slate-600">Winrate</span><span class="text-slate-400">${r.winrate}%</span></div>
        </div>` : '<p class="text-slate-700 text-xs text-center py-2">Sem apostas</p>'}
    </div>`).join('');

  renderMarketAnalysis(bets);
  lucide.createIcons();
}

// Performance por Mercado — tabela completa + piores mercados
function renderMarketAnalysis(bets) {
  const allMarkets  = Calc.byMarket(bets);
  const topMarkets  = allMarkets.filter(m => m.count >= 3).slice(0, 12);
  const worstMarkets = [...allMarkets]
    .filter(m => m.profit < 0 && m.count >= 3)
    .sort((a, b) => a.roi - b.roi)
    .slice(0, 5);

  const elMarketRows = document.getElementById('market-rows');
  if (elMarketRows) elMarketRows.innerHTML = topMarkets.length
    ? topMarkets.map((m, i) => `
      <tr class="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center">${i+1}</span>
            <span class="text-sm text-slate-200 font-medium">${m.name}</span>
          </div>
        </td>
        <td class="px-4 py-3 text-slate-500 text-sm">${m.count}</td>
        <td class="px-4 py-3 text-sm font-semibold font-mono ${m.roi>=0?'text-emerald-400':'text-red-400'}">${m.roi}%</td>
        <td class="px-4 py-3 text-sm text-slate-400">${m.winrate}%</td>
        <td class="px-4 py-3 font-mono font-semibold text-sm ${m.profit>=0?'text-emerald-400':'text-red-400'}">${fmtProfit(m.profit)}</td>
      </tr>`)
    .join('')
    : '<tr><td colspan="5" class="text-center py-8 text-slate-700 text-sm">Nenhum mercado com 3+ apostas encerradas ainda.</td></tr>';

  const elWorstMkts = document.getElementById('worst-markets-list');
  if (elWorstMkts) elWorstMkts.innerHTML = worstMarkets.length
    ? worstMarkets.map((m, i) => `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40">
        <span class="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold shrink-0">${i+1}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-slate-200 truncate">${m.name}</p>
          <p class="text-[11px] text-slate-600 mt-0.5">${m.count} apostas · WR ${m.winrate}%</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-sm font-semibold text-red-400">ROI ${m.roi}%</p>
          <p class="text-[11px] text-slate-600">${fmtProfit(m.profit)}</p>
        </div>
      </div>`)
    .join('')
    : '<p class="text-slate-600 text-sm py-4 text-center">Nenhum mercado com prejuízo. 🎉</p>';
}

function leagueCard(l, i, color) {
  const num = `w-6 h-6 rounded-full bg-${color}-500/20 text-${color}-400 flex items-center justify-center text-xs font-bold`;
  const val = `text-sm font-semibold ${color==='emerald'?'text-emerald-400':'text-red-400'}`;
  return `<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40">
    <span class="${num}">${i+1}</span>
    <div class="flex-1 min-w-0"><p class="text-sm text-slate-200 truncate">${l.name}</p><p class="text-[11px] text-slate-600 mt-0.5">${l.count} apostas · WR ${l.winrate}%</p></div>
    <div class="text-right shrink-0"><p class="${val}">${fmtProfit(l.profit)}</p><p class="text-[11px] text-slate-600">ROI ${l.roi}%</p></div>
  </div>`;
}

function marketCard(m, i) {
  const rc = m.roi >= 0 ? 'text-emerald-400' : 'text-red-400';
  return `<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40">
    <span class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">${i+1}</span>
    <div class="flex-1 min-w-0"><p class="text-sm text-slate-200 truncate">${m.name}</p><p class="text-[11px] text-slate-600 mt-0.5">${m.count} apostas</p></div>
    <div class="text-right shrink-0"><p class="text-sm font-semibold ${rc}">ROI ${m.roi}%</p><p class="text-[11px] text-slate-600">${fmtProfit(m.profit)}</p></div>
  </div>`;
}

// ============================================================
// RENDER: MONTHLY
// ============================================================

function renderMonthly() {
  const bets    = activeBets();
  const monthly = Calc.byMonth(bets);

  const filterEl = document.getElementById('month-filter');
  const prev     = filterEl.value;
  filterEl.innerHTML = '<option value="">Todos os meses</option>'
    + monthly.map(m => `<option value="${m.month}" ${m.month === monthFilter ? 'selected' : ''}>${fmtMonth(m.month)}</option>`).join('');
  if (prev) filterEl.value = prev;

  const filtered = monthFilter ? monthly.filter(m => m.month === monthFilter) : monthly;
  if (!filtered.length) {
    document.getElementById('monthly-rows').innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-700 text-sm">Sem dados para o período selecionado.</td></tr>';
    return;
  }

  const totalP = filtered.reduce((s, m) => s + m.profit, 0);
  const avgRoi = filtered.length ? +(filtered.reduce((s, m) => s + m.roi, 0) / filtered.length).toFixed(2) : 0;

  const profitEl = document.getElementById('monthly-profit');
  profitEl.textContent = fmtProfit(totalP);
  profitEl.className   = `text-2xl font-bold ${totalP >= 0 ? 'text-emerald-400' : 'text-red-400'}`;

  const roiEl = document.getElementById('monthly-roi');
  roiEl.textContent = `${avgRoi}%`;
  roiEl.className   = `text-2xl font-bold ${avgRoi >= 0 ? 'text-blue-400' : 'text-orange-400'}`;

  document.getElementById('monthly-rows').innerHTML = filtered.map(m => `
    <tr class="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
      <td class="px-4 py-3 text-slate-200 font-medium text-sm">${fmtMonth(m.month)}</td>
      <td class="px-4 py-3 text-slate-500 text-sm">${m.count}</td>
      <td class="px-4 py-3 font-mono text-sm text-slate-400">${fmtMoney(m.staked)}</td>
      <td class="px-4 py-3 font-mono font-semibold text-sm ${m.profit>=0?'text-emerald-400':'text-red-400'}">${fmtProfit(m.profit)}</td>
      <td class="px-4 py-3 text-sm font-semibold ${m.roi>=0?'text-emerald-400':'text-red-400'}">${m.roi}%</td>
      <td class="px-4 py-3 text-sm text-slate-400">${m.winrate}%</td>
    </tr>`).join('');

  requestAnimationFrame(() => Charts.monthly(filtered));
}

// ============================================================
// PRESETS — chips de preenchimento rápido
// ============================================================

function renderPresets() {
  const bets = DB.getBets();
  if (!bets.length) {
    document.getElementById('preset-leagues').innerHTML = '';
    document.getElementById('preset-markets').innerHTML = '';
    return;
  }

  const top = (field, max = 4) => {
    const counts = {};
    bets.forEach(b => { if (b[field]) counts[b[field]] = (counts[b[field]] || 0) + 1; });
    return Object.entries(counts).sort(([,a],[,b]) => b-a).slice(0, max).map(([k]) => k);
  };

  const PRESET_FIELD = { 'preset-leagues': 'f-league', 'preset-markets': 'f-market' };
  const chips = (items, targetId) => {
    const fieldId = PRESET_FIELD[targetId];
    document.getElementById(targetId).innerHTML = items.map(v =>
      `<button type="button" class="chip" onclick="document.getElementById('${fieldId}').value='${v.replace(/'/g,"\\'")}';this.closest('.preset-row').querySelectorAll('.chip').forEach(c=>c.classList.remove('chip-active'));this.classList.add('chip-active')">${v}</button>`
    ).join('');
  };

  chips(top('league'), 'preset-leagues');
  chips(top('market'), 'preset-markets');
}

// ============================================================
// UX: REPETIR ÚLTIMA APOSTA
// ============================================================

function repeatLastBet() {
  const bets = DB.getBets();
  if (!bets.length) { toast('Nenhuma aposta para repetir.', 'error'); return; }

  const last = [...bets].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  openAddModal();

  setTimeout(() => {
    document.getElementById('f-league').value   = last.league   || '';
    document.getElementById('f-market').value   = last.market   || '';
    document.getElementById('f-odds').value     = last.odds     || '';
    document.getElementById('f-stake').value    = last.stake    || '';
    document.getElementById('f-homeTeam').value = last.homeTeam || '';
    document.getElementById('f-awayTeam').value = last.awayTeam || '';
    updatePreview();
  }, 80);

  toast('Formulário preenchido com a última aposta.', 'info');
}

// ============================================================
// STATUS BUTTONS & STAKE QUICK ADD
// ============================================================

const STATUS_ACTIVE_CLS = {
  pending:    's-active-pending',
  green:      's-active-green',
  red:        's-active-red',
  half_green: 's-active-half_green',
  half_red:   's-active-half_red',
  void:       's-active-void'
};

function setStatus(value) {
  const hiddenInput = document.getElementById('f-status');
  if (hiddenInput) hiddenInput.value = value;
  document.querySelectorAll('.status-btn').forEach(btn => {
    Object.values(STATUS_ACTIVE_CLS).forEach(c => btn.classList.remove(c));
    const cls = STATUS_ACTIVE_CLS[btn.dataset.status];
    if (btn.dataset.status === value && cls) btn.classList.add(cls);
  });
  if (typeof updatePreview === 'function') updatePreview();
}

function addStake(amount) {
  const el = document.getElementById('f-stake');
  if (!el) return;
  el.value = ((parseFloat(el.value) || 0) + amount).toFixed(2);
  if (typeof updatePreview === 'function') updatePreview();
}

// ============================================================
// MODAL: ADD / EDIT BET
// ============================================================

function openAddModal() {
  editingBetId = null;
  document.getElementById('modal-title').textContent = 'Nova Aposta';
  document.getElementById('bet-form').reset();
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  setStatus('pending');
  renderPresets();
  showModal();
  setTimeout(() => document.getElementById('f-league').focus(), 120);
}

function openEditModal(id) {
  const bet = DB.getBets().find(b => b.id === id);
  if (!bet) return;
  editingBetId = id;
  document.getElementById('modal-title').textContent = 'Editar Aposta';
  document.getElementById('f-date').value   = bet.date;
  document.getElementById('f-league').value = bet.league;
  document.getElementById('f-market').value = bet.market;
  document.getElementById('f-odds').value   = bet.odds;
  document.getElementById('f-stake').value  = bet.stake;
  setStatus(bet.status);

  // Retrocompat: homeTeam/awayTeam separados (novo) ou event legado
  document.getElementById('f-homeTeam').value = bet.homeTeam || bet.event || '';
  document.getElementById('f-awayTeam').value = bet.awayTeam || '';

  renderPresets();
  showModal();
}

function showModal() {
  const m = document.getElementById('bet-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const m = document.getElementById('bet-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
  document.body.style.overflow = '';
  editingBetId = null;
}

function submitForm(e) {
  e.preventDefault();
  const homeTeam = document.getElementById('f-homeTeam').value.trim();
  const awayTeam = document.getElementById('f-awayTeam').value.trim();
  if (!homeTeam) { toast('Preencha pelo menos o time/participante da Casa.', 'error'); return; }

  const data = {
    date:     document.getElementById('f-date').value,
    league:   document.getElementById('f-league').value.trim(),
    homeTeam,
    awayTeam,
    market:   document.getElementById('f-market').value.trim(),
    odds:     parseFloat(document.getElementById('f-odds').value),
    stake:    parseFloat(document.getElementById('f-stake').value),
    status:   document.getElementById('f-status').value
  };

  if (!data.date || !data.league || !data.market) { toast('Preencha Data, Liga e Mercado.', 'error'); return; }
  if (isNaN(data.odds) || data.odds < 1.01)        { toast('Odd inválida. Mínimo: 1.01', 'error'); return; }
  if (isNaN(data.stake) || data.stake <= 0)         { toast('Stake inválido.', 'error'); return; }

  if (editingBetId) {
    DB.updateBet(editingBetId, data);
    toast('Aposta atualizada!', 'success');
  } else {
    DB.addBet(data);
    toast('Aposta registrada!', 'success');
  }

  closeModal();
  refreshCurrent();
}

async function confirmDelete(id) {
  // Captura o objeto ANTES de qualquer remoção — necessário para ter o supabase_id
  const bet = DB.getBets().find(b => b.id === id);
  if (!bet) return;
  if (!confirm(`Excluir "${getEventDisplay(bet)}"?\nEsta ação não pode ser desfeita.`)) return;

  // Optimistic UI: remove imediatamente da tela
  const backup = DB.getBets();
  DB.saveBets(backup.filter(b => b.id !== id));
  refreshCurrent();

  try {
    // Passa o objeto bet (já capturado acima), não o id — evita busca após remoção
    await DB.deleteBet(bet);
    toast('Aposta excluída.', 'info');
  } catch {
    // Rollback: restaura os dados e avisa o usuário
    DB.saveBets(backup);
    refreshCurrent();
    toast('Erro ao excluir. Tente novamente.', 'error');
  }
}

// ============================================================
// UTILITIES
// ============================================================

function exportData() {
  const bets = DB.getBets();
  if (!bets.length) { toast('Nenhum dado para exportar.', 'error'); return; }
  const blob = new Blob([JSON.stringify(bets, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `registrabet_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast(`${bets.length} apostas exportadas!`, 'success');
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error();
      const current = DB.getBets();
      let added = 0;
      const merged = [...current];
      const existingIds = new Set(current.map(b => b.id));
      data.forEach(bet => {
        if (!existingIds.has(bet.id)) {
          existingIds.add(bet.id);
          merged.push({ ...bet, profit: Calc.betProfit(bet) });
          added++;
        }
      });
      DB.saveBets(merged);
      toast(`${added} aposta(s) importada(s)!`, 'success');
      refreshCurrent();
    } catch { toast('Arquivo inválido. Use um JSON exportado pelo Registrabet.', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ============================================================
// CSV IMPORT
// Formato esperado: Data;Campeonato;Mandante;Visitante;Mercado;Unidade;Odds;Tipo;Situação;Retorno
// ============================================================

// Higieniza números do CSV:
//   "2,50u" → remove "u" → "2,50" → troca "," por "." → parseFloat → 2.5
//   "1.85"  → sem alteração                            → 1.85
//   ""      → NaN → retorna 0 (evita quebras de cálculo)
function _csvNum(raw) {
  if (raw == null) return 0;
  const n = parseFloat(String(raw).trim().replace(/u/gi, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Converte DD/MM/YYYY → YYYY-MM-DD (padrão ISO interno do app).
// Se a string já estiver em outro formato, retorna como está.
function _csvDate(raw) {
  const s = (raw || '').trim();
  const p = s.split('/');
  if (p.length === 3) {
    const [d, m, y] = p;
    return `${y.trim()}-${m.trim().padStart(2,'0')}-${d.trim().padStart(2,'0')}`;
  }
  return s;
}

// Mapeia o texto da coluna Situação para os valores internos do app.
function _csvStatus(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'green')   return 'green';
  if (s === 'red')     return 'red';
  if (s === 'void' || s === 'anulada') return 'void';
  // suporte a "½ green", "half green", "half_green", "meio green"
  if (s.includes('½') || s.includes('half') || s.includes('meio')) {
    return s.includes('red') ? 'half_red' : 'half_green';
  }
  return 'pending'; // vazio ou não reconhecido
}

// ── Normaliza um header para comparação: uppercase, sem acentos, sem espaços ──
function _normalizeHeader(h) {
  return String(h || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    .replace(/\s+/g, '');                              // remove espaços
}

// ── Mapeamento: campo interno → variações aceitas no header ──────────────────
const CSV_COLUMN_MAP = {
  date:     ['DATA'],
  league:   ['LIGA', 'CAMPEONATO', 'COMPETICAO', 'COMPETITION'],
  homeTeam: ['MANDANTE', 'TIMEMANDANTE', 'HOME', 'HOMETEAM', 'CASA'],
  awayTeam: ['VISITANTE', 'TIMEVISITANTE', 'AWAY', 'AWAYTEAM', 'FORA'],
  market:   ['MERCADO', 'MARKET', 'TIPO'],
  odds:     ['ODD', 'ODDS', 'COTA'],
  stake:    ['STAKE', 'UNIDADE', 'VALOR', 'APOSTA', 'UNIDADES'],
  status:   ['STATUS', 'SITUACAO', 'RESULTADO'],
  profit:   ['RETORNO', 'PROFIT', 'LUCRO'],
};

// ── Lê a linha de headers e devolve { campo: índice } ────────────────────────
function _buildColumnIndex(headerRow) {
  const normalized = headerRow.map(_normalizeHeader);
  const idx = {};
  for (const [field, aliases] of Object.entries(CSV_COLUMN_MAP)) {
    const col = normalized.findIndex(h => aliases.includes(h));
    if (col !== -1) idx[field] = col;
  }
  return idx;
}

function handleCSVImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const ext     = file.name.split('.').pop().toLowerCase();
  const isExcel = ext === 'xls' || ext === 'xlsx';
  const reader  = new FileReader();

  reader.onload = ev => {
    let allRows = []; // inclui linha de header na posição 0

    try {
      if (isExcel) {
        if (!window.XLSX) throw new Error('SheetJS não carregou. Recarregue a página.');
        const wb  = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        allRows   = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'DD/MM/YYYY' });
      } else {
        const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim());
        allRows     = lines.map(l => l.split(';').map(v => v.trim()));
      }
    } catch (err) {
      toast(`Erro ao ler arquivo: ${err.message}`, 'error');
      e.target.value = '';
      return;
    }

    if (allRows.length < 2) {
      toast('Arquivo sem dados. Verifique se há linhas abaixo do cabeçalho.', 'error');
      e.target.value = '';
      return;
    }

    // Monta índice dinâmico a partir dos headers reais do arquivo
    const colIdx = _buildColumnIndex(allRows[0]);

    // Valida campos obrigatórios
    const missing = ['date', 'odds', 'stake', 'status'].filter(f => !(f in colIdx));
    if (missing.length) {
      toast(`Colunas obrigatórias não encontradas: ${missing.join(', ')}.\nVerifique os headers da planilha.`, 'error');
      e.target.value = '';
      return;
    }

    const dataRows    = allRows.slice(1).filter(r => r.some(c => String(c || '').trim()));
    let   successCount = 0;
    const failedLines  = [];
    const newBets      = [];

    const col = (row, field) => String(row[colIdx[field]] ?? '').trim();

    dataRows.forEach((row, idx) => {
      const lineNum = idx + 2;
      try {
        const date     = _csvDate(col(row, 'date'));
        const league   = col(row, 'league');
        const homeTeam = col(row, 'homeTeam') || 'N/A';
        const awayTeam = col(row, 'awayTeam') || 'N/A';
        const market   = col(row, 'market');
        const odds     = _csvNum(col(row, 'odds'));
        const stake    = _csvNum(col(row, 'stake'));
        const status   = _csvStatus(col(row, 'status'));
        const rawProfit = col(row, 'profit');
        const profit   = rawProfit !== ''
          ? _csvNum(rawProfit)
          : Calc.betProfit({ odds, stake, status });

        if (!date)    throw new Error(`data inválida: "${col(row, 'date')}"`);
        if (odds < 1) throw new Error(`odd inválida: "${col(row, 'odds')}" — verifique se as colunas ODD e STAKE não estão invertidas`);
        if (stake <= 0) throw new Error(`stake inválido: "${col(row, 'stake')}"`);

        newBets.push({
          id: crypto.randomUUID(),
          date, league, homeTeam, awayTeam, market,
          stake, odds, status, profit
        });
        successCount++;

      } catch (err) {
        failedLines.push(`  • Linha ${lineNum}: ${err.message}`);
      }
    });

    if (!newBets.length) {
      toast('Nenhuma aposta válida encontrada.', 'error');
      e.target.value = '';
      return;
    }

    DB.saveBets([...DB.getBets(), ...newBets]);
    newBets.forEach(bet => saveBetToCloud(bet));

    let msg = `✅ Importação concluída!\n\n  ${successCount} aposta(s) importada(s).`;
    if (failedLines.length) {
      msg += `\n\n⚠️ ${failedLines.length} linha(s) ignorada(s):\n`
           + failedLines.join('\n')
           + '\n\nCorrija as linhas indicadas e reimporte apenas elas.';
    }
    alert(msg);

    e.target.value = '';
    refreshCurrent();
  };

  if (isExcel) reader.readAsArrayBuffer(file);
  else         reader.readAsText(file, 'UTF-8');
}

function clearAll() {
  if (!confirm('⚠️ Apagar TODOS os dados permanentemente?\n\nEsta ação é irreversível.')) return;
  if (!confirm('Confirmação final: todos os dados serão perdidos.')) return;
  DB.clear();
  toast('Todos os dados foram removidos.', 'info');
  refreshCurrent();
}

function saveBankroll() {
  const val = parseFloat(document.getElementById('s-bankroll')?.value || 0);
  if (isNaN(val) || val < 0) { toast('Valor inválido para a banca.', 'error'); return; }
  Settings.setBankroll(val);
  toast(`Banca inicial de ${fmtMoney(val)} salva!`, 'success');
}

function renderSettings() {
  const el = document.getElementById('s-bankroll');
  if (el) el.value = Settings.getBankroll() || '';
}

// Exportar PDF Premium com html2pdf.js
function exportPDF() {
  const bets    = activeBets();
  const settled = Calc.settled(bets);
  if (!bets.length) { toast('Nenhum dado para gerar relatório.', 'error'); return; }

  const profit   = Calc.totalProfit(bets);
  const roi      = Calc.roi(bets);
  const wr       = Calc.winrate(bets);
  const staked   = Calc.totalStaked(bets);
  const avgOdds  = Calc.avgOdds(bets);
  const byMarket = Calc.byMarket(bets).filter(m => m.count >= 3).slice(0, 8);
  const bankrollInit = Settings.getBankroll();
  const period   = { all: 'Todo o período', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', month: 'Mês atual' }[timeFilter] || 'Todo o período';

  // Conclusão automática baseada no desempenho
  let conclusion = '';
  if (roi > 10)       conclusion = `Desempenho excepcional com ROI de ${roi}%. Mantenha a disciplina e o foco nos mercados mais rentáveis.`;
  else if (roi > 5)   conclusion = `Desempenho positivo com ROI de ${roi}%. Foque em manter a consistência e expandir nos mercados lucrativas.`;
  else if (roi > 0)   conclusion = `Desempenho estável com ROI de ${roi}%. Foco em manter o ROI acima de 5% aprimorando a seleção de mercados.`;
  else if (roi > -10) conclusion = `Desempenho levemente negativo (ROI ${roi}%). Revise os mercados com mais prejuízo e reduza o stake nesses casos.`;
  else                conclusion = `Situação crítica com ROI de ${roi}%. Pause e reavalie toda a seleção de mercados antes de continuar.`;

  const mktRows = byMarket.map(m =>
    `<tr style="border-bottom:1px solid #1e293b">
      <td style="padding:8px 14px;color:#e2e8f0;font-weight:500">${m.name}</td>
      <td style="padding:8px 14px;color:#94a3b8;text-align:center">${m.count}</td>
      <td style="padding:8px 14px;color:${m.roi>=0?'#10b981':'#ef4444'};font-weight:700;text-align:center">${m.roi}%</td>
      <td style="padding:8px 14px;color:#94a3b8;text-align:center">${m.winrate}%</td>
      <td style="padding:8px 14px;color:${m.profit>=0?'#10b981':'#ef4444'};font-weight:700;text-align:right">${fmtProfit(m.profit)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="padding:16px;color:#475569;text-align:center">Nenhum mercado com 3+ apostas</td></tr>';

  const el = document.createElement('div');
  el.style.cssText = 'background:#060d1a;color:#f1f5f9;font-family:ui-sans-serif,system-ui,sans-serif;padding:48px;width:794px';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #1e3a5f">
      <div style="width:42px;height:42px;background:linear-gradient(135deg,#059669,#047857);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 12px rgba(5,150,105,0.3)">📈</div>
      <div>
        <h1 style="font-size:22px;font-weight:800;margin:0;color:#f1f5f9;letter-spacing:-0.02em">Registrabet</h1>
        <p style="font-size:11px;color:#475569;margin:3px 0 0">Relatório de Performance · ${period} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:32px">
      ${[
        ['Profit / Loss',       fmtProfit(profit),        profit>=0?'#10b981':'#ef4444'],
        ['Total Apostado',      fmtMoney(staked),         '#60a5fa'],
        ['ROI',                 `${roi}%`,                roi>=0?'#10b981':'#ef4444'],
        ['Winrate',             `${wr}%`,                 wr>=50?'#10b981':'#f97316'],
        ['Odd Média',           String(avgOdds),          '#a78bfa'],
        ['Apostas Encerradas',  String(settled.length),   '#94a3b8'],
      ].map(([lbl, val, color]) =>
        `<div style="background:#0a1628;border:1px solid #1a2744;border-radius:12px;padding:18px">
          <p style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.07em;margin:0 0 8px">${lbl}</p>
          <p style="font-size:20px;font-weight:700;color:${color};margin:0;letter-spacing:-0.01em">${val}</p>
        </div>`).join('')}
    </div>

    ${bankrollInit > 0 ? `
    <div style="background:#0a1628;border:1px solid #1a2744;border-radius:12px;padding:16px 20px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.05em">Banca Inicial</span>
      <span style="font-size:16px;font-weight:700;color:#60a5fa">${fmtMoney(bankrollInit)}</span>
      <span style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.05em">Banca Atual</span>
      <span style="font-size:16px;font-weight:700;color:${profit>=0?'#10b981':'#ef4444'}">${fmtMoney(bankrollInit + profit)}</span>
    </div>` : ''}

    <h2 style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin:0 0 14px;padding-top:4px">Performance por Mercado</h2>
    <table style="width:100%;border-collapse:collapse;background:#0a1628;border-radius:12px;overflow:hidden;margin-bottom:28px">
      <thead><tr style="background:#0f172a;border-bottom:1px solid #1e293b">
        <th style="padding:10px 14px;text-align:left;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.05em">Mercado</th>
        <th style="padding:10px 14px;text-align:center;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.05em">Apostas</th>
        <th style="padding:10px 14px;text-align:center;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.05em">ROI</th>
        <th style="padding:10px 14px;text-align:center;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.05em">Winrate</th>
        <th style="padding:10px 14px;text-align:right;font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.05em">Profit</th>
      </tr></thead>
      <tbody>${mktRows}</tbody>
    </table>

    <div style="background:${roi>=0?'rgba(16,185,129,0.06)':'rgba(239,68,68,0.06)'};border:1px solid ${roi>=0?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'};border-radius:12px;padding:18px 22px;margin-bottom:28px">
      <p style="font-size:10px;font-weight:700;color:${roi>=0?'#10b981':'#ef4444'};text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">💡 Conclusão Automática</p>
      <p style="font-size:13px;color:#cbd5e1;margin:0;line-height:1.6">${conclusion}</p>
    </div>

    <p style="margin-top:24px;font-size:10px;color:#1e3a5f;text-align:center">Registrabet · Gestão Profissional de Apostas · Dados armazenados localmente</p>`;

  document.body.appendChild(el);

  if (typeof html2pdf === 'undefined') {
    toast('Biblioteca PDF não carregada. Verifique conexão com internet.', 'error');
    el.remove(); return;
  }

  html2pdf()
    .set({
      margin: 0,
      filename: `Registrabet_Relatorio_${new Date().toISOString().slice(0,10)}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#060d1a', useCORS: true },
      jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' }
    })
    .from(el)
    .save()
    .then(() => { el.remove(); toast('Relatório PDF gerado!', 'success'); })
    .catch(() => { el.remove(); toast('Erro ao gerar PDF.', 'error'); });
}

// ============================================================
// NAVIGATION
// ============================================================

function showSection(name) {
  currentSection = name;
  const sections = ['dashboard','bets','analysis','monthly','settings'];

  sections.forEach(s => {
    document.getElementById(`sec-${s}`)?.classList.add('hidden');
    document.getElementById(`nav-${s}`)?.classList.remove('active');
    document.getElementById(`nav-${s}-m`)?.classList.remove('active');
  });

  document.getElementById(`sec-${name}`)?.classList.remove('hidden');
  document.getElementById(`nav-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}-m`)?.classList.add('active');

  switch (name) {
    case 'dashboard': renderDashboard(); break;
    case 'bets':      renderBetsList();  break;
    case 'analysis':  renderAnalysis();  break;
    case 'monthly':   renderMonthly();   break;
    case 'settings':  renderSettings();  break;
  }
}

function refreshCurrent() { showSection(currentSection); }

// ============================================================
// APP INITIALIZATION
// ============================================================

function initApp() {
  // Migração silenciosa de apostas antigas com campo 'strategy'
  migrateBets();

  // Formulário
  document.getElementById('bet-form').addEventListener('submit', submitForm);

  // Modal backdrop
  document.getElementById('bet-modal').addEventListener('click', e => {
    if (e.target.id === 'bet-modal') closeModal();
  });

  // Sort de colunas
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const f = th.dataset.sort;
      sortDir   = sortField === f ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
      sortField = f;
      renderBetsList();
    });
  });

  // Filtro mensal
  document.getElementById('month-filter').addEventListener('change', e => {
    monthFilter = e.target.value;
    renderMonthly();
  });

  // Import
  document.getElementById('import-file').addEventListener('change', handleImport);
  // ── Importar planilha XLS/CSV ──────────────────────────────
  const csvInput   = document.getElementById('import-csv-file');
  const csvLabel   = document.getElementById('csv-drop-zone');
  const csvNameEl  = document.getElementById('csv-file-name');

  csvInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (f && csvNameEl) {
      csvNameEl.textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`;
      csvNameEl.classList.replace('text-slate-600', 'text-teal-400');
    }
    handleCSVImport(e);
  });

  // Drag-and-drop na drop zone
  if (csvLabel) {
    csvLabel.addEventListener('dragover', e => {
      e.preventDefault();
      csvLabel.classList.add('border-teal-500/70', 'bg-teal-950/50');
    });
    csvLabel.addEventListener('dragleave', () => {
      csvLabel.classList.remove('border-teal-500/70', 'bg-teal-950/50');
    });
    csvLabel.addEventListener('drop', e => {
      e.preventDefault();
      csvLabel.classList.remove('border-teal-500/70', 'bg-teal-950/50');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      // injeta o arquivo no input e dispara o handler
      const dt = new DataTransfer();
      dt.items.add(file);
      csvInput.files = dt.files;
      csvInput.dispatchEvent(new Event('change'));
    });
  }

  // Autocomplete — campos do formulário
  new AutocompleteInput(document.getElementById('f-league'),   LEAGUES,  { getExtra: () => [...new Set(DB.getBets().map(b => b.league).filter(Boolean))] });
  new AutocompleteInput(document.getElementById('f-homeTeam'), [],       { getExtra: () => [...new Set(DB.getBets().flatMap(b => [b.homeTeam, b.awayTeam]).filter(Boolean))], maxItems: 10 });
  new AutocompleteInput(document.getElementById('f-awayTeam'), [],       { getExtra: () => [...new Set(DB.getBets().flatMap(b => [b.homeTeam, b.awayTeam]).filter(Boolean))], maxItems: 10 });
  new AutocompleteInput(document.getElementById('f-market'),   MARKETS,  { getExtra: () => [...new Set(DB.getBets().map(b => b.market).filter(Boolean))] });

  // Sync entre abas: quando outra aba salva/deleta no localStorage,
  // atualiza a UI desta aba automaticamente
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) refreshCurrent();
  });

  lucide.createIcons();
  showSection('dashboard');
}

document.addEventListener('DOMContentLoaded', initAuth);
