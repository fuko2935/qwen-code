# 🎯 Complete Interactive Session System Implementation Guide

> **Tüm kalan adımlar için eksiksiz kod örnekleri ve implementasyon detayları**

## 📋 İçindekiler

1. [Özet ve Durum](#özet-ve-durum)
2. [Kritik Adımlar (Zorunlu)](#kritik-adımlar)
3. [UI Entegrasyonu (İsteğe Bağlı)](#ui-entegrasyonu)
4. [Test ve Dokümantasyon](#test-ve-dokümantasyon)
5. [Sorun Giderme](#sorun-giderme)

---

## 📊 Özet ve Durum

### ✅ Tamamlanan (Adımlar 1-4)

| Adım | Bileşen             | Dosya                                            | Durum |
| ---- | ------------------- | ------------------------------------------------ | ----- |
| 1    | Session Type System | `packages/core/src/session/types.ts`             | ✅    |
| 2    | SessionContext      | `packages/core/src/session/SessionContext.ts`    | ✅    |
| 2    | SessionStack        | `packages/core/src/session/SessionStack.ts`      | ✅    |
| 2    | SessionManager      | `packages/core/src/session/SessionManager.ts`    | ✅    |
| 3    | Config Integration  | `packages/core/src/config/config.ts`             | ✅    |
| 4    | Event System        | `packages/core/src/subagents/subagent-events.ts` | ✅    |

**Build Durumu:** ✅ PASSING

### ⏳ Yapılacaklar

#### 🔴 Kritik (Zorunlu - 3-4 saat)

- **Adım 13:** RunConfig tip güncellemesi (10 dakika)
- **Adım 5:** Interactive SubAgentScope (2 saat)
- **Adım 7:** TaskTool geliştirmeleri (1 saat)
- **Adım 6:** Nested task desteği (30 dakika)

#### 🟢 İsteğe Bağlı (UI - 2-3 saat)

- **Adım 9:** useSessionManagement hook (1 saat)
- **Adım 10:** SessionIndicator component (30 dakika)
- **Adım 11-12:** App.tsx ve InputPrompt entegrasyonu (1 saat)

#### 🟡 Önerilen (Test & Docs - 2 saat)

- **Adım 16:** Dokümantasyon (1 saat)
- **Adım 17:** Test yazımı (1 saat)

---

## 🔴 Kritik Adımlar

---

## ADIM 13: RunConfig Tip Güncellemesi 🔴

**Süre:** 10 dakika  
**Dosya:** `packages/core/src/subagents/types.ts`  
**Satır:** 252-260

### Mevcut Kod

```typescript
export interface RunConfig {
  /** The maximum execution time for the subagent in minutes. */
  max_time_minutes?: number;
  /**
   * The maximum number of conversational turns (a user message + model response)
   * before the execution is terminated. Helps prevent infinite loops.
   */
  max_turns?: number;
}
```

### Değişiklik
