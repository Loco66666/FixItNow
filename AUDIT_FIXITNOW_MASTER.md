# AUDIT_FIXITNOW_MASTER.md

> Document de référence unique — PHASE 00 (audit local), généré le 05/09/2026.
> Branche : `automotive-platform` @ `da03d8a` (poussé sur origin). Typecheck et tests API verts (59/59).
> **Règle d'usage : tout prompt de développement envoyé au LLM local doit référencer ce document.**

---

## 1. État réel du dépôt (base de vérité)

- Stack actif : **Next.js 14 + Express 4 + MongoDB/Mongoose 8 + Redis (ioredis)**, monorepo npm (apps/web, apps/api, packages/types), TS strict, Zod, Jest/Vitest, Docker, GitHub Actions.
- Le dépôt contient **deux domaines** :
  - **Legacy** (home services marketplace) : models User/Category/Business/Booking/Review, controllers, routes, tests (59), frontend complet, OpenAPI, seed.
  - **Automotive** (nouveau) : 23 modèles Mongoose dans `apps/api/src/models/automotive/`, 24 modules de types dans `packages/types/src/`, module interventions complet côté API (routes/service/controller/status-history) — commité `4595d49`.
- Frontend automotive : **inexistant**. IA, matching, tracking, Stripe : **inexistants**.

## 2. Verdict par module : GARDER / MODIFIER / SUPPRIMER / CRÉER

### packages/types (`@fixitnow/types`) — GARDER, REFACTORER

- `src/legacy/*` : GARDER isolé (namespace `legacy`). Sera supprimé à terme, pas maintenant.
- `src/enums.ts` : GARDER. 19 états InterventionStatus, urgences, verification, quote, payment.
- `src/intervention*.ts`, `vehicle.ts`, `professional.ts`, `quote.ts`, `payment.ts`, `report.ts`, `verification.ts` etc. : GARDER.
- **MODIFIER (priorité 1)** : les types automotive sont des interfaces TS **sans Zod**. Rompt le principe "source unique" (les legacy sont des schemas Zod → validation + OpenAPI). Convertir progressivement en Zod schemas avec `z.infer` + `zod-to-openapi`.
- `src/index.ts` : GARDER (export namespace `legacy`).

### apps/api — socle — GARDER tel quel

- `app.ts` (helmet/cors/compression/pino/cookie), middlewares (`requestId`, `errorHandler`, `rateLimit`, `cache`, `validate`, `requireAuth`/`requireRole`), `config/*` (env, db, redis, logger), `services/tokens.ts` (JWT + allowlist Redis), `utils/AppError.ts`, `openapi.ts`.
- Auth : **GARDER**. 70 %+ réutilisable. Voir incohérence rôles ci-dessous.

### apps/api — legacy (home services) — GELER, NE PAS SUPPRIMER

- `models/{User,Category,Business,Booking,Review}.ts`, controllers/routes/tests legacy, `scripts/seed.ts`.
- Décision : **GELÉ** (aucune évolution). Suppression en fin de migration uniquement. Les tests legacy servent de filet de régression tant que `User` et l'auth sont partagés.

### apps/api — automotive — CRÉER la logique, GARDER les modèles

- Modèles existants (Vehicle, Professional, ServiceArea, Availability, Intervention, InterventionOffer, Diagnosis, Quote, QuoteItem, Payment, Invoice, Review, Conversation, Message, Notification, VerificationDocument, ProfessionalVerification, Report, Media, Skill, ProfessionalSkill, Garage, + InterventionStatusHistory) : **GARDER**, qualité bonne (index 2dsphere, invariants pre-validate, cents).
- **CRÉER** : services/contrôleurs/routes pour véhicules, professionnels, disponibilité, devis, paiements, messages, notifications, vérification ; **matching** (absent) ; **tracking** (absent).

### apps/web — REFACTORER

- 100 % legacy (recherche business, bookings, admin catégories). Geler le métier, réutiliser l'ossature : `lib/apiClient.ts`, `lib/auth-context.tsx`, `components/ui/*` (shadcn), Sentry, SEO, tests setup, AuthGate/AdminGate pattern.

## 3. Incohérences à corriger (bloquantes ou presque)

1. ~~**Router interventions non monté**~~ ✅ **RÉSOLU (PHASE 02)** : `app.use("/interventions", interventionsRouter)` monté + 9 tests.
2. ~~**Rôles divergents**~~ ✅ **RÉSOLU (PHASE 02)** : décision actée = mapping, pas migration immédiate. `AuthContext.domainRole: UserRole` (CUSTOMER/PROFESSIONAL/ADMIN) via `mapLegacyUserRole()` dans `packages/types/src/user.ts`. Le User document et les JWT gardent les rôles legacy tant que le legacy est gelé ; tout nouveau module automotive doit consommer `domainRole`.
3. ~~**Zod dupliqué**~~ ✅ **RÉSOLU (PHASE 02)** : `packages/types/src/intervention-schemas.ts` (createInterventionSchema, interventionListQuerySchema, interventionIdParamSchema) consommé par `interventions.routes.ts`.
4. **OpenAPI** : ⏳ reste à faire — les types automotive ne sont pas tous en Zod.
5. ~~**`models/index.ts`**~~ ✅ **RÉSOLU (PHASE 02)** : ré-exports automotive au niveau racine.
6. ~~`currency` fourni par le client~~ ✅ **RÉSOLU (PHASE 02)** : défaut `EUR` forcé côté serveur.
7. ~~**Contexte de lieu**~~ ✅ **RÉSOLU (PHASE 02)** : `InterventionLocationContext` (HOME/PARKING/ROAD/BUSINESS/HIGHWAY/EXPRESS_ROAD) sur le modèle + `InterventionType` (catalogue, slug unique). ⏳ La règle "pros autorisés autoroute" s'appliquera en PHASE 04/05 avec `Professional.isHighwayAuthorized` (à créer).
8. CI désormais sur `automotive-platform` (commit `5e30984`) ✅.

## 4. Modèle de données cible (conforme au cahier des charges)

Entités déjà modélisées (ne pas recréer) : `User`, `Vehicle`, `Professional`, `Garage`, `ServiceArea`, `Availability`, `Skill`/`ProfessionalSkill`, `Intervention`, `InterventionStatusHistory`, `InterventionOffer`, `Diagnosis`, `Quote`/`QuoteItem`, `Payment`, `Invoice`, `Review`, `Conversation`, `Message`, `Notification`, `VerificationDocument`/`ProfessionalVerification`, `Report`, `Media`.

À créer :

- `InterventionType` (catalogue normalisé : diagnostic, batterie, freins, pneus, vidange, remorquage...) + remplacement progressif de `Intervention.services: string[]` par `interventionTypeIds: ObjectId[]` (garder le texte libre en `problem_description`).
- `MatchingCandidate` (par demande) : `requestId, providerId, score, distanceKm, etaMinutes, skillScore, availabilityScore, priceScore, ratingScore, status, expiresAt`. Score de départ : dispo 30 %, distance 20 %, compétence 20 %, prix 10 %, note 10 %, ETA 5 %, historique 5 %.
- `ProviderLocation` (tracking temps réel) : `providerId, point 2dsphere, accuracy, status, updatedAt` (collection TTL courte).
- `ProviderRealtimeStatus` : OPEN/BUSY/OFFLINE/PAUSED/ON_INTERVENTION (distinct de la dispo déclarée `Availability`).
- Enrichissements : `Intervention.locationContext` (DOMICILE|PARKING|ROUTE|ENTREPRISE|AUTOROUTE|EXPRESS), `Professional.isHighwayAuthorized`.
- `Payment` : ajouter statut AUTHORIZED (pré-autorisation Stripe) ; la séparation platformFee/professionalAmount existe déjà.

## 5. Surface API cible (routes REST)

Existante : `/auth/*`, `/categories`, `/businesses`, `/bookings`, `/reviews`, `/health`, `/api/docs`.
Créée, non montée : `/interventions` (POST, GET /mine, GET /:id, GET /:id/history).

À créer dans l'ordre des phases :

```
/vehicles                   CRUD client                                  (PHASE 02)
/provider/profile           profil pro + skills                          (PHASE 02)
/provider/availability      dispo + statut temps réel                    (PHASE 02/04)
/intervention-types         catalogue (admin)                            (PHASE 02)
/interventions/*            + PATCH statuts, actions accept/decline/
                            en-route/arrive/diagnose/complete            (PHASE 03/05)
/interventions/:id/match    moteur de matching                           (PHASE 04)
/interventions/:id/tracking position pro + ETA                           (PHASE 05)
/quotes, /quotes/:id/items  devis                                        (PHASE 06)
/payments                   Stripe + webhooks idempotents                (PHASE 07)
/conversations, /messages, /notifications                                (PHASE 08)
/provider/*                 app pro : offres, agenda, tracking           (PHASE 09)
/admin/*                    opérations : dashboard, vérifs, litiges      (PHASE 10)
/ai/*                       symptômes, estimation prix, support          (PHASE 11)
```

## 6. États métier — verrous techniques

- Machine à états `InterventionStatus` : **imposer une table de transitions autorisées** (qui peut déclencher quoi : client / pro / système) dans un module dédié (`intervention-state.ts`), appliquée dans le service, journalisée dans `InterventionStatusHistory` (fromStatus/toStatus/actor/reason). Toute transition hors table → 409.
- Devis : workflow verrouillé DIAGNOSING → QUOTE_PENDING → QUOTE_ACCEPTED → IN_PROGRESS (obligation d'information avant intervention — dépannage à domicile, Service-Public F38350).
- Autoroute : si `locationContext` ∈ {AUTOROUTE, EXPRESS} → n'autoriser que les pros `isHighwayAuthorized`, tarification réglementée distincte.
- Matching : n'enregistre des offres (`InterventionOffer`) qu'après scoring ; offre avec TTL (`expiresAt`).

## 7. Tests obligatoires (par phase)

- **Interventions (PHASE 03, immédiat)** : création (ownership du véhicule vérifié), GET /mine paginé, 404 cross-client (cloisonnement), historique trié chronologiquement, validation 400/422, rate-limit, rollback création+historique en cas d'échec.
- **Transitions d'état** : chaque transition légale OK, chaque illégale → 409 + trace dans l'historique.
- **Matching** : ordre de score déterministe, TTL d'offre, exclusions (pro non vérifié, hors rayon, indisponible).
- **Devis** : cohérence des totaux, acceptation unique, expiration.
- **Paiement** : webhook idempotent, refund partiel, répartition fee/pro exacte.
- **Multi-tenant** : un client ne voit jamais l'intervention d'un autre ; un pro non assigné non plus.
- Frontend : Vitest/RTL pour chaque nouvelle page, mocking `apiClient`.

## 8. Ordre d'exécution (phases et prompts)

> Un prompt = une phase (ou une sous-étape). Toujours : lire ce doc → code → tests verts → commit.

- **PHASE 01 — GEL ARCHITECTURAL (DÉCIDÉ)** : frontend Next.js 14 App Router ✅ / backend Express ✅ / DB MongoDB ✅ / auth JWT+Redis ✅ / payments Stripe / storage et realtime à trancher en PHASE 05. **Ne PAS migrer vers TanStack/Lovable** : le stack Express/Mongo existant est sain, testé (59/59) et déployé (Vercel/Render/Atlas/Upstash). Lovable reste optionnel pour le prototypage d'interface uniquement.
- **PHASE 02 (domain model)** : résoudre l'incohérence rôles (n°2), créer `InterventionType`, monter `/interventions` dans `app.ts` (n°1), Zod partagé (n°3), ré-exports automotive (n°5), `locationContext` (n°7).
- **PHASE 03 (FAIT — commit PHASE 03)** : routes `/vehicles` (POST, GET /mine, GET /:id, PATCH /:id, DELETE /:id) avec ownership vérifié, doublons immat/VIN → 409 ; schémas Zod partagés `vehicle-schemas.ts` ; seed automotive idempotent (14 types d'intervention, 2 véhicules démo, 1 intervention REQUESTED) ; 14 nouveaux tests (82/82) dont le rollback création+historique.
- **PHASE 04 (FAIT — commit PHASE 04)** : moteur de matching scoré (dispo 30/distance 20/compétence 20/prix 10/note 10/ETA 5/histoire 5) ; modèle `MatchingCandidate` (scores par composante + TTL 15 min, unicité intervention×pro, ré-exécution idempotente → SUPERSEDED) ; fonction pure `scoreProvider` + `haversineKm` ; exclusions dures (inactif, non vérifié, UNAVAILABLE, hors rayon, **non autorisé autoroute** si locationContext HIGHWAY/EXPRESS_ROAD) ; champs `Professional.isHighwayAuthorized` + `hourlyRateCents` ; routes `POST/GET /interventions/:id/match` (rate-limitées) ; 13 nouveaux tests (5 scoring + 8 intégration, 95/95). **Revu et APPROVÉ — 1 défaut fonctionnel (UNAVAILABLE non-exclu) corrigé & testé ; 2 items perf relevés ci-dessous.**
- **PHASE 05 (engagée)** : actions pro (accept/en-route/arrive/diagnose/complete), tracking temps réel, `ProviderRealtimeStatus`, décision storage/realtime.
  - **`5.1 POST /interventions/:id/match/:candidateId/accept — FAIT ✅`** : lock atomique `findOneAndUpdate` (candidat PENDING→ACCEPTED) + cascade intervention `REQUESTED|SEARCHING → ACCEPTED` (verrou `professional: $exists:false`) ; classification `404/403/409` ; rollback `DECLINED` si course perdue ; `InterventionStatusHistory` ; `requireProfessional` + rate limit 30/min ; `interventionMatchCandidateParamSchema` ; champ `acceptedAt`. 5 tests (happy / 409 race / 403 stranger / 403 customer / idempotence).
  - **`5.3 Actions pro + machine à états — FAIT ✅`** : table de transitions `services/intervention-state.ts` (AUDIT §6) — `assertTransition(from, to, actor)` (409 hors graphe, 409 état identique, terminaux sans arête) ; `POST /interventions/:id/actions/:action` (`en-route|arrive|diagnose|complete`) ; service `intervention-actions.service.ts` : pro assigné uniquement (403), CAS atomique `findOneAndUpdate(status: courant)` anti-course → 409, journal `InterventionStatusHistory` (note), **stream SSE `intervention.status-changed`** (bus 5.2), release pro → `OPEN` au complete. Types Zod `interventionActionParamSchema`/`interventionActionEnum`/`interventionActionBodySchema`. **8 tests** (401 / 403 customer / 400 action / 403 pro non-assigné / lifecycle 5 entrées + release OPEN / 409 illégal / 409 terminal / SSE) — matching 18/18 non régressé.
  - **`5.2 Streaming SSE + `ProviderRealtimeStatus` — FAIT ✅** : **décision queue = Redis PUBLISH/SUBSCRIBE via ioredis, transport unique (prod/dev/tests)** — EventEmitter local rejeté (deux code paths, masque les bugs de subscription) ; cross-instance sur Upstash via REDIS_URL RESP :6380 ; `ioredis-mock` supporte `duplicate()` + pub/sub inter-clients (vérifié) → tests Jest du flux réel sans Redis. Bus fin `services/intervention-events.ts` (channel `intervention:{id}`, publisher `getRedis()`, subscriber `getRedis().duplicate()`, cleanup unsubscribe+quit) ; `acceptCandidate` publie `intervention.accepted` (snapshot) + bascule le pro en `ProviderRealtimeStatus.ON_INTERVENTION` (upsert best-effort). Route SSE `GET /events/intervention/:id` (routeur `/events` monté dans `app.ts`) : garde multi-tenant (customer OU pro assigné, sinon 404), headers `text/event-stream` + `Content-Encoding: identity` (anti-compression), heartbeat 15s unref, unsubscribe à la fermeture, 400 sur id invalide. Modèle+enum `ProviderRealtimeStatus` (OPEN/BUSY/OFFLINE/PAUSED/ON_INTERVENTION) et types partagés `packages/types/src/realtime.ts`. **7 tests d’intégration** (401 / 404 non-membre / 400 id / SSE end-to-end customer / pro assigné / flip ON_INTERVENTION / arrêt au disconnect) → **107/107, 13 suites, typecheck + lint verts.** Limites : pas de `Last-Event-ID` (reconnexion = refetch `GET /interventions/:id`) ; `ProviderLocation` (GPS) décalé 5.3 ; endpoint manuel de flip statut pro → PHASE 09.
- **PHASE 06 (engagée)** : quotes/quote_items API.
  - **`6.0 POST /interventions/:id/quote — FAIT ✅`** : le pro assigné (état `DIAGNOSING`) soumet un devis typé (liste `quote_items` avec TVA France `0/5.5/10/20%` + `kind part|labor|service`). Contrat Zod partagé `packages/types/src/quote-schemas.ts` (`createQuoteSchema` items 1–50, `unit_price` en cents entiers, `tax_rate` 0–0.2 coercé) ; extension du modèle Mongoose `QuoteItem` (+`taxRate`/`kind`) alignée sur `Quote` existant (`subtotalCents`/`taxAmountCents`/`totalAmountCents`/`professional`) ; service `intervention-quotes.service.ts` : pro assigné uniquement (403), CAS atomique `DIAGNOSING → QUOTE_PENDING` (`findOneAndUpdate status: DIAGNOSING` anti-course → 409), agrégation serveur `totalCents` (HT par ligne) → `subtotalCents`/`taxAmountCents` (Σ line×rate arrondi) /`totalAmountCents` = subtotal+tax (invariant validé par le hook `pre('validate')` du modèle), création `Quote (status SENT)` + `QuoteItem[]` + `InterventionStatusHistory` (reason=notes), **SSE double publication** `intervention.quote.created` (nouveau type ajouté à `InterventionEventType`) + `intervention.status-changed`. Route `POST /:id/quote` : `requireAuth` + `requireProfessional` + rate limit 10/min + validation Zod `createQuoteSchema`. **6 tests** (401 / 403 customer / 403 pro non-assigné / 409 état non-DIAGNOSING / happy 201 avec totaux 18000 HT + 3600 TVA + 21600 TTC + history + quote+items persistés + 2 événements SSE reçus / 400 validation qty=0 & items vides avec état DIAGNOSING préservé). Rebuild `packages/types` dist requis après ajout d'un type partagé (le workspace api résout `@fixitnow/types` via `dist/`, pas `src/`).
- **PHASE 07** : Stripe (pré-autorisation, capture, commission, refunds, webhooks idempotents).
- **PHASE 08** : conversations/messages (liés request/intervention/quote), notifications (in-app d'abord, push/SMS urgences ensuite).
- **PHASE 09** : espace pro (offres, disponibilité, tracking, documents).
- **PHASE 10** : admin opérations (dashboard temps réel, vérification pros, litiges).
- **PHASE 11** : IA (symptômes → demande structurée ; estimation prix ; matching pondéré apprenant ; détection d'anomalies ; contrôle des devis ; support client).
- **PHASE 12** : sécurité, charge, fraudes, audit, production.

## 9. Dette & hygiène (fil rouge)

- ~~Seed : les comptes démo ne pouvaient pas se connecter (mots de passe en clair)~~ ✅ **CORRIGÉ** : le seed utilisait `findOneAndUpdate` + `$setOnInsert`, qui contourne le hook Mongoose `pre('save')` de bcrypt (`User.ts`) → mots de passe stockés en clair → login 401. Remplacé par un helper `seedUser()` qui passe par `User.create()`/`save()` (hook exécuté) et **répare** les records déjà corrompus (détection `$2a$` + re-hash). Ajout d'un **pro démo** `pro@fixitnow.dev` / `Pro#12345` (profil "Garage Limoges Demo" APPROVED + AVAILABLE_NOW) pour que le matching→accept soit jouable de bout en bout ; smoke script `apps/api/smoke-test.mjs` (13 checks) documenté dans le README.
- Nettoyer les BOM en tête de fichiers ; ajouter `.gitattributes` (`* text=auto eol=lf`) pour stabiliser LF/CRLF.
- **Backlog perf (PHASE 04)** :
  - `matching.service.ts` — lever la limite `.limit(200)` arbitraire : remplacer par une cap `./MAX_MATCHING_POOL` configurable (env `MATCHING_POOL_LIMIT`, défaut 200) ; alerter métriques quand atteint. Priorité moyenne (impacte les zones denses >200 pros éligibles).
  - `matching.service.ts` — le scoring JS est O(N×M) sur les positions (`haversineKm` × tous les `ServiceArea`). À moyen terme (PHASE 11 ou dès seuil métriques) migrer vers un filtre géospatial MongoDB (`$nearSphere` / index `2dsphere` sur `Professional.location` + `ServiceArea.center`) pour éliminer les hors-rayon avant le scoring. Priorité basse tant que <200 pros/match.
- Jest `--forceExit` : fermer proprement Mongo/Redis dans `afterAll`.
- README : refonte vers la plateforme automobile en PHASE 03+ ; roter les mots de passe démo publics.
- Conformité légale : infos prix/conditions avant intervention (dépannage à domicile) — le workflow devis verrouillé (section 6) couvre cette exigence.

---

_Fin du document. À mettre à jour à la fin de chaque phase (cocher les incohérences n°1–8 corrigées)._
