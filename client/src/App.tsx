import { HomePage } from './pages/HomePage';
import { ResourcesPage } from './pages/ResourcesPage';
import './styles.css';

export default function App() {
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="ChangeLens home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ChangeLens</span>
        </a>
        <nav className="topbar-nav"><a href="#resources">Resources</a><span className="topbar-label">Platform foundation</span></nav>
      </header>
      <HomePage />
      <ResourcesPage />
    </>
  );
}
