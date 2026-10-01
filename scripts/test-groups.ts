import assert from "node:assert/strict";
import { buildGroups, placeLate, planSizes, totalCost, type Person } from "../lib/groups";
import { parseTable, toImportRows } from "../lib/csv";

const UNIS = ["SKEMA", "UFMG", "PUC Minas", "UNA", "FUMEC"];
const COURSES = ["Administração", "Ciência da Computação", "Direito", "Engenharia", "Design", "Marketing", "Psicologia", "Economia"];

function fakePeople(n: number, seed = 1): Person[] {
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    // maioria da SKEMA, como num evento da própria faculdade
    university: r() < 0.6 ? "SKEMA" : UNIS[Math.floor(r() * UNIS.length)],
    course: COURSES[Math.floor(r() * COURSES.length)],
  }));
}

// 1) Tamanhos: sempre dentro de 5–6 quando possível
const impossible = new Set<number>();
for (let n = 1; n <= 200; n++) {
  const sizes = planSizes(n, 5, 6);
  assert.equal(sizes.reduce((a, b) => a + b, 0), n);
  if (!sizes.every((s) => s >= 5 && s <= 6)) impossible.add(n);
}
// Com 5–6, só estes totais não têm solução exata (>= 5): 7, 8, 9, 13, 14, 19
assert.deepEqual([...impossible].filter((n) => n >= 5), [7, 8, 9, 13, 14, 19]);
assert.deepEqual(planSizes(30, 5, 6), [6, 6, 6, 6, 6]);
assert.deepEqual(planSizes(11, 5, 6), [6, 5]);
assert.deepEqual(planSizes(7, 5, 6), [7]);
console.log("ok tamanhos (5–6)");

// 2) Todos entram exatamente uma vez, tamanhos corretos, e diversidade melhor que aleatório
for (const n of [5, 6, 11, 12, 23, 47, 80, 150, 300]) {
  const people = fakePeople(n, n);
  const t0 = Date.now();
  const { groups, warnings } = buildGroups(people, { min: 5, max: 6, seed: 42 });
  const ms = Date.now() - t0;
  const ids = groups.flat();
  assert.equal(ids.length, n);
  assert.equal(new Set(ids).size, n);
  if (warnings.length === 0) for (const g of groups) assert.ok(g.length >= 5 && g.length <= 6, `n=${n} tamanho ${g.length}`);

  const byId = new Map(people.map((p) => [p.id, p]));
  const optimized = totalCost(groups.map((g) => g.map((id) => byId.get(id)!)));
  // baseline: mesma divisão de tamanhos, sem otimizar (ordem original)
  const sizes = planSizes(n, 5, 6);
  let k = 0;
  const naive = sizes.map((s) => people.slice(k, (k += s)));
  const naiveCost = totalCost(naive);
  assert.ok(optimized <= naiveCost, `otimizado (${optimized}) deveria ser <= ingênuo (${naiveCost})`);
  console.log(`ok n=${String(n).padStart(3)} grupos=${groups.length} custo=${optimized} (ingênuo ${naiveCost}) ${ms}ms`);
}

// 3) Caso ideal: dá para ter diversidade total
{
  const people: Person[] = [];
  const u = ["A", "B", "C", "D", "E", "F"];
  const c = ["c1", "c2", "c3", "c4", "c5", "c6"];
  for (let i = 0; i < 18; i++) people.push({ id: `x${i}`, university: u[i % 6], course: c[Math.floor(i / 3) % 6] });
  const { groups } = buildGroups(people, { min: 5, max: 6, seed: 7 });
  const byId = new Map(people.map((p) => [p.id, p]));
  console.log("custo caso ideal:", totalCost(groups.map((g) => g.map((id) => byId.get(id)!))));
}

// 4) Retardatários
{
  const people = fakePeople(30, 3);
  const { groups } = buildGroups(people, { min: 5, max: 6, seed: 1 });
  const byId = new Map(people.map((p) => [p.id, p]));
  const existing = groups.map((g) => g.map((id) => byId.get(id)!));

  // 2 retardatários: entram em grupos existentes (que estão cheios -> aviso)
  const late2 = fakePeople(2, 99).map((p) => ({ ...p, id: `late${p.id}` }));
  const r2 = placeLate(existing, late2, { min: 5, max: 6, seed: 1 });
  assert.equal(r2.newGroups.length, 0);
  assert.equal(r2.additions.flat().length, 2);
  assert.equal(r2.warnings.length, 1);

  // 5 retardatários: formam grupo novo
  const late5 = fakePeople(5, 98).map((p) => ({ ...p, id: `late${p.id}` }));
  const r5 = placeLate(existing, late5, { min: 5, max: 6, seed: 1 });
  assert.equal(r5.newGroups.length, 1);
  assert.equal(r5.newGroups[0].length, 5);
  assert.equal(r5.additions.flat().length, 0);

  // 2 retardatários e dois grupos de 5 (há vaga): entram sem estourar o máximo, sem aviso
  const fiveGroups = buildGroups(fakePeople(10, 5), { min: 5, max: 6, seed: 1 }).groups;
  const pp = fakePeople(10, 5);
  const ex = fiveGroups.map((g) => g.map((id) => pp.find((p) => p.id === id)!));
  const lateTwo = fakePeople(2, 97).map((p) => ({ ...p, id: `late${p.id}` }));
  const r2b = placeLate(ex, lateTwo, { min: 5, max: 6, seed: 1 });
  assert.equal(r2b.additions.flat().length, 2);
  assert.ok(r2b.additions.every((a, i) => ex[i].length + a.length <= 6));
  assert.equal(r2b.warnings.length, 0);

  // 3 retardatários, mas só 2 vagas: o terceiro estoura o máximo e vem um aviso
  const lateThree = fakePeople(3, 96).map((p) => ({ ...p, id: `late${p.id}` }));
  const r3 = placeLate(ex, lateThree, { min: 5, max: 6, seed: 1 });
  assert.equal(r3.additions.flat().length, 3);
  assert.equal(r3.warnings.length, 1);
}
console.log("ok retardatários");

// 5) CSV
{
  const csv = 'Nome;Faculdade;Curso\n"Silva, Ana";SKEMA;Direito\nJoão Souza;UFMG;Design\n;X;Y\n';
  const { rows, ignored } = toImportRows(parseTable(csv));
  assert.equal(rows.length, 2);
  assert.equal(ignored, 1);
  assert.deepEqual(rows[0], { name: "Silva, Ana", university: "SKEMA", course: "Direito" });

  const tsv = "Maria\tPUC\tEngenharia\nPedro\tUNA\tMarketing";
  const t = toImportRows(parseTable(tsv));
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[1].course, "Marketing");

  const cols = toImportRows(parseTable("curso,email,nome,universidade\nDireito,a@a.com,Zé,UFMG"));
  assert.deepEqual(cols.rows[0], { name: "Zé", university: "UFMG", course: "Direito" });
}
console.log("ok csv");
console.log("\nTodos os testes passaram.");
