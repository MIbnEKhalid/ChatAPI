# 🤖 ChatAPI - AI Chat Assistant

A modern, full-featured AI chat application powered by Google Gemini API with advanced user management, conversation history, and admin dashboard.

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Express.js](https://img.shields.io/badge/Express.js-4.21+-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## 🌟 Features

### 🎯 Core Features
- **AI-Powered Chat**: Intelligent conversations using Google Gemini API
- **User Authentication**: Secure login/logout system with session management
- **Conversation History**: Persistent chat history with organized conversation threads
- **Real-time Chat**: Modern, responsive chat interface
- **Multiple AI Models**: Support for various AI models including Gemini and NVIDIA APIs

### 🎨 User Experience
- **Modern UI**: Clean, responsive design with dark/light theme support
- **Font Customization**: Adjustable font sizes for better accessibility
- **Message Formatting**: Support for markdown, code highlighting, and rich text
- **Mobile Responsive**: Optimized for all device sizes
- **Real-time Updates**: Live chat updates and typing indicators

### 🔧 Admin Features
- **Admin Dashboard**: Comprehensive management panel
- **User Management**: View and manage all users
- **Chat Analytics**: Monitor conversation statistics
- **Message Limits**: Configurable daily message limits per user
- **System Monitoring**: Server uptime and performance metrics

### 📊 Advanced Features
- **Message Limits**: Daily message quotas with customizable limits
- **Temperature Control**: Adjustable AI response creativity
- **Conversation Threading**: Organized chat sessions with unique IDs
- **Export Functionality**: Export conversation history
- **Search & Filter**: Advanced search through chat history

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- PostgreSQL database
- Google Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ChatAPI.git
   cd ChatAPI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.template .env
   ```
   Edit `.env` with your configuration (see [Environment Variables](#-environment-variables))

4. **Set up the database**
   ```bash
   # Import the database schema
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

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEON_POSTGRES` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NVIDIA_API` | NVIDIA AI API key | - |
| `PORT` | Server port | `3030` |
| `NODE_ENV` | Environment mode | `development` |

## 🗄️ Database Schema

The application uses PostgreSQL with the following main tables:

- **`ai_history_chatapi`**: Stores conversation history and metadata
- **`user_settings_chatapi`**: User preferences and settings
- **`user_message_logs_chatapi`**: Daily message usage tracking

## 🛠️ Development

### Project Structure
```
ChatAPI/
├── index.js                 # Main application entry point
├── package.json             # Dependencies and scripts
├── vercel.json             # Vercel deployment configuration
├── model/
│   └── db.sql              # Database schema
├── routes/
│   ├── main.js             # Main chat routes
│   ├── dashboard.js        # Admin dashboard routes
│   ├── pool.js             # Database connection pool
│   └── checkMessageLimit.js # Message limit middleware
├── views/
│   ├── mainPages/          # Main application pages
│   ├── admin/              # Admin dashboard pages
│   ├── layouts/            # Handlebars layouts
│   └── staticPage/         # Static pages
├── public/
│   └── Assets/             # Static assets (CSS, JS, images)
```

### Available Scripts

```bash
npm start
```

### Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with connection pooling
- **Template Engine**: Handlebars
- **Authentication**: Custom session management (mbkauthe)
- **AI Integration**: Google Gemini API
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Deployment**: Vercel-ready configuration

## 📱 API Endpoints

### Chat API
- `GET /chatbot` - Main chat interface
- `POST /api/chat` - Send message to AI
- `GET /api/chat-history` - Retrieve conversation history
- `POST /api/save-chat` - Save conversation
- `DELETE /api/delete-chat/:id` - Delete conversation

### User Management
- `GET /admin/dashboard` - Admin dashboard
- `GET /admin/users` - User management
- `GET /admin/chats` - Chat management
- `POST /api/user-settings` - Update user preferences

### Authentication
- `POST /login` - User login
- `POST /logout` - User logout
- `GET /register` - User registration page

## 🔐 Authentication & Security

- Session-based authentication
- CSRF protection
- Input validation and sanitization
- SQL injection prevention
- Rate limiting for API endpoints
- Message limit enforcement

## 🎨 Customization

### Themes
- Dark theme (default)
- Light theme
- Custom CSS variables for easy theming

### AI Models
- Google Gemini 1.5 Flash (default)
- NVIDIA AI models (optional)
- Configurable temperature settings

### User Settings
- Adjustable font sizes
- Theme preferences
- Daily message limits
- Model selection

## 📊 Monitoring & Analytics

- Real-time user activity tracking
- Message usage statistics
- System performance metrics
- Conversation analytics
- Error logging and monitoring

### Manual Deployment
```bash
npm start
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

[**Muhammad Bin Khalid**](https://github.com/MIbnEKhalid/)

[**Maaz Waheed**](https://github.com/42Wor/)
- Developer and Maintainer
- [mbktech.org](https://mbktech.org)

## Contact

For questions or contributions, please contact Muhammad Bin Khalid at [mbktech.org/Support](https://mbktech.org/Support/?Project=MIbnEKhalidWeb), [support@mbktech.org](mailto:support@mbktech.org) or [chmuhammadbinkhalid28.com](mailto:chmuhammadbinkhalid28.com). 