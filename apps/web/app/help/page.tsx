export default function HelpPage() {
  return (
    <main className="page">
      <p className="eyebrow">Voter information</p>
      <h1>How voting works</h1>
      <p className="lede">
        This election is held online. Follow these steps and you can vote from
        any phone or computer with internet access.
      </p>

      <section className="card">
        <h2>Before you start</h2>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          <li>Find your <strong>member ID</strong> and your <strong>registered email or phone number</strong>.</li>
          <li>Keep a quiet, private space — remote voting cannot stop someone looking over your shoulder.</li>
          <li>Have a stable internet connection. Voting takes about two minutes.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Step by step</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          <li><strong>Find your election.</strong> Go to the Vote page and enter the organization code your election officer gave you, then pick your election.</li>
          <li><strong>Enter your member ID</strong> and ask for a verification code. It is sent to your registered email or phone and expires in 10 minutes.</li>
          <li><strong>Enter the code.</strong> This proves it is you and unlocks your ballot.</li>
          <li><strong>Make your choices</strong> for each position. You can abstain by leaving a position blank where allowed.</li>
          <li><strong>Review carefully</strong> — after you submit, your ballot cannot be changed.</li>
          <li><strong>Submit.</strong> You will receive a confirmation reference. It proves your ballot was accepted; it does not show how you voted.</li>
        </ol>
      </section>

      <section className="card">
        <h2>Is my vote secret?</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          Yes — as far as the software can guarantee. Your identity is used only
          to issue your one ballot and is cryptographically separated from your
          selections. No screen, report, or database record links you to your
          vote, and officials cannot see how you voted. The confirmation
          reference proves acceptance without revealing choices.
        </p>
        <p className="muted small" style={{ margin: '12px 0 0', lineHeight: 1.7 }}>
          Remote voting cannot prevent someone standing near you or pressuring
          you. If you are worried about that, step away and contact your
          election officer — reports are recorded in the audit log.
        </p>
      </section>

      <section className="card">
        <h2>Trouble voting?</h2>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          <li><strong>"No elections found."</strong> Check the organization code spelling, or ask your election officer.</li>
          <li><strong>Code not arriving.</strong> Check spam/junk, confirm your registered phone number, and request a new code — old codes expire.</li>
          <li><strong>"Already voted."</strong> One ballot per voter is enforced. If you did not vote, contact your election officer immediately with your member ID.</li>
          <li><strong>Page froze or connection dropped.</strong> Refresh and start again with your member ID — your ballot is only counted when you press Submit, and submitting twice is safe.</li>
          <li><strong>Lost your confirmation reference?</strong> Ask your election officer to check your submission status with a verified session.</li>
        </ul>
        <p className="muted small" style={{ margin: '12px 0 0' }}>
          You can also report coercion or irregularities to your election officer
          or an observer at any time — reports are recorded in the audit log.
        </p>
      </section>
    </main>
  );
}
