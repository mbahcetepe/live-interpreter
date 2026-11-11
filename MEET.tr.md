# Google Meet: teknik notlar

[English](MEET.md) · **Türkçe**

Live Interpreter (Türkçe arayüzde Canlı Tercüman) bir Google Meet eklentisi olarak başladı; ses yolu Meet üzerinde kuruldu. Teams ve Zoom'un kendi notları var: [TEAMS.tr.md](TEAMS.tr.md), [ZOOM.tr.md](ZOOM.tr.md). Kurulum: [SETUP.tr.md](SETUP.tr.md), 7. adım.

> **Durum:** gerçek Meet görüşmelerinde iki yönlü çeviri kullanıldı (Türkçe ve İngilizce); çeviriler karşıya ulaştı. Önemli bir toplantıdan önce deneme görüşmesi yapın.

## Adres

`https://meet.google.com/` — manifestin içerik betiği eşleşmelerinde ve site izinlerinde; ilk kullanımda izin istenmez.

## Meet'te nasıl çalışır

- **Ses yolu** (`src/content/page-hook.js`): Meet mikrofonu WebRTC izi olarak gönderir. Çeviri sürerken görüşmenin `RTCRtpSender`'ındaki iz, çevrilmiş sesi taşıyan bir izle değiştirilir; Meet kendi mikrofon izini görmeye devam eder. Durdurunca mikrofon geri gelir.
- **Sessize alma** (`src/shared/platforms.js` → `meetMuted`): Meet'in mikrofon düğmesinde `data-is-muted` vardır. İpucu metni kısayolu (`Ctrl+D` / `Cmd+D`) yazar; yoksa etiketteki "mikrofon" kelimesi onu kamera düğmesinden ayırır.
- **Altyazılar** (`captionSelectors`): Meet'in altyazı alanı `aria-label`'ından (İngilizce ve Türkçe) bulunur; eklentinin altyazıları onun üstüne çıkar.
- **Altyazı çubuğu** Meet'in düğmelerinin üstünde, alttan 104 px yukarıda durur.
- **Görüşmenin sonu:** görüşmeden çıkınca adres değişir ve çeviri hemen durur (`src/background/service-worker.js`). Adres değişmezse (veda ekranı), görüşme bağlantısı kalmadıktan 30 saniye sonra durur (`src/offscreen/engine.js` içinde `CALL_GONE_MS`).

## Güvenlik kuralı

Sessize alma algılayıcısı emin değilse `null` döner ve eklenti yalnızca mikrofon izinin durumuna bakar. Sayfadan okunan bilgi sesi asla *açmaz*; yalnızca sessiz kalmak için bir sebep daha olabilir.

## Kontrol listesi

Kulaklık takın ve aynı toplantıya ikinci bir cihazdan (telefon olur) katılın.

1. Eklentinin tek kopyası kalsın (mağaza kopyası ya da kaynaktan derlenen).
2. Meet görüşmesine katılın; eklenti sekme açıldıktan sonra yüklendiyse sekmeyi bir kez yenileyin.
3. **Gelen:** telefonda konuşun; bilgisayar çeviriyi seslendirir ve altyazıyı gösterir.
4. **Giden:** bilgisayarda konuşun; telefon *çevrilmiş* sesi duyar.
5. **Sessize alma:** Meet'te sessize alın (`Ctrl+D`) ve konuşun; telefona hiçbir şey gitmemeli.
6. Meet'in altyazılarını açın; eklentinin altyazıları onların üstüne çıkar.
7. Görüşmeden çıkın; araç çubuğundaki "AÇIK" rozeti kaybolur.

## Testler

Uçtan uca testler (`npm run test:e2e`) ve senaryolar (`npm run test:scenarios`) sahte bir Meet sayfasıyla çalışır: `test/e2e/mock-meet.html`. Sayfada iki eş bağlantı arasında gerçek bir WebRTC görüşmesi kurulur ve karşı tarafa giden ses ölçülür. `test/meet/` gerçek bir Meet görüşmesine karşı yapılan denetimleri içerir (`live.mjs`).
