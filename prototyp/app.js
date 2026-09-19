const state = {
  round: 1,
  members: [
    { id: 1, name: "Membre 1", profession: "ÉTUDIANT", status: "ACTIF", available: 0, total_contributed: 0 },
    { id: 2, name: "Membre 2", profession: "TRAVAILLEUR", status: "ACTIF", available: 0, total_contributed: 0 },
    { id: 3, name: "Membre 3", profession: "CHÔMEUR", status: "NON VERIFIÉ", available: 0, total_contributed: 0 },
    { id: 4, name: "Membre 4", profession: "ÉTUDIANT", status: "PAUSE", available: 0, total_contributed: 0 },
    { id: 5, name: "Membre 5", profession: "TRAVAILLEUR", status: "PARTI", available: 0, total_contributed: 0 }
  ],
  loans: [],
  logs: [],
  history: []
};

const money = n => `${Number(n).toLocaleString("fr-FR", {minimumFractionDigits: 2, maximumFractionDigits: 2})} €`;
const $ = id => document.getElementById(id);
let editingMemberId = null;
let stateReady = false;
let saveQueue = Promise.resolve();
let currentUser = null;
let selectedChartMetrics = new Set(["available", "owned"]);

function saveState() {
  const snapshot = JSON.stringify(state);
  saveQueue = saveQueue
    .then(() => fetch("/api/state", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: snapshot
    }))
    .then(response => {
      if (!response.ok) throw new Error("La sauvegarde a échoué.");
    })
    .catch(error => console.error("Impossible de sauvegarder les données :", error));
}

async function loadState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Le chargement a échoué (HTTP ${response.status}).`);
    hydrateState(await response.json());
  } catch (error) {
    console.error("Impossible de charger les données :", error);
    alert(`Les données sauvegardées sont indisponibles. ${error.message}`);
  } finally {
    stateReady = true;
    render();
  }
}
function hydrateState(savedState) {
  Object.assign(state, savedState);
  state.members.forEach(member => {
    member.profession ||= "ÉTUDIANT";
    member.status ||= "ACTIF";
  });
  state.loans ||= [];
  state.logs ||= [];
  state.history ||= [];
}

function isActive(member) {
  return member?.status === "ACTIF" && member.role !== "ADMIN";
}
function activeMembers() {
  return state.members.filter(isActive);
}

function addLog(text) {
  const timestamp = new Date();
  state.logs.unshift({
    timestamp: timestamp.toISOString(),
    time: timestamp.toLocaleString("fr-FR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    }),
    text
  });
  recordSnapshot();
}

function availableTotal() {
  return activeMembers().reduce((s, m) => s + m.available, 0);
}
function totalCapital() {
  return activeMembers().reduce((s, m) => s + m.total_contributed, 0);
}
function outstanding() {
  return state.loans
    .filter(l => !l.repaid && isActive(state.members.find(m => m.id === l.borrowerId)))
    .reduce((s, l) => s + loanDue(l), 0);
}
function profits() {
  return activeMembers().reduce((s, m) => s + (m.total_contributed - m.available), 0);
}
function loanInterestPeriods(loan, now = new Date()) {
  const startedAt = new Date(loan.createdAt);
  if (Number.isNaN(startedAt.getTime()) || now < startedAt) return 1;

  const monthsElapsed = (now.getFullYear() - startedAt.getFullYear()) * 12
    + now.getMonth() - startedAt.getMonth();
  // L'intérêt initial est dû dès le prêt. Une mensualité supplémentaire est
  // ajoutée le lendemain de chaque date anniversaire mensuelle.
  return Math.max(1, monthsElapsed + (now.getDate() > startedAt.getDate() ? 1 : 0));
}
function loanInterest(loan, now = new Date()) {
  return loan.amount * loan.rate / 100 * loanInterestPeriods(loan, now);
}
function loanDue(loan, now = new Date()) {
  return loan.amount + loanInterest(loan, now);
}
function loanRateForAmount(amount) {
  if (amount >= 10000) return 2.5;
  if (amount >= 1000) return 3.5;
  return 5;
}
function updateLoanRatePreview() {
  const hint = $("loanRateHint");
  if (!hint) return;
  const amount = Number($("loanAmount").value);
  if (!amount || amount <= 0) {
    hint.textContent = "Taux mensuel : saisissez un montant";
    return;
  }
  const rate = loanRateForAmount(amount);
  hint.textContent = `Taux mensuel : ${rate.toLocaleString("fr-FR")} % (${money(amount * rate / 100)} / mois)`;
}
function memberDue(memberId) {
  if (!isActive(state.members.find(member => member.id === memberId))) return 0;
  return state.loans
    .filter(loan => !loan.repaid && loan.borrowerId === memberId)
    .reduce((sum, loan) => sum + loanDue(loan), 0);
}
function memberOwned(member) {
  if (!isActive(member)) return 0;
  const outstandingValue = state.loans
    .filter(loan => !loan.repaid)
    .reduce((sum, loan) => sum + loanDue(loan) * (loan.shares?.[member.id] || 0), 0);
  return member.available + outstandingValue;
}
function recordSnapshot() {
  const members = Object.fromEntries(activeMembers().map(member => [member.id, {
    available: member.available,
    owned: memberOwned(member),
    due: memberDue(member.id),
    contributed: member.total_contributed
  }]));
  state.history.push({
    timestamp: new Date().toISOString(),
    members,
    meeting: { available: availableTotal(), outstanding: outstanding(), profits: profits(), memberCount: activeMembers().length }
  });
}

function render() {
  $("totalCapital").textContent = money(totalCapital());
  $("availableCapital").textContent = money(availableTotal());
  $("outstandingLoans").textContent = money(outstanding());
  $("profits").textContent = money(profits());
  $("memberCount").textContent = activeMembers().length;
  $("roundTitle").textContent = `Tour ${state.round}`;

  const container = $("members");
  container.innerHTML = "";
  state.members.forEach((m, index) => {
    const node = $("memberTemplate").content.cloneNode(true);
    node.querySelector(".avatar").textContent = m.name.replace("Membre ","").slice(0,2);
    node.querySelector(".member-name").textContent = m.name;
    node.querySelector(".member-sub").textContent = `Capital total : ${money(m.total_contributed)}`;
    node.querySelector(".member-profession").textContent = m.profession;
    node.querySelector(".member-status").textContent = m.status;
    node.querySelector(".member-status").classList.add(`status-${m.status.toLowerCase().replaceAll(" ", "-")}`);
    node.querySelector(".member-available").textContent = money(m.available);
    node.querySelector(".member-contributed").textContent = money(m.total_contributed);
    node.querySelector(".member-due").textContent = money(memberDue(m.id));
    node.querySelector(".member-owned").textContent = money(memberOwned(m));
    node.querySelector(".member-edit").onclick = () => openMemberModal(m);
    container.appendChild(node);
  });

  const select = $("contributionMember");
  const activeMemberOptions = activeMembers().map(m => `<option value="${m.id}">${m.name}</option>`).join("");
  select.innerHTML = activeMemberOptions || `<option value="">Aucun membre actif</option>`;

  const loanSelect = $("repayLoan");
  const active = state.loans.filter(l => !l.repaid && isActive(state.members.find(m => m.id === l.borrowerId)));
  loanSelect.innerHTML = active.length
    ? active.map(l => `<option value="${l.id}">Prêt #${l.id} — ${money(l.amount)} à ${l.rate}%</option>`).join("")
    : `<option value="">Aucun prêt en cours</option>`;

  const borrowerSelect = $("loanBorrower");
  borrowerSelect.innerHTML = `<option value="">Sélectionner l'emprunteur</option>` + activeMemberOptions;

  const loans = $("loans");
  if (!state.loans.length) loans.innerHTML = `<div class="empty">Aucun prêt enregistré.</div>`;
  else loans.innerHTML = [...state.loans].reverse().map(l => `
    <div class="loan">
      <div>
        <div class="loan-title">Prêt #${l.id} — ${money(l.amount)}</div>
        <div class="loan-sub">Emprunteur : ${l.borrowerName || "Non renseigné"} · Intérêt mensuel : ${l.rate}% (${money(l.amount * l.rate / 100)}) · ${l.repaid ? "Remboursé" : `Intérêts cumulés : ${money(loanInterest(l))}`}</div>
        <time class="time-marker" datetime="${l.createdAt}">Créé le ${l.createdLabel}</time>
      </div>
      <strong>${l.repaid ? money(l.repaidAmount) : `Dû : ${money(loanDue(l))}`}</strong>
    </div>`).join("");

  const log = $("log");
  log.innerHTML = state.logs.length
    ? state.logs.map(x => `<div class="log-item"><span class="log-title">${x.text}</span><time class="time-marker" datetime="${x.timestamp}">${x.time}</time></div>`).join("")
    : `<div class="empty">Aucune opération.</div>`;

  if (stateReady && currentUser?.role === "ADMIN") saveState();
}

function loanMarkup(loan) {
  return `<div class="loan"><div><div class="loan-title">Prêt #${loan.id} — ${money(loan.amount)}</div><div class="loan-sub">Emprunteur : ${loan.borrowerName || "Non renseigné"} · Intérêt mensuel : ${loan.rate}% · ${loan.repaid ? "Remboursé" : `Intérêts cumulés : ${money(loanInterest(loan))}`}</div><time class="time-marker" datetime="${loan.createdAt}">Créé le ${loan.createdLabel}</time></div><strong>${loan.repaid ? money(loan.repaidAmount) : `Dû : ${money(loanDue(loan))}`}</strong></div>`;
}
function renderMemberDashboard() {
  const member = state.members.find(item => item.id === currentUser?.memberId);
  if (!member) return;
  $("memberGreeting").textContent = `Bonjour ${member.name}`;
  $("memberOwnedTotal").textContent = money(memberOwned(member));
  const metrics = [
    ["available", "Disponible", member.available],
    ["owned", "Total possédé", memberOwned(member)],
    ["due", "Total dû", memberDue(member.id)],
    ["contributed", "Total contribué", member.total_contributed]
  ];
  $("memberMetrics").innerHTML = metrics.map(([key, label, value]) => `<article class="member-metric metric-${key}"><span>${label}</span><strong>${money(value)}</strong></article>`).join("");
  $("meetingMetrics").innerHTML = [
    ["Capital disponible", availableTotal(), true], ["Prêts en cours", outstanding(), true], ["Bénéfices réalisés", profits(), true], ["Membres actifs", activeMembers().length, false]
  ].map(([label, value, isMoney]) => `<article><span>${label}</span><strong>${isMoney ? money(value) : value}</strong></article>`).join("");
  $("memberLoans").innerHTML = state.loans.length ? [...state.loans].reverse().map(loanMarkup).join("") : `<div class="empty">Aucun prêt enregistré.</div>`;
  $("memberLog").innerHTML = state.logs.length ? state.logs.map(log => `<div class="log-item"><span class="log-title">${log.text}</span><time class="time-marker" datetime="${log.timestamp}">${log.time}</time></div>`).join("") : `<div class="empty">Aucune opération.</div>`;
  renderChart(member.id, metrics);
}
function renderChart(memberId, metrics) {
  const controls = $("chartControls");
  controls.innerHTML = metrics.map(([key, label]) => `<label class="chart-toggle metric-${key}"><input type="checkbox" value="${key}" ${selectedChartMetrics.has(key) ? "checked" : ""}> ${label}</label>`).join("");
  controls.querySelectorAll("input").forEach(input => input.onchange = () => {
    input.checked ? selectedChartMetrics.add(input.value) : selectedChartMetrics.delete(input.value);
    renderMemberDashboard();
  });
  const points = state.history.filter(item => item.members?.[memberId]).map(item => item.members[memberId]);
  points.push(Object.fromEntries(metrics.map(([key, , value]) => [key, value])));
  const visible = metrics.filter(([key]) => selectedChartMetrics.has(key));
  const chart = $("memberChart");
  if (!visible.length || !points.length) return chart.innerHTML = `<text x="360" y="132" text-anchor="middle" class="chart-empty">Sélectionnez au moins un indicateur.</text>`;
  const values = points.flatMap(point => visible.map(([key]) => point[key] || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const colors = { available: "#315efb", owned: "#16835b", due: "#c33d4f", contributed: "#805ad5" };
  const x = index => 34 + index * (652 / Math.max(points.length - 1, 1));
  const y = value => 228 - ((value - min) / (max - min || 1)) * 184;
  const gridColor = document.documentElement.getAttribute("data-theme") === "dark" ? "#334155" : "#e8ecf4";
  const grid = [0, 1, 2, 3].map(index => `<line x1="34" y1="${44 + index * 61}" x2="686" y2="${44 + index * 61}" stroke="${gridColor}" stroke-width="1"/>`).join("");
  chart.innerHTML = grid + visible.map(([key]) => `<polyline points="${points.map((point, index) => `${x(index)},${y(point[key] || 0)}`).join(" ")}" fill="none" stroke="${colors[key]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
}
function showAuthenticatedView() {
  $("loginScreen").hidden = true;
  const isAdmin = currentUser.role === "ADMIN";
  $("adminView").hidden = !isAdmin;
  $("memberView").hidden = isAdmin;
  if (isAdmin) render();
  else renderMemberDashboard();
}
async function authenticate(event) {
  event.preventDefault();
  $("loginError").textContent = "";
  try {
    const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("loginUsername").value.trim(), password: $("loginPassword").value }) });
    if (!response.ok) return $("loginError").textContent = (await response.json()).error;
    const login = await response.json();
    const { state: savedState, ...session } = login;
    currentUser = session;
    hydrateState(savedState);
    stateReady = true;
    showAuthenticatedView();
  } catch (error) {
    console.error("Erreur de connexion :", error);
    $("loginError").textContent = "Connexion impossible. Vérifiez que le serveur est lancé puis réessayez.";
  }
}
async function bootstrap() {
  const response = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (!response.ok) return;
  const session = await response.json();
  const { state: savedState, ...user } = session;
  currentUser = user;
  hydrateState(savedState);
  stateReady = true;
  showAuthenticatedView();
}

function openMemberModal(member = null) {
  editingMemberId = member?.id ?? null;
  $("memberModalTitle").textContent = member ? "Modifier le membre" : "Ajouter un membre";
  $("memberSubmitBtn").textContent = member ? "Enregistrer" : "Ajouter le membre";
  $("memberName").value = member?.name ?? "";
  $("memberProfession").value = member?.profession ?? "ÉTUDIANT";
  $("memberStatus").value = member?.status ?? "ACTIF";
  $("memberModal").classList.add("is-open");
  $("memberModal").setAttribute("aria-hidden", "false");
  $("memberName").focus();
}
function closeMemberModal() {
  $("memberModal").classList.remove("is-open");
  $("memberModal").setAttribute("aria-hidden", "true");
  $("memberForm").reset();
  editingMemberId = null;
}

$("addMemberBtn").onclick = openMemberModal;
document.querySelectorAll("[data-close-member-modal]").forEach(button => {
  button.onclick = closeMemberModal;
});
$("memberForm").onsubmit = event => {
  event.preventDefault();
  const name = $("memberName").value.trim();
  const profession = $("memberProfession").value;
  const status = $("memberStatus").value;
  if (!name) return;
  const member = state.members.find(m => m.id === editingMemberId);
  if (member) {
    member.name = name;
    member.profession = profession;
    member.status = status;
    addLog(`Modification de ${name} (${profession}, ${status}).`);
  } else {
    const id = Math.max(...state.members.map(m => m.id), 0) + 1;
    state.members.push({id, name, profession, status, available:0, total_contributed:0});
    addLog(`Ajout de ${name} (${profession}, ${status}).`);
  }
  closeMemberModal();
  render();
};

$("loginForm").onsubmit = authenticate;
async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  currentUser = null;
  stateReady = false;
  $("loginForm").reset();
  $("loginScreen").hidden = false;
  $("memberView").hidden = true;
  $("adminView").hidden = true;
}
$("logoutBtn").onclick = logout;
$("adminLogoutBtn").onclick = logout;
$("passwordBtn").onclick = () => {
  $("passwordError").textContent = "";
  $("passwordModal").classList.add("is-open");
  $("passwordModal").setAttribute("aria-hidden", "false");
  $("newPassword").focus();
};
function closePasswordModal() {
  $("passwordModal").classList.remove("is-open");
  $("passwordModal").setAttribute("aria-hidden", "true");
  $("passwordForm").reset();
}
document.querySelectorAll("[data-close-password-modal]").forEach(button => button.onclick = closePasswordModal);
$("passwordForm").onsubmit = async event => {
  event.preventDefault();
  const response = await fetch("/api/auth/password", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("newPassword").value }) });
  if (!response.ok) return $("passwordError").textContent = (await response.json()).error;
  closePasswordModal();
  alert("Votre mot de passe a été mis à jour.");
};

$("contributeBtn").onclick = () => {
  const member = state.members.find(m => m.id == $("contributionMember").value);
  const amount = Number($("contributionAmount").value);
  if (!member || !isActive(member)) return alert("Sélectionnez un membre actif.");
  if (amount <= 0) return alert("Entrez un montant valide.");
  member.available += amount;
  member.total_contributed += amount;
  addLog(`${member.name} ajoute ${money(amount)} au capital.`);
  $("contributionAmount").value = "";
  render();
};

$("repayBtn").onclick = () => {
  const loan = state.loans.find(l => l.id == $("repayLoan").value);
  if (!loan || loan.repaid) return;
  const borrower = state.members.find(m => m.id === loan.borrowerId);
  if (!borrower || !isActive(borrower)) return alert("Seuls les prêts de membres actifs peuvent être remboursés.");
  const returned = loanDue(loan);

  // Le principal revient aux mêmes propriétaires.
  // Le bénéfice est distribué selon la propriété du capital qui a financé le prêt.
  // Pour reconstruire les propriétaires du prêt, on conserve la proportion
  // au moment où le prêt a été accordé.
  // Cette proportion est ajoutée ci-dessous lors de la création du prêt.
  // Fallback : pour les anciens prêts sans proportions, on répartit le bénéfice
  // selon le capital total actuel.
  if (!loan.shares) {
    const total = totalCapital();
    loan.shares = Object.fromEntries(activeMembers().map(m => [m.id, m.total_contributed / total]));
  }

  activeMembers().forEach(m => {
    const share = loan.shares[m.id] || 0;
    m.available += returned * share;
  });
  loan.repaid = true;
  loan.repaidAmount = returned;
  addLog(`Prêt #${loan.id} remboursé par ${loan.borrowerName || "le membre"} : ${money(returned)} récupérés.`);
  render();
};

$("loanAmount").oninput = updateLoanRatePreview;
$("loanBtn").onclick = () => {
  const amount = Number($("loanAmount").value);
  const rate = loanRateForAmount(amount);
  const borrower = state.members.find(m => m.id == $("loanBorrower").value);
  const available = availableTotal();
  if (!borrower || !isActive(borrower)) return alert("Sélectionnez un membre actif qui demande le prêt.");
  if (amount <= 0) return alert("Montants invalides.");
  if (amount > available) return alert(`Capital disponible insuffisant : ${money(available)}.`);
  if (available <= 0) return alert("Aucun capital disponible.");

  const shares = Object.fromEntries(activeMembers().map(m => [m.id, m.available / available]));
  activeMembers().forEach(m => m.available -= m.available * amount / available);

  const id = state.loans.length + 1;
  const profit = amount * rate / 100;
  const createdAt = new Date();
  state.loans.push({id, amount, rate, profit, repaid:false, borrowerId: borrower.id, borrowerName: borrower.name, shares, createdAt: createdAt.toISOString(), createdLabel: createdAt.toLocaleString("fr-FR", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"})});
  addLog(`Prêt #${id} de ${money(amount)} accordé à ${borrower.name} à ${rate.toLocaleString("fr-FR")} % — ${money(profit)} d'intérêt ajouté chaque mois.`);
  $("loanAmount").value = "";
  updateLoanRatePreview();
  render();
};
updateLoanRatePreview();

$("resetBtn").onclick = () => {
  if (!confirm("Réinitialiser complètement le tour ?")) return;
  state.round++;
  state.members.forEach(m => { m.available = 0; m.total_contributed = 0; });
  state.loans = [];
  state.logs = [];
  addLog(`Nouveau tour ${state.round}.`);
  render();
};

initCharterUi();
initThemeToggle();
window.addEventListener("themechange", () => {
  if (!currentUser) return;
  if (currentUser.role === "ADMIN") render();
  else renderMemberDashboard();
});
bootstrap();
