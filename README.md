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

## Çoklu Müşteri (Organizasyon) Mimarisi
Platform artık **çok kiracılıdır**: her müşteri bir "organizasyon"dur ve sezonları, takımları, kullanıcıları, ayarları ve tahsilatı tamamen ayrıdır. Public sitede üst menüdeki organizasyon seçici ile müşteriler arasında geçilir (`?org=slug`). Organizasyon adminleri yalnızca kendi verilerini görür/yönetir; platform süper admini seçiciyle tüm müşterileri yönetir ve Yönetim > Organizasyonlar'dan yeni müşteri açar. Puan durumu ve fikstürde **sezon arşivi** seçicisi vardır: biten turnuvalar tablo/fikstür/şampiyonuyla görüntülenebilir.

**Platform iş modeli:** Üyelik (organizasyon) ücretsizdir; **sezon açmak takım başı ücretlidir**. Süper admin, Yönetim > Platform'dan takım başı fiyatı belirler (0 = ücretsiz mod). Müşteri sezon açarken takım kontenjanı ve ödeme yöntemi seçer: **Havale/Nakit** seçilirse sezon "Onay Bekliyor" durumuna düşer ve süper admin Platform ekranından "Ödeme Alındı — Onayla" diyene kadar kullanılamaz (aktifleştirilemez, takım eklenemez); **Kredi Kartı** seçilirse ödeme sistemden alınır ve sezon anında açılır (şu an test modunda; sanal POS bilgileriyle iyzico/PayTR bağlanmaya hazır). Kontenjan aşılırsa takım eklenemez. Tüm platform ödemeleri süper adminin ödeme geçmişinde izlenir. Süper admin, Kullanıcılar ekranından başka e-postalara da süper admin yetkisi verebilir.

**Satış demosu:** Temiz kurulumda (basla.bat) iki örnek müşteri gelir — *Marmara Şirketler Ligi* (voleybol: 2025 arşiv sezonu bitmiş + 2026 sezonu canlı maçla devam ediyor) ve *Ege Kurumsal Turnuvaları* (futbol: kupa arşivi + devam eden lig, canlı maçlı). Girişler: platform sahibi `admin@adminim.com/admin123`, Marmara `marmara@ncl.com/admin123`, Ege `admin@ncl.com` veya `ege@ncl.com` /admin123.

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
- **Fikstür & Formatlar:** Sezon açılırken turnuva formatı seçilir (tüm branşlar): **Lig usulü** (tek/çift devreli round-robin), **Gruplar + Eleme** (kura otomatik veya noter çekimiyle; grup maçları bitince eleme fikstürü klasik çaprazla — 2 grupta A1-B(son), A2-B(son-1)... — kendiliğinden kurulur; gruptan ilk 1-4 takım çıkabilir). Grup aşaması **tam lig** ya da **kura usulü** olabilir: "takım başı N maç" seçilirse her takım gruptan kurayla belirlenen N farklı rakiple oynar — büyük gruplar için idealdir (örn. 28 takım = 2×14 grup, takım başı 4 maç, ilk 4'ler çeyrek finale). Sistem eşit maç dağılımını, aynı eşleşmenin tekrarlanmamasını ve haftalık çakışmasızlığı garanti eder veya **Direkt Eleme** (kazananlar otomatik üst tura yazılır; takım sayısı 2'nin kuvveti değilse ön eleme + bay sistemi). **Noter kurası desteği:** Fikstür ekranında "Manuel kura (noter çekimi)" modu seçilirse sistem kura çekmez; noter torbadan çektikçe operatör ekranda o takıma tıklar (grup formatında önce hedef grup seçilir), canlı önizleme eşleşmeleri gösterir, "Son Çekimi Geri Al" ile hata düzeltilir ve fikstür çekilen kuraya birebir göre kurulur — lig, gruplu ve elemeli (rövanşlı dahil) tüm formatlarda. Eleme maçlarında beraberlik engellenir; turlar Çeyrek Final/Yarı Final/Final olarak etiketlenir. Futbol elemelerinde beraberlikte **uzatma devresi** eklenebilir ve **penaltı serisi** girilebilir (seri skoru maç skoruna/istatistiklere karışmaz, sadece kazananı belirler). Turnuva ayarıyla elemeler **rövanşlı** (iki maçlı) yapılabilir: kazanan toplam skorla belirlenir, toplam eşitse rövanş maçının penaltıları geçerlidir.
- **Canlı konsol (saha görünümü):** Oyuncular saha üzerinde kart olarak durur, sürükle-bırak ile dizilime göre yerleştirilir (konumlar hatırlanır). Her oyuncu kartının altındaki butonlarla tek dokunuşta istatistik girilir: hücum/as/blok (sayı yazar), dig, karşılama ✓/✗. Geri alma, set/periyot bitirme, uzatma ve MVP seçimi mevcut.
- **Savunma istatistikleri:** Dig (savunma) ve servis karşılama başarı oranı (as savunması) oyuncu bazında tutulur; liderler sayfasında "Savunma" ve "Karşılama Oranı %" sıralamaları vardır.
- **Canlı yayın:** Public maç sayfası ve tam ekran skorboard (`/scoreboard/:id`) SSE ile anlık güncellenir — salondaki ekrana yansıtılabilir.
- **YouTube/OBS yayın overlay'i:** `/overlay/:macId` adresi şeffaf arka planlı, TV tarzı kompakt skor bandı verir; skor konsoldan girildikçe yayında anlık güncellenir. Kurulum: OBS > Kaynaklar > **+** > **Tarayıcı (Browser Source)** > URL'ye overlay adresini yapıştırın, Genişlik 900 / Yükseklik 140 yapın, kaynağı yayın sahnesinde istediğiniz köşeye taşıyın. Adres, maç konsolundaki **📺 Yayın Skoru (OBS)** butonuyla tek tıkla kopyalanır. Futbolda skorun altında iki takımın golleri dakikalarıyla listelenir (periyot içi dakika: "1Y 23'"), yeni gol anında 8 saniyelik asistli **GOL!** bandı çıkar; bantta turnuvanın NCL amblemi de yer alır. Önerilen kaynak boyutu: 900 x 320. vMix vb. kullananlar için ham veri: `/api/live/:macId/state` (JSON).
- **Puan durumu:** TVF kuralları (3-0/3-1 → 3-0 puan, 3-2 → 2-1 puan), set ve sayı oranı tie-break.
- **İstatistikler:** Skor krallığı, hücum, servis, blok liderleri; oyuncu profillerinde sezon istatistikleri ve MVP sayısı.
- **Tahsilat & Fatura:** Sezon açılırken (veya sonradan) takım başı katılım ücreti tanımlanır. Yönetim > Tahsilat ekranında: beklenen/tahsil edilen/kalan özetleri, takım bazında ödeme durumu (Ödendi/Kısmi/Bekliyor), kısmi ödeme kayıtları (havale/nakit/kart, tarih, fatura no), takımların fatura bilgileri (ünvan, vergi dairesi/no, adres, e-posta) ve tek tıkla muhasebe CSV raporu (Excel'de açılır; e-fatura programına aktarım için hazır). Not: e-Fatura/e-Arşiv kesimi GİB entegratörü üzerinden yapılır; müşterinin kullandığı program (Paraşüt, Logo vb.) netleşince API entegrasyonu eklenebilir — veri modeli hazırdır.
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
