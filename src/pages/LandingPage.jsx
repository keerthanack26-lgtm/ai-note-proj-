import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Download, FileText, ListChecks, Lock, MessageSquare, Mic, ShieldCheck, Sparkles, Upload, UserRound } from 'lucide-react'
import SlideLetters from '../components/SlideLetters'

const FEATURES = [
  ['Record or upload', 'Capture audio with the microphone or bring an existing file.', Upload],
  ['Structured notes', 'Review a transcript, summary, key points, decisions, and deadlines.', FileText],
  ['Tasks you confirm', 'Suggested tasks stay suggestions until you save them, unless you opt in.', ListChecks],
  ['Chat with one note', 'Ask questions that are answered from that note only.', MessageSquare],
  ['Export', 'Download a text file or a formatted PDF of a note you can access.', Download],
  ['Admin oversight', 'Administrators monitor accounts and system health without reading private notes.', ShieldCheck],
]

const FAQS = [
  {
    q: 'What does VoiceNote AI do?',
    a: 'It records or uploads audio, transcribes speech, and creates a summary, key points, decisions, and possible tasks.',
  },
  {
    q: 'Who can see my recordings?',
    a: 'Only you. Audio, transcripts, notes, tasks, and chat stay private. Administrators see account metadata and aggregate usage, not your note content.',
  },
  {
    q: 'Which audio formats work?',
    a: 'WebM, WAV, MP3, M4A, and OGG are accepted, up to the configured size limit. The speech provider may still reject a file that is too long.',
  },
  {
    q: 'Will the AI invent deadlines?',
    a: 'It is instructed not to. Dates and action items that are not explicit are marked low confidence, and uncertain deadlines are not saved as facts.',
  },
]

export default function LandingPage() {
  const [open, setOpen] = useState(0)
  return (
    <div className="landing">
      <header className="nav">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Mic size={16} />
          </span>
          VoiceNote <span className="brand-ai">AI</span>
        </Link>
        <div className="nav-actions">
          <Link className="btn btn-ghost btn-small" to="/login">
            Log in
          </Link>
          <Link className="btn btn-primary btn-small" to="/register">
            Get started
          </Link>
        </div>
      </header>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow eyebrow-pill">
              <Sparkles size={14} /> Speak naturally. Capture intelligently. Get things done.
            </p>
            <SlideLetters
              as="h1"
              text={[
                { text: 'Turn voice into notes,\n' },
                { text: 'decisions, and tasks', className: 'hero-highlight' },
                { text: '.' },
              ]}
            />
            <p className="lede">
              Record in the browser or upload an audio file. VoiceNote AI transcribes the speech, writes a structured note, and helps you track the work that came out of the conversation.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/register">
                <Mic size={18} /> Get started
              </Link>
              <Link className="btn btn-ghost" to="/login">
                <UserRound size={18} /> Log in
              </Link>
            </div>
            <aside className="hero-panel">
              <span className="panel-icon">
                <Sparkles size={18} />
              </span>
              <h2>A private workspace</h2>
              <p>Transcripts, summaries, and tasks belong to the account that created them.</p>
              <p className="hint panel-note">
                <Lock size={14} /> <span>AI keys stay on the server. The browser only uses the Supabase publishable key.</span>
              </p>
            </aside>
          </div>
          <div className="hero-visual" aria-hidden="true" />
        </div>
      </section>
      <section className="section" id="features">
        <SlideLetters as="h2" className="section-title" text="Feature overview" />
        <div className="feature-grid">
          {FEATURES.map(([title, copy, Icon]) => (
            <article className="card feature-card" key={title}>
              <span className="feature-icon">
                <Icon size={18} />
              </span>
              <div>
                <h3>{title}</h3>
                <p className="hint">{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section" id="how">
        <SlideLetters as="h2" text="How it works" />
        <div className="steps" style={{ marginTop: 16 }}>
          {[
            'Create an account. New accounts receive the User role.',
            'Record or upload audio into a private storage folder named with your user id.',
            'A processing job tracks each stage: prepare, transcribe, generate notes, extract actions, and save.',
            'Review the result, edit it, export it, and turn confirmed action items into tasks.',
          ].map((step, index) => (
            <div className="step" key={step}>
              <b>{index + 1}</b>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="section" id="privacy">
        <div className="privacy-grid">
          <div>
            <SlideLetters as="h2" text="Privacy and security" />
            <p className="lede">
              Row Level Security limits every user-owned table to its owner. Storage paths are private. Edge Functions check the signed-in user before calling a speech or language model.
            </p>
          </div>
          <ul className="card privacy-card">
            {['Your audio is not public.', 'Admins do not get a note viewer.', 'Role changes are blocked in the database.', 'Failed jobs stay failed until you retry.'].map((item) => (
              <li key={item} className="meta">
                <Lock size={18} /> {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section" id="faq">
        <h2>Frequently asked questions</h2>
        <div className="faq" style={{ marginTop: 16 }}>
          {FAQS.map((item, index) => (
            <article className="card faq-item" key={item.q}>
              <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}>
                {item.q}
              </button>
              {open === index ? <p>{item.a}</p> : null}
            </article>
          ))}
        </div>
      </section>
      <footer className="footer">
        <div>
          <strong>VoiceNote AI</strong>
          <p>Speak naturally. Capture intelligently. Get things done.</p>
        </div>
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#faq">FAQ</a>
          <Link to="/login">Log in</Link>
          <Link to="/register">Register</Link>
        </div>
        <p>
          <CheckCircle2 size={16} /> In-app deadline tracking is included. Email and push reminders are not configured.
        </p>
      </footer>
    </div>
  )
}
