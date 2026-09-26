import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <>
      <style>{`
        html, body, #root { overflow: auto !important; height: auto !important; }
        :root {
          --primary: #4361ee; --primary-dark: #3a0ca3;
          --secondary: #f72585; --dark: #121212; --darker: #0a0a0a;
          --light: #f8f9fa; --gray: #cccccc; --gray-dark: #888888;
          --gradient: linear-gradient(135deg, #4361ee, #f72585);
          --glass: rgba(30,30,30,0.5); --glass-border: rgba(255,255,255,0.1);
          --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 24px;
        }
        .landing * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Poppins', sans-serif; }
        .landing { background: #121212; color: #f8f9fa; line-height: 1.6; overflow-x: hidden; overflow-y: auto; min-height: 100vh; }
        .landing a { text-decoration: none; color: inherit; }
        .landing h1,.landing h2,.landing h3,.landing h4 { line-height: 1.2; font-weight: 700; }
        .text-gradient { background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }

        .btn {
          padding: 12px 24px; border-radius: var(--radius-sm); font-weight: 600; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1);
          display: inline-flex; align-items: center; gap: 8px; cursor: pointer; border: none; outline: none;
        }
        .btn-primary { background: var(--gradient); color: white; box-shadow: 0 4px 15px rgba(67,97,238,0.3); }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(67,97,238,0.4); }
        .btn-outline { background: transparent; border: 2px solid rgba(255,255,255,0.2); color: white; }
        .btn-outline:hover { border-color: white; background: rgba(255,255,255,0.1); transform: translateY(-2px); }

        .landing-nav {
          position: fixed; top: 0; width: 100%; z-index: 100; padding: 20px 50px;
          display: flex; justify-content: space-between; align-items: center;
          background: rgba(10,10,10,0.8); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .landing-nav .logo { font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }

        .hero {
          padding: 160px 50px 100px; text-align: center; position: relative;
          background: radial-gradient(ellipse at center, rgba(67,97,238,0.15) 0%, transparent 70%);
        }
        .hero h1 { font-size: 3.5rem; margin-bottom: 20px; max-width: 800px; margin-left: auto; margin-right: auto; }
        .hero p { font-size: 1.2rem; color: #888; max-width: 600px; margin: 0 auto 40px; }
        .hero .btn-group { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; }

        .features {
          padding: 80px 50px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 30px; max-width: 1200px; margin: 0 auto;
        }
        .feature-card {
          background: rgba(30,30,30,0.5); border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-lg); padding: 40px 30px;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1);
        }
        .feature-card:hover { transform: translateY(-5px); border-color: rgba(67,97,238,0.3); box-shadow: 0 15px 40px rgba(0,0,0,0.3); }
        .feature-icon { width: 60px; height: 60px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem; margin-bottom: 20px; }
        .feature-icon.purple { background: rgba(247,37,133,0.1); color: #f72585; }
        .feature-icon.blue { background: rgba(76,201,240,0.1); color: #4cc9f0; }
        .feature-icon.green { background: rgba(0,255,65,0.1); color: #00ff41; }
        .feature-card h3 { font-size: 1.3rem; margin-bottom: 10px; }
        .feature-card p { color: #888; font-size: 0.95rem; }

        .cta {
          text-align: center; padding: 80px 50px;
          background: radial-gradient(ellipse at center, rgba(247,37,133,0.1) 0%, transparent 70%);
        }
        .cta h2 { font-size: 2.5rem; margin-bottom: 15px; }
        .cta p { color: #888; max-width: 500px; margin: 0 auto 30px; }

        footer { text-align: center; padding: 40px; border-top: 1px solid rgba(255,255,255,0.05); color: #666; font-size: 0.9rem; }

        @media (max-width: 768px) {
          .landing-nav { padding: 15px 20px; }
          .hero { padding: 120px 20px 60px; }
          .hero h1 { font-size: 2.2rem; }
          .features { padding: 60px 20px; }
          .cta { padding: 60px 20px; }
          .cta h2 { font-size: 1.8rem; }
        }
      `}</style>

      <div className="landing">
        <nav className="landing-nav">
          <div className="logo">
            <img src="/icon.svg" alt="Logo" style={{ height: 28 }} />
            <span className="text-gradient">ChatAPI</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/chatbot" className="btn btn-outline" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Sign In
            </Link>
          </div>
        </nav>

        <section className="hero">
          <h1>
            <span className="text-gradient">Intelligent Conversations</span><br />
            Powered by Gemini & DeepSeek AI
          </h1>
          <p>
            A powerful AI chat platform with branching conversations, Google Gemini & DeepSeek models,
            and a cyberpunk-inspired interface. Open-source and easy to deploy.
          </p>
          <div className="btn-group">
            <Link to="/chatbot" className="btn btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Get Started Free
            </Link>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="btn btn-outline">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.73.083-.73 1.205.085 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.604-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12 24 5.37 18.63 0 12 0z"/></svg>
              View on GitHub
            </a>
          </div>
        </section>

        <section className="features">
          <div className="feature-card">
            <div className="feature-icon purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>
            </div>
            <h3>Branching Conversations</h3>
            <p>Edit any message to create alternate conversation paths. Explore different AI responses from any point.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
            </div>
            <h3>Multiple AI Models</h3>
            <p>Seamlessly switch between Google Gemini (2.5 Flash/Pro, 2.0, 1.5) and DeepSeek (V4 Flash/Pro) models.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <h3>Secure & Private</h3>
            <p>Bring your own API key. All keys are encrypted on the server. Your data stays under your control.</p>
          </div>
        </section>

        <section className="cta">
          <h2>Ready to <span className="text-gradient">Start Chatting</span>?</h2>
          <p>Join now and experience the next generation of AI conversations with a cyberpunk twist.</p>
          <Link to="/chatbot" className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '16px 32px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            Launch Terminal
          </Link>
        </section>

        <footer>
          <p>&copy; {new Date().getFullYear()} ChatAPI by mbktech.org. Built with Gemini & DeepSeek AI.</p>
        </footer>
      </div>
    </>
  )
}
