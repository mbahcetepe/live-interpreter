<div align="center">

# Live Interpreter (Canlı Tercüman) kurulumu

[English](SETUP.md) · **Türkçe**

Kurulumdan ilk çevrilen Teams görüşmesine ya da YouTube videosuna adım adım.

</div>

---

## Gerekenler

| Gereksinim | Açıklama |
| --- | --- |
| **Chrome 116+, Edge ya da Brave** | Teams toplantısına da bu tarayıcıdan katılırsın. Masaüstü Teams uygulaması desteklenmez |
| **Node.js 18+** | Yalnızca eklentiyi kaynaktan derlemek için ([nodejs.org](https://nodejs.org)); Chrome Web Store kopyasında gerekmez |
| **Ses tanıma ve sesler için biri** | ElevenLabs hesabı (kendi ses klonun için Starter veya üstü plan, [planlar](https://elevenlabs.io/pricing)) **ya da** kendi ses sunucun ([speech-server](speech-server/README.tr.md)) |
| **Çeviri için biri** | Claude, OpenAI, OpenRouter, Google Gemini ya da Soniox için bir API anahtarı, **ya da** kendi sunucun (Ollama, LM Studio) |
| **Kulaklık** | Görüşmelerde, duyduğun çeviri mikrofonuna girip karşıya geri gitmesin diye |

Eklentinin kendi sunucusu yok. Anahtarların yalnızca tarayıcında kalır ve yalnızca seçtiğin servise gider.

---

## En kolayı: Chrome Web Store

[Mağaza sayfasını](https://chromewebstore.google.com/detail/opaicinhommdnfhikkmlgjcalkohnkhl) aç, **Chrome'a ekle** düğmesine bas (Edge ve Brave'de de aynı) ve [3. Diller](#3-diller) adımından devam et. Mağaza kopyası kendini günceller; Node.js'e ve 1. ile 2. adımlara gerek kalmaz. 1. ve 2. adımlar kaynaktan derlemek içindir.

## 1. İndir ve derle

PowerShell'de (macOS/Linux'ta Terminal'de):

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter
npm install
npm run build
```

Sonunda `Built dist/` yazar. Eklenti `dist` klasöründedir; klasörü silme ya da taşıma.

## 2. Tarayıcıya yükle

1. Adres çubuğuna `chrome://extensions` yaz (Edge'de `edge://extensions`, Brave'de `brave://extensions`).
2. **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** düğmesine bas ve `dist` klasörünü seç.
4. **Yalnızca bir kopya yüklü olsun.** Eski bir sürüm yüklüyse onu **Kaldır**. İki kopya yüklüyse sayfa kancası çakışır ve açılır pencere sürekli "sekmeyi yenileyin (F5)" der.

Ayarlar sayfası kendiliğinden, İngilizce açılır; sağ üstteki menüden Türkçe, Almanca, İspanyolca ya da Çinceye geçebilirsin. Eklentiyi araç çubuğuna sabitle (yapboz simgesi → raptiye).

Ayarlar sayfası dört bölümden oluşur: **Diller**, **Çeviri**, **Ses tanıma ve sesler**, **Mikrofon ve ses**. Her bölüm yalnızca orada seçilen servisin alanlarını gösterir ve kendi **Test et** düğmesi vardır.

## 3. Diller

**Benim dilim**'i (ilk açılışta tarayıcının dili gelir) ve **Karşı tarafın dili (görüşmeler)**'ni seç. **Video ve radyo sekmeleri** sen bir dil seçmedikçe **Otomatik algıla**dır.

## 4. Çeviri

**Servis**'i seç:

| Servis | Girilecekler |
| --- | --- |
| **Claude (Anthropic)** | [Claude Console › API keys](https://platform.claude.com/settings/keys) sayfasından bir API anahtarı (hesapta kredi olmalı) ve bir model; en kısa gecikme **Claude Haiku 5.5** |
| **OpenAI ya da uyumlu bir sunucu** | OpenAI için **Sunucu**'yu boş bırak ve API anahtarını gir; ya da aynı arayüzü sunan bir sunucunun adresini gir (LM Studio, vLLM; örneğin `http://192.168.1.5:1234/v1`) |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai/keys) sayfasından bir API anahtarı |
| **Google Gemini** | [Google AI Studio](https://aistudio.google.com/apikey)'dan bir API anahtarı; en hızlısı **gemini-3.5-flash-lite**. Düşünmeyi eklenti kısar |
| **Ollama (kendi sunucunuz)** | Sunucunun adresi (örneğin `100.101.102.103`; port 11434 eklenir); altına bir **ikinci sunucu** eklenebilir |

**Model** listesi servisten kendiliğinden dolar; **↻** listeyi yeniden getirir. Kendi sunucunda (Ollama, LM Studio) tarayıcı o adrese erişim için bir kez izin ister: izin ver. Ollama sunucusunda `OLLAMA_ORIGINS` ayarı gerekmez.

**Test et** düğmesine bas: bir cümle çevrilir ve süresi ölçülür. Görüşme sırasında seçilen servis bir cümlede hata verirse sıradaki çevirir (ikinci Ollama sunucusu, sonra anahtar varsa Claude Haiku). Kalıcı olarak devre dışı kalan bir servis (örneğin reddedilen bir anahtar) panelde bir kez bildirilir.

**Toplantı notları ve özel terimler** (katlanır bölüm) çevirmene arka plan bilgisi ve isimlerin yazılışını verir.

## 5. Ses tanıma ve sesler

**Soniox (en hızlısı, isteğe bağlı):** **Çeviri** altında servis olarak **Soniox**'u seç (4. adım), [soniox.com](https://soniox.com) panelinden aldığın API anahtarını (Console › API keys; hesapta bakiye ya da otomatik ödeme olmalı) yapıştır ve **Test et** düğmesine bas. Soniox iki tarafı dinler ve cümle bitmeden, duyduğu anda çevirir; bu yüzden dinlemeyi de o yapar: burada seçilen **Servis** yalnızca çeviriyi seslendirir ve ses tanıma ayarları gizlenir. Soniox'un seslendirmesi için burada da **Soniox**'u seç; her taraf için bir ses seçilir. Soniox başka bir çevirmenle burada da seçilebilir: o zaman dinler ve seslendirir.

**Servis**'i seç.

**ElevenLabs:**

1. [elevenlabs.io](https://elevenlabs.io) → [Developers › API Keys](https://elevenlabs.io/app/developers/api-keys) → **Create Key**. **Text to Speech** ve **Speech to Text** satırlarını **Access**, **Voices** satırını **Write** yap.
2. Anahtarı **ElevenLabs API anahtarı** kutusuna yapıştır ve **Test et** düğmesine bas.
3. **Benim sesim**'i (sen konuşunca duydukları) ve **Karşı tarafın sesi**'ni seç. **Kendi sesimi oluştur (klon)** 1–2 dakikalık bir okumayı kaydedip sesini ondan oluşturur.

**OpenAI uyumlu** (OpenAI, Groq Whisper ya da Speaches, LocalAI, Kokoro-FastAPI gibi kendi sunucun):

1. **Ses tanıma** kısmında sunucuyu (OpenAI, Groq ya da adresiyle **Başka bir sunucu**), anahtarı ve modeli seç. OpenAI ya da Groq için anahtar boş bırakılırsa Çeviri bölümündeki aynı servisin anahtarı kullanılır.
2. **Seslendirme** kısmında aynısını yap, sonra **Benim sesim** ve **Karşı tarafın sesi**'ni seç.
3. **Test et** düğmesine bas: bir cümle seslendirilip geri duyulur. Metin cümle bitince gelir (canlı taslak yok).

**Google Gemini:** burada **Google Gemini**'yi seç; anahtar **Çeviri › Google Gemini** altındakiyle aynıdır (Gemini çevirmiyorsa buraya yapıştır). Her taraf için bir ses seç ve **Test et**'e bas: bir cümle seslendirir ve ses tanımanın bağlanabildiğini denetler.

**Kendi ses sunucum** (ücretsiz, ses ağının dışına çıkmaz):

1. NVIDIA ekran kartlı bir Ubuntu bilgisayarda:
   ```bash
   git clone https://github.com/mbahcetepe/live-interpreter.git
   cd live-interpreter/speech-server && sudo ./install-ubuntu.sh
   ```
   Betik sonunda bir **adres** ve **anahtar** yazar ([ayrıntılar](speech-server/README.tr.md)).
2. İkisini gir, **Test et** düğmesine bas ve tarayıcı adrese erişim izni isteyince izin ver. Sonuç, sunucunun sürümünü yazar ve "canlı ses tanıma hazır" ile biter.
3. **Ses tanıma modeli**'ni (Whisper) ve sesleri seç. "Yalnızca İngilizce" diye işaretli modeller (`distil-large-v3`) yalnızca İngilizce konuşmada kullanılır; diğer diller `large-v3-turbo` ile tanınır. Ses listeleri, her sesin konuşacağı dilin seslerini gösterir; Yunanca, Endonezce, Japonca ve Korece için yerel ses yoktur (yalnızca altyazı). Bu modda ses klonu yoktur.

**Yabancı kelimelerin okunuşu** (bu bölümün sonunda) varsayılan olarak açıktır: Türkçe konuşmadaki İngilizce terimler, kısaltmalar ve markalar İngilizce, İngilizce konuşmadaki Türkçe adlar Türkçe okunur. Kendi kelimelerini her satıra bir tane `kelime = okunuşu` biçiminde ekleyebilirsin (`Kubernetes = kubernetis`); yalnızca seslendirilen metin değişir.

Kullandığın bilgisayar kendi sunucularınla aynı ağda (örneğin Tailscale'de) olmalı. Hem ses hem çeviri kendi sunucularında olduğunda görüşmenin hiçbir parçası senin bilgisayarlarının dışına çıkmaz ve ücret yazmaz.

## 6. Mikrofon ve ses

- **Mikrofon iznini ver** düğmesine bas ve tarayıcının sorusuna izin ver. Teams'te kullandığın mikrofonu seç ya da "Görüşmeyle aynı" bırak.
- "Cümle bitti sayılması için sessizlik" ayarını **0,5 sn** yaparsan çeviri daha erken başlar. Kulaklık yoksa **Hoparlör modu**nu aç.
- **Çeviriyi duyacağınız çıkış:** çıkış aygıtı ya da sistemin varsayılanı.
- **Çeviri sesinin seviyesi**, **Karşı tarafın kendi sesi** ve **Çeviri konuşurken karşı tarafın kendi sesi**, sesli modda her birinin ne kadar yüksek duyulacağını belirler; **Kendi çevirimi duy**, karşıya gönderileni kısık sesle duymanı sağlar.
- İstemezsen **Sayfanın altında altyazı** ve **Sayfada panel** kutularını kaldırabilirsin.
- **Ses ayrıntıları** (ElevenLabs): ses modeli, **Ses tutarlılığı** ve **Sese benzerlik**.

---

## 7. Teams ya da Meet görüşmesinde

1. Toplantı bağlantısını aç. Teams uygulamayı açmayı önerirse **Bu tarayıcıda devam et** seç.
2. Kulaklığı tak, toplantıya katıl.
3. Eklenti Teams sekmesi açıldıktan sonra yüklendiyse ya da yenilendiyse sekmeyi bir kez **F5** ile yenile.
4. Teams sekmesindeyken eklenti simgesine tıkla, modları seç ve **Çeviriyi başlat** de (kısayol: `Alt+Shift+T`).

**Bağlantı testi (anahtarsız)** düğmesi hiçbir şey çevirmeden eklentinin görüşmenin sesine ulaştığını denetler; **Test sesi gönder**, çeviri sürerken karşı tarafa kısa bir zil sesi gönderir.

Desteklenen adresler: `teams.microsoft.com`, `teams.cloud.microsoft` (iş/okul hesabı), `teams.live.com` (kişisel hesap), Google Meet ve web'deki Zoom (`*.zoom.us/wc/`).

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

Sayfanın sol altında küçük bir **Canlı Tercüman** düğmesi çıkar. Tıklayınca iki tarafın cümleleri, gecikme ve maliyet görünür.

**Teams'te mikrofonunu kapatınca** (`Ctrl+Shift+M`) karşıya hiçbir şey gitmemeli. İlk görüşmede bunu mutlaka dene.

Toplantı bitince çeviri, bağlantı kalmadıktan 30 saniye sonra kendiliğinden durur. Hemen durdurmak için açılır pencereyi ya da `Alt+Shift+T` kısayolunu kullan.

## 8. Zoom görüşmesinde

1. Toplantı bağlantısını aç ve Zoom uygulaması yerine tarayıcıdan katıl (adres `app.zoom.us/wc/` ile başlar).
2. Kulaklığı tak, toplantıya ve sesine katıl.
3. Zoom sekmesindeyken eklenti simgesine tıkla ve **Çeviriyi başlat** de. İlk seferde tarayıcı `zoom.us` adresine erişim izni ister: izin ver, **Sekmeyi yenile** düğmesine bas, sonra yeniden başlat. Eklenti bu izni yalnızca Zoom'da kullandığında ister.

Zoom'un masaüstü uygulaması desteklenmez.

## 9. Video ve radyo sekmelerinde (YouTube, X, çevrimiçi radyo)

1. Videoyu ya da radyoyu aç ve çalmaya başlat.
2. O sekmedeyken eklenti simgesine tıkla. Pencerede "Bu sekmedeki ses" seçeneği görünür.
3. **Sadece altyazı** ya da **Sesli çeviri** seç ve **Bu sekmeyi çevir** düğmesine bas (kısayol: `Alt+Shift+T`).

- Çeviri sayfanın altında film altyazısı gibi çıkar. YouTube tam ekrandayken altyazı oynatıcının içine taşınır.
- Sesli çeviride asıl ses, çeviri konuşurken %20'ye iner, cümle aralarında normale döner.
- Yalnızca çeviriyi duymak, videonun üzerinde yazı görmemek için eklenti penceresinde **Sesli çeviri**'yi seç ve **Altyazıyı da göster** kutusunun işaretini kaldır.
- Eklenti yalnızca tıkladığın sekmeye erişir ve sayfaya hiçbir şey göndermez. Aynı sitede başka bir videoya geçince çeviri devam eder.
- Çeviri konuşmanın 1,5–3 saniye gerisinden gelir. Hızlı ve kesintisiz konuşulan videolarda sesli çeviri, yetişmek için kısaltır.
- **Filmler ve gürültülü sesler:** Kendi ses sunucun konuşmayı müzikten ve efektlerden ayıran bir ses algılayıcıyla (Silero VAD) çalışır. Müzik diyalogu bastırıyorsa bazı cümleler kaçabilir.

## 10. Dökümler (transkript)

Görüşme ya da video, her çevirinin bir dökümü tutulur: her cümle, saati, kimin söylediği (sen ya da karşı taraf; videoda konuşan) ve çevirisiyle. Döküm çeviri sürerken birkaç saniyede bir, durunca da bir kez daha kaydedilir.

- **Çeviri sürerken:** panelin altındaki **Döküm** düğmesi o ana kadar söylenenleri kaydeder ve bir sekmede açar.
- **Sonra:** açılır penceredeki **Kayıtlar ve dökümler** düğmesi hepsini listeler. **Göster** dökümü açar, **Metin (.txt)** metin dosyası olarak, **Altyazı (.srt)** çeviriyi video oynatıcı için altyazı olarak kaydeder, **Sil** dökümü kaldırır.
- Dökümler bu bilgisayarda, eklentinin deposunda kalır. Son 50 döküm saklanır; daha eskileri kendiliğinden silinir.
- Hiç döküm tutulmasın istersen Ayarlar, Mikrofon ve ses altındaki **Her çevirinin dökümünü bu bilgisayarda sakla** kutusunu kaldır.

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
| "Görüşme sekmesini bir kez yenileyin (F5)" ve F5 işe yaramıyor | Eklentinin birden çok kopyası yüklü (örneğin mağaza kopyası ve `dist`'ten yüklenen). Yalnızca biri kalsın, sonra F5 |
| Açılır pencere bir görüşme ya da sayfa açmanı istiyor | Pencereyi Teams, Meet ya da video sekmesindeyken aç. Tarayıcının kendi sayfaları (`brave://...`) çevrilemez |
| "Eklentinin mikrofon izni yok" | Ayarlar → **Mikrofon iznini ver** |
| Karşı taraf beni duymuyor | Teams'te mikrofonun açık mı? Paneldeki uyarıyı oku; **Test sesi gönder** ile dene |
| Karşı taraf anlamsız sesler ya da kendi sözlerini geri duyuyor | Çevirin hoparlörden mikrofona giriyor: kulaklık kullan ya da **Hoparlör modu**nu aç |
| "Ollama sunucusu ... adresine ulaşılamadı" | Sunucu açık mı, bu bilgisayar Tailscale'de mi? Ayarlarda Çeviri bölümündeki **Test et** |
| "Anthropic API anahtarı geçersiz" (ya da OpenAI, OpenRouter, Gemini) | Anthropic, ayarlarda kayıtlı anahtarı reddediyor: anahtar değiştirilmiş, iptal edilmiş ya da eksik yapıştırılmış. Çeviri bölümünde anahtarı yeniden yapıştır ve **Test et** düğmesine bas |
| "Yerel ses sunucusu anahtarı kabul etmedi" | Sunucudaki `/etc/live-interpreter-speech.env` dosyasındaki `SPEECH_KEY`'i gir |
| "Yedek çeviri (Claude) şu an kullanılamıyor" | Çeviri bölümünde Claude anahtarını ve bakiyesini kontrol et ya da ikinci bir Ollama sunucusu ekle |
| Gecikme fazla | Ollama ya da **Claude Haiku 5.5** seç, sessizlik ayarını **0,5 sn** yap, kısa cümlelerle konuş |
| Filmde çeviri gelmiyor | Kendi ses sunucunu güncelle (`git pull` ve `sudo ./install-ubuntu.sh`); konuşma algılayıcısı yeni sürümde. Altyazıyı yalnızca konuşmanın olduğu yerlerde bekle |
| Çince ya da Japonca konuşma yalnızca konuşan durunca çevriliyor ya da bir cümle iki kez seslendiriliyor | Eklentiyi 2.4.3 ya da sonrasına, ses sunucunu 2.0.1'e güncelle (`git pull` ve `sudo ./install-ubuntu.sh`): sunucu bu dilleri noktalamayla yazar, eklenti de her bitmiş cümleyi konuşma sürerken bir kez çevirir |
| Konuşmam karşıya anlamsız İngilizce cümleler ya da cevaplar olarak gidiyor | Kendi ses sunucunda yalnızca İngilizce bilen bir model seçili (`distil-large-v3`). Eklentiyi 2.4.1 ya da sonrasına güncelle (diğer dilleri `large-v3-turbo`ya gönderir) ya da ses tanıma modeli olarak `large-v3-turbo` seç. Net ve mikrofona yakın konuş |
| Çeviri kendiliğinden durdu | Panel nedenini yazar (örneğin ElevenLabs kotası doldu). Sorunu giderip yeniden başlat |

## Güncelleme

```bash
git pull
npm install
npm run build
```

Sonra uzantılar sayfasında eklentinin yenile düğmesine bas ve açık sekmeyi F5 ile yenile. Ayarların ve sesin yerinde kalır. Chrome Web Store kopyasında bunların hiçbiri gerekmez, kendini günceller. Kendi ses sunucunu güncellemek için Ubuntu'da `git pull` yapıp `speech-server` klasöründe `sudo ./install-ubuntu.sh` komutunu tekrar çalıştır; anahtar korunur.

Her görüşme sitesinin teknik notları ve henüz doğrulanmamış noktalar: [MEET.tr.md](MEET.tr.md), [TEAMS.tr.md](TEAMS.tr.md), [ZOOM.tr.md](ZOOM.tr.md).
