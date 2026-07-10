# NCL Kurumsal Voleybol Turnuvası Platformu

Şirketler arası voleybol turnuvası yönetim sistemi. Takım/oyuncu yönetimi, admin onay akışı, fikstür, canlı maç konsolu, anlık skor yayını ve istatistikler.

## Teknolojiler
- **Frontend:** React 18 + Vite + React Router (client/)
- **Backend:** Node.js + Express (server/)
- **Veritabanı:** SQLite — Node 22'nin yerleşik `node:sqlite` modülü, ekstra kurulum gerektirmez
- **Canlı yayın:** Server-Sent Events (SSE)

> Gereksinim: **Node.js 22 veya üzeri**

## Veritabanı: Supabase (PostgreSQL) veya SQLite
Sunucu, `server/.env` dosyasındaki `DATABASE_URL` değerine bakar:
- **Doluysa:** Supabase/PostgreSQL kullanılır. Tablolar ilk çalıştırmada otomatik oluşturulur; `npm run seed` ve `npm run demo` aynı şekilde çalışır.
- **Boşsa:** Yerel SQLite dosyası kullanılır (`server/data/ncl.sqlite`) — kurulumsuz geliştirme için.

Notlar:
- Doğrudan bağlantı (`db.<proje>.supabase.co:5432`) IPv6 gerektirir. Bağlantı zaman aşımı alırsanız Dashboard > Database > Connection string bölümündeki **Session pooler** adresini kullanın (.env içinde örneği var).
- `.env` dosyası gizli bilgiler içerir: asla git'e eklemeyin (.gitignore'da hazır).
- Supabase verilerini sıfırlamak için SQL Editor'da tabloları silin (`drop table stat_events, match_sets, penalties, matches, players, users, teams, seasons, settings cascade;`) ve seed'i yeniden çalıştırın.

## Kurulum

```bash
# 1) Sunucu
cd server
npm install
npm run seed     # örnek verilerle veritabanını oluşturur
npm run demo     # (opsiyonel) oynanmış maçlar + canlı maç içeren demo turnuva
npm start        # http://localhost:3001

# 2) Arayüz (geliştirme modu, ayrı terminalde)
cd client
npm install
npm run dev      # http://localhost:5173 (api istekleri 3001'e yönlenir)
```

**Production:** `cd client && npm run build` sonrası sunucu, `client/dist` klasörünü otomatik sunar; tek başına `http://localhost:3001` yeterli olur. (Hazır build dahildir.)

> Kolay yol (Windows): proje kökündeki **basla.bat** her şeyi tek tıkla yapar (kurulum + seed + demo + başlatma).

## Demo hesaplar (seed sonrası)
| Rol | E-posta | Şifre |
|---|---|---|
| Süper Admin | admin@ncl.com | admin123 |
| Masa Görevlisi | hakem@ncl.com | hakem123 |
| Kaptanlar | kaptan1@ncl.com … kaptan4@ncl.com | kaptan123 |

Veritabanını sıfırlamak için `server/data/ncl.sqlite` dosyasını silip `npm run seed` çalıştırın.

## İnternete Açma (Deploy)
Bu uygulama **sürekli çalışan bir Node sunucusu** gerektirir. Vercel/Netlify gibi serverless platformlar uygun DEĞİLDİR (canlı skor bağlantısı ve oturumlar kopar). Önerilen: **Render.com** (ücretsiz plan yeterli):

1. https://render.com — GitHub ile giriş yapın
2. **New → Blueprint** → bu depoyu seçin (repo kökündeki `render.yaml` otomatik algılanır)
3. Sorulduğunda `DATABASE_URL` değerine Supabase bağlantı adresinizi yapıştırın
4. Deploy bitince `https://ncl-turnuva.onrender.com` benzeri adres hazır olur

Notlar:
- Ücretsiz planda 15 dk hareketsizlikte uyur, ilk istekte ~30 sn'de uyanır.
- Yüklenen fotoğraflar yeniden deploy'da silinir (kalıcılık için ileride Supabase Storage'a taşınabilir).
- `server/.env` ASLA GitHub'a yüklenmemelidir — bağlantı bilgisi Render panelindeki ortam değişkeninden verilir.

## Roller
- **Süper Admin:** Her şey + admin oluşturma
- **Admin:** Onay kuyruğu, takım/kullanıcı/fikstür/ceza yönetimi, ayarlar
- **Masa Görevlisi:** Sadece canlı maç konsolu (sayı, set, MVP girişi)
- **Kaptan:** Sadece kendi takımının oyuncularını ekler/düzenler
- **Ziyaretçi:** Puan durumu, fikstür, canlı skor, profiller, liderler

## Özellikler
- **Onay akışı:** Kaptanın eklediği oyuncu "onay bekliyor" durumuna düşer; admin onaylayınca yayınlanır. Onaylı oyuncudaki her değişiklik ve silme talebi de admin onayından geçer.
- **Oyuncu uygunluk kontrolü:** Açıkken kaptan, oyuncunun şirket çalışanı olduğunu gösteren belge yüklemek zorundadır. Yönetim > Ayarlar'dan kapatılabilir.
- **KVKK:** Oyuncu eklerken açık rıza onayı zorunludur.
- **Fikstür & Formatlar:** Sezon açılırken turnuva formatı seçilir (tüm branşlar): **Lig usulü** (tek/çift devreli round-robin), **Gruplar + Eleme** (kura otomatik çekilir, grup maçları bitince eleme fikstürü A1-B2/B1-A2 çaprazıyla kendiliğinden kurulur) veya **Direkt Eleme** (kazananlar otomatik üst tura yazılır; takım sayısı 2'nin kuvveti değilse ön eleme + bay sistemi). Eleme maçlarında beraberlik engellenir; turlar Çeyrek Final/Yarı Final/Final olarak etiketlenir. Futbol elemelerinde beraberlikte **uzatma devresi** eklenebilir ve **penaltı serisi** girilebilir (seri skoru maç skoruna/istatistiklere karışmaz, sadece kazananı belirler). Turnuva ayarıyla elemeler **rövanşlı** (iki maçlı) yapılabilir: kazanan toplam skorla belirlenir, toplam eşitse rövanş maçının penaltıları geçerlidir.
- **Canlı konsol (saha görünümü):** Oyuncular saha üzerinde kart olarak durur, sürükle-bırak ile dizilime göre yerleştirilir (konumlar hatırlanır). Her oyuncu kartının altındaki butonlarla tek dokunuşta istatistik girilir: hücum/as/blok (sayı yazar), dig, karşılama ✓/✗. Geri alma, set/periyot bitirme, uzatma ve MVP seçimi mevcut.
- **Savunma istatistikleri:** Dig (savunma) ve servis karşılama başarı oranı (as savunması) oyuncu bazında tutulur; liderler sayfasında "Savunma" ve "Karşılama Oranı %" sıralamaları vardır.
- **Canlı yayın:** Public maç sayfası ve tam ekran skorboard (`/scoreboard/:id`) SSE ile anlık güncellenir — salondaki ekrana yansıtılabilir.
- **Puan durumu:** TVF kuralları (3-0/3-1 → 3-0 puan, 3-2 → 2-1 puan), set ve sayı oranı tie-break.
- **İstatistikler:** Skor krallığı, hücum, servis, blok liderleri; oyuncu profillerinde sezon istatistikleri ve MVP sayısı.
- **Disiplin:** Sarı/kırmızı kart ve men cezası kaydı, oyuncu profilinde görünür.
- **Futbol kuralları:** Turnuva açılırken kart kuralları belirlenir: kaç sarı kartta 1 maç ceza (2/3/4 veya kapalı) ve kırmızı kartın sonraki maç cezası (aç/kapa). Cezalı oyuncular maç konsolunda otomatik işaretlenir, sahaya dizilemez ve istatistik girilemez. Goller şekliyle kaydedilir (sağ/sol ayak, kafa, penaltı) ve asist bağlanır; maç detayında gol listesi, liderlerde gol krallığı ve asist sıralaması görünür.
- **Basketbol kuralları:** Turnuva açılırken faul limiti (5/6 faul = oyun dışı, kapatılabilir) ve periyot formatı (4 çeyrek / 2 devre) seçilir. Faul limitini dolduran oyuncu konsolda "OYUN DIŞI" işaretlenir ve istatistik girilemez; aktif periyottaki takım faulleri sayılır, 5 faulde BONUS göstergesi yanar. İstatistikler: sayı (1/2/3), ribaund, asist, top çalma, blok, faul; liderlerde 6 kategori.
- **Çoklu branş:** Voleybol, plaj voleybolu (2 kişilik, 21 sayılık set, 3 set üzerinden), futbol ve basketbol; her branşın kendi sezonu, kuralları, istatistik türleri ve NCL logosu varyantı vardır.
- **İlk giriş güvenliği:** Admin geçici şifreyle kullanıcı açar; kullanıcı ilk girişte şifresini iki kez girerek (eşleşme kontrolüyle) değiştirmek zorundadır.
- **Kimlik eşleştirme & kariyer:** Oyuncu kaydında T.C. kimlik no alınır (algoritma doğrulamalı). Numara açık halde SAKLANMAZ; geri döndürülemez özet (HMAC) olarak tutulur ve yalnızca aynı kişinin farklı turnuvalardaki kayıtlarını eşleştirmekte kullanılır. Oyuncu profilinde "Turnuva Geçmişi" tablosu turnuva turnuva istatistik ve kariyer toplamı gösterir. Aynı kimlik no aynı sezonda ikinci kez kaydedilemez (çift takım engeli).

## Proje yapısı
```
server/src/
  index.js          Express uygulaması, statik sunum
  db.js             Şema + şifreleme + ayarlar
  seed.js           Örnek veri
  auth.js           Giriş/oturum + rol middleware'leri
  routes-public.js  Herkese açık uçlar (puan durumu, fikstür, profiller...)
  routes-captain.js Kaptan uçları (oyuncu CRUD + onay akışı)
  routes-admin.js   Admin uçları (onay, takım, kullanıcı, fikstür, ceza, ayarlar)
  routes-live.js    Canlı maç motoru (sayı/set/geri al/bitir)
  live.js           SSE hub
  standings.js      Puan durumu hesaplama
client/src/
  App.jsx           Rotalar + navigasyon + auth context
  api.js            Fetch + SSE yardımcıları
  pages/            Tüm sayfalar
```

## Yol haritası (sonraki adımlar)
- Futbol ve basketbol modülleri (ortak çekirdek hazır; branşa özel sayı/istatistik türleri eklenecek)
- Sezon arşivi ekranı ve "tüm zamanlar" istatistikleri
- Men cezalı oyuncular için otomatik uyarı
- Maç fotoğraf galerisi
- Production için: HTTPS, kalıcı session store, `SESSION_SECRET` ortam değişkeni
