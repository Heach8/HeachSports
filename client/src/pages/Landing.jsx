import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';

// Platform tanitim sayfasi. Sirket marka bilgileri netlesince
// isim/logo/renkler buradan ve styles.css'ten guncellenecek.
const FEATURES = [
  { icon: '🏐', title: '4 Branş, Tek Platform', desc: 'Voleybol, plaj voleybolu, futbol ve basketbol — her branş kendi kurallarıyla: kart cezaları, faul limitleri, set formatları.' },
  { icon: '📊', title: 'Canlı Skor & İstatistik', desc: 'Saha görünümlü maç konsolundan tek dokunuşla istatistik girin; skorlar ve oyuncu istatistikleri anında sitede yayınlansın.' },
  { icon: '🏆', title: 'Her Turnuva Formatı', desc: 'Lig, gruplar + eleme, direkt eleme, rövanşlı eleme, kura usulü gruplar... Noter kurası desteğiyle çekilişi birebir işleyin.' },
  { icon: '📺', title: 'YouTube Yayın Desteği', desc: 'OBS uyumlu şeffaf skor bandı: goller, dakikalar ve asistler canlı yayınınızın üzerinde otomatik güncellenir.' },
  { icon: '🧾', title: 'Tahsilat & Fatura Takibi', desc: 'Katılım ücretlerini, ödemeleri ve fatura bilgilerini takip edin; muhasebe raporunu tek tıkla indirin.' },
  { icon: '👥', title: 'Kaptan & Onay Akışı', desc: 'Takım kaptanları kadrolarını kendileri girer, siz onaylarsınız. Kimlik doğrulamalı oyuncu eşleştirme ve kariyer istatistikleri.' }
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <div className="landing-hero">
        <img src="/logos/heach8-wordmark.svg" alt="Heach8 Sports" className="landing-logo" />
        <h1>Kurumsal Turnuva Yönetim Platformu</h1>
        <p className="landing-sub">
          Şirketler arası spor turnuvalarını uçtan uca yönetin: fikstür, canlı skor,
          oyuncu istatistikleri, yayın ekranları ve tahsilat — hepsi tek yerde.
        </p>
        <div className="landing-cta">
          {user ? (
            <>
              <Link className="btn primary big" to={['admin', 'super_admin'].includes(user.role) ? '/admin' : user.role === 'captain' ? '/kaptan' : '/konsol'}>Panele Git</Link>
              <Link className="btn big" to="/lig">Ligleri Görüntüle</Link>
            </>
          ) : (
            <>
              <Link className="btn primary big" to="/kayit">Ücretsiz Hesap Oluştur</Link>
              <Link className="btn big" to="/giris">Giriş Yap</Link>
              <Link className="btn big" to="/lig">Ligleri Keşfet</Link>
            </>
          )}
        </div>
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Üyelik ücretsizdir · Sezon açarken takım başına ücretlendirilir
        </p>
      </div>
      <div className="landing-grid">
        {FEATURES.map(f => (
          <div className="card landing-card" key={f.title}>
            <div className="landing-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p className="muted">{f.desc}</p>
          </div>
        ))}
      </div>
      <div className="landing-foot muted">
        Turnuva düzenleyen kurum ve kişiler için geliştirilmiştir.
      </div>
    </div>
  );
}
