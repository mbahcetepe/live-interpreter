# Yerel ses sunucusu

[English](README.md) · **Türkçe**

Live Interpreter'ın (Canlı Tercüman) ses tanıma ve seslendirme işini ElevenLabs yerine **kendi bilgisayarınızda** yapar:

- **Ses tanıma:** Whisper (varsayılan model `large-v3-turbo`): NVIDIA GPU'da (ya da işlemcide) [faster-whisper](https://github.com/SYSTRAN/faster-whisper), Apple silicon'un GPU'sunda [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)
- **Seslendirme:** [Piper](https://github.com/OHF-Voice/piper1-gpl) (20 dilin 16'sı için ses, CPU'da da hızlı)

Sunucu, eklentinin zaten kullandığı ElevenLabs arayüzünün aynısını konuşur. Eklentide yalnızca adres değişir. Ücret ve kota yoktur, ses ağınızın dışına çıkmaz.

Çeviri için aynı bilgisayardaki **Ollama** kullanılabilir (eklenti ayarları, Çeviri, "Ollama"). İkisi birlikte açıldığında çeviri hattının hiçbir parçası dış servise gitmez.

## Sınırlar

- **Ses klonu yok.** Seslerinizi `local-1`, `local-2` ... arasından seçersiniz. Her ses, konuşulan dile göre o dilin Piper sesiyle okunur.
- **Gecikme biraz daha fazla.** Whisper akış halinde çalışmaz. Sunucu sesi cümle sonlarında bölüp yazıya döker; konuşma sürerken her 0,8 saniyede bir taslak gönderir. Ölçülen: cümle bittikten 1,1–1,3 saniye sonra kesin metin (0,7 saniyesi cümle sonunu belirleyen sessizlik), seslendirme 0,2 saniyenin altında.
- **Gürültü ve filmler.** Konuşmanın nerede başlayıp bittiğini [Silero VAD](https://github.com/snakers4/silero-vad) (faster-whisper ile gelir) belirler; sesi müzikten ve efektlerden ayırır. Konuşmayla aynı yükseklikteki film müziğinde, denemede 16 cümlenin 16'sı doğru ayrıldı; yalnızca ses yüksekliğine bakan önceki yöntem hiçbirini ayıramamıştı. Müzik diyalogu bastırıyorsa Silero konuşmayı duymayabilir: o zaman 6 saniye boyunca yüksek ses sürerse bölüm yine de Whisper'a verilir, yalnızca müzikse geri metin dönmez. Bu durumda bazı cümleler kaçabilir.
- **Çince ve Japonca.** Whisper bu dillerde noktalamayı çoğu zaman atlar; eklentinin konuşma sürerken bitmiş cümleleri çevirebilmesi için noktalama gerekir. Sunucu 2.0.1'den beri Whisper'a sesten önce o dilde noktalamalı bir cümle verilir. Dil otomatik algılanıyorsa Çince ya da Japonca çıkan bir parça bu cümleyle ikinci kez okunur; bu yalnızca bu iki dilde biraz GPU zamanı harcar.
- **Uydurma satırlar.** Whisper sessizlikten, müzikten ya da video kapanışlarından bazen kimsenin söylemediği bir satır yazar ("İzlediğiniz için teşekkürler", "请不吝点赞 订阅…", "ご視聴ありがとうございました"). İngilizce, Türkçe, Çince ve Japonca bilinenleri atılır; eklenti o parçanın son taslağını kullanır.
- **Ses kalitesi.** Piper anlaşılır ama ElevenLabs kadar doğal değil.
- **Lisans.** piper-tts'in yeni sürümleri GPL-3.0 lisanslıdır ve her Piper sesinin kendi lisansı vardır (sesin `.onnx.json` dosyasına ve model kartına bakın). Kendi kullanımınız için sorun değil; ürünleştirmeden önce kontrol edin.
- **Diller.** Whisper 99 dili tanır ve dil verilmezse kendisi algılar. Piper'ın eklentinin 20 dilinden 16'sı için sesi var; kurulum bunların hepsini indirir. Yunanca, Endonezce, Japonca ve Korece için Piper sesi yok: bu dillerde altyazı çalışır, yerel seslendirme yerine açık bir hata döner. Daha az dil için: `sudo LANGS="en de fr" ./install-ubuntu.sh`.

## Ubuntu'ya kurulum (NVIDIA GPU)

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter/speech-server
sudo ./install-ubuntu.sh
```

Betiğin yaptıkları:

1. `/opt/live-interpreter-speech` altında bir Python ortamı kurar.
2. 16 dil için Piper seslerini indirir (yaklaşık 1,7 GB; `LANGS` ile azaltılabilir). Sesler sunucu açılırken arka planda yüklenir.
3. Rastgele bir anahtar üretir: `/etc/live-interpreter-speech.env`, `SPEECH_KEY`.
4. Sunucuyu `live-interpreter-speech` adlı bir systemd servisi olarak 8765 portunda başlatır.

İlk açılışta Whisper modeli (yaklaşık 1,6 GB) indirilir. Betik en sonda eklentiye girilecek adresi ve anahtarı yazar. Güncellemek için `git pull` sonrası aynı komutu tekrar çalıştırın; anahtar korunur. Eski adla (`meet-tercuman-speech`) yapılmış bir kurulum, anahtarı ve indirilmiş modeliyle birlikte yeni ada taşınır.

Faydalı komutlar:

```bash
systemctl status live-interpreter-speech        # durum
journalctl -u live-interpreter-speech -f        # günlük
sudo systemctl restart live-interpreter-speech  # yeniden başlat
sudo grep SPEECH_KEY /etc/live-interpreter-speech.env   # anahtarı göster
```

Ayarlar `/etc/live-interpreter-speech.env` dosyasındadır:

| Ayar | Varsayılan | Açıklama |
| --- | --- | --- |
| `SPEECH_KEY` | rastgele | Eklentinin gönderdiği anahtar |
| `SPEECH_PORT` | 8765 | Port |
| `WHISPER_MODEL` | large-v3-turbo | Daha hızlısı için `medium` ya da `small`. `distil-large-v3` ve `*.en` yalnızca İngilizce bilir: eklenti (2.4.1 ve sonrası) onları yalnızca İngilizce konuşmada kullanır, diğer dilleri `large-v3-turbo`ya gönderir |
| `WHISPER_ENGINE` | auto | Apple silicon'da `mlx`, diğerlerinde `faster` (faster-whisper) |
| `WHISPER_DEVICE` / `WHISPER_COMPUTE` | cuda / float16 (Ubuntu), auto | `auto`: NVIDIA GPU varsa onu, yoksa `cpu` / `int8` kullanır |
| `PIPER_VOICES` | voices/voices.json | Dil başına ses listesi |

## Windows'a kurulum

NVIDIA ekran kartlı (Whisper onda çalışır) ya da kartsız (Whisper işlemcide, daha yavaş çalışır) bir Windows bilgisayar için. Aynı bilgisayardaki LM Studio ya da Ollama ile birlikte çeviri de ses de o bilgisayarda kalır.

**Setup.exe** (`installer/windows/build-setup.ps1` ile, Inno Setup 6 kullanılarak derlenir): çalıştırın ve adımları izleyin. Henüz imzalı değil, bu yüzden Windows SmartScreen ilk seferde uyarır: **Ek bilgi › Yine de çalıştır**. Ya da betik, `speech-server` içinde PowerShell'de:

```powershell
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

İkisi de oturum açmış kullanıcı için kurar (yönetici yetkisi gerekmez):

1. [uv](https://github.com/astral-sh/uv), Python 3.12 ve paketleri `%LOCALAPPDATA%\LiveInterpreterSpeech` altına getirir. NVIDIA kart varsa NVIDIA'nın CUDA 12 için cuBLAS ve cuDNN paketlerini de ekler (yaklaşık 1,3 GB); önceden kurulu olması gereken tek şey kartın sürücüsüdür.
2. Piper seslerini indirir (daha azı için `-Langs "en tr"`).
3. Rastgele bir anahtar üretir, adresi ve anahtarı `connection.txt` dosyasına yazar (Setup.exe en sonda açar; Başlat menüsünde de durur).
4. Sunucuyu penceresiz olarak hemen ve her oturum açılışında başlatır (Başlangıç klasöründe bir kısayol). İlk açılışta Whisper modeli (yaklaşık 1,6 GB) indirilir.

Varsayılan olarak ağdaki diğer bilgisayarlar da (anahtarla) kullanabilir: Windows bir kez Python'un bağlantı kabul edip etmeyeceğini sorar; özel ağlarda izin verin. Yalnızca bu bilgisayar için Setup.exe'deki kutuyu işaretleyin ya da `-LocalOnly` ekleyin. Günlük: `logs\server.log`. Güncellemek için yeniden çalıştırın (anahtar korunur). Kaldırmak için: Ayarlar › Uygulamalar (Setup.exe) ya da `install-windows.ps1 -Uninstall`.

Sunucu, ortamın `Scripts\pythonw.exe` dosyasıyla değil, Python'un kendi `pythonw.exe` dosyasıyla (`launch.py` üzerinden) çalışır: bazı antivirüs programları (örneğin Acronis Cyber Protect) o küçük başlatıcıyı zararlı yazılım sanıp siler.

## macOS'a kurulum

Apple silicon'da Whisper, [MLX](https://github.com/ml-explore/mlx) ile ekran işlemcisinde (GPU) çalışır (`mlx-whisper`, aynı modeller); Intel Mac'te işlemcide. 16 GB ve üzerinde LM Studio ya da Ollama'daki bir çeviri modeli de aynı Mac'e sığar.

**.pkg paketi** (bir Mac'te `installer/mac/build-pkg.sh` ile derlenir): açın ve adımları izleyin. Henüz imzalı ve noter onaylı değil: ilk seferde sağ tıklayıp **Aç**'ı seçin (ya da Sistem Ayarları › Gizlilik ve Güvenlik › **Yine de Aç**). Ya da betik, `speech-server` içinde Terminal'de:

```bash
./install-mac.sh
```

İkisi de oturum açmış kullanıcı için kurar (sudo gerekmez): uv, Python 3.12, paketler ve sesler `~/Library/Application Support/LiveInterpreterSpeech` altına gider; adres ve anahtar oradaki `connection.txt` dosyasındadır (.pkg onu açar); launchd sunucuyu hemen ve her oturum açılışında başlatır (`~/Library/LaunchAgents/com.liveinterpreter.speech.plist`). İlk açılışta Whisper modeli (yaklaşık 1,6 GB) indirilir. Ağdaki diğer bilgisayarlar anahtarla kullanabilir; yalnızca bu Mac için: `./install-mac.sh --local-only`. Günlük: `logs/server.log`. Güncellemek için yeniden çalıştırın (anahtar korunur). Kaldırmak için: `"~/Library/Application Support/LiveInterpreterSpeech/install-mac.sh" --uninstall`.

## Eklentide

1. Ayarlar, **Ses tanıma ve sesler**, **Servis**: **Kendi ses sunucum**'u seçin.
2. Adresi (örneğin `100.101.102.103`; port yazılmazsa 8765 eklenir) ve anahtarı girin.
3. **Test et** düğmesine basın; tarayıcı bu adrese erişim izni ister, izin verin. Sonuç satırı sunucunun sürümünü yazar ve "canlı ses tanıma hazır" ile biter. Ardından **Ses tanıma modeli**ni ve sesleri seçin; **↻** sunucunun listelerini yeniden getirir.

## Güvenlik

- Anahtar olmadan istekler reddedilir (401). Canlı ses tanıma bağlantısı, sunucunun verdiği ve 60 saniye geçerli tek kullanımlık bir jetonla açılır.
- Bir web sayfasından gelen istekler (http/https kaynaklı) reddedilir (403). Sunucuyu yalnızca eklenti kullanabilir.
- Bağlantı şifresizdir (http/ws). Sunucuyu yalnızca Tailscale ya da yerel ağ üzerinden açın, internete açmayın.

## Geliştirme

Modelsiz ve GPU'suz çalıştırmak ve test etmek için:

```bash
pip install -r requirements-test.txt
python -m pytest tests                                  # protokol ve bölütleme testleri
python server.py --engine fake --port 8765 --key test   # sabit cümle ve ton döndüren sahte motorlar
```

Eklentinin uçtan uca testi (`npm run test:e2e`) bu sunucuyu sahte motorlarla kendisi başlatır.
