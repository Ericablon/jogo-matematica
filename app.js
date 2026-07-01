const app = document.getElementById("app");

const STORAGE_KEY = "matematica_em_fases_v4";
const LEVELS_PER_WORLD = 10;
const QUESTIONS_PER_LEVEL = 10;
const ADMIN_TEACHER_NAME = "eric-ablon-dos-santos-cerqueira";
const ADMIN_TEACHER_PASSWORD = "2985";
const ADMIN_TEACHER_FULL_NAME = "ERIC ABLON DOS SANTOS CERQUEIRA";

const difficulties = {
  facil: { label: "Fácil", multiplier: 1 },
  media: { label: "Média", multiplier: 2 },
  dificil: { label: "Difícil", multiplier: 3 },
  super: { label: "Super difícil", multiplier: 5 }
};

const worlds = [
  { id: "soma", name: "Soma", emoji: "+", description: "Contas de adição por fase.", operation: "add" },
  { id: "subtracao", name: "Subtração", emoji: "-", description: "Contas de subtração com dificuldade progressiva.", operation: "subtract" },
  { id: "multiplicacao", name: "Multiplicação", emoji: "×", description: "Treino de tabuada e multiplicação.", operation: "multiply" },
  { id: "divisao", name: "Divisão", emoji: "÷", description: "Divisões exatas para praticar.", operation: "divide" },
  { id: "misto", name: "Misto", emoji: "★", description: "Soma, divisão, multiplicação e desafios combinados.", operation: "mixed" }
];

let data = loadData();

let state = {
  screen: "login",
  currentUserId: null,
  role: null,
  difficulty: "facil",
  currentWorldId: null,
  currentLevel: null,
  questions: [],
  questionIndex: 0,
  lives: 3,
  score: 0,
  correct: 0,
  wrong: 0,
  answered: false,
  selectedAnswer: null,
  feedback: "",
  loginMode: "student",
  loginName: "",
  loginError: "",
  adminMessage: "",
  adminMessageType: "success"
};

function loadData() {
  return { students: {}, teachers: {} };
}

function saveData() {
  data = normalizeData(data);
  scheduleCloudSave();
}


function getSupabaseClient() {
  return window.supabaseClient || window.cliente_supabase || window.sb || null;
}

function canUseSupabase() {
  return Boolean(
    getSupabaseClient() &&
    window.SUPABASE_ANON_KEY &&
    !String(window.SUPABASE_ANON_KEY).includes("COLE_AQUI")
  );
}

function normalizeData(value) {
  return {
    students: value?.students || {},
    teachers: value?.teachers || {}
  };
}

function mergeProgress(localProgress = emptyProgress(), cloudProgress = emptyProgress()) {
  const merged = {
    completed: {},
    attempts: [...(cloudProgress.attempts || []), ...(localProgress.attempts || [])],
    lastPlayed: localProgress.lastPlayed || cloudProgress.lastPlayed || null
  };

  const localCompleted = localProgress.completed || {};
  const cloudCompleted = cloudProgress.completed || {};
  const allKeys = new Set([...Object.keys(cloudCompleted), ...Object.keys(localCompleted)]);

  allKeys.forEach((key) => {
    const localItem = localCompleted[key];
    const cloudItem = cloudCompleted[key];

    if (!localItem) {
      merged.completed[key] = cloudItem;
      return;
    }

    if (!cloudItem) {
      merged.completed[key] = localItem;
      return;
    }

    merged.completed[key] = {
      ...cloudItem,
      ...localItem,
      passed: Boolean(cloudItem.passed || localItem.passed),
      stars: Math.max(cloudItem.stars || 0, localItem.stars || 0),
      bestScore: Math.max(cloudItem.bestScore || 0, localItem.bestScore || 0),
      bestCorrect: Math.max(cloudItem.bestCorrect || 0, localItem.bestCorrect || 0),
      updatedAt: localItem.updatedAt || cloudItem.updatedAt || new Date().toISOString()
    };
  });

  const seenAttempts = new Set();
  merged.attempts = merged.attempts
    .filter((item) => {
      const key = `${item.worldId}|${item.level}|${item.difficulty}|${item.correct}|${item.wrong}|${item.score}|${item.date}`;
      if (seenAttempts.has(key)) return false;
      seenAttempts.add(key);
      return true;
    })
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  return merged;
}

function mergeCloudData(localData, cloudData) {
  const merged = normalizeData(localData);

  Object.entries(cloudData.students || {}).forEach(([id, cloudStudent]) => {
    const localStudent = merged.students[id];
    merged.students[id] = {
      ...cloudStudent,
      ...localStudent,
      progress: mergeProgress(localStudent?.progress, cloudStudent?.progress),
      updatedAt: localStudent?.updatedAt || cloudStudent?.updatedAt || new Date().toISOString()
    };
  });

  Object.entries(cloudData.teachers || {}).forEach(([id, cloudTeacher]) => {
    const localTeacher = merged.teachers[id];
    merged.teachers[id] = {
      ...cloudTeacher,
      ...localTeacher,
      progress: mergeProgress(localTeacher?.progress, cloudTeacher?.progress),
      updatedAt: localTeacher?.updatedAt || cloudTeacher?.updatedAt || new Date().toISOString()
    };
  });

  return merged;
}

async function loadDataFromSupabase() {
  data = { students: {}, teachers: {} };

  if (!canUseSupabase()) {
    console.error("Supabase não configurado. Confira o arquivo supabase-config.js.");
    return data;
  }

  const client = getSupabaseClient();

  try {
    const [{ data: studentsRows, error: studentsError }, { data: teachersRows, error: teachersError }] = await Promise.all([
      client.from("math_students").select("id, full_name, progress, created_at, updated_at"),
      client.from("math_teachers").select("id, full_name, password, active, progress, created_at, updated_at")
    ]);

    if (studentsError) throw studentsError;
    if (teachersError) throw teachersError;

    const cloudData = { students: {}, teachers: {} };

    (studentsRows || []).forEach((row) => {
      cloudData.students[row.id] = {
        id: row.id,
        fullName: row.full_name,
        progress: row.progress || emptyProgress(),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    (teachersRows || []).forEach((row) => {
      cloudData.teachers[row.id] = {
        id: row.id,
        fullName: row.full_name,
        password: row.password,
        active: row.active !== false,
        progress: row.progress || emptyProgress(),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });

    data = cloudData;
    return data;
  } catch (error) {
    console.error("Erro ao carregar dados do Supabase:", error);
    return data;
  }
}

let cloudSaveTimer = null;

function scheduleCloudSave() {
  if (!canUseSupabase()) return;

  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(syncDataToSupabase, 500);
}

async function syncDataToSupabase() {
  if (!canUseSupabase()) {
    console.error("Supabase não configurado. Progresso não foi salvo na nuvem.");
    return;
  }

  const client = getSupabaseClient();

  try {
    const students = Object.values(data.students || {}).map((student) => ({
      id: student.id,
      full_name: student.fullName,
      progress: student.progress || emptyProgress(),
      created_at: student.createdAt || new Date().toISOString(),
      updated_at: student.updatedAt || new Date().toISOString()
    }));

    const teachers = Object.values(data.teachers || {}).map((teacher) => ({
      id: teacher.id,
      full_name: teacher.fullName,
      password: teacher.password || null,
      active: teacher.active !== false,
      progress: teacher.progress || emptyProgress(),
      created_at: teacher.createdAt || new Date().toISOString(),
      updated_at: teacher.updatedAt || new Date().toISOString()
    }));

    if (students.length) {
      const { error } = await client
        .from("math_students")
        .upsert(students, { onConflict: "id" });
      if (error) throw error;
    }

    if (teachers.length) {
      const { error } = await client
        .from("math_teachers")
        .upsert(teachers, { onConflict: "id" });
      if (error) throw error;
    }
  } catch (error) {
    console.error("Erro ao salvar dados no Supabase:", error);
  }
}

async function initApp() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}

  data = { students: {}, teachers: {} };
  await loadDataFromSupabase();
  render();
}

function slug(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isAdminLogin(fullName, password) {
  return slug(fullName) === ADMIN_TEACHER_NAME && password === ADMIN_TEACHER_PASSWORD;
}

function emptyProgress() {
  return { completed: {}, attempts: [], lastPlayed: null };
}

function activeUser() {
  if (!state.currentUserId) return null;
  if (state.role === "admin") return { id: ADMIN_TEACHER_NAME, fullName: ADMIN_TEACHER_FULL_NAME };
  if (state.role === "teacher") return data.teachers[state.currentUserId];
  return data.students[state.currentUserId];
}

function activeProgress() {
  return activeUser()?.progress || emptyProgress();
}

function saveActiveProgress(progress) {
  const user = activeUser();
  if (!user || state.role === "admin") return;
  user.progress = progress;
  user.updatedAt = new Date().toISOString();
  saveData();
}

function getLevelKey(worldId, level) {
  return `${worldId}_fase_${level}`;
}

function getWorld(worldId) {
  return worlds.find((world) => world.id === worldId);
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function difficultyPower(level) {
  return Math.max(1, level) * difficulties[state.difficulty].multiplier;
}

function generateQuestion(operation, level) {
  if (operation === "mixed") return generateMixedQuestion(level);

  const power = difficultyPower(level);
  let a;
  let b;
  let correct;
  let text;

  if (operation === "add") {
    const max = 8 + power * 5;
    a = randomNumber(1, max);
    b = randomNumber(1, max);
    correct = a + b;
    text = `${a} + ${b}`;
  }

  if (operation === "subtract") {
    const max = 12 + power * 6;
    a = randomNumber(5, max);
    b = randomNumber(1, a);
    correct = a - b;
    text = `${a} - ${b}`;
  }

  if (operation === "multiply") {
    const max = Math.min(20, 4 + power);
    a = randomNumber(1, max);
    b = randomNumber(1, max);
    correct = a * b;
    text = `${a} × ${b}`;
  }

  if (operation === "divide") {
    const divisor = randomNumber(1, Math.min(20, 4 + power));
    const quotient = randomNumber(1, 5 + power);
    correct = quotient;
    text = `${divisor * quotient} ÷ ${divisor}`;
  }

  return buildQuestion(text, correct);
}

function generateMixedQuestion(level) {
  const power = difficultyPower(level);

  if (state.difficulty === "facil") {
    return generateQuestion(["add", "subtract", "multiply", "divide"][randomNumber(0, 3)], level);
  }

  if (state.difficulty === "media") {
    const a = randomNumber(2, 10 + power);
    const b = randomNumber(2, 10 + power);
    const c = randomNumber(1, 8 + power);
    return buildQuestion(`${a} × ${b} + ${c}`, a * b + c);
  }

  if (state.difficulty === "dificil") {
    const divisor = randomNumber(2, 10);
    const quotient = randomNumber(2, 8 + power);
    const c = randomNumber(2, 12 + power);
    return buildQuestion(`${divisor * quotient} ÷ ${divisor} + ${c}`, quotient + c);
  }

  const a = randomNumber(2, 12);
  const b = randomNumber(2, 12);
  const divisor = randomNumber(2, 10);
  const quotient = randomNumber(2, 12 + power);
  const c = randomNumber(1, 20);
  return buildQuestion(`${a} × ${b} + ${divisor * quotient} ÷ ${divisor} - ${c}`, a * b + quotient - c);
}

function buildQuestion(text, correct) {
  return { text, correct, answers: generateAnswers(correct) };
}

function generateAnswers(correct) {
  const answers = new Set([correct]);
  const range = Math.max(10, Math.abs(correct));
  while (answers.size < 4) {
    const wrong = correct + randomNumber(-range, range);
    if (wrong >= 0 && wrong !== correct) answers.add(wrong);
  }
  return shuffle([...answers]);
}

function generateLevelQuestions(worldId, level) {
  const world = getWorld(worldId);
  return Array.from({ length: QUESTIONS_PER_LEVEL }, () => generateQuestion(world.operation, level));
}

function getStars(correct) {
  if (correct === 10) return 3;
  if (correct >= 8) return 2;
  if (correct >= 6) return 1;
  return 0;
}

function renderStars(amount) {
  return `${"★".repeat(amount || 0)}${"☆".repeat(3 - (amount || 0))}`;
}

function getStats(progress = activeProgress()) {
  const completed = Object.values(progress.completed || {});
  const attempts = progress.attempts || [];
  const correct = attempts.reduce((sum, item) => sum + item.correct, 0);
  const wrong = attempts.reduce((sum, item) => sum + item.wrong, 0);

  return {
    completedLevels: completed.filter((item) => item.passed).length,
    totalLevels: worlds.length * LEVELS_PER_WORLD,
    totalScore: completed.reduce((sum, item) => sum + (item.bestScore || 0), 0),
    totalStars: completed.reduce((sum, item) => sum + (item.stars || 0), 0),
    attempts: attempts.length,
    correct,
    wrong,
    averageCorrect: attempts.length ? (correct / attempts.length).toFixed(1) : "0.0",
    averageWrong: attempts.length ? (wrong / attempts.length).toFixed(1) : "0.0"
  };
}

function startLevel(worldId, level) {
  const progress = activeProgress();
  progress.lastPlayed = { worldId, level, difficulty: state.difficulty };
  saveActiveProgress(progress);

  state = {
    ...state,
    screen: "game",
    currentWorldId: worldId,
    currentLevel: level,
    questions: generateLevelQuestions(worldId, level),
    questionIndex: 0,
    lives: 3,
    score: 0,
    correct: 0,
    wrong: 0,
    answered: false,
    selectedAnswer: null,
    feedback: ""
  };
  render();
}

function answerQuestion(answer) {
  if (state.answered) return;
  const question = state.questions[state.questionIndex];
  const isCorrect = Number(answer) === question.correct;
  state.answered = true;
  state.selectedAnswer = Number(answer);

  if (isCorrect) {
    state.correct += 1;
    state.score += 100 + state.currentLevel * 10 + difficulties[state.difficulty].multiplier * 20;
    state.feedback = "Muito bem! Você acertou.";
  } else {
    state.wrong += 1;
    state.lives -= 1;
    state.feedback = `Quase! A resposta certa era ${question.correct}.`;
  }
  render();
}

function nextQuestion() {
  if (state.questionIndex >= state.questions.length - 1 || state.lives <= 0) {
    finishLevel();
    return;
  }
  state.questionIndex += 1;
  state.answered = false;
  state.selectedAnswer = null;
  state.feedback = "";
  render();
}

function finishLevel() {
  const progress = activeProgress();
  const key = getLevelKey(state.currentWorldId, state.currentLevel);
  const old = progress.completed[key];
  const stars = getStars(state.correct);
  const passed = state.correct >= 6;
  const finalScore = state.score + stars * 200;

  progress.completed[key] = {
    worldId: state.currentWorldId,
    level: state.currentLevel,
    passed: passed || Boolean(old?.passed),
    stars: Math.max(stars, old?.stars || 0),
    bestScore: Math.max(finalScore, old?.bestScore || 0),
    bestCorrect: Math.max(state.correct, old?.bestCorrect || 0),
    difficulty: state.difficulty,
    updatedAt: new Date().toISOString()
  };

  progress.attempts.push({
    worldId: state.currentWorldId,
    level: state.currentLevel,
    difficulty: state.difficulty,
    correct: state.correct,
    wrong: state.wrong,
    score: finalScore,
    date: new Date().toISOString()
  });

  saveActiveProgress(progress);
  state.score = finalScore;
  state.screen = "result";
  render();
}

function exitLevel() {
  if (!confirm("Deseja sair desta fase? Seu progresso desta tentativa não será salvo.")) return;
  state.screen = "levels";
  state.answered = false;
  render();
}

function resetProgress() {
  if (!confirm("Deseja apagar o progresso deste aluno?")) return;
  const user = activeUser();
  if (!user) return;
  user.progress = emptyProgress();
  saveData();
  render();
}

function helperText(question) {
  if (!question) return "Observe a conta e escolha com calma.";
  if (question.text.includes("+") && question.text.includes("×")) return "Resolva primeiro a multiplicação, depois a soma.";
  if (question.text.includes("÷") && question.text.includes("+")) return "Resolva primeiro a divisão, depois some o resultado.";
  if (question.text.includes("×")) return "Multiplicar é somar o mesmo número várias vezes.";
  if (question.text.includes("÷")) return "Dividir é repartir em partes iguais.";
  if (question.text.includes("+")) return "Some juntando os dois valores.";
  if (question.text.includes("-")) return "Subtraia retirando o segundo valor do primeiro.";
  return "Vá por partes e confira o sinal.";
}

function mascot(message) {
  return `
    <div class="mascot-card">
      <div class="mascot" aria-hidden="true">
        <span class="mascot-head"></span>
        <span class="mascot-body"></span>
        <span class="mascot-arm left"></span>
        <span class="mascot-arm right"></span>
      </div>
      <p>${message}</p>
    </div>
  `;
}

function renderLogin() {
  app.innerHTML = `
    <div class="app-container">
      <section class="card login-card">
        <div class="brand-mark login-brand"><span>JM</span><b>Jogo de Matemática</b></div>
        <h1>Jogo de Matemática</h1>
        <p>Login: informe seu nome completo. Se for professor, marque a opção e informe também a data de nascimento.</p>
        ${mascot("Aluno entra direto. Professor ganha uma tela extra para acompanhar todos os desempenhos.")}
        <form class="login-form" data-form="login">
          <label>Nome completo<input name="fullName" type="text" autocomplete="name" minlength="3" required placeholder="Ex: Maria Silva" value="${escapeHtml(state.loginName || "")}" /></label>
          <label class="check-row"><input name="isTeacher" type="checkbox" data-action="toggle-teacher" ${state.loginMode === "teacher" ? "checked" : ""} /> Sou professor</label>
          <label class="teacher-birth ${state.loginMode === "teacher" ? "visible" : ""}">Data de nascimento do professor<input name="birthDate" type="date" /></label>
          <label class="teacher-birth ${state.loginMode === "teacher" ? "visible" : ""}">Senha do professor<input name="teacherPassword" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="4 dígitos" /></label>
          ${state.loginError ? `<div class="feedback danger">${state.loginError}</div>` : ""}
          <button class="btn btn-primary" type="submit">Entrar</button>
        </form>
      </section>
    </div>
  `;
}

function renderTopBar() {
  const user = activeUser();
  return `
    <div class="player-bar">
      <div><strong>${user?.fullName || ""}</strong><span>${state.role === "teacher" ? "Professor" : "Aluno"} • ${difficulties[state.difficulty].label}</span></div>
      <div class="top-actions">
        ${state.role === "teacher" ? `<button class="btn btn-light" data-action="teacher-dashboard">Painel professor</button>` : ""}
        <button class="btn btn-light" data-action="logout">Sair</button>
      </div>
    </div>
  `;
}

function renderDifficultyPicker() {
  return `
    <div class="difficulty-row">
      ${Object.entries(difficulties).map(([id, difficulty]) => `
        <button class="difficulty-btn ${state.difficulty === id ? "active" : ""}" data-action="set-difficulty" data-difficulty="${id}">${difficulty.label}</button>
      `).join("")}
    </div>
  `;
}

function renderHome() {
  const stats = getStats();
  app.innerHTML = `
    <div class="app-container">
      ${renderTopBar()}
      <section class="hero">
        <div class="logo-badge">Todas as fases liberadas</div>
        <h1 class="home-title">Jogo de Matemática</h1>
        <p>Escolha a dificuldade, entre em qualquer fase e treine no seu ritmo.</p>
        ${renderDifficultyPicker()}
        ${mascot("Pode sair da fase quando quiser pelo botão Sair da fase.")}
        <div class="actions">
          <button class="btn btn-primary" data-action="go-worlds">Jogar</button>
          <button class="btn btn-light" data-action="go-ranking">Meu desempenho</button>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><strong>${stats.completedLevels}/${stats.totalLevels}</strong><span>Fases concluídas</span></div>
          <div class="stat-card"><strong>${stats.correct}</strong><span>Acertos totais</span></div>
          <div class="stat-card"><strong>${stats.wrong}</strong><span>Erros totais</span></div>
        </div>
      </section>
    </div>
  `;
}

function renderWorlds() {
  app.innerHTML = `
    <div class="app-container">
      ${renderTopBar()}
      <header class="page-header"><div><h2>Escolha um mundo</h2><p>Misto tem contas combinadas e fica mais complexo conforme a dificuldade.</p></div><button class="btn btn-light" data-action="go-home">Voltar</button></header>
      <section class="grid world-grid">
        ${worlds.map((world) => `
          <article class="card world-card" data-action="select-world" data-world="${world.id}">
            <div class="world-icon">${world.emoji}</div><h3>${world.name}</h3><p>${world.description}</p>
          </article>
        `).join("")}
      </section>
    </div>
  `;
}

function renderLevels() {
  const progress = activeProgress();
  const world = getWorld(state.currentWorldId);
  app.innerHTML = `
    <div class="app-container">
      ${renderTopBar()}
      <header class="page-header"><div><h2>${world.emoji} ${world.name}</h2><p>Todas as fases estão disponíveis.</p></div><button class="btn btn-light" data-action="go-worlds">Voltar</button></header>
      <section class="grid level-grid">
        ${Array.from({ length: LEVELS_PER_WORLD }, (_, index) => {
          const level = index + 1;
          const item = progress.completed[getLevelKey(world.id, level)];
          return `<article class="card level-card" data-action="start-level" data-world="${world.id}" data-level="${level}"><div class="level-number">Fase ${level}</div><div class="stars">${renderStars(item?.stars || 0)}</div><small>${item?.passed ? "Concluída" : "Disponível"}</small></article>`;
        }).join("")}
      </section>
    </div>
  `;
}

function renderGame() {
  const world = getWorld(state.currentWorldId);
  const question = state.questions[state.questionIndex];
  const answers = question.answers.map((answer) => {
    let className = "";
    if (state.answered) {
      if (answer === question.correct) className = "correct";
      else if (answer === state.selectedAnswer) className = "wrong";
    }
    return `<button class="answer-btn ${className}" data-action="answer" data-answer="${answer}" ${state.answered ? "disabled" : ""}>${answer}</button>`;
  }).join("");
  const feedbackClass = state.selectedAnswer === question.correct ? "success" : "danger";

  app.innerHTML = `
    <div class="app-container">
      <section class="card game-card">
        <div class="game-top"><div class="pill">${world.emoji} ${world.name}</div><div class="pill">Fase ${state.currentLevel}</div><div class="pill">${difficulties[state.difficulty].label}</div><div class="pill">Vidas: ${state.lives}</div><button class="btn btn-light" data-action="exit-level">Sair da fase</button></div>
        <div class="question-box"><div class="question-label">Pergunta ${state.questionIndex + 1} de ${state.questions.length}</div><div class="question">${question.text}</div></div>
        ${mascot(helperText(question))}
        <div class="answers">${answers}</div>
        ${state.answered ? `<div class="feedback ${feedbackClass}">${state.feedback}</div><div class="actions" style="margin-top:18px;justify-content:center;"><button class="btn btn-primary" data-action="next-question">Próxima</button></div>` : ""}
      </section>
    </div>
  `;
}

function renderResult() {
  const world = getWorld(state.currentWorldId);
  app.innerHTML = `
    <div class="app-container">
      <section class="card result-card">
        <h2>${state.correct >= 6 ? "Fase concluída!" : "Continue tentando!"}</h2>
        <p>${world.emoji} ${world.name} - Fase ${state.currentLevel} • ${difficulties[state.difficulty].label}</p>
        <div class="big-stars">${renderStars(getStars(state.correct))}</div>
        <div class="result-grid"><div class="result-item"><strong>${state.correct}</strong><span>Acertos</span></div><div class="result-item"><strong>${state.wrong}</strong><span>Erros</span></div><div class="result-item"><strong>${state.lives}</strong><span>Vidas</span></div><div class="result-item"><strong>${state.score}</strong><span>Pontos</span></div></div>
        <div class="actions" style="justify-content:center;"><button class="btn btn-primary" data-action="retry-level">Jogar novamente</button><button class="btn btn-secondary" data-action="next-level">Próxima fase</button><button class="btn btn-light" data-action="go-levels">Ver fases</button></div>
      </section>
    </div>
  `;
}

function renderRanking() {
  const stats = getStats();
  app.innerHTML = `
    <div class="app-container">
      ${renderTopBar()}
      <header class="page-header"><div><h2>Meu desempenho</h2><p>Resumo do aluno atual.</p></div><button class="btn btn-light" data-action="go-home">Voltar</button></header>
      <section class="stats-grid"><div class="stat-card"><strong>${stats.correct}</strong><span>Acertos</span></div><div class="stat-card"><strong>${stats.wrong}</strong><span>Erros</span></div><div class="stat-card"><strong>${stats.averageCorrect}</strong><span>Média de acertos</span></div></section>
      <div class="actions" style="margin-top:18px;"><button class="btn btn-danger" data-action="reset-progress">Apagar meu progresso</button></div>
    </div>
  `;
}

function renderTeacherDashboard() {
  const students = Object.values(data.students);
  const totals = students.map((student) => ({ student, stats: getStats(student.progress) }));
  const totalCorrect = totals.reduce((sum, item) => sum + item.stats.correct, 0);
  const totalWrong = totals.reduce((sum, item) => sum + item.stats.wrong, 0);
  const totalAttempts = totals.reduce((sum, item) => sum + item.stats.attempts, 0);
  const totalFinished = totals.reduce((sum, item) => sum + item.stats.completedLevels, 0);
  const bestStudent = totals.filter((item) => item.stats.attempts > 0).sort((a, b) => b.stats.correct - a.stats.correct)[0];
  const maxBar = Math.max(totalCorrect, totalWrong, 1);

  app.innerHTML = `
    <div class="app-container">
      ${renderTopBar()}
      <header class="page-header"><div><h2>Painel do professor</h2><p>Desempenho dos alunos salvos no Supabase.</p></div><button class="btn btn-light" data-action="go-home">Voltar</button></header>
      <section class="stats-grid"><div class="stat-card"><strong>${students.length}</strong><span>Alunos</span></div><div class="stat-card"><strong>${totalCorrect}</strong><span>Acertos totais</span></div><div class="stat-card"><strong>${totalWrong}</strong><span>Erros totais</span></div><div class="stat-card"><strong>${totalAttempts}</strong><span>Tentativas</span></div><div class="stat-card"><strong>${totalFinished}</strong><span>Fases concluídas</span></div><div class="stat-card"><strong>${bestStudent ? bestStudent.student.fullName.split(" ")[0] : "-"}</strong><span>Maior destaque</span></div></section>
      <section class="card chart-card"><h3>Gráfico geral</h3><div class="bar-row"><span>Acertos</span><div><b style="width:${(totalCorrect / maxBar) * 100}%"></b></div><strong>${totalCorrect}</strong></div><div class="bar-row wrong"><span>Erros</span><div><b style="width:${(totalWrong / maxBar) * 100}%"></b></div><strong>${totalWrong}</strong></div></section>
      <section class="list">${totals.length ? totals.map(({ student, stats }) => `<div class="list-item"><div><strong>${student.fullName}</strong><br /><small>${stats.completedLevels}/${stats.totalLevels} fases • média ${stats.averageCorrect} acertos e ${stats.averageWrong} erros</small></div><strong>${stats.correct} acertos</strong></div>`).join("") : `<div class="empty">Nenhum aluno jogou ainda no Supabase.</div>`}</section>
    </div>
  `;
}

function validPin(value) {
  return /^[0-9]{4}$/.test(String(value || ""));
}

function renderLogin() {
  app.innerHTML = `
    <div class="app-container">
      <section class="card login-card">
        <div class="brand-mark login-brand"><span>JM</span><b>Jogo de Matematica</b></div>
        <h1>Jogo de Matematica</h1>
        <p>Login: aluno entra com nome completo. Professor entra com nome completo e senha de 4 digitos.</p>
        ${mascot("Aluno entra direto. Professor precisa estar cadastrado e ativo pelo admin.")}
        <form class="login-form" data-form="login">
          <label>Nome completo<input name="fullName" type="text" autocomplete="name" minlength="3" required placeholder="Ex: Maria Silva" /></label>
          <label class="check-row"><input name="isTeacher" type="checkbox" data-action="toggle-teacher" ${state.loginMode === "teacher" ? "checked" : ""} /> Sou professor</label>
          <label class="teacher-birth ${state.loginMode === "teacher" ? "visible" : ""}">Senha do professor<input name="teacherPassword" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="4 digitos" /></label>
          ${state.loginError ? `<div class="feedback danger">${state.loginError}</div>` : ""}
          <button class="btn btn-primary" type="submit">Entrar</button>
        </form>
      </section>
    </div>
  `;
}

function renderTopBar() {
  const user = activeUser();
  const roleLabel = state.role === "admin" ? "Admin" : state.role === "teacher" ? "Professor" : "Aluno";
  return `
    <div class="player-bar">
      <div><strong>${escapeHtml(user?.fullName || "")}</strong><span>${roleLabel} - ${difficulties[state.difficulty].label}</span></div>
      <div class="top-actions">
        ${state.role === "teacher" || state.role === "admin" ? `<button class="btn btn-light" data-action="teacher-dashboard">${state.role === "admin" ? "Painel admin" : "Painel professor"}</button>` : ""}
        <button class="btn btn-light" data-action="logout">Sair</button>
      </div>
    </div>
  `;
}

function renderAdminTeacherManager() {
  if (state.role !== "admin") return "";
  const teachers = Object.values(data.teachers || {})
    .filter((teacher) => teacher && teacher.id !== ADMIN_TEACHER_NAME)
    .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));

  return `
    <section class="card admin-card">
      <div class="section-title">
        <div>
          <h3>Administrar professores</h3>
          <p>Cadastre professores com nome completo e senha de 4 digitos. Depois voce pode ativar ou desativar cada acesso.</p>
        </div>
      </div>
      <form class="admin-form" data-form="teacher-create">
        <label>Nome completo do professor<input name="teacherName" type="text" minlength="3" required placeholder="Ex: Ana Souza" /></label>
        <label>Senha de 4 digitos<input name="teacherPin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required placeholder="0000" /></label>
        <button class="btn btn-primary" type="submit">Cadastrar professor</button>
      </form>
      ${state.adminMessage ? `<div class="feedback ${state.adminMessageType === "danger" ? "danger" : "success"}">${state.adminMessage}</div>` : ""}
      <div class="teacher-list">
        ${teachers.length ? teachers.map((teacher) => {
          const active = teacher.active !== false;
          return `
            <div class="list-item teacher-row">
              <div>
                <strong>${escapeHtml(teacher.fullName || "")}</strong><br />
                <small>Senha cadastrada: ****</small>
              </div>
              <div class="teacher-actions">
                <span class="status-pill ${active ? "active" : "inactive"}">${active ? "Ativo" : "Desativado"}</span>
                <button class="btn btn-light" data-action="toggle-professor" data-professor="${escapeHtml(teacher.id)}">${active ? "Desativar" : "Ativar"}</button>
              </div>
            </div>
          `;
        }).join("") : `<div class="empty">Nenhum professor cadastrado ainda.</div>`}
      </div>
      <p class="dashboard-note">Obs.: os cadastros de professores e o progresso dos alunos ficam salvos no Supabase.</p>
    </section>
  `;
}

function renderTeacherDashboard() {
  const students = Object.values(data.students || {});
  const totals = students.map((student) => ({ student, stats: getStats(student.progress) }));
  const totalCorrect = totals.reduce((sum, item) => sum + item.stats.correct, 0);
  const totalWrong = totals.reduce((sum, item) => sum + item.stats.wrong, 0);
  const totalAttempts = totals.reduce((sum, item) => sum + item.stats.attempts, 0);
  const totalFinished = totals.reduce((sum, item) => sum + item.stats.completedLevels, 0);
  const bestStudent = totals.filter((item) => item.stats.attempts > 0).sort((a, b) => b.stats.correct - a.stats.correct)[0];
  const maxBar = Math.max(totalCorrect, totalWrong, 1);

  app.innerHTML = `
    <div class="app-container">
      ${renderTopBar()}
      <header class="page-header"><div><h2>${state.role === "admin" ? "Painel admin" : "Painel do professor"}</h2><p>Desempenho dos alunos salvos no Supabase.</p></div><button class="btn btn-light" data-action="go-home">Voltar</button></header>
      ${renderAdminTeacherManager()}
      <section class="stats-grid"><div class="stat-card"><strong>${students.length}</strong><span>Alunos</span></div><div class="stat-card"><strong>${totalCorrect}</strong><span>Acertos totais</span></div><div class="stat-card"><strong>${totalWrong}</strong><span>Erros totais</span></div><div class="stat-card"><strong>${totalAttempts}</strong><span>Tentativas</span></div><div class="stat-card"><strong>${totalFinished}</strong><span>Fases concluidas</span></div><div class="stat-card"><strong>${bestStudent ? escapeHtml(bestStudent.student.fullName.split(" ")[0]) : "-"}</strong><span>Maior destaque</span></div></section>
      <section class="card chart-card"><h3>Grafico geral</h3><div class="bar-row"><span>Acertos</span><div><b style="width:${(totalCorrect / maxBar) * 100}%"></b></div><strong>${totalCorrect}</strong></div><div class="bar-row wrong"><span>Erros</span><div><b style="width:${(totalWrong / maxBar) * 100}%"></b></div><strong>${totalWrong}</strong></div></section>
      <section class="list">${totals.length ? totals.map(({ student, stats }) => `<div class="list-item"><div><strong>${escapeHtml(student.fullName)}</strong><br /><small>${stats.completedLevels}/${stats.totalLevels} fases - media ${stats.averageCorrect} acertos e ${stats.averageWrong} erros</small></div><strong>${stats.correct} acertos</strong></div>`).join("") : `<div class="empty">Nenhum aluno jogou ainda no Supabase.</div>`}</section>
    </div>
  `;
}

function render() {
  if (state.screen === "login") renderLogin();
  if (state.screen === "home") renderHome();
  if (state.screen === "worlds") renderWorlds();
  if (state.screen === "levels") renderLevels();
  if (state.screen === "game") renderGame();
  if (state.screen === "result") renderResult();
  if (state.screen === "ranking") renderRanking();
  if (state.screen === "teacher") renderTeacherDashboard();
}

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-action='toggle-teacher']")) {
    state.loginMode = event.target.checked ? "teacher" : "student";
    state.loginError = "";
    render();
  }
});

app.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  const action = element.dataset.action;

  if (action === "toggle-teacher") return;

  if (action === "go-home") state.screen = "home";
  if (action === "go-worlds") state.screen = "worlds";
  if (action === "go-ranking") state.screen = "ranking";
  if (action === "teacher-dashboard") state.screen = "teacher";
  if (action === "logout") state = { ...state, screen: "login", currentUserId: null, role: null, loginMode: "student", loginName: "", loginError: "", adminMessage: "" };
  if (action === "set-difficulty") state.difficulty = element.dataset.difficulty;
  if (action === "select-world") {
    state.currentWorldId = element.dataset.world;
    state.screen = "levels";
  }
  if (action === "start-level") startLevel(element.dataset.world, Number(element.dataset.level));
  if (action === "answer") answerQuestion(element.dataset.answer);
  if (action === "next-question") nextQuestion();
  if (action === "retry-level") startLevel(state.currentWorldId, state.currentLevel);
  if (action === "next-level") startLevel(state.currentWorldId, Math.min(LEVELS_PER_WORLD, state.currentLevel + 1));
  if (action === "go-levels") state.screen = "levels";
  if (action === "exit-level") exitLevel();
  if (action === "reset-progress") resetProgress();
  render();
});

app.addEventListener("submit", async (event) => {
  const loginForm = event.target.closest("[data-form='login']");
  const teacherForm = event.target.closest("[data-form='teacher-create']");
  if (!loginForm && !teacherForm) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (canUseSupabase()) {
    await loadDataFromSupabase();
  }

  if (teacherForm) {
    const formData = new FormData(teacherForm);
    const teacherName = String(formData.get("teacherName") || "").trim().replace(/\s+/g, " ");
    const teacherPin = String(formData.get("teacherPin") || "");
    const id = slug(teacherName);

    if (state.role !== "admin") {
      state.adminMessageType = "danger";
      state.adminMessage = "Apenas o admin pode cadastrar professores.";
      render();
      return;
    }

    if (teacherName.length < 3 || !teacherName.includes(" ")) {
      state.adminMessageType = "danger";
      state.adminMessage = "Informe o nome completo do professor.";
      render();
      return;
    }

    if (!validPin(teacherPin)) {
      state.adminMessageType = "danger";
      state.adminMessage = "A senha precisa ter exatamente 4 digitos.";
      render();
      return;
    }

    if (id === ADMIN_TEACHER_NAME) {
      state.adminMessageType = "danger";
      state.adminMessage = "Esse usuario ja e o admin principal.";
      render();
      return;
    }

    data.teachers[id] = {
      ...(data.teachers[id] || {}),
      id,
      fullName: teacherName,
      password: teacherPin,
      active: true,
      progress: data.teachers[id]?.progress || emptyProgress(),
      createdAt: data.teachers[id]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.adminMessageType = "success";
    state.adminMessage = "Professor cadastrado e ativo.";
    await syncDataToSupabase();
    await loadDataFromSupabase();
    render();
    return;
  }

  const formData = new FormData(loginForm);
  const fullName = String(formData.get("fullName") || "").trim().replace(/\s+/g, " ");
  const isTeacher = formData.get("isTeacher") === "on";
  const teacherPassword = String(formData.get("teacherPassword") || "");
  const id = slug(fullName);

  if (fullName.length < 3) {
    state.loginError = "Preencha o nome completo.";
    render();
    return;
  }

  if (isTeacher) {
    state.loginMode = "teacher";
    if (!validPin(teacherPassword)) {
      state.loginError = "Informe a senha de 4 digitos.";
      render();
      return;
    }

    if (isAdminLogin(fullName, teacherPassword)) {
      state.currentUserId = ADMIN_TEACHER_NAME;
      state.role = "admin";
      state.screen = "teacher";
      state.loginError = "";
      state.adminMessage = "";
      render();
      return;
    }

    const teacher = data.teachers[id];
    if (!teacher) {
      state.loginError = "Professor nao cadastrado pelo admin.";
      render();
      return;
    }
    if (teacher.active === false) {
      state.loginError = "Professor desativado. Fale com o admin.";
      render();
      return;
    }
    if (teacher.password !== teacherPassword) {
      state.loginError = "Senha do professor invalida.";
      render();
      return;
    }

    state.currentUserId = id;
    state.role = "teacher";
    state.screen = "teacher";
    state.loginError = "";
    render();
    return;
  }

  if (!data.students[id]) {
    data.students[id] = { id, fullName, progress: emptyProgress(), createdAt: new Date().toISOString() };
  }
  state.currentUserId = id;
  state.role = "student";
  state.screen = "home";
  state.loginError = "";
  saveData();
  await syncDataToSupabase();
  render();
}, true);

app.addEventListener("click", async (event) => {
  const element = event.target.closest("[data-action='toggle-professor']");
  if (!element) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (state.role !== "admin") {
    state.adminMessageType = "danger";
    state.adminMessage = "Apenas o admin pode alterar professores.";
    render();
    return;
  }

  const id = element.dataset.professor;
  const teacher = data.teachers[id];
  if (!teacher) return;
  teacher.active = teacher.active === false;
  teacher.updatedAt = new Date().toISOString();
  state.adminMessageType = "success";
  state.adminMessage = teacher.active ? "Professor ativado." : "Professor desativado.";
  await syncDataToSupabase();
  await loadDataFromSupabase();
  render();
}, true);

app.addEventListener("change", (event) => {
  if (!event.target.matches("[data-action='toggle-teacher']")) return;
  event.stopImmediatePropagation();
  const form = event.target.closest("[data-form='login']");
  state.loginName = String(form?.querySelector("input[name='fullName']")?.value || "");
  state.loginMode = event.target.checked ? "teacher" : "student";
  state.loginError = "";
  form?.querySelectorAll(".teacher-birth").forEach((field) => field.classList.toggle("visible", event.target.checked));
  form?.querySelector(".feedback.danger")?.remove();
}, true);

app.addEventListener("input", (event) => {
  if (!event.target.matches("input[name='fullName']")) return;
  state.loginName = event.target.value;
}, true);

initApp();
