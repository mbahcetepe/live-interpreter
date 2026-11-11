<div align="center">

<img src="docs/logo.png" alt="" width="112" height="112">

# Canlı Tercüman

### Web'deki Microsoft Teams, Google Meet ve Zoom görüşmeleri ile her video ve radyo sekmesi için canlı konuşma çevirisi

[English](README.md) · **Türkçe** · [中文](README.zh.md)

Görüşmede iki yönlü: karşı taraf İspanyolca konuşur, sen Türkçe duyarsın; sen Türkçe konuşursun, karşı taraf seni kendi sesinle İspanyolca duyar. YouTube'da, X'te ya da bir çevrimiçi radyoda: takip ettiğin dilde altyazı ya da orijinalin üzerine sesli çeviri. 20 dilden herhangi ikisi; videonun dili kendiliğinden algılanabilir. Kendine ait bir arka ucu olmayan bir tarayıcı eklentisi; çeviri ve seslendirme ElevenLabs ve Claude ile ya da tamamen kendi sunucularında çalışabilir.

İngilizce arayüzde adı Live Interpreter.

**[Chrome Web Store'dan Chrome'a ekle](https://chromewebstore.google.com/detail/opaicinhommdnfhikkmlgjcalkohnkhl)** · ücretsiz ve açık kaynak (MIT)

<table>
  <tr><td><b>Görüşmeler</b></td><td>Tarayıcıda Microsoft Teams (iş/okul ve kişisel hesap), Google Meet, tarayıcıda Zoom</td></tr>
  <tr><td><b>Diğer sekmeler</b></td><td>YouTube, X, çevrimiçi radyo, sesi olan her web sayfası</td></tr>
  <tr><td><b>Tarayıcılar</b></td><td>Chrome, Edge, Brave ve diğer Chromium tarayıcıları</td></tr>
  <tr><td><b>Diller</b></td><td>20 dil, herhangi ikisi; ilk açılışta tarayıcının dili seçilir; video sekmelerinde konuşulan dil kendiliğinden algılanabilir</td></tr>
  <tr><td><b>Çeviri</b></td><td>Claude, OpenAI ya da uyumlu bir sunucu, OpenRouter, Google Gemini, kendi Ollama sunucun ya da Soniox; her birinin modelleri ayarlarda listelenir</td></tr>
  <tr><td><b>Ses</b></td><td>ElevenLabs, OpenAI uyumlu servisler (OpenAI, Groq Whisper, LocalAI, Speaches, Kokoro) ya da kendi ses sunucun (faster-whisper ve Piper)</td></tr>
  <tr><td><b>Gecikme</b></td><td>Cümle bittikten yaklaşık 1,5–3 sn sonra</td></tr>
  <tr><td><b>Arayüz</b></td><td>İngilizce (varsayılan), Türkçe, Almanca, İspanyolca, Çince</td></tr>
</table>

</div>

> **Durum.** Chrome Web Store'da yayında. Web'deki Teams, Google Meet ve web'deki Zoom gerçek görüşmelerde iki yönlü kullanıldı (İngilizce ve Türkçe); Teams ve Zoom'da sessize alma algılaması ve altyazı alanı henüz denetleniyor. Teknik notlar: [MEET.tr.md](MEET.tr.md), [TEAMS.tr.md](TEAMS.tr.md), [ZOOM.tr.md](ZOOM.tr.md). Çeviri gerçek videolarda, Çince dahil, iki yönde kullanıldı. Önemli bir toplantıdan önce bir deneme yap.
>
> Masaüstü Teams ve Zoom uygulamaları desteklenmez: tarayıcı eklentileri yalnızca tarayıcıda çalışır. Teams toplantısına **"Bu tarayıcıda devam et"** ile, Zoom toplantısına tarayıcıdan katıl.

---

## Ne yapar

**Teams, Meet ya da Zoom görüşmesinde**

- Görüşmeyi sekme sesi yakalamayla, seni mikrofonundan dinler; iki tarafı da yazıya döker, çevirir ve sonucu seslendirir.
- Çevrilmiş sesin, mikrofonunun yerine görüşmeye gider. Görüşme her zamanki gibi çalışır; görüşmede sessize almak, karşıya gidecek her şeyi durdurur.
- Her yön için bir mod: **Sesli çeviri**, **Sadece altyazı** ya da **Kapalı**; görüşme sırasında açılır pencereden ya da sayfadaki panelden değiştirilebilir. Sesli çeviride yalnızca çeviriyi duyarsın; sadece altyazıda ya da kapalıyken karşı tarafı normal duyarsın.
- Kendi ses klonun (ElevenLabs), ayarlar sayfasında kaydedilir. Karşı tarafın sesi yalnızca onun kabul ettiğini onayladıktan sonra klonlanır ve klon görüşme bitince silinir.
- İsteğe bağlı görüşme kaydı: görüşme sekmesinin görüntüsü ve iki tarafın sesi, yalnızca bu bilgisayara MP4 olarak kaydedilir.
- Her görüşmenin ve videonun dökümü: ne söylendiği, kimin söylediği, ne zaman söylendiği ve çevirisi; bu bilgisayarda saklanır, metin (`.txt`) ya da altyazı (`.srt`) olarak kaydedilir.
- Yankı koruması, kulaklıksız görüşmeler için hoparlör modu, kendiliğinden yeniden bağlanma ve görüşmenin mikrofonunu kendiliğinden takip etme.
- Görüşmenin hiç bağlantısı kalmadıktan 30 saniye sonra çeviri kendiliğinden durur; `Alt+Shift+T` ya da açılır pencere hemen durdurur.

**Diğer her sekmede (YouTube, X, çevrimiçi radyo)**

- O sekmede eklentiye tıkla ve **Bu sekmeyi çevir** de. Konuşulan dil kendiliğinden algılanır ya da ayarlardan seçilir. Sekmenin sesi sayfanın altında altyazıya (tam ekranda YouTube oynatıcısının içine taşınır) ya da orijinal %20'ye kısılırken sesli çeviriye dönüşür.
- Yalnızca o sekmeye, yalnızca senin tıklamandan sonra erişilir; sekmeye hiçbir şey geri gönderilmez. Aynı sitede başka bir videoya geçince çeviri devam eder.

**Her yerde**

- Yirmi dil, herhangi ikisi, iki yönde: İngilizce, Türkçe, Almanca, Fransızca, İspanyolca, İtalyanca, Portekizce, Felemenkçe, Lehçe, Rusça, Ukraynaca, Arapça, Yunanca, Rumence, İsveççe, Endonezce, Hintçe, Çince, Japonca ve Korece.
- Film altyazısı gibi: çeviri büyük harflerle, orijinal altında; iki tarafı, anlık gecikmeyi ve tahmini maliyetli bir kullanım sayacını gösteren bir panel.
- Bir servis hata verdi diye cümle kaybolmaz: çeviri Ollama'dan ikinci bir Ollama sunucusuna, oradan Claude Haiku'ya (Claude anahtarı varsa) geçer; OpenAI, OpenRouter ya da Gemini'den Claude Haiku'ya (anahtar varsa).

> **Önce bunu oku.**
> - Bu ardıl çeviridir: çeviri cümle bittikten sonra başlar. Ses tanıma 0,7 sn sessizlik bekler (0,5 sn seçilebilir), çeviri 0,3–2 sn, seslendirme 0,2–0,5 sn sürer. Uzun bir konuşmada biten cümleler, konuşan devam ederken çevrilir.
> - En kısa gecikme için Ollama ile ya da **Claude Haiku 5.5** ile çevir, **0,5 sn** sessizlik seç ve kısa cümlelerle konuş.
> - **Kulaklık kullan.** Kulaklık yoksa duyduğun çeviri mikrofonuna sızar ve karşı tarafa geri gider. Kulaklığın yoksa ayarlarda **Hoparlör modu**nu aç.
> - Aynı bilgisayardaki iki katılımcı birbirinin sesini bozar. İkinci bir cihazla (telefon) ya da ikinci bir kişiyle dene.
> - Görüşmenin sesi ve metni seçtiğin servislere gider (ElevenLabs, Anthropic, OpenAI, Groq, Soniox). İş toplantısında katılımcılara söyle ve şirketinin kurallarına bak ya da her şeyi kendi sunucularında tut. Birinin sesini klonlamak için onun izni gerekir.

---

## Servislerini seç

| | Ses tanıma ve sesler | Çeviri |
| --- | --- | --- |
| **Barındırılan** | ElevenLabs (Scribe v2 Realtime, Flash v2.5 / v4 Turbo); OpenAI (Whisper, gpt-4o-transcribe, gpt-4o-mini-tts); Groq Whisper (tanıma, hızlı ve ucuz) | Claude Opus, Sonnet ya da Haiku 5.5; OpenAI; OpenRouter (yüzlerce model, tek anahtar); Google Gemini |
| **Tanıma ve çeviri bir arada** | Soniox (`stt-rt-v6`): aynı akışta duyar ve çevirir, en hızlı kurulum; çeviriyi Soniox'un kendi sesleri (`tts-rt-v2`) ya da yukarıdaki seslerden biri seslendirir | Soniox |
| **Kendi sunucuların** | [speech-server/](speech-server/README.tr.md) içindeki ses sunucusu (faster-whisper ve Piper) ya da OpenAI'nin ses API'sini sunan herhangi bir sunucu (Speaches, LocalAI, Kokoro-FastAPI) | Ollama (örneğin `gemma4:12b`) ya da OpenAI API'sini sunan herhangi bir sunucu (LM Studio, vLLM) |

İki sütun ayrı ayrı seçilir. İkisinde de kendi sunucularını kullanırsan görüşmeden hiçbir şey bilgisayarlarının dışına çıkmaz ve hiçbir şey faturalanmaz.

### Soniox: tanıma ve çeviri tek akışta

**Çeviri** altında servis olarak **Soniox**'u seç ve bir [Soniox](https://soniox.com) API anahtarı yapıştır; **Test et** bir akış açar ve reddedilen anahtarı ya da biten bakiyeyi bildirir. Soniox konuşmayı tanır ve aynı akışta, kelime kelime çevirir; çeviri cümle bitmeden başlar: cümle sonunu beklemek ve ayrı bir çeviri isteği yoktur. Duyduğunu çevirdiği için dinlemeyi de Soniox yapar; **Ses tanıma ve sesler** altındaki servis yalnızca çeviriyi seslendirir ve ayarlar sayfası bunu yazar. O servis de Soniox olabilir: her biri her dili konuşan yaklaşık 230 ses, açık tutulan tek bir bağlantı üzerinden (bir parçanın ilk sesi istendikten yaklaşık 0,35–0,5 sn sonra). Soniox başka bir çevirmenle ses servisi olarak da seçilebilir: o zaman dinler ve seslendirir, çeviriyi Çeviri bölümündeki servis yapar. Soniox ses saati başına ücret alır (bu yazı yazılırken çeviriyle tanıma saatte yaklaşık 0,12 $, üretilen konuşma saatte yaklaşık 0,70 $); görüşmenin her tarafı ayrı bir akıştır. Panel dinleyen, çeviren ve seslendiren servisi yazar.

### Ne kadar hızlı

Çeviri yan cümle yan cümle seslendirilir: çevrilen bir yan cümle yeterince uzun olunca (yaklaşık 24 karakterden sonra bir virgül, noktalı virgül ya da iki nokta, ya da cümle sonu; boşluk kullanmayan Çince ve Japoncada kendi işaretleri `，、。` sayılır ve bir karakter iki sayılır) sesi istenir ve ses akarak gelir; böylece çevirmen cümleyi bitirmeden ilk kelimeler duyulur. Akıl yürüten modellerden akıl yürütmemeleri istenir (`reasoning_effort: none`, ancak bir model gerektirdiği kadar yükseltilir); OpenRouter'da her model için akıl yürütme kapatılır ve en hızlı sağlayıcı seçilir (`provider.sort: latency`). Seslendirme 20 sn'den fazla geride kalırsa henüz çalınmayan en eski parça atlanır (metni ekranda kalır). Panel gecikmeyi parçalarıyla, son cümlelerin ortalaması olarak gösterir: konuşmanın bitmesini bekleme, ilk çevrilen kelimeler ve sesin ilk duyulması.

### Yabancı kelimeler doğru okunur

Bir ses her şeyi kendi dilinin kurallarıyla okur; Türkçe konuşmadaki İngilizce bir terim ("API", "Apple") ya da İngilizce konuşmadaki Türkçe bir ad ("Şükrü") yanlış çıkabilir. Çeviri seslendirilecekse çevirmen bu kelimeleri nasıl okunduklarıyla işaretler: `[[Apple|epıl]]` ya da `[[Şükrü|Shoo-kroo]]`. Ekranda ve dökümde yalnızca "Apple" ve "Şükrü" görünür. Her sesi tek dil bilen kendi ses sunucun okunuşu okur; karışık metni idare edebildikleri için ElevenLabs ve OpenAI kelimenin kendisini alır, OpenAI'nin `gpt-*-tts` seslerine ayrıca yabancı kelimeleri kendi dillerindeki gibi söylemeleri söylenir. İşaret konmayan yerlerde (Soniox) yerleşik bir yaygın terimler ve markalar listesi ve kısa kısaltmaların harf harf okunması (SGK: "se ge ke") yerel seslere yardım eder; kendi listen de (**Ses tanıma ve sesler › Yabancı kelimelerin okunuşu**, her satıra bir `kelime = okunuşu`) bütün seslerde kullanılır. Ollama'da `gemma4:12b` ile ölçüldü: işaretler iki yönde de düzgün geldi; küçük bir modelin bozduğu işaret temizlenir ve ekranda hiç görünmez.

### Çeviri için Google Gemini

Çeviri servisi olarak **Google Gemini**'yi seç ve [Google AI Studio](https://aistudio.google.com/apikey)'dan aldığın anahtarı yapıştır; anahtarın kullanabildiği modellerin listesi kendiliğinden dolar (ses, görsel, müzik ve gömme modelleri dışarıda kalır). Gemini modellerinin çoğu cevap vermeden önce düşünür; canlı çeviri bunu bekleyemez. Eklenti düşünmeyi her modelin kabul ettiği en düşük seviyeye indirir: önce 0 bütçe, sonra MINIMAL ve LOW seviyeleri, sonra 128 jetonluk bütçe denenir ve modelin kabul ettiği hatırlanır. 11 Kasım 2026'da ölçülen, istekten ilk metne kadar geçen süre: `gemini-3.5-flash-lite` yaklaşık 0,56 sn (varsayılan), `gemini-3.1-flash-lite` 0,56 sn, `gemini-3.5-flash` 0,74 sn, `gemini-3.8-flash` 1,4–2 sn; kendi düşünmesiyle `gemini-3.8-flash` 5,6 sn sürdü. Claude anahtarı varsa Gemini'nin arkasında Claude Haiku durur. Gemini'nin fiyatı panelin tahminine dahil değildir.

### Çeviri için Ollama

Ayarlarda çeviri servisi olarak **Ollama**'yı seç ve sunucunun adresini gir (örneğin `100.101.102.103`; port yazılmazsa 11434 eklenir): tarayıcı o adrese erişim için bir kez izin ister ve modellerin listesi kendiliğinden dolar (yalnızca gömme yapan modeller dışarıda kalır). Bir cümlenin süresini ölçmek için **Test et**'e bas. Tailscale üzerinden masaüstü bir NVIDIA GPU'da ölçüldü: model yüklendikten sonra `gemma4:12b` ve `gemma4:26b` bir cümleyi 0,3–0,6 sn'de çeviriyor. Arkasında başka bir bilgisayardaki ikinci bir sunucu, sonra Claude Haiku (anahtar varsa) durabilir.

Ollama, tanımadığı bir `Origin` başlığı taşıyan istekleri reddeder ve tarayıcılar her POST isteğinde bu başlığı gönderir. Eklenti bu başlığı ayarlardaki sunuculara giden kendi isteklerinden kaldırır (yalnızca bu eklentinin başlattığı isteklerle sınırlı bir `declarativeNetRequest` kuralı); bu yüzden **`OLLAMA_ORIGINS` ayarı gerekmez**. Bir web sayfasının aynı sunucuya isteği kendi kaynağını taşımaya devam eder ve reddedilir.

### ElevenLabs yerine kendi ses sunucun

NVIDIA GPU'lu bir Ubuntu bilgisayarda:

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter/speech-server && sudo ./install-ubuntu.sh
```

Bu, faster-whisper'ı (`large-v3-turbo`) ve 20 dilin 16'sı için sesleriyle Piper'ı (Piper'da sesi olmayan Yunanca, Endonezce, Japonca ve Korece hariç) 8765 portunda bir servis olarak kurar ve adresi ile anahtarı yazar. Ayarlarda **Ses tanıma ve sesler** altında **Kendi ses sunucum**'u seç, ikisini gir ve **Test et**'e bas; sonra tanıma modelini (Whisper) ve sesleri sunucunun listelerinden seç. Yalnızca İngilizce bilen modeller (`distil-large-v3`, `*.en`) böyle işaretlidir ve yalnızca İngilizce konuşma için kullanılır; başka dildeki konuşma `large-v3-turbo`'ya gider, çünkü yalnızca İngilizce bilen bir model onu İngilizceye çevrilmiş gibi yazar. Tailscale üzerinden ölçüldü: bir cümle bittikten yaklaşık 1,1–1,3 sn sonra tanınır (bunun 0,7 sn'si cümleyi bitiren sessizliktir) ve 0,2 sn'den kısa sürede seslendirilir. Konuşma, sesi müzikten ve efektlerden ayıran Silero VAD ile bulunur; böylece bir filmin müziği cümle sonlarını gizlemez; 6 sn boyunca konuşma bulunamayan yüksek ses yine de Whisper'a verilir. Çince ve Japonca noktalama işaretleriyle yazılır (sunucu 2.0.1); böylece biten cümleleri, konuşan devam ederken çevrilir. Bu modda ses klonlama yoktur. Ayrıntılar: [speech-server/README.tr.md](speech-server/README.tr.md).

### OpenAI uyumlu ses

**Ses tanıma ve sesler** altında **OpenAI uyumlu**'yu seç; sonra tanıma ve ses için ayrı ayrı bir sunucu (OpenAI, tanıma için Groq ya da başka bir sunucunun adresi), bir anahtar ve bir model seç; listeler sunucudan gelir. OpenAI ya da Groq'ta boş bırakılan anahtar, aynı servisin Çeviri bölümündeki anahtarını kullanır. **Test et**, ses sunucusuyla bir cümle seslendirir ve tanıma sunucusuyla geri dinler.

Bu servisler canlı akış yerine bütün kayıtlar alır: eklenti konuşmayı kendisi cümlelere böler ve her birini bitince gönderir; bu yüzden canlı taslak yoktur ve uzun bir cümle 15 sn'de kesilir. Fiyatları panelin tahminine dahil değildir.

---

## Gerekenler

- Chrome 116 ya da daha yenisi, Edge ya da Brave
- Node.js 18 ya da daha yenisi, yalnızca eklentiyi kaynaktan derlemek için
- Ses için: bir ElevenLabs API anahtarı (ses klonlama ücretli plan ister), bir OpenAI ya da Groq anahtarı ya da kendi ses sunucun; tek akışta duyup çevirmek için isteğe bağlı olarak bir Soniox anahtarı
- Çeviri için: Claude, OpenAI, OpenRouter, Google Gemini ya da Soniox API anahtarı, ya da kendi sunucun (Ollama, LM Studio, vLLM)
- Görüşmeler için kulaklık

---

## Kurulum

**Chrome Web Store'dan** (Chrome, Edge, Brave): [mağaza sayfasını](https://chromewebstore.google.com/detail/opaicinhommdnfhikkmlgjcalkohnkhl) aç ve **Chrome'a ekle**'ye bas. Kendini günceller. Ayarlar sayfası kendiliğinden açılır; adım adım kılavuz [SETUP.tr.md](SETUP.tr.md).

**Kaynaktan**, kodu değiştirmek ya da henüz yayınlanmamış bir sürümü çalıştırmak için:

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter
npm install
npm run build
```

Windows PowerShell'de, macOS'ta ve Linux'ta aynı şekilde çalışır. Sonra `chrome://extensions` (`edge://extensions`, `brave://extensions`) sayfasını aç, Geliştirici modunu aç, **Paketlenmemiş öğe yükle**'yi seç ve `dist` klasörünü seç. Ayarlar sayfası kendiliğinden açılır; adım adım kılavuz [SETUP.tr.md](SETUP.tr.md).

Eklentinin tek kopyası kalsın: `dist`'i yüklemeden önce mağaza kopyasını kaldır ya da birini kapat. Her birinin kendi eklenti kimliği olduğu için ayarlar ve anahtarlar ikisi arasında taşınmaz. Değişiklikleri çektikten sonra `npm install` ve `npm run build` komutlarını yeniden çalıştır, eklentide yenile düğmesine bas ve görüşme sekmesini yenile (F5).

`npm run zip`, derler ve `dist`'i Chrome Web Store'a yüklenen `live-interpreter-<sürüm>.zip` dosyasına paketler; macOS ve Linux'ta `zip` komutunu, Windows'ta yerleşik `tar`'ı kullanır.

---

## Nasıl çalışır

```text
görüşme sekmesinin sesi -> ses tanıma (onların dili) -> çeviri -> seslendirme -> kulaklığın ve altyazılar
mikrofonun              -> ses tanıma (senin dilin)  -> çeviri -> seslendirme -> mikrofonunun yerine görüşmeye
video sekmesinin sesi   -> ses tanıma                -> çeviri -> altyazı ya da orijinalin üzerine ses

ses tanıma ve seslendirme: ElevenLabs, OpenAI uyumlu bir servis ya da ses sunucusu
çeviri: seçilen servis (Claude, OpenAI/uyumlu, OpenRouter, Gemini, Ollama -> ikinci Ollama) -> anahtar varsa Claude Haiku
Soniox ile: Soniox tek akışta duyar ve çevirir -> seslendirme
```

| Parça | Nerede çalışır | Ne yapar |
| --- | --- | --- |
| `src/shared/platforms.js` | Her yerde | Siteye özgü her şey: görüşme adresleri, sessize almanın mikrofon düğmesinden okunması, sitenin altyazı alanı, hangi sekmelerin video sekmesi olduğu |
| `src/content/page-hook.js` | Görüşme sayfası | Sayfanın `RTCRtpSender`'ındaki mikrofon izini çeviri iziyle değiştirir (Zoom'da mikrofonu sayfanın istediği yerde değiştirir), sessize almayı yansıtır |
| `src/content/bridge.js` | İçerik betiği | Sayfayı motora bağlar, paneli ve altyazıları gösterir (video sekmesine yalnızca tıklamadan sonra konur) |
| `src/offscreen/engine.js` | Ekran dışı belge | Sekme sesi yakalama, mikrofon, ses tanıma, çeviri, seslendirme, ses klonu, kayıt |
| `src/offscreen/stt.js` | Ekran dışı belge | Gerçek zamanlı ses tanıma istemcisi (ElevenLabs ya da ses sunucusu): yeniden bağlanır, bağlanırken sesi tutar |
| `src/offscreen/soniox.js` | Ekran dışı belge | Soniox: tanıma ve çeviri tek akışta |
| `src/offscreen/openai-speech.js`, `segmenter.js` | Ekran dışı belge | OpenAI uyumlu tanıma ve sesler; bütün kayıt alan servisler için konuşmayı cümlelere böler |
| `src/offscreen/tts.js`, `pipeline.js` | Ekran dışı belge | Yan cümle yan cümle, sırayla ve gecikmeyi denetim altında tutarak seslendirme |
| `src/offscreen/fallback-translator.js` | Ekran dışı belge | Bir çevirmenin önünde bir başkası |
| `src/offscreen/translator.js` | Ekran dışı belge | Claude ve her çeviri servisine verilen talimatlar ve örnekler |
| `src/offscreen/openai-translator.js`, `gemini-translator.js`, `ollama-translator.js` | Ekran dışı belge | OpenAI, OpenRouter ve uyumlu sunucular; düşünmesi modele göre kısılan Google Gemini; cümle cümle akan Ollama |
| `src/offscreen/voice-clone.js` | Ekran dışı belge | ElevenLabs ses klonları: seninki ve izinle karşı tarafınki |
| `src/shared/pronounce.js` | Her yerde | Yabancı kelimelerin doğru okunuşu: işaretler, yerleşik liste ve seninki |
| `src/shared/transcript.js`, `recordings.js` | Her yerde | Bu bilgisayarda saklanan dökümler ve görüşme kayıtları |
| `src/shared/settings.js` | Her yerde | Ayarlar, varsayılanları ve her dilin hangi Whisper modelini kullanabileceği |
| `src/shared/servers.js` | Her yerde | Kendi sunucuların: adresler, erişim, Ollama için Origin başlığı kuralı |
| `src/popup/`, `src/options/`, `src/recording/` | Eklenti sayfaları | Araç çubuğu penceresi, ayarlar sayfası, kayıtlar ve dökümler sayfası |
| `src/background/service-worker.js` | Service worker | Oturumları başlatır ve durdurur, her mesajı kimin gönderdiğini denetler, açılır pencere için durumu tutar |
| `speech-server/` | Senin bilgisayarın (Python) | faster-whisper ve Piper, ElevenLabs API'sinin eklentinin kullandığı kısmının arkasında |

---

## Testler

```bash
npm test                 # birim testleri
npm run test:e2e         # test derlemesi yapar, Chromium'a yükler; sahte görüşmeleri, sunucuları ve bir video sekmesini çalıştırır
ONLY=soniox,local npm run test:e2e   # yalnızca adı bu kelimelerden birini içeren test grupları
npm run test:scenarios   # tek bir sahte görüşmeyi yeniden başlatmalar, hatalar, ayar değişiklikleri ve ayrılma içinden geçirir
npm run test:api         # ElevenLabs ve Claude'un canlı denetimi (anahtarlar .env'de)
npm run test:soniox      # bir Soniox anahtarının canlı denetimi (bir sentin küçük bir kısmı; anahtar .env'de)
node test/ollama/live.mjs 100.101.102.103 gemma4:12b   # bir Ollama sunucusunun ayarlar sayfası üzerinden canlı denetimi
cd speech-server && python -m pytest tests           # ses sunucusu: protokol, bölme, anahtarlar, web sayfası reddi
```

- Uçtan uca testler anahtar istemez ve hiçbir ücret doğurmaz. Sahte Meet ve Zoom görüşmelerinin yanında kaydı, sahte bir Ollama sunucusunu (gerçeği gibi her `Origin` başlığını reddeder), sahte OpenAI çevirisini ve seslendirmesini, sahte bir Soniox akışını, yedek motorlarla gerçek ses sunucusunu, ElevenLabs ve Claude olmadan bir görüşmeyi ve bir video sekmesini kapsar. `.env`'de anahtarlar varsa gerçek ElevenLabs ve Claude üzerinden de bir tur yaparlar; `SKIP_REAL=1` bunu atlar.
- `test/meet/` gerçek servislerle daha yavaş denetimleri içerir: gerçek bir Google Meet görüşmesi (`live.mjs`), dört kişilik bir yedek görüşme (`group-call.mjs`) ve kaydedilmiş iki yönlü bir gösteri (`mock-call-demo.mjs`).
- `--test` ile derlenirler (`npm run build:test`); bu, panelin gölge kökünü onlar için açık bırakır ve `127.0.0.1` ile sahte video sitesine erişim verir; normal derlemede ikisi de yoktur.
- Konuşma örnekleri macOS `say` komutu ve ffmpeg ile, sertifikaları openssl ile yapılır. Windows'ta hazır `english.wav`, `turkish.wav` ve `tone.wav` dosyalarını (48 kHz mono) `test/e2e/fixtures` içine koy ve openssl için Git'in `usr\bin` klasörünü PATH'e ekle. Ses sunucusu testleri `speech-server/requirements-test.txt` kurulu bir Python ister.
- Canlı testlerin anahtarları yerel bir `.env` dosyasına konur (bkz. `.env.example`). `.env` git tarafından yok sayılır; asla commit etme.
- Hata ayıklama derlemesi (`npm run build:debug`), görüşme sayfasında `localStorage['meet-tercuman-debug'] = '<port>'` ayarlıyken ve `node test/meet/debug-sink-server.mjs <port>` çalışırken ses tanımaya giden sesi ve dökümleri `127.0.0.1`'e kopyalayabilir. Normal derleme bu ayarı yok sayar.

---

## Güvenlik

Eklentinin verilerinle ne yaptığı: [gizlilik politikası](PRIVACY.tr.md) ([English](PRIVACY.md)).

- Kendine ait bir arka uç, analitik ve uzaktan kod yok: her şey eklentinin içinde gelir.
- Kaynak kodda hiçbir API anahtarı yok. Anahtarlar ayarlar sayfasına yazılır, `chrome.storage.local` içinde saklanır ve yalnızca ait oldukları servise gönderilir. Kendi sunucularına yalnızca girdiğin adreslerden, tarayıcı her biri için senden izin istedikten sonra ulaşılır; ses sunucusu ayrıca kendi anahtarını ister ve web sayfalarından gelen istekleri reddeder.
- Bir video sekmesine yalnızca orada eklentiye tıkladıktan sonra erişilir (`activeTab`); eklenti bütün sitelere erişim istemez. Zoom'a erişim yalnızca orada ilk kez çeviri başlattığında istenir.
- Görüşme sayfasının içindeki betik hiçbir ağ isteği yapmaz. Ses ona özel bir `MessagePort` üzerinden ulaşır; bu port yalnızca sayfanın kendi kaynağına ve yalnızca kanca cevap verene kadar sunulur.
- Görüşme sayfasının bildirdikleri (sessizde mi, mikrofonu ne) doğru türde bilinen alanlara indirgenir; belirsiz olan her şey sessizde sayılır. Sessizdeyken, karşıya çeviri kapalıyken ya da görüşme başlamadan görüşmeye hiçbir şey gitmez.
- Service worker ve motor her mesajı kimin gönderdiğini denetler: bir içerik betiği yalnızca selam verebilir ve kendi oturumunu durdurabilir; mod değerleri bir listeye göre denetlenir.
- Panel ve altyazılar kapalı gölge kökler kullanır; sayfanın betikleri dökümleri okuyamaz. Yalnızca test ve hata ayıklama derlemeleri onları açık bırakır.
- Karşı tarafın sesi yalnızca izin kutusunu işaretledikten sonra klonlanır ve bu ayarı değiştirmedikçe klon görüşmeden sonra silinir. Kayıtlar ve dökümler, sen kaydedene ya da silene kadar bilgisayarındaki eklenti deposunda kalır; yalnızca son 50 döküm tutulur.

---

## Maliyetler

Panel bir görüşmenin kullandıklarını sayar ve maliyeti liste fiyatlarından tahmin eder (28 Ekim 2026): Scribe v2 Realtime etkin yön başına saatte 0,39 $, Flash v2.5 ve v4 Turbo seslendirme 1.000 karakter başına 0,04 $; Claude token başına faturalanır (en ucuzu Haiku 5.5). Sadece altyazı modu seslendirme yapmaz. Ücretsiz çeviri, Ollama ve kendi ses sunucun hiçbir ücret doğurmaz; panel onları 0 $ sayar. OpenAI ve OpenRouter da token başına, Soniox ses saati başına faturalar; ama fiyatları tahmine dahil değildir.

---

## Sürümler

Sürüm açılır pencerede ve ayarlar sayfasının üstünde görünür; her sürümde neyin değiştiği [CHANGELOG.md](CHANGELOG.md) dosyasındadır (İngilizce) ve her sürümün bir git etiketi vardır (`v2.5.0`). Chrome Web Store kopyası kendini günceller; kaynaktan derlenen kopya `git pull` ve `npm run build` ile güncellenir. Ses sunucusu kendi sürümünü ve protokolünü bildirir; sunucunun güncellenmesi gerekirse eklenti bunu söyler.

---

## Emeği geçenler ve lisans

İngilizce arayüzde adı Live Interpreter. UfukNode'un Google Meet eklentisine dayanır. [MIT](LICENSE). Ses sunucusu ayrıca kurulan faster-whisper (MIT) ve piper-tts (yeni sürümlerinde GPL-3.0) kullanır; her Piper sesinin kendi lisansı vardır.
