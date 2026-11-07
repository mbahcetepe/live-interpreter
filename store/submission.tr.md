[English](submission.md)

# Chrome Web Store'a gönderim: adımlar

Mağaza paneli İngilizce olduğu için forma yapıştırılacak cevaplar [submission.md](submission.md) dosyasında, İngilizce. Bu sayfa adımları sırayla anlatır.

1. **Geliştirici hesabı:** https://chrome.google.com/webstore/devconsole adresinde Google hesabınla kaydol, bir kerelik 5 dolar ücreti öde ve e-posta adresini doğrula.
2. **Paket:** `npm run zip` komutu `live-interpreter-<sürüm>.zip` dosyasını üretir. Panelde **New item** düğmesine bas ve bu zip'i yükle. Test ya da hata ayıklama derlemesini (`dist-test/`, `build:debug`) asla yükleme.
3. **Store listing:** Her dil için [listing.md](listing.md) dosyasındaki açıklamayı yapıştır. Kategori: Communication. Görseller `store/images/` klasöründe (`npm run store:images` yeniden üretir).
4. **Privacy practices:**
   - Tek amaç, izin gerekçeleri ve "uzak kod yok" cevabı için submission.md'deki metinleri olduğu gibi yapıştır.
   - Veri kullanımında yalnızca üç kutuyu işaretle: Authentication information, Personal communications ve Website content.
   - Üç taahhüt kutusunu da işaretle.
   - Gizlilik politikası adresi: https://github.com/mbahcetepe/live-interpreter/blob/main/PRIVACY.md
5. **Test talimatları:** İnceleyen kişinin eklentiyi deneyebilmesi için bir çeviri ve bir ses servisi anahtarı gerekir. Bunun için harcama sınırı düşük, geçici anahtarlar oluştur. Anahtarları yalnızca paneldeki test talimatları alanına yaz ve inceleme bitince iptal et. Anahtarlar asla bu depoya girmemeli.
6. **Distribution:** İlk tur için **Unlisted** (yalnızca bağlantıyla kurulabilir) seçmek iyi bir başlangıç. Sonra **Public** yaparsın.
7. **Submit for review:** İnceleme birkaç günden birkaç haftaya kadar sürebilir. Sekme sesi yakalama, mikrofon ve geniş isteğe bağlı site izinleri yüzünden ek soru gelebilir. Bu soruları submission.md'deki gerekçelerle cevapla.

Her yeni sürümde: `package.json` içindeki sürümü artır, `npm run zip` çalıştır, panelde **Package** sekmesinden yeni zip'i yükle ve yeniden incelemeye gönder.
