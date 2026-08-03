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
  currentAttemptId: null,
  attemptStartedAt: null,
  teacherSelectedStudentId: null,
  teacherAnswerFilter: "all",
  teacherTab: "overview",
  teacherOperationFilter: "all",
  teacherDifficultyFilter: "all",
  teacherStudentFilter: "all",
  teacherSearch: "",
  tutorAutoPlay: false,
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

  const attemptsByKey = new Map();
  merged.attempts.forEach((item) => {
    const key = item.id || `${item.worldId}|${item.level}|${item.difficulty}|${item.correct}|${item.wrong}|${item.score}|${item.date}`;
    const existing = attemptsByKey.get(key);
    const existingStamp = String(existing?.updatedAt || existing?.date || "");
    const itemStamp = String(item?.updatedAt || item?.date || "");
    if (!existing || itemStamp >= existingStamp || (item.answers || []).length >= (existing.answers || []).length) {
      attemptsByKey.set(key, item);
    }
  });
  merged.attempts = [...attemptsByKey.values()]
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
  const attemptId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const attemptStartedAt = new Date().toISOString();
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
    answerLog: [],
    currentAttemptId: attemptId,
    attemptStartedAt
  };
  render();
}

function upsertCurrentAttempt(progress, status = "in_progress", score = state.score) {
  if (!progress || !state.currentAttemptId) return;
  const now = new Date().toISOString();
  const attempt = {
    id: state.currentAttemptId,
    worldId: state.currentWorldId,
    level: state.currentLevel,
    difficulty: state.difficulty,
    correct: state.correct,
    wrong: state.wrong,
    score,
    tutorUses: state.tutorUses,
    answers: [...state.answerLog],
    status,
    date: state.attemptStartedAt || now,
    updatedAt: now
  };
  const attempts = progress.attempts || (progress.attempts = []);
  const index = attempts.findIndex((item) => item.id === attempt.id);
  if (index >= 0) attempts[index] = attempt;
  else attempts.push(attempt);
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
      state.tutorAutoPlay = true;
    }
  }

  const progress = activeProgress();
  upsertCurrentAttempt(progress, "in_progress", state.score);
  saveActiveProgress(progress);
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
  state.tutorAutoPlay = false;
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

  upsertCurrentAttempt(progress, "completed", finalScore);
  saveActiveProgress(progress);
  state.score = finalScore;
  state.screen = "result";
  render();
}

function exitLevel() {
  if (!confirm("Deseja sair desta fase? As respostas já feitas ficarão registradas para acompanhamento do professor.")) return;
  if (state.answerLog.length) {
    const progress = activeProgress();
    upsertCurrentAttempt(progress, "abandoned", state.score);
    saveActiveProgress(progress);
  }
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

function tutorDigits(value, width) {
  return String(Math.max(0, Number(value) || 0)).padStart(width, " ").split("");
}

function placeName(column, width) {
  const distance = width - 1 - column;
  return distance === 0 ? "unidades" : distance === 1 ? "dezenas" : distance === 2 ? "centenas" : distance === 3 ? "milhares" : "próxima casa";
}

function renderTutorDigitRow({
  label = "",
  value = "",
  width,
  activeColumn = -1,
  revealed = null,
  visibleColumns = null,
  symbol = "",
  className = "",
  placingColumn = -1,
  flyingDigit = "",
  pointerText = ""
}) {
  const chars = String(value).padStart(width, " ").split("");
  return `
    <div class="tutor-math-row ${className}">
      <span class="tutor-row-label">${escapeHtml(label)}</span>
      <span class="tutor-row-symbol">${escapeHtml(symbol)}</span>
      <span class="tutor-digit-grid" style="--digit-count:${width}">
        ${chars.map((char, index) => {
          const allowedByReveal = !revealed || revealed[index] !== false;
          const allowedByColumns = !visibleColumns || visibleColumns.includes(index);
          const visible = allowedByReveal && allowedByColumns;
          const isPlacing = index === placingColumn;
          const display = visible && !isPlacing ? (char === " " ? "" : char) : "";
          const placementDigit = String(flyingDigit || char || "").trim();
          return `<span class="tutor-digit-cell ${index === activeColumn ? "active" : ""} ${isPlacing ? "placing" : ""} ${display ? "filled" : "empty"}">
            ${display}
            ${isPlacing && placementDigit ? `<span class="flying-digit">${escapeHtml(placementDigit)}</span>` : ""}
            ${index === activeColumn && pointerText ? `<span class="tutor-point-marker"><b>👇</b><small>${escapeHtml(pointerText)}</small></span>` : ""}
          </span>`;
        }).join("")}
      </span>
    </div>
  `;
}

function renderColumnWorkspace({
  top,
  bottom,
  symbol,
  result,
  activeColumn = -1,
  revealedResult = [],
  visibleBottomColumns = null,
  placingBottomColumn = -1,
  flyingBottomDigit = "",
  placingResultColumn = -1,
  flyingResultDigit = "",
  note = "",
  carry = "",
  pointerText = "Aqui"
}) {
  const width = Math.max(String(top).length, String(bottom).length, String(result).length);
  const resultChars = tutorDigits(result, width);
  const revealMap = resultChars.map((char, index) => char === " " || revealedResult.includes(index));
  return `
    <div class="tutor-column-workspace">
      ${carry ? `<div class="tutor-carry-note"><span>↖</span>${escapeHtml(carry)}</div>` : ""}
      ${renderTutorDigitRow({ label: "1º número", value: top, width, activeColumn })}
      ${renderTutorDigitRow({
        label: "2º número",
        value: bottom,
        width,
        activeColumn,
        visibleColumns: visibleBottomColumns,
        placingColumn: placingBottomColumn,
        flyingDigit: flyingBottomDigit,
        pointerText: placingBottomColumn >= 0 ? pointerText : "",
        symbol
      })}
      <div class="tutor-math-line"></div>
      ${renderTutorDigitRow({
        label: "resultado",
        value: result,
        width,
        activeColumn,
        revealed: revealMap,
        placingColumn: placingResultColumn,
        flyingDigit: flyingResultDigit,
        pointerText: placingResultColumn >= 0 ? pointerText : "",
        className: "result-row"
      })}
      ${note ? `<div class="tutor-placement-note"><span class="note-hand">☝️</span>${escapeHtml(note)}</div>` : ""}
    </div>
  `;
}

function buildAlignmentSteps(a, b, symbol, result, operationLabel) {
  const width = Math.max(String(a).length, String(b).length, String(result).length);
  const topChars = tutorDigits(a, width);
  const bottomChars = tutorDigits(b, width);
  const placed = [];
  const steps = [{
    title: `Vamos montar a ${operationLabel}`,
    cue: "Primeiro organize as casas",
    speech: "Antes de calcular, vamos encaixar cada algarismo na coluna correta. Unidade fica embaixo de unidade, dezena embaixo de dezena.",
    visual: renderColumnWorkspace({
      top: a,
      bottom: b,
      symbol,
      result,
      activeColumn: width - 1,
      revealedResult: [],
      visibleBottomColumns: [],
      note: "Observe as colunas. O robô vai colocar o número de baixo, um algarismo por vez."
    })
  }];

  for (let column = width - 1; column >= 0; column -= 1) {
    const digit = bottomChars[column];
    if (!digit || digit === " ") continue;
    const topDigit = topChars[column] && topChars[column] !== " " ? topChars[column] : "a mesma casa";
    const place = placeName(column, width);
    steps.push({
      title: `Coloque o ${digit} nas ${place}`,
      cue: `${digit} fica nesta coluna`,
      speech: `Este ${digit} pertence à casa das ${place}. Coloque-o exatamente embaixo do ${topDigit}. Veja o algarismo descendo até o lugar certo.`,
      visual: renderColumnWorkspace({
        top: a,
        bottom: b,
        symbol,
        result,
        activeColumn: column,
        revealedResult: [],
        visibleBottomColumns: [...placed],
        placingBottomColumn: column,
        flyingBottomDigit: digit,
        pointerText: `Ponha o ${digit} aqui`,
        note: `O ${digit} está sendo colocado na coluna das ${place}.`
      })
    });
    placed.push(column);
  }

  return { steps, width, placed };
}

function buildAdditionLesson(a, b, question) {
  const alignment = buildAlignmentSteps(a, b, "+", question.correct, "soma");
  const width = alignment.width;
  const top = tutorDigits(a, width).map((d) => Number(d || 0));
  const bottom = tutorDigits(b, width).map((d) => Number(d || 0));
  const revealed = [];
  const steps = [...alignment.steps];

  let carry = 0;
  for (let col = width - 1; col >= 0; col -= 1) {
    const previousCarry = carry;
    const total = top[col] + bottom[col] + previousCarry;
    const digit = total % 10;
    carry = Math.floor(total / 10);
    const place = placeName(col, width);
    steps.push({
      title: `Some as ${place}`,
      cue: `Escreva ${digit} embaixo`,
      speech: `${top[col]} + ${bottom[col]}${previousCarry ? ` + ${previousCarry} que veio` : ""} = ${total}. ${carry ? `Escreva ${digit} nesta coluna e leve ${carry} para a esquerda.` : `Agora coloque ${digit} embaixo desta coluna.`}`,
      visual: renderColumnWorkspace({
        top: a,
        bottom: b,
        symbol: "+",
        result: question.correct,
        activeColumn: col,
        revealedResult: [...revealed],
        visibleBottomColumns: alignment.placed,
        placingResultColumn: col,
        flyingResultDigit: digit,
        carry: previousCarry ? `Use também o ${previousCarry} que veio da coluna anterior.` : "",
        pointerText: `Resultado ${digit} aqui`,
        note: `O ${digit} desce para a casa das ${place}.`
      })
    });
    revealed.push(col);
  }

  steps.push({
    title: "Conta montada",
    cue: `Resultado: ${question.correct}`,
    speech: `Pronto! O robô alinhou os números e montou o resultado ${question.correct}. Confira as colunas da direita para a esquerda.`,
    visual: renderColumnWorkspace({ top: a, bottom: b, symbol: "+", result: question.correct, activeColumn: -1, revealedResult: Array.from({ length: width }, (_, index) => index), visibleBottomColumns: alignment.placed, note: "Conta completa. Agora tente reconhecer o mesmo caminho sozinho." })
  });
  return steps;
}

function buildSubtractionLesson(a, b, question) {
  const alignment = buildAlignmentSteps(a, b, "−", question.correct, "subtração");
  const width = alignment.width;
  const workingTop = tutorDigits(a, width).map((d) => Number(d || 0));
  const bottom = tutorDigits(b, width).map((d) => Number(d || 0));
  const revealed = [];
  const steps = [...alignment.steps];

  for (let col = width - 1; col >= 0; col -= 1) {
    let upper = workingTop[col];
    const lower = bottom[col];
    let borrowMessage = "";
    if (upper < lower) {
      let lender = col - 1;
      while (lender >= 0 && workingTop[lender] === 0) lender -= 1;
      if (lender >= 0) {
        workingTop[lender] -= 1;
        for (let i = lender + 1; i < col; i += 1) workingTop[i] = 9;
        workingTop[col] += 10;
        upper = workingTop[col];
        borrowMessage = `O número de cima era menor. Pegamos 1 emprestado da coluna à esquerda e agora temos ${upper}.`;
      }
    }
    const digit = upper - lower;
    const place = placeName(col, width);
    steps.push({
      title: `Subtraia as ${place}`,
      cue: `Coloque ${digit} embaixo`,
      speech: `${borrowMessage} ${upper} − ${lower} = ${digit}. Veja onde o ${digit} deve ser escrito.`,
      visual: renderColumnWorkspace({
        top: a,
        bottom: b,
        symbol: "−",
        result: question.correct,
        activeColumn: col,
        revealedResult: [...revealed],
        visibleBottomColumns: alignment.placed,
        placingResultColumn: col,
        flyingResultDigit: digit,
        carry: borrowMessage ? "Empréstimo vindo da coluna à esquerda." : "",
        pointerText: `Escreva ${digit} aqui`,
        note: `O ${digit} fica na coluna das ${place}.`
      })
    });
    revealed.push(col);
  }

  steps.push({
    title: "Subtração concluída",
    cue: `Resultado: ${question.correct}`,
    speech: `Terminamos a conta coluna por coluna. O resultado é ${question.correct}.`,
    visual: renderColumnWorkspace({ top: a, bottom: b, symbol: "−", result: question.correct, activeColumn: -1, revealedResult: Array.from({ length: width }, (_, index) => index), visibleBottomColumns: alignment.placed, note: "Confira se cada número ficou na casa certa." })
  });
  return steps;
}

function renderMultiplicationWorkspace(a, b, partials = [], activeRow = -1, showResult = false, result = "", visibleBottomColumns = null, placingBottomColumn = -1, flyingBottomDigit = "") {
  const width = Math.max(String(result || a * b).length, String(a).length, String(b).length) + 1;
  return `
    <div class="tutor-column-workspace multiplication-workspace">
      ${renderTutorDigitRow({ label: "multiplicando", value: a, width })}
      ${renderTutorDigitRow({ label: "multiplicador", value: b, width, symbol: "×", visibleColumns: visibleBottomColumns, placingColumn: placingBottomColumn, flyingDigit: flyingBottomDigit, activeColumn: placingBottomColumn, pointerText: placingBottomColumn >= 0 ? "Coloque aqui" : "" })}
      <div class="tutor-math-line"></div>
      ${partials.map((partial, index) => renderTutorDigitRow({ label: `parcial ${index + 1}`, value: partial, width, activeColumn: index === activeRow ? width - 1 - index : -1, className: index === activeRow ? "active-row placing-row" : "" })).join("")}
      ${showResult ? `<div class="tutor-math-line secondary-line"></div>${renderTutorDigitRow({ label: "resultado", value: result, width, className: "result-row final-result-row" })}` : ""}
      <div class="tutor-placement-note"><span class="note-hand">☝️</span>Cada nova linha parcial começa uma casa mais à esquerda.</div>
    </div>
  `;
}

function buildMultiplicationLesson(a, b, question) {
  const width = Math.max(String(question.correct).length, String(a).length, String(b).length) + 1;
  const bottomChars = String(b).padStart(width, " ").split("");
  const placed = [];
  const steps = [{
    title: "Monte a multiplicação",
    cue: "Alinhe pela direita",
    speech: "Vamos colocar o multiplicador embaixo do multiplicando. Começamos pelas unidades, sempre alinhando pela direita.",
    visual: renderMultiplicationWorkspace(a, b, [], -1, false, question.correct, [])
  }];

  for (let col = width - 1; col >= 0; col -= 1) {
    const digit = bottomChars[col];
    if (!digit || digit === " ") continue;
    steps.push({
      title: `Posicione o ${digit}`,
      cue: `${digit} entra nesta coluna`,
      speech: `Coloque o ${digit} na casa das ${placeName(col, width)}. Veja o robô apontando o encaixe.`,
      visual: renderMultiplicationWorkspace(a, b, [], -1, false, question.correct, [...placed], col, digit)
    });
    placed.push(col);
  }

  const multiplierDigits = String(b).split("").reverse().map(Number);
  const partials = [];
  multiplierDigits.forEach((digit, index) => {
    const partial = a * digit * (10 ** index);
    partials.push(partial);
    steps.push({
      title: `Monte a ${index + 1}ª linha`,
      cue: `Linha parcial: ${partial}`,
      speech: `Multiplique ${a} por ${digit}. ${index > 0 ? `Como o ${digit} está mais à esquerda, deslocamos a linha ${index} casa(s).` : "A primeira linha começa nas unidades."}`,
      visual: renderMultiplicationWorkspace(a, b, [...partials], index, false, question.correct, placed)
    });
  });

  steps.push({
    title: "Some as linhas parciais",
    cue: `Resultado: ${question.correct}`,
    speech: `Agora some as linhas mantendo as colunas alinhadas. O resultado final é ${question.correct}.`,
    visual: renderMultiplicationWorkspace(a, b, partials, -1, true, question.correct, placed)
  });
  return steps;
}

function renderDivisionWorkspace(total, divisor, quotientSlots, activeIndex = -1, note = "", placingIndex = -1, placingDigit = "") {
  const digits = String(total).split("");
  return `
    <div class="division-workspace">
      <div class="division-quotient" style="--digit-count:${digits.length}">
        ${digits.map((_, index) => `<span class="tutor-digit-cell ${index === activeIndex ? "active" : ""} ${index === placingIndex ? "placing" : ""} ${quotientSlots[index] !== "" ? "filled" : "empty"}">
          ${index === placingIndex ? `<span class="flying-digit quotient-digit">${escapeHtml(String(placingDigit))}</span>` : (quotientSlots[index] ?? "")}
          ${index === activeIndex ? `<span class="tutor-point-marker division-marker"><b>👇</b><small>Escreva aqui</small></span>` : ""}
        </span>`).join("")}
      </div>
      <div class="division-body">
        <div class="division-divisor"><span class="divisor-badge">${divisor}</span></div>
        <div class="division-dividend" style="--digit-count:${digits.length}">
          ${digits.map((digit, index) => `<span class="tutor-digit-cell ${index === activeIndex ? "active" : ""}">${digit}</span>`).join("")}
        </div>
      </div>
      <div class="tutor-placement-note"><span class="note-hand">☝️</span>${escapeHtml(note || "O resultado é escrito em cima do algarismo usado.")}</div>
    </div>
  `;
}

function buildDivisionLesson(total, divisor, question) {
  const digits = String(total).split("").map(Number);
  const quotientSlots = Array(digits.length).fill("");
  const steps = [{
    title: "Monte a divisão",
    cue: `${divisor} fica do lado de fora`,
    speech: `Coloque ${total} dentro da chave e ${divisor} do lado de fora. O resultado será montado em cima, algarismo por algarismo.`,
    visual: renderDivisionWorkspace(total, divisor, quotientSlots, 0, "O robô começa pelo primeiro algarismo da esquerda.")
  }];

  let current = 0;
  let quotientStarted = false;
  digits.forEach((digit, index) => {
    current = current * 10 + digit;
    if (current < divisor && index < digits.length - 1 && !quotientStarted) {
      steps.push({
        title: "Junte o próximo algarismo",
        cue: "Ainda não cabe",
        speech: `${current} é menor que ${divisor}. Então junte o próximo algarismo à direita antes de dividir.`,
        visual: renderDivisionWorkspace(total, divisor, [...quotientSlots], index, "Ainda não escrevemos nada em cima desta coluna.")
      });
      return;
    }
    const quotientDigit = Math.floor(current / divisor);
    const remainder = current % divisor;
    steps.push({
      title: `Coloque ${quotientDigit} no quociente`,
      cue: `${quotientDigit} vai aqui em cima`,
      speech: `${divisor} cabe ${quotientDigit} vez(es) em ${current}, porque ${divisor} × ${quotientDigit} = ${divisor * quotientDigit}. Veja o ${quotientDigit} entrando no lugar certo. Sobra ${remainder}.`,
      visual: renderDivisionWorkspace(total, divisor, [...quotientSlots], index, `O ${quotientDigit} fica exatamente em cima da coluna destacada.`, index, quotientDigit)
    });
    quotientSlots[index] = String(quotientDigit);
    quotientStarted = true;
    current = remainder;
  });

  steps.push({
    title: "Divisão concluída",
    cue: `Resultado: ${question.correct}`,
    speech: `Lendo os algarismos montados em cima, encontramos ${question.correct}.`,
    visual: renderDivisionWorkspace(total, divisor, quotientSlots, -1, `Resultado final: ${question.correct}`)
  });
  return steps;
}

function renderMixedWorkspace(expression, activePart, replacement = "", result = "") {
  return `
    <div class="mixed-workspace">
      <div class="mixed-expression">${expression.split(" ").map((part, index) => `<span class="${index === activePart ? "active" : ""}">${escapeHtml(part)}</span>`).join(" ")}</div>
      ${replacement ? `<div class="mixed-arrow">↓</div><div class="mixed-replacement animated-replacement">${replacement}</div>` : ""}
      ${result ? `<div class="mixed-result">Resultado: <strong>${result}</strong></div>` : ""}
    </div>
  `;
}

function buildTutorLesson(question) {
  const meta = question?.meta || {};
  const values = meta.operands || [];
  if (meta.operation === "add") return buildAdditionLesson(values[0], values[1], question);
  if (meta.operation === "subtract") return buildSubtractionLesson(values[0], values[1], question);
  if (meta.operation === "multiply") return buildMultiplicationLesson(values[0], values[1], question);
  if (meta.operation === "divide") return buildDivisionLesson(values[0], values[1], question);

  if (meta.pattern === "multiply_add") {
    const [a, b, c] = values;
    const product = a * b;
    return [
      { title: "Veja a ordem", cue: "Multiplicação primeiro", speech: "Multiplicação vem antes da soma. O robô aponta primeiro para a parte que deve ser resolvida.", visual: renderMixedWorkspace(`${a} × ${b} + ${c}`, 1) },
      { title: "Resolva a multiplicação", cue: `${a} × ${b} = ${product}`, speech: `${a} × ${b} = ${product}. Agora esse resultado entra no lugar da multiplicação.`, visual: renderMixedWorkspace(`${a} × ${b} + ${c}`, 1, `${product} + ${c}`) },
      { title: "Faça a soma", cue: `Resultado: ${question.correct}`, speech: `${product} + ${c} = ${question.correct}.`, visual: renderMixedWorkspace(`${a} × ${b} + ${c}`, -1, `${product} + ${c}`, question.correct) }
    ];
  }

  if (meta.pattern === "divide_add") {
    const [total, divisor, c, quotient] = values;
    return [
      { title: "Veja a ordem", cue: "Divisão primeiro", speech: "Divisão vem antes da soma. Resolva primeiro a parte destacada.", visual: renderMixedWorkspace(`${total} ÷ ${divisor} + ${c}`, 1) },
      { title: "Resolva a divisão", cue: `${total} ÷ ${divisor} = ${quotient}`, speech: `${total} ÷ ${divisor} = ${quotient}. Coloque esse valor no lugar da divisão.`, visual: renderMixedWorkspace(`${total} ÷ ${divisor} + ${c}`, 1, `${quotient} + ${c}`) },
      { title: "Faça a soma", cue: `Resultado: ${question.correct}`, speech: `${quotient} + ${c} = ${question.correct}.`, visual: renderMixedWorkspace(`${total} ÷ ${divisor} + ${c}`, -1, `${quotient} + ${c}`, question.correct) }
    ];
  }

  return [
    { title: "Resolva por partes", cue: "Siga a ordem", speech: "Faça primeiro multiplicações e divisões; depois soma e subtração.", visual: renderMixedWorkspace(question.text, 1) },
    { title: "Confira a ordem", cue: `Resultado: ${question.correct}`, speech: `Ao terminar cada parte, confira a posição dos números. O resultado final é ${question.correct}.`, visual: renderMixedWorkspace(question.text, -1, "", question.correct) }
  ];
}

function buildTutorSteps(question) {
  return buildTutorLesson(question);
}

function renderTutor(question) {
  if (!canShowTutor()) return "";

  if (!state.tutorOpen) {
    return `
      <button class="tutor-launcher" data-action="toggle-tutor" aria-label="Abrir Robô Professor">
        <span class="launcher-robot">🤖</span>
        <span><strong>Robô Professor</strong><small>Veja a conta sendo montada</small></span>
      </button>
    `;
  }

  const lesson = buildTutorLesson(question);
  const currentIndex = Math.min(state.tutorStep, lesson.length - 1);
  const current = lesson[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < lesson.length - 1;

  return `
    <aside class="floating-tutor ${state.tutorAutoPlay ? "is-playing" : "is-paused"}" aria-live="polite">
      <div class="floating-tutor-head">
        <div><strong>Robô Professor</strong><span>Etapa ${currentIndex + 1} de ${lesson.length}</span></div>
        <button class="tutor-close" data-action="toggle-tutor" aria-label="Fechar ajuda">×</button>
      </div>
      <div class="robot-teaching-stage">
        <div class="floating-robot teaching-robot" aria-hidden="true">
          <span class="mascot-head"></span><span class="mascot-body"></span><span class="mascot-arm left"></span><span class="mascot-arm right pointing-arm"></span><span class="robot-hand">☝️</span>
        </div>
        <div class="robot-live-cloud"><small>Agora faça isto:</small><strong>${escapeHtml(current.cue || current.title)}</strong></div>
      </div>
      <div class="tutor-speech">
        <b>${escapeHtml(current.title)}</b>
        <p>${current.speech}</p>
      </div>
      <div class="tutor-workspace step-${currentIndex}">${current.visual}</div>
      <div class="tutor-progress" aria-hidden="true">${lesson.map((_, index) => `<span class="${index <= currentIndex ? "done" : ""}"></span>`).join("")}</div>
      <div class="tutor-play-row">
        <button class="tutor-play-btn ${state.tutorAutoPlay ? "active" : ""}" data-action="toggle-tutor-autoplay">${state.tutorAutoPlay ? "⏸ Pausar animação" : "▶ Reproduzir sozinho"}</button>
        <button class="tutor-restart-btn" data-action="restart-tutor">↺ Recomeçar</button>
      </div>
      <div class="tutor-actions floating-actions">
        <button class="btn btn-light" data-action="previous-tutor-step" ${hasPrevious ? "" : "disabled"}>Voltar</button>
        ${hasNext
          ? `<button class="btn btn-secondary" data-action="next-tutor-step">Próxima etapa</button>`
          : `<button class="btn btn-primary" data-action="toggle-tutor">Entendi!</button>`}
      </div>
    </aside>
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

function getStudentAnswers(student) {
  return (student?.progress?.attempts || []).flatMap((attempt) =>
    (attempt.answers || []).map((answer) => ({ ...answer, attempt }))
  ).sort((a, b) => String(b.answeredAt || b.attempt?.date || "").localeCompare(String(a.answeredAt || a.attempt?.date || "")));
}

function getStudentWrongAnswers(student) {
  return getStudentAnswers(student).filter((answer) => answer.isCorrect === false);
}

function getStudentCorrectAnswers(student) {
  return getStudentAnswers(student).filter((answer) => answer.isCorrect === true);
}

function operationLabel(operation) {
  const labels = { add: "Soma", subtract: "Subtração", multiply: "Multiplicação", divide: "Divisão", mixed: "Misto", unknown: "Outros" };
  return labels[operation] || labels.unknown;
}

function operationEmoji(operation) {
  const labels = { add: "+", subtract: "−", multiply: "×", divide: "÷", mixed: "★", unknown: "?" };
  return labels[operation] || labels.unknown;
}

function getAllTeacherAnswers(students) {
  return students.flatMap((student) => getStudentAnswers(student).map((answer) => ({ ...answer, student })))
    .sort((a, b) => String(b.answeredAt || b.attempt?.date || "").localeCompare(String(a.answeredAt || a.attempt?.date || "")));
}

function getDetailedTotals(records) {
  const correct = records.filter((item) => item.isCorrect === true).length;
  const wrong = records.filter((item) => item.isCorrect === false).length;
  return { total: records.length, correct, wrong, accuracy: records.length ? Math.round((correct / records.length) * 100) : 0 };
}

function renderAccuracyDonut(correct, wrong, title = "Aproveitamento") {
  const total = correct + wrong;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return `
    <div class="accuracy-donut-card">
      <div class="accuracy-donut" style="--accuracy:${accuracy}"><div><strong>${accuracy}%</strong><span>de acerto</span></div></div>
      <div><h4>${escapeHtml(title)}</h4><p><b class="correct-value">${correct} acertos</b> e <b class="wrong-value">${wrong} erros</b></p></div>
    </div>
  `;
}

function renderTeacherTabs() {
  const tabs = [
    ["overview", "Visão geral", "⌂"],
    ["responses", "Respostas dos alunos", "☑"],
    ["analytics", "Análises e gráficos", "▥"]
  ];
  if (state.role === "admin") tabs.push(["teachers", "Professores", "♟"]);
  return `<nav class="teacher-tabs">${tabs.map(([id, label, icon]) => `<button class="teacher-tab ${state.teacherTab === id ? "active" : ""}" data-action="set-teacher-tab" data-tab="${id}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
}

function renderRecentAnswerCard(item) {
  const correct = item.isCorrect === true;
  return `
    <article class="recent-answer ${correct ? "correct" : "wrong"}">
      <span class="recent-answer-icon">${correct ? "✓" : "×"}</span>
      <div><strong>${escapeHtml(item.student?.fullName || "Aluno")}</strong><small>${formatDateTime(item.answeredAt || item.attempt?.date)}</small></div>
      <b>${escapeHtml(item.questionText || "Conta")}</b>
      <span>${item.selectedAnswer} ${correct ? "=" : "≠"} ${item.correctAnswer}</span>
    </article>
  `;
}

function renderTeacherOverview(students, totals, allDetailed, totalCorrect, totalWrong, totalAttempts, totalFinished, bestStudent) {
  const recent = allDetailed.slice(0, 6);
  return `
    <section class="stats-grid teacher-stats">
      <div class="stat-card"><strong>${students.length}</strong><span>Alunos</span></div>
      <div class="stat-card"><strong>${totalCorrect}</strong><span>Acertos totais</span></div>
      <div class="stat-card"><strong>${totalWrong}</strong><span>Erros totais</span></div>
      <div class="stat-card"><strong>${totalAttempts}</strong><span>Tentativas</span></div>
      <div class="stat-card"><strong>${totalFinished}</strong><span>Fases concluídas</span></div>
      <div class="stat-card"><strong>${bestStudent ? escapeHtml(bestStudent.student.fullName.split(" ")[0]) : "-"}</strong><span>Maior destaque</span></div>
    </section>
    <section class="teacher-overview-grid">
      <div class="card overview-chart-panel">
        <h3>Resultado geral</h3>
        ${renderAccuracyDonut(totalCorrect, totalWrong, "Desempenho acumulado")}
        <button class="btn btn-light full-button" data-action="set-teacher-tab" data-tab="analytics">Abrir análises completas</button>
      </div>
      <div class="card recent-activity-panel">
        <div class="section-title compact"><div><h3>Atividade recente</h3><p>Últimas respostas registradas.</p></div><button class="text-button" data-action="set-teacher-tab" data-tab="responses">Ver todas</button></div>
        <div class="recent-answer-list">${recent.length ? recent.map(renderRecentAnswerCard).join("") : `<div class="empty">Ainda não existem respostas detalhadas.</div>`}</div>
      </div>
    </section>
    <section class="card student-directory-card">
      <div class="section-title compact"><div><h3>Alunos</h3><p>Abra o histórico individual de cada aluno.</p></div></div>
      <div class="student-directory-grid">
        ${totals.length ? totals.map(({ student, stats }) => {
          const detailed = getStudentAnswers(student);
          const detailTotals = getDetailedTotals(detailed);
          return `<article class="student-summary-card">
            <div class="student-avatar">${escapeHtml((student.fullName || "A").charAt(0).toUpperCase())}</div>
            <div class="student-summary-main"><strong>${escapeHtml(student.fullName)}</strong><span>${stats.correct} acertos • ${stats.wrong} erros</span><div class="student-mini-progress"><b style="width:${detailTotals.accuracy}%"></b></div><small>${detailed.length ? `${detailTotals.accuracy}% nas respostas detalhadas` : "Aguardando novas respostas"}</small></div>
            <button class="btn btn-light" data-action="view-student-performance" data-student="${escapeHtml(student.id)}">Abrir respostas</button>
          </article>`;
        }).join("") : `<div class="empty">Nenhum aluno jogou ainda.</div>`}
      </div>
    </section>
  `;
}

function teacherFilteredAnswers(records) {
  const search = String(state.teacherSearch || "").trim().toLowerCase();
  return records.filter((item) => {
    const operation = item.operation || item.attempt?.operation || getWorld(item.attempt?.worldId)?.operation || "unknown";
    const difficulty = item.attempt?.difficulty || "";
    if (state.teacherAnswerFilter === "correct" && item.isCorrect !== true) return false;
    if (state.teacherAnswerFilter === "wrong" && item.isCorrect !== false) return false;
    if (state.teacherOperationFilter !== "all" && operation !== state.teacherOperationFilter) return false;
    if (state.teacherDifficultyFilter !== "all" && difficulty !== state.teacherDifficultyFilter) return false;
    if (state.teacherStudentFilter !== "all" && item.student?.id !== state.teacherStudentFilter) return false;
    if (search) {
      const haystack = `${item.student?.fullName || ""} ${item.questionText || ""} ${item.selectedAnswer ?? ""} ${item.correctAnswer ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function renderResponseFilters(students, records) {
  const totals = getDetailedTotals(records);
  return `
    <section class="card response-filter-card">
      <div class="section-title compact"><div><h3>Filtrar respostas</h3><p>Encontre rapidamente um aluno, operação ou tipo de resultado.</p></div></div>
      <div class="response-filter-grid">
        <label>Aluno<select data-teacher-filter="student"><option value="all">Todos os alunos</option>${students.map((student) => `<option value="${escapeHtml(student.id)}" ${state.teacherStudentFilter === student.id ? "selected" : ""}>${escapeHtml(student.fullName)}</option>`).join("")}</select></label>
        <label>Operação<select data-teacher-filter="operation"><option value="all">Todas</option>${["add", "subtract", "multiply", "divide", "mixed"].map((op) => `<option value="${op}" ${state.teacherOperationFilter === op ? "selected" : ""}>${operationLabel(op)}</option>`).join("")}</select></label>
        <label>Dificuldade<select data-teacher-filter="difficulty"><option value="all">Todas</option>${Object.entries(difficulties).map(([id, item]) => `<option value="${id}" ${state.teacherDifficultyFilter === id ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
        <label>Pesquisar<input data-teacher-search type="search" value="${escapeHtml(state.teacherSearch)}" placeholder="Nome ou conta" /></label>
      </div>
      <div class="answer-filter-row response-status-filters">
        <button class="answer-filter ${state.teacherAnswerFilter === "all" ? "active" : ""}" data-action="set-answer-filter" data-filter="all">Todas (${totals.total})</button>
        <button class="answer-filter correct ${state.teacherAnswerFilter === "correct" ? "active" : ""}" data-action="set-answer-filter" data-filter="correct">Acertos (${totals.correct})</button>
        <button class="answer-filter wrong ${state.teacherAnswerFilter === "wrong" ? "active" : ""}" data-action="set-answer-filter" data-filter="wrong">Erros (${totals.wrong})</button>
      </div>
    </section>
  `;
}

function renderAnswerRecords(records, limit = 250) {
  return `<div class="answer-detail-list global-answer-list">${records.slice(0, limit).map((item) => {
    const correct = item.isCorrect === true;
    const operation = item.operation || getWorld(item.attempt?.worldId)?.operation || "unknown";
    return `
      <article class="answer-detail-item ${correct ? "is-correct" : "is-wrong"}">
        <div class="answer-status-icon">${correct ? "✓" : "×"}</div>
        <div class="answer-detail-main">
          <div class="error-item-head"><strong>${escapeHtml(item.student?.fullName || "Aluno")}</strong><span>${formatDateTime(item.answeredAt || item.attempt?.date)}</span></div>
          <div class="answer-context-row"><span>${operationEmoji(operation)} ${operationLabel(operation)}</span><span>Fase ${item.attempt?.level || "-"}</span><span>${difficulties[item.attempt?.difficulty]?.label || "-"}</span></div>
          <div class="error-equation">${escapeHtml(item.questionText || "Conta não registrada")}</div>
          <div class="answer-comparison">
            <span>Resposta do aluno <b class="${correct ? "correct-value" : "wrong-value"}">${item.selectedAnswer}</b></span>
            <span>Resposta correta <b class="correct-value">${item.correctAnswer}</b></span>
            <span class="answer-result-label ${correct ? "correct" : "wrong"}">${correct ? "Acertou" : "Errou"}</span>
          </div>
          <div class="tutor-usage-note">${item.tutorUsedBeforeAnswer ? `Usou ${item.tutorStepViewed || 1} etapa(s) do Robô Professor antes de responder.` : item.tutorOpenedAfterError ? "O Robô Professor foi aberto depois do erro." : "Não usou o Robô Professor nesta conta."}</div>
        </div>
      </article>`;
  }).join("")}</div>`;
}

function renderStudentPerformanceDetails(student) {
  if (!student) return "";
  const allAnswers = getStudentAnswers(student).map((item) => ({ ...item, student }));
  const totals = getDetailedTotals(allAnswers);
  const filter = state.teacherAnswerFilter || "all";
  const filtered = filter === "correct" ? allAnswers.filter((item) => item.isCorrect === true) : filter === "wrong" ? allAnswers.filter((item) => item.isCorrect === false) : allAnswers;
  return `
    <section class="card student-detail-card">
      <div class="section-title"><div><h3>Respostas de ${escapeHtml(student.fullName)}</h3><p>Conta, resposta escolhida, resposta correta e uso do robô.</p></div><button class="btn btn-light" data-action="close-student-details">Voltar para todas</button></div>
      <div class="student-performance-summary">
        <div class="performance-card all"><strong>${totals.total}</strong><span>Respostas</span></div>
        <div class="performance-card correct"><strong>${totals.correct}</strong><span>Acertos</span></div>
        <div class="performance-card wrong"><strong>${totals.wrong}</strong><span>Erros</span></div>
        <div class="performance-card accuracy"><strong>${totals.accuracy}%</strong><span>Aproveitamento</span></div>
      </div>
      <div class="answer-filter-row">
        <button class="answer-filter ${filter === "all" ? "active" : ""}" data-action="set-answer-filter" data-filter="all">Todas (${totals.total})</button>
        <button class="answer-filter correct ${filter === "correct" ? "active" : ""}" data-action="set-answer-filter" data-filter="correct">Acertos (${totals.correct})</button>
        <button class="answer-filter wrong ${filter === "wrong" ? "active" : ""}" data-action="set-answer-filter" data-filter="wrong">Erros (${totals.wrong})</button>
      </div>
      ${allAnswers.length ? renderAnswerRecords(filtered, 200) : `<div class="empty">Ainda não existem respostas detalhadas para este aluno. As novas partidas passarão a aparecer aqui questão por questão.</div>`}
    </section>
  `;
}

function renderTeacherResponses(students, allDetailed) {
  const selectedStudent = state.teacherSelectedStudentId ? data.students[state.teacherSelectedStudentId] : null;
  if (selectedStudent) return renderStudentPerformanceDetails(selectedStudent);
  const filtered = teacherFilteredAnswers(allDetailed);
  return `
    ${renderResponseFilters(students, allDetailed)}
    <section class="card responses-results-card">
      <div class="section-title compact"><div><h3>${filtered.length} resposta(s) encontrada(s)</h3><p>As respostas mais recentes aparecem primeiro.</p></div></div>
      ${filtered.length ? renderAnswerRecords(filtered) : `<div class="empty">Nenhuma resposta corresponde aos filtros selecionados.</div>`}
    </section>
  `;
}

function groupAnswerStats(records, keyGetter, allowedKeys = []) {
  const map = new Map(allowedKeys.map((key) => [key, { key, correct: 0, wrong: 0, total: 0 }]));
  records.forEach((item) => {
    const key = keyGetter(item) || "unknown";
    if (!map.has(key)) map.set(key, { key, correct: 0, wrong: 0, total: 0 });
    const row = map.get(key);
    row.total += 1;
    if (item.isCorrect === true) row.correct += 1;
    if (item.isCorrect === false) row.wrong += 1;
  });
  return [...map.values()];
}

function renderStackedChart(title, subtitle, rows, labelGetter) {
  const max = Math.max(...rows.map((row) => row.total), 1);
  return `
    <section class="card analytics-chart-card">
      <div class="section-title compact"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div></div>
      <div class="stacked-chart-list">${rows.map((row) => {
        const width = (row.total / max) * 100;
        const correctPart = row.total ? (row.correct / row.total) * 100 : 0;
        const wrongPart = row.total ? (row.wrong / row.total) * 100 : 0;
        return `<div class="stacked-chart-row"><div class="stacked-label"><strong>${escapeHtml(labelGetter(row.key))}</strong><span>${row.total} respostas</span></div><div class="stacked-track" style="width:${Math.max(width, row.total ? 12 : 0)}%"><b class="correct-segment" style="width:${correctPart}%"></b><b class="wrong-segment" style="width:${wrongPart}%"></b></div><div class="stacked-values"><span class="correct-value">${row.correct} ✓</span><span class="wrong-value">${row.wrong} ×</span></div></div>`;
      }).join("")}</div>
    </section>
  `;
}

function renderTeacherAnalytics(students, allDetailed) {
  const detailedTotals = getDetailedTotals(allDetailed);
  const operationRows = groupAnswerStats(allDetailed, (item) => item.operation || getWorld(item.attempt?.worldId)?.operation || "unknown", ["add", "subtract", "multiply", "divide", "mixed"]);
  const difficultyRows = groupAnswerStats(allDetailed, (item) => item.attempt?.difficulty || "unknown", Object.keys(difficulties));
  const studentRows = students.map((student) => {
    const records = getStudentAnswers(student);
    const totals = getDetailedTotals(records);
    return { student, ...totals };
  }).filter((row) => row.total > 0).sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);

  const errorMap = new Map();
  allDetailed.filter((item) => item.isCorrect === false).forEach((item) => {
    const key = item.questionText || "Conta não registrada";
    const current = errorMap.get(key) || { question: key, count: 0, answers: new Map(), correctAnswer: item.correctAnswer };
    current.count += 1;
    current.answers.set(String(item.selectedAnswer), (current.answers.get(String(item.selectedAnswer)) || 0) + 1);
    errorMap.set(key, current);
  });
  const commonErrors = [...errorMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  if (!allDetailed.length) return `<section class="card"><div class="empty">Os gráficos aparecerão depois que os alunos responderem questões usando a nova versão do jogo.</div></section>`;

  return `
    <section class="analytics-hero-grid">
      <div class="card">${renderAccuracyDonut(detailedTotals.correct, detailedTotals.wrong, "Respostas detalhadas")}</div>
      <div class="card analytics-highlight"><small>Maior atenção necessária</small><strong>${operationLabel(operationRows.slice().sort((a, b) => b.wrong - a.wrong)[0]?.key || "unknown")}</strong><p>Operação com mais erros registrados nas respostas detalhadas.</p></div>
      <div class="card analytics-highlight success"><small>Melhor aproveitamento</small><strong>${studentRows[0] ? escapeHtml(studentRows[0].student.fullName) : "-"}</strong><p>${studentRows[0] ? `${studentRows[0].accuracy}% de acerto em ${studentRows[0].total} respostas.` : "Sem dados suficientes."}</p></div>
    </section>
    <section class="analytics-grid">
      ${renderStackedChart("Desempenho por operação", "Verde representa acertos e vermelho representa erros.", operationRows, operationLabel)}
      ${renderStackedChart("Desempenho por dificuldade", "Compare onde a turma encontra mais dificuldade.", difficultyRows, (key) => difficulties[key]?.label || "Outros")}
    </section>
    <section class="analytics-grid lower">
      <section class="card analytics-chart-card">
        <div class="section-title compact"><div><h3>Comparação entre alunos</h3><p>Ordenado pelo percentual de acertos detalhados.</p></div></div>
        <div class="student-ranking-chart">${studentRows.slice(0, 12).map((row, index) => `<div class="student-ranking-row"><span class="ranking-position">${index + 1}</span><div><strong>${escapeHtml(row.student.fullName)}</strong><small>${row.correct} acertos em ${row.total}</small><div class="ranking-track"><b style="width:${row.accuracy}%"></b></div></div><em>${row.accuracy}%</em></div>`).join("") || `<div class="empty">Sem respostas detalhadas.</div>`}</div>
      </section>
      <section class="card analytics-chart-card">
        <div class="section-title compact"><div><h3>Contas com mais erros</h3><p>Ajuda o professor a planejar a revisão.</p></div></div>
        <div class="common-error-list">${commonErrors.length ? commonErrors.map((item, index) => `<article><span>${index + 1}</span><div><strong>${escapeHtml(item.question)}</strong><small>Resposta correta: ${item.correctAnswer}</small></div><b>${item.count} erro(s)</b></article>`).join("") : `<div class="empty">Nenhum erro detalhado registrado.</div>`}</div>
      </section>
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
  const allDetailed = getAllTeacherAnswers(students);

  let tabContent = "";
  if (state.teacherTab === "responses") tabContent = renderTeacherResponses(students, allDetailed);
  else if (state.teacherTab === "analytics") tabContent = renderTeacherAnalytics(students, allDetailed);
  else if (state.teacherTab === "teachers" && state.role === "admin") tabContent = renderAdminTeacherManager();
  else tabContent = renderTeacherOverview(students, totals, allDetailed, totalCorrect, totalWrong, totalAttempts, totalFinished, bestStudent);

  app.innerHTML = `
    <div class="app-container teacher-dashboard-shell">
      ${renderTopBar()}
      <header class="page-header teacher-page-header"><div><h2>${state.role === "admin" ? "Painel administrativo" : "Painel do professor"}</h2><p>Resultados, respostas detalhadas e análises pedagógicas da turma.</p></div><button class="btn btn-light" data-action="reload-dashboard">Atualizar dados</button></header>
      ${renderTeacherTabs()}
      <main class="teacher-tab-content">${tabContent}</main>
    </div>
  `;
}

let tutorAutoTimer = null;

function syncTutorAutoPlay() {
  clearTimeout(tutorAutoTimer);
  if (state.screen !== "game" || !state.tutorOpen || !state.tutorAutoPlay) return;
  const question = state.questions[state.questionIndex];
  const lesson = buildTutorSteps(question);
  if (state.tutorStep >= lesson.length - 1) {
    state.tutorAutoPlay = false;
    return;
  }
  tutorAutoTimer = setTimeout(() => {
    if (state.screen !== "game" || !state.tutorOpen || !state.tutorAutoPlay) return;
    state.tutorStep = Math.min(state.tutorStep + 1, lesson.length - 1);
    state.tutorUsedOnQuestion = true;
    state.tutorMaxStep = Math.max(state.tutorMaxStep, state.tutorStep);
    if (state.tutorStep >= lesson.length - 1) state.tutorAutoPlay = false;
    render();
  }, 3600);
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
  syncTutorAutoPlay();
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
    state.teacherTab = "overview";
    state.teacherSelectedStudentId = null;
    state.teacherAnswerFilter = "all";
  }
  if (action === "set-teacher-tab") {
    state.teacherTab = element.dataset.tab || "overview";
    state.teacherSelectedStudentId = null;
    state.teacherAnswerFilter = "all";
  }
  if (action === "logout") state = { ...state, screen: "login", currentUserId: null, role: null, loginMode: "student", loginName: "", loginError: "", adminMessage: "", staffToken: null, staffFullName: "", teacherSelectedStudentId: null, teacherAnswerFilter: "all", teacherTab: "overview", tutorAutoPlay: false };
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
      state.tutorAutoPlay = true;
    } else {
      state.tutorAutoPlay = false;
    }
    state.tutorOpen = !state.tutorOpen;
  }
  if (action === "toggle-tutor-autoplay") {
    state.tutorAutoPlay = !state.tutorAutoPlay;
  }
  if (action === "restart-tutor") {
    state.tutorStep = 0;
    state.tutorAutoPlay = true;
    state.tutorUsedOnQuestion = true;
    state.tutorMaxStep = Math.max(state.tutorMaxStep, 0);
  }
  if (action === "next-tutor-step") {
    const question = state.questions[state.questionIndex];
    state.tutorStep = Math.min(state.tutorStep + 1, buildTutorSteps(question).length - 1);
    state.tutorUsedOnQuestion = true;
    state.tutorMaxStep = Math.max(state.tutorMaxStep, state.tutorStep);
  }
  if (action === "previous-tutor-step") {
    state.tutorStep = Math.max(0, state.tutorStep - 1);
  }
  if (action === "view-student-errors" || action === "view-student-performance") {
    state.teacherSelectedStudentId = element.dataset.student;
    state.teacherAnswerFilter = "all";
    state.teacherTab = "responses";
    state.screen = "teacher";
  }
  if (action === "set-answer-filter") state.teacherAnswerFilter = element.dataset.filter || "all";
  if (action === "close-student-details") {
    state.teacherSelectedStudentId = null;
    state.teacherAnswerFilter = "all";
  }
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
      state.teacherTab = "overview";
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
  if (event.target.matches("[data-teacher-filter]")) {
    const filter = event.target.dataset.teacherFilter;
    if (filter === "student") state.teacherStudentFilter = event.target.value || "all";
    if (filter === "operation") state.teacherOperationFilter = event.target.value || "all";
    if (filter === "difficulty") state.teacherDifficultyFilter = event.target.value || "all";
    render();
    return;
  }

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
  if (event.target.matches("[data-teacher-search]")) {
    state.teacherSearch = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const input = app.querySelector("[data-teacher-search]");
    if (input) { input.focus(); input.setSelectionRange(cursor, cursor); }
    return;
  }
  if (!event.target.matches("input[name='fullName']")) return;
  state.loginName = event.target.value;
}, true);

initApp();