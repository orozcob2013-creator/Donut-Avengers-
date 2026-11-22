const $ = id => document.getElementById(id);
let currentUser = null;

async function api(url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? {"Content-Type":"application/json"} : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function showUser(user) {
  currentUser = user;
  $("auth").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("balance").textContent = Number(user.balance).toLocaleString();
  loadTransactions();
}
function showAuth() {
  currentUser = null;
  $("dashboard").classList.add("hidden");
  $("auth").classList.remove("hidden");
}
async function loadTransactions() {
  try {
    const {transactions} = await api("/api/transactions");
    $("transactions").innerHTML = transactions.length
      ? transactions.map(t => `<div>${escapeHtml(t.note)} — ${Number(t.amount).toLocaleString()} coins</div>`).join("")
      : "No activity yet.";
  } catch {}
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const data = await api("/api/login", {username:$("username").value,password:$("password").value});
    showUser(data.user);
  } catch(err) {$("authMessage").textContent = err.message;}
});
$("signup").addEventListener("click", async () => {
  try {
    const data = await api("/api/signup", {username:$("username").value,password:$("password").value});
    showUser(data.user);
  } catch(err) {$("authMessage").textContent = err.message;}
});
$("logout").addEventListener("click", async () => {await api("/api/logout",{});showAuth();});
$("flip").addEventListener("click", async () => {
  try {
    const data = await api("/api/coinflip", {amount:Number($("bet").value)});
    showUser(data.user);
    $("gameMessage").textContent = data.won
      ? `You won ${data.delta.toLocaleString()} virtual coins!`
      : `You lost ${Math.abs(data.delta).toLocaleString()} virtual coins.`;
  } catch(err) {$("gameMessage").textContent = err.message;}
});
async function request(kind) {
  try {
    const data = await api("/api/request", {
      kind,
      amount:Number($(kind+"Amount").value),
      minecraftName:$(kind+"Name").value
    });
    showUser(data.user);
    $("requestMessage").textContent = data.message;
  } catch(err) {$("requestMessage").textContent = err.message;}
}
$("deposit").addEventListener("click", () => request("deposit"));
$("withdraw").addEventListener("click", () => request("withdraw"));
(async()=>{try{const data=await api("/api/me");showUser(data.user);}catch{showAuth();}})();
