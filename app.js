const storageKey = "fit-note-v1";

const state = loadState();

const goalForm = document.querySelector("#goalForm");
const logForm = document.querySelector("#logForm");
const tabs = document.querySelectorAll(".tab");
const views = {
  today: document.querySelector("#todayView"),
  progress: document.querySelector("#progressView"),
  history: document.querySelector("#historyView"),
};

function loadState() {
  const fallback = {
    goal: {
      currentWeight: "",
      goalWeight: "",
      height: "",
      deadline: "",
      maintenanceCalories: "",
    },
    logs: [],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return saved
      ? {
          goal: { ...fallback.goal, ...saved.goal },
          logs: Array.isArray(saved.logs) ? saved.logs : [],
        }
      : fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function today() {
  return localDateString(new Date());
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== "" ? parsed : null;
}

function formatSigned(value, suffix = "") {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function sortedLogs() {
  return [...state.logs].sort((a, b) => a.date.localeCompare(b.date));
}

function latestLog() {
  const logs = sortedLogs();
  return logs.at(-1) || null;
}

function latestBodyFatLog() {
  const logs = sortedLogs();
  return logs.filter((log) => Number.isFinite(log.bodyFat)).at(-1) || null;
}

function daysUntilDeadline() {
  if (!state.goal.deadline) return null;
  const deadline = new Date(`${state.goal.deadline}T00:00:00`);
  return Math.ceil((deadline - new Date()) / 86400000);
}

function calculateBmi(weight) {
  const height = numberValue(state.goal.height);
  if (!height || !weight) return null;
  const meters = height / 100;
  return weight / (meters * meters);
}

function fillForms() {
  Object.entries(state.goal).forEach(([key, value]) => {
    const input = goalForm.elements[key];
    if (input) input.value = value;
  });

  logForm.elements.date.value = today();
}

function calculateTargetCalories() {
  const current = numberValue(state.goal.currentWeight);
  const goal = numberValue(state.goal.goalWeight);
  const maintenance = numberValue(state.goal.maintenanceCalories);
  const deadline = state.goal.deadline ? new Date(`${state.goal.deadline}T00:00:00`) : null;

  if (!current || !goal || !maintenance || !deadline) return null;

  const days = Math.max(1, Math.ceil((deadline - new Date()) / 86400000));
  const kgToLose = current - goal;
  const dailyDeficit = (kgToLose * 7700) / days;
  return Math.round(Math.max(1200, maintenance - dailyDeficit));
}

function updateSummary() {
  const current = numberValue(state.goal.currentWeight);
  const goal = numberValue(state.goal.goalWeight);
  const last = latestLog();
  const targetCalories = calculateTargetCalories();
  const ring = document.querySelector("#goalRing");
  const ringValue = document.querySelector("#ringValue");
  const paceLabel = document.querySelector("#paceLabel");
  const weightDelta = document.querySelector("#weightDelta");
  const calorieTarget = document.querySelector("#calorieTarget");

  let progress = 0;
  let deltaText = "-- kg";

  if (current && goal && last) {
    const total = current - goal;
    const done = current - last.weight;
    progress = total === 0 ? 100 : Math.max(0, Math.min(100, (done / total) * 100));
    deltaText = formatSigned(last.weight - current, " kg");
  }

  ring.style.background = `conic-gradient(var(--mint) ${progress * 3.6}deg, var(--line) 0deg)`;
  ringValue.textContent = `${Math.round(progress)}%`;
  weightDelta.textContent = deltaText;
  calorieTarget.textContent = targetCalories ? `目安 ${targetCalories} kcal / 日` : "目安 -- kcal / 日";

  if (!current || !goal) {
    paceLabel.textContent = "目標を設定するとペースを表示します";
  } else if (!last) {
    paceLabel.textContent = "今日の体重を記録すると進捗を表示します";
  } else if (progress >= 100) {
    paceLabel.textContent = "目標到達です。維持ペースへ切り替えましょう";
  } else {
    paceLabel.textContent = "焦らず週平均で見ていきましょう";
  }
}

function updateProgress() {
  const logs = sortedLogs();
  const weights = logs.map((log) => log.weight).filter(Number.isFinite);
  const lastSeven = weights.slice(-7);
  const bodyFatValues = logs.map((log) => log.bodyFat).filter(Number.isFinite);
  const lastSevenBodyFat = bodyFatValues.slice(-7);
  const average = lastSeven.length ? lastSeven.reduce((sum, value) => sum + value, 0) / lastSeven.length : null;
  const bodyFatAverage = lastSevenBodyFat.length
    ? lastSevenBodyFat.reduce((sum, value) => sum + value, 0) / lastSevenBodyFat.length
    : null;
  const recent = weights.length > 1 ? weights.at(-1) - weights[Math.max(0, weights.length - 8)] : null;
  const goal = numberValue(state.goal.goalWeight);
  const last = latestLog();
  const bodyFatLog = latestBodyFatLog();
  const bmi = calculateBmi(last?.weight || numberValue(state.goal.currentWeight));
  const remaining = last && goal ? Math.max(0, last.weight - goal) : null;
  const daysLeft = daysUntilDeadline();
  const fatMass = bodyFatLog ? bodyFatLog.weight * (bodyFatLog.bodyFat / 100) : null;
  const leanMass = bodyFatLog ? bodyFatLog.weight - fatMass : null;

  document.querySelector("#averageWeight").textContent = average ? `${average.toFixed(1)} kg` : "-- kg";
  document.querySelector("#recentChange").textContent = Number.isFinite(recent) ? formatSigned(recent, " kg") : "-- kg";
  document.querySelector("#logCount").textContent = `${logs.length}日`;
  document.querySelector("#bmiValue").textContent = bmi ? bmi.toFixed(1) : "--";
  document.querySelector("#remainingWeight").textContent = Number.isFinite(remaining) ? `${remaining.toFixed(1)} kg` : "-- kg";
  document.querySelector("#daysLeft").textContent = Number.isFinite(daysLeft) ? `${Math.max(0, daysLeft)}日` : "--日";
  document.querySelector("#averageBodyFat").textContent = bodyFatAverage ? `${bodyFatAverage.toFixed(1)}%` : "--%";
  document.querySelector("#fatMass").textContent = Number.isFinite(fatMass) ? `${fatMass.toFixed(1)} kg` : "-- kg";
  document.querySelector("#leanMass").textContent = Number.isFinite(leanMass) ? `${leanMass.toFixed(1)} kg` : "-- kg";
  document.querySelector("#coachMessage").textContent = coachMessage(logs, recent);
  drawChart(logs);
}

function coachMessage(logs, recent) {
  if (logs.length < 3) return "3日以上記録すると傾向を表示します。まずは入力の手間を小さく保つのが勝ち筋です。";
  if (Number.isFinite(recent) && recent < -1.2) return "体重の落ち方が速めです。空腹感や睡眠の質もメモして、無理が出ていないか見てください。";
  if (Number.isFinite(recent) && recent > 0.4) return "直近は少し増えています。水分や塩分でも動くので、単日ではなく7日平均で判断しましょう。";
  return "良いペースです。食事内容を大きく変えず、歩数やたんぱく質を安定させると続けやすくなります。";
}

function drawChart(logs) {
  const canvas = document.querySelector("#weightChart");
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  if (logs.length < 2) {
    context.fillStyle = "#6a7480";
    context.font = "26px sans-serif";
    context.textAlign = "center";
    context.fillText("記録を追加するとグラフを表示", width / 2, height / 2);
    return;
  }

  const values = logs.map((log) => log.weight);
  const min = Math.min(...values) - 0.4;
  const max = Math.max(...values) + 0.4;
  const left = 46;
  const right = 20;
  const top = 24;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  context.strokeStyle = "#dfe6e8";
  context.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    const y = top + (plotHeight / 3) * i;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(width - right, y);
    context.stroke();
  }

  context.strokeStyle = "#2d7c63";
  context.lineWidth = 5;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  logs.forEach((log, index) => {
    const x = left + (plotWidth * index) / (logs.length - 1);
    const y = top + plotHeight - ((log.weight - min) / (max - min)) * plotHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  context.fillStyle = "#17202a";
  context.font = "22px sans-serif";
  context.textAlign = "left";
  context.fillText(`${max.toFixed(1)}kg`, 4, top + 8);
  context.fillText(`${min.toFixed(1)}kg`, 4, height - bottom + 8);

  context.fillStyle = "#3b8ea5";
  logs.forEach((log, index) => {
    const x = left + (plotWidth * index) / (logs.length - 1);
    const y = top + plotHeight - ((log.weight - min) / (max - min)) * plotHeight;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
  });
}

function updateHistory() {
  const list = document.querySelector("#historyList");
  const template = document.querySelector("#historyItemTemplate");
  list.replaceChildren();

  sortedLogs()
    .reverse()
    .forEach((log) => {
      const item = template.content.firstElementChild.cloneNode(true);
      item.querySelector('[data-field="date"]').textContent = log.date;
      item.querySelector('[data-field="note"]').textContent = log.note || "メモなし";
      item.querySelector('[data-field="weight"]').textContent = `${log.weight.toFixed(1)} kg`;
      const bodyFat = Number.isFinite(log.bodyFat) ? ` / ${log.bodyFat.toFixed(1)}%` : "";
      item.querySelector('[data-field="calories"]').textContent = log.calories ? `${log.calories} kcal${bodyFat}` : `-- kcal${bodyFat}`;
      item.querySelector(".delete-log").addEventListener("click", () => {
        state.logs = state.logs.filter((entry) => entry.date !== log.date);
        saveAndRender();
      });
      list.append(item);
    });
}

function saveAndRender() {
  saveState();
  updateSummary();
  updateProgress();
  updateHistory();
}

goalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.goal = Object.fromEntries(new FormData(goalForm).entries());
  saveAndRender();
});

logForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(logForm).entries());
  const log = {
    date: data.date,
    weight: Number(data.weight),
    bodyFat: numberValue(data.bodyFat),
    calories: numberValue(data.calories),
    exerciseMinutes: numberValue(data.exerciseMinutes),
    protein: numberValue(data.protein),
    fat: numberValue(data.fat),
    carbs: numberValue(data.carbs),
    note: data.note.trim(),
  };

  state.logs = state.logs.filter((entry) => entry.date !== log.date).concat(log);
  saveAndRender();
  logForm.reset();
  logForm.elements.date.value = today();
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    Object.entries(views).forEach(([name, view]) => {
      view.classList.toggle("is-active", tab.dataset.tab === name);
    });
  });
});

document.querySelector("#sampleButton").addEventListener("click", () => {
  const start = new Date();
  const samples = Array.from({ length: 9 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (8 - index));
    return {
      date: localDateString(date),
      weight: 72.4 - index * 0.18 + (index % 2) * 0.08,
      bodyFat: 25.2 - index * 0.12 + (index % 2) * 0.05,
      calories: 1850 + (index % 3) * 80,
      exerciseMinutes: index % 2 === 0 ? 30 : 0,
      protein: 110,
      fat: 48,
      carbs: 205,
      note: index % 3 === 0 ? "散歩あり" : "",
    };
  });

  state.logs = samples;
  if (!state.goal.currentWeight) {
    state.goal = {
      currentWeight: "72.4",
      goalWeight: "68.0",
      height: "170.0",
      deadline: localDateString(new Date(Date.now() + 86400000 * 84)),
      maintenanceCalories: "2200",
    };
    fillForms();
  }
  saveAndRender();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  if (!confirm("すべての記録を削除しますか？")) return;
  state.logs = [];
  saveAndRender();
});

document.querySelector("#importButton").addEventListener("click", () => {
  document.querySelector("#importFile").click();
});

document.querySelector("#importFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    if (!imported || typeof imported !== "object" || !Array.isArray(imported.logs)) {
      throw new Error("Invalid backup");
    }

    state.goal = { ...state.goal, ...(imported.goal || {}) };
    state.logs = imported.logs
      .filter((log) => log.date && Number.isFinite(Number(log.weight)))
      .map((log) => ({
        date: log.date,
        weight: Number(log.weight),
        bodyFat: numberValue(log.bodyFat),
        calories: numberValue(log.calories),
        exerciseMinutes: numberValue(log.exerciseMinutes),
        protein: numberValue(log.protein),
        fat: numberValue(log.fat),
        carbs: numberValue(log.carbs),
        note: typeof log.note === "string" ? log.note : "",
      }));
    fillForms();
    saveAndRender();
  } catch {
    alert("復元できませんでした。Fit Noteから書き出したJSONを選んでください。");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fit-note-${today()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

fillForms();
saveAndRender();
