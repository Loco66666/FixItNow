import http from "node:http";

function req(method, url, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { "content-type": "application/json", ...headers } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const BASE = "http://localhost:4000";
let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}

console.log("\n=== SMOKE TEST FixItNow ===\n");

// 1. Health
const h = await req("GET", `${BASE}/healthz`);
check("GET /healthz -> 200", h.status === 200, JSON.stringify(h.data).slice(0, 80));

// 2. Auth demo accounts — try README passwords, debug response
const tryLogin = async (email, password) => {
  const r = await req("POST", `${BASE}/auth/login`, { body: { email, password } });
  const j = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
  console.log(`    [login ${email}] status=${r.status} body=${JSON.stringify(j).slice(0, 110)}`);
  return { token: j.accessToken, status: r.status, raw: j };
};
const a1 = await tryLogin("demo@fixitnow.dev", "Demo#12345");
const a2 = await tryLogin("pro@fixitnow.dev", "Pro#12345");
const a3 = await tryLogin("admin@fixitnow.dev", "Admin#12345");
const customerToken = a1.token;
const ownerToken = a2.token;
check("Customer login works (demo@fixitnow.dev)", !!customerToken, "(demo@fixitnow.dev)");
check("Pro (owner) login works (owner@fixitnow.dev)", !!ownerToken, "(owner@fixitnow.dev)");

// 3. Automotive surface via REST (Swagger-equivalent calls)
// 3a. Reuse the intervention already seeded for demo@fixitnow.dev (Clio, REQUESTED).
const mine = await req("GET", `${BASE}/interventions/mine?limit=5`, { headers: { authorization: `Bearer ${customerToken}` } });
check("GET /interventions/mine -> 200", mine.status === 200, JSON.stringify(mine.data).slice(0, 90));
const interventionId = mine.data?.data?.[0]?.id;
check("Seeded intervention available for customer", !!interventionId, JSON.stringify(interventionId));

// 3b. Run matching
const match = await req("POST", `${BASE}/interventions/${interventionId}/match`, { headers: { authorization: `Bearer ${customerToken}` } });
check(`POST /interventions/${interventionId}/match -> 200`, match.status === 200, JSON.stringify(match.data).slice(0, 90));

// 3c. List candidates
const candidates = await req("GET", `${BASE}/interventions/${interventionId}/match`, { headers: { authorization: `Bearer ${customerToken}` } });
check("GET candidates -> 200", candidates.status === 200);
const firstCandidate = candidates.data?.data?.[0];
check("At least one scored candidate", !!firstCandidate && firstCandidate.score >= 0, JSON.stringify(firstCandidate && { score: firstCandidate.score, status: firstCandidate.status }).slice(0, 70));

// 3d. Accept candidate (PRO = ownerToken)
if (firstCandidate) {
  const candId = firstCandidate.id || firstCandidate._id;
  const accept = await req("POST", `${BASE}/interventions/${interventionId}/match/${candId}/accept`, { headers: { authorization: `Bearer ${ownerToken}` } });
  check(`POST accept -> 200`, accept.status === 200, JSON.stringify(accept.data).slice(0, 110));
  const accepted = accept.data?.data;
  check("Accept returns status ACCEPTED", accepted?.status === "ACCEPTED", String(JSON.stringify(accepted)).slice(0, 90));
  check("Accept assigns professionalId", !!accepted?.professionalId, String(accepted?.professionalId));
}

// 4. SSE live proof
console.log("\n=== SSE LIVE (3s window) ===");
await new Promise((resolve) => {
  const u = new URL(`${BASE}/events/intervention/${interventionId}`);
  const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { authorization: `Bearer ${customerToken}` } }, (res) => {
    check("SSE endpoint -> 200 text/event-stream", res.statusCode === 200 && (res.headers["content-type"] || "").includes("text/event-stream"), res.headers["content-type"] || "");
    let buf = "";
    res.on("data", (c) => {
      buf += c.toString();
      const line = c.toString().trim().split("\n")[0];
      if (line) process.stdout.write("    [SSE] " + line + "\n");
    });
    setTimeout(() => { r.destroy(); check("SSE stream kept open >= 3s", buf.includes(": connected") || buf.includes("event:"), ""); resolve(); }, 3000);
  });
  r.on("error", (e) => { check("SSE connect", false, e.message); resolve(); });
  r.end();
});

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
