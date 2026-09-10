import express from "express";
import { sessPerm } from "mbkauthe";
import { Permissions } from "../permissions.js";
import { getAdminStats, listAdminUsers, listAdminChats, getAdminChatDetail, bulkDeleteAdminChats } from "../controllers/admin.controller.js";

const router = express.Router();

// API: Dashboard Stats
router.get("/api/admin/stats", sessPerm(Permissions.admin.stats), getAdminStats);

// API: Users List
router.get("/api/admin/users", sessPerm(Permissions.admin.list_users), listAdminUsers);

// API: Chats List
router.get("/api/admin/chats", sessPerm(Permissions.admin.view_chat), listAdminChats);

// API: Chat Detail
router.get("/api/admin/chat-detail/:id", sessPerm(Permissions.admin.view_chat), getAdminChatDetail);

// Bulk Delete
router.post("/api/admin/chats/bulk-delete", sessPerm(Permissions.admin.delete_chats), bulkDeleteAdminChats);

export default router;
