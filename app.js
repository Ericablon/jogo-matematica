const app = document.getElementById("app");

const STORAGE_KEY = "matematica_em_fases_v2";
const LEGACY_STORAGE_KEY = "matematica_em_fases_v1";
const LEVELS_PER_WORLD = 10;

const worlds = [
  {
    id: "soma",
    name: "Soma",
    emoji: "+",
    description: "Aprenda adição com fases progressivas.",
    operation: "add"
  },
  {
    id: "subtracao",
    name: "Subtração",
    emoji: "-",
    description: "Resolva contas de subtração sem complicação.",
    operation: "subtract"
  },
  {
    id: "multiplicacao",
    name: "Multiplicação",
    emoji: "×",
    description: "Treine a tabuada de forma divertida.",
    operation: "multiply"
  },
  {
    id: "divisao",
    name: "Divisão",
    emoji: "÷",
    description: "Pratique divisões exatas por fase.",
    operation: "divide"
  },
  {
    id: "misto",
    name: "Desafio Misto",
    emoji: "★",
    description: "Misture tudo e teste seu raciocínio.",
    operation: "mixed"
  }
];

let gameData = loadGameData();
let progress = getActiveProgress();

let state = {
  screen: gameData.activePlayerId ? "home" : "login",
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
  loginError: ""
};

function createEmptyProgress() {
  return {
    completed: {},
    lastPlayed: null
  };
}

function createEmptyGameData() {
  return {
    players: {},
    activePlayerId: null
  };
}

function loadGameData() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.players && typeof parsed.players === "object") {
        return parsed;
      }
    } catch {
      return createEmptyGameData();
    }
  }

  return createEmptyGameData();
}

function saveGameData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameData));
}

function getActivePlayer() {
  if (!gameData.activePlayerId) return null;
  return gameData.players[gameData.activePlayerId] || null;
}

function getActiveProgress() {
  const player = getActivePlayer();
  return player?.progress || createEmptyProgress();
}

function setActivePlayer(playerId) {
  gameData.activePlayerId = playerId;
  progress = getActiveProgress();
  saveGameData();
}

function normalizeText(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createPlayerId(fullName, birthDate) {
  return `${normalizeText(fullName)}_${birthDate}`;
}

function createOrSelectPlayer(fullName, birthDate) {
  const cleanName = fullName.trim().replace(/\s+/g, " ");
  const playerId = createPlayerId(cleanName, birthDate);
  const legacyProgress = tryLoadLegacyProgress();

  if (!gameData.players[playerId]) {
    gameData.players[playerId] = {
      id: playerId,
      fullName: cleanName,
      birthDate,
      progress: legacyProgress || createEmptyProgress(),
      createdAt: new Date().toISOString()
    };
  }

  setActivePlayer(playerId);
}

function tryLoadLegacyProgress() {
  if (Object.keys(gameData.players).length > 0) return null;

  const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved);
    if (parsed.completed && typeof parsed.completed === "object") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function saveProgress() {
  const player = getActivePlayer();
  if (!player) return;

  player.progress = progress;
  player.updatedAt = new Date().toISOString();
  saveGameData();
}

function getLevelKey(worldId, level) {
  return `${worldId}_fase_${level}`;
}

function getWorldById(worldId) {
  return worlds.find((world) => world.id === worldId);
}

function getLevelData(worldId, level) {
  const key = getLevelKey(worldId, level);
  return progress.completed[key];
}

function isLevelUnlocked(worldId, level) {
  if (level === 1) return true;

  const previousLevel = getLevelData(worldId, level - 1);
  return previousLevel && previousLevel.passed;
}

function getTotalStats(targetProgress = progress) {
  const levels = Object.values(targetProgress.completed);

  const totalScore = levels.reduce((sum, item) => sum + (item.bestScore || 0), 0);
  const totalStars = levels.reduce((sum, item) => sum + (item.stars || 0), 0);
  const completedLevels = levels.filter((item) => item.passed).length;
  const totalLevels = worlds.length * LEVELS_PER_WORLD;

  return {
    totalScore,
    totalStars,
    completedLevels,
    totalLevels,
    isGameComplete: completedLevels >= totalLevels
  };
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

function generateQuestion(operation, level) {
  const difficulty = Math.max(1, level);

  if (operation === "mixed") {
    const operations = ["add", "subtract", "multiply", "divide"];
    const selectedOperation = operations[randomNumber(0, operations.length - 1)];
    return generateQuestion(selectedOperation, level);
  }

  let a;
  let b;
  let correct;
  let text;

  if (operation === "add") {
    const max = 8 + difficulty * 6;
    a = randomNumber(1, max);
    b = randomNumber(1, max);
    correct = a + b;
    text = `${a} + ${b}`;
  }

  if (operation === "subtract") {
    const max = 10 + difficulty * 8;
    a = randomNumber(5, max);
    b = randomNumber(1, a);
    correct = a - b;
    text = `${a} - ${b}`;
  }

  if (operation === "multiply") {
    const max = Math.min(12, 3 + difficulty);
    a = randomNumber(1, max);
    b = randomNumber(1, max);
    correct = a * b;
    text = `${a} × ${b}`;
  }

  if (operation === "divide") {
    const divisor = randomNumber(1, Math.min(12, 3 + difficulty));
    const quotient = randomNumber(1, 4 + difficulty * 2);
    const dividend = divisor * quotient;

    correct = quotient;
    text = `${dividend} ÷ ${divisor}`;
  }

  return {
    text,
    correct,
    answers: generateAnswers(correct)
  };
}

function generateAnswers(correct) {
  const answers = new Set();
  answers.add(correct);

  while (answers.size < 4) {
    const variation = randomNumber(-10, 10);
    const wrongAnswer = correct + variation;

    if (wrongAnswer >= 0 && wrongAnswer !== correct) {
      answers.add(wrongAnswer);
    }
  }

  return shuffleArray([...answers]);
}

function generateLevelQuestions(worldId, level) {
  const world = getWorldById(worldId);
  const questions = [];

  for (let i = 0; i < 10; i++) {
    questions.push(generateQuestion(world.operation, level));
  }

  return questions;
}

function getStars(correct) {
  if (correct === 10) return 3;
  if (correct >= 8) return 2;
  if (correct >= 6) return 1;
  return 0;
}

function renderStars(amount) {
  if (!amount) return "☆ ☆ ☆";

  const full = "★".repeat(amount);
  const empty = "☆".repeat(3 - amount);

  return `${full}${empty}`;
}

function goTo(screen) {
  state.screen = screen;
  render();
}

function startLevel(worldId, level) {
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
    loginError: ""
  };

  progress.lastPlayed = {
    worldId,
    level
  };

  saveProgress();
  render();
}

function answerQuestion(answer) {
  if (state.answered) return;

  const currentQuestion = state.questions[state.questionIndex];
  const isCorrect = Number(answer) === currentQuestion.correct;

  state.answered = true;
  state.selectedAnswer = Number(answer);

  if (isCorrect) {
    state.correct += 1;
    state.score += 100 + state.lives * 10;
    state.feedback = "Muito bem! Resposta correta.";
  } else {
    state.wrong += 1;
    state.lives -= 1;
    state.feedback = `Ops! A resposta certa era ${currentQuestion.correct}.`;
  }

  render();
}

function nextQuestion() {
  const isLastQuestion = state.questionIndex >= state.questions.length - 1;
  const isOutOfLives = state.lives <= 0;

  if (isLastQuestion || isOutOfLives) {
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
  const stars = getStars(state.correct);
  const passed = state.correct >= 7;
  const finalScore = state.score + stars * 200;

  const key = getLevelKey(state.currentWorldId, state.currentLevel);
  const oldData = progress.completed[key];

  const shouldSave =
    !oldData ||
    finalScore > oldData.bestScore ||
    stars > oldData.stars ||
    passed;

  if (shouldSave) {
    progress.completed[key] = {
      worldId: state.currentWorldId,
      level: state.currentLevel,
      passed: passed || Boolean(oldData?.passed),
      stars: Math.max(stars, oldData?.stars || 0),
      bestScore: Math.max(finalScore, oldData?.bestScore || 0),
      bestCorrect: Math.max(state.correct, oldData?.bestCorrect || 0),
      updatedAt: new Date().toISOString()
    };

    saveProgress();
  }

  state.score = finalScore;
  state.screen = "result";
  render();
}

function resetProgress() {
  const confirmReset = confirm("Tem certeza que deseja apagar o progresso deste jogador?");

  if (!confirmReset) return;

  progress = createEmptyProgress();
  saveProgress();
  state.screen = "home";
  render();
}

function logoutPlayer() {
  gameData.activePlayerId = null;
  progress = createEmptyProgress();
  saveGameData();
  state.screen = "login";
  render();
}

function renderPlayerBar() {
  const player = getActivePlayer();
  if (!player) return "";

  return `
    <div class="player-bar">
      <div>
        <strong>${player.fullName}</strong>
        <span>Nascimento: ${formatDate(player.birthDate)}</span>
      </div>
      <button class="btn btn-light" data-action="logout">Trocar jogador</button>
    </div>
  `;
}

function renderLogin() {
  const players = Object.values(gameData.players);
  const playerList = players.length
    ? players
        .map((player) => {
          const stats = getTotalStats(player.progress);
          return `
            <button class="player-option" data-action="select-player" data-player="${player.id}">
              <span>
                <strong>${player.fullName}</strong>
                <small>${formatDate(player.birthDate)} • ${stats.completedLevels}/${stats.totalLevels} fases</small>
              </span>
              <b>Entrar</b>
            </button>
          `;
        })
        .join("")
    : `<div class="empty">Nenhum jogador cadastrado ainda.</div>`;

  app.innerHTML = `
    <div class="app-container">
      <section class="card login-card">
        <div class="logo-badge">Jogo educativo</div>
        <h1>Matemática em Fases</h1>
        <p>Crie um jogador para salvar o progresso pelo nome completo e data de nascimento.</p>

        <form class="login-form" data-form="player">
          <label>
            Nome completo
            <input name="fullName" type="text" autocomplete="name" minlength="3" required placeholder="Ex: Maria Silva" />
          </label>

          <label>
            Data de nascimento
            <input name="birthDate" type="date" required />
          </label>

          ${state.loginError ? `<div class="feedback danger">${state.loginError}</div>` : ""}

          <button class="btn btn-primary" type="submit">Entrar no jogo</button>
        </form>
      </section>

      <section class="card login-card">
        <h2>Jogadores salvos</h2>
        <div class="player-list">
          ${playerList}
        </div>
      </section>
    </div>
  `;
}

function renderHome() {
  const stats = getTotalStats();

  const continueButton = progress.lastPlayed
    ? `<button class="btn btn-secondary" data-action="continue">Continuar fase</button>`
    : "";

  app.innerHTML = `
    <div class="app-container">
      ${renderPlayerBar()}
      <section class="hero">
        <div class="logo-badge">${stats.isGameComplete ? "Jogo zerado!" : "Jogo educativo"}</div>
        <h1>Matemática em Fases</h1>
        <p>
          Resolva desafios, ganhe estrelas, avance de fase e salve o progresso de cada jogador até zerar o jogo.
        </p>

        <div class="actions">
          <button class="btn btn-primary" data-action="go-worlds">Jogar agora</button>
          ${continueButton}
          <button class="btn btn-light" data-action="go-ranking">Meu desempenho</button>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <strong>${stats.completedLevels}/${stats.totalLevels}</strong>
            <span>Fases concluídas</span>
          </div>

          <div class="stat-card">
            <strong>${stats.totalStars}</strong>
            <span>Estrelas ganhas</span>
          </div>

          <div class="stat-card">
            <strong>${stats.totalScore}</strong>
            <span>Pontos totais</span>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderWorlds() {
  const cards = worlds
    .map((world) => {
      return `
        <article class="card world-card" data-action="select-world" data-world="${world.id}">
          <div class="world-icon">${world.emoji}</div>
          <h3>${world.name}</h3>
          <p>${world.description}</p>
        </article>
      `;
    })
    .join("");

  app.innerHTML = `
    <div class="app-container">
      ${renderPlayerBar()}
      <header class="page-header">
        <div>
          <h2>Escolha um mundo</h2>
          <p>Cada mundo tem fases com dificuldade progressiva.</p>
        </div>

        <button class="btn btn-light" data-action="go-home">Voltar</button>
      </header>

      <section class="grid world-grid">
        ${cards}
      </section>
    </div>
  `;
}

function renderLevels() {
  const world = getWorldById(state.currentWorldId);

  const levels = Array.from({ length: LEVELS_PER_WORLD }, (_, index) => {
    const level = index + 1;
    const unlocked = isLevelUnlocked(world.id, level);
    const data = getLevelData(world.id, level);
    const stars = data ? renderStars(data.stars) : "☆ ☆ ☆";
    const lockedClass = unlocked ? "" : "locked";

    return `
      <article
        class="card level-card ${lockedClass}"
        data-action="${unlocked ? "start-level" : ""}"
        data-world="${world.id}"
        data-level="${level}"
      >
        <div class="level-number">Fase ${level}</div>
        <div class="stars">${unlocked ? stars : "Bloqueada"}</div>
        <small>${data?.passed ? "Concluída" : unlocked ? "Disponível" : "Bloqueada"}</small>
      </article>
    `;
  }).join("");

  app.innerHTML = `
    <div class="app-container">
      ${renderPlayerBar()}
      <header class="page-header">
        <div>
          <h2>${world.emoji} ${world.name}</h2>
          <p>Acerte pelo menos 7 de 10 para liberar a próxima fase.</p>
        </div>

        <button class="btn btn-light" data-action="go-worlds">Voltar</button>
      </header>

      <section class="grid level-grid">
        ${levels}
      </section>
    </div>
  `;
}

function renderGame() {
  const world = getWorldById(state.currentWorldId);
  const currentQuestion = state.questions[state.questionIndex];

  const answers = currentQuestion.answers
    .map((answer) => {
      let className = "";

      if (state.answered) {
        if (answer === currentQuestion.correct) {
          className = "correct";
        } else if (answer === state.selectedAnswer) {
          className = "wrong";
        }
      }

      return `
        <button
          class="answer-btn ${className}"
          data-action="answer"
          data-answer="${answer}"
          ${state.answered ? "disabled" : ""}
        >
          ${answer}
        </button>
      `;
    })
    .join("");

  const feedbackClass =
    state.answered && state.selectedAnswer === currentQuestion.correct
      ? "success"
      : "danger";

  app.innerHTML = `
    <div class="app-container">
      <section class="card game-card">
        <div class="game-top">
          <div class="pill">${world.emoji} ${world.name}</div>
          <div class="pill">Fase ${state.currentLevel}</div>
          <div class="pill">Vidas: ${state.lives}</div>
          <div class="pill">Pontos: ${state.score}</div>
        </div>

        <div class="question-box">
          <div class="question-label">
            Pergunta ${state.questionIndex + 1} de ${state.questions.length}
          </div>

          <div class="question">
            ${currentQuestion.text}
          </div>
        </div>

        <div class="answers">
          ${answers}
        </div>

        ${
          state.answered
            ? `
              <div class="feedback ${feedbackClass}">
                ${state.feedback}
              </div>

              <div class="actions" style="margin-top: 18px; justify-content: center;">
                <button class="btn btn-primary" data-action="next-question">
                  Próxima
                </button>
              </div>
            `
            : ""
        }
      </section>
    </div>
  `;
}

function renderResult() {
  const stars = getStars(state.correct);
  const passed = state.correct >= 7;
  const world = getWorldById(state.currentWorldId);
  const stats = getTotalStats();

  app.innerHTML = `
    <div class="app-container">
      <section class="card result-card">
        <h2>${passed ? "Fase concluída!" : "Tente novamente!"}</h2>

        <p>
          ${world.emoji} ${world.name} - Fase ${state.currentLevel}
        </p>

        <div class="big-stars">
          ${renderStars(stars)}
        </div>

        ${stats.isGameComplete ? `<p class="complete-message">Parabéns! Você zerou o jogo com este jogador.</p>` : ""}

        <div class="result-grid">
          <div class="result-item">
            <strong>${state.correct}</strong>
            <span>Acertos</span>
          </div>

          <div class="result-item">
            <strong>${state.wrong}</strong>
            <span>Erros</span>
          </div>

          <div class="result-item">
            <strong>${state.lives}</strong>
            <span>Vidas</span>
          </div>

          <div class="result-item">
            <strong>${state.score}</strong>
            <span>Pontos</span>
          </div>
        </div>

        <div class="actions" style="justify-content: center;">
          <button class="btn btn-primary" data-action="retry-level">
            Jogar novamente
          </button>

          ${
            passed && state.currentLevel < LEVELS_PER_WORLD
              ? `<button class="btn btn-secondary" data-action="next-level">Próxima fase</button>`
              : ""
          }

          <button class="btn btn-light" data-action="go-levels">
            Ver fases
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderRanking() {
  const completed = Object.values(progress.completed)
    .filter((item) => item.passed)
    .sort((a, b) => b.bestScore - a.bestScore);

  const list = completed.length
    ? completed
        .map((item) => {
          const world = getWorldById(item.worldId);

          return `
            <div class="list-item">
              <div>
                <strong>${world.emoji} ${world.name} - Fase ${item.level}</strong>
                <br />
                <small>${renderStars(item.stars)} | ${item.bestCorrect}/10 acertos</small>
              </div>

              <strong>${item.bestScore} pts</strong>
            </div>
          `;
        })
        .join("")
    : `<div class="empty">Você ainda não concluiu nenhuma fase.</div>`;

  app.innerHTML = `
    <div class="app-container">
      ${renderPlayerBar()}
      <header class="page-header">
        <div>
          <h2>Meu desempenho</h2>
          <p>Veja as melhores fases concluídas deste jogador.</p>
        </div>

        <button class="btn btn-light" data-action="go-home">Voltar</button>
      </header>

      <section class="list">
        ${list}
      </section>

      <div class="actions" style="margin-top: 18px;">
        <button class="btn btn-danger" data-action="reset-progress">
          Apagar progresso deste jogador
        </button>
      </div>
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
}

app.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form='player']");
  if (!form) return;

  event.preventDefault();

  const formData = new FormData(form);
  const fullName = String(formData.get("fullName") || "").trim();
  const birthDate = String(formData.get("birthDate") || "");

  if (fullName.length < 3 || !birthDate) {
    state.loginError = "Preencha o nome completo e a data de nascimento.";
    render();
    return;
  }

  createOrSelectPlayer(fullName, birthDate);
  state.loginError = "";
  state.screen = "home";
  render();
});

app.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;

  const action = element.dataset.action;

  if (action === "go-home") {
    goTo("home");
  }

  if (action === "logout") {
    logoutPlayer();
  }

  if (action === "select-player") {
    setActivePlayer(element.dataset.player);
    state.screen = "home";
    render();
  }

  if (action === "go-worlds") {
    state.screen = "worlds";
    render();
  }

  if (action === "go-ranking") {
    state.screen = "ranking";
    render();
  }

  if (action === "select-world") {
    state.currentWorldId = element.dataset.world;
    state.screen = "levels";
    render();
  }

  if (action === "start-level") {
    const worldId = element.dataset.world;
    const level = Number(element.dataset.level);
    startLevel(worldId, level);
  }

  if (action === "answer") {
    answerQuestion(element.dataset.answer);
  }

  if (action === "next-question") {
    nextQuestion();
  }

  if (action === "retry-level") {
    startLevel(state.currentWorldId, state.currentLevel);
  }

  if (action === "next-level") {
    startLevel(state.currentWorldId, state.currentLevel + 1);
  }

  if (action === "go-levels") {
    state.screen = "levels";
    render();
  }

  if (action === "continue") {
    if (progress.lastPlayed) {
      startLevel(progress.lastPlayed.worldId, progress.lastPlayed.level);
    }
  }

  if (action === "reset-progress") {
    resetProgress();
  }
});

render();
