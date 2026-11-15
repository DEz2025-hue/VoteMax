import Link from 'next/link';
import { Icon } from '../components/icons';

export default function NotFound() {
  return (
    <main className="status-page">
      <div className="status-card">
        <span className="status-icon"><Icon name="help" size={26} /></span>
        <h1>We couldn&apos;t find that page</h1>
        <p className="lede">The link may be out of date or mistyped. Here&apos;s where you can go from here.</p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <Link href="/vote" className="btn btn-primary">Vote in an election</Link>
          <Link href="/" className="btn btn-secondary">Home</Link>
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
