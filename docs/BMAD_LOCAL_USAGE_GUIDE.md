# 🚀 BMAD Lokal Kullanım Kılavuzu

## ✅ Kurulum Tamamlandı!

BMAD Expert Mode başarıyla build edildi ve lokal olarak kullanıma hazır!

---

## 📦 Paket Durumu

| Durum                   | Açıklama                      |
| ----------------------- | ----------------------------- |
| ✅ **Build Başarılı**   | TypeScript derleme tamamlandı |
| ✅ **Testler Geçti**    | 42/42 test başarılı (%100)    |
| ✅ **npm link Aktif**   | Lokal binary hazır            |
| ✅ **Production Ready** | Kullanıma hazır               |

---

## 🎯 Lokal Olarak Kullanım

### 1. Terminal'i Yeniden Başlat

npm link sonrası terminali kapatıp tekrar açın (PATH güncellenmesi için).

### 2. Qwen Code'u Çalıştır

```powershell
# Herhangi bir dizinde
qwen
```

### 3. BMAD Modunu Etkinleştir

```powershell
# Qwen içinde
/mode
# → "BMAD Expert Mode" seçin
# → "Yes" ile onayla
# Terminal otomatik restart olacak
```

### 4. BMAD Komutlarını Kullan

#### Full Workflow (Orchestrator)

```powershell
qwen
/bmad-orchestrator

# Ardından projenizi tanımlayın:
"Build a todo app with React frontend and Node.js backend"
```

#### Bireysel Ajanlar

```powershell
# PRD oluştur
/bmad-pm

# Mimari tasarla
/bmad-architect

# Kod yaz
/bmad-dev

# QA review
/bmad-qa
```

---

## 📁 Proje Yapısı

BMAD çalıştığında şu dosyaları oluşturur:

```
proje-dizini/
├── .qwen/
│   ├── bmad-session.json          # Oturum durumu
│   ├── logs/
│   │   └── bmad.log                # Sistem logları
│   └── transactions/               # Geçici transaction dosyaları
│
├── .bmad-core/                     # (Opsiyonel - custom config)
│   ├── agents/                     # Özel ajan tanımları
│   ├── tasks/                      # Özel görev tanımları
│   └── templates/                  # Özel şablonlar
│
├── docs/
│   ├── prd.md                      # Ürün gereksinim dökümanı
│   ├── architecture.md             # Sistem mimarisi
│   ├── ui-spec.md                  # UI tasarımı
│   └── stories/                    # User story'ler
│       ├── story-001.md
│       └── story-002.md
│
└── src/                            # Üretilen kod
    ├── frontend/
    ├── backend/
    └── tests/
```

---

## 🔧 Özellikler

### ✅ Error Handling

- Akıllı hata yönetimi
- Otomatik retry (3 level)
- User guidance desteği

### ✅ Transaction System

- Atomic file operations
- Rollback on failure
- Checkpoint support

### ✅ Logging

- Structured logs
- Secret redaction
- Correlation ID tracking
- Log level: `$env:QWEN_BMAD_LOG_LEVEL="debug"`

### ✅ Session Management

- Otomatik kaydetme
- Resume capability
- Interrupt recovery

---

## 🎮 Komutlar

### Mode Yönetimi

```powershell
/mode                  # Mode seçimi
```

### BMAD Ajanları

```powershell
/bmad-orchestrator     # Full automation
/bmad-analyst          # İlk analiz
/bmad-pm               # PRD oluştur
/bmad-architect        # Mimari tasarla
/bmad-ux               # UI tasarla
/bmad-sm               # Story yazma
/bmad-dev              # Kod yazma
/bmad-qa               # Quality assurance
/bmad-po               # Product owner
```

---

## 🔍 Debug ve İzleme

### Log Seviyesi Ayarla

```powershell
# DEBUG logs göster
$env:QWEN_BMAD_LOG_LEVEL = "debug"
qwen
```

### Log Dosyasını İncele

```powershell
# Real-time log monitoring
Get-Content .qwen\logs\bmad.log -Wait

# Son 50 satır
Get-Content .qwen\logs\bmad.log -Tail 50

# Hataları filtrele
Select-String -Path .qwen\logs\bmad.log -Pattern "error"
```

### Session Durumunu Kontrol Et

```powershell
# Session dosyasını oku
Get-Content .qwen\bmad-session.json | ConvertFrom-Json
```

---

## 🐛 Sorun Giderme

### Problem: "qwen" komutu bulunamıyor

**Çözüm**:

```powershell
# Terminal'i yeniden başlat
# veya
cd C:\Users\mansi\new\qwen\qwen-code\packages\cli
npm link
```

### Problem: BMAD komutları çalışmıyor

**Çözüm**:

```powershell
# Mode'u kontrol et
/mode
# → BMAD Expert Mode seçili olmalı

# Eğer Normal Mode'daysa:
/mode
# → BMAD Expert Mode seç → Restart
```

### Problem: Session corrupted

**Çözüm**:

```powershell
# Session dosyasını temizle
Remove-Item .qwen\bmad-session.json -ErrorAction SilentlyContinue

# Yeniden başlat
qwen
/bmad-orchestrator
```

### Problem: Transaction failed

**Çözüm**:
Sistem otomatik rollback yapar. Logları kontrol edin:

```powershell
Get-Content .qwen\logs\bmad.log -Tail 100
```

---

## 📊 Performans İpuçları

### 1. Temp Dosyalarını Temizle

```powershell
# Transaction temp files
Remove-Item .qwen\transactions\* -Recurse -Force -ErrorAction SilentlyContinue
```

### 2. Log Dosyası Rotate

```powershell
# Eski logları yedekle
Move-Item .qwen\logs\bmad.log .qwen\logs\bmad-backup.log -ErrorAction SilentlyContinue
```

### 3. Cache Temizle (Gerekirse)

```powershell
# Node modules cache
npm cache clean --force
```

---

## 🎯 Örnek Kullanım Senaryoları

### Senaryo 1: Yeni Proje (Greenfield)

```powershell
# 1. Yeni dizin oluştur
mkdir my-new-project
cd my-new-project

# 2. BMAD'ı başlat
qwen
/mode  # BMAD Expert Mode seç

# 3. Orchestrator'ı çalıştır
/bmad-orchestrator

# 4. Projeyi tanımla
"Build an e-commerce platform with:
- React + TypeScript frontend
- Node.js + Express backend
- PostgreSQL database
- Stripe payment integration
- User authentication
- Product catalog
- Shopping cart
- Order management"

# 5. Bekle ve izle!
# Sistem otomatik olarak:
# ✓ PRD oluşturur
# ✓ Mimari tasarlar
# ✓ UI specs hazırlar
# ✓ User stories yazar
# ✓ Kodu implement eder
# ✓ Testleri yazar
```

### Senaryo 2: Mevcut Proje (Brownfield)

```powershell
# 1. Mevcut proje dizinine git
cd existing-project

# 2. Belirli bir ajan kullan
qwen
/bmad-architect

# Sistem mevcut kodu analiz edip mimari önerir
```

### Senaryo 3: Kesintiye Uğrayan İş

```powershell
# 1. Workflow başlat
qwen
/bmad-orchestrator
# (Çalışırken Ctrl+C ile durdur)

# 2. Daha sonra devam et
qwen
/bmad-orchestrator
# → "Resume from saved session?" → Yes

# Kaldığı yerden devam eder!
```

---

## 🔐 Güvenlik

### Secret Redaction

Tüm API keys, tokens, ve passwords otomatik olarak loglardan temizlenir.

**Örnek**:

```
Input:  "API key is sk_live_1234567890abcdef"
Log:    "API key is [REDACTED]"
```

### Desteklenen Secret Patterns:

- ✅ API keys (`api_key=...`)
- ✅ Tokens (`token=...`)
- ✅ Passwords (`password=...`)
- ✅ Secrets (`secret=...`)

---

## 📈 Monitoring

### Workflow İlerlemesini İzle

```powershell
# Başka bir terminal'de real-time log
Get-Content .qwen\logs\bmad.log -Wait | Select-String "✅|❌|🔄"
```

### Artifact Oluşumunu İzle

```powershell
# docs/ klasörünü izle
Get-ChildItem docs\ -Recurse | Select-Object FullName, LastWriteTime
```

---

## 🎓 İleri Seviye

### Custom Agents Tanımla

```powershell
# .bmad-core/agents/my-agent.md oluştur
mkdir .bmad-core\agents
@"
---
role: Custom Developer
icon: 🔧
---

You are a specialized developer focusing on...
"@ | Out-File .bmad-core\agents\my-agent.md
```

### Custom Tasks Ekle

```powershell
# .bmad-core/tasks/my-task.md oluştur
mkdir .bmad-core\tasks
@"
---
name: Custom Task
description: Does something specific
outputPath: output/result.md
---

Task instructions here...
"@ | Out-File .bmad-core\tasks\my-task.md
```

---

## 📚 Ek Kaynaklar

### Dokümantasyon

- **BMAD_INTEGRATION.md** - Kullanıcı kılavuzu
- **IMPLEMENTATION_SUMMARY.md** - Teknik detaylar
- **BMAD_COMPLETE.md** - Full system docs
- **TEST_RESULTS_SUMMARY.md** - Test raporları

### Test Sonuçları

```powershell
# Testleri çalıştır
cd C:\Users\mansi\new\qwen\qwen-code\packages\cli
npm test -- bmad-integration.test.ts
```

---

## ✅ Checklist

Başlamadan önce kontrol edin:

- [ ] `qwen` komutu çalışıyor
- [ ] BMAD Expert Mode aktif
- [ ] Terminal restart edildi (npm link sonrası)
- [ ] Proje dizininde yeterli disk alanı var
- [ ] `.qwen/` dizini yazılabilir

---

## 🎉 Hazırsınız!

**BMAD Expert Mode kullanıma hazır! 🚀**

Şimdi:

1. Terminal'i yeniden başlatın
2. `qwen` yazın
3. `/mode` ile BMAD Expert Mode'u aktive edin
4. `/bmad-orchestrator` ile tam otonom workflow başlatın

**Happy Coding! 🎨**

---

## 💬 Destek

Sorun mu yaşıyorsunuz?

1. Logları kontrol edin: `.qwen/logs/bmad.log`
2. Session dosyasını inceleyin: `.qwen/bmad-session.json`
3. Debug mode açın: `$env:QWEN_BMAD_LOG_LEVEL="debug"`
4. Testleri çalıştırın ve sonuçları kontrol edin

---

**Son Güncelleme**: 2025-09-30  
**Versiyon**: 1.0.0  
**Durum**: Production Ready ✅
