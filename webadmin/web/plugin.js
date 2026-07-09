// web/schi-core.js
var EXT = "/extensions/simple-channel-history";
function makeApi(api) {
  const list = (v) => api.asList(v, "com.diridium.RevisionInfo").length ? api.asList(v, "com.diridium.RevisionInfo") : api.asList(v, "revisionInfo");
  const dlist = (v) => api.asList(v, "com.diridium.DeletedItemInfo").length ? api.asList(v, "com.diridium.DeletedItemInfo") : api.asList(v, "deletedItemInfo");
  return {
    // Channels
    getHistory: async (channelId) => list(await api.get(`${EXT}/history`, { channelId })),
    getContent: (channelId, revision) => api.getXml(`${EXT}/content`, { channelId, revision }),
    revertChannel: (channelId, revision) => api.post(`${EXT}/revertChannel`, null, { params: { channelId, revision } }),
    pruneChannelHistory: (channelId, revision) => api.post(`${EXT}/pruneChannelHistory`, null, { params: { channelId, revision }, raw: true }),
    // Code templates
    getCodeTemplateHistory: async (codeTemplateId) => list(await api.get(`${EXT}/codeTemplateHistory`, { codeTemplateId })),
    getCodeTemplateContent: (codeTemplateId, revision) => api.getXml(`${EXT}/codeTemplateContent`, { codeTemplateId, revision }),
    revertCodeTemplate: (codeTemplateId, revision) => api.post(`${EXT}/revertCodeTemplate`, null, { params: { codeTemplateId, revision } }),
    pruneCodeTemplateHistory: (codeTemplateId, revision) => api.post(`${EXT}/pruneCodeTemplateHistory`, null, { params: { codeTemplateId, revision }, raw: true }),
    // Deleted channels
    getDeletedChannels: async () => dlist(await api.get(`${EXT}/deletedChannels`)),
    getDeletedChannelContent: (id) => api.getXml(`${EXT}/deletedChannelContent`, { id }),
    purgeDeletedChannel: (id) => api.post(`${EXT}/purgeDeletedChannel`, null, { params: { id }, raw: true }),
    // Deleted code templates
    getDeletedCodeTemplates: async () => dlist(await api.get(`${EXT}/deletedCodeTemplates`)),
    getDeletedCodeTemplateContent: (id) => api.getXml(`${EXT}/deletedCodeTemplateContent`, { id }),
    purgeDeletedCodeTemplate: (id) => api.post(`${EXT}/purgeDeletedCodeTemplate`, null, { params: { id }, raw: true })
  };
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function formatDateTime(ms) {
  const d = new Date(Number(ms) || 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function formatRevisionTime(ms) {
  const t = Number(ms) || 0;
  const elapsed = Date.now() - t;
  if (elapsed < 0) return formatDateTime(t);
  const seconds = Math.floor(elapsed / 1e3);
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return formatDateTime(t);
  if (minutes > 0) return `${minutes} minutes ago`;
  return `${seconds} seconds ago`;
}
var CHANGE = { UNCHANGED: "UNCHANGED", MODIFIED: "MODIFIED", LEFT_ONLY: "LEFT_ONLY", RIGHT_ONLY: "RIGHT_ONLY" };
var CHANGE_COLOR = {
  MODIFIED: "rgb(200,130,0)",
  LEFT_ONLY: "rgb(200,50,50)",
  RIGHT_ONLY: "rgb(50,140,50)",
  UNCHANGED: "gray"
};
var CHANGE_LABEL = { LEFT_ONLY: " (removed)", RIGHT_ONLY: " (added)", MODIFIED: " (changed)", UNCHANGED: "" };
function directChildren(el, name) {
  const out = [];
  for (const n of el.childNodes) if (n.nodeType === 1 && (name == null || n.tagName === name)) out.push(n);
  return out;
}
function directChild(el, name) {
  return directChildren(el, name)[0] || null;
}
function directChildText(el, name) {
  const c = directChild(el, name);
  return c ? c.textContent : null;
}
function stepTypeName(tag) {
  const i = tag.lastIndexOf(".");
  return i >= 0 && i < tag.length - 1 ? tag.substring(i + 1) : tag;
}
function escText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return escText(s).replace(/"/g, "&quot;");
}
function prettyNode(el, indent = "") {
  const attrs = [...el.attributes].map((a) => ` ${a.name}="${escAttr(a.value)}"`).join("");
  const kids = directChildren(el);
  if (kids.length === 0) {
    const text = el.textContent;
    if (text == null || text.trim() === "") return `${indent}<${el.tagName}${attrs}/>`;
    return `${indent}<${el.tagName}${attrs}>${escText(text)}</${el.tagName}>`;
  }
  const inner = kids.map((k) => prettyNode(k, indent + "  ")).join("\n");
  return `${indent}<${el.tagName}${attrs}>
${inner}
${indent}</${el.tagName}>`;
}
function put(components, key, displayName, content, category, parentGroup) {
  components.set(key, { key, displayName, content, category, parentGroup });
}
function extractSteps(components, connectorEl, connectorGroup, elementName, displayName, category) {
  const sub = directChild(connectorEl, elementName);
  if (!sub) return;
  const elements = directChild(sub, "elements");
  if (!elements) return;
  const steps = directChildren(elements);
  if (!steps.length) return;
  const subGroupKey = `${connectorGroup}/${displayName}`;
  steps.forEach((step, i) => {
    const seqText = directChildText(step, "sequenceNumber");
    const seq = seqText != null ? seqText : String(i);
    let name = directChildText(step, "name");
    if (!name) name = stepTypeName(step.tagName);
    put(components, `${subGroupKey}/Step ${seq}`, `Step ${seq}: ${name}`, prettyNode(step), category, subGroupKey);
    elements.removeChild(step);
  });
}
function extractConnector(components, connectorEl, group) {
  const props = directChild(connectorEl, "properties");
  if (props) {
    const script = directChild(props, "script");
    if (script) {
      put(components, `${group}/Script`, "Script", script.textContent, "CONNECTOR_SCRIPT", group);
      props.removeChild(script);
    }
    const pluginProps = directChild(props, "pluginProperties");
    if (pluginProps) {
      for (const plugin of directChildren(pluginProps)) {
        const pname = stepTypeName(plugin.tagName);
        put(components, `${group}/Plugin: ${pname}`, `Plugin: ${pname}`, prettyNode(plugin), "CONNECTOR_PLUGIN", group);
      }
      for (const plugin of directChildren(pluginProps)) pluginProps.removeChild(plugin);
    }
  }
  extractSteps(components, connectorEl, group, "filter", "Filter", "FILTER");
  extractSteps(components, connectorEl, group, "transformer", "Transformer", "TRANSFORMER");
  extractSteps(components, connectorEl, group, "responseTransformer", "Response Transformer", "RESPONSE_TRANSFORMER");
}
function decomposeChannel(channelXml) {
  const doc = new DOMParser().parseFromString(channelXml, "text/xml");
  if (doc.querySelector("parsererror") || !doc.documentElement) throw new Error("unparseable channel XML");
  const root = doc.documentElement;
  const components = /* @__PURE__ */ new Map();
  const groupDisplayNames = /* @__PURE__ */ new Map();
  for (const [tag, name] of [
    ["preprocessingScript", "Preprocessing Script"],
    ["postprocessingScript", "Postprocessing Script"],
    ["deployScript", "Deploy Script"],
    ["undeployScript", "Undeploy Script"]
  ]) {
    const node = directChild(root, tag);
    if (node) {
      put(components, `Channel Scripts/${name}`, name, node.textContent, "CHANNEL_SCRIPT", "Channel Scripts");
      root.removeChild(node);
    }
  }
  const source = directChild(root, "sourceConnector");
  if (source) {
    extractConnector(components, source, "Source Connector");
    put(components, "Source Connector/Configuration", "Configuration", prettyNode(source), "CONNECTOR_CONFIGURATION", "Source Connector");
    root.removeChild(source);
  }
  const destWrapper = directChild(root, "destinationConnectors");
  const destOrder = [];
  if (destWrapper) {
    const connectors = directChildren(destWrapper, "connector");
    connectors.forEach((connector, i) => {
      const connName = directChildText(connector, "name");
      const metaDataId = directChildText(connector, "metaDataId");
      const group = `Destination [${metaDataId}]`;
      groupDisplayNames.set(group, `Destination: ${connName} [${metaDataId}]`);
      destOrder.push(`${i + 1}. ${connName} [${metaDataId}]`);
      extractConnector(components, connector, group);
    });
    for (const connector of connectors) {
      const metaDataId = directChildText(connector, "metaDataId");
      const group = `Destination [${metaDataId}]`;
      put(components, `${group}/Configuration`, "Configuration", prettyNode(connector), "CONNECTOR_CONFIGURATION", group);
    }
    root.removeChild(destWrapper);
  }
  const ordered = /* @__PURE__ */ new Map();
  put(ordered, "Channel Properties", "Channel Properties", prettyNode(root), "CHANNEL_PROPERTIES", "Channel Properties");
  if (destOrder.length) put(ordered, "Destination Order", "Destination Order", destOrder.join("\n"), "CHANNEL_PROPERTIES", "Destination Order");
  for (const [k, v] of components) ordered.set(k, v);
  return { components: ordered, groupDisplayNames };
}
function computeChangeTypes(left, right) {
  const types = /* @__PURE__ */ new Map();
  const all = /* @__PURE__ */ new Set([...left.keys(), ...right.keys()]);
  for (const key of all) {
    const l = left.get(key);
    const r = right.get(key);
    if (!l) types.set(key, CHANGE.RIGHT_ONLY);
    else if (!r) types.set(key, CHANGE.LEFT_ONLY);
    else if (l.content !== r.content) types.set(key, CHANGE.MODIFIED);
    else types.set(key, CHANGE.UNCHANGED);
  }
  return types;
}
var POSITIONAL_RE = /<sequenceNumber>\d+<\/sequenceNumber>|<operator>[^<]*<\/operator>/g;
function stripPositional(content) {
  return content.replace(POSITIONAL_RE, "").replace(/\s+/g, " ").trim();
}
function computeReorderedSubGroups(left, right) {
  const result = /* @__PURE__ */ new Set();
  const bucket = (map) => {
    const m = /* @__PURE__ */ new Map();
    for (const comp of map.values()) {
      if (comp.parentGroup.includes("/")) {
        if (!m.has(comp.parentGroup)) m.set(comp.parentGroup, []);
        m.get(comp.parentGroup).push(stripPositional(comp.content));
      }
    }
    return m;
  };
  const leftSub = bucket(left);
  const rightSub = bucket(right);
  for (const [sub, leftContents] of leftSub) {
    const rightContents = rightSub.get(sub);
    if (!rightContents || leftContents.length !== rightContents.length) continue;
    if (JSON.stringify(leftContents) === JSON.stringify(rightContents)) continue;
    const ls = [...leftContents].sort();
    const rs = [...rightContents].sort();
    if (JSON.stringify(ls) === JSON.stringify(rs)) result.add(sub);
  }
  return result;
}
function groupChangeType(changeTypes, keys) {
  let hasLeft = false, hasRight = false, hasMod = false, hasUnch = false;
  for (const key of keys) {
    switch (changeTypes.get(key) || CHANGE.UNCHANGED) {
      case CHANGE.LEFT_ONLY:
        hasLeft = true;
        break;
      case CHANGE.RIGHT_ONLY:
        hasRight = true;
        break;
      case CHANGE.MODIFIED:
        hasMod = true;
        break;
      default:
        hasUnch = true;
    }
  }
  if (hasLeft && !hasRight && !hasMod && !hasUnch) return CHANGE.LEFT_ONLY;
  if (hasRight && !hasLeft && !hasMod && !hasUnch) return CHANGE.RIGHT_ONLY;
  if (hasMod || hasLeft || hasRight) return CHANGE.MODIFIED;
  return CHANGE.UNCHANGED;
}
function buildTree(left, right, groupDisplayNames, changeTypes, reordered, { changedOnly = false } = {}) {
  const allKeys = [.../* @__PURE__ */ new Set([...left.keys(), ...right.keys()])];
  const groups = /* @__PURE__ */ new Map();
  for (const key of allKeys) {
    const comp = left.get(key) || right.get(key);
    if (!groups.has(comp.parentGroup)) groups.set(comp.parentGroup, []);
    groups.get(comp.parentGroup).push(key);
  }
  const groupNames = [...groups.keys()];
  const subGroupSet = /* @__PURE__ */ new Set();
  const topToSub = /* @__PURE__ */ new Map();
  for (const g of groupNames) for (const other of groupNames) {
    if (other !== g && g.startsWith(other + "/")) {
      subGroupSet.add(g);
      if (!topToSub.has(other)) topToSub.set(other, []);
      topToSub.get(other).push(g);
    }
  }
  const compNode = (key) => {
    const comp = left.get(key) || right.get(key);
    return { type: "component", key, label: comp.displayName, changeType: changeTypes.get(key) || CHANGE.UNCHANGED };
  };
  const tree = [];
  let firstChanged = null;
  for (const groupName of groupNames) {
    if (subGroupSet.has(groupName)) continue;
    const subGroups = topToSub.get(groupName) || [];
    const allForGroup = [...groups.get(groupName) || []];
    for (const sg of subGroups) allForGroup.push(...groups.get(sg) || []);
    const gType = groupChangeType(changeTypes, allForGroup);
    if (changedOnly && gType === CHANGE.UNCHANGED) continue;
    const children = [];
    for (const key of groups.get(groupName) || []) {
      const ct = changeTypes.get(key) || CHANGE.UNCHANGED;
      if (changedOnly && ct === CHANGE.UNCHANGED) continue;
      const node = compNode(key);
      children.push(node);
      if (!firstChanged && ct !== CHANGE.UNCHANGED) firstChanged = key;
    }
    for (const sg of subGroups) {
      const subKeys = groups.get(sg) || [];
      const sgType = groupChangeType(changeTypes, subKeys);
      if (changedOnly && sgType === CHANGE.UNCHANGED) continue;
      let subLabel = sg.substring(groupName.length + 1);
      if (reordered.has(sg)) subLabel += " (steps reordered)";
      const subChildren = [];
      for (const key of subKeys) {
        const ct = changeTypes.get(key) || CHANGE.UNCHANGED;
        if (changedOnly && ct === CHANGE.UNCHANGED) continue;
        const node = compNode(key);
        subChildren.push(node);
        if (!firstChanged && ct !== CHANGE.UNCHANGED) firstChanged = key;
      }
      if (subChildren.length) children.push({ type: "group", label: subLabel, changeType: sgType, children: subChildren });
    }
    if (children.length) tree.push({ type: "group", label: groupDisplayNames.get(groupName) || groupName, changeType: gType, children });
  }
  return { tree, firstChanged };
}
function countChanges(changeTypes) {
  let changed = 0;
  for (const t of changeTypes.values()) if (t !== CHANGE.UNCHANGED) changed++;
  return { changed, total: changeTypes.size };
}

// web/diff-window.js
function languageFor(key) {
  if (/\/Script$/.test(key) || /Channel Scripts\//.test(key)) return "javascript";
  if (key === "Destination Order") return "plaintext";
  return "xml";
}
function dot(h, changeType) {
  return h("span", { style: `display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:7px; flex:none; background:${CHANGE_COLOR[changeType]}` });
}
function nodeLabel(h, text, changeType, showLabels) {
  const changed = changeType !== CHANGE.UNCHANGED;
  const color = changed ? `color:${CHANGE_COLOR[changeType]}; font-weight:600;` : "";
  return h("span", { style: color }, text + (showLabels ? CHANGE_LABEL[changeType] : ""));
}
function renderTree(h, treeData, { showLabels, onSelect }) {
  const el = h("div", { style: "flex:1; min-height:0; overflow:auto; padding:4px 0" });
  const rowByKey = /* @__PURE__ */ new Map();
  let selected = null;
  const select = (key) => {
    if (selected && rowByKey.get(selected)) rowByKey.get(selected).style.background = "";
    selected = key;
    const row = rowByKey.get(key);
    if (row) row.style.background = "var(--sel, rgba(120,150,255,0.18))";
    onSelect(key);
  };
  const walk = (nodes, depth, container) => {
    for (const node of nodes) {
      const pad2 = 8 + depth * 15;
      if (node.type === "group") {
        const kids = h("div");
        let expanded = true;
        const twisty = h("span", { style: "display:inline-block; width:12px; text-align:center; cursor:pointer; user-select:none; color:var(--text-dim)" }, "\u25BE");
        const row = h("div", {
          style: `display:flex; align-items:center; padding:2px 6px 2px ${pad2}px; cursor:pointer`,
          onClick: () => {
            expanded = !expanded;
            twisty.textContent = expanded ? "\u25BE" : "\u25B8";
            kids.style.display = expanded ? "" : "none";
          }
        }, twisty, dot(h, node.changeType), nodeLabel(h, node.label, node.changeType, showLabels));
        container.appendChild(row);
        container.appendChild(kids);
        walk(node.children, depth + 1, kids);
      } else {
        const row = h("div", {
          style: `display:flex; align-items:center; padding:2px 6px 2px ${pad2 + 12}px; cursor:pointer; border-radius:4px`,
          onmouseenter: (e) => {
            if (node.key !== selected) e.currentTarget.style.background = "var(--hover, rgba(128,128,128,0.10))";
          },
          onmouseleave: (e) => {
            if (node.key !== selected) e.currentTarget.style.background = "";
          },
          onClick: () => select(node.key)
        }, dot(h, node.changeType), nodeLabel(h, node.label, node.changeType, showLabels));
        rowByKey.set(node.key, row);
        container.appendChild(row);
      }
    }
  };
  walk(treeData, 0, el);
  return { el, select, hasKey: (k) => rowByKey.has(k) };
}
function paneHeader(h, oldLabel, newLabel) {
  const cell = (text) => h("div", { style: "flex:1 1 50%; min-width:0; text-align:center; font-weight:600; font-size:14px; padding:4px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" }, text);
  return h("div", { style: "display:flex; flex:none" }, cell(oldLabel), cell(newLabel));
}
function openDiff(platform, { title, oldLabel, newLabel, oldXml, newXml, decompose }) {
  const { h, modal } = platform.ui;
  let model = null;
  if (decompose) {
    try {
      const left = decomposeChannel(oldXml);
      const right = decomposeChannel(newXml);
      const changeTypes = computeChangeTypes(left.components, right.components);
      const reordered = computeReorderedSubGroups(left.components, right.components);
      const groupNames = new Map([...left.groupDisplayNames, ...right.groupDisplayNames]);
      model = { left, right, changeTypes, reordered, groupNames };
    } catch {
      model = null;
    }
  }
  const topBar = h("div", { style: "display:flex; justify-content:center; padding:0 0 8px 0; flex:none" });
  const contentArea = h("div", { style: "flex:1; min-height:0; display:flex; flex-direction:column" });
  const body = h(
    "div",
    { style: "display:flex; flex-direction:column; height:calc(100vh - 230px); min-height:360px; width:100%" },
    topBar,
    contentArea
  );
  let componentDiff = null;
  let rawDiff = null;
  const editors = [];
  let decomposedSplitEl = null;
  if (!model) {
    rawDiff = platform.createDiffEditor({ original: oldXml, modified: newXml, language: "xml" });
    editors.push(rawDiff);
    rawDiff.el.style.cssText = "flex:1; min-height:0; border:1px solid var(--line); border-radius:6px; overflow:hidden";
    contentArea.appendChild(h(
      "div",
      { style: "flex:1; min-height:0; display:flex; flex-direction:column" },
      paneHeader(h, oldLabel, newLabel),
      rawDiff.el
    ));
    setTimeout(() => rawDiff.layout(), 50);
  } else {
    componentDiff = platform.createDiffEditor({ language: "xml" });
    editors.push(componentDiff);
    buildDecomposedView();
  }
  function buildDecomposedView() {
    const { left, right, changeTypes, reordered, groupNames } = model;
    const { changed, total } = countChanges(changeTypes);
    const summary = h(
      "div",
      { style: "padding:2px 8px 6px; font-size:12px; color:var(--text-dim)" },
      `${changed} of ${total} components changed`
    );
    const treeHost = h("div", { style: "flex:1; min-height:0; display:flex; flex-direction:column" });
    let showChangedOnly = false;
    let showLabels = true;
    let currentKey = null;
    const showComponent = (key) => {
      currentKey = key;
      const l = left.components.get(key);
      const r = right.components.get(key);
      componentDiff.setModels({
        original: l ? l.content : "",
        modified: r ? r.content : "",
        language: languageFor(key)
      });
      setTimeout(() => componentDiff.layout(), 30);
    };
    const rebuild = () => {
      const { tree, firstChanged } = buildTree(
        left.components,
        right.components,
        groupNames,
        changeTypes,
        reordered,
        { changedOnly: showChangedOnly }
      );
      const rendered = renderTree(h, tree, { showLabels, onSelect: showComponent });
      treeHost.replaceChildren(rendered.el);
      const target = currentKey && rendered.hasKey(currentKey) ? currentKey : firstChanged;
      if (target) rendered.select(target);
      else componentDiff.setModels({ original: "", modified: "", language: "xml" });
    };
    const changedOnlyCb = h(
      "label",
      { style: "display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer" },
      h("input", { type: "checkbox", onChange: (e) => {
        showChangedOnly = e.target.checked;
        rebuild();
      } }),
      "Show Changed Only"
    );
    const labelsCb = h(
      "label",
      { style: "display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer" },
      h("input", { type: "checkbox", checked: true, onChange: (e) => {
        showLabels = e.target.checked;
        rebuild();
      } }),
      "Show Labels"
    );
    const checks = h("div", { style: "display:flex; gap:14px; padding:6px 8px; border-top:1px solid var(--line)" }, changedOnlyCb, labelsCb);
    const leftPane = h(
      "div",
      { style: "width:280px; flex:none; display:flex; flex-direction:column; min-height:0; border:1px solid var(--line); border-radius:6px; overflow:hidden" },
      summary,
      treeHost,
      checks
    );
    componentDiff.el.style.cssText = "flex:1; min-height:0; border:1px solid var(--line); border-radius:6px; overflow:hidden";
    const rightPane = h(
      "div",
      { style: "flex:1; min-height:0; display:flex; flex-direction:column" },
      paneHeader(h, oldLabel, newLabel),
      componentDiff.el
    );
    const split = h("div", { style: "flex:1; min-height:0; display:flex; gap:10px" }, leftPane, rightPane);
    decomposedSplitEl = split;
    contentArea.replaceChildren(split);
    rebuild();
    setTimeout(() => componentDiff.layout(), 50);
  }
  const buttons = [{ label: "Close", onClick: () => true }];
  let showingRaw = false;
  const rawContainer = h("div", { style: "flex:1; min-height:0; display:none; flex-direction:column" });
  let toggleBtn = null;
  if (model) {
    contentArea.appendChild(rawContainer);
    toggleBtn = h("button.btn", { onClick: () => toggleRaw() }, "Show Raw XML");
    topBar.appendChild(toggleBtn);
  }
  function toggleRaw() {
    showingRaw = !showingRaw;
    if (showingRaw) {
      if (!rawDiff) {
        rawDiff = platform.createDiffEditor({ original: oldXml, modified: newXml, language: "xml" });
        editors.push(rawDiff);
        rawDiff.el.style.cssText = "flex:1; min-height:0; border:1px solid var(--line); border-radius:6px; overflow:hidden";
        rawContainer.appendChild(paneHeader(h, oldLabel, newLabel));
        rawContainer.appendChild(rawDiff.el);
      }
      if (decomposedSplitEl) decomposedSplitEl.style.display = "none";
      rawContainer.style.display = "flex";
      relabelToggle("Show Component View");
      setTimeout(() => rawDiff.layout(), 50);
    } else {
      rawContainer.style.display = "none";
      if (decomposedSplitEl) decomposedSplitEl.style.display = "flex";
      relabelToggle("Show Raw XML");
      setTimeout(() => componentDiff.layout(), 50);
    }
  }
  function relabelToggle(text) {
    if (toggleBtn) toggleBtn.textContent = text;
  }
  const handle = modal({
    title,
    body,
    size: "xwide",
    buttons,
    onClose: () => editors.forEach((e) => e.dispose())
  });
  handle.el.style.maxWidth = "none";
  handle.el.style.width = "min(1900px, calc(100vw - 48px))";
  editors.forEach((e) => setTimeout(() => e.layout(), 60));
  return handle;
}
function openView(platform, { title, xml, decompose }) {
  const { h, modal } = platform.ui;
  const editor = platform.createCodeEditor({ value: xml, language: "xml", readOnly: true });
  editor.el.style.cssText = "flex:1; min-height:0; border:1px solid var(--line); border-radius:6px; overflow:hidden";
  const contentArea = h("div", { style: "flex:1; min-height:0; display:flex; gap:10px" });
  const body = h("div", { style: "display:flex; flex-direction:column; height:calc(100vh - 220px); min-height:340px; width:100%" }, contentArea);
  let model = null;
  if (decompose) {
    try {
      const dc = decomposeChannel(xml);
      model = dc;
    } catch {
      model = null;
    }
  }
  const buttons = [{ label: "Close", onClick: () => true }];
  if (model) {
    const changeTypes = new Map([...model.components.keys()].map((k) => [k, CHANGE.UNCHANGED]));
    const { tree } = buildTree(model.components, model.components, model.groupDisplayNames, changeTypes, /* @__PURE__ */ new Set(), {});
    const rendered = renderTree(h, tree, {
      showLabels: false,
      onSelect: (key) => {
        const c = model.components.get(key);
        if (c) editor.setValue(c.content);
      }
    });
    const leftPane = h("div", { style: "width:300px; flex:none; display:flex; flex-direction:column; min-height:0; border:1px solid var(--line); border-radius:6px; overflow:hidden" }, rendered.el);
    contentArea.append(leftPane, editor.el);
    let raw = false;
    buttons.unshift({
      label: "Show Raw XML",
      onClick: () => {
        raw = !raw;
        if (raw) editor.setValue(xml);
        toggleViewLabel(raw ? "Show Component View" : "Show Raw XML");
        return false;
      }
    });
  } else {
    contentArea.appendChild(editor.el);
  }
  function toggleViewLabel(text) {
    const btn = handle.el.querySelector(".modal-foot .btn");
    if (btn) btn.textContent = text;
  }
  const handle = modal({ title, body, size: "xwide", buttons, onClose: () => editor.dispose() });
  handle.el.style.maxWidth = "none";
  handle.el.style.width = "min(1900px, calc(100vw - 48px))";
  setTimeout(() => editor.layout && editor.layout(), 60);
  return handle;
}

// web/history-dialog.js
function shortHash(rev) {
  if (rev.hash != null && /^\d+$/.test(String(rev.hash))) return `Rev ${rev.revision}`;
  const hs = rev.hash != null ? String(rev.hash) : "";
  return hs.length >= 8 ? hs.substring(0, 8) : hs;
}
function diffLabel(side, rev) {
  const ts = formatDateTime(rev.time).slice(0, 16);
  return `${side} - ${shortHash(rev)} (user: ${rev.committerName || "Unknown"}, time: ${ts})`;
}
function openHistory(platform, api, { kind, id, name }) {
  const { h, modal, toast, confirmDialog } = platform.ui;
  const isChannel = kind === "channel";
  const noun = isChannel ? "channel" : "code template";
  const ops = isChannel ? {
    history: () => api.getHistory(id),
    content: (rev) => api.getContent(id, rev),
    revert: (rev) => api.revertChannel(id, rev),
    prune: (rev) => api.pruneChannelHistory(id, rev)
  } : {
    history: () => api.getCodeTemplateHistory(id),
    content: (rev) => api.getCodeTemplateContent(id, rev),
    revert: (rev) => api.revertCodeTemplate(id, rev),
    prune: (rev) => api.pruneCodeTemplateHistory(id, rev)
  };
  let rows = [];
  const table = new platform.ui.DataTable([
    // Sorting disabled (Swing RevisionInfoTable.setSortable(false)) — the list
    // stays newest-first as the server returns it.
    { key: "revision", label: "Revision", width: 120, sortable: false, render: (r) => shortHash(r) },
    { key: "committerName", label: "User", sortable: false, render: (r) => r.committerName || "Unknown" },
    { key: "time", label: "Date", sortable: false, render: (r) => formatRevisionTime(r.time) }
  ], {
    selectable: "multi",
    rowKey: (r) => String(r.hash),
    emptyText: "No history for this item yet.",
    onSelect: () => updateButtons(),
    onActivate: (r) => compareWithPrevious(r),
    onContextMenu: (r, e) => rowMenu(r, e)
  });
  table.el.style.cssText = "flex:1; min-height:0; overflow:auto; border:1px solid var(--line); border-radius:6px";
  const help = h(
    "div",
    { style: "font-size:11.5px; color:var(--text-dim); line-height:1.6; padding:2px 2px 8px" },
    h("div", "Double-click a revision to compare with previous"),
    h("div", "Ctrl/Cmd-click to select two revisions, then Show Diff"),
    h("div", "Right-click for prune option")
  );
  const showDiffBtn = h("button.btn", { onClick: () => showDiffSelected() }, "Show Diff");
  const revertBtn = h("button.btn", { onClick: () => revertSelected() }, "Revert to Selected");
  const buttonBar = h("div", { style: "display:flex; gap:8px; justify-content:flex-end; padding-top:10px" }, showDiffBtn, revertBtn);
  const body = h(
    "div",
    { style: "display:flex; flex-direction:column; width:min(680px, calc(100vw - 60px)); height:min(440px, calc(100vh - 160px))" },
    table.el,
    help,
    buttonBar
  );
  function isLatest(rev) {
    return rows.length > 0 && String(rows[0].hash) === String(rev.hash);
  }
  function olderThan(rev) {
    return rows.filter((r) => r.time < rev.time || r.time === rev.time && r.revision < rev.revision);
  }
  function updateButtons() {
    const sel = table.selectedRows();
    showDiffBtn.disabled = sel.length !== 2;
    revertBtn.disabled = !(sel.length === 1 && !isLatest(sel[0]));
  }
  async function reload() {
    try {
      rows = await ops.history();
    } catch (e) {
      toast(e.message || "Failed to load history.", "error");
      rows = [];
    }
    table.setRows(rows);
    updateButtons();
  }
  async function showDiff(a, b) {
    const [older, newer] = a.time <= b.time ? [a, b] : [b, a];
    try {
      const [oldXml, newXml] = await Promise.all([ops.content(older.hash), ops.content(newer.hash)]);
      openDiff(platform, {
        title: `${isChannel ? "Channel" : "Code Template"} Diff - ${name}`,
        oldLabel: diffLabel("Old", older),
        newLabel: diffLabel("New", newer),
        oldXml,
        newXml,
        decompose: isChannel
      });
    } catch (e) {
      toast(e.message || "Failed to load revision content.", "error");
    }
  }
  function showDiffSelected() {
    const sel = table.selectedRows();
    if (sel.length === 2) showDiff(sel[0], sel[1]);
  }
  function compareWithPrevious(rev) {
    const older = olderThan(rev);
    if (!older.length) {
      toast("No previous revision to compare to.", "info");
      return;
    }
    const prev = older.reduce((best, r) => r.time > best.time ? r : best);
    showDiff(prev, rev);
  }
  async function revertSelected() {
    const sel = table.selectedRows();
    if (sel.length !== 1 || isLatest(sel[0])) return;
    const rev = sel[0];
    const ok = await confirmDialog(
      "Confirm Revert",
      `Are you sure you want to revert to revision ${shortHash(rev)}?
This will overwrite the current ${noun}.`,
      { danger: true, okLabel: "Revert" }
    );
    if (!ok) return;
    try {
      const result = await ops.revert(rev.hash);
      if (result === false || result === "false") {
        toast("Revert failed.", "error");
        return;
      }
      toast(`${isChannel ? "Channel" : "Code template"} reverted successfully.`, "success");
      platform.events.emit(isChannel ? "channels:changed" : "codeTemplates:changed", { id });
      reload();
    } catch (e) {
      toast(e.message || "Revert failed.", "error");
    }
  }
  function rowMenu(rev, e) {
    const older = olderThan(rev);
    platform.ui.contextMenu(e.clientX, e.clientY, [
      {
        label: "Prune older revisions",
        icon: "trash",
        danger: true,
        onClick: () => pruneOlder(rev, older.length)
      }
    ]);
  }
  async function pruneOlder(rev, count) {
    if (!count) {
      toast("No older revisions to delete.", "info");
      return;
    }
    const ok = await confirmDialog(
      "Confirm Prune",
      `Delete ${count} revision(s) older than ${shortHash(rev)}?
This action cannot be undone.`,
      { danger: true, okLabel: "Delete" }
    );
    if (!ok) return;
    try {
      const deleted = await ops.prune(rev.hash);
      const n = parseInt(deleted, 10);
      toast(`Deleted ${Number.isNaN(n) ? count : n} older revision(s).`, "success");
      reload();
    } catch (e) {
      toast(e.message || "Prune failed.", "error");
    }
  }
  updateButtons();
  const handle = modal({ title: `Version History - ${name}`, body, size: "wide", buttons: [{ label: "Close", onClick: () => true }] });
  reload();
  return handle;
}

// web/deleted-items.jsx
var TYPE_CHANNEL = "Channel";
var TYPE_CODE_TEMPLATE = "Code Template";
function registerDeletedItems(platform) {
  const React = platform.React;
  const { toast, confirmDialog, saveFile, taskButton } = platform.ui;
  const api = makeApi(platform.api);
  const contentOf = (item) => item.type === TYPE_CHANNEL ? api.getDeletedChannelContent(item.id) : api.getDeletedCodeTemplateContent(item.id);
  function DeletedItemsPanel({ setTasks }) {
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [typeFilter, setTypeFilter] = React.useState("All");
    const [search, setSearch] = React.useState("");
    const [selected, setSelected] = React.useState(() => /* @__PURE__ */ new Set());
    const [sort, setSort] = React.useState({ key: "dateDeleted", dir: -1 });
    const load = React.useCallback(async () => {
      setLoading(true);
      try {
        const [chs, cts] = await Promise.all([api.getDeletedChannels(), api.getDeletedCodeTemplates()]);
        const merged = [
          ...chs.map((x) => ({ ...x, type: TYPE_CHANNEL })),
          ...cts.map((x) => ({ ...x, type: TYPE_CODE_TEMPLATE }))
        ];
        setItems(merged);
        setSelected(/* @__PURE__ */ new Set());
        setError(null);
      } catch (e) {
        setError(e.message || "Failed to load deleted items.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, []);
    React.useEffect(() => {
      load();
      setTasks("Deleted Items Tasks", [taskButton("Refresh", "refresh", () => load())]);
    }, [load, setTasks]);
    const visible = React.useMemo(() => {
      let list = items;
      if (typeFilter === "Channels") list = list.filter((i) => i.type === TYPE_CHANNEL);
      else if (typeFilter === "Code Templates") list = list.filter((i) => i.type === TYPE_CODE_TEMPLATE);
      const q = search.trim().toLowerCase();
      if (q) list = list.filter((i) => String(i.name || "").toLowerCase().includes(q));
      const col = sort.key;
      return [...list].sort((a, b) => {
        const va = a[col], vb = b[col];
        if (va === vb) return 0;
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * sort.dir;
        return String(va).localeCompare(String(vb)) * sort.dir;
      });
    }, [items, typeFilter, search, sort]);
    const selectedItems = visible.filter((i) => selected.has(i.id));
    const one = selectedItems.length === 1 ? selectedItems[0] : null;
    const two = selectedItems.length === 2 ? selectedItems : null;
    const sameTypePair = two && two[0].type === two[1].type ? two : null;
    const onRowClick = (item, e) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (e.metaKey || e.ctrlKey) {
          next.has(item.id) ? next.delete(item.id) : next.add(item.id);
        } else {
          next.clear();
          next.add(item.id);
        }
        return next;
      });
    };
    const toggleSort = (key) => setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
    async function viewXml(item) {
      try {
        const xml = await contentOf(item);
        openView(platform, { title: `Deleted ${item.type} - ${item.name}`, xml, decompose: item.type === TYPE_CHANNEL });
      } catch (e) {
        toast(e.message || "Failed to load snapshot.", "error");
      }
    }
    async function showDiff() {
      if (!sameTypePair) return;
      const [older, newer] = sameTypePair[0].dateDeleted <= sameTypePair[1].dateDeleted ? [sameTypePair[0], sameTypePair[1]] : [sameTypePair[1], sameTypePair[0]];
      try {
        const [oldXml, newXml] = await Promise.all([contentOf(older), contentOf(newer)]);
        openDiff(platform, {
          title: `Deleted ${older.type} Diff`,
          oldLabel: `Old - ${older.name} (deleted ${formatDateTime(older.dateDeleted)})`,
          newLabel: `New - ${newer.name} (deleted ${formatDateTime(newer.dateDeleted)})`,
          oldXml,
          newXml,
          decompose: older.type === TYPE_CHANNEL
        });
      } catch (e) {
        toast(e.message || "Failed to load snapshots.", "error");
      }
    }
    function downloadXml(item) {
      saveFile(`${item.name}.xml`, "application/xml", () => contentOf(item)).then(() => toast(`Saved ${item.name}.xml`, "success")).catch((e) => toast(e.message || "Download failed.", "error"));
    }
    async function purge(item) {
      const ok = await confirmDialog(
        "Confirm Purge",
        `Permanently delete the snapshot for "${item.name}"?
This action cannot be undone.`,
        { danger: true, okLabel: "Purge" }
      );
      if (!ok) return;
      try {
        const res = item.type === TYPE_CHANNEL ? await api.purgeDeletedChannel(item.id) : await api.purgeDeletedCodeTemplate(item.id);
        if (res === false || res === "false") {
          toast("Purge failed.", "error");
          return;
        }
        toast(`Purged the snapshot for "${item.name}".`, "success");
        load();
      } catch (e) {
        toast(e.message || "Purge failed.", "error");
      }
    }
    const sortArrow = (key) => sort.key === key ? sort.dir > 0 ? " \u25B2" : " \u25BC" : "";
    const Th = ({ col, label, width }) => /* @__PURE__ */ React.createElement("th", { className: "sortable", style: width ? { width } : null, onClick: () => toggleSort(col) }, label, sortArrow(col));
    return /* @__PURE__ */ React.createElement("div", { className: "p-4", style: { display: "flex", flexDirection: "column", gap: 10, height: "100%", minHeight: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "text-text-dim", style: { fontSize: 12 } }, "Final XML snapshots captured when a channel or code template was deleted. Select one to view, download, or purge it; select two of the same type to compare them."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "center" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 } }, "Show", /* @__PURE__ */ React.createElement("select", { value: typeFilter, onChange: (e) => setTypeFilter(e.target.value) }, /* @__PURE__ */ React.createElement("option", null, "All"), /* @__PURE__ */ React.createElement("option", null, "Channels"), /* @__PURE__ */ React.createElement("option", null, "Code Templates"))), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: "Filter by name\u2026",
        value: search,
        onChange: (e) => setSearch(e.target.value),
        style: { flex: "0 1 240px" }
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("span", { className: "text-text-faint", style: { fontSize: 12 } }, visible.length, " item(s)")), loading ? /* @__PURE__ */ React.createElement("div", { className: "text-text-faint" }, "Loading\u2026") : error ? /* @__PURE__ */ React.createElement("div", { style: { color: "var(--err)" } }, error) : /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minHeight: 0, overflow: "auto", border: "1px solid var(--line)", borderRadius: 6 } }, /* @__PURE__ */ React.createElement("table", { className: "dt", style: { width: "100%" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement(Th, { col: "type", label: "Type", width: 120 }), /* @__PURE__ */ React.createElement(Th, { col: "name", label: "Name" }), /* @__PURE__ */ React.createElement(Th, { col: "itemId", label: "Item ID", width: 240 }), /* @__PURE__ */ React.createElement(Th, { col: "deletedBy", label: "Deleted By", width: 130 }), /* @__PURE__ */ React.createElement(Th, { col: "dateDeleted", label: "Date Deleted", width: 170 }))), /* @__PURE__ */ React.createElement("tbody", null, visible.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 5, className: "text-text-faint", style: { padding: 12 } }, "No deleted items.")) : visible.map((item) => /* @__PURE__ */ React.createElement(
      "tr",
      {
        key: item.id,
        className: selected.has(item.id) ? "selected" : "",
        style: { cursor: "pointer" },
        onClick: (e) => onRowClick(item, e),
        onDoubleClick: () => viewXml(item)
      },
      /* @__PURE__ */ React.createElement("td", null, item.type),
      /* @__PURE__ */ React.createElement("td", null, item.name),
      /* @__PURE__ */ React.createElement("td", { className: "mono", style: { fontSize: 11 } }, item.itemId),
      /* @__PURE__ */ React.createElement("td", null, item.deletedBy || "Unknown"),
      /* @__PURE__ */ React.createElement("td", null, formatDateTime(item.dateDeleted))
    ))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: !one, onClick: () => one && viewXml(one) }, "View XML"), /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: !sameTypePair, onClick: () => showDiff() }, "Show Diff"), /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: !one, onClick: () => one && downloadXml(one) }, "Download XML"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-danger", disabled: !one, onClick: () => one && purge(one) }, "Purge")));
  }
  platform.registerSettingsPanel({ label: "Channel History: Deleted Items", component: DeletedItemsPanel });
}

// web/plugin.jsx
function register(platform) {
  const api = makeApi(platform.api);
  platform.registerChannelAction({
    id: "schi.channelHistory",
    label: "View History",
    icon: "clock",
    order: 50,
    onInvoke: (channel) => {
      if (!channel || !channel.id) return;
      openHistory(platform, api, { kind: "channel", id: channel.id, name: channel.name || channel.id });
    }
  });
  platform.registerCodeTemplateAction({
    id: "schi.codeTemplateHistory",
    label: "View History",
    icon: "clock",
    order: 50,
    onInvoke: (template) => {
      if (!template || !template.id) return;
      openHistory(platform, api, { kind: "codeTemplate", id: template.id, name: template.name || template.id });
    }
  });
  registerDeletedItems(platform);
}
export {
  register
};
