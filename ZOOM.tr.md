# Zoom (web): teknik notlar

[English](ZOOM.md) · **Türkçe**

Live Interpreter (Türkçe arayüzde Canlı Tercüman) **tarayıcıdaki Zoom** ile çalışır: web istemcisi (`app.zoom.us/wc/…` ya da bir şirketin kendi `ad.zoom.us/wc/…` adresi); Zoom'un web uygulaması onu `app.zoom.us/wc/home` sayfasından açar. Masaüstü Zoom uygulaması desteklenmez: tarayıcı eklentileri yalnızca tarayıcıda çalışır. Kurulum: [SETUP.tr.md](SETUP.tr.md), 8. adım. Meet ve Teams: [MEET.tr.md](MEET.tr.md), [TEAMS.tr.md](TEAMS.tr.md).

> **Durum:** gerçek bir Zoom görüşmesinde iki yönlü çeviri kullanıldı (2.5.0 sürümü, Brave sekmesinde Zoom'un web uygulaması, Türkçe ve İngilizce); çevrilmiş ses karşı tarafa ulaştı; Zoom'da sessize alınca (İngilizce arayüz) karşıya hiçbir şey gitmedi. Aşağıdaki "Doğrulanmamış noktalar" henüz kontrol ediliyor. Önemli bir toplantıdan önce deneme görüşmesi yapın.

## Zoom'a erişim

Zoom manifestte yer almaz. Eklenti `https://*.zoom.us/*` erişimini bir Zoom sekmesinde ilk kez çeviri başlatıldığında ister; böylece Zoom kullanmayan kimse yeni bir izin görmez.

- **`src/popup/popup.js`:** açılır pencere izni **Çeviriyi başlat** tıklamasıyla ister, ardından **Sekmeyi yenile** düğmesini gösterir.
- **`src/background/service-worker.js` → `syncSiteScripts`:** izin verilince sayfa kancası ve köprü `https://*.zoom.us/wc/*` için kaydedilir (`chrome.scripting.registerContentScripts`, kimlikler `zoom-hook` ve `zoom-bridge`); izin geri alınınca kaldırılır. Bir sonraki sayfa yüklemesinden itibaren geçerli olurlar; yenileme bu yüzden gerekir.

## Zoom'da nasıl çalışır

- **Ses yolu** (`src/content/page-hook.js`): Zoom'un web istemcisi WebRTC ses izi göndermez. Mikrofonu `getUserMedia`'dan okur, kendisi kodlar ve bir veri kanalından gönderir. Bu yüzden sayfa, mikrofonu istediği yerde bizim izimizi alır: çeviri kapalıyken mikrofon bu izden olduğu gibi geçer, çeviri açıkken yerini çevrilmiş ses alır. İz mikrofonun adını ve ayarlarını korur; Zoom'un ses ayarları gerçek cihazı göstermeye devam eder.
- **Çerçeveler:** Zoom'un web uygulaması ve toplantının başlangıç sayfası bir kabuktur (`/wc/<toplantı>/start`); toplantıyı kendi çerçevesinde çalıştırır (`iframe#webclient`, `/wc/<toplantı>/join`), yanında `/wc/pwa-empty-page` gibi yardımcı çerçeveler bulunur. Betikler her çerçeveye girer; yalnızca görüşmeyi taşıyan çerçeve eklentiye cevap verir ve motora bağlanır (`src/content/bridge.js` → `takesPart`, `platforms.js` içinde `callFrame`). Kabuk, içinde görüşme çerçevesi varsa geri çekilir.
- **Sessize alma** (`src/shared/platforms.js` → `zoomMuted`): Zoom'un ses düğmesinin etiketinden okunur. "Sesi aç…" sessizde demektir; "Sese katıl" henüz sese katılınmadığını gösterir ve sessiz sayılır. Herkese yönelik düğmeler ("Tümünü sessize al", katılımcılar) atlanır.
- **Altyazı çubuğu** Zoom'un düğmelerinin üstünde, alttan 96 px yukarıda durur. Zoom'un kendi altyazı alanı henüz aranmıyor.
- **Dökümler** görüşmenin adresini soru işaretinden sonraki kısım olmadan saklar: Zoom toplantı şifresini oraya koyar.

## Güvenlik kuralı

Sessize alma algılayıcısı emin değilse `null` döner ve eklenti yalnızca mikrofon izinin durumuna bakar. Sayfadan okunan bilgi sesi asla *açmaz*; yalnızca sessiz kalmak için bir sebep daha olabilir.

## Doğrulanmamış noktalar

Kodda `UNVERIFIED` olarak işaretli.

1. **Ses düğmesi** (`platforms.js` → `zoomMuted`, `page-hook.js` → `CANDIDATES.zoom`): kelime listeleri İngilizce ve Türkçe Zoom'u, kısmen de Almanca, Fransızca ve İspanyolcayı kapsar. Başka bir arayüz dilinde yalnızca izin durumu karar verir.
2. **Altyazı alanı:** Zoom'un kendi altyazıları algılanmıyor; açıksa iki altyazı üst üste binebilir.
3. **Görüşmenin sonu:** çeviri, sekme `zoom.us/wc/` dışına çıkınca ya da görüşme bağlantısı kalmadıktan 30 saniye sonra durur (`CALL_GONE_MS`). Zoom'un her çıkış yolunda bağlantılarını kapatıp kapatmadığı henüz denetlenmedi.
4. **Uygulama olarak kurulan Zoom** (tarayıcının yükle düğmesiyle, kendi penceresinde) denenmedi; aynı sayfaları yükler. Doğrudan bir bağlantıdan açılan toplantı çerçeve yerine üst sayfada çalışabilir; betikler iki düzeni de karşılar.

## Kontrol listesi

Kulaklık takın ve aynı toplantıya ikinci bir cihazdan (telefon olur) katılın. Telefonu bilgisayardan uzak tutun: mikrofonu sesinizi alıp size geri gönderir.

1. Eklentinin tek kopyası kalsın (mağaza kopyası ya da kaynaktan derlenen).
2. Toplantıya tarayıcıdan katılın ve sese katılın.
3. Çeviriyi başlatın; ilk seferde `zoom.us` erişimine izin verin, **Sekmeyi yenile** düğmesine basın ve yeniden başlatın.
4. **Gelen:** telefonda konuşun; bilgisayar çeviriyi seslendirir ve altyazıyı gösterir.
5. **Giden:** bilgisayarda konuşun; telefon *çevrilmiş* sesi duyar.
6. **Sessize alma:** Zoom'da sessize alın ve konuşun; telefona hiçbir şey gitmemeli. Panel mikrofonun kapalı olduğunu söyler.
7. Toplantıdan çıkın; araç çubuğundaki "AÇIK" rozeti 30 saniye içinde kaybolur.

Sessize alma algılanmazsa Zoom'un ses düğmesine sağ tıklayın, "İncele"yi seçin ve `class`, `aria-label` ve `title` değerlerini not edin; `platforms.js` bunlara göre düzeltilir.

## Testler

`npm run test:e2e`, `https://app.zoom.us/wc/…` adresinde sahte bir Zoom uygulamasıyla çalışır: bir kabuk sayfa (`test/e2e/mock-zoom-shell.html`) ve onun içindeki bir çerçevede görüşme (`test/e2e/mock-zoom.html`). Görüşme sayfası, Zoom gibi mikrofonu Web Audio ile okur ve yalnızca veri kanalı olan bir bağlantı kurar. Test şunları denetler: Zoom mikrofonunu adıyla görmeye devam ediyor mu, çeviri sürerken ham mikrofon Zoom'a ulaşmıyor mu, test zil sesi ulaşıyor mu, sessize alma ses düğmesinden okunuyor mu, tek panel çıkıyor mu ve durdurunca mikrofon geri geliyor mu. `test/unit/platforms.test.mjs` Zoom adreslerini ve sessize alma algılayıcısını kapsar.
