# ChatAPI
ChatAPI is a robust AI chatbot application designed to deliver seamless and customizable interactions with AI models. Developed using Node.js, Express, and Handlebars, it supports multiple AI providers and offers an intuitive interface for managing chat histories, settings, and more.

## Key Features

- **Multi-Model Compatibility**: Supports AI models like Gemini, NVIDIA, and Mallow.
- **Customizable User Experience**: Adjust themes, font sizes, temperature, and model preferences.
- **Chat History Management**: Save, retrieve, and delete chat histories effortlessly.
- **Modern Interface**: Clean, responsive design with features like skeleton loading, copy-to-clipboard for code blocks, and styled tables.
- **Admin Dashboard**: Manage AI model configurations and quotas with ease.
- **Robust Error Handling**: Comprehensive error management for API requests and database operations.

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **AI Integration**: Google Gemini API
- **Authentication**: Custom-built authentication system
- **Frontend**: Handlebars templating engine
- **Styling**: Custom CSS
- **Performance Enhancements**: Compression and minification enabled

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- Google Cloud Platform account (for Gemini API)
- Properly configured environment variables

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
NEON_POSTGRES=your_postgres_connection_string
Main_SECRET_TOKEN=your_secret_token
session_seceret_key=your_session_secret
IsDeployed=true_or_false
UserCredentialTable=your_credentials_table_name
RECAPTCHA_SECRET_KEY=your_recaptcha_secret
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_APPLICATION_CREDENTIALS=path_to_google_credentials
```

## Get Free API

### Gemini
https://aistudio.google.com/app/apikey
### Nvidia(llama)


## Installation Guide

1. Clone the repository:
    ```bash
    git clone https://github.com/MIbnEKhalid/ChatAPI
    cd ChatAPI
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Set up the database:
    - Update the connection strings in your `.env` file.
    - [`routes/pool.js`](routes/pool.js) will automatically create tables in db from [`model/db.sql`](model/db.sql)

4. Start the development server:
    ```bash
    npm run dev
    ```

    The application will be accessible at `http://localhost:3030`.

## API Endpoints

### Chat Endpoints
- `POST /api/chat` - Interact with the AI.
- `GET /api/chat/history` - Retrieve chat history.
- `GET /api/chat/history/:id` - Fetch specific chat history.
- `POST /api/chat/history` - Save chat history.
- `DELETE /api/chat/history/:id` - Remove chat history.

### User Settings
- `GET /api/settings` - Retrieve user settings.
- `POST /api/settings` - Update user settings.

### Authentication
- `POST /api/auth/login` - Log in a user.
- `POST /api/auth/logout` - Log out a user.
- `GET /api/auth/check` - Verify authentication status.

## Project Structure

```
├── routes/           # API routes and controllers
├── views/            # Handlebars templates
├── public/           # Static assets
├── documentation/    # Project documentation
├── index.js          # Main application file
└── package.json      # Project dependencies
```

## Contribution Guidelines

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Authors

Developed by Muhammad Bin Khalid (MIbnEKhalid) and Maaz Waheed (42Wor) at mbktechstudio.
