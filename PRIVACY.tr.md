[English](PRIVACY.md)

# Live Interpreter (Canlı Tercüman) gizlilik politikası

Son güncelleme: 8 Kasım 2026

Canlı Tercüman, web'deki Microsoft Teams, Google Meet ve Zoom görüşmelerinde ve video ya da radyo sekmelerinde konuşmayı çeviren bir tarayıcı eklentisidir. Bu sayfa verilerinle ne yaptığını anlatır.

**Kısaca:** Eklentinin kendine ait bir sunucusu yoktur ve geliştiricisi için hiçbir veri toplamaz. Ses ve metin, yalnızca çeviriyi yapmak için, ayarlarda seçtiğin ses ve çeviri servislerine, senin anahtarlarınla gider. Eklentinin sakladığı her şey bilgisayarındaki tarayıcıda kalır.

## Eklentinin işlediği veriler

| Veri | Ne zaman | Nereye gider |
| --- | --- | --- |
| Görüşme sekmesinin sesi (karşı tarafın konuşması) ve mikrofonun | Teams, Meet ya da Zoom sekmesinde çeviri sürerken | Seçtiğin ses tanıma servisine |
| Video ya da radyo sekmesinin sesi | Yalnızca o sekmede Bu sekmeyi çevir düğmesine bastıktan sonra | Seçtiğin ses tanıma servisine |
| Tanınan metin | Çeviri sürerken | Seçtiğin çeviri servisine; çeviri, seslendirilmek için seçtiğin ses servisine |
| Ses klonu için ses örnekleri | Yalnızca ayarlarda kendi sesini kaydettiğinde ya da karşı tarafın onay verdiğini doğruladıktan sonra | Klonu oluşturmak için ElevenLabs'e. Karşı tarafın klonu, bu ayarı değiştirmedikçe görüşme bitince silinir |
| Girdiğin API anahtarları ve sunucu adresleri | Ayarları kaydettiğinde | Eklentinin deposunda saklanır; her anahtar yalnızca ait olduğu servise gönderilir |
| Ayarlar | Değiştirdiğinde | Eklentinin deposunda saklanır |
| Görüşme kayıtları (isteğe bağlı, sen başlatmadıkça kapalı) | Kaydetmeyi seçtiğin görüşmede | Sen kaydedene ya da silene kadar bilgisayarında kalır |
| Dökümler (varsayılan olarak açık, kapatılabilir) | Her çeviride | Bilgisayarında kalır; son 50 döküm saklanır, eskiler silinir |

## Seçebileceğin servisler

Eklenti ses ya da metni yalnızca ayarlarda seçili servislere, yalnızca çeviri sürerken ya da bir Test düğmesine bastığında gönderir. Her servis veriyi kendi gizlilik politikasına göre işler:

- Tek akışta ses tanıma ve çeviri: Soniox.
- Ses: ElevenLabs, OpenAI, Groq ya da kendi çalıştırdığın bir ses sunucusu (örneğin bu projedeki sunucu, Speaches, LocalAI ya da Kokoro).
- Çeviri: Anthropic (Claude), OpenAI ya da aynı API'yi sunan bir sunucu, OpenRouter, kendi çalıştırdığın bir Ollama sunucusu ya da Soniox.

Kendi ses sunucun ve kendi Ollama sunucunla ses ve metin, senin denetimindeki bilgisayarlardan hiç çıkmaz.

## Eklentinin yapmadıkları

- Kendine ait bir sunucusu yoktur ve geliştiricisine hiçbir şey göndermez: istatistik, hata raporu, izleme ya da reklam yoktur.
- Verilerini satmaz ya da paylaşmaz; başlattığın çeviri dışında hiçbir iş için kullanmaz.
- Ziyaret ettiğin sayfaları okumaz. Teams, Meet ve Zoom sayfalarında yalnızca görüşmenin sesini yönlendirir, panelini ve altyazılarını gösterir; başka bir sekmede, orada çeviri başlatana kadar hiçbir şey yapmaz. Zoom'a (`zoom.us`) erişim izni yalnızca orada ilk kez çeviri başlattığında istenir ve tarayıcının eklenti ayarlarından geri alınabilir.
- İnternetten indirilen kodu çalıştırmaz.

## Denetim sende

- Çeviriyi istediğin an panelden, araç çubuğundaki düğmeden ya da `Alt+Shift+T` ile durdurabilirsin.
- Kayıtları ve dökümleri Kayıtlar ve dökümler sayfasından silebilir, dökümleri ayarlardan kapatabilirsin.
- Eklentiyi kaldırmak; ayarlarını, anahtarlarını, kayıtlarını ve dökümlerini tarayıcıdan siler.

Bir görüşmeyi çevirirken ya da kaydederken görüşmedekilere söyle; bazı ülkelerde yasa onlardan izin almayı şart koşar.

## Değişiklikler ve iletişim

Bu politikadaki değişiklikler, yukarıdaki tarihle birlikte bu sayfada yayımlanır. Sorular için: https://github.com/mbahcetepe/live-interpreter/issues adresinde bir kayıt (issue) aç.
