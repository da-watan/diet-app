const storageKey = "fit-note-v1";

const state = loadState();
let activeChart = "weight";

const goalForm = document.querySelector("#goalForm");
const logForm = document.querySelector("#logForm");
const tabs = document.querySelectorAll(".tab");
const chartTabs = document.querySelectorAll(".chart-tab");
const views = {
  today: document.querySelector("#todayView"),
  progress: document.querySelector("#progressView"),
  history: document.querySelector("#historyView"),
  settings: document.querySelector("#settingsView"),
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
          logs: Array.isArray(saved.logs) ? saved.logs.map(normalizeLog).filter(Boolean) : [],
        }
      : fallback;
  } catch {
    return fallback;
  }
}

function normalizeLog(log) {
  if (!log || !log.date || !Number.isFinite(Number(log.weight))) return null;
  return {
    date: log.date,
    weight: Number(log.weight),
    bodyFat: numberValue(log.bodyFat),
    calories: numberValue(log.calories),
    exerciseMinutes: numberValue(log.exerciseMinutes),
    protein: numberValue(log.protein),
    fat: numberValue(log.fat),
    carbs: numberValue(log.carbs),
    note: typeof log.note === "string" ? log.note : "",
    tags: Array.isArray(log.tags) ? log.tags : [],
  };
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
  return Number.isFinite(parsed) && value !== "" && value !== null ? parsed : null;
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
  return sortedLogs().at(-1) || null;
}

function latestBodyFatLog() {
  return sortedLogs().filter((log) => Number.isFinite(log.bodyFat)).at(-1) || null;
}

function findLogByDate(date) {
  return state.logs.find((log) => log.date === date) || null;
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

  logForm.elements.date.value = logForm.elements.date.value || today();
  populateLogForm(logForm.elements.date.value);
}

function populateLogForm(date) {
  const existing = findLogByDate(date);
  const fields = ["weight", "bodyFat", "calories", "exerciseMinutes", "protein", "fat", "carbs", "note"];
  fields.forEach((field) => {
    const input = logForm.elements[field];
    if (!input) return;
    input.value = existing?.[field] ?? "";
  });

  logForm.querySelectorAll('input[name="tags"]').forEach((input) => {
    input.checked = Boolean(existing?.tags?.includes(input.value));
  });
  updateTodayStatus();
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

function summaryStatus(recent, progress) {
  if (progress >= 100) return { className: "is-stable", label: "目標到達です。維持ペースへ切り替えましょう" };
  if (Number.isFinite(recent) && recent < -1.2) return { className: "is-alert", label: "体重の落ち方が速めです" };
  if (Number.isFinite(recent) && recent > 0.4) return { className: "is-caution", label: "直近は少し増えています" };
  if (Number.isFinite(recent)) return { className: "is-stable", label: "良いペースです" };
  return { className: "is-neutral", label: "記録を追加すると傾向を表示します" };
}

function updateSummary() {
  const current = numberValue(state.goal.currentWeight);
  const goal = numberValue(state.goal.goalWeight);
  const logs = sortedLogs();
  const weights = logs.map((log) => log.weight).filter(Number.isFinite);
  const recent = weights.length > 1 ? weights.at(-1) - weights[Math.max(0, weights.length - 8)] : null;
  const last = latestLog();
  const targetCalories = calculateTargetCalories();
  const todayLog = findLogByDate(today());
  const ring = document.querySelector("#goalRing");
  const ringValue = document.querySelector("#ringValue");
  const summaryPanel = document.querySelector("#summaryPanel");
  const paceLabel = document.querySelector("#paceLabel");
  const weightDelta = document.querySelector("#weightDelta");
  const calorieTarget = document.querySelector("#calorieTarget");
  const todayBudget = document.querySelector("#todayBudget");

  let progress = 0;
  let deltaText = "変化 -- kg";

  if (current && goal && last) {
    const total = current - goal;
    const done = current - last.weight;
    progress = total === 0 ? 100 : Math.max(0, Math.min(100, (done / total) * 100));
    deltaText = `変化 ${formatSigned(last.weight - current, " kg")}`;
  }

  const status = summaryStatus(recent, progress);
  summaryPanel.classList.remove("is-stable", "is-neutral", "is-caution", "is-alert");
  summaryPanel.classList.add(status.className);
  ring.style.background = `conic-gradient(var(--mint) ${progress * 3.6}deg, var(--line) 0deg)`;
  ringValue.textContent = `${Math.round(progress)}%`;
  paceLabel.textContent = !current || !goal ? "目標を設定するとペースを表示します" : status.label;
  weightDelta.textContent = deltaText;
  calorieTarget.textContent = targetCalories ? `今日の目安 ${targetCalories} kcal` : "今日の目安 -- kcal";

  if (targetCalories && Number.isFinite(todayLog?.calories)) {
    todayBudget.textContent = `あと ${targetCalories - todayLog.calories} kcal`;
  } else {
    todayBudget.textContent = targetCalories ? `${targetCalories} kcal` : "-- kcal";
  }
}

function updateProgress() {
  const logs = sortedLogs();
  const weights = logs.map((log) => log.weight).filter(Number.isFinite);
  const bodyFatValues = logs.map((log) => log.bodyFat).filter(Number.isFinite);
  const lastSeven = weights.slice(-7);
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
  document.querySelector("#remainingWeight").textContent = Number.isFinite(remaining) ? `${remaining.toFixed(1)} kg` : "-- kg";
  document.querySelector("#averageBodyFat").textContent = bodyFatAverage ? `${bodyFatAverage.toFixed(1)}%` : "--%";
  document.querySelector("#fatMass").textContent = Number.isFinite(fatMass) ? `${fatMass.toFixed(1)} kg` : "-- kg";
  document.querySelector("#leanMass").textContent = Number.isFinite(leanMass) ? `${leanMass.toFixed(1)} kg` : "-- kg";
  document.querySelector("#bmiValue").textContent = bmi ? bmi.toFixed(1) : "--";
  document.querySelector("#daysLeft").textContent = Number.isFinite(daysLeft) ? `${Math.max(0, daysLeft)}日` : "--日";
  document.querySelector("#logCount").textContent = `${logs.length}日`;
  document.querySelector("#coachMessage").textContent = coachMessage(logs, recent);
  drawChart(logs);
}

function coachMessage(logs, recent) {
  if (logs.length < 3) return "3日以上記録すると傾向を表示します。まずは入力の手間を小さく保つのが勝ち筋です。";
  if (Number.isFinite(recent) && recent < -1.2) return "体重の落ち方が速めです。空腹感や睡眠の質もメモして、無理が出ていないか見てください。";
  if (Number.isFinite(recent) && recent > 0.4) return "直近は少し増えています。水分や塩分でも動くので、単日ではなく7日平均で判断しましょう。";
  return "良いペースです。食事内容を大きく変えず、歩数やたんぱく質を安定させると続けやすくなります。";
}

function chartConfig() {
  const configs = {
    weight: { field: "weight", label: "体重", unit: "kg", color: "#2d7c63", padding: 0.4 },
    bodyFat: { field: "bodyFat", label: "体脂肪率", unit: "%", color: "#3b8ea5", padding: 0.5 },
    calories: { field: "calories", label: "摂取kcal", unit: "kcal", color: "#d99d2b", padding: 80 },
  };
  return configs[activeChart];
}

function drawChart(logs) {
  const canvas = document.querySelector("#weightChart");
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const config = chartConfig();
  const points = logs.filter((log) => Number.isFinite(log[config.field]));

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  if (points.length < 2) {
    context.fillStyle = "#6a7480";
    context.font = "24px sans-serif";
    context.textAlign = "center";
    context.fillText(`${config.label}を2日以上記録`, width / 2, height / 2);
    return;
  }

  const values = points.map((log) => log[config.field]);
  const min = Math.min(...values) - config.padding;
  const max = Math.max(...values) + config.padding;
  const left = 58;
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

  context.strokeStyle = config.color;
  context.lineWidth = 5;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  points.forEach((log, index) => {
    const x = left + (plotWidth * index) / (points.length - 1);
    const y = top + plotHeight - ((log[config.field] - min) / (max - min)) * plotHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  context.fillStyle = "#17202a";
  context.font = "20px sans-serif";
  context.textAlign = "left";
  context.fillText(`${max.toFixed(config.field === "calories" ? 0 : 1)}${config.unit}`, 4, top + 8);
  context.fillText(`${min.toFixed(config.field === "calories" ? 0 : 1)}${config.unit}`, 4, height - bottom + 8);

  context.fillStyle = config.color;
  points.forEach((log, index) => {
    const x = left + (plotWidth * index) / (points.length - 1);
    const y = top + plotHeight - ((log[config.field] - min) / (max - min)) * plotHeight;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
  });
}

function updateHistory() {
  const list = document.querySelector("#historyList");
  const template = document.querySelector("#historyItemTemplate");
  const logs = sortedLogs();
  list.replaceChildren();

  logs
    .slice()
    .reverse()
    .forEach((log) => {
      const originalIndex = logs.findIndex((entry) => entry.date === log.date);
      const previous = originalIndex > 0 ? logs[originalIndex - 1] : null;
      const item = template.content.firstElementChild.cloneNode(true);
      const delta = previous ? formatSigned(log.weight - previous.weight, " kg") : "-- kg";
      const bodyFat = Number.isFinite(log.bodyFat) ? ` / ${log.bodyFat.toFixed(1)}%` : "";
      const calories = Number.isFinite(log.calories) ? `${log.calories} kcal` : "-- kcal";

      item.querySelector('[data-field="date"]').textContent = log.date;
      item.querySelector('[data-field="delta"]').textContent = `前回比 ${delta}`;
      item.querySelector('[data-field="note"]').textContent = log.note || "メモなし";
      item.querySelector('[data-field="weight"]').textContent = `${log.weight.toFixed(1)} kg`;
      item.querySelector('[data-field="details"]').textContent = `${calories}${bodyFat}`;

      const tagList = item.querySelector('[data-field="tags"]');
      (log.tags || []).forEach((tag) => {
        const chip = document.createElement("span");
        chip.textContent = tag;
        tagList.append(chip);
      });

      item.querySelector(".delete-log").addEventListener("click", () => {
        state.logs = state.logs.filter((entry) => entry.date !== log.date);
        saveAndRender();
        populateLogForm(logForm.elements.date.value);
      });
      list.append(item);
    });
}

function updateTodayStatus() {
  const selectedDate = logForm.elements.date.value;
  const existing = findLogByDate(selectedDate);
  const badge = document.querySelector("#todayStatus");
  const button = document.querySelector("#logSubmitButton");
  badge.textContent = existing ? "記録済み" : "未記録";
  badge.classList.toggle("is-done", Boolean(existing));
  button.textContent = existing ? "今日の記録を更新" : "今日を記録";
}

function saveAndRender() {
  saveState();
  updateSummary();
  updateProgress();
  updateHistory();
  updateTodayStatus();
}

goalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.goal = Object.fromEntries(new FormData(goalForm).entries());
  saveAndRender();
});

logForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(logForm).entries());
  const formData = new FormData(logForm);
  const log = normalizeLog({
    date: data.date,
    weight: data.weight,
    bodyFat: data.bodyFat,
    calories: data.calories,
    exerciseMinutes: data.exerciseMinutes,
    protein: data.protein,
    fat: data.fat,
    carbs: data.carbs,
    note: data.note.trim(),
    tags: formData.getAll("tags"),
  });

  if (!log) return;
  state.logs = state.logs.filter((entry) => entry.date !== log.date).concat(log);
  saveAndRender();
  populateLogForm(log.date);
});

logForm.elements.date.addEventListener("change", (event) => {
  populateLogForm(event.target.value);
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    Object.entries(views).forEach(([name, view]) => {
      view.classList.toggle("is-active", tab.dataset.tab === name);
    });
  });
});

chartTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeChart = tab.dataset.chart;
    chartTabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    drawChart(sortedLogs());
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
      tags: index % 2 === 0 ? ["運動あり"] : ["外食"],
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
    Object.entries(state.goal).forEach(([key, value]) => {
      const input = goalForm.elements[key];
      if (input) input.value = value;
    });
  }
  saveAndRender();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  if (!confirm("すべての記録を削除しますか？")) return;
  state.logs = [];
  saveAndRender();
  populateLogForm(logForm.elements.date.value);
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
    state.logs = imported.logs.map(normalizeLog).filter(Boolean);
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
