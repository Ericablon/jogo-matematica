const app = document.getElementById("app");

const STORAGE_KEY = "matematica_em_fases_v4";
const LEVELS_PER_WORLD = 10;
const QUESTIONS_PER_LEVEL = 10;
const ADMIN_TEACHER_NAME = "eric-ablon-dos-santos-cerqueira";
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
  adminMessageType: "success",
  tutorOpen: false,
  tutorStep: 0,
  tutorUses: 0,
  tutorUsedOnQuestion: false,
  tutorMaxStep: -1,
  answerLog: [],
  teacherSelectedStudentId: null,
  staffToken: null,
  staffFullName: ""
};

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeData(JSON.parse(saved)) : { students: {}, teachers: {} };
  } catch (error) {
    console.warn("Não foi possível carregar o progresso local:", error);
    return { students: {}, teachers: {} };
  }
}

function saveData() {
  data = normalizeData(data);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Não foi possível salvar o progresso local:", error);
  }
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
      const key = item.id || `${item.worldId}|${item.level}|${item.difficulty}|${item.correct}|${item.wrong}|${item.score}|${item.date}`;
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

function rowToStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    progress: row.progress || emptyProgress(),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToTeacher(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function callMathRpc(functionName, params = {}) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Cliente Supabase não configurado.");
  const { data: result, error } = await client.rpc(functionName, params);
  if (error) throw error;
  return result;
}

async function loadStudentFromSupabase(studentId) {
  if (!canUseSupabase() || !studentId) return null;
  try {
    const row = await callMathRpc("math_student_get", { p_id: studentId });
    const cloudStudent = rowToStudent(row);
    if (!cloudStudent) return null;
    const localStudent = data.students[studentId];
    data.students[studentId] = {
      ...cloudStudent,
      ...localStudent,
      progress: mergeProgress(localStudent?.progress, cloudStudent.progress),
      updatedAt: localStudent?.updatedAt || cloudStudent.updatedAt
    };
    return data.students[studentId];
  } catch (error) {
    console.error("Erro ao carregar aluno do Supabase:", error);
    return null;
  }
}

async function loadAdminTeachersFromSupabase() {
  if (!canUseSupabase() || state.role !== "admin" || !state.staffToken) return;
  try {
    const rows = await callMathRpc("math_admin_list_teachers", { p_token: state.staffToken });
    data.teachers = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const teacher = rowToTeacher(row);
      if (teacher) data.teachers[teacher.id] = teacher;
    });
  } catch (error) {
    console.error("Erro ao carregar professores:", error);
    state.adminMessageType = "danger";
    state.adminMessage = "Não foi possível carregar os professores.";
  }
}

async function loadTeacherDashboardFromSupabase() {
  if (!canUseSupabase() || !state.staffToken) return;
  try {
    const rows = await callMathRpc("math_staff_dashboard", { p_token: state.staffToken });
    data.students = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const student = rowToStudent(row);
      if (student) data.students[student.id] = student;
    });
    if (state.role === "admin") await loadAdminTeachersFromSupabase();
  } catch (error) {
    console.error("Erro ao carregar painel do professor:", error);
    state.loginError = "Sua sessão de professor expirou. Entre novamente.";
    state.screen = "login";
    state.role = null;
    state.staffToken = null;
  }
}

async function loginStaffWithSupabase(fullName, pin) {
  const result = await callMathRpc("math_staff_login", {
    p_user_id: slug(fullName),
    p_pin: pin
  });
  return result || null;
}

async function loadDataFromSupabase() {
  data = normalizeData(data);
  if (!canUseSupabase()) return data;
  if (state.role === "student" && state.currentUserId) {
    await loadStudentFromSupabase(state.currentUserId);
  } else if ((state.role === "teacher" || state.role === "admin") && state.staffToken) {
    await loadTeacherDashboardFromSupabase();
  }
  return data;
}

let cloudSaveTimer = null;

function scheduleCloudSave() {
  if (!canUseSupabase()) return;

  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(syncDataToSupabase, 500);
}

async function syncDataToSupabase() {
  if (!canUseSupabase() || state.role !== "student" || !state.currentUserId) return;
  const student = data.students[state.currentUserId];
  if (!student) return;

  try {
    const row = await callMathRpc("math_student_save", {
      p_id: student.id,
      p_full_name: student.fullName,
      p_progress: student.progress || emptyProgress()
    });
    const savedStudent = rowToStudent(row);
    if (savedStudent) {
      data.students[savedStudent.id] = {
        ...student,
        ...savedStudent,
        progress: mergeProgress(student.progress, savedStudent.progress)
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
      } catch {}
    }
  } catch (error) {
    console.error("Erro ao salvar progresso no Supabase:", error);
  }
}

async function initApp() {
  data = loadData();
  await loadDataFromSupabase();
  saveData();
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emptyProgress() {
  return { completed: {}, attempts: [], lastPlayed: null };
}

function activeUser() {
  if (!state.currentUserId) return null;
  if (state.role === "admin" || state.role === "teacher") {
    return { id: state.currentUserId, fullName: state.staffFullName || (state.role === "admin" ? ADMIN_TEACHER_FULL_NAME : "Professor") };
  }
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
    a = divisor * quotient;
    b = divisor;
    correct = quotient;
    text = `${a} ÷ ${b}`;
  }

  return buildQuestion(text, correct, { operation, operands: [a, b] });
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
    return buildQuestion(`${a} × ${b} + ${c}`, a * b + c, { operation: "mixed", pattern: "multiply_add", operands: [a, b, c] });
  }

  if (state.difficulty === "dificil") {
    const divisor = randomNumber(2, 10);
    const quotient = randomNumber(2, 8 + power);
    const c = randomNumber(2, 12 + power);
    return buildQuestion(`${divisor * quotient} ÷ ${divisor} + ${c}`, quotient + c, { operation: "mixed", pattern: "divide_add", operands: [divisor * quotient, divisor, c, quotient] });
  }

  const a = randomNumber(2, 12);
  const b = randomNumber(2, 12);
  const divisor = randomNumber(2, 10);
  const quotient = randomNumber(2, 12 + power);
  const c = randomNumber(1, 20);
  return buildQuestion(`${a} × ${b} + ${divisor * quotient} ÷ ${divisor} - ${c}`, a * b + quotient - c, { operation: "mixed", pattern: "advanced", operands: [a, b, divisor * quotient, divisor, c, quotient] });
}

function buildQuestion(text, correct, meta = {}) {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    text,
    correct,
    answers: generateAnswers(correct),
    meta
  };
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
    feedback: "",
    tutorOpen: false,
    tutorStep: 0,
    tutorUses: 0,
    tutorUsedOnQuestion: false,
    tutorMaxStep: -1,
    answerLog: []
  };
  render();
}

function answerQuestion(answer) {
  if (state.answered) return;
  const question = state.questions[state.questionIndex];
  const selectedAnswer = Number(answer);
  const isCorrect = selectedAnswer === question.correct;
  state.answered = true;
  state.selectedAnswer = selectedAnswer;

  state.answerLog.push({
    questionId: question.id,
    questionText: question.text,
    operation: question.meta?.operation || getWorld(state.currentWorldId)?.operation || "unknown",
    selectedAnswer,
    correctAnswer: question.correct,
    isCorrect,
    tutorUsedBeforeAnswer: state.tutorUsedOnQuestion,
    tutorStepViewed: state.tutorUsedOnQuestion ? state.tutorMaxStep + 1 : 0,
    tutorOpenedAfterError: !isCorrect && canShowTutor(),
    answeredAt: new Date().toISOString()
  });

  if (isCorrect) {
    state.correct += 1;
    state.score += 100 + state.currentLevel * 10 + difficulties[state.difficulty].multiplier * 20;
    state.feedback = "Muito bem! Você acertou.";
  } else {
    state.wrong += 1;
    state.lives -= 1;
    state.feedback = `Quase! A resposta certa era ${question.correct}. O robô vai mostrar como resolver.`;
    if (["facil", "media"].includes(state.difficulty)) {
      state.tutorOpen = true;
      state.tutorStep = 0;
    }
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
  state.tutorOpen = false;
  state.tutorStep = 0;
  state.tutorUsedOnQuestion = false;
  state.tutorMaxStep = -1;
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
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    worldId: state.currentWorldId,
    level: state.currentLevel,
    difficulty: state.difficulty,
    correct: state.correct,
    wrong: state.wrong,
    score: finalScore,
    tutorUses: state.tutorUses,
    answers: [...state.answerLog],
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

function canShowTutor() {
  return ["facil", "media"].includes(state.difficulty);
}

function tutorColumn(top, bottom, symbol) {
  return `
    <div class="tutor-column" aria-label="Conta montada">
      <div>${top}</div>
      <div><span>${symbol}</span>${bottom}</div>
      <hr />
      <div>?</div>
    </div>
  `;
}

function buildTutorSteps(question) {
  const meta = question?.meta || {};
  const values = meta.operands || [];

  if (meta.operation === "add") {
    const [a, b] = values;
    return [
      `Vamos montar a soma colocando unidade embaixo de unidade.${tutorColumn(a, b, "+")}`,
      `Comece pela direita: some os algarismos das unidades. Quando passar de 9, escreva a unidade e leve 1 para a próxima casa.`,
      state.answered
        ? `Agora some as dezenas e as outras casas. O resultado final é <strong>${question.correct}</strong>.`
        : `Agora some as dezenas e as outras casas. Depois procure esse resultado entre as alternativas.`
    ];
  }

  if (meta.operation === "subtract") {
    const [a, b] = values;
    return [
      `Monte a subtração alinhando os números pela direita.${tutorColumn(a, b, "−")}`,
      `Comece pelas unidades. Quando o número de cima for menor, peça 1 emprestado para a casa ao lado.`,
      state.answered
        ? `Faça cada coluna da direita para a esquerda. O resultado final é <strong>${question.correct}</strong>.`
        : `Faça cada coluna da direita para a esquerda e compare o resultado com as alternativas.`
    ];
  }

  if (meta.operation === "multiply") {
    const [a, b] = values;
    const smaller = Math.min(a, b);
    const larger = Math.max(a, b);
    return [
      `Multiplicar é repetir uma soma: <strong>${larger}</strong> aparece <strong>${smaller}</strong> vez(es).`,
      `${Array.from({ length: Math.min(smaller, 8) }, () => larger).join(" + ")}${smaller > 8 ? " + ..." : ""}`,
      state.answered
        ? `Somando os grupos, chegamos a <strong>${question.correct}</strong>.`
        : `Agora termine a soma dos grupos e escolha a alternativa correspondente.`
    ];
  }

  if (meta.operation === "divide") {
    const [total, divisor] = values;
    return [
      `Dividir é repartir <strong>${total}</strong> em <strong>${divisor}</strong> grupos iguais.`,
      `Pergunte: qual número multiplicado por ${divisor} forma ${total}?`,
      state.answered
        ? `<strong>${divisor} × ${question.correct} = ${total}</strong>. Portanto, cada grupo recebe <strong>${question.correct}</strong>.`
        : `Complete mentalmente: <strong>${divisor} × ? = ${total}</strong>. O número que ocupa o lugar de ? é a resposta.`
    ];
  }

  if (meta.pattern === "multiply_add") {
    const [a, b, c] = values;
    return [
      `Primeiro resolvemos a multiplicação: <strong>${a} × ${b} = ${a * b}</strong>.`,
      `Depois usamos o resultado na soma: <strong>${a * b} + ${c}</strong>.`,
      state.answered
        ? `A resposta é <strong>${question.correct}</strong>. Multiplicação vem antes da soma.`
        : `Agora some <strong>${a * b} + ${c}</strong> e escolha o resultado. Multiplicação vem antes da soma.`
    ];
  }

  if (meta.pattern === "divide_add") {
    const [total, divisor, c, quotient] = values;
    return [
      `Primeiro resolvemos a divisão: <strong>${total} ÷ ${divisor} = ${quotient}</strong>.`,
      `Depois somamos: <strong>${quotient} + ${c}</strong>.`,
      state.answered
        ? `A resposta é <strong>${question.correct}</strong>. Divisão vem antes da soma.`
        : `Agora some <strong>${quotient} + ${c}</strong> e escolha o resultado. Divisão vem antes da soma.`
    ];
  }

  return [
    "Observe os sinais e resolva uma operação por vez.",
    "Multiplicação e divisão vêm antes de soma e subtração.",
    state.answered
      ? `Conferindo cada etapa, o resultado é <strong>${question.correct}</strong>.`
      : `Resolva cada etapa e só depois compare com as alternativas.`
  ];
}

function renderTutor(question) {
  if (!canShowTutor()) {
    return mascot("Nas dificuldades difícil e super difícil, tente resolver sozinho e use o feedback para conferir.");
  }

  if (!state.tutorOpen) {
    return `
      <div class="tutor-closed">
        ${mascot("Travou? Eu posso montar essa conta com você, passo a passo.")}
        <button class="btn btn-secondary" data-action="toggle-tutor">Ajuda do robô</button>
      </div>
    `;
  }

  const steps = buildTutorSteps(question);
  const visibleSteps = steps.slice(0, Math.min(state.tutorStep + 1, steps.length));
  const hasNext = state.tutorStep < steps.length - 1;

  return `
    <section class="tutor-panel">
      <div class="tutor-title">
        <div class="mini-robot">🤖</div>
        <div><strong>Robô Professor</strong><span>Vamos resolver juntos</span></div>
      </div>
      <div class="tutor-steps">
        ${visibleSteps.map((step, index) => `<div class="tutor-step"><b>${index + 1}</b><div>${step}</div></div>`).join("")}
      </div>
      <div class="tutor-actions">
        ${hasNext ? `<button class="btn btn-secondary" data-action="next-tutor-step">Próxima dica</button>` : `<span class="tutor-done">Agora tente escolher a resposta!</span>`}
        <button class="btn btn-light" data-action="toggle-tutor">Fechar ajuda</button>
      </div>
    </section>
  `;
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
        ${renderTutor(question)}
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
          <label>Nome completo<input name="fullName" type="text" autocomplete="name" minlength="3" required placeholder="Ex: Maria Silva" value="${escapeHtml(state.loginName)}" /></label>
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
      <div class="actions" style="margin: 12px 0 18px;">
        <button class="btn btn-light" data-action="reload-teachers">Recarregar professores do Supabase</button>
        <span class="dashboard-note">Carregados: ${teachers.length}</span>
      </div>
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

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function getStudentWrongAnswers(student) {
  return (student?.progress?.attempts || []).flatMap((attempt) =>
    (attempt.answers || [])
      .filter((answer) => answer.isCorrect === false)
      .map((answer) => ({ ...answer, attempt }))
  ).sort((a, b) => String(b.answeredAt || b.attempt?.date || "").localeCompare(String(a.answeredAt || a.attempt?.date || "")));
}

function renderStudentErrorDetails(student) {
  if (!student) return "";
  const wrongAnswers = getStudentWrongAnswers(student);
  const stats = getStats(student.progress);
  const byWorld = worlds.map((world) => {
    const amount = wrongAnswers.filter((item) => item.attempt?.worldId === world.id).length;
    return { world, amount };
  }).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);

  return `
    <section class="card student-detail-card">
      <div class="section-title">
        <div>
          <h3>Erros de ${escapeHtml(student.fullName)}</h3>
          <p>${stats.correct} acertos, ${stats.wrong} erros e ${stats.attempts} tentativas registradas.</p>
        </div>
        <button class="btn btn-light" data-action="close-student-details">Voltar à lista</button>
      </div>
      ${wrongAnswers.length ? `
        <div class="error-summary">
          ${byWorld.map(({ world, amount }) => `<span class="status-pill inactive">${world.emoji} ${world.name}: ${amount}</span>`).join("")}
        </div>
        <div class="error-list">
          ${wrongAnswers.slice(0, 100).map((item) => {
            const world = getWorld(item.attempt?.worldId);
            return `
              <article class="error-item">
                <div class="error-item-head">
                  <strong>${world?.emoji || ""} ${world?.name || "Atividade"} • Fase ${item.attempt?.level || "-"}</strong>
                  <span>${formatDateTime(item.answeredAt || item.attempt?.date)}</span>
                </div>
                <div class="error-equation">${escapeHtml(item.questionText || "Conta não registrada")}</div>
                <div class="error-answers">
                  <span>Aluno marcou: <b class="wrong-value">${item.selectedAnswer}</b></span>
                  <span>Resposta correta: <b class="correct-value">${item.correctAnswer}</b></span>
                  <span>${item.tutorUsedBeforeAnswer
                    ? `Usou ${item.tutorStepViewed || 1} dica(s) antes de responder`
                    : item.tutorOpenedAfterError
                      ? "O robô explicou depois do erro"
                      : "Não usou a ajuda do robô"}</span>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      ` : `<div class="empty">Ainda não há erros detalhados. Tentativas antigas mostram apenas os totais; as novas passarão a registrar cada conta.</div>`}
    </section>
  `;
}

function renderTeacherDashboard() {
  const students = Object.values(data.students || {}).sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
  const totals = students.map((student) => ({ student, stats: getStats(student.progress) }));
  const totalCorrect = totals.reduce((sum, item) => sum + item.stats.correct, 0);
  const totalWrong = totals.reduce((sum, item) => sum + item.stats.wrong, 0);
  const totalAttempts = totals.reduce((sum, item) => sum + item.stats.attempts, 0);
  const totalFinished = totals.reduce((sum, item) => sum + item.stats.completedLevels, 0);
  const bestStudent = totals.filter((item) => item.stats.attempts > 0).sort((a, b) => b.stats.correct - a.stats.correct)[0];
  const maxBar = Math.max(totalCorrect, totalWrong, 1);
  const selectedStudent = state.teacherSelectedStudentId ? data.students[state.teacherSelectedStudentId] : null;

  app.innerHTML = `
    <div class="app-container">
      ${renderTopBar()}
      <header class="page-header"><div><h2>${state.role === "admin" ? "Painel admin" : "Painel do professor"}</h2><p>Acompanhe os resultados e veja exatamente quais contas cada aluno errou.</p></div><button class="btn btn-light" data-action="reload-dashboard">Atualizar dados</button></header>
      ${renderAdminTeacherManager()}
      <section class="stats-grid"><div class="stat-card"><strong>${students.length}</strong><span>Alunos</span></div><div class="stat-card"><strong>${totalCorrect}</strong><span>Acertos totais</span></div><div class="stat-card"><strong>${totalWrong}</strong><span>Erros totais</span></div><div class="stat-card"><strong>${totalAttempts}</strong><span>Tentativas</span></div><div class="stat-card"><strong>${totalFinished}</strong><span>Fases concluídas</span></div><div class="stat-card"><strong>${bestStudent ? escapeHtml(bestStudent.student.fullName.split(" ")[0]) : "-"}</strong><span>Maior destaque</span></div></section>
      <section class="card chart-card"><h3>Gráfico geral</h3><div class="bar-row"><span>Acertos</span><div><b style="width:${(totalCorrect / maxBar) * 100}%"></b></div><strong>${totalCorrect}</strong></div><div class="bar-row wrong"><span>Erros</span><div><b style="width:${(totalWrong / maxBar) * 100}%"></b></div><strong>${totalWrong}</strong></div></section>
      ${selectedStudent ? renderStudentErrorDetails(selectedStudent) : `
        <section class="list student-list">
          ${totals.length ? totals.map(({ student, stats }) => {
            const detailedErrors = getStudentWrongAnswers(student).length;
            return `<div class="list-item student-row"><div><strong>${escapeHtml(student.fullName)}</strong><br /><small>${stats.completedLevels}/${stats.totalLevels} fases • média ${stats.averageCorrect} acertos e ${stats.averageWrong} erros • ${detailedErrors} erro(s) detalhado(s)</small></div><div class="teacher-actions"><strong>${stats.correct} acertos</strong><button class="btn btn-light" data-action="view-student-errors" data-student="${escapeHtml(student.id)}">Ver onde errou</button></div></div>`;
          }).join("") : `<div class="empty">Nenhum aluno jogou ainda.</div>`}
        </section>
      `}
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

app.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  const action = element.dataset.action;

  if (action === "toggle-teacher") return;

  if (action === "go-home") state.screen = "home";
  if (action === "go-worlds") state.screen = "worlds";
  if (action === "go-ranking") state.screen = "ranking";
  if (action === "teacher-dashboard") {
    state.screen = "teacher";
    state.teacherSelectedStudentId = null;
  }
  if (action === "logout") state = { ...state, screen: "login", currentUserId: null, role: null, loginMode: "student", loginName: "", loginError: "", adminMessage: "", staffToken: null, staffFullName: "", teacherSelectedStudentId: null };
  if (action === "reload-teachers" || action === "reload-dashboard") {
    loadTeacherDashboardFromSupabase().then(() => render());
    return;
  }
  if (action === "set-difficulty") state.difficulty = element.dataset.difficulty;
  if (action === "select-world") {
    state.currentWorldId = element.dataset.world;
    state.screen = "levels";
  }
  if (action === "start-level") startLevel(element.dataset.world, Number(element.dataset.level));
  if (action === "answer") answerQuestion(element.dataset.answer);
  if (action === "toggle-tutor") {
    if (!state.tutorOpen) {
      if (!state.tutorUsedOnQuestion) state.tutorUses += 1;
      state.tutorUsedOnQuestion = true;
      state.tutorStep = Math.max(0, state.tutorStep);
      state.tutorMaxStep = Math.max(state.tutorMaxStep, state.tutorStep);
    }
    state.tutorOpen = !state.tutorOpen;
  }
  if (action === "next-tutor-step") {
    const question = state.questions[state.questionIndex];
    state.tutorStep = Math.min(state.tutorStep + 1, buildTutorSteps(question).length - 1);
    state.tutorUsedOnQuestion = true;
    state.tutorMaxStep = Math.max(state.tutorMaxStep, state.tutorStep);
  }
  if (action === "view-student-errors") {
    state.teacherSelectedStudentId = element.dataset.student;
    state.screen = "teacher";
  }
  if (action === "close-student-details") state.teacherSelectedStudentId = null;
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

  if (teacherForm) {
    const formData = new FormData(teacherForm);
    const teacherName = String(formData.get("teacherName") || "").trim().replace(/\s+/g, " ");
    const teacherPin = normalizePin(formData.get("teacherPin"));
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

    try {
      if (!canUseSupabase()) throw new Error("Banco não configurado");
      await callMathRpc("math_admin_upsert_teacher", {
        p_token: state.staffToken,
        p_id: id,
        p_full_name: teacherName,
        p_pin: teacherPin
      });
      await loadAdminTeachersFromSupabase();
      state.adminMessageType = "success";
      state.adminMessage = "Professor cadastrado e ativo.";
    } catch (error) {
      console.error("Erro ao cadastrar professor:", error);
      state.adminMessageType = "danger";
      state.adminMessage = "Não foi possível cadastrar o professor.";
    }
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
    const cleanTeacherPassword = normalizePin(teacherPassword);

    if (!validPin(cleanTeacherPassword)) {
      state.loginError = "Informe a senha de 4 dígitos.";
      render();
      return;
    }

    if (!canUseSupabase()) {
      state.loginError = "A área do professor será liberada depois que o novo Supabase for configurado.";
      render();
      return;
    }

    try {
      const staff = await loginStaffWithSupabase(fullName, cleanTeacherPassword);
      if (!staff?.token) {
        state.loginError = "Professor não encontrado, desativado, senha inválida ou acesso temporariamente bloqueado.";
        render();
        return;
      }
      state.currentUserId = staff.id;
      state.staffFullName = staff.full_name;
      state.staffToken = staff.token;
      state.role = staff.role;
      state.screen = "teacher";
      state.loginError = "";
      state.adminMessage = "";
      await loadTeacherDashboardFromSupabase();
      render();
      return;
    } catch (error) {
      console.error("Erro no login do professor:", error);
      state.loginError = "Professor não encontrado, desativado, senha inválida ou acesso temporariamente bloqueado.";
      render();
      return;
    }
  }

  if (canUseSupabase()) await loadStudentFromSupabase(id);
  if (!data.students[id]) {
    data.students[id] = { id, fullName, progress: emptyProgress(), createdAt: new Date().toISOString() };
  } else {
    data.students[id].fullName = fullName;
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
  try {
    if (!canUseSupabase()) throw new Error("Banco não configurado");
    const updated = await callMathRpc("math_admin_toggle_teacher", {
      p_token: state.staffToken,
      p_id: id
    });
    if (updated) data.teachers[id] = rowToTeacher(updated);
    state.adminMessageType = "success";
    state.adminMessage = data.teachers[id].active ? "Professor ativado." : "Professor desativado.";
  } catch (error) {
    console.error("Erro ao alterar professor:", error);
    state.adminMessageType = "danger";
    state.adminMessage = "Não foi possível alterar o professor.";
  }
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