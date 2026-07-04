let DATA = window.ALL_INDUSTRY_DATA;

const GITHUB_CONFIG = {
  owner: "Thomasyue44",
  repo: "industry-browser",
  branch: "main",
  filePath: "all-industries-data.js",
};

const INDUSTRY_THEMES = [
  { hue: 172, saturation: 58, lightness: 31 },
  { hue: 212, saturation: 62, lightness: 43 },
  { hue: 252, saturation: 47, lightness: 45 },
  { hue: 194, saturation: 66, lightness: 37 },
  { hue: 286, saturation: 43, lightness: 45 },
  { hue: 18, saturation: 66, lightness: 44 },
  { hue: 154, saturation: 55, lightness: 35 },
  { hue: 354, saturation: 56, lightness: 48 },
  { hue: 226, saturation: 59, lightness: 44 },
  { hue: 142, saturation: 42, lightness: 34 },
  { hue: 48, saturation: 67, lightness: 35 },
  { hue: 185, saturation: 57, lightness: 37 },
  { hue: 32, saturation: 67, lightness: 39 },
  { hue: 326, saturation: 48, lightness: 45 },
  { hue: 176, saturation: 46, lightness: 35 },
  { hue: 266, saturation: 46, lightness: 48 },
  { hue: 199, saturation: 61, lightness: 42 },
  { hue: 296, saturation: 39, lightness: 44 },
  { hue: 82, saturation: 47, lightness: 35 },
  { hue: 340, saturation: 54, lightness: 47 },
];

const ORIGINAL_DATA_TEXT = serializeData(DATA);
let lastSyncedDataText = ORIGINAL_DATA_TEXT;

const state = {
  query: "",
  selectedCompanyId: "",
  selectedNodeId: "",
  expandedIndustryIds: new Set(),
  expandedNodeIds: new Set(),
  maintainMode: false,
  dirty: false,
  saving: false,
  changes: [],
  editingRelationId: "",
  editSelectedCompanyId: "",
};

let companiesById = new Map();
let industriesById = new Map();
let nodesById = new Map();
let nodeByPath = new Map();
let treeNodesById = new Map();
let treeNodeByPath = new Map();
let relationsByCompany = new Map();
let relationsByNode = new Map();
let relationsByIndustry = new Map();

function indexTreeNode(node) {
  treeNodesById.set(node.id, node);
  treeNodeByPath.set(`${node.industryId}::${node.pathLabel}`, node);
  for (const child of node.children || []) {
    indexTreeNode(child);
  }
}

function rebuildIndexes() {
  companiesById = new Map(DATA.companies.map((company) => [company.id, company]));
  industriesById = new Map(DATA.industries.map((industry) => [industry.id, industry]));
  nodesById = new Map(DATA.nodes.map((node) => [node.id, node]));
  nodeByPath = new Map(DATA.nodes.map((node) => [`${node.industryId}::${node.pathLabel}`, node]));
  treeNodesById = new Map();
  treeNodeByPath = new Map();
  relationsByCompany = new Map();
  relationsByNode = new Map();
  relationsByIndustry = new Map();

  for (const industry of DATA.industries) {
    indexTreeNode(industry.tree);
  }

  for (const relation of DATA.relations) {
    if (!relationsByCompany.has(relation.companyId)) {
      relationsByCompany.set(relation.companyId, []);
    }
    if (!relationsByNode.has(relation.nodeId)) {
      relationsByNode.set(relation.nodeId, []);
    }
    if (!relationsByIndustry.has(relation.industryId)) {
      relationsByIndustry.set(relation.industryId, []);
    }
    relationsByCompany.get(relation.companyId).push(relation);
    relationsByNode.get(relation.nodeId).push(relation);
    relationsByIndustry.get(relation.industryId).push(relation);
  }
}

const els = {
  sourceLine: document.querySelector("#sourceLine"),
  stats: document.querySelector("#stats"),
  searchInput: document.querySelector("#searchInput"),
  resetBtn: document.querySelector("#resetBtn"),
  maintainToggleBtn: document.querySelector("#maintainToggleBtn"),
  saveOnlineBtn: document.querySelector("#saveOnlineBtn"),
  companyList: document.querySelector("#companyList"),
  treeView: document.querySelector("#treeView"),
  treeHint: document.querySelector("#treeHint"),
  detailPanel: document.querySelector("#detailPanel"),
  relationModal: document.querySelector("#relationModal"),
  relationModalTitle: document.querySelector("#relationModalTitle"),
  relationModalHint: document.querySelector("#relationModalHint"),
  closeRelationModalBtn: document.querySelector("#closeRelationModalBtn"),
  cancelRelationBtn: document.querySelector("#cancelRelationBtn"),
  saveRelationBtn: document.querySelector("#saveRelationBtn"),
  editCompanyInput: document.querySelector("#editCompanyInput"),
  editCompanySuggestions: document.querySelector("#editCompanySuggestions"),
  editCodeInput: document.querySelector("#editCodeInput"),
  editFullNameInput: document.querySelector("#editFullNameInput"),
  editIndustrySelect: document.querySelector("#editIndustrySelect"),
  existingBranchField: document.querySelector("#existingBranchField"),
  editBranchSelect: document.querySelector("#editBranchSelect"),
  newBranchFields: document.querySelector("#newBranchFields"),
  editParentSelect: document.querySelector("#editParentSelect"),
  editNewBranchInput: document.querySelector("#editNewBranchInput"),
  editReasonInput: document.querySelector("#editReasonInput"),
  editSourceInput: document.querySelector("#editSourceInput"),
  editDateInput: document.querySelector("#editDateInput"),
  tokenModal: document.querySelector("#tokenModal"),
  closeTokenModalBtn: document.querySelector("#closeTokenModalBtn"),
  cancelTokenBtn: document.querySelector("#cancelTokenBtn"),
  confirmTokenBtn: document.querySelector("#confirmTokenBtn"),
  githubTokenInput: document.querySelector("#githubTokenInput"),
  rememberTokenInput: document.querySelector("#rememberTokenInput"),
};

function compact(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function themeForIndustry(value) {
  const industry =
    typeof value === "object"
      ? value
      : DATA.industries.find((item) => item.id === value || item.name === value);
  const index = industry ? DATA.industries.findIndex((item) => item.id === industry.id) : 0;
  return INDUSTRY_THEMES[(index >= 0 ? index : 0) % INDUSTRY_THEMES.length];
}

function themeVars(value, depth = 0) {
  const theme = themeForIndustry(value);
  const level = Math.max(0, Number(depth) || 0);
  const nodeLight = Math.max(88, 98 - level * 2.3);
  const nodeLineLight = Math.max(64, nodeLight - 16);
  return [
    `--theme: hsl(${theme.hue} ${theme.saturation}% ${theme.lightness}%)`,
    `--theme-strong: hsl(${theme.hue} ${Math.min(theme.saturation + 10, 78)}% ${Math.max(theme.lightness - 10, 24)}%)`,
    `--theme-soft: hsl(${theme.hue} ${Math.max(theme.saturation - 2, 30)}% 94%)`,
    `--theme-softer: hsl(${theme.hue} ${Math.max(theme.saturation - 8, 28)}% 97%)`,
    `--theme-line: hsl(${theme.hue} ${Math.min(theme.saturation + 4, 74)}% 76%)`,
    `--node-bg: hsl(${theme.hue} ${Math.max(theme.saturation - 8, 28)}% ${nodeLight}%)`,
    `--node-line: hsl(${theme.hue} ${Math.min(theme.saturation + 8, 78)}% ${nodeLineLight}%)`,
  ].join("; ");
}

function themeStyle(value, depth = 0) {
  return `style="${themeVars(value, depth)}"`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function serializeData(data) {
  return `window.ALL_INDUSTRY_DATA = ${JSON.stringify(data)};\n`;
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function uniquePush(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function removeChildren(node) {
  const copy = { ...node };
  delete copy.children;
  return copy;
}

function walkTree(node, callback) {
  callback(node);
  for (const child of node.children || []) {
    walkTree(child, callback);
  }
}

function sortZh(values) {
  return values.sort((a, b) => String(a).localeCompare(String(b), "zh"));
}

function relationNumber(relation) {
  const match = String(relation.id || "").match(/^r_(\d+)$/);
  return match ? Number(match[1]) : -1;
}

function nextRelationId() {
  const max = DATA.relations.reduce((result, relation) => Math.max(result, relationNumber(relation)), -1);
  return `r_${max + 1}`;
}

function makeNodeId(industryId, pathLabel) {
  const base = `id_manual_${hashText(`${industryId}::${pathLabel}`)}`;
  if (!treeNodesById.has(base) && !nodesById.has(base)) return base;
  let suffix = 2;
  while (treeNodesById.has(`${base}_${suffix}`) || nodesById.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

function makeCompanyId(name) {
  const cleanName = name.trim();
  if (!companiesById.has(cleanName)) return cleanName;
  const base = `${cleanName}_${hashText(cleanName).slice(0, 6)}`;
  if (!companiesById.has(base)) return base;
  let suffix = 2;
  while (companiesById.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function findCompanyByInput(value) {
  const query = compact(value);
  if (!query) return undefined;
  return DATA.companies.find((company) => {
    const values = [
      company.name,
      ...(company.aliases || []),
      ...(company.codes || []),
      ...(company.fullNames || []),
    ];
    return values.some((item) => compact(item) === query);
  });
}

function companyText(company) {
  return [
    company.name,
    ...(company.aliases || []),
    ...(company.codes || []),
    ...(company.fullNames || []),
    ...(company.industries || []),
  ]
    .join(" ")
    .trim();
}

function companyMatches(value) {
  const query = compact(value);
  if (!query) return [];
  return DATA.companies
    .filter((company) => compact(companyText(company)).includes(query))
    .sort((a, b) => {
      const an = compact(a.name);
      const bn = compact(b.name);
      return (
        Number(bn === query) - Number(an === query) ||
        Number(bn.startsWith(query)) - Number(an.startsWith(query)) ||
        b.relationIds.length - a.relationIds.length ||
        a.name.localeCompare(b.name, "zh")
      );
    })
    .slice(0, 6);
}

function resetNodeCounters(node) {
  node.companyIds = [];
  node.companyCount = 0;
  node.directCompanyCount = 0;
  node.relationIds = [];
  for (const child of node.children || []) resetNodeCounters(child);
}

function rebuildSearchText(company) {
  const relationText = company.relationIds
    .map((relationIndex) => DATA.relations[relationIndex])
    .filter(Boolean)
    .map((relation) => `${relation.industry} ${relation.pathLabel} ${relation.value} ${relation.comment} ${relation.cell}`)
    .join(" ");
  company.searchText = compact(
    [
      company.name,
      ...(company.aliases || []),
      ...(company.codes || []),
      ...(company.fullNames || []),
      ...(company.regions || []),
      ...(company.websites || []),
      ...(company.notes || []),
      ...(company.industries || []),
      relationText,
    ].join(" "),
  );
}

function recalculateAll() {
  rebuildIndexes();

  for (const industry of DATA.industries) resetNodeCounters(industry.tree);
  for (const node of DATA.nodes) {
    node.companyIds = [];
    node.companyCount = 0;
    node.directCompanyCount = 0;
    node.relationIds = [];
  }
  for (const company of DATA.companies) {
    company.industryIds = [];
    company.industries = [];
    company.relationIds = [];
  }

  const treeDirectSets = new Map();
  const flatDirectSets = new Map();

  DATA.relations.forEach((relation, relationIndex) => {
    const industry = industriesById.get(relation.industryId);
    const company = companiesById.get(relation.companyId);
    const treeNode = treeNodesById.get(relation.nodeId);
    const flatNode = nodesById.get(relation.nodeId);
    if (!industry || !company || !treeNode || !flatNode) return;

    relation.companyName = company.name;
    relation.industry = industry.name;
    relation.path = [...treeNode.path];
    relation.pathLabel = treeNode.pathLabel;
    relation.leaf = treeNode.label;

    treeNode.relationIds.push(relationIndex);
    flatNode.relationIds.push(relationIndex);
    if (!treeDirectSets.has(treeNode.id)) treeDirectSets.set(treeNode.id, new Set());
    if (!flatDirectSets.has(flatNode.id)) flatDirectSets.set(flatNode.id, new Set());
    treeDirectSets.get(treeNode.id).add(company.id);
    flatDirectSets.get(flatNode.id).add(company.id);

    uniquePush(company.relationIds, relationIndex);
    uniquePush(company.industryIds, industry.id);
    uniquePush(company.industries, industry.name);

    uniquePush(industry.tree.companyIds, company.id);
    const path = [];
    for (const part of treeNode.path) {
      path.push(part);
      const pathLabel = path.join(" / ");
      const ancestor = treeNodeByPath.get(`${industry.id}::${pathLabel}`);
      if (ancestor) uniquePush(ancestor.companyIds, company.id);
      const flatAncestor = nodeByPath.get(`${industry.id}::${pathLabel}`);
      if (flatAncestor) uniquePush(flatAncestor.companyIds, company.id);
    }
  });

  for (const industry of DATA.industries) {
    walkTree(industry.tree, (node) => {
      sortZh(node.companyIds);
      node.companyCount = node.companyIds.length;
      node.directCompanyCount = treeDirectSets.get(node.id)?.size || 0;
    });
  }

  for (const node of DATA.nodes) {
    sortZh(node.companyIds);
    node.companyCount = node.companyIds.length;
    node.directCompanyCount = flatDirectSets.get(node.id)?.size || 0;
  }

  for (const company of DATA.companies) {
    company.industries = company.industryIds
      .map((industryId) => industriesById.get(industryId)?.name)
      .filter(Boolean);
    rebuildSearchText(company);
  }

  for (const industry of DATA.industries) {
    const industryRelations = DATA.relations.filter((relation) => relation.industryId === industry.id);
    industry.companyCount = industry.tree.companyCount;
    industry.relationCount = industryRelations.length;
    industry.nodeCount = DATA.nodes.filter((node) => node.industryId === industry.id).length;
    industry.commentCount = industryRelations.filter((relation) => relation.comment).length;
  }

  DATA.stats = {
    industryCount: DATA.industries.length,
    companyCount: DATA.companies.length,
    relationCount: DATA.relations.length,
    nodeCount: DATA.nodes.length,
    commentCount: DATA.relations.filter((relation) => relation.comment).length,
  };
  DATA.generatedAt = formatDateTime(new Date());
  rebuildIndexes();
}

function markDirty(change) {
  state.dirty = true;
  if (change) state.changes.unshift(change);
  updateSaveState();
}

function updateSaveState(message = "") {
  els.saveOnlineBtn.hidden = !state.maintainMode;
  els.saveOnlineBtn.disabled = !state.dirty || state.saving;
  els.saveOnlineBtn.textContent = state.saving
    ? "保存中..."
    : state.dirty
      ? `保存到线上${state.changes.length ? `（${state.changes.length}）` : ""}`
      : "已同步";
  els.maintainToggleBtn.textContent = state.maintainMode ? "退出维护" : "维护模式";
  document.body.classList.toggle("maintain-mode", state.maintainMode);
  if (message) {
    els.sourceLine.textContent = message;
  }
}

function companyRelations(companyId) {
  return relationsByCompany.get(companyId) || [];
}

function relationsForCompanyByIndustry(companyId) {
  const grouped = new Map();
  for (const relation of companyRelations(companyId)) {
    if (!grouped.has(relation.industryId)) grouped.set(relation.industryId, []);
    grouped.get(relation.industryId).push(relation);
  }
  return [...grouped.entries()].sort((a, b) => {
    const ai = industriesById.get(a[0])?.order ?? 0;
    const bi = industriesById.get(b[0])?.order ?? 0;
    return ai - bi;
  });
}

function selectedRelationSet() {
  return new Set(companyRelations(state.selectedCompanyId).map((relation) => relation.nodeId));
}

function selectedAncestorSet() {
  const ids = new Set();
  for (const relation of companyRelations(state.selectedCompanyId)) {
    const path = [];
    for (const part of relation.path) {
      path.push(part);
      const node = nodeByPath.get(`${relation.industryId}::${path.join(" / ")}`);
      if (node) ids.add(node.id);
    }
  }
  return ids;
}

function ancestorIdsForCompany(companyId) {
  const ids = new Set();
  for (const relation of companyRelations(companyId)) {
    const path = [];
    for (const part of relation.path.slice(0, -1)) {
      path.push(part);
      const node = nodeByPath.get(`${relation.industryId}::${path.join(" / ")}`);
      if (node) ids.add(node.id);
    }
  }
  return ids;
}

function expandCompanyPaths(companyId) {
  for (const relation of companyRelations(companyId)) {
    state.expandedIndustryIds.add(relation.industryId);
  }
  for (const id of ancestorIdsForCompany(companyId)) {
    state.expandedNodeIds.add(id);
  }
}

function searchableCompanies() {
  const query = compact(state.query);
  const all = DATA.companies.filter((company) => company.relationIds.length > 0);
  if (!query) {
    return all.sort(
      (a, b) =>
        b.industryIds.length - a.industryIds.length ||
        b.relationIds.length - a.relationIds.length ||
        a.name.localeCompare(b.name, "zh"),
    );
  }

  const directMatches = all.filter((company) => {
    const nameHit = compact(company.name).includes(query);
    const aliasHit = company.aliases.some((alias) => compact(alias).includes(query));
    const fullNameHit = company.fullNames.some((name) => compact(name).includes(query));
    const codeHit = company.codes.some((code) => compact(code).includes(query));
    return nameHit || aliasHit || fullNameHit || codeHit;
  });
  const candidates = directMatches.length
    ? directMatches
    : all.filter((company) => company.searchText.includes(query));

  return candidates.sort((a, b) => {
    const an = compact(a.name);
    const bn = compact(b.name);
    const aExact = an === query ? 1 : 0;
    const bExact = bn === query ? 1 : 0;
    const aPrefix = an.startsWith(query) ? 1 : 0;
    const bPrefix = bn.startsWith(query) ? 1 : 0;
    return (
      bExact - aExact ||
      bPrefix - aPrefix ||
      b.industryIds.length - a.industryIds.length ||
      b.relationIds.length - a.relationIds.length ||
      a.name.localeCompare(b.name, "zh")
    );
  });
}

function renderShell() {
  const dirtyText = state.dirty ? ` · ${state.changes.length} 个未保存改动` : "";
  els.sourceLine.textContent = `${DATA.generatedAt} 生成 | ${DATA.source}${dirtyText}`;
  els.stats.innerHTML = [
    ["子表", DATA.stats.industryCount],
    ["公司", DATA.stats.companyCount],
    ["分支", DATA.stats.nodeCount],
    ["命中", DATA.stats.relationCount],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`,
    )
    .join("");
  updateSaveState();
}

function renderCompanies() {
  const companies = searchableCompanies();
  if (state.selectedCompanyId && !companies.some((company) => company.id === state.selectedCompanyId)) {
    state.selectedCompanyId = "";
  }

  if (!companies.length) {
    els.companyList.innerHTML = '<div class="empty">没有匹配公司</div>';
    return;
  }

  els.companyList.innerHTML = companies
    .slice(0, 120)
    .map((company) => {
      const active = company.id === state.selectedCompanyId ? "active" : "";
      const chips = company.industries
        .slice(0, 3)
        .map((industry) => `<span class="chip theme-chip" ${themeStyle(industry)}>${escapeHtml(industry)}</span>`)
        .join("");
      const more = company.industries.length > 3 ? `<span class="chip muted-chip">+${company.industries.length - 3}</span>` : "";
      const companyTheme = company.industryIds[0] || company.industries[0] || "";
      return `<button class="company-card ${active}" type="button" data-company="${escapeHtml(company.id)}" ${themeStyle(companyTheme)}>
        <div class="company-main">
          <strong>${escapeHtml(company.name)}</strong>
          <span class="count-pill">${company.industries.length} 子表</span>
        </div>
        <div class="company-sub">${company.relationIds.length} 个命中分支</div>
        <div class="chip-row">${chips}${more}</div>
      </button>`;
    })
    .join("");

  els.companyList.querySelectorAll(".company-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCompanyId = button.dataset.company;
      state.selectedNodeId = "";
      state.expandedIndustryIds.clear();
      state.expandedNodeIds.clear();
      expandCompanyPaths(state.selectedCompanyId);
      update();
      scrollToFirstHit();
    });
  });
}

function currentIndustries() {
  const company = companiesById.get(state.selectedCompanyId);
  if (!company) {
    return DATA.industries;
  }
  return company.industryIds
    .map((id) => industriesById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function relationById(relationId) {
  return DATA.relations.find((relation) => relation.id === relationId);
}

function branchOptions(industryId, includeRoot = false) {
  const industry = industriesById.get(industryId);
  if (!industry) return [];
  const options = [];
  walkTree(industry.tree, (node) => {
    if (!includeRoot && node.depth === 0) return;
    const indent = node.depth > 0 ? "　".repeat(node.depth - 1) : "";
    options.push({
      id: node.id,
      label: node.depth === 0 ? `${node.label}（产业根）` : `${indent}${node.label}`,
    });
  });
  return options;
}

function fillSelect(select, options, selectedId) {
  select.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.id)}" ${option.id === selectedId ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
    )
    .join("");
}

function selectedEditBranchMode() {
  return document.querySelector('input[name="editBranchMode"]:checked')?.value || "existing";
}

function setEditBranchMode(mode) {
  document.querySelectorAll('input[name="editBranchMode"]').forEach((input) => {
    input.checked = input.value === mode;
  });
  els.existingBranchField.hidden = mode !== "existing";
  els.newBranchFields.hidden = mode !== "new";
}

function populateRelationChoices(industryId, selectedNodeId = "") {
  els.editIndustrySelect.innerHTML = DATA.industries
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(
      (industry) =>
        `<option value="${escapeHtml(industry.id)}" ${industry.id === industryId ? "selected" : ""}>${escapeHtml(industry.name)}</option>`,
    )
    .join("");

  const existingOptions = branchOptions(industryId, false);
  const parentOptions = branchOptions(industryId, true);
  const fallbackBranch = selectedNodeId && existingOptions.some((option) => option.id === selectedNodeId)
    ? selectedNodeId
    : existingOptions[0]?.id || "";
  const fallbackParent = selectedNodeId && parentOptions.some((option) => option.id === selectedNodeId)
    ? selectedNodeId
    : parentOptions[0]?.id || "";
  fillSelect(els.editBranchSelect, existingOptions, fallbackBranch);
  fillSelect(els.editParentSelect, parentOptions, fallbackParent);
}

function renderEditCompanySuggestions() {
  const matches = companyMatches(els.editCompanyInput.value);
  if (!els.editCompanyInput.value.trim() || state.editSelectedCompanyId) {
    els.editCompanySuggestions.innerHTML = "";
    return;
  }
  if (!matches.length) {
    els.editCompanySuggestions.innerHTML = '<div class="empty compact-empty">没有匹配公司；保存时会新建</div>';
    return;
  }
  els.editCompanySuggestions.innerHTML = matches
    .map((company) => {
      const sub = [company.codes?.[0], company.industries?.slice(0, 2).join(" / ")]
        .filter(Boolean)
        .join(" · ");
      return `<button class="edit-suggestion" type="button" data-edit-company="${escapeHtml(company.id)}">
        <strong>${escapeHtml(company.name)}</strong>
        <span>${escapeHtml(sub || `${company.relationIds.length} 个归属`)}</span>
      </button>`;
    })
    .join("");
}

function openRelationModal(options = {}) {
  const relation = options.relationId ? relationById(options.relationId) : undefined;
  const company = relation
    ? companiesById.get(relation.companyId)
    : companiesById.get(options.companyId || state.selectedCompanyId);
  const node = relation
    ? treeNodesById.get(relation.nodeId)
    : treeNodesById.get(options.nodeId || state.selectedNodeId);
  const industryId = relation?.industryId || node?.industryId || company?.industryIds?.[0] || DATA.industries[0]?.id || "";
  const selectedNodeId = relation?.nodeId || node?.id || "";

  state.editingRelationId = relation?.id || "";
  state.editSelectedCompanyId = company?.id || "";
  els.relationModalTitle.textContent = relation ? "编辑归属" : "新增归属";
  els.relationModalHint.textContent = relation
    ? "修改这家公司所属的产业链分支和入选原因"
    : "选择公司、产业链分支，并填写入选原因";
  els.saveRelationBtn.textContent = relation ? "保存修改" : "加入数据";
  els.editCompanyInput.value = company?.name || state.query || "";
  els.editCodeInput.value = company?.codes?.[0] || "";
  els.editFullNameInput.value = company?.fullNames?.[0] || "";
  els.editReasonInput.value = relation?.comment || "";
  els.editSourceInput.value = relation?.source || "";
  els.editDateInput.value = relation?.updatedAt || todayString();
  els.editNewBranchInput.value = "";

  populateRelationChoices(industryId, selectedNodeId);
  setEditBranchMode("existing");
  renderEditCompanySuggestions();
  els.relationModal.hidden = false;
  els.editCompanyInput.focus();
}

function closeRelationModal() {
  els.relationModal.hidden = true;
  state.editingRelationId = "";
  state.editSelectedCompanyId = "";
}

function getOrCreateEditCompany() {
  const typedName = els.editCompanyInput.value.trim();
  if (!typedName) return undefined;
  let company = state.editSelectedCompanyId ? companiesById.get(state.editSelectedCompanyId) : undefined;
  if (!company) company = findCompanyByInput(typedName);
  if (!company) {
    company = {
      id: makeCompanyId(typedName),
      name: typedName,
      aliases: [],
      codes: [],
      fullNames: [],
      regions: [],
      websites: [],
      notes: [],
      industryIds: [],
      industries: [],
      relationIds: [],
      searchText: compact(typedName),
    };
    DATA.companies.push(company);
    rebuildIndexes();
  }
  const code = els.editCodeInput.value.trim();
  const fullName = els.editFullNameInput.value.trim();
  if (code) uniquePush(company.codes, code);
  if (fullName && fullName !== company.name) uniquePush(company.fullNames, fullName);
  return company;
}

function findOrCreateEditNode() {
  const industry = industriesById.get(els.editIndustrySelect.value);
  if (!industry) return undefined;
  if (selectedEditBranchMode() === "existing") {
    return treeNodesById.get(els.editBranchSelect.value);
  }

  const parent = treeNodesById.get(els.editParentSelect.value) || industry.tree;
  const label = els.editNewBranchInput.value.trim();
  if (!label) return undefined;
  const path = parent.depth === 0 ? [label] : [...parent.path, label];
  const pathLabel = path.join(" / ");
  const existing = treeNodeByPath.get(`${industry.id}::${pathLabel}`);
  if (existing) return existing;

  const node = {
    id: makeNodeId(industry.id, pathLabel),
    industryId: industry.id,
    label,
    path,
    pathLabel,
    depth: path.length,
    companyIds: [],
    companyCount: 0,
    directCompanyCount: 0,
    relationIds: [],
    headerNotes: [],
    children: [],
  };
  parent.children = parent.children || [];
  parent.children.push(node);
  parent.children.sort((a, b) => a.label.localeCompare(b.label, "zh"));
  DATA.nodes.push({ ...removeChildren(node), industry: industry.name });
  rebuildIndexes();
  return treeNodesById.get(node.id);
}

function makeComment(reason, source, date) {
  const meta = [];
  if (source) meta.push(`来源：${source}`);
  if (date) meta.push(`更新时间：${date}`);
  return meta.length ? `${reason}\n${meta.join("；")}` : reason;
}

function saveRelationFromModal() {
  const company = getOrCreateEditCompany();
  const node = findOrCreateEditNode();
  const industry = node ? industriesById.get(node.industryId) : undefined;
  const reason = els.editReasonInput.value.trim();
  if (!company) {
    alert("先填写公司名称。");
    return;
  }
  if (!node || !industry) {
    alert(selectedEditBranchMode() === "new" ? "先选择父级并填写新分支名称。" : "先选择一个分支。");
    return;
  }
  if (!reason) {
    alert("先填写入选原因。");
    return;
  }

  const comment = makeComment(reason, els.editSourceInput.value.trim(), els.editDateInput.value);
  let relation = state.editingRelationId ? relationById(state.editingRelationId) : undefined;
  const duplicate = DATA.relations.find(
    (item) => item.companyId === company.id && item.nodeId === node.id && item.id !== state.editingRelationId,
  );
  if (!relation) relation = duplicate;

  const type = relation ? "更新" : "新增";
  if (!relation) {
    relation = {
      id: nextRelationId(),
      companyId: company.id,
      companyName: company.name,
      industryId: industry.id,
      industry: industry.name,
      nodeId: node.id,
      path: [...node.path],
      pathLabel: node.pathLabel,
      leaf: node.label,
      value: "手动",
      comment,
      cell: `线上维护!${els.editDateInput.value || todayString()}`,
      source: els.editSourceInput.value.trim(),
      updatedAt: els.editDateInput.value || todayString(),
      manual: true,
    };
    DATA.relations.push(relation);
  } else {
    relation.companyId = company.id;
    relation.companyName = company.name;
    relation.industryId = industry.id;
    relation.industry = industry.name;
    relation.nodeId = node.id;
    relation.path = [...node.path];
    relation.pathLabel = node.pathLabel;
    relation.leaf = node.label;
    relation.value = relation.value || "手动";
    relation.comment = comment;
    relation.cell = relation.cell?.startsWith("线上维护!") ? relation.cell : `线上维护!${els.editDateInput.value || todayString()}`;
    relation.source = els.editSourceInput.value.trim();
    relation.updatedAt = els.editDateInput.value || todayString();
    relation.manual = true;
  }

  recalculateAll();
  state.selectedCompanyId = company.id;
  state.selectedNodeId = node.id;
  state.expandedIndustryIds.clear();
  state.expandedNodeIds.clear();
  expandCompanyPaths(company.id);
  state.query = company.name;
  els.searchInput.value = company.name;
  markDirty({ type, company: company.name, industry: industry.name, path: node.pathLabel });
  closeRelationModal();
  update();
  scrollToFirstHit();
}

function deleteRelation(relationId) {
  const relation = relationById(relationId);
  if (!relation) return;
  const ok = window.confirm(`确定删除这条归属吗？\n${relation.companyName} / ${relation.industry} / ${relation.pathLabel}`);
  if (!ok) return;
  DATA.relations = DATA.relations.filter((item) => item.id !== relationId);
  recalculateAll();
  markDirty({
    type: "删除",
    company: relation.companyName,
    industry: relation.industry,
    path: relation.pathLabel,
  });
  if (state.selectedCompanyId && !companiesById.get(state.selectedCompanyId)?.relationIds.length) {
    state.selectedCompanyId = "";
  }
  update();
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubRequest(token, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}${path}`, {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.message) message = body.message;
    } catch {
      // Keep the HTTP status when GitHub does not return JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

async function remoteDataText() {
  const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.filePath}?t=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return "";
  return response.text();
}

function openTokenModal() {
  els.githubTokenInput.value = localStorage.getItem("industryBrowser.githubToken") || "";
  els.tokenModal.hidden = false;
  els.githubTokenInput.focus();
}

function closeTokenModal() {
  els.tokenModal.hidden = true;
}

async function saveOnline(tokenOverride = "") {
  if (!state.dirty || state.saving) return;
  const token = tokenOverride || localStorage.getItem("industryBrowser.githubToken") || "";
  if (!token) {
    openTokenModal();
    return;
  }

  state.saving = true;
  updateSaveState("正在检查线上版本...");
  try {
    const remoteText = await remoteDataText();
    if (remoteText && remoteText.trim() !== lastSyncedDataText.trim()) {
      const shouldContinue = window.confirm(
        "GitHub 上的数据文件已经被别人更新过。继续保存会覆盖对方的改动。\n\n建议先刷新页面再维护。仍然继续保存吗？",
      );
      if (!shouldContinue) {
        state.saving = false;
        updateSaveState("保存已取消：线上已有新版本，请刷新页面后再编辑。");
        return;
      }
    }

    updateSaveState("正在提交到 GitHub...");
    const nextDataText = serializeData(DATA);
    const ref = await githubRequest(token, `/git/ref/heads/${GITHUB_CONFIG.branch}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await githubRequest(token, `/git/commits/${baseCommitSha}`);
    const blob = await githubRequest(token, "/git/blobs", {
      method: "POST",
      body: JSON.stringify({
        content: nextDataText,
        encoding: "utf-8",
      }),
    });
    const tree = await githubRequest(token, "/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: [
          {
            path: GITHUB_CONFIG.filePath,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          },
        ],
      }),
    });
    const summary = state.changes
      .slice(0, 3)
      .map((change) => `${change.type}${change.company}：${change.path}`)
      .join("；");
    const commit = await githubRequest(token, "/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: `Update industry data${summary ? ` - ${summary}` : ""}`,
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    });
    await githubRequest(token, `/git/refs/heads/${GITHUB_CONFIG.branch}`, {
      method: "PATCH",
      body: JSON.stringify({
        sha: commit.sha,
        force: false,
      }),
    });

    lastSyncedDataText = nextDataText;
    state.dirty = false;
    state.changes = [];
    state.saving = false;
    updateSaveState(`已保存到 GitHub。GitHub Pages 通常会在 1-3 分钟内更新。`);
  } catch (error) {
    state.saving = false;
    updateSaveState(`保存失败：${error.message}`);
    if (String(error.message).includes("Bad credentials")) {
      localStorage.removeItem("industryBrowser.githubToken");
      openTokenModal();
    }
  }
}

function renderTreeNode(node) {
  const children = node.children || [];
  const isExpanded = state.expandedNodeIds.has(node.id);
  const hitNodeIds = selectedRelationSet();
  const ancestorIds = selectedAncestorSet();
  const isHit = hitNodeIds.has(node.id);
  const isRelated = !isHit && ancestorIds.has(node.id);
  const isSelected = state.selectedNodeId === node.id;
  const classes = ["tree-node"];
  if (isHit) classes.push("hit");
  if (isRelated) classes.push("related");
  if (isSelected) classes.push("selected");
  const noteMark = node.headerNotes?.length
    ? '<span class="note-dot" title="这个分支的表头有批注，点击分支后会在右侧显示">表头说明</span>'
    : "";
  const direct =
    children.length && node.directCompanyCount
      ? `<span class="direct-count" title="直接标在这个分支下、不是下级分支的公司数">本级 ${node.directCompanyCount}</span>`
      : "";
  const count = children.length
    ? `<span class="count-pill" title="包含所有下级分支的公司数">合计 ${node.companyCount}</span>`
    : `<span class="count-pill" title="直接标在这个分支下的公司数">公司 ${node.companyCount}</span>`;
  const toggle = children.length
    ? `<span class="node-toggle" title="${isExpanded ? "收起子分支" : "展开子分支"}">${isExpanded ? "▾" : "▸"}</span>`
    : '<span class="node-toggle leaf"></span>';
  return `<li>
    <button class="${classes.join(" ")}" type="button" data-node="${escapeHtml(node.id)}" ${themeStyle(node.industryId, node.depth)}>
      <span class="node-title">
        ${toggle}
        <span class="node-label">${escapeHtml(node.label)}</span>
      </span>
      <span class="node-meta">
        ${noteMark}
        ${direct}
        ${count}
      </span>
    </button>
    ${children.length && isExpanded ? `<ul>${children.map((child) => renderTreeNode(child)).join("")}</ul>` : ""}
  </li>`;
}

function renderTree() {
  const company = companiesById.get(state.selectedCompanyId);
  const industries = currentIndustries();
  els.treeHint.textContent = company
    ? `${company.name} 出现在 ${industries.length} 个子表；每个子表的命中分支都会高亮`
    : "当前未选公司；这里显示全部产业链，点击分支可查看该分支公司";

  els.treeView.innerHTML = industries
    .map((industry) => {
      const hits = companyRelations(state.selectedCompanyId).filter(
        (relation) => relation.industryId === industry.id,
      );
      const isExpanded = state.expandedIndustryIds.has(industry.id);
      return `<section class="industry-tree" ${themeStyle(industry)}>
        <button class="industry-title" type="button" data-industry="${escapeHtml(industry.id)}">
          <div class="industry-title-main">
            <span class="industry-toggle" title="${isExpanded ? "收起产业分支" : "展开产业分支"}">${isExpanded ? "▾" : "▸"}</span>
            <div>
              <h3>${escapeHtml(industry.name)}</h3>
              <p>${hits.length || industry.relationCount} 个命中分支 · ${industry.companyCount} 家公司</p>
            </div>
          </div>
          <span class="count-pill">${industry.nodeCount} 分支</span>
        </button>
        ${isExpanded ? `<ul class="tree-root">${industry.tree.children.map((child) => renderTreeNode(child)).join("")}</ul>` : ""}
      </section>`;
    })
    .join("");

  els.treeView.querySelectorAll(".industry-title").forEach((button) => {
    button.addEventListener("click", () => {
      const industryId = button.dataset.industry;
      if (state.expandedIndustryIds.has(industryId)) {
        state.expandedIndustryIds.delete(industryId);
      } else {
        state.expandedIndustryIds.add(industryId);
      }
      state.selectedNodeId = "";
      renderTree();
      renderDetail();
    });
  });

  els.treeView.querySelectorAll(".tree-node").forEach((button) => {
    button.addEventListener("click", () => {
      const nodeId = button.dataset.node;
      const flatNode = nodesById.get(nodeId);
      const treeNode = treeNodesById.get(nodeId);
      if (flatNode?.companyCount || flatNode?.directCompanyCount) {
        state.selectedNodeId = state.selectedNodeId === nodeId ? "" : nodeId;
      }
      if (treeNode?.children?.length) {
        if (state.expandedNodeIds.has(nodeId)) {
          state.expandedNodeIds.delete(nodeId);
        } else {
          state.expandedNodeIds.add(nodeId);
        }
      }
      renderTree();
      renderDetail();
    });
  });
}

function scrollToFirstHit() {
  requestAnimationFrame(() => {
    const firstHit = els.treeView.querySelector(".tree-node.hit");
    if (firstHit) {
      firstHit.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }
  });
}

function relationActions(relation) {
  if (!state.maintainMode) return "";
  return `<div class="relation-actions">
    <button class="ghost" type="button" data-edit-relation="${escapeHtml(relation.id)}">编辑</button>
    <button class="ghost danger-btn" type="button" data-delete-relation="${escapeHtml(relation.id)}">删除</button>
  </div>`;
}

function relationCard(relation) {
  const note = relation.comment
    ? escapeHtml(relation.comment).replaceAll("\n", "<br>")
    : "Excel 里这个单元格有标记，但没有写批注。";
  return `<article class="reason-card" ${themeStyle(relation.industryId)}>
    <div class="reason-head">
      <strong>${escapeHtml(relation.pathLabel)}</strong>
      <span>${escapeHtml(relation.cell)}</span>
    </div>
    <p>${note}</p>
    ${relationActions(relation)}
  </article>`;
}

function branchRelationCard(relation) {
  const note = relation.comment
    ? escapeHtml(relation.comment).replaceAll("\n", "<br>")
    : "Excel 里这个单元格有标记，但没有写批注。";
  return `<article class="branch-reason-card" ${themeStyle(relation.industryId)}>
    <div class="branch-reason-head">
      <strong>${escapeHtml(relation.companyName)}</strong>
      <span>${escapeHtml(relation.cell)}</span>
    </div>
    <div class="branch-reason-path">${escapeHtml(relation.pathLabel)}</div>
    <p>${note}</p>
    ${relationActions(relation)}
  </article>`;
}

function descendantRelationsForNode(node) {
  const nodeCompanyIds = new Set(node.companyIds || []);
  return DATA.relations
    .filter(
      (relation) =>
        relation.industryId === node.industryId &&
        nodeCompanyIds.has(relation.companyId) &&
        (relation.nodeId === node.id ||
          relation.pathLabel === node.pathLabel ||
          relation.pathLabel.startsWith(`${node.pathLabel} / `)),
    )
    .sort(
      (a, b) =>
        a.companyName.localeCompare(b.companyName, "zh") ||
        a.pathLabel.localeCompare(b.pathLabel, "zh"),
    );
}

function renderSelectedNodePanel(node) {
  const industry = industriesById.get(node.industryId);
  const direct = relationsByNode.get(node.id) || [];
  const branchRelations = descendantRelationsForNode(node);
  const directCount = unique(direct.map((relation) => relation.companyId)).length;
  return `<section class="detail-section selected-branch" ${themeStyle(node.industryId)}>
    <div class="section-head">
      <h2>${escapeHtml(industry?.name || "")} / ${escapeHtml(node.pathLabel)}</h2>
      <span class="section-actions">
        ${state.maintainMode ? `<button class="ghost" type="button" data-add-node="${escapeHtml(node.id)}">加公司</button>` : ""}
        <span class="count-pill">${node.companyCount} 家</span>
      </span>
    </div>
    <p class="branch-summary">${directCount ? `本级直接命中 ${directCount} 家；` : ""}含下级分支共 ${node.companyCount} 家公司</p>
    ${
      node.headerNotes?.length
        ? `<div class="branch-notes">${node.headerNotes
            .map((note) => `<p>${escapeHtml(note)}</p>`)
            .join("")}</div>`
        : ""
    }
    ${
      branchRelations.length
        ? `<div class="branch-reason-list">${branchRelations
            .slice(0, 160)
            .map((relation) => branchRelationCard(relation))
            .join("")}</div>`
        : '<div class="empty">这个节点没有直接或下级入选原因</div>'
    }
  </section>`;
}

function renderCompanyMeta(company) {
  const rows = [];
  if (company.codes.length) rows.push(["代码", company.codes.join(" / ")]);
  if (company.fullNames.length) rows.push(["全称", company.fullNames.slice(0, 3).join(" / ")]);
  if (company.regions.length) rows.push(["地区", company.regions.slice(0, 3).join(" / ")]);
  if (!rows.length) return "";
  return `<dl class="meta-grid">${rows
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("")}</dl>`;
}

function renderDetail() {
  const company = companiesById.get(state.selectedCompanyId);
  const node = nodesById.get(state.selectedNodeId);

  if (!company && !node) {
    els.detailPanel.innerHTML = `<div class="empty-detail">
      未选中公司。左侧搜索个股，或在中间点击产业链分支查看该分支下的公司。
      ${state.maintainMode ? '<button class="copy-btn empty-action" type="button" data-add-relation>新增归属</button>' : ""}
    </div>`;
    return;
  }

  const selectedNodePanel = node ? renderSelectedNodePanel(node) : "";
  if (!company) {
    els.detailPanel.innerHTML = selectedNodePanel;
    return;
  }

  const groups = relationsForCompanyByIndustry(company.id);
  const industrySummary = groups
    .map(([industryId, relations]) => {
      const industry = industriesById.get(industryId);
      return `<div class="path-summary" ${themeStyle(industryId)}>
        <strong>${escapeHtml(industry?.name || "")}</strong>
        <span>${relations.length}</span>
      </div>`;
    })
    .join("");

  const selectedNodeRelations = node
    ? companyRelations(company.id).filter((relation) => relation.nodeId === node.id)
    : [];
  const selectedNodeReasons = node
    ? `<section class="detail-section current-branch-detail" ${themeStyle(node.industryId)}>
        <div class="section-head">
          <h2>当前分支解释</h2>
          <span class="count-pill">${selectedNodeRelations.length}</span>
        </div>
        ${
          selectedNodeRelations.length
            ? selectedNodeRelations.map((relation) => relationCard(relation)).join("")
            : '<div class="empty">这家公司没有直接命中当前分支</div>'
        }
      </section>`
    : "";

  const industrySections = groups
    .map(([industryId, relations]) => {
      const industry = industriesById.get(industryId);
      return `<section class="detail-section industry-detail" ${themeStyle(industryId)}>
        <div class="section-head">
          <h2>${escapeHtml(industry?.name || "")}</h2>
          <span class="count-pill">${relations.length} 分支</span>
        </div>
        ${relations.map((relation) => relationCard(relation)).join("")}
      </section>`;
    })
    .join("");

  els.detailPanel.innerHTML = `<div class="detail-title">
      <div>
        <h2>${escapeHtml(company.name)}</h2>
        <p>出现在 ${company.industries.length} 个子表，命中 ${company.relationIds.length} 个分支</p>
      </div>
      <div class="detail-actions">
        ${state.maintainMode ? `<button class="ghost" type="button" data-add-company="${escapeHtml(company.id)}">新增归属</button>` : ""}
        <button class="copy-btn" type="button" id="copyBtn">复制解释</button>
      </div>
    </div>
    ${renderCompanyMeta(company)}
    <div class="path-grid">${industrySummary}</div>
    ${selectedNodePanel}
    ${selectedNodeReasons}
    ${industrySections}`;

  document.querySelector("#copyBtn")?.addEventListener("click", async (event) => {
    const lines = [`${company.name}`];
    for (const [industryId, relations] of groups) {
      const industry = industriesById.get(industryId);
      lines.push("");
      lines.push(`【${industry?.name || ""}】`);
      for (const relation of relations) {
        lines.push(`- ${relation.pathLabel}（${relation.cell}）：${relation.comment || "有标记，无批注"}`);
      }
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    event.currentTarget.textContent = "已复制";
    setTimeout(() => {
      event.currentTarget.textContent = "复制解释";
    }, 1200);
  });
}

function update() {
  renderShell();
  renderCompanies();
  renderTree();
  renderDetail();
}

els.maintainToggleBtn.addEventListener("click", () => {
  state.maintainMode = !state.maintainMode;
  update();
});

els.saveOnlineBtn.addEventListener("click", () => {
  saveOnline();
});

els.detailPanel.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-relation]");
  if (editButton) {
    openRelationModal({ relationId: editButton.dataset.editRelation });
    return;
  }

  const deleteButton = event.target.closest("[data-delete-relation]");
  if (deleteButton) {
    deleteRelation(deleteButton.dataset.deleteRelation);
    return;
  }

  const addCompanyButton = event.target.closest("[data-add-company]");
  if (addCompanyButton) {
    openRelationModal({ companyId: addCompanyButton.dataset.addCompany });
    return;
  }

  const addNodeButton = event.target.closest("[data-add-node]");
  if (addNodeButton) {
    openRelationModal({ nodeId: addNodeButton.dataset.addNode });
    return;
  }

  if (event.target.closest("[data-add-relation]")) {
    openRelationModal();
  }
});

els.closeRelationModalBtn.addEventListener("click", closeRelationModal);
els.cancelRelationBtn.addEventListener("click", closeRelationModal);
els.relationModal.addEventListener("click", (event) => {
  if (event.target === els.relationModal) closeRelationModal();
});
els.saveRelationBtn.addEventListener("click", saveRelationFromModal);

els.editCompanyInput.addEventListener("input", () => {
  const exact = findCompanyByInput(els.editCompanyInput.value);
  state.editSelectedCompanyId = exact?.id || "";
  renderEditCompanySuggestions();
});

els.editCompanySuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-company]");
  if (!button) return;
  const company = companiesById.get(button.dataset.editCompany);
  if (!company) return;
  state.editSelectedCompanyId = company.id;
  els.editCompanyInput.value = company.name;
  els.editCodeInput.value = company.codes?.[0] || "";
  els.editFullNameInput.value = company.fullNames?.[0] || "";
  renderEditCompanySuggestions();
});

els.editIndustrySelect.addEventListener("change", (event) => {
  populateRelationChoices(event.target.value);
});

document.querySelectorAll('input[name="editBranchMode"]').forEach((input) => {
  input.addEventListener("change", (event) => {
    setEditBranchMode(event.target.value);
  });
});

els.closeTokenModalBtn.addEventListener("click", closeTokenModal);
els.cancelTokenBtn.addEventListener("click", closeTokenModal);
els.tokenModal.addEventListener("click", (event) => {
  if (event.target === els.tokenModal) closeTokenModal();
});
els.confirmTokenBtn.addEventListener("click", () => {
  const token = els.githubTokenInput.value.trim();
  if (!token) {
    alert("先粘贴 GitHub token。");
    return;
  }
  if (els.rememberTokenInput.checked) {
    localStorage.setItem("industryBrowser.githubToken", token);
  } else {
    localStorage.removeItem("industryBrowser.githubToken");
  }
  closeTokenModal();
  saveOnline(token);
});

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  const results = searchableCompanies();
  state.selectedCompanyId = state.query ? results[0]?.id || "" : "";
  state.selectedNodeId = "";
  state.expandedIndustryIds.clear();
  state.expandedNodeIds.clear();
  if (state.selectedCompanyId) {
    expandCompanyPaths(state.selectedCompanyId);
  }
  update();
  if (state.selectedCompanyId) {
    scrollToFirstHit();
  }
});

els.resetBtn.addEventListener("click", () => {
  state.query = "";
  state.selectedCompanyId = "";
  state.selectedNodeId = "";
  state.expandedIndustryIds.clear();
  state.expandedNodeIds.clear();
  els.searchInput.value = "";
  update();
});

rebuildIndexes();
update();
