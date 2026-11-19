import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export default function NotFound() {
  return (
    <Empty title="Page not found" icon="🧭">
      <p className="muted">The page you are looking for does not exist.</p>
      <Link to="/" className="btn btn-primary">Go home</Link>
    </Empty>
  );
}
