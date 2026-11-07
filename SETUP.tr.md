<div align="center">

# Meet Tercüman kurulumu

[English](SETUP.md) · **Türkçe**

Kurulumdan ilk çevrilen Teams görüşmesine ya da YouTube videosuna adım adım.

</div>

---

## Gerekenler

| Gereksinim | Açıklama |
| --- | --- |
| **Chrome 116+, Edge ya da Brave** | Teams toplantısına da bu tarayıcıdan katılırsın. Masaüstü Teams uygulaması desteklenmez |
| **Node.js 18+** | Eklentiyi derlemek için ([nodejs.org](https://nodejs.org)) |
| **Ses tanıma ve sesler için biri** | ElevenLabs hesabı (kendi ses klonun için Starter veya üstü plan, [planlar](https://elevenlabs.io/pricing)) **ya da** kendi ses sunucun ([speech-server](speech-server/README.md)) |
| **Çeviri için biri** | Anthropic API anahtarı (Claude) **ya da** kendi Ollama sunucun **ya da** hiçbiri (ücretsiz çeviri) |
| **Kulaklık** | Görüşmelerde, duyduğun çeviri mikrofonuna girip karşıya geri gitmesin diye |

Eklentinin kendi sunucusu yok. Anahtarların yalnızca tarayıcında kalır ve yalnızca seçtiğin servise gider.

---

## 1. İndir ve derle

PowerShell'de (macOS/Linux'ta Terminal'de):

```bash
git clone https://github.com/mbahcetepe/meet-tercuman.git
cd meet-tercuman
npm install
npm run build
```

Sonunda `Built dist/` yazar. Eklenti `dist` klasöründedir; klasörü silme ya da taşıma.

## 2. Tarayıcıya yükle

1. Adres çubuğuna `chrome://extensions` yaz (Edge'de `edge://extensions`, Brave'de `brave://extensions`).
2. **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** düğmesine bas ve `dist` klasörünü seç.
4. **Yalnızca bir kopya yüklü olsun.** Eski bir sürüm yüklüyse onu **Kaldır**. İki kopya yüklüyse sayfa kancası çakışır ve açılır pencere sürekli "sekmeyi yenileyin (F5)" der.

Ayarlar sayfası kendiliğinden açılır. Eklentiyi araç çubuğuna sabitle (yapboz simgesi → raptiye). Sağ üstteki **TR** düğmesiyle arayüzü Türkçeye geçir.

## 3. Ses tanıma ve sesler: ElevenLabs ya da kendi ses sunucun

Ayarlarda **1. API anahtarları** bölümündeki **Ses tanıma ve sesler** alanından birini seç.

**ElevenLabs:**

1. [elevenlabs.io](https://elevenlabs.io) → [Developers › API Keys](https://elevenlabs.io/app/developers/api-keys) → **Create Key**.
2. **Text to Speech** ve **Speech to Text** satırlarını **Access**, **Voices** satırını **Write** yap ve anahtarı oluştur.
3. Anahtarı kopyala (yalnızca bir kez gösterilir) ve **ElevenLabs API anahtarı** kutusuna yapıştır.

**Kendi ses sunucun** (ücretsiz, ses ağının dışına çıkmaz):

1. NVIDIA ekran kartlı bir Ubuntu bilgisayarda:
   ```bash
   git clone https://github.com/mbahcetepe/meet-tercuman.git
   cd meet-tercuman/speech-server && sudo ./install-ubuntu.sh
   ```
   Betik sonunda bir **adres** ve **anahtar** yazar ([ayrıntılar](speech-server/README.md)).
2. Ayarlarda **Kendi ses sunucum**'u seç, adresi ve anahtarı gir, **Test et ve izin ver** düğmesine bas. Tarayıcı bu adrese erişim izni ister; izin ver. Sonuçta "canlı ses tanıma hazır" yazmalı.
3. Bu modda ses klonu yoktur. Seslerin `local-1`, `local-2` gibi adlarla görünür.

## 4. Çeviri: Claude, Ollama ya da ücretsiz

Ayarlarda **6. Çeviri** bölümünde **Çeviri modeli**'ni seç.

- **Claude:** [Claude Console › API keys](https://platform.claude.com/settings/keys) sayfasından bir anahtar al ve **Anthropic API anahtarı** kutusuna yapıştır. Hesapta kredi olmalı. En kısa gecikme için **Claude Haiku 5.5**.
- **Ollama (kendi sunucun, ücretsiz):** **Ollama**'yı seç. Sunucunun adresini (örneğin `100.65.147.84`; port yazılmazsa 11434 eklenir) ve modeli (örneğin `gemma4:12b`) gir, **Test et ve izin ver** düğmesine bas ve tarayıcının sorusuna izin ver. Sunucuda `OLLAMA_ORIGINS` ayarı gerekmez. İstersen **İkinci sunucu** alanına başka bir bilgisayardaki Ollama'yı ekle. Ollama yanıt vermezse sırayla ikinci sunucu, Claude (anahtar varsa Haiku) ve ücretsiz çeviri devralır.
- **Ücretsiz:** **Ücretsiz**'i seç. Brave'de Chrome'un yerleşik çevirmeni olmayabilir; bir [DeepL API Free](https://www.deepl.com/pro-api) anahtarı ekle.

Claude ya da Ollama bir cümlede hata verirse o cümleyi yedek çeviri devralır; cümle kaybolmaz.

**Anahtarları test et** düğmesine bas; yeşil yazı çıkarsa tamamdır.

Toplantıyı yapacağın bilgisayar, kendi sunucularınla aynı ağda (örneğin Tailscale'de) olmalı. Hem ses sunucusu hem Ollama açıkken görüşmenin hiçbir parçası senin bilgisayarlarının dışına çıkmaz ve ücret yazmaz.

## 5. Mikrofon, diller, ses

- **Mikrofon iznini ver** düğmesine bas ve tarayıcının sorusuna izin ver. Teams'te kullandığın mikrofonu seç ya da "Görüşmeyle aynı" bırak.
- **Diller:** kendi dilini ve karşı tarafın dilini seç. Video sekmelerinde videonun dili **karşı tarafın dili** sayılır.
- **Benim sesim (isteğe bağlı):** ElevenLabs'te 1–2 dakika okuyarak kendi ses klonunu oluştur ya da hazır bir ses seç. Kendi ses sunucunda `local-1` ya da `local-2`'yi seç.
- **Ses:** "Konuşma bitti sayılması için sessizlik" ayarını **0,5 sn** yaparsan çeviri daha erken başlar. Kulaklık yoksa **Hoparlör modu**nu aç.

---

## 6. Teams görüşmesinde

1. Toplantı bağlantısını aç. Teams uygulamayı açmayı önerirse **Bu tarayıcıda devam et** seç.
2. Kulaklığı tak, toplantıya katıl.
3. Eklenti Teams sekmesi açıldıktan sonra yüklendiyse ya da yenilendiyse sekmeyi bir kez **F5** ile yenile.
4. Teams sekmesindeyken eklenti simgesine tıkla, modları seç ve **Çeviriyi başlat** de (kısayol: `Alt+Shift+T`).

Desteklenen adresler: `teams.microsoft.com`, `teams.cloud.microsoft` (iş/okul hesabı), `teams.live.com` (kişisel hesap) ve Google Meet.

| Karşı taraf konuşunca | Ne olur | ElevenLabs kredisi |
| --- | --- | --- |
| **Sesli çeviri** | Karşı tarafı kendi dilinde sesli duyarsın | En çok bunu harcar |
| **Sadece altyazı** | Karşı tarafı kendi sesiyle duyarsın, çevirisi yazıyla çıkar | Çok daha az |
| **Kapalı** | Çeviri yok | Harcamaz |

| Ben konuşunca | Ne olur | ElevenLabs kredisi |
| --- | --- | --- |
| **Sesli çeviri** | Seni onların dilinde, seçtiğin sesle duyarlar | Harcar |
| **Kapalı** | Gerçek sesini duyarlar | Harcamaz |

Kendi ses sunucunda kredi yoktur; tablodaki her şey ücretsizdir.

Sayfanın sol altında küçük bir **Meet Tercüman** düğmesi çıkar. Tıklayınca iki tarafın cümleleri, gecikme ve maliyet görünür.

**Teams'te mikrofonunu kapatınca** (`Ctrl+Shift+M`) karşıya hiçbir şey gitmemeli. İlk görüşmede bunu mutlaka dene.

Toplantı bitince çeviri, bağlantı kalmadıktan 30 saniye sonra kendiliğinden durur. Hemen durdurmak için açılır pencereyi ya da `Alt+Shift+T` kısayolunu kullan.

## 7. Video ve radyo sekmelerinde (YouTube, X, çevrimiçi radyo)

1. Videoyu ya da radyoyu aç ve çalmaya başlat.
2. O sekmedeyken eklenti simgesine tıkla. Pencerede "Bu sekmedeki ses" seçeneği görünür.
3. **Sadece altyazı** ya da **Sesli çeviri** seç ve **Bu sekmeyi çevir** düğmesine bas (kısayol: `Alt+Shift+T`).

- Çeviri sayfanın altında film altyazısı gibi çıkar. YouTube tam ekrandayken altyazı oynatıcının içine taşınır.
- Sesli çeviride asıl ses, çeviri konuşurken %20'ye iner, cümle aralarında normale döner.
- Eklenti yalnızca tıkladığın sekmeye erişir ve sayfaya hiçbir şey göndermez. Aynı sitede başka bir videoya geçince çeviri devam eder.
- Çeviri konuşmanın 1,5–3 saniye gerisinden gelir. Hızlı ve kesintisiz konuşulan videolarda sesli çeviri, yetişmek için kısaltır.
- **Filmler ve gürültülü sesler:** Kendi ses sunucun konuşmayı müzikten ve efektlerden ayıran bir ses algılayıcıyla (Silero VAD) çalışır. Müzik diyalogu bastırıyorsa bazı cümleler kaçabilir.

---

## Önemli bir toplantıdan önce dene

1. Bilgisayarda Teams toplantısını tarayıcıdan başlat, kulaklığı tak ve çeviriyi başlat.
2. Telefondan aynı toplantıya katıl, telefonun sesini kıs ya da ayrı kulaklık tak.
3. Telefona karşı tarafın dilinde konuş: bilgisayarda çevirisini duymalısın.
4. Bilgisayara kendi dilinde konuş: telefonda çevrilmiş sesi duymalısın, kendi sesini değil.
5. Teams'te mikrofonu kapat ve konuş: telefona hiçbir şey gitmemeli.

Aynı bilgisayardan iki katılımcı birbirinin sesini bozar; ikinci bir cihaz kullan.

## Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| "Manifest dosyası eksik veya okunamıyor" | Yanlış klasör seçilmiş: `dist` klasörünü seç |
| "Görüşme sekmesini bir kez yenileyin (F5)" ve F5 işe yaramıyor | Uzantılar sayfasında eklentinin birden çok kopyası var. Yalnızca `dist`'ten yüklenen kalsın, sonra F5 |
| Açılır pencere bir görüşme ya da sayfa açmanı istiyor | Pencereyi Teams, Meet ya da video sekmesindeyken aç. Tarayıcının kendi sayfaları (`brave://...`) çevrilemez |
| "Eklentinin mikrofon izni yok" | Ayarlar → **Mikrofon iznini ver** |
| Karşı taraf beni duymuyor | Teams'te mikrofonun açık mı? Paneldeki uyarıyı oku; **Test sesi gönder** ile dene |
| Karşı taraf anlamsız sesler ya da kendi sözlerini geri duyuyor | Çevirin hoparlörden mikrofona giriyor: kulaklık kullan ya da **Hoparlör modu**nu aç |
| "Ollama sunucusu ... adresine ulaşılamadı" | Sunucu açık mı, bu bilgisayar Tailscale'de mi? Ayarlarda **Test et ve izin ver** |
| "Yerel ses sunucusu anahtarı kabul etmedi" | Sunucudaki `/etc/meet-tercuman-speech.env` dosyasındaki `SPEECH_KEY`'i gir |
| "Yedek çeviri henüz hazır değil" | Brave'de Chrome'un çevirmeni yok: bir DeepL Free anahtarı ya da ikinci bir Ollama sunucusu ekle |
| Gecikme fazla | Ollama ya da **Claude Haiku 5.5** seç, sessizlik ayarını **0,5 sn** yap, kısa cümlelerle konuş |
| Filmde çeviri gelmiyor | Kendi ses sunucunu güncelle (`git pull` ve `sudo ./install-ubuntu.sh`); konuşma algılayıcısı yeni sürümde. Altyazıyı yalnızca konuşmanın olduğu yerlerde bekle |
| Çeviri kendiliğinden durdu | Panel nedenini yazar (örneğin ElevenLabs kotası doldu). Sorunu giderip yeniden başlat |

## Güncelleme

```bash
git pull
npm install
npm run build
```

Sonra uzantılar sayfasında eklentinin yenile düğmesine bas ve açık sekmeyi F5 ile yenile. Ayarların ve sesin yerinde kalır. Kendi ses sunucunu güncellemek için Ubuntu'da `git pull` yapıp `speech-server` klasöründe `sudo ./install-ubuntu.sh` komutunu tekrar çalıştır; anahtar korunur.

Teams'e özgü teknik notlar ve henüz doğrulanmamış noktalar: [TEAMS.md](TEAMS.md).
