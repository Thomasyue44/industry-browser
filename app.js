const DATA = window.ALL_INDUSTRY_DATA;

const state = {
  query: "",
  selectedCompanyId: "",
  selectedNodeId: "",
  expandedIndustryIds: new Set(),
  expandedNodeIds: new Set(),
};

const companiesById = new Map(DATA.companies.map((company) => [company.id, company]));
const industriesById = new Map(DATA.industries.map((industry) => [industry.id, industry]));
const nodesById = new Map(DATA.nodes.map((node) => [node.id, node]));
const nodeByPath = new Map(DATA.nodes.map((node) => [`${node.industryId}::${node.pathLabel}`, node]));
const treeNodesById = new Map();
const relationsByCompany = new Map();
const relationsByNode = new Map();
const relationsByIndustry = new Map();

function indexTreeNode(node) {
  treeNodesById.set(node.id, node);
  for (const child of node.children || []) {
    indexTreeNode(child);
  }
}

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

const els = {
  sourceLine: document.querySelector("#sourceLine"),
  stats: document.querySelector("#stats"),
  searchInput: document.querySelector("#searchInput"),
  resetBtn: document.querySelector("#resetBtn"),
  companyList: document.querySelector("#companyList"),
  treeView: document.querySelector("#treeView"),
  treeHint: document.querySelector("#treeHint"),
  detailPanel: document.querySelector("#detailPanel"),
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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
  els.sourceLine.textContent = `${DATA.generatedAt} 生成 | ${DATA.source}`;
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
        .map((industry) => `<span class="chip">${escapeHtml(industry)}</span>`)
        .join("");
      const more = company.industries.length > 3 ? `<span class="chip muted-chip">+${company.industries.length - 3}</span>` : "";
      return `<button class="company-card ${active}" type="button" data-company="${escapeHtml(company.id)}">
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
    <button class="${classes.join(" ")}" type="button" data-node="${escapeHtml(node.id)}">
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
      return `<section class="industry-tree">
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

function relationCard(relation) {
  const note = relation.comment
    ? escapeHtml(relation.comment).replaceAll("\n", "<br>")
    : "Excel 里这个单元格有标记，但没有写批注。";
  return `<article class="reason-card">
    <div class="reason-head">
      <strong>${escapeHtml(relation.pathLabel)}</strong>
      <span>${escapeHtml(relation.cell)}</span>
    </div>
    <p>${note}</p>
  </article>`;
}

function branchRelationCard(relation) {
  const note = relation.comment
    ? escapeHtml(relation.comment).replaceAll("\n", "<br>")
    : "Excel 里这个单元格有标记，但没有写批注。";
  return `<article class="branch-reason-card">
    <div class="branch-reason-head">
      <strong>${escapeHtml(relation.companyName)}</strong>
      <span>${escapeHtml(relation.cell)}</span>
    </div>
    <div class="branch-reason-path">${escapeHtml(relation.pathLabel)}</div>
    <p>${note}</p>
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
  return `<section class="detail-section selected-branch">
    <div class="section-head">
      <h2>${escapeHtml(industry?.name || "")} / ${escapeHtml(node.pathLabel)}</h2>
      <span class="count-pill">${node.companyCount} 家</span>
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
      return `<div class="path-summary">
        <strong>${escapeHtml(industry?.name || "")}</strong>
        <span>${relations.length}</span>
      </div>`;
    })
    .join("");

  const selectedNodeRelations = node
    ? companyRelations(company.id).filter((relation) => relation.nodeId === node.id)
    : [];
  const selectedNodeReasons = node
    ? `<section class="detail-section">
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
      return `<section class="detail-section industry-detail">
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
      <button class="copy-btn" type="button" id="copyBtn">复制解释</button>
    </div>
    ${renderCompanyMeta(company)}
    <div class="path-grid">${industrySummary}</div>
    ${selectedNodePanel}
    ${selectedNodeReasons}
    ${industrySections}`;

  document.querySelector("#copyBtn").addEventListener("click", async (event) => {
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
  renderCompanies();
  renderTree();
  renderDetail();
}

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

renderShell();
update();
