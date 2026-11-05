import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="title-glow font-display text-8xl font-black">404</p>
      <p className="mt-2 text-slate-300">This realm does not exist.</p>
      <Link to="/" className="btn btn-primary mt-6">
        Return home
      </Link>
    </div>
  );
}
