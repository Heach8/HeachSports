import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import Home from './pages/Home.jsx';
import Standings from './pages/Standings.jsx';
import Fixtures from './pages/Fixtures.jsx';
import Teams from './pages/Teams.jsx';
import TeamDetail from './pages/TeamDetail.jsx';
import PlayerDetail from './pages/PlayerDetail.jsx';
import Leaders from './pages/Leaders.jsx';
import MatchDetail from './pages/MatchDetail.jsx';
import Scoreboard from './pages/Scoreboard.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import CaptainPanel from './pages/CaptainPanel.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import ConsoleList from './pages/ConsoleList.jsx';
import LiveConsole from './pages/LiveConsole.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const SportCtx = createContext(null);
export const useSport = () => useContext(SportCtx);

const SPORT_ICONS = { volleyball: '🏐', beach_volleyball: '🏖️', football: '⚽', basketball: '🏀' };

export default function App() {
  const [user, setUser] = useState(undefined);
  const [sports, setSports] = useState([]);
  const [sport, setSportState] = useState(localStorage.getItem('ncl_sport') || 'volleyball');
  const navigate = useNavigate();

  const setSport = (s) => { localStorage.setItem('ncl_sport', s); setSportState(s); };

  useEffect(() => {
    api('/auth/me').then(d => setUser(d.user)).catch(() => setUser(null));
    api('/sports').then(d => setSports(d.sports));
  }, []);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/');
  };

  const isAdmin = user && ['admin', 'super_admin'].includes(user.role);
  const isScorer = user && ['scorekeeper', 'admin', 'super_admin'].includes(user.role);

  // Ilk giriste zorunlu sifre degistirme: baska hicbir sayfaya izin verme
  if (user?.must_change_password) {
    return (
      <AuthCtx.Provider value={{ user, setUser }}>
        <div className="container"><ChangePassword forced /></div>
      </AuthCtx.Provider>
    );
  }

  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      <SportCtx.Provider value={{ sport, setSport, sports }}>
        <Routes>
          <Route path="/scoreboard/:id" element={<Scoreboard />} />
          <Route path="*" element={
            <>
              <nav className="nav">
                <NavLink to="/" className="brand">
                  <img className="brandlogo" src={`/logos/ncl-${sport}.svg`} alt="NCL - National Corporate League" />
                </NavLink>
                <div className="sportpills">
                  {sports.map(s => (
                    <button key={s.key} className={sport === s.key ? 'active' : ''} onClick={() => setSport(s.key)}>
                      {SPORT_ICONS[s.key]} {s.label}
                    </button>
                  ))}
                </div>
                <span className="spacer" />
                <NavLink to="/" end>Ana Sayfa</NavLink>
                <NavLink to="/puan-durumu">Puan Durumu</NavLink>
                <NavLink to="/fikstur">Fikstür</NavLink>
                <NavLink to="/takimlar">Takımlar</NavLink>
                <NavLink to="/liderler">Liderler</NavLink>
                {user?.role === 'captain' && <NavLink to="/kaptan">Kaptan Paneli</NavLink>}
                {isScorer && <NavLink to="/konsol">Maç Konsolu</NavLink>}
                {isAdmin && <NavLink to="/admin">Yönetim</NavLink>}
                {user ? (
                  <>
                    <span className="user">{user.name}</span>
                    <button className="btn sm" onClick={logout}>Çıkış</button>
                  </>
                ) : (
                  <NavLink to="/giris">Giriş</NavLink>
                )}
              </nav>
              <div className="container">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/puan-durumu" element={<Standings />} />
                  <Route path="/fikstur" element={<Fixtures />} />
                  <Route path="/takimlar" element={<Teams />} />
                  <Route path="/takim/:id" element={<TeamDetail />} />
                  <Route path="/oyuncu/:id" element={<PlayerDetail />} />
                  <Route path="/liderler" element={<Leaders />} />
                  <Route path="/mac/:id" element={<MatchDetail />} />
                  <Route path="/giris" element={<Login />} />
                  <Route path="/sifre-degistir" element={<ChangePassword />} />
                  <Route path="/kaptan" element={<CaptainPanel />} />
                  <Route path="/admin" element={<AdminPanel />} />
                  <Route path="/konsol" element={<ConsoleList />} />
                  <Route path="/konsol/:id" element={<LiveConsole />} />
                </Routes>
              </div>
            </>
          } />
        </Routes>
      </SportCtx.Provider>
    </AuthCtx.Provider>
  );
}
