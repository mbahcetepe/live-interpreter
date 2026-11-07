# Yerel ses sunucusu

[English](README.md) · **Türkçe**

Live Interpreter'ın (Canlı Tercüman) ses tanıma ve seslendirme işini ElevenLabs yerine **kendi bilgisayarınızda** yapar:

- **Ses tanıma:** [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (varsayılan model `large-v3-turbo`, NVIDIA GPU'da)
- **Seslendirme:** [Piper](https://github.com/OHF-Voice/piper1-gpl) (20 dilin 16'sı için ses, CPU'da da hızlı)

Sunucu, eklentinin zaten kullandığı ElevenLabs arayüzünün aynısını konuşur. Eklentide yalnızca adres değişir. Ücret ve kota yoktur, ses ağınızın dışına çıkmaz.

Çeviri için aynı bilgisayardaki **Ollama** kullanılabilir (eklenti ayarları, 6. Çeviri, "Ollama"). İkisi birlikte açıldığında çeviri hattının hiçbir parçası dış servise gitmez.

## Sınırlar

- **Ses klonu yok.** Seslerinizi `local-1`, `local-2` ... arasından seçersiniz. Her ses, konuşulan dile göre o dilin Piper sesiyle okunur.
- **Gecikme biraz daha fazla.** Whisper akış halinde çalışmaz. Sunucu sesi cümle sonlarında bölüp yazıya döker; konuşma sürerken her 0,8 saniyede bir taslak gönderir. Ölçülen: cümle bittikten 1,1–1,3 saniye sonra kesin metin (0,7 saniyesi cümle sonunu belirleyen sessizlik), seslendirme 0,2 saniyenin altında.
- **Gürültü ve filmler.** Konuşmanın nerede başlayıp bittiğini [Silero VAD](https://github.com/snakers4/silero-vad) (faster-whisper ile gelir) belirler; sesi müzikten ve efektlerden ayırır. Konuşmayla aynı yükseklikteki film müziğinde, denemede 16 cümlenin 16'sı doğru ayrıldı; yalnızca ses yüksekliğine bakan önceki yöntem hiçbirini ayıramamıştı. Müzik diyalogu bastırıyorsa Silero konuşmayı duymayabilir: o zaman 6 saniye boyunca yüksek ses sürerse bölüm yine de Whisper'a verilir, yalnızca müzikse geri metin dönmez. Bu durumda bazı cümleler kaçabilir.
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
| `WHISPER_MODEL` | large-v3-turbo | Daha hızlısı için `medium` ya da `small` |
| `WHISPER_DEVICE` / `WHISPER_COMPUTE` | cuda / float16 | GPU yoksa `cpu` / `int8` |
| `PIPER_VOICES` | voices/voices.json | Dil başına ses listesi |

## Eklentide

1. Ayarlar, **1. API anahtarları**, **Ses tanıma ve sesler** alanında **Kendi ses sunucum**'u seçin.
2. Adresi (örneğin `100.65.147.84`; port yazılmazsa 8765 eklenir) ve anahtarı girin.
3. **Test et ve izin ver** düğmesine basın. Tarayıcı bu adrese erişim izni ister; izin verin. Sonuç satırında ses sayısı, seslendirme süresi ve "canlı ses tanıma hazır" yazmalı.

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
