import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import IdentityPage from './pages/IdentityPage';
import RegisterIdentityPage from './pages/RegisterIdentityPage';
import AssetsPage from './pages/AssetsPage';
import AssetDetailPage from './pages/AssetDetailPage';
import IssueAssetPage from './pages/IssueAssetPage';
import VerifyAssetPage from './pages/VerifyAssetPage';
import ShareCredentialPage from './pages/ShareCredentialPage';
import SchemasPage from './pages/SchemasPage';
import AuditPage from './pages/AuditPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/identity" element={<IdentityPage />} />
            <Route path="/identity/register" element={<RegisterIdentityPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/:tokenId" element={<AssetDetailPage />} />
            <Route path="/assets/issue" element={<IssueAssetPage />} />
            {/* Verify: /verify (hash mode) or /verify/vp?token=... (VP mode) */}
            <Route path="/verify" element={<VerifyAssetPage />} />
            <Route path="/verify/vp" element={<VerifyAssetPage />} />
            {/* Share: authenticated holders generate VPs */}
            <Route path="/share" element={<ShareCredentialPage />} />
            <Route path="/schemas" element={<SchemasPage />} />
            <Route path="/schemas/create" element={<SchemasPage createMode={true} />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
