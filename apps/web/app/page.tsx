import Link from 'next/link';
import ElectionAccess from '../components/election-access';
import { Icon } from '../components/icons';

const FEATURES = [
  { icon: 'users', title: 'Voter eligibility verification', text: 'Only voters on the approved register can request a ballot, confirmed with a one-time code.' },
  { icon: 'lock', title: 'Ballot secrecy', text: 'Ballots are encrypted and stored with no link back to the voter who cast them.' },
  { icon: 'check', title: 'Duplicate-vote prevention', text: 'Each eligible voter can cast exactly one ballot per election — enforced atomically.' },
  { icon: 'sliders', title: 'Controlled lifecycle', text: 'Tally, verification, certification and publication follow dedicated multi-party workflows.' },
  { icon: 'filetext', title: 'Auditable processes', text: 'Every administrative and election event lands in a tamper-evident, hash-chained audit log.' },
  { icon: 'shield', title: 'Independent verification', text: 'Tally evidence and certified reports can be reviewed by authorized auditors.' },
];

const STEPS = [
  { title: 'Set up your election', text: 'Create positions and candidates, set the voting window and import your voter register from a CSV.' },
  { title: 'Invite your voters', text: 'Email every eligible voter their member ID and voting link. Reminders go out automatically.' },
  { title: 'Count, verify, certify', text: 'Run a separated-duty tally, verify it independently, certify and publish the results.' },
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="hero-badge"><i />VoteMax by ClaMax Group</span>
            <h1>Your Vote. Your Voice. Your Future.</h1>
            <p className="lede">
              A secure and transparent election platform that helps organizations
              conduct elections, manage voters, and verify election results.
            </p>
            <div className="hero-actions">
              <Link href="/vote" className="btn btn-primary btn-lg">Vote in an Election <Icon name="arrow" size={18} /></Link>
              <Link href="/help" className="btn btn-secondary btn-lg">How Voting Works</Link>
            </div>
            <div className="hero-chips">
              <span><Icon name="check" size={16} />Secret ballots</span>
              <span><Icon name="check" size={16} />Audit trail</span>
              <span><Icon name="check" size={16} />MFA for staff</span>
            </div>
          </div>
          <ElectionAccess />
        </div>
      </section>

      <div className="container">
        <section className="home-section">
          <div className="section-head">
            <p className="eyebrow">Trust and security</p>
            <h2>Built for accountable elections</h2>
            <p>
              VoteMax is designed around controls election officers and observers can
              verify. The platform is still in pilot preparation, and live election
              authorization remains subject to the documented readiness gates.
            </p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature">
                <span className="feature-icon"><Icon name={f.icon} size={22} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>From register to certified result</h2>
            <p>One guided workflow for election officers — and a two-minute experience for voters.</p>
          </div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className="step">
                <span className="step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <h2>Ready to participate?</h2>
          <p>Have your member ID and a phone or email from your organization&apos;s voter register.</p>
          <Link href="/vote" className="btn btn-primary btn-lg">Vote in an Election</Link>
        </section>
      </div>
    </main>
  );
}
