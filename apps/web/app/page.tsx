import Link from 'next/link';
import ElectionAccess from '../components/election-access';

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">VoteMax by ClaMax Group</p>
            <h1>Your Vote. Your Voice. Your Future.</h1>
            <p className="lede">
              A secure and transparent election platform that helps organizations
              conduct elections, manage voters, and verify election results.
            </p>
            <div className="hero-actions">
              <Link href="/vote" className="btn btn-primary btn-lg">Vote in an Election</Link>
              <Link href="/help" className="btn btn-secondary btn-lg">How Voting Works</Link>
            </div>
          </div>
          <ElectionAccess />
        </div>
      </section>

      <section className="container page">
        <div className="section">
          <p className="eyebrow">Trust and security</p>
          <h2>Built for accountable elections</h2>
          <p className="lede" style={{ marginBottom: 22 }}>
            VoteMax is designed around controls election officers and observers can
            verify. The platform is still in pilot preparation, and live election
            authorization remains subject to the documented readiness gates.
          </p>
          <div className="trust-grid">
            <div className="trust-item"><strong>Voter eligibility verification</strong><p>Only voters on the approved register can request a ballot.</p></div>
            <div className="trust-item"><strong>Ballot secrecy</strong><p>Ballots are encrypted and stored without voter linkage.</p></div>
            <div className="trust-item"><strong>Duplicate-vote prevention</strong><p>Each eligible voter can cast one ballot per election.</p></div>
            <div className="trust-item"><strong>Controlled lifecycle</strong><p>Tally, verification, certification, and publication follow dedicated workflows.</p></div>
            <div className="trust-item"><strong>Auditable processes</strong><p>Administrative and election events are recorded in a tamper-evident audit log.</p></div>
            <div className="trust-item"><strong>Independent verification</strong><p>Tally evidence and certified reports can be reviewed by authorized auditors.</p></div>
          </div>
        </div>

        <div className="section" style={{ textAlign: 'center' }}>
          <h2>Ready to participate?</h2>
          <p className="muted">Election officers can manage registers, ballots, results, and audit evidence from the administration console.</p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link href="/vote" className="btn btn-primary">Vote in an Election</Link>
            <Link href="/admin" className="btn btn-secondary">Open Administration</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
