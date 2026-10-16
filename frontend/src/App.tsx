import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { InboxPage } from './pages/InboxPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { RulesPage } from './pages/RulesPage';
import { PostsPage } from './pages/PostsPage';
import { TopicsPage } from './pages/TopicsPage';
import { ActivityPage } from './pages/ActivityPage';

function App() {
  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/posts" element={<PostsPage />} />
        </Routes>
      </AppShell>
    </Router>
  );
}

export default App;
