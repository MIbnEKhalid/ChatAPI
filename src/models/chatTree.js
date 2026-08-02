import crypto from "crypto";

// Tree-based chat history model that supports branching conversations.
export class ChatTree {
  constructor(data) {
    if (Array.isArray(data)) {
      // Convert legacy linear array to tree structure
      this.nodes = {};
      this.rootId = null;
      let parentId = null;
      data.forEach((msg) => {
        const id = crypto.randomUUID();
        if (!this.rootId) this.rootId = id;
        this.nodes[id] = {
          id,
          parentId,
          children: [],
          role: msg.role,
          text: msg.parts ? msg.parts[0].text : msg.text,
          createdAt: Date.now(),
        };
        if (parentId && this.nodes[parentId]) {
          this.nodes[parentId].children.push(id);
        }
        parentId = id;
      });
      this.currentLeafId = parentId;
    } else if (data && data.nodes) {
      // Load existing tree
      this.nodes = data.nodes;
      this.rootId = data.rootId;
      this.currentLeafId = data.currentLeafId;
    } else {
      // New Tree
      this.nodes = {};
      this.rootId = null;
      this.currentLeafId = null;
    }
  }

  addMessage(role, text, parentId) {
    const id = crypto.randomUUID();
    const node = { id, parentId, children: [], role, text, createdAt: Date.now() };
    this.nodes[id] = node;

    if (!this.rootId) this.rootId = id;
    if (parentId && this.nodes[parentId]) {
      this.nodes[parentId].children.push(id);
    }
    this.currentLeafId = id;
    return id;
  }

  // Convert branch back to linear history for AI context
  getThread(leafId) {
    let thread = [];
    let curr = leafId || this.currentLeafId;
    while (curr && this.nodes[curr]) {
      thread.unshift({
        role: this.nodes[curr].role,
        parts: [{ text: this.nodes[curr].text }],
      });
      curr = this.nodes[curr].parentId;
    }
    return thread;
  }

  toJSON() {
    return { nodes: this.nodes, rootId: this.rootId, currentLeafId: this.currentLeafId };
  }
}
