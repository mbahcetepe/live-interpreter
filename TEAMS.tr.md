# Microsoft Teams (web): teknik notlar

[English](TEAMS.md) · **Türkçe**

Live Interpreter (Türkçe arayüzde Canlı Tercüman), Google Meet ([MEET.tr.md](MEET.tr.md)) ve web'deki Zoom'a ([ZOOM.tr.md](ZOOM.tr.md)) ek olarak **tarayıcıdaki Microsoft Teams** ile çalışır. Masaüstü Teams uygulaması desteklenmez: tarayıcı eklentileri yalnızca tarayıcıda çalışır. Kurulum için [SETUP.tr.md](SETUP.tr.md).

> **Durum:** Brave'de gerçek iş hesabı Teams görüşmelerinde iki yönlü çeviri kullanıldı; çeviriler karşıya ulaştı. Aşağıdaki "Doğrulanmamış noktalar" henüz kontrol ediliyor. Önemli bir toplantıdan önce deneme görüşmesi yapın.
>
> Teams görüşmelerinde de çeviri Ollama'da, ses tanıma ve seslendirme kendi ses sunucunuzda yapılabilir; kurulum için [SETUP.tr.md](SETUP.tr.md), 4. ve 5. adımlar. Video ve radyo sekmeleri için 9. adım.

## Desteklenen adresler

| Adres | Ne için |
| --- | --- |
| `https://teams.microsoft.com/` | İş/okul hesabıyla Teams |
| `https://teams.cloud.microsoft/` | Teams'in yeni adresi |
| `https://teams.live.com/` | Kişisel (ücretsiz) Teams |

Teams bir toplantı bağlantısını açarken uygulamayı başlatmayı önerirse "Bu tarayıcıda devam et" seçeneğini seçin.

## Teams için yapılanlar

- **`src/shared/platforms.js`:** Siteye özgü her şey tek yerde: adresler, mikrofon düğmesinden mute durumunun okunması, sitenin kendi altyazı alanı ve altyazı çubuğunun alttan yüksekliği.
- **`src/manifest.json`:** Teams adresleri content script eşleşmelerine ve host izinlerine eklendi.
- **`src/content/page-hook.js`:** Ses yolu (RTCRtpSender takası) her WebRTC sitesinde aynı çalışır; mute algılama platforma göre seçilir. Teams sayfasının ana iş parçacığı yoğun olduğu için çeviri sesi sayfada 0,25 sn tamponlanır; konuşmanın ortasında ses kesilirse tampon kendiliğinden 0,6 sn'ye kadar büyür.
- **`src/offscreen/fallback-translator.js`:** Claude bir cümlede hata verirse (aşırı yük, hız sınırı, kredi, bağlantı) cümleyi ücretsiz çeviri zinciri çevirir.
- **`src/content/subtitle-bar.js`:** Teams'te altyazı daha aşağıda durur ve Teams'in canlı altyazı alanı aranır.
- **`test/unit/platforms.test.mjs`:** Adres eşleşmesi (benzer görünen sahte alan adları dahil), manifest kapsamı ve mute algılayıcıları.

## Güvenlik ilkesi

Mikrofon kapalı algılayıcısı emin olamadığında `null` döner ve eklenti yalnızca mikrofon track'inin durumuna bakar. Sayfa yapısından okunan bilgi hiçbir zaman sesi *açmaz*; yalnızca susmak için ek bir neden olabilir.

Sınırı: Teams sizi sessize alırken track'e hiç dokunmuyorsa **ve** düğme algılaması da tutmazsa, Teams'te sessizdeyken çevrilmiş sesiniz karşıya gitmeye devam edebilir. Bu yüzden aşağıdaki kontrol listesinin mute adımı atlanmamalı.

## Görüşme sonu

Meet'te görüşmeden çıkınca adres değişir ve çeviri hemen durur. Teams'te toplantı bitince aynı sitede kalırsınız; çeviri, bağlı WebRTC bağlantısı kalmadıktan **30 saniye sonra** durur (`src/offscreen/engine.js`, `CALL_GONE_MS`). Popup'tan ya da `Alt+Shift+T` ile hemen durdurabilirsiniz.

## Doğrulanmamış noktalar

Hepsi kodda `UNVERIFIED` yorumuyla işaretli.

1. **Mikrofon düğmesi** (`platforms.js` → `teamsMuted`, `page-hook.js` → `CANDIDATES.teams`): Düğmenin etiketinde `Ctrl+Shift+M` kısayolunun geçtiği ve etiketin "Unmute / Mute" gibi ne olacağını söylediği varsayıldı. Teams arayüz diliniz İngilizce ya da Türkçe değilse kelime listesi genişletilmeli.
2. **Canlı altyazı alanı** (`platforms.js` → `captionSelectors`): `data-tid` değerleri tahmindir. Yanlışsa tek sonuç, Teams altyazısı açıkken iki altyazının üst üste binmesidir.
3. **Görüşme sonu:** Teams'in toplantıdan çıkınca peer connection'ları kapattığı varsayıldı.

## Kontrol listesi

Kulaklık takın ve ikinci bir cihazdan (telefon olabilir) aynı toplantıya katılın.

1. Eklentinin yalnızca bir kopyası yüklü olsun: Chrome Web Store kopyası ya da kaynaktan derlenen (`npm run build`, ardından `dist`'ten yüklenen kopyada yenile).
2. Teams toplantısına tarayıcıdan katılın, sekmeyi bir kez yenileyin (F5).
3. **Gelen yön:** Telefondan konuşun; bilgisayarda çeviriyi duymalı ve altyazıyı görmelisiniz.
4. **Giden yön:** Bilgisayarda konuşun; telefonda *çevrilmiş* sesi duymalısınız.
5. **Mute (en önemlisi):** Teams'te mikrofonu kapatın (`Ctrl+Shift+M`) ve konuşun; telefona hiçbir şey gitmemeli.
6. Teams altyazılarını açın; eklentinin altyazısı onların üstüne çıkmalı.
7. Toplantıdan ayrılın; en geç 30 saniye içinde araç çubuğundaki "ON" rozeti kaybolmalı.

Bir adım tutmazsa Teams sayfasında mikrofon düğmesine sağ tıklayıp "İncele" deyin ve düğmenin `id`, `data-tid`, `aria-label` ve `title` değerlerini not edin; `platforms.js` bunlara göre düzeltilir.

## Uçtan uca testler

`npm run test:e2e` ve `npm run test:scenarios` şimdilik sahte bir Meet sayfasını sürer. Sahte bir Teams sayfası (`test/e2e/mock-meet.html` örnek alınarak) bir sonraki adımdır.
