import Link from 'next/link';
import { Icon } from '../../components/icons';

export default function HelpPage() {
  return (
    <main className="help-shell">
      <div className="help-hero">
        <p className="eyebrow">Voter information</p>
        <h1>How voting works</h1>
        <p className="lede">
          This election is held online. Follow these steps and you can vote from
          any phone or computer with internet access — it takes about two minutes.
        </p>
      </div>

      <div className="help-cards">
        <Link href="/vote" className="help-card">
          <span className="feature-icon"><Icon name="ballot" size={20} /></span>
          <strong>Ready to vote?</strong>
          <span>Go to the voting page and find your election.</span>
        </Link>
        <a href="#secret" className="help-card">
          <span className="feature-icon"><Icon name="lock" size={20} /></span>
          <strong>Is my vote secret?</strong>
          <span>How your ballot is kept private.</span>
        </a>
        <a href="#trouble" className="help-card">
          <span className="feature-icon"><Icon name="help" size={20} /></span>
          <strong>Having trouble?</strong>
          <span>Fixes for the most common problems.</span>
        </a>
      </div>

      <details className="faq" open>
        <summary>Before you start</summary>
        <div className="faq-body">
          <ul>
            <li>Find your <strong>member ID</strong> and your <strong>registered email or phone number</strong>.</li>
            <li>Keep a quiet, private space — remote voting cannot stop someone looking over your shoulder.</li>
            <li>Have a stable internet connection. Voting takes about two minutes.</li>
          </ul>
        </div>
      </details>

      <details className="faq" open>
        <summary>Step by step</summary>
        <div className="faq-body">
          <ol>
            <li><strong>Find your election.</strong> Go to the Vote page and enter the organization code your election officer gave you, then pick your election.</li>
            <li><strong>Enter your member ID</strong> and ask for a verification code. It is sent to your registered email or phone and expires in 10 minutes.</li>
            <li><strong>Enter the code.</strong> This proves it is you and unlocks your ballot.</li>
            <li><strong>Make your choices</strong> for each position. You can abstain by leaving a position blank where allowed.</li>
            <li><strong>Review carefully</strong> — after you submit, your ballot cannot be changed.</li>
            <li><strong>Submit.</strong> You will receive a confirmation reference. It proves your ballot was accepted; it does not show how you voted.</li>
          </ol>
        </div>
      </details>

      <details className="faq" id="secret">
        <summary>Is my vote secret?</summary>
        <div className="faq-body">
          <p>
            Yes — as far as the software can guarantee. Your identity is used only
            to issue your one ballot and is cryptographically separated from your
            selections. No screen, report, or database record links you to your
            vote, and officials cannot see how you voted. The confirmation
            reference proves acceptance without revealing choices.
          </p>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Remote voting cannot prevent someone standing near you or pressuring
            you. If you are worried about that, step away and contact your
            election officer — reports are recorded in the audit log.
          </p>
        </div>
      </details>

      <details className="faq" id="trouble">
        <summary>Trouble voting?</summary>
        <div className="faq-body">
          <ul>
            <li><strong>&quot;No elections found.&quot;</strong> Check the organization code spelling, or ask your election officer.</li>
            <li><strong>Code not arriving.</strong> Check spam/junk, confirm your registered phone number, and request a new code — old codes expire.</li>
            <li><strong>&quot;Already voted.&quot;</strong> One ballot per voter is enforced. If you did not vote, contact your election officer immediately with your member ID.</li>
            <li><strong>Page froze or connection dropped.</strong> Refresh and start again with your member ID — your ballot is only counted when you press Submit, and submitting twice is safe.</li>
            <li><strong>Lost your confirmation reference?</strong> Ask your election officer to check your submission status with a verified session.</li>
          </ul>
          <p className="muted small" style={{ margin: '12px 0 0' }}>
            You can also report coercion or irregularities to your election officer
            or an observer at any time — reports are recorded in the audit log.
          </p>
        </div>
      </details>
    </main>
  );
}
