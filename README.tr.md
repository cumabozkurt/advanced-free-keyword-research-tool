<div align="center">

<img src="web/favicon.svg" width="72" alt="">

# Advanced Free Keyword Research Tool

**25 arama motorunun otomatik tamamlama önerilerinden toplu, uzun kuyruklu anahtar kelime fikirleri — ücretsiz, açık kaynak, API anahtarı yok.**

Google · Bing · YouTube · Yahoo · DuckDuckGo · Yandex · Baidu · Naver · Amazon · eBay · Walmart · TikTok · Wikipedia · Ecosia · Qwant · Brave · Seznam · 360 · Sogou · Quark · Swisscows · Google Görseller / Haberler / Alışveriş / Akademik

[**▶ Web uygulamasını aç**](https://cumabozkurt.github.io/advanced-free-keyword-research-tool/) · [English](README.md) · [Araştırma](RESEARCH.md) · [Uç noktalar](docs/ENDPOINTS.md)

![Ekran görüntüsü](docs/screenshots/app-tr-desktop.png)

</div>

## Özellikler

- **25 arama motoru** (14'ü GitHub Pages üzerinde doğrudan tarayıcıda, 25'inin tamamı CLI / yerel sunucu / GitHub Action ile)
- **Toplu giriş** — yüzlerce kelimeyi yapıştırın veya `.txt` / `.csv` yükleyin
- **Uzun kuyruk genişletme** — alfabe sonek/önek (dile duyarlı: Türkçe `ç ğ ı ö ş ü` dahil), rakamlar, soru kalıpları (`nasıl, nedir, neden…`), niteleyiciler (`için, en iyi, fiyatları, yakınımda…`), kendi önek/sonekleriniz
- **Özyinelemeli tarama** — derinlik kontrolü; yeni öneriler seçili *tüm* motorlarda tekrar sorgulanır
- **Tekilleştirilmiş sonuçlar** — *motor uyumu* puanı (kaç motor aynı ifadeyi önerdi), tekrar sayısı, kelime sayısı, soru işareti, kaynak kelime
- **Filtrele & sırala** — arama, hariç tutulan kelimeler, minimum kelime, sadece sorular
- **Dışa aktarma** — TXT, CSV (Excel için UTF-8 BOM, formül enjeksiyonuna karşı korumalı), TSV, JSON, Markdown, panoya kopyala
- **Nazik tasarım** — motor başına bekleme, paralellik sınırı, en fazla istek sayısı, duraklat / devam / durdur, hata veren motoru otomatik kapatma
- **Dil ve ülke** hedefleme (`hl` / `gl`), 14 Amazon pazaryeri, eBay siteleri
- **Türkçe & İngilizce arayüz**, koyu tema, klavye erişilebilir, mobil uyumlu, ayarlar tarayıcıda saklanır
- **Sıfır bağımlılık, derleme yok** — tarayıcı ve Node aynı ES modüllerini kullanır

## Kullanım yolları

### 1. Tarayıcıda (GitHub Pages)

**https://cumabozkurt.github.io/advanced-free-keyword-research-tool/** adresini açın, kelimeleri yazın, motorları seçin, **Başlat**'a basın.
**Doğrudan** etiketli motorlar hemen çalışır. **Proxy** etiketliler (Amazon, Yandex, Brave, Ecosia, Qwant, Walmart, TikTok…) için 2. veya 5. seçeneğe bakın.

Paylaşılabilir bağlantı: `…/?q=seo+araçları&engines=google,bing,youtube&hl=tr&gl=tr&run=1`

### 2. Yerel sunucu — tarayıcıda tüm motorlar

```bash
git clone https://github.com/cumabozkurt/advanced-free-keyword-research-tool
cd advanced-free-keyword-research-tool
npm start            # → http://localhost:8787  (Node 18+, kurulacak bir şey yok)
```

Uygulama yerleşik proxy'yi otomatik algılar ve tüm motorları açar.

### 3. Komut satırı (CLI)

```bash
node bin/cli.js "seo araçları" -l tr -c tr
node bin/cli.js -f kelimeler.txt -e all -x alpha,questions -d 1 -l tr -c tr -o sonuc.csv -o sonuc.txt
node bin/cli.js "kahve makinesi" -l tr -c tr -e google,yandex,amazon,youtube -o kahve.json
cat kelimeler.txt | node bin/cli.js -e web -x none --format tsv > sonuc.tsv
node bin/cli.js --list-engines
node bin/cli.js --help
```

### 4. Doğrudan GitHub üzerinde — bilgisayar gerekmez

Repoyu fork'layın → **Actions** → **Mine keywords** → **Run workflow**, kelimeleri ve motorları girin → `keywords` artifact'ını indirin (TXT/CSV/TSV/JSON).
İlk 100 sonuç çalışma özetinde görünür. Bu yöntemde tüm motorlar çalışır (sunucu tarafı olduğu için CORS sorunu yok).

### 5. Pages sitesi için kendi proxy'niz (isteğe bağlı)

```bash
cd proxy && npx wrangler deploy      # Cloudflare Workers ücretsiz katman
```

Worker adresini uygulamada **Seçenekler → Proxy URL** alanına yapıştırın. `proxy/wrangler.toml` içinde `ALLOWED_ORIGINS` değerini Pages adresiniz yapın.

## Motorlar

| | Motorlar |
|---|---|
| **Tarayıcıda doğrudan** (JSONP / CORS) | Google, YouTube, Google Görseller, Google Haberler, Google Alışveriş, Bing, Yahoo, DuckDuckGo, Baidu, 360 Search, Naver, Seznam, eBay, Wikipedia |
| **Proxy / CLI ile** | Yandex, Amazon (14 pazaryeri), Walmart, Ecosia, Qwant, Swisscows, Sogou, Quark, Google Scholar, TikTok\*, Brave\* |

\* deneysel. Tüm uç nokta belgeleri: [docs/ENDPOINTS.md](docs/ENDPOINTS.md). Sağlık kontrolü: `npm run check`.

## Mimari

Aynı `web/js/engines.js` (motor kayıtları) ve `web/js/miner.js` (kuyruk, hız sınırı, özyineleme, tekilleştirme) tarayıcıda, CLI'da, yerel sunucuda ve Cloudflare Worker'da çalışır. Ayrıntılar için [README.md](README.md#architecture).

## Geliştirme

```bash
npm test        # birim testleri (bağımlılık yok)
npm run check   # canlı uç nokta kontrolü
npm start       # yerel sunucu
```

Yeni motor eklemek = `web/js/engines.js` içine bir nesne (+ bir ayrıştırıcı testi). Bkz. [CONTRIBUTING.md](CONTRIBUTING.md).

## Sorumlu kullanım

Bu araç **herkese açık otomatik tamamlama uç noktalarını** düşük hızda okur — bir tarayıcının arama kutusunun yaptığı isteklerle aynı.
Varsayılan bekleme sürelerini koruyun, servisleri yormayın ve her sağlayıcının kullanım koşullarına uyun. Captcha veya bot korumasını aşmaz.
Uç noktalar resmî değildir ve her an değişebilir.

## Teşekkür & lisans

[keywordshitter2](https://github.com/wassname/keywordshitter2) (wassname) ve orijinal keywordshitter'dan esinlenilmiştir.
Motor listesi [SearXNG](https://github.com/searxng/searxng) ile karşılaştırılmıştır.

MIT © Cuma Bozkurt
