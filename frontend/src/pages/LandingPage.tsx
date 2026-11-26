import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { LogoMark } from '../components/Logo'
import { CountUp } from '../landing/CountUp'
import { useReveal } from '../landing/motion'
import { PhoneMockup } from '../landing/PhoneMockup'
import '../landing/landing.css'

const REPO_URL = 'https://github.com/CodeAlvinCreator/Stock-Wise-'

// The Account screen reloads the app on /?deleted=... after a deletion
const DELETED_NOTICES = {
  account: 'Your account was deleted. Your shop keeps the records you made, under "Removed user".',
  business: 'Your business and all of its data were permanently deleted.',
}

// The public home page. Logged-in users go straight to their products.
export function LandingPage() {
  const { session } = useAuth()
  const [searchParams] = useSearchParams()
  const pageRef = useRef<HTMLDivElement>(null)
  useReveal(pageRef)

  if (session) return <Navigate to="/products" replace />
  const deleted = searchParams.get('deleted')
  const notice = deleted === 'account' || deleted === 'business' ? DELETED_NOTICES[deleted] : null

  return (
    <div className="landing" ref={pageRef}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        {notice && (
          <div className="lp-notice" role="status">
            <div className="lp-wrap">{notice}</div>
          </div>
        )}
        <Hero />
        <Numbers />
        <HowItWorks />
        <Features />
        <WhoItsFor />
        <Faq />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  )
}

function SiteHeader() {
  const [open, setOpen] = useState(false)
  const menuId = useId()

  // Escape closes the mobile menu, like any other popup.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => setOpen(false)

  return (
    <header className="lp-header">
      <div className="lp-wrap lp-header__inner">
        <Link to="/" className="lp-brand" aria-label="StockWise home">
          <LogoMark size={36} />
          <span>StockWise</span>
        </Link>
        <button
          type="button"
          className="lp-menu-button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <nav id={menuId} className={`lp-nav${open ? ' lp-nav--open' : ''}`} aria-label="Main">
          <a href="#how" onClick={close}>
            How it works
          </a>
          <a href="#features" onClick={close}>
            Features
          </a>
          <a href="#faq" onClick={close}>
            FAQ
          </a>
          <Link to="/login" className="lp-nav__login">
            Log in
          </Link>
          <Link to="/signup" className="lp-btn lp-btn--primary lp-btn--small">
            Create your shop
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="hero-title">
      <div className="lp-wrap lp-hero__grid">
        <div className="lp-hero__copy">
          <p className="lp-eyebrow lp-eyebrow--light">Stock records for Rwanda's small shops</p>
          <h1 id="hero-title" className="lp-hero__title">
            Know what's on your shelves, and <span className="lp-highlight">prove it</span> to your lender.
          </h1>
          <p className="lp-hero__lead">
            Record every sale and delivery on your phone, count the shelf, and see straight away where stock went
            missing. When the bank asks how your business is doing, hand them a report built from your own records.
          </p>
          <div className="lp-hero__actions">
            <Link to="/signup" className="lp-btn lp-btn--amber">
              Create your shop, free
            </Link>
            <Link to="/login" className="lp-btn lp-btn--ghost">
              Log in
            </Link>
          </div>
          <p className="lp-hero__note">Runs in your phone's browser. Keeps working when the network drops.</p>
        </div>
        <div className="lp-hero__visual">
          <PhoneMockup />
        </div>
      </div>
    </section>
  )
}

const STATS = [
  {
    value: 53.5,
    decimals: 1,
    suffix: '%',
    text: "of Rwanda's 269,326 establishments are in wholesale and retail trade.",
    source: 'NISR, Establishment Census 2023',
  },
  {
    value: 65,
    decimals: 0,
    suffix: '%',
    text: 'of inventory records were wrong, even at a large retailer with computerised stock systems.',
    source: 'DeHoratius & Raman, 2008',
  },
  {
    value: 38,
    decimals: 0,
    suffix: '%',
    text: 'of Rwandan small businesses name access to finance as their biggest challenge.',
    source: 'Access to Finance Rwanda, 2025',
  },
  {
    value: 34.2,
    decimals: 1,
    suffix: '%',
    text: "of Rwandans use the internet, so a stock app has to keep working offline.",
    source: 'DataReportal, 2026',
  },
]

function Numbers() {
  return (
    <section className="lp-section lp-numbers" aria-labelledby="numbers-title">
      <div className="lp-wrap">
        <p className="lp-eyebrow">The problem, in numbers</p>
        <h2 id="numbers-title" className="lp-h2" data-reveal>
          Most shops run on memory and a notebook. Lenders need more than that.
        </h2>
        <ul className="lp-stats">
          {STATS.map((stat) => (
            <li key={stat.source} className="lp-stat" data-reveal>
              <span className="lp-stat__value">
                <CountUp value={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
              </span>
              <p className="lp-stat__text">{stat.text}</p>
              <p className="lp-stat__source">Source: {stat.source}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const STEPS: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: 'Record movements',
    text: 'Log each delivery, sale, return or damaged item in a few taps. Stock is worked out from these records.',
    icon: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
  },
  {
    title: 'Count the shelf',
    text: 'Type what you can see. The expected number only appears after you save, so nobody copies the record.',
    icon: <path d="M9 4h6v3H9zM7 5H5v16h14V5h-2M8 13l3 3 5-5" />,
  },
  {
    title: 'Investigate the gap',
    text: 'Every difference becomes an issue to explain: an unrecorded sale, damage, theft or a counting mistake.',
    icon: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5M11 8v4M11 15v.01" />,
  },
  {
    title: 'Show your lender',
    text: 'Download a PDF with your stock value in RWF, your count accuracy and how every issue was resolved.',
    icon: <path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7" />,
  },
]

function HowItWorks() {
  return (
    <section id="how" className="lp-section" aria-labelledby="how-title">
      <div className="lp-wrap">
        <p className="lp-eyebrow">How it works</p>
        <h2 id="how-title" className="lp-h2" data-reveal>
          Four habits that turn a busy shop into one a bank can read.
        </h2>
        <ol className="lp-steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="lp-step" data-reveal>
              <span className="lp-step__number" aria-hidden="true">
                {index + 1}
              </span>
              <Icon>{step.icon}</Icon>
              <h3 className="lp-h3">{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const FEATURES: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: 'Works offline',
    text: 'No network at the market? Movements and counts are saved on the phone and sent by themselves when you reconnect, never twice.',
    icon: <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01M3 3l18 18" />,
  },
  {
    title: 'Discrepancy investigation',
    text: 'When a count comes up short, you see the value lost in francs and record what really happened.',
    icon: <path d="M12 3l10 18H2zM12 10v5M12 18v.01" />,
  },
  {
    title: 'Owner approval',
    text: 'Staff explain a difference; only the owner can resolve it and correct the stock, so nothing changes quietly.',
    icon: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM8.5 12l2.5 2.5L15.5 10" />,
  },
  {
    title: 'Audit log',
    text: 'Every product change, movement, count and resolution is logged with who did it and when.',
    icon: <path d="M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />,
  },
  {
    title: 'Loan-readiness PDF',
    text: 'One download gives a lender your stock value, count accuracy and resolved issues for the dates you choose.',
    icon: <path d="M6 3h9l4 4v14H6zM15 3v4h4M12 11v6M9 14l3 3 3-3" />,
  },
  {
    title: 'Team roles',
    text: 'Give staff their own login to record sales and counts, while reports, approvals and the team stay with you.',
    icon: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6" />,
  },
]

function Features() {
  return (
    <section id="features" className="lp-section lp-features" aria-labelledby="features-title">
      <div className="lp-wrap">
        <p className="lp-eyebrow">Features</p>
        <h2 id="features-title" className="lp-h2" data-reveal>
          Everything you need to trust your stock numbers.
        </h2>
        <ul className="lp-cards">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="lp-card" data-reveal>
              <Icon>{feature.icon}</Icon>
              <h3 className="lp-h3">{feature.title}</h3>
              <p>{feature.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const AUDIENCES = [
  {
    place: 'Kimironko',
    title: 'The mini-mart',
    text: 'Hundreds of products, a helper on the till and deliveries every week. StockWise shows which shelf is losing money.',
  },
  {
    place: 'Nyabugogo',
    title: 'The market stall',
    text: 'Fast sales and a patchy signal. Record each sale as it happens and let the phone sync when it can.',
  },
  {
    place: 'Anywhere in Kigali',
    title: 'The growing shop',
    text: 'Ready to borrow for more stock? Show the lender clean records instead of a notebook and a promise.',
  },
]

function WhoItsFor() {
  return (
    <section className="lp-section lp-who" aria-labelledby="who-title">
      <div className="lp-wrap">
        <p className="lp-eyebrow">Who it's for</p>
        <h2 id="who-title" className="lp-h2" data-reveal>
          Built for the shops on your street.
        </h2>
        <ul className="lp-who__list">
          {AUDIENCES.map((audience) => (
            <li key={audience.title} className="lp-who__item" data-reveal>
              <span className="lp-who__place">{audience.place}</span>
              <h3 className="lp-h3">{audience.title}</h3>
              <p>{audience.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: 'Is StockWise free?',
    answer:
      'Yes. StockWise was built by Group 6 at African Leadership University to help small shops, and it costs nothing to create a shop and add your team.',
  },
  {
    question: 'Does it work without internet?',
    answer:
      'Recording movements and stock counts works offline. They are kept on your phone and sent automatically when you are back online, and each one is only ever saved once. You need a connection to log in, see reports and download the PDF.',
  },
  {
    question: 'What does my lender see?',
    answer:
      'Only what you choose to send them. Lenders have no login. You download the loan-readiness PDF, with your stock value, discrepancies, count accuracy and recent activity for the dates you pick, and share it yourself.',
  },
  {
    question: 'Is my data private?',
    answer:
      "Each shop only ever sees its own products, records and team, and the server checks this on every request. Staff can delete their own account, and an owner can permanently delete the whole business and all of its data at any time from the Account screen.",
  },
  {
    question: 'What do I need?',
    answer:
      'A phone with a web browser and an email address. There is nothing to install, though you can add StockWise to your home screen like an app.',
  },
]

function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()

  return (
    <section id="faq" className="lp-section lp-faq" aria-labelledby="faq-title">
      <div className="lp-wrap lp-faq__grid">
        <div>
          <p className="lp-eyebrow">FAQ</p>
          <h2 id="faq-title" className="lp-h2">
            Questions shop owners ask.
          </h2>
        </div>
        <div className="lp-accordion">
          {QUESTIONS.map((item, index) => {
            const open = openIndex === index
            const buttonId = `${baseId}-q${index}`
            const panelId = `${baseId}-a${index}`
            return (
              <div key={item.question} className="lp-accordion__item">
                <h3 className="lp-accordion__heading">
                  <button
                    type="button"
                    id={buttonId}
                    className="lp-accordion__button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(open ? null : index)}
                  >
                    {item.question}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </h3>
                <div id={panelId} role="region" aria-labelledby={buttonId} className="lp-accordion__panel" hidden={!open}>
                  <p>{item.answer}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="lp-cta" aria-labelledby="cta-title">
      <div className="lp-wrap lp-cta__inner" data-reveal>
        <h2 id="cta-title" className="lp-h2">
          Start with one shelf today.
        </h2>
        <p>Create your shop, add a few products and do your first count today.</p>
        <div className="lp-hero__actions">
          <Link to="/signup" className="lp-btn lp-btn--amber">
            Create your shop, free
          </Link>
          <Link to="/login" className="lp-btn lp-btn--ghost">
            Log in
          </Link>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer__inner">
        <Link to="/" className="lp-brand" aria-label="StockWise home">
          <LogoMark size={32} />
          <span>StockWise</span>
        </Link>
        <nav aria-label="Footer" className="lp-footer__links">
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
        </nav>
        <p className="lp-footer__credit">Built by Group 6, African Leadership University</p>
      </div>
    </footer>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="lp-icon" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  )
}
