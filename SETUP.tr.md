<div align="center">

# Meet Tercüman kurulumu

[English](SETUP.md) · **Türkçe**

Kurulumdan ilk çevrilen Microsoft Teams görüşmesine adım adım.

</div>

---

## Gerekenler

| Gereksinim | Açıklama |
| --- | --- |
| **Chrome 116+, Edge ya da Brave** | Teams toplantısına bu tarayıcıdan katılacaksın. Masaüstü Teams uygulaması desteklenmez |
| **Node.js 18+** | Eklentiyi derlemek için ([nodejs.org](https://nodejs.org)) |
| **ElevenLabs hesabı** | Ses tanıma ve sesler için. Kendi ses klonun için Starter veya üstü plan gerekir ([planlar](https://elevenlabs.io/pricing)) |
| **Anthropic API anahtarı** | Claude ile çeviri için. Ücretsiz çeviriyi seçersen gerekmez |
| **Kulaklık** | Duyduğun çeviri mikrofonuna girip karşıya geri gitmesin diye |

Eklentinin sunucusu yok; anahtarların yalnızca tarayıcında kalır.

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
4. **Yalnızca bir kopya yüklü olsun.** Daha önce eski bir sürümü yüklediysen onu **Kaldır**. İki kopya yüklüyse sayfa kancası çakışır ve popup sürekli "sekmeyi yenileyin (F5)" der.

Ayarlar sayfası kendiliğinden açılır. Eklentiyi araç çubuğuna sabitle (yapboz simgesi → raptiye). Sağ üstteki **TR** düğmesiyle arayüzü Türkçeye geçir.

## 3. ElevenLabs anahtarı

1. [elevenlabs.io](https://elevenlabs.io) → [Developers › API Keys](https://elevenlabs.io/app/developers/api-keys) → **Create Key**.
2. **Text to Speech** ve **Speech to Text** satırlarını **Access**, **Voices** satırını **Write** yap ve anahtarı oluştur.
3. Anahtarı kopyala (yalnızca bir kez gösterilir), ayarlarda **ElevenLabs API anahtarı** kutusuna yapıştır.

## 4. Çeviri: Claude ya da ücretsiz

- **Claude (önerilen):** [Claude Console › API keys](https://platform.claude.com/settings/keys) sayfasından bir anahtar al ve **Anthropic API anahtarı** kutusuna yapıştır. Hesapta kredi olmalı. **Çeviri modeli** olarak en kısa gecikme için **Claude Haiku 5.5** seç.
- **Ücretsiz:** **Çeviri modeli** olarak **Ücretsiz** seç. Brave'de Chrome'un yerleşik çevirmeni olmayabilir; [DeepL API Free](https://www.deepl.com/pro-api) anahtarı ekle.
- Claude seçiliyken bir cümlede hata verirse o cümleyi ücretsiz çeviri devralır. Bunun için de bir DeepL anahtarı eklemek iyi olur.

**Anahtarları test et** düğmesine bas; yeşil yazı çıkarsa tamamdır.

### İsteğe bağlı: kendi sunucularınız

- **Çeviri için Ollama.** **Çeviri modeli** olarak **Ollama**'yı seç. Sunucunun adresini (örneğin `100.65.147.84`; port yazılmazsa 11434 eklenir) ve modeli (örneğin `gemma4:12b`) gir, **Test et ve izin ver** düğmesine bas. Tarayıcı bu adrese erişim izni ister; izin ver. Sunucuda `OLLAMA_ORIGINS` ayarı gerekmez. İstersen **İkinci sunucu** alanına başka bir bilgisayardaki Ollama'yı ekle. Ollama yanıt vermezse sırayla ikinci sunucu, Claude (anahtar varsa Haiku) ve ücretsiz çeviri devralır. Toplantıyı yapacağın bilgisayar sunucuyla aynı ağda (örneğin Tailscale'de) olmalı.
- **ElevenLabs yerine kendi ses sunucun.** NVIDIA ekran kartlı bir Ubuntu bilgisayarda `cd speech-server && sudo ./install-ubuntu.sh` çalıştır ([ayrıntılar](speech-server/README.md)). Betik sonunda adresi ve anahtarı yazar. Ayarlarda **1. API anahtarları** bölümünde **Ses tanıma ve sesler** alanını **Kendi ses sunucum** yap, adresi ve anahtarı gir, **Test et ve izin ver** düğmesine bas. ElevenLabs anahtarı gerekmez. Ses klonu bu modda yoktur, gecikme biraz artar.

İkisi birlikte açıldığında görüşmenin hiçbir parçası senin bilgisayarlarının dışına çıkmaz.

## 5. Mikrofon, diller, ses

- **Mikrofon iznini ver** düğmesine bas ve tarayıcının sorusuna izin ver. Teams'te kullandığın mikrofonu seç ya da "Görüşmeyle aynı" bırak.
- **Diller:** kendi dilini ve karşı tarafın dilini seç.
- **Benim sesim (isteğe bağlı):** 1–2 dakika okuyarak kendi ses klonunu oluştur ya da hazır bir ses seç.
- **Ses:** "Konuşma bitti sayılması için sessizlik" ayarını **0,5 sn** yaparsan çeviri daha erken başlar. Kulaklık yoksa **Hoparlör modu**nu aç.

## 6. Teams toplantısına tarayıcıdan katıl

1. Toplantı bağlantısını aç. Teams uygulamayı açmayı önerirse **Bu tarayıcıda devam et** seç.
2. Kulaklığı tak, toplantıya katıl.
3. Eklenti Teams sekmesi açıldıktan sonra yüklendiyse ya da yenilendiyse sekmeyi bir kez **F5** ile yenile.

Desteklenen adresler: `teams.microsoft.com`, `teams.cloud.microsoft` (iş/okul hesabı) ve `teams.live.com` (kişisel hesap). Google Meet de çalışır.

## 7. Çeviriyi başlat

Teams sekmesindeyken eklenti simgesine tıkla, modları seç ve **Çeviriyi başlat** de (kısayol: `Alt+Shift+T`).

| Karşı taraf konuşunca | Ne olur | ElevenLabs kredisi |
| --- | --- | --- |
| **Sesli çeviri** | Karşı tarafı kendi dilinde sesli duyarsın | En çok bunu harcar |
| **Sadece altyazı** | Karşı tarafı kendi sesiyle duyarsın, çevirisi yazıyla çıkar | Çok daha az |
| **Kapalı** | Çeviri yok | Harcamaz |

| Ben konuşunca | Ne olur | ElevenLabs kredisi |
| --- | --- | --- |
| **Sesli çeviri** | Seni onların dilinde, seçtiğin sesle duyarlar | Harcar |
| **Kapalı** | Gerçek sesini duyarlar | Harcamaz |

Sayfanın sol altında küçük bir **Meet Tercüman** düğmesi çıkar; tıklayınca iki tarafın cümleleri, gecikme ve maliyet görünür.

**Mikrofonu Teams'te kapatınca** (`Ctrl+Shift+M`) karşıya hiçbir şey gitmemeli. İlk görüşmede bunu mutlaka dene.

Toplantı bitince çeviri, bağlantı kalmadıktan 30 saniye sonra kendiliğinden durur. Hemen durdurmak için popup'ı ya da `Alt+Shift+T` kısayolunu kullan.

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
| "Bu sekme bir Google Meet ya da Microsoft Teams (web) sayfası değil" | Popup'ı Teams sekmesindeyken aç; masaüstü Teams uygulaması desteklenmez |
| "Eklentinin mikrofon izni yok" | Ayarlar → **Mikrofon iznini ver** |
| Karşı taraf beni duymuyor | Teams'te mikrofonun açık mı? Paneldeki uyarıyı oku; **Test sesi gönder** ile dene |
| Karşı taraf anlamsız sesler ya da kendi sözlerini geri duyuyor | Çevirin hoparlörden mikrofona giriyor: kulaklık kullan ya da **Hoparlör modu**nu aç |
| Gecikme fazla | **Claude Haiku 5.5** seç, sessizlik ayarını **0,5 sn** yap, kısa cümlelerle konuş |
| Çeviri kendiliğinden durdu | Panel nedenini yazar (örneğin ElevenLabs kotası doldu). Sorunu giderip yeniden başlat |

## Güncelleme

```bash
git pull
npm install
npm run build
```

Sonra uzantılar sayfasında eklentinin yenile düğmesine bas ve Teams sekmesini F5 ile yenile. Ayarların ve sesin yerinde kalır.

Teams'e özgü teknik notlar ve henüz doğrulanmamış noktalar: [TEAMS.md](TEAMS.md).
