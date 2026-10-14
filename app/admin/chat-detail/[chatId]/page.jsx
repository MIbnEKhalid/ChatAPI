"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const NODE_W = 230;
const NODE_H = 90;

export default function AdminChatDetailPage() {
  const params = useParams();
  const chatId = params?.chatId;

  const [chat, setChat] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(true);

  // View mode
  const [viewMode, setViewMode] = useState("graph"); // "graph" | "timeline" | "raw"

  // Graph state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [nodeSpacing, setNodeSpacing] = useState(120);
  const [connectorsVisible, setConnectorsVisible] = useState(true);
  const [filterRole, setFilterRole] = useState("all"); // "all" | "user" | "model" | "system"
  const [showLegend, setShowLegend] = useState(false);
  const [highlightedBranch, setHighlightedBranch] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Transform / panning state
  const [transform, setTransform] = useState({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ startX: 0, startY: 0, initX: 50, initY: 50 });

  const containerRef = useRef(null);

  // Fetch detail
  useEffect(() => {
    async function fetchDetail() {
      if (!chatId) return;
      try {
        const res = await fetch(`/api/admin/chat-detail/${chatId}`);
        if (res.status === 401) {
          window.location.href = `/mbkauthe/login?redirect=${encodeURIComponent(
            `/admin/chat-detail/${chatId}`
          )}`;
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setChat(data.chat);
        setTreeData(data.treeData);
      } catch (e) {
        console.error("Chat detail error:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [chatId]);

  // Normalized nodes dictionary and rootId
  const { normalizedNodes, rootId } = useMemo(() => {
    if (!treeData) return { normalizedNodes: {}, rootId: null };

    // Tree dictionary
    if (treeData.nodes && treeData.rootId) {
      return { normalizedNodes: treeData.nodes, rootId: treeData.rootId };
    }

    // Linear array fallback
    if (Array.isArray(treeData)) {
      const dict = {};
      treeData.forEach((item, idx) => {
        const id = item.id || `node-${idx}`;
        const prevId = idx > 0 ? (treeData[idx - 1].id || `node-${idx - 1}`) : null;
        const nextId = idx < treeData.length - 1 ? (treeData[idx + 1].id || `node-${idx + 1}`) : null;
        dict[id] = {
          id,
          role: item.role || "user",
          content: item.content || (item.parts ? item.parts[0]?.text : item.text) || "",
          parentId: prevId,
          children: nextId ? [nextId] : [],
          timestamp: item.timestamp,
        };
      });
      return { normalizedNodes: dict, rootId: treeData[0]?.id || "node-0" };
    }

    return { normalizedNodes: {}, rootId: null };
  }, [treeData]);

  // Calculate layout positions using breadth-first search
  const positions = useMemo(() => {
    if (!rootId || !normalizedNodes[rootId]) return {};

    const pos = {};
    const depthCounts = {};

    function positionNode(nodeId, depth) {
      const x = 50 + depth * (NODE_W + nodeSpacing);
      if (!depthCounts[depth]) depthCounts[depth] = 0;
      const order = depthCounts[depth]++;
      const y = 50 + order * (NODE_H + nodeSpacing);

      pos[nodeId] = { x, y, depth, order };

      const node = normalizedNodes[nodeId];
      if (node && Array.isArray(node.children)) {
        node.children.forEach((childId) => {
          if (normalizedNodes[childId]) {
            positionNode(childId, depth + 1);
          }
        });
      }
    }

    positionNode(rootId, 0);

    // Any orphaned nodes not connected to root
    Object.keys(normalizedNodes).forEach((id) => {
      if (!pos[id]) {
        positionNode(id, 0);
      }
    });

    return pos;
  }, [normalizedNodes, rootId, nodeSpacing]);

  // Calculate connector lines between parent -> child
  const connectors = useMemo(() => {
    if (!connectorsVisible) return [];
    const lines = [];

    Object.keys(positions).forEach((id) => {
      const node = normalizedNodes[id];
      if (node && node.parentId && positions[node.parentId]) {
        const startPos = positions[node.parentId];
        const endPos = positions[id];

        const x1 = startPos.x + NODE_W;
        const y1 = startPos.y + 40;
        const x2 = endPos.x;
        const y2 = endPos.y + 40;

        const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

        const isHighlighted =
          highlightedBranch.has(node.parentId) && highlightedBranch.has(id);

        lines.push({
          id: `${node.parentId}->${id}`,
          x1,
          y1,
          length,
          angle,
          isHighlighted,
        });
      }
    });

    return lines;
  }, [positions, normalizedNodes, connectorsVisible, highlightedBranch]);

  // Highlight full branch path back to root on node click
  const handleNodeClick = (nodeId) => {
    const branch = new Set();
    let curr = nodeId;
    while (curr && normalizedNodes[curr]) {
      branch.add(curr);
      curr = normalizedNodes[curr].parentId;
    }
    setHighlightedBranch(branch);
    setSelectedNode(normalizedNodes[nodeId]);
  };

  // Zoom to fit all nodes
  const zoomToFit = useCallback(() => {
    const nodeIds = Object.keys(positions);
    if (!nodeIds.length || !containerRef.current) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodeIds.forEach((id) => {
      const p = positions[id];
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + NODE_W);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + NODE_H);
    });

    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;

    const padding = 80;
    const scaleX = (containerW - padding) / contentW;
    const scaleY = (containerH - padding) / contentH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.2);

    const newX = (containerW - contentW * newZoom) / 2 - minX * newZoom;
    const newY = (containerH - contentH * newZoom) / 2 - minY * newZoom;

    setZoomLevel(newZoom);
    setTransform({ x: newX, y: newY });
  }, [positions]);

  // Initial fit view once positions exist
  useEffect(() => {
    if (Object.keys(positions).length > 0) {
      zoomToFit();
    }
  }, [positions, zoomToFit]);

  // Mouse wheel zoom centered on cursor
  const handleWheel = (e) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldZoom = zoomLevel;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(2.5, oldZoom * factor));

    const contentX = (mouseX - transform.x) / oldZoom;
    const contentY = (mouseY - transform.y) / oldZoom;

    const nextX = mouseX - contentX * newZoom;
    const nextY = mouseY - contentY * newZoom;

    setZoomLevel(newZoom);
    setTransform({ x: nextX, y: nextY });
  };

  // Panning handlers
  const handleMouseDown = (e) => {
    if (e.target.closest(".tree-graph-node") || e.target.closest("button") || e.target.closest("input")) {
      return;
    }
    setIsPanning(true);
    panStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: transform.x,
      initY: transform.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.startX;
    const dy = e.clientY - panStartRef.current.startY;
    setTransform({
      x: panStartRef.current.initX + dx,
      y: panStartRef.current.initY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const resetView = () => {
    setZoomLevel(1);
    setTransform({ x: 50, y: 50 });
    setNodeSpacing(120);
    setFilterRole("all");
    setHighlightedBranch(new Set());
    setSelectedNode(null);
  };

  const exportData = () => {
    const payload = treeData || { chat, nodes: normalizedNodes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_tree_${chatId}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "450px", gap: 14 }}>
        <i className="fas fa-circle-notch fa-spin" style={{ fontSize: "1.8rem", color: "var(--accent)" }}></i>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading interactive tree graph...</span>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="admin-panel" style={{ padding: "48px 24px", textAlign: "center" }}>
        <i className="fas fa-triangle-exclamation" style={{ fontSize: "2.4rem", color: "var(--danger)", marginBottom: 14 }}></i>
        <h2 style={{ fontSize: "1.2rem", color: "var(--text-primary)", marginBottom: 6 }}>Conversation Not Found</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.86rem", marginBottom: 20 }}>
          The requested chat log with ID #{chatId} could not be located in the database.
        </p>
        <Link href="/admin/chats" className="admin-btn admin-btn-secondary">
          <i className="fas fa-arrow-left"></i>
          <span>Return to Chat Logs</span>
        </Link>
      </div>
    );
  }

  const allNodeList = Object.values(normalizedNodes);

  return (
    <>
      {/* Header Bar */}
      <div className="admin-page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Link href="/admin/chats" className="admin-btn admin-btn-ghost admin-btn-sm" style={{ paddingLeft: 0 }}>
              <i className="fas fa-arrow-left"></i>
              <span>Back to Logs</span>
            </Link>
            <span style={{ color: "var(--border-default)" }}>/</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              ID #{chat.id}
            </span>
          </div>

          <h1 className="admin-page-title" style={{ fontSize: "1.45rem" }}>
            <i className="fas fa-network-wired" style={{ color: "var(--primary, #00ff41)" }}></i>
            <span>{chat.title || `Chat Tree Inspector #${chat.id}`}</span>
            {chat.is_deleted && (
              <span className="admin-badge admin-badge-rose" style={{ fontSize: "0.7rem", marginLeft: 8 }}>
                DELETED
              </span>
            )}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* View mode toggle */}
          <div style={{ display: "flex", background: "var(--bg-main)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: 2 }}>
            <button
              type="button"
              onClick={() => setViewMode("graph")}
              className={`admin-btn admin-btn-sm ${viewMode === "graph" ? "admin-btn-primary" : "admin-btn-ghost"}`}
              title="Interactive Tree Canvas"
            >
              <i className="fas fa-project-diagram"></i>
              <span>Tree Graph</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`admin-btn admin-btn-sm ${viewMode === "timeline" ? "admin-btn-primary" : "admin-btn-ghost"}`}
              title="Linear Timeline"
            >
              <i className="fas fa-list-ul"></i>
              <span>Timeline</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`admin-btn admin-btn-sm ${viewMode === "raw" ? "admin-btn-primary" : "admin-btn-ghost"}`}
              title="Raw JSON Payload"
            >
              <i className="fas fa-code"></i>
              <span>JSON</span>
            </button>
          </div>

          <button type="button" onClick={exportData} className="admin-btn admin-btn-secondary admin-btn-sm">
            <i className="fas fa-download"></i>
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Overview Meta Strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: "0.82rem", color: "var(--text-muted)", flexWrap: "wrap", margin: "-12px 0 12px" }}>
        <span>
          <i className="fas fa-user" style={{ marginRight: 6, color: "var(--accent)" }}></i>
          User: <strong style={{ color: "var(--text-primary)" }}>{chat.username}</strong>
        </span>
        <span>
          <i className="fas fa-calendar" style={{ marginRight: 6 }}></i>
          Date: <span style={{ color: "var(--text-primary)" }}>{new Date(chat.created_at).toLocaleString()}</span>
        </span>
        <span>
          <i className="fas fa-sitemap" style={{ marginRight: 6 }}></i>
          Nodes: <strong style={{ color: "#00ff41", fontFamily: "var(--font-mono)" }}>{allNodeList.length}</strong>
        </span>
        {highlightedBranch.size > 0 && (
          <span style={{ color: "#00ff41" }}>
            <i className="fas fa-route" style={{ marginRight: 6 }}></i>
            Path depth: <strong>{highlightedBranch.size} nodes</strong>
            <button
              type="button"
              onClick={() => setHighlightedBranch(new Set())}
              style={{ marginLeft: 8, background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.75rem" }}
            >
              [Clear]
            </button>
          </span>
        )}
      </div>

      {/* GRAPH CANVAS VIEW */}
      {viewMode === "graph" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Interactive Toolbar */}
          <div className="tree-canvas-controls">
            {/* Zoom Control */}
            <div className="tree-control-item">
              <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "0.75rem" }}>Zoom:</span>
              <i className="fas fa-search-minus" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}></i>
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.05"
                value={zoomLevel}
                onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                style={{ width: 110, accentColor: "var(--accent)" }}
              />
              <i className="fas fa-search-plus" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}></i>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", width: 42 }}>
                {Math.round(zoomLevel * 100)}%
              </span>
            </div>

            {/* Spacing Control */}
            <div className="tree-control-item">
              <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "0.75rem" }}>Spacing:</span>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={nodeSpacing}
                onChange={(e) => setNodeSpacing(parseInt(e.target.value, 10))}
                style={{ width: 100, accentColor: "var(--accent)" }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", width: 44 }}>
                {nodeSpacing}px
              </span>
            </div>

            {/* Filter */}
            <div className="tree-control-item">
              <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "0.75rem" }}>Filter:</span>
              <select
                className="admin-select"
                style={{ padding: "4px 24px 4px 10px", fontSize: "0.78rem" }}
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="user">User Only</option>
                <option value="model">Model Only</option>
                <option value="system">System Only</option>
              </select>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => setConnectorsVisible(!connectorsVisible)}
                className={`admin-btn admin-btn-sm ${connectorsVisible ? "admin-btn-secondary" : "admin-btn-ghost"}`}
                title="Toggle connector lines"
              >
                <i className="fas fa-link"></i>
                <span>Links</span>
              </button>

              <button
                type="button"
                onClick={zoomToFit}
                className="admin-btn admin-btn-primary admin-btn-sm"
                title="Fit all nodes to view"
              >
                <i className="fas fa-expand"></i>
                <span>Fit View</span>
              </button>

              <button
                type="button"
                onClick={resetView}
                className="admin-btn admin-btn-secondary admin-btn-sm"
                title="Reset zoom and position"
              >
                <i className="fas fa-redo"></i>
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={() => setShowLegend(!showLegend)}
                className={`admin-btn admin-btn-sm ${showLegend ? "admin-btn-primary" : "admin-btn-secondary"}`}
                title="Toggle Legend"
              >
                <i className="fas fa-info-circle"></i>
                <span>Legend</span>
              </button>
            </div>
          </div>

          {/* Infinite Canvas */}
          <div
            ref={containerRef}
            className={`tree-canvas-wrapper ${isPanning ? "is-panning" : ""}`}
            style={{
              backgroundPosition: `${transform.x}px ${transform.y}px`,
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* Movable Canvas Layer */}
            <div
              className="tree-canvas-layer"
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${zoomLevel})`,
              }}
            >
              {/* Connector Lines */}
              {connectors.map((c) => (
                <div
                  key={c.id}
                  className={`tree-graph-connector ${c.isHighlighted ? "is-highlighted" : ""}`}
                  style={{
                    width: `${c.length}px`,
                    left: `${c.x1}px`,
                    top: `${c.y1}px`,
                    transform: `rotate(${c.angle}deg)`,
                  }}
                />
              ))}

              {/* Node Cards */}
              {Object.keys(positions).map((id) => {
                const node = normalizedNodes[id];
                if (!node) return null;

                const role = node.role?.toLowerCase() || "user";
                const isModel = role === "model" || role === "assistant";
                const isUser = role === "user";
                const isSystem = role === "system";

                // Filter check
                if (filterRole === "user" && !isUser) return null;
                if (filterRole === "model" && !isModel) return null;
                if (filterRole === "system" && !isSystem) return null;

                const roleClass = isUser ? "role-user" : isModel ? "role-model" : "role-system";
                const pos = positions[id];
                const isHighlighted = highlightedBranch.has(id);
                const text = node.content || node.text || "";

                return (
                  <div
                    key={id}
                    className={`tree-graph-node ${roleClass} ${isHighlighted ? "is-highlighted" : ""}`}
                    style={{
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNodeClick(id);
                    }}
                    title="Click to highlight branch path to root"
                  >
                    <div className="tree-graph-node-header">
                      <span className="tree-graph-node-role">{role}</span>
                      <span className="tree-graph-node-id">#{id.slice(0, 8)}</span>
                    </div>

                    <div className="tree-graph-node-text">
                      {text || <em style={{ color: "#777" }}>Empty message</em>}
                    </div>

                    <div className="tree-graph-node-footer">
                      <span>{node.model || (isUser ? "Prompt" : "Response")}</span>
                      <span>{node.timestamp ? new Date(node.timestamp).toLocaleTimeString() : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend Overlay */}
            {showLegend && (
              <div className="tree-legend-box">
                <div style={{ fontWeight: 700, fontSize: "0.82rem", borderBottom: "1px solid #333", paddingBottom: 6 }}>
                  <i className="fas fa-key" style={{ marginRight: 6, color: "#00ff41" }}></i>
                  Node Key
                </div>
                <div className="tree-legend-item">
                  <div className="tree-legend-dot" style={{ background: "#bc13fe" }}></div>
                  <span>User Prompts</span>
                </div>
                <div className="tree-legend-item">
                  <div className="tree-legend-dot" style={{ background: "#00ff41" }}></div>
                  <span>Model / Assistant</span>
                </div>
                <div className="tree-legend-item">
                  <div className="tree-legend-dot" style={{ background: "#ffcc00" }}></div>
                  <span>System Events</span>
                </div>
                <div style={{ borderTop: "1px solid #333", paddingTop: 8, fontSize: "0.72rem", color: "#888" }}>
                  <div>• Click node: highlight path to root</div>
                  <div>• Drag canvas: pan view</div>
                  <div>• Mouse wheel: zoom centered</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SELECTED NODE INSPECTOR DRAWER / MODAL */}
      {selectedNode && (
        <div className="admin-panel" style={{ marginTop: 14 }}>
          <div className="admin-panel-header">
            <div className="admin-panel-title-wrap">
              <span className="admin-badge admin-badge-indigo" style={{ textTransform: "uppercase" }}>
                {selectedNode.role}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Node ID: {selectedNode.id}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => copyToClipboard(selectedNode.content || selectedNode.text || "", selectedNode.id)}
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                <i className={`fas ${copiedId === selectedNode.id ? "fa-check" : "fa-copy"}`}></i>
                <span>{copiedId === selectedNode.id ? "Copied" : "Copy Content"}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                <i className="fas fa-xmark"></i>
                <span>Close</span>
              </button>
            </div>
          </div>

          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 24, marginBottom: 14, fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <span>Parent: <code style={{ color: "#00ff41" }}>{selectedNode.parentId || "None (Root)"}</code></span>
              <span>Children: <code style={{ color: "#00ff41" }}>{selectedNode.children?.length || 0} branches</code></span>
              {selectedNode.timestamp && <span>Time: <code>{new Date(selectedNode.timestamp).toLocaleString()}</code></span>}
            </div>

            <div
              style={{
                background: "var(--bg-root)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                padding: 18,
                fontSize: "0.9rem",
                lineHeight: 1.6,
                color: "var(--text-primary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "350px",
                overflowY: "auto",
              }}
            >
              {selectedNode.content || selectedNode.text || "Empty payload"}
            </div>
          </div>
        </div>
      )}

      {/* LINEAR TIMELINE VIEW */}
      {viewMode === "timeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {allNodeList.length === 0 ? (
            <div className="admin-panel" style={{ padding: "40px 20px", textAlign: "center" }}>
              <i className="fas fa-inbox" style={{ fontSize: "2rem", color: "var(--text-muted)", marginBottom: 10, display: "block" }}></i>
              <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>No Messages Recorded</div>
            </div>
          ) : (
            allNodeList.map((node, index) => {
              const isUser = node.role === "user";
              return (
                <div key={node.id || index} className="admin-inspector-node">
                  <div className="admin-inspector-node-header">
                    <div className="admin-inspector-node-role">
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: isUser ? "linear-gradient(135deg, #bc13fe, #a855f7)" : "linear-gradient(135deg, #00ff41, #059669)",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                        }}
                      >
                        <i className={`fas ${isUser ? "fa-user" : "fa-robot"}`}></i>
                      </div>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {isUser ? "User Message" : "AI Assistant"}
                      </span>
                      {node.model && (
                        <span className="admin-badge admin-badge-slate">{node.model}</span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        node: #{node.id?.slice(0, 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(node.content || node.text || "", node.id)}
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                      >
                        <i className={`fas ${copiedId === node.id ? "fa-check" : "fa-copy"}`}></i>
                        <span>{copiedId === node.id ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="admin-inspector-node-content">
                    {node.content || node.text || <em style={{ color: "var(--text-muted)" }}>Empty payload</em>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* RAW JSON VIEW */}
      {viewMode === "raw" && (
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div className="admin-panel-title">
              <i className="fas fa-code" style={{ color: "var(--accent)" }}></i>
              Raw Tree Data Payload
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify({ chat, treeData }, null, 2), "raw_json")}
              className="admin-btn admin-btn-secondary admin-btn-sm"
            >
              <i className={`fas ${copiedId === "raw_json" ? "fa-check" : "fa-copy"}`}></i>
              <span>{copiedId === "raw_json" ? "Copied JSON" : "Copy JSON"}</span>
            </button>
          </div>

          <div style={{ padding: 20 }}>
            <pre
              style={{
                background: "var(--bg-root)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                padding: 16,
                fontSize: "0.82rem",
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
                overflowX: "auto",
                maxHeight: "550px",
              }}
            >
              {JSON.stringify({ chat, treeData }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
