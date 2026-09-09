import express from "express";
import { validateSessionAndRole } from "mbkauthe";
import {
  getAdminStats,
  listAdminUsers,
  listAdminChats,
  getAdminChatDetail,
  bulkDeleteAdminChats,
} from "../controllers/admin.controller.js";

const router = express.Router();

// API: Dashboard Stats
router.get("/api/admin/stats", validateSessionAndRole("superadmin"), getAdminStats);

// API: Users List
router.get("/api/admin/users", validateSessionAndRole("superadmin"), listAdminUsers);

// API: Chats List
router.get("/api/admin/chats", validateSessionAndRole("superadmin"), listAdminChats);

// API: Chat Detail
router.get("/api/admin/chat-detail/:id", validateSessionAndRole("superadmin"), getAdminChatDetail);

// Bulk Delete
router.post("/api/admin/chats/bulk-delete", validateSessionAndRole("superadmin"), bulkDeleteAdminChats);

export default router;
