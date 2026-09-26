# 🤖 ChatAPI - AI Chat Assistant

A modern, full-featured AI chat application powered by **Google Gemini** & **DeepSeek**. This application provides a unified interface to interact with Gemini 2.5 Flash/Pro, Gemini 2.0 Flash, Gemini 1.5 Flash/Pro, DeepSeek V4 Flash, and DeepSeek V4 Pro, complete with user management, conversation history, and an admin dashboard.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![Express.js](https://img.shields.io/badge/Express.js-4.21%2B-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## 🌟 Features

### 🎯 Core Capabilities
- **Multi-Model AI Support**: Seamlessly switch between Google Gemini (2.5 Flash/Pro, 2.0, 1.5) and DeepSeek (V4 Flash/Pro).
- **Encrypted API Key Vault**: Users can bring and securely store their own Gemini or DeepSeek API keys (AES-256-GCM encrypted).
- **Contextual Memory & Branching**: Persistent conversation history stored in PostgreSQL / SQLite with message tree branching.

### 🎨 User Experience
- **Interactive Gallery**: Feature showcase with a built-in **Lightbox Image Viewer**.
- **Modern UI**: Cyberpunk/Glassmorphism inspired design with dark/light theme support.
- **Responsive Design**: Fully optimized for Desktop and Mobile devices (including sidebar navigation).
- **Customization**: Adjustable font sizes, temperature controls, and theme settings.
- **Rich Text**: Markdown support for code blocks, tables, and lists in chat responses.

### 🔧 Admin & Control
- **Admin Dashboard**: Comprehensive panel to manage users and view system stats.
- **User Management**: Role-based access control (Admin/User).
- **Message Limits**: Configurable daily message quotas per user to manage API costs.
- **Analytics**: Monitor chat volume and user activity.

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- PostgreSQL database (Local or Cloud like Neon/Supabase) or SQLite
- A Google Gemini API key and/or DeepSeek API token

### Installation & Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/MIbnEKhalid/ChatAPI.git
   cd ChatAPI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```

4. **Set up the database**
   ```bash
   # PostgreSQL (Recommended for cloud/Vercel)
   npm run db:init:postgres

   # Or SQLite (Local development)
   npm run db:init:sqlite
   ```

5. **Build and Run Unified Project**
   ```bash
   # Build the React frontend
   npm run build

   # Start the Express server (serves both API and built React SPA)
   npm start
   ```

6. **Development Mode**
   - Backend dev server: `npm run dev`
   - Frontend Vite dev server with proxy: `npm run dev:frontend`

### ☁️ Deploying to Vercel

The project is structured to deploy backend and frontend together directly on Vercel:

1. Connect your repository to Vercel.
2. Ensure Root Directory is set to `./` (or `ChatAPI` if part of a monorepo).
3. Set your environment variables (`DATABASE_URL`, `DEEPSEEK_API_TOKEN`, `API_KEY_ENCRYPTION_SECRET`, `SESSION_SECRET`, etc.) in the Vercel Project Settings.
4. Deploy! Vercel will run `npm run build` to generate the frontend assets and automatically route API requests to the `/api` serverless handler defined in [`api/index.js`](api/index.js).

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js (Runs locally & serverless on Vercel)
- **Frontend**: React, Vite, Tailwind/CSS
- **Database**: PostgreSQL (Cloud / Supabase / Neon) or SQLite (Local)
- **Authentication**: `mbkauthe`
- **AI Integration**: DeepSeek REST API with encrypted token storage

## 📱 API Endpoints

### Chat Operations
- `GET /chatbot` - Render the chat interface.
- `POST /api/chat` - Process user message and return AI response.
- `GET /api/history` - Fetch conversation history.
- `DELETE /api/chat/:id` - Delete a specific conversation.

### Admin
- `GET /admin/dashboard` - View system statistics.
- `GET /admin/users` - Manage registered users.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request



## 👨‍💻 Team

| Name | Role | Links |
|------|------|-------|
| **Muhammad Bin Khalid** | Lead Developer | [![GitHub](https://img.shields.io/badge/GitHub-100000?style=flat&logo=github&logoColor=white)](https://github.com/MIbnEKhalid) [![Website](https://img.shields.io/badge/Website-mbktech.org-blue)](https://mbktech.org) |
| **Maaz Waheed** | Developer | [![GitHub](https://img.shields.io/badge/GitHub-100000?style=flat&logo=github&logoColor=white)](https://github.com/42Wor) |

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For questions or contributions, please contact Muhammad Bin Khalid at [mbktech.org/Support](https://mbktech.org/Support/?Project=MIbnEKhalidWeb), [support@mbktech.org](mailto:support@mbktech.org) , [chmuhammadbinkhalid28.com](mailto:chmuhammadbinkhalid28.com) and [wwork4287@gmail.com](mailto:wwork4287@gmail.com). 