# Analyse: Aktuelle Prüfung

SwissMon nutzt heute nur einen einfachen HTTP-HEAD-Check (`check-target-status`), der lediglich Status­code und Antwortzeit misst. Bei einem laufenden DDoS (L4/L7) erkennt das System eine Beeinträchtigung erst, wenn der Server komplett antwortet wie tot oder sehr langsam – frühe Anzeichen wie Latenz-Drift, TLS-Verzögerung, Paketverluste oder veränderte Antwort­fingerprints bleiben unsichtbar.

# Vorgeschlagene innovative Netzwerk-Prüfungen

## 1. Multi-Sample Latency Baseline & Drift Detection
- Jeder Check sendet 5 sequentielle HEAD-Requests, speichert p50/p95/jitter.
- Rolling Baseline pro Host (letzte 7 Tage) in neuer Tabelle `target_metrics`.
- Alarm wenn aktuelle p95 > Baseline × 3 ODER Jitter-Spike > 200 ms.
- Erkennt schleichende L7-Sättigung **vor** Vollausfall.

## 2. TLS-Handshake-Timing-Check
- Separate Messung von DNS → TCP-Connect → TLS-Handshake → TTFB.
- Edge Function via Deno `Deno.connect` + `Deno.startTls` mit Timestamps.
- DDoS-Indikator: TCP ok, aber TLS-Handshake > 2 s (typisch bei TLS-Renegotiation-Flood / SSL-Exhaust).

## 3. HTTP/2 & HTTP/3 (QUIC) Reachability-Probe
- Prüft, ob Host noch über h2/h3 erreichbar ist. Viele DDoS-Mitigations downgrade auf h1.
- Plötzlicher Verlust von h3 = aktiver Mitigation-Modus → Frühwarnung.

## 4. CDN-/WAF-Fingerprint-Drift
- Aus Response-Headern Server, CF-Ray, X-Akamai, Via, Set-Cookie `__cf_bm` extrahieren.
- Bei Änderung des Fingerprints (z. B. plötzlich Cloudflare-Challenge statt direkter Antwort) → "Under Attack Mode erkannt".

## 5. Edge-Multi-Region Probing
- Parallele Checks aus 3 Supabase-Edge-Regionen (über `Deno.env.get('DENO_REGION')` / verschiedene gateways via fetch-Proxies wie 1.1.1.1 DoH).
- Wenn nur 1 Region Offline meldet → lokales Routing-Problem, kein Alarm.
- Wenn alle Regionen → globaler Ausfall, hoher Alarm-Score.

## 6. DNS-Health & Hijack-Check
- Auflösung über mehrere DoH-Resolver (Cloudflare 1.1.1.1, Google 8.8.8.8, Quad9).
- Vergleich der A/AAAA-Records: Abweichung = DNS-Poisoning / NS-DDoS.
- TTL-Drop unter 60 s = Mitigation aktiv.

## 7. Content-Integrity-Hash
- GET der Root + Hash der ersten 4 KB.
- Änderung zu "Just a moment…" (Cloudflare Challenge) oder leerer Body während Bot-Attacke wird sofort als Anomalie erkannt.

## 8. Slow-Loris / Connection-Saturation-Probe
- Optional, opt-in: öffnet TCP-Verbindung, sendet 1 Byte/2 s.
- Misst, wie viele gleichzeitige Slow-Connections der Server akzeptiert (Indikator für Anti-Slow-Loris-Mitigation).

## 9. Anomalie-Score & Severity-Ampel
- Statt binär online/offline ein gewichteter Score (0–100) aus:
  Latency-Drift 25 % · TLS-Time 15 % · HTTP-Status 20 % · Fingerprint-Change 15 % · Multi-Region-Konsens 15 % · DNS-Anomalie 10 %.
- Schwellen: 0–30 OK · 31–60 Warning · 61–100 Alert → Telegram/Teams.

## 10. Historisierung & Visualisierung
- Neue Tabelle `target_metrics(host, ts, p50, p95, jitter, tls_ms, status_code, fingerprint, score)`.
- Sparkline-Komponente im `TargetCard` (Recharts) zeigt Score-Verlauf 24 h.

# Umsetzungsschritte

1. **DB**: Migration `target_metrics` + RLS + GRANTs; Erweiterung `notified_hosts` um `last_score`.
2. **Edge Function `check-target-status` v2**:
   - Mehrfach-Sample, TLS-Timing via `Deno.connect`+`startTls`.
   - DoH-Lookup-Helfer.
   - Fingerprint-Extraktion.
   - Rückgabe: detailliertes Metric-Objekt.
3. **Neue Edge Function `deep-probe`** (langsamer, alle 30 min via cron) für Multi-Region, DNS-Multi-Resolver, h2/h3-Test.
4. **`scheduled-scan`**: ruft `deep-probe` parallel auf, berechnet Score, schreibt in `target_metrics`, triggert Notify nur bei Score-Übergang Warning→Alert (verhindert Alarm-Spam).
5. **Frontend**:
   - `TargetCard`: Score-Badge + Sparkline.
   - `Dashboard`: neuer Tab "Anomaly Feed" mit aktuellen Score-Spikes.
   - `NotificationConfig`: Schwellenwert-Slider für Score.

# Out of Scope (bewusst weggelassen)
- Aktive Traffic-Injection / Load-Tests (rechtlich heikel gegen .ch-Ziele).
- ICMP/Ping (Deno Edge unterstützt kein raw ICMP).
- BGP-Looking-Glass (eigenes externes Tooling nötig).

# Nächste Frage an dich
Sollen wir **alle 10** Prüfungen umsetzen, oder zunächst ein **MVP-Set** (1, 2, 4, 6, 9 + Score + Sparkline) als ersten Iterationsschritt? Letzteres liefert ~80 % des Mehrwerts bei deutlich kleinerem Footprint.
