# 🤖 ChatAPI - AI Chat Assistant

A modern, full-featured AI chat application powered by **DeepSeek**. This application provides a unified interface to interact with DeepSeek V4 Flash and DeepSeek V4 Pro, complete with user management, conversation history, and an admin dashboard.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![Express.js](https://img.shields.io/badge/Express.js-4.21%2B-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## 🌟 Features

### 🎯 Core Capabilities
- **DeepSeek Model Support**: Seamlessly switch between DeepSeek V4 Flash and DeepSeek V4 Pro.
- **Efficient Tier Selection**: Optimized model selection for speed and reliability.
- **Contextual Memory**: Persistent conversation history stored in PostgreSQL.

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
- PostgreSQL database (Local or Cloud like Neon/Supabase)
- A DeepSeek API token

### Installation

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
   cp .env.template .env
   ```
   *See the [Environment Variables](#-environment-variables) section below.*

4. **Set up the database**
   Run the SQL script to create the necessary tables:
   ```bash
   psql -U your_username -d your_database -f model/db.sql
   ```

5. **Start the application**
   ```bash
   npm start
   ```

6. **Access the application**
   - Main Application: `http://localhost:3030`
   - Admin Dashboard: `http://localhost:3030/admin`

## 🔧 Environment Variables

Configure the following in your example`.env.template` file:
[.env.template](.env.template).

- `DEEPSEEK_API_TOKEN` — shared DeepSeek token used when a user has not saved their own token.
- `API_KEY_ENCRYPTION_SECRET` — secret used to encrypt and decrypt the saved DeepSeek token.

## 🗄️ Database Schema

The application uses PostgreSQL with the following main tables:

- **`ai_history_chatapi`**: Stores conversation threads, messages, and timestamps.
- **`user_message_logs_chatapi`**: Tracks daily message usage for rate limiting.
- **`users`** (or equivalent): User credentials and role management.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Frontend**: Handlebars (HBS), Vanilla CSS/JS
- **Authentication**: Session-based (Custom/Passport)
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